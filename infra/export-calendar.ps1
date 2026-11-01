param([string]$OutputPath = '.local/workspaces-calendar/migration.sql', [string]$Configuration = 'Debug')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $parts = Join-Path $root '.local/workspaces-calendar'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql = [Collections.Generic.List[string]]::new()
    $sql.Add(@'
BEGIN;
DO $$ BEGIN
  IF to_regclass('checkins."Schedules"') IS NULL OR to_regnamespace('calendar') IS NOT NULL THEN
    RAISE EXCEPTION 'Calendar upgrade requires Stage Two and an absent calendar schema';
  END IF;
  IF NOT EXISTS (SELECT FROM access."__EFMigrationsHistory" WHERE "MigrationId" = '20261006220335_StageTwoFeatures') THEN
    RAISE EXCEPTION 'Stage Two access migration missing';
  END IF;
END $$;
CREATE SCHEMA calendar AUTHORIZATION trainflow_migrator;
SET LOCAL ROLE trainflow_migrator;
REVOKE ALL ON SCHEMA calendar FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA calendar FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA calendar REVOKE ALL ON TABLES FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA calendar REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA calendar REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
'@)
    foreach ($entry in @(@('Calendar','0','20261007134212_GuardCalendarRelationshipClient'), @('Access','20261006220335_StageTwoFeatures','20261007132211_CalendarFeatures'))) {
        $module=$entry[0]; $part=Join-Path $parts "$module.sql"
        dotnet ef migrations script $entry[1] $entry[2] --no-transactions --no-build --configuration $Configuration --project "backend/modules/$module/Metrivum.$module" --startup-project apps/api/Metrivum.Api --context "$($module)DbContext" --output $part
        if ($LASTEXITCODE -ne 0) { throw "Failed SQL export: $module" }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    $sql.Add('RESET ROLE; COMMIT;')
    $output=[IO.Path]::GetFullPath((Join-Path $root $OutputPath))
    [IO.File]::WriteAllText($output, ($sql -join "`n`n"), [Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
} finally { Pop-Location }
