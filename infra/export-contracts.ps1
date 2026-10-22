param([switch]$NoBuild, [string]$ArtifactsPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $previousOutput = $env:TRAINFLOW_CONTRACT_OUTPUT
    $env:TRAINFLOW_CONTRACT_OUTPUT = Join-Path $root 'contracts/generated'
    $arguments = @('run', '--project', 'apps/api/TrainFlow.Api')
    if ($NoBuild) { $arguments += '--no-build' }
    if ($ArtifactsPath) { $arguments += @('--artifacts-path', [IO.Path]::GetFullPath($ArtifactsPath)) }
    & dotnet @arguments -- --export-contracts
    if ($LASTEXITCODE -ne 0) { throw 'OpenAPI export failed.' }
    if ($IsWindows) { & npm.cmd run contracts } else { & npm run contracts }
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript contract generation failed.' }
}
finally {
    $env:TRAINFLOW_CONTRACT_OUTPUT = $previousOutput
    Pop-Location
}
