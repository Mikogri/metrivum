param()
$ErrorActionPreference = 'Stop'
if (-not $env:DOTNET_ENVIRONMENT) { $env:DOTNET_ENVIRONMENT = 'Development' }
Push-Location $PSScriptRoot
try {
    & dotnet run --project TrainFlow.Worker.csproj
    if ($LASTEXITCODE -ne 0) { throw 'The analysis worker stopped. Check the startup error above; queued jobs remain pending until the worker is running.' }
}
finally { Pop-Location }
