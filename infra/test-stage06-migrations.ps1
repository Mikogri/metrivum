param([string]$SettingsPath='.local/stage05/database.json', [string]$BaselineSql='.local/stage05/initial.sql',
    [string]$ApiPath='.local/stage06/build/bin/Metrivum.Api/debug/Metrivum.Api.dll')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
$saved=@{}; $databases=@()
try {
    foreach ($key in @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','ASPNETCORE_ENVIRONMENT','ConnectionStrings__MigrationDatabase')) { $saved[$key]=[Environment]::GetEnvironmentVariable($key) }
    $connection=[System.Data.Common.DbConnectionStringBuilder]::new()
    $connection.set_ConnectionString((Get-Content $SettingsPath -Raw | ConvertFrom-Json).ConnectionString)
    if ($connection['Host'] -notin @('127.0.0.1','localhost','::1')) { throw 'Only loopback migration verification is allowed' }
    $env:PGHOST=$connection['Host']; $env:PGPORT=[string]$connection['Port']; $env:PGUSER=$connection['Username']; $env:PGPASSWORD=$connection['Password']; $env:PGDATABASE='postgres'
    $psql=Join-Path $root '.local/postgresql/pgsql/bin/psql.exe'
    function Sql([string]$body) {
        $file=Join-Path $root '.local/stage06/verify.sql'
        [IO.File]::WriteAllText($file,$body,[Text.UTF8Encoding]::new($false))
        & $psql -X -w -v ON_ERROR_STOP=1 -f $file
        if ($LASTEXITCODE -ne 0) { throw 'Migration verification SQL failed' }
    }
    function SqlFile([string]$file,[string]$label) {
        & $psql -X -w -v ON_ERROR_STOP=1 -f $file *> ".local/stage06/migration-$label.log"
        if ($LASTEXITCODE -ne 0) { throw "Migration failed: $label (see local log)" }
    }
    foreach ($mode in @('upgrade','clean')) {
        $name='trainflow_stage06_verify_'+[Guid]::NewGuid().ToString('N')
        Sql "CREATE DATABASE $name TEMPLATE template0 LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';"
        $databases += $name; $env:PGDATABASE=$name
        if ($mode -eq 'upgrade') {
            SqlFile $BaselineSql 'baseline'
            Sql ('SET ROLE trainflow_migrator;' + [IO.File]::ReadAllText((Join-Path $root '.local/stage06/sql/billing-baseline.sql')) + 'RESET ROLE;')
            Sql @'
INSERT INTO coaching."Relationships" ("Id","CoachId","ClientId","WorkspaceId","Status","ActivationSource","StartedAt","CreatedAt","UpdatedAt","Version")
VALUES ('33333333-3333-4333-8333-333333333333',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'Active','DevFixture',now(),now(),now(),5);
INSERT INTO coaching."Groups" ("Id","CoachId","WorkspaceId","Name","Description","Color","Archived","CreatedAt","UpdatedAt","Version")
SELECT '44444444-4444-4444-8444-444444444444',"CoachId","WorkspaceId",'Preserved personal group','','#123456',false,now(),now(),3 FROM coaching."Relationships";
INSERT INTO coaching."Memberships" SELECT g."Id",r."Id",r."CoachId",r."WorkspaceId",now() FROM coaching."Groups" g JOIN coaching."Relationships" r ON g."CoachId"=r."CoachId";
INSERT INTO training.plans ("Id","WorkspaceId","OwnerId","Name","Description","Kind","Archived","Version","CreatedAt","UpdatedAt","Draft")
VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'Preserved private program','','Program',false,7,now(),now(),'{"schemaVersion":1,"blocks":[]}');
CREATE TABLE public.stage06_preservation (table_name text, rows jsonb);
DO $$ DECLARE n text; BEGIN
FOREACH n IN ARRAY ARRAY['training.plans','coaching."Relationships"','coaching."Groups"','coaching."Memberships"'] LOOP
EXECUTE format('INSERT INTO public.stage06_preservation SELECT %L,jsonb_agg(jsonb_strip_nulls(to_jsonb(t)) ORDER BY to_jsonb(t)::text) FROM %s t',n,n);
END LOOP; END $$;
'@
            SqlFile '.local/stage06/upgrade.sql' 'upgrade'
            Sql @'
DO $$ DECLARE r record; actual jsonb; BEGIN
FOR r IN SELECT * FROM public.stage06_preservation LOOP
EXECUTE format('SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(t)) ORDER BY to_jsonb(t)::text) FROM %s t',r.table_name) INTO actual;
IF actual IS DISTINCT FROM r.rows THEN RAISE EXCEPTION 'Existing data changed: %',r.table_name; END IF;
END LOOP;
IF EXISTS (SELECT FROM coaching."Relationships" WHERE "TeamId" IS NOT NULL) OR EXISTS (SELECT FROM coaching."Groups" WHERE "TeamId" IS NOT NULL) THEN RAISE EXCEPTION 'Personal data was relabelled'; END IF;
END $$;
'@
        } else {
            SqlFile 'infra/bootstrap-roles.sql' 'bootstrap'
            $connection['Database']=$name; $connection['Options']='-c role=trainflow_migrator'
            $env:ASPNETCORE_ENVIRONMENT='Testing'; $env:ConnectionStrings__MigrationDatabase=$connection.ConnectionString
            dotnet $ApiPath --migrate *> .local/stage06/migration-clean.log
            if ($LASTEXITCODE -ne 0) { throw 'Clean migrations failed (see local log)' }
            SqlFile 'infra/runtime-grants.sql' 'runtime-grants'
        }
        Sql @'
DO $$ BEGIN
IF NOT has_table_privilege('trainflow_api','billing.team_platform_subscriptions','SELECT,INSERT,UPDATE')
 OR NOT has_table_privilege('trainflow_api','coaching."TeamClientCases"','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Missing Team runtime grants'; END IF;
IF has_table_privilege('trainflow_api','billing.proration_credits','UPDATE,DELETE')
 OR has_table_privilege('trainflow_worker','coaching."TeamClientCases"','SELECT')
 OR has_schema_privilege('trainflow_api','billing','CREATE') THEN RAISE EXCEPTION 'Unsafe runtime privilege'; END IF;
IF (SELECT count(*) FROM pg_trigger WHERE tgname IN ('memberships_scope','group_scope_immutable','check_team_capacity','check_member_capacity','check_subscription_capacity')) <> 5 THEN RAISE EXCEPTION 'Missing scope guards'; END IF;
END $$;
'@
        $env:PGDATABASE='postgres'
    }
    Write-Output 'Stage 6 clean/upgrade migrations, Personal preservation and restricted grants passed.'
} finally {
    $env:PGDATABASE='postgres'
    foreach ($name in $databases) { if ($name -match '^trainflow_stage06_verify_[a-f0-9]{32}$') { & $psql -X -w -v ON_ERROR_STOP=1 -c "DROP DATABASE $name WITH (FORCE);" } }
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key]) }
    Pop-Location
}
