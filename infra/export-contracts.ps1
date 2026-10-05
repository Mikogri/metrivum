param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:TRAINFLOW_CONTRACT_OUTPUT = Join-Path $root 'contracts/generated'
    $arguments = @('run', '--project', 'apps/api/TrainFlow.Api')
    if ($NoBuild) { $arguments += '--no-build' }
    & dotnet @arguments -- --export-contracts
    if ($LASTEXITCODE -ne 0) { throw 'OpenAPI export failed.' }
    if ($IsWindows) { & npm.cmd run contracts } else { & npm run contracts }
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript contract generation failed.' }
}
finally {
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    Remove-Item Env:TRAINFLOW_CONTRACT_OUTPUT -ErrorAction SilentlyContinue
    Pop-Location
}
