param(
    [string]$MotionTraceRoot = 'C:/Work/Projects/MotionTrace',
    [string]$WebOrigin = 'http://localhost:5173'
)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'TrainFlow.LocalAnalyzer.csproj'
$artifacts = Join-Path $PSScriptRoot '../../.local/local-analyzer-artifacts'
dotnet build $project --artifacts-path $artifacts "-p:MotionTraceRoot=$MotionTraceRoot" --nologo
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$dll = Join-Path $artifacts 'bin/TrainFlow.LocalAnalyzer/debug/TrainFlow.LocalAnalyzer.dll'
dotnet $dll --MotionTraceRoot $MotionTraceRoot --WebOrigin $WebOrigin
exit $LASTEXITCODE
