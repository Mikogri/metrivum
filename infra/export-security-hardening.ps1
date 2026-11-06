param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $output = Join-Path $root '.local/security-hardening'
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    # Script generation uses design factories only; it never connects to or updates a database.
    $modules = @(
        @{ Name='Access'; From='20261024160307_UsageReservationsAndPlanCapabilities'; To='20261104194425_DistributedAbuseAndAssignmentFeature' },
        @{ Name='Integrations'; From='20261013230121_ConnectedAiIntegrations'; To='20261104194416_ApprovedProgramAssignments' },
        @{ Name='CheckIns'; From='20261009203813_HardenAssignmentSourceSearchPath'; To='20261104194224_ScheduleStatusIndex' }
    )
    foreach ($module in $modules) {
        $project = "backend/modules/$($module.Name)/Metrivum.$($module.Name)"
        $file = Join-Path $output "$($module.Name).sql"
        & dotnet ef migrations script $module.From $module.To --idempotent --project $project --startup-project $project -o $file
        if ($LASTEXITCODE -ne 0) { throw "Migration script export failed for $($module.Name). Nothing was applied." }
        Get-FileHash -LiteralPath $file -Algorithm SHA256 | Select-Object Path, Hash
    }
}
finally { Pop-Location }
