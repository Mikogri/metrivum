param(
    [string]$MotionTraceRoot = 'C:/Work/Projects/MotionTrace',
    [string]$EnvironmentsRoot = "$env:USERPROFILE/miniconda3/envs",
    [string]$PackagingPython = "$env:USERPROFILE/miniconda3/envs/motiontrace-vision/python.exe",
    [string]$PackagingTools = '',
    [string]$BaseUrl = 'http://localhost:5173/downloads/analyzer',
    [string]$WebOrigin = 'http://localhost:5173',
    [string]$Version = '1.4.0',
    [string]$SigningCertificateThumbprint = ''
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = Join-Path $root 'apps/web/public/downloads/analyzer'
$published = Join-Path $root '.local/analyzer-published'
$artifacts = Join-Path $root '.local/analyzer-release-artifacts'
$savedPythonPath = $env:PYTHONPATH
try {
    dotnet publish (Join-Path $PSScriptRoot 'TrainFlow.LocalAnalyzer.csproj') -c Release -r win-x64 --self-contained true -o $published --artifacts-path $artifacts "-p:MotionTraceRoot=$MotionTraceRoot" "-p:Version=$Version" --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Analyzer publish failed' }
    if ($PackagingTools) { $env:PYTHONPATH = $PackagingTools }
    # Python writes progress and warnings to stderr; under Windows PowerShell that must not abort the build (exit codes decide).
    $ErrorActionPreference = 'Continue'
    & $PackagingPython (Join-Path $PSScriptRoot 'package-runtime.py') --motiontrace $MotionTraceRoot --environments $EnvironmentsRoot --host $published --output $output --base-url $BaseUrl --web-origin $WebOrigin --version $Version
    if ($LASTEXITCODE -ne 0) { throw 'Runtime packaging failed; no installer was published' }
    & $PackagingPython (Join-Path $root 'infra/local-analysis/verify_package.py') $output
    if ($LASTEXITCODE -ne 0) { throw 'Runtime archive configuration audit failed' }
    $ErrorActionPreference = 'Stop'
    $manifest = Join-Path $output 'release.json'
    $setupOutput = Join-Path $root '.local/analyzer-setup-published'
    dotnet publish (Join-Path $root 'tools/TrainFlow.AnalyzerSetup') -c Release -r win-x64 --self-contained true -o $setupOutput --artifacts-path (Join-Path $root '.local/analyzer-setup-artifacts') "-p:ReleaseManifest=$manifest" -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Setup publish failed' }
    $setup = Join-Path $setupOutput 'TrainFlow.AnalyzerSetup.exe'
    if ($BaseUrl.StartsWith('https://') -and !$SigningCertificateThumbprint) { throw 'HTTPS releases require a signing certificate' }
    if ($SigningCertificateThumbprint) {
        & signtool sign /sha1 $SigningCertificateThumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $setup
        if ($LASTEXITCODE -ne 0) { throw 'Installer signing failed' }
    }
    $verification = Start-Process -FilePath $setup -ArgumentList @('--verify', ('"'+$output+'"')) -WindowStyle Hidden -PassThru -Wait
    if ($verification.ExitCode -ne 0) { throw 'Embedded release verification failed' }
    Copy-Item -LiteralPath $setup -Destination (Join-Path $output 'TrainFlowAnalyzerSetup.exe')
    $file = Get-Item -LiteralPath (Join-Path $output 'TrainFlowAnalyzerSetup.exe')
    @{ version=$Version; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash; size=$file.Length } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'update.json') -Encoding utf8
    Get-FileHash -LiteralPath (Join-Path $output 'TrainFlowAnalyzerSetup.exe') -Algorithm SHA256 | Select-Object Hash
    Write-Output "Installer and payloads: $output"
}
finally { $env:PYTHONPATH = $savedPythonPath }
