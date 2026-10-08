param([string]$OutputPath='.local/subscriptions-chat/upgrade.sql',[string]$Configuration='Debug',[switch]$NoBuild)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    if (!$NoBuild) {
        dotnet build apps/api/TrainFlow.Api --configuration $Configuration -m:2 /nodeReuse:false /p:UseSharedCompilation=false
        if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    }
    $parts=Join-Path $root '.local/subscriptions-chat/sql'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql=[Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Additive upgrade from the verified Stage 5 development baseline.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL ROLE trainflow_migrator;
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM billing."__EFMigrationsHistory" WHERE "MigrationId"='20261008103805_QueryPerformanceIndexes')
       OR NOT EXISTS (SELECT FROM messaging."__EFMigrationsHistory" WHERE "MigrationId"='20261008103917_QueryPerformanceIndexes') THEN
        RAISE EXCEPTION 'Expected billing and messaging migration baseline is missing';
    END IF;
END $$;
'@)
    foreach ($entry in @(@('Billing','BillingDbContext','20261008103805_QueryPerformanceIndexes'),@('Messaging','MessagingDbContext','20261008103917_QueryPerformanceIndexes'))) {
        $module=$entry[0]; $part=Join-Path $parts "$module.sql"
        dotnet ef migrations script $entry[2] --no-transactions --no-build --configuration $Configuration --project "backend/modules/$module/TrainFlow.$module" --startup-project apps/api/TrainFlow.Api --context $entry[1] --output $part
        if ($LASTEXITCODE -ne 0) { throw "SQL generation failed: $module" }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    $sql.Add('RESET ROLE; COMMIT;')
    $output=[IO.Path]::GetFullPath((Join-Path $root $OutputPath))
    [IO.File]::WriteAllText($output,($sql -join "`n`n"),[Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
} finally { Pop-Location }
