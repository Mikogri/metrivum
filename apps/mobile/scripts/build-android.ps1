param(
    [string]$NodePath = 'C:/Program Files/nodejs/node.exe',
    [string]$JavaHome = 'C:/Program Files/Java/jdk-17',
    [string]$AndroidHome = (Join-Path $env:LOCALAPPDATA 'Android/Sdk'),
    [string]$Task = ':app:assembleDebug',
    [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path $PSScriptRoot -Parent
$repositoryRoot = (Resolve-Path (Join-Path $mobileRoot '../..')).Path
if (!$LogPath) { $LogPath = Join-Path $repositoryRoot '.local/mobile/gradle-retry.log' }
$LogPath = [IO.Path]::GetFullPath($LogPath)
foreach ($requiredPath in @($NodePath, (Join-Path $JavaHome 'bin/java.exe'), $AndroidHome, (Join-Path $mobileRoot 'android/gradlew.bat'))) {
    if (!(Test-Path -LiteralPath $requiredPath)) { throw "Missing build prerequisite: $requiredPath. Run Expo Android prebuild if the generated project is absent." }
}
[IO.Directory]::CreateDirectory((Split-Path $LogPath -Parent)) | Out-Null
$previousPath = $env:PATH
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
$previousNodeEnv = $env:NODE_ENV
Push-Location (Join-Path $mobileRoot 'android')
try {
    $env:PATH = (Split-Path $NodePath -Parent) + ';' + (Join-Path $JavaHome 'bin') + ';' + $previousPath
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $AndroidHome
    $env:NODE_ENV = 'development'
    # React Native's Windows codegen tasks invoke cmd /c node, not PowerShell's resolver.
    $resolvedNode = (& $env:ComSpec /d /c node --print process.execPath | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or ![string]::Equals($resolvedNode, [IO.Path]::GetFullPath($NodePath), [StringComparison]::OrdinalIgnoreCase)) {
        throw "cmd resolved an unexpected Node executable: '$resolvedNode'. Expected '$NodePath'."
    }
    $nodeVersion = & $NodePath --version
    "Node: $resolvedNode ($nodeVersion)`nJAVA_HOME: $JavaHome`nANDROID_HOME: $AndroidHome`nTask: $Task, arm64-v8a, one Gradle worker, two native jobs, 1536 MiB heap" | Set-Content -LiteralPath $LogPath
    $gradleArguments = @($Task, '--no-daemon', '--info', '--stacktrace', '--console=plain', '--max-workers=1',
        '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m', '-PreactNativeArchitectures=arm64-v8a',
        '--init-script', (Join-Path $PSScriptRoot 'native-job-pools.gradle'))
    & ./gradlew.bat @gradleArguments 2>&1 | Tee-Object -FilePath $LogPath -Append
    $buildExitCode = $LASTEXITCODE
    "GRADLE_EXIT=$buildExitCode" | Tee-Object -FilePath $LogPath -Append
    if ($buildExitCode -ne 0) { throw "Android build failed (exit $buildExitCode). Full log: $LogPath" }
} finally {
    Pop-Location
    $env:PATH = $previousPath
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
    $env:NODE_ENV = $previousNodeEnv
}
