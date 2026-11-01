param([string]$OutputPath = '.local/coaching-stage01.sql', [string]$Configuration = 'Release')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$previous = $env:TRAINFLOW_MIGRATION_DATABASE
try {
    $env:TRAINFLOW_MIGRATION_DATABASE = 'Host=127.0.0.1;Database=script_generation;Username=unconfigured'
    $parts = Join-Path $root '.local/stage-01/sql'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql = [Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Stage 01 upgrade for the recorded development project. Review before execution.
BEGIN;
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM accounts."__EFMigrationsHistory" WHERE "MigrationId" = '20261005125329_GuardRuntimeRoleAssignment')
       OR EXISTS (SELECT FROM accounts."__EFMigrationsHistory" WHERE "MigrationId" = '20261006210202_ClientAccounts')
       OR EXISTS (SELECT FROM pg_namespace WHERE nspname = 'coaching') THEN
        RAISE EXCEPTION 'Stage 01 requires the expected pre-stage migration baseline';
    END IF;
END $$;
CREATE SCHEMA coaching AUTHORIZATION trainflow_migrator;
SET LOCAL ROLE trainflow_migrator;
REVOKE ALL ON SCHEMA coaching FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA coaching REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA coaching REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
'@)
    foreach ($entry in @(
        @('Accounts','20261005125329_GuardRuntimeRoleAssignment','20261006210202_ClientAccounts'),
        @('Access','20261005125044_InitialAccess','20261006210211_CoachingDefaultFeatures'),
        @('Coaching','0','20261006210339_InitialCoaching')
    )) {
        $module = $entry[0]
        $part = Join-Path $parts "$module.sql"
        dotnet ef migrations script $entry[1] $entry[2] --no-transactions --no-build --configuration $Configuration `
            --project "backend/modules/$module/Metrivum.$module" --startup-project apps/api/Metrivum.Api `
            --context "$($module)DbContext" --output $part
        if ($LASTEXITCODE -ne 0) { throw "SQL generation failed: $module" }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $sql.Add(@'
-- Run after migrations as the migration owner or database administrator.
-- Deliberately no default runtime grants: new tables require an explicit review.
-- Schema access is required in addition to table privileges. Apply as the schema owner.
GRANT USAGE ON SCHEMA accounts, access, exercise_catalog, training, media, video_analysis, coaching TO trainflow_api;
GRANT USAGE ON SCHEMA media, video_analysis TO trainflow_worker;

GRANT SELECT, INSERT, UPDATE ON accounts.profiles TO trainflow_api;
GRANT SELECT, INSERT ON accounts.workspaces TO trainflow_api;
GRANT SELECT, INSERT ON accounts.user_roles TO trainflow_api;
-- The EF-owned trigger restricts runtime insertion to Coach/Client; admins use the operational script.

GRANT SELECT, INSERT, UPDATE, DELETE ON access.configurations, access.assignments, access.overrides, access.flags TO trainflow_api;
GRANT SELECT, INSERT ON access.audit TO trainflow_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON exercise_catalog.exercises, exercise_catalog.tags,
    exercise_catalog.exercise_tags, exercise_catalog.muscles, exercise_catalog.movement_patterns,
    exercise_catalog.exercise_muscles, exercise_catalog.exercise_movement_patterns, exercise_catalog.favorites TO trainflow_api;
GRANT SELECT, INSERT ON exercise_catalog.exercise_revisions TO trainflow_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON training.folders, training.plans, training.formulas, training.imports TO trainflow_api;
GRANT SELECT, INSERT ON training.revisions, training.formula_versions TO trainflow_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON media.files TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON video_analysis.jobs TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON coaching."Relationships", coaching."Groups" TO trainflow_api;
GRANT SELECT, INSERT, DELETE ON coaching."Memberships" TO trainflow_api;
GRANT SELECT, INSERT ON coaching."StatusChanges", coaching."MembershipChanges" TO trainflow_api;
GRANT SELECT, UPDATE ON media.files TO trainflow_worker;
GRANT SELECT, UPDATE ON video_analysis.jobs TO trainflow_worker;

DO $$
DECLARE schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis','coaching'] LOOP
        EXECUTE format('REVOKE ALL ON %I."__EFMigrationsHistory" FROM trainflow_api, trainflow_worker', schema_name);
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC', schema_name);
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', schema_name);
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', schema_name);
        END IF;
    END LOOP;
END $$;
'@)
    $sql.Add("RESET ROLE;`nCOMMIT;")
    $output = [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }))
    [IO.File]::WriteAllText($output, ($sql -join "`n`n"), [Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
}
finally { $env:TRAINFLOW_MIGRATION_DATABASE = $previous; Pop-Location }
