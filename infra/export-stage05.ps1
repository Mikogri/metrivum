param([string]$OutputPath='.local/stage05/upgrade.sql',[string]$Configuration='Release',[switch]$NoBuild)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    if (!$NoBuild) {
        dotnet build apps/api/Metrivum.Api --configuration $Configuration -m:2 /nodeReuse:false /p:UseSharedCompilation=false
        if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    }
    $parts=Join-Path $root '.local/stage05/sql'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql=[Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Non-destructive Stage 5 upgrade; EF migrations remain authoritative.
BEGIN;
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM access."__EFMigrationsHistory" WHERE "MigrationId"='20261008083659_StageFourFeatures')
       OR to_regclass('training.revisions') IS NULL THEN
        RAISE EXCEPTION 'Stage 5 requires the verified Stage 4 baseline';
    END IF;
    IF to_regclass('training.assignments') IS NOT NULL OR EXISTS (SELECT FROM pg_namespace WHERE nspname='client_documentation') THEN
        RAISE EXCEPTION 'Stage 5 already started: inspect migration history before retry';
    END IF;
END $$;
CREATE SCHEMA client_documentation AUTHORIZATION trainflow_migrator;
SET LOCAL ROLE trainflow_migrator;
REVOKE ALL ON SCHEMA client_documentation FROM PUBLIC;
'@)
    foreach ($entry in @(@('Training','TrainingDbContext','20261005135233_HardenImmutableTriggerSearchPath'),@('ClientDocumentation','DocumentationDbContext','0'),@('Access','AccessDbContext','20261008083659_StageFourFeatures'))) {
        $module=$entry[0]; $part=Join-Path $parts "$module.sql"
        dotnet ef migrations script $entry[2] --no-transactions --no-build --configuration $Configuration --project "backend/modules/$module/Metrivum.$module" --startup-project apps/api/Metrivum.Api --context $entry[1] --output $part
        if ($LASTEXITCODE -ne 0) { throw "SQL generation failed: $module" }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    $sql.Add('RESET ROLE; COMMIT;')
    $output=[IO.Path]::GetFullPath((Join-Path $root $OutputPath))
    [IO.File]::WriteAllText($output,($sql -join "`n`n"),[Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
} finally { Pop-Location }
