param([string]$OutputPath='.local/stage06/upgrade.sql', [string]$Configuration='Debug', [switch]$NoBuild)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $parts=Join-Path $root '.local/stage06/sql'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql=[Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Stage 6 development upgrade. EF migrations remain authoritative.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM billing."__EFMigrationsHistory" WHERE "MigrationId"='20261008152444_TeamLookupIndexes')
       OR NOT EXISTS (SELECT FROM coaching."__EFMigrationsHistory" WHERE "MigrationId"='20261008090132_AnalyticsDateIndexes')
       OR NOT EXISTS (SELECT FROM offers."__EFMigrationsHistory" WHERE "MigrationId"='20261006221525_OfferDefinitionGuards')
       OR NOT EXISTS (SELECT FROM calendar."__EFMigrationsHistory" WHERE "MigrationId"='20261007134212_GuardCalendarRelationshipClient') THEN
        RAISE EXCEPTION 'Stage 6 requires the verified subscription and Stage 5 baseline';
    END IF;
    IF to_regclass('billing.team_platform_subscriptions') IS NOT NULL THEN
        RAISE EXCEPTION 'Stage 6 already started: inspect migration history before retry';
    END IF;
END $$;
SET LOCAL ROLE trainflow_migrator;
'@)
    foreach ($entry in @(@('Coaching','20261008090132_AnalyticsDateIndexes'),@('Offers','20261006221525_OfferDefinitionGuards'),@('Billing','20261008152444_TeamLookupIndexes'),@('Calendar','20261007134212_GuardCalendarRelationshipClient'))) {
        $module=$entry[0]; $project="backend/modules/$module/TrainFlow.$module"; $part=Join-Path $parts "$module.sql"
        if (!$NoBuild) {
            dotnet build $project --no-restore --configuration $Configuration -m:1 /nodeReuse:false --verbosity quiet
            if ($LASTEXITCODE -ne 0) { throw "Build failed: $module" }
        }
        # Each module has a design factory; SQL generation never opens a database connection.
        dotnet ef migrations script $entry[1] --no-transactions --no-build --configuration $Configuration --project $project --startup-project $project --context "$($module)DbContext" --output $part
        if ($LASTEXITCODE -ne 0) { throw "SQL generation failed: $module" }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    $sql.Add('RESET ROLE; COMMIT;')
    $output=[IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }))
    [IO.Directory]::CreateDirectory((Split-Path $output -Parent)) | Out-Null
    [IO.File]::WriteAllText($output,($sql -join "`n`n"),[Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
} finally { Pop-Location }
