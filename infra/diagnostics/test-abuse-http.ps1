param([string]$ArtifactsPath = ".local/security-stage01-http")
$ErrorActionPreference = "Stop"
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../.."))
Push-Location $repository
$previousResults = $env:TRAINFLOW_ABUSE_HTTP_RESULTS
$previousInventory = $env:TRAINFLOW_ABUSE_ROUTE_INVENTORY
try {
    New-Item -ItemType Directory -Force -Path ".local", "docs/security" | Out-Null
    $env:TRAINFLOW_ABUSE_HTTP_RESULTS = Join-Path $repository ".local/security-stage01-http-load.json"
    $env:TRAINFLOW_ABUSE_ROUTE_INVENTORY = Join-Path $repository "docs/security/stage-01-rest-map.csv"
    dotnet test tests/Unit/TrainFlow.UnitTests/TrainFlow.UnitTests.csproj --artifacts-path $ArtifactsPath -m:1 --filter "FullyQualifiedName~AbuseProtectionConfigurationTests" --verbosity quiet
    if ($LASTEXITCODE -ne 0) { throw "Core abuse configuration tests failed." }
    dotnet test tests/Integration/TrainFlow.IntegrationTests/TrainFlow.IntegrationTests.csproj --artifacts-path $ArtifactsPath -m:1 --filter "FullyQualifiedName~AbuseControlledLoadTests|FullyQualifiedName~AbuseHttpTests|FullyQualifiedName~AbuseRouteInventoryTests" --verbosity quiet
    if ($LASTEXITCODE -ne 0) { throw "HTTP abuse tests failed." }
    Write-Host "Synthetic HTTP measurements: $env:TRAINFLOW_ABUSE_HTTP_RESULTS"
    Write-Host "Active REST policy inventory: $env:TRAINFLOW_ABUSE_ROUTE_INVENTORY"
} finally {
    $env:TRAINFLOW_ABUSE_HTTP_RESULTS = $previousResults
    $env:TRAINFLOW_ABUSE_ROUTE_INVENTORY = $previousInventory
    Pop-Location
}
