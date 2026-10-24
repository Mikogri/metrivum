param([string]$OutputPath = '.local/coaching-stage02.sql', [string]$Configuration = 'Release')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$previous = $env:TRAINFLOW_MIGRATION_DATABASE
try {
    # Generation uses compiled design factories and never connects to a database.
    $env:TRAINFLOW_MIGRATION_DATABASE = 'Host=127.0.0.1;Database=script_generation;Username=unconfigured'
    $parts = Join-Path $root '.local/stage-02/sql'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql = [Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Stage 02 incremental upgrade. Review and execute as administrator after Stage 01.
BEGIN;
DO $$
DECLARE baseline record; actual text[]; migrator oid;
BEGIN
    SELECT oid INTO migrator FROM pg_roles WHERE rolname = 'trainflow_migrator';
    IF migrator IS NULL OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trainflow_api')
        OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trainflow_worker') THEN
        RAISE EXCEPTION 'Stage 02 requires the existing Metrivum roles';
    END IF;
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname IN ('forms','offers','billing','checkins')) THEN
        RAISE EXCEPTION 'Stage 02 requires absent new module schemas';
    END IF;
    FOR baseline IN SELECT * FROM (VALUES
        ('accounts', ARRAY['20261005125040_InitialAccounts','20261005125329_GuardRuntimeRoleAssignment','20261006210202_ClientAccounts']),
        ('access', ARRAY['20261005125044_InitialAccess','20261006210211_CoachingDefaultFeatures']),
        ('exercise_catalog', ARRAY['20261005124810_InitialExerciseCatalog']),
        ('training', ARRAY['20261005125618_InitialTraining','20261005135233_HardenImmutableTriggerSearchPath']),
        ('media', ARRAY['20261005125102_InitialMedia']),
        ('video_analysis', ARRAY['20261005125107_InitialVideoAnalysis']),
        ('coaching', ARRAY['20261006210339_InitialCoaching'])
    ) AS b(schema_name, migrations) LOOP
        IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = baseline.schema_name AND nspowner = migrator)
            OR to_regclass(format('%I.%I', baseline.schema_name, '__EFMigrationsHistory')) IS NULL THEN
            RAISE EXCEPTION 'Unexpected Stage 01 schema or owner: %', baseline.schema_name;
        END IF;
        EXECUTE format('SELECT array_agg("MigrationId" ORDER BY "MigrationId") FROM %I."__EFMigrationsHistory"', baseline.schema_name) INTO actual;
        IF actual IS DISTINCT FROM baseline.migrations THEN
            RAISE EXCEPTION 'Unexpected Stage 01 migration history: %', baseline.schema_name;
        END IF;
    END LOOP;
END $$;
CREATE SCHEMA forms AUTHORIZATION trainflow_migrator;
CREATE SCHEMA offers AUTHORIZATION trainflow_migrator;
CREATE SCHEMA billing AUTHORIZATION trainflow_migrator;
CREATE SCHEMA checkins AUTHORIZATION trainflow_migrator;
SET LOCAL ROLE trainflow_migrator;
DO $$
DECLARE schema_name text; client_role text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['forms','offers','billing','checkins'] LOOP
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', schema_name);
        FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = client_role) THEN
                EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I', schema_name, client_role);
            END IF;
        END LOOP;
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM PUBLIC', schema_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', schema_name);
    END LOOP;
END $$;
'@)
    foreach ($entry in @(
        @('Accounts','20261006210202_ClientAccounts','20261006214448_ProfileSystemFields'),
        @('Access','20261006210211_CoachingDefaultFeatures','20261006220335_StageTwoFeatures'),
        @('Forms','0','20261006214455_InitialForms'),
        @('Offers','0','20261006221525_OfferDefinitionGuards'),
        @('Coaching','20261006210339_InitialCoaching','20261006220823_GuardServiceRelationshipClient'),
        @('Billing','0','20261006221531_FinancialAuditGuards'),
        @('CheckIns','0','20261006222911_IndexCheckInForeignKeys')
    )) {
        $module = $entry[0]
        $part = Join-Path $parts "$module.sql"
        dotnet ef migrations script $entry[1] $entry[2] --no-transactions --no-build --configuration $Configuration `
            --project "backend/modules/$module/TrainFlow.$module" --startup-project apps/api/TrainFlow.Api `
            --context "$($module)DbContext" --output $part
        if ($LASTEXITCODE -ne 0) { throw "SQL generation failed: $module" }
        $body = [IO.File]::ReadAllText($part)
        if (!$body.Contains($entry[2])) { throw "Compiled migration missing: $($entry[2])" }
        $sql.Add($body)
    }
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    $sql.Add("RESET ROLE;`nCOMMIT;")
    $output = [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }))
    New-Item -ItemType Directory -Force (Split-Path $output -Parent) | Out-Null
    [IO.File]::WriteAllText($output, (($sql -join "`n`n").Replace("`r`n", "`n").TrimEnd() + "`n"), [Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
    Get-FileHash -Algorithm SHA256 -LiteralPath $output | Select-Object Hash
}
finally { $env:TRAINFLOW_MIGRATION_DATABASE = $previous; Pop-Location }
