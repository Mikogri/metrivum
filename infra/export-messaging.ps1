param([string]$OutputPath = '.local/messaging/migration.sql', [string]$Configuration = 'Debug')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $parts = Join-Path $root '.local/messaging'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql = [Collections.Generic.List[string]]::new()
    $sql.Add(@'
BEGIN;
DO $$ BEGIN
  IF to_regclass('checkins."Schedules"') IS NULL OR to_regnamespace('messaging') IS NOT NULL THEN
    RAISE EXCEPTION 'Messaging upgrade requires Stage Two and an absent messaging schema';
  END IF;
  IF NOT EXISTS (SELECT FROM access."__EFMigrationsHistory" WHERE "MigrationId" = '20261007132211_CalendarFeatures') THEN
    RAISE EXCEPTION 'Current access baseline missing';
  END IF;
END $$;
CREATE SCHEMA messaging AUTHORIZATION trainflow_migrator;
SET LOCAL ROLE trainflow_migrator;
REVOKE ALL ON SCHEMA messaging FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA messaging FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA messaging REVOKE ALL ON TABLES FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA messaging REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA messaging REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
'@)
    foreach ($entry in @(@('Messaging','0','20261007153423_InitialMessaging'), @('Media','20261005125102_InitialMedia','20261007153121_MessagingAttachments'), @('Access','20261007132211_CalendarFeatures','20261007153450_MessagingFeatures'))) {
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
