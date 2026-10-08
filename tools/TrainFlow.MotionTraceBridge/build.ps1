param([string]$MotionTraceRoot = (Join-Path $PSScriptRoot '../../../MotionTrace'), [switch]$Check, [string]$RawFixture)
$ErrorActionPreference = 'Stop'
$artifacts = Join-Path $PSScriptRoot 'artifacts'
$project = if ($Check) { Join-Path $PSScriptRoot 'tests/BridgeChecks.csproj' } else { Join-Path $PSScriptRoot 'TrainFlow.MotionTraceBridge.csproj' }
dotnet build $project --artifacts-path $artifacts "-p:MotionTraceRoot=$MotionTraceRoot" --nologo
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Check) {
    $checkDll = Join-Path $artifacts 'bin/BridgeChecks/debug/BridgeChecks.dll'
    if ($RawFixture) { dotnet $checkDll $RawFixture } else { dotnet $checkDll }
    exit $LASTEXITCODE
}
