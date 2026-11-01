param([string]$OutputPath='.local/stage04/upgrade.sql',[string]$Configuration='Debug',[switch]$NoBuild)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    if (!$NoBuild) {
        dotnet build apps/api/Metrivum.Api --configuration $Configuration
        if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    }
    $parts=Join-Path $root '.local/stage04/sql'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql=[Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Development upgrade from Stage 3A. EF history remains authoritative.
BEGIN;
DO $$ BEGIN
    IF to_regclass('messaging."Messages"') IS NULL
       OR NOT EXISTS (SELECT FROM billing."__EFMigrationsHistory" WHERE "MigrationId"='20261006221531_FinancialAuditGuards')
       OR NOT EXISTS (SELECT FROM access."__EFMigrationsHistory" WHERE "MigrationId"='20261007153450_MessagingFeatures') THEN
        RAISE EXCEPTION 'Stage 04 requires the verified Stage 3A baseline';
    END IF;
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname='notifications') THEN
        RAISE EXCEPTION 'Stage 04 already started: inspect migration history before retry';
    END IF;
END $$;
CREATE SCHEMA notifications AUTHORIZATION trainflow_migrator;
SET LOCAL ROLE trainflow_migrator;
REVOKE ALL ON SCHEMA notifications FROM PUBLIC;
'@)
    foreach ($entry in @(@('Notifications','0'),@('Billing','20261006221531_FinancialAuditGuards'),@('Access','20261007153450_MessagingFeatures'),@('Coaching','20261006220823_GuardServiceRelationshipClient'),@('CheckIns','20261006222911_IndexCheckInForeignKeys'))) {
        $module=$entry[0]; $part=Join-Path $parts "$module.sql"
        dotnet ef migrations script $entry[1] --no-transactions --no-build --configuration $Configuration --project "backend/modules/$module/Metrivum.$module" --startup-project apps/api/Metrivum.Api --context "$($module)DbContext" --output $part
        if ($LASTEXITCODE -ne 0) { throw "SQL generation failed: $module" }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    $sql.Add('RESET ROLE; COMMIT;')
    $output=[IO.Path]::GetFullPath((Join-Path $root $OutputPath))
    [IO.File]::WriteAllText($output,($sql -join "`n`n"),[Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
} finally { Pop-Location }
