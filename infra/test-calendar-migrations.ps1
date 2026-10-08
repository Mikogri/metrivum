param([string]$SettingsPath='.local/stage-01/database.json', [string]$StageTwoSql='.local/supabase-initial.sql', [string]$CleanSql='.local/workspaces-calendar/initial.sql')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
$saved=@{}; $databases=@()
try {
    foreach($key in @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGOPTIONS')) { $saved[$key]=[Environment]::GetEnvironmentVariable($key) }
    $connection=[System.Data.Common.DbConnectionStringBuilder]::new()
    $connection.set_ConnectionString((Get-Content $SettingsPath -Raw | ConvertFrom-Json).ConnectionString)
    if($connection['Host'] -notin @('127.0.0.1','localhost','::1')) { throw 'Only loopback migration verification is allowed' }
    $env:PGHOST=$connection['Host']; $env:PGPORT=[string]$connection['Port']; $env:PGUSER=$connection['Username']; $env:PGPASSWORD=$connection['Password']; $env:PGDATABASE='postgres'; $env:PGOPTIONS='-c client_min_messages=warning'
    $psql=Join-Path $root '.local/postgresql/pgsql/bin/psql.exe'
    function Sql([string]$body) {
        $file=Join-Path $root '.local/workspaces-calendar/verify.sql'
        [IO.File]::WriteAllText($file,$body,[Text.UTF8Encoding]::new($false))
        & $psql -X -w -v ON_ERROR_STOP=1 -f $file
        if($LASTEXITCODE -ne 0) { throw 'Migration verification SQL failed' }
    }
    foreach($mode in @('upgrade','clean')) {
        $name='trainflow_calendar_'+[Guid]::NewGuid().ToString('N')
        Sql "CREATE DATABASE $name;"; $databases += $name; $env:PGDATABASE=$name
        $source=if($mode -eq 'upgrade'){$StageTwoSql}else{$CleanSql}
        & $psql -X -w -v ON_ERROR_STOP=1 -f $source *> (Join-Path $root ".local/workspaces-calendar/migration-$mode.log")
        if($LASTEXITCODE -ne 0) { throw "Initial schema failed: $mode" }
        if($mode -eq 'upgrade') {
            Sql 'CREATE TABLE public.calendar_preservation AS SELECT "Id","Version" FROM accounts.profiles;'
            & $psql -X -w -v ON_ERROR_STOP=1 -f .local/workspaces-calendar/migration.sql
            if($LASTEXITCODE -ne 0) { throw 'Upgrade failed' }
            Sql 'DO $$ BEGIN IF EXISTS(SELECT * FROM public.calendar_preservation EXCEPT SELECT "Id","Version" FROM accounts.profiles) THEN RAISE EXCEPTION ''Existing profiles changed''; END IF; END $$;'
        }
        Sql @'
DO $$ BEGIN
IF (SELECT nspowner FROM pg_namespace WHERE nspname='calendar') <> (SELECT oid FROM pg_roles WHERE rolname='trainflow_migrator') THEN RAISE EXCEPTION 'Wrong owner'; END IF;
IF NOT has_schema_privilege('trainflow_api','calendar','USAGE') OR has_schema_privilege('trainflow_api','calendar','CREATE') THEN RAISE EXCEPTION 'Invalid schema grants'; END IF;
IF has_table_privilege('trainflow_api','calendar."Audit"','UPDATE,DELETE') THEN RAISE EXCEPTION 'Mutable audit'; END IF;
END $$;
SET ROLE trainflow_api;
BEGIN;
INSERT INTO calendar."Events" ("Id","CoachId","WorkspaceId","Kind","Title","Description","TimeZone","StartsAtUtc","EndsAtUtc","Cancelled","Version") VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Meeting','Runtime test','','UTC',now(),now()+interval '1 hour',false,1);
UPDATE calendar."Events" SET "Title"='Verified',"Version"=2 WHERE "Id"='33333333-3333-4333-8333-333333333333';
DO $$ BEGIN IF NOT EXISTS(SELECT FROM calendar."Events" WHERE "Title"='Verified') THEN RAISE EXCEPTION 'Runtime write/read failed'; END IF; END $$;
ROLLBACK;
RESET ROLE;
'@
        $env:PGDATABASE='postgres'
    }
    Write-Output 'Calendar clean/upgrade migrations and restricted runtime writes passed.'
} finally {
    $env:PGDATABASE='postgres'
    foreach($name in $databases) { if($name -match '^trainflow_calendar_[a-f0-9]{32}$') { & $psql -X -w -v ON_ERROR_STOP=1 -c "DROP DATABASE $name WITH (FORCE);" } }
    foreach($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key]) }
    Pop-Location
}
