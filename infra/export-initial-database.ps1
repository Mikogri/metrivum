param(
    [string]$OutputPath = '.local/supabase-initial.sql',
    [string]$Configuration = 'Release',
    [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$previousConnection = $env:TRAINFLOW_MIGRATION_DATABASE
$previousDatabase = $env:ConnectionStrings__Database
$previousMigrationDatabase = $env:ConnectionStrings__MigrationDatabase
try {
    $modules = @('Notifications','Accounts','Access','ExerciseCatalog','Training','Media','VideoAnalysis','Forms','Offers','Coaching','Billing','CheckIns','Calendar','Messaging','ClientDocumentation','Integrations')
    $actualModules = @(Get-ChildItem backend/modules -Directory | Where-Object {
        Get-ChildItem $_.FullName -Recurse -Filter '*ModelSnapshot.cs'
    } | ForEach-Object Name | Sort-Object)
    if (Compare-Object ($modules | Sort-Object) $actualModules) { throw 'EF module inventory differs from initial exporter; review module ordering.' }
    if (!$NoBuild) {
        dotnet build apps/api/Metrivum.Api --configuration $Configuration
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    }
    # SQL generation does not connect to PostgreSQL; design factories require a value.
    $env:TRAINFLOW_MIGRATION_DATABASE = 'Host=127.0.0.1;Database=script_generation;Username=unconfigured'
    $env:ConnectionStrings__Database = $env:TRAINFLOW_MIGRATION_DATABASE
    $env:ConnectionStrings__MigrationDatabase = $env:TRAINFLOW_MIGRATION_DATABASE
    $output = [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }))
    $parts = Join-Path $root '.local/cloud-migration'
    New-Item -ItemType Directory -Force $parts, (Split-Path $output -Parent) | Out-Null
    $sql = [Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Initial deployment only. Execute atomically as postgres on an empty application database.
-- Generated from EF migrations; per-module EF history remains authoritative.
BEGIN;
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname IN
        ('accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins','calendar','messaging','notifications','client_documentation','integrations')) THEN
        RAISE EXCEPTION 'Initial deployment requires absent Metrivum schemas';
    END IF;
END $$;
'@)
    $bootstrap = [IO.File]::ReadAllText((Join-Path $root 'infra/bootstrap-roles.sql')).Replace("`r`n", "`n")
    $boundary = $bootstrap.IndexOf("`n`nDO ")
    if ($boundary -lt 0) { throw 'Cannot locate role/schema bootstrap boundary.' }
    $sql.Add($bootstrap.Substring(0, $boundary))
    # Supabase's postgres is an administrator, not a PostgreSQL superuser.
    $sql.Add('GRANT trainflow_migrator TO postgres WITH INHERIT FALSE, SET TRUE;')
    $sql.Add($bootstrap.Substring($boundary))
    $sql.Add('SET LOCAL ROLE trainflow_migrator;')
    foreach ($module in $modules) {
        $part = Join-Path $parts "$module.sql"
        dotnet ef migrations script --no-transactions --no-build --configuration $Configuration `
            --project "backend/modules/$module/Metrivum.$module" `
            --startup-project apps/api/Metrivum.Api --context $(if ($module -eq 'ClientDocumentation') { 'DocumentationDbContext' } else { "$($module)DbContext" }) --output $part
        if ($LASTEXITCODE -ne 0) { throw "SQL generation failed: $module" }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $keys = Get-Content contracts/generated/features.json -Raw | ConvertFrom-Json |
        ForEach-Object { $_.key } | Sort-Object -Unique
    if (!$keys -or ($keys | Where-Object { $_ -notmatch '\A[a-z][a-z0-9_.-]*\z' })) {
        throw 'Unexpected feature keys; regenerate and review the feature catalog.'
    }
    $features = ($keys | ForEach-Object { "'$_'" }) -join ', '
    $sql.Add('INSERT INTO access.configurations ("Id", "Version", "GrantedFeatures") VALUES ' +
        "('v1-default', 1, ARRAY[$features]::text[]);")
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    # Auth-owned data stays behind administrator-owned boolean functions; never grant runtime Auth table access.
    $sql.Add('RESET ROLE;')
    foreach ($helper in @('auth-session-validation.sql', 'auth-second-factor.sql')) {
        $body = [IO.File]::ReadAllText((Join-Path $root "infra/$helper"))
        # The bundle owns the single outer transaction; nested COMMIT would break atomic initialization.
        $body = [regex]::Replace($body, '(?m)^\s*(BEGIN|COMMIT);\s*$', '')
        $sql.Add($body)
    }
    $sql.Add("RESET ROLE;`nCOMMIT;")
    [IO.File]::WriteAllText($output, (($sql -join "`n`n").Replace("`r`n", "`n").TrimEnd() + "`n"), [Text.UTF8Encoding]::new($false))
    Write-Output "Generated $output"
    Get-FileHash -Algorithm SHA256 -LiteralPath $output | Select-Object Hash
}
finally {
    $env:TRAINFLOW_MIGRATION_DATABASE = $previousConnection
    $env:ConnectionStrings__Database = $previousDatabase
    $env:ConnectionStrings__MigrationDatabase = $previousMigrationDatabase
    Pop-Location
}
