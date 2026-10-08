param([string]$SettingsPath='.local/stage-01/database.json', [string]$BaselineSql='.local/stage04/initial.sql', [string]$CleanSql='.local/stage05/initial.sql')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
$saved=@{}; $databases=@()
try {
    foreach($key in @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE')) { $saved[$key]=[Environment]::GetEnvironmentVariable($key) }
    $connection=[System.Data.Common.DbConnectionStringBuilder]::new()
    $connection.set_ConnectionString((Get-Content $SettingsPath -Raw | ConvertFrom-Json).ConnectionString)
    if($connection['Host'] -notin @('127.0.0.1','localhost','::1')) { throw 'Only loopback migration verification is allowed' }
    $env:PGHOST=$connection['Host']; $env:PGPORT=[string]$connection['Port']; $env:PGUSER=$connection['Username']; $env:PGPASSWORD=$connection['Password']; $env:PGDATABASE='postgres'
    $psql=Join-Path $root '.local/postgresql/pgsql/bin/psql.exe'
    function Sql([string]$body) {
        $file=Join-Path $root '.local/stage05/verify.sql'
        [IO.File]::WriteAllText($file,$body,[Text.UTF8Encoding]::new($false))
        & $psql -X -w -v ON_ERROR_STOP=1 -f $file
        if($LASTEXITCODE -ne 0) { throw 'Migration verification SQL failed' }
    }
    foreach($mode in @('upgrade','clean')) {
        $name='trainflow_stage05_verify_'+[Guid]::NewGuid().ToString('N')
        Sql "CREATE DATABASE $name TEMPLATE template0 LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';"
        $databases += $name; $env:PGDATABASE=$name
        $source=if($mode -eq 'upgrade'){$BaselineSql}else{$CleanSql}
        & $psql -X -w -v ON_ERROR_STOP=1 -f $source *> ".local/stage05/migration-$mode.log"
        if($LASTEXITCODE -ne 0) { throw "Initial schema failed: $mode" }
        if($mode -eq 'upgrade') {
            Sql @'
INSERT INTO training.plans ("Id","WorkspaceId","OwnerId","Name","Description","Kind","Archived","Version","CreatedAt","UpdatedAt","Draft") VALUES ('11111111-1111-4111-8111-111111111111',gen_random_uuid(),gen_random_uuid(),'Preserved program','Existing draft','Program',false,7,now(),now(),'{"schemaVersion":1,"blocks":[]}');
INSERT INTO training.revisions VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',1,6,now(),'{"name":"Preserved revision","document":{"schemaVersion":1,"blocks":[]}}','preserve','preserve');
INSERT INTO coaching."Relationships" ("Id","CoachId","ClientId","WorkspaceId","Status","ActivationSource","StartedAt","CreatedAt","UpdatedAt","Version") VALUES ('33333333-3333-4333-8333-333333333333',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'Active','DevFixture',now(),now(),now(),5);
INSERT INTO coaching."Groups" ("Id","CoachId","WorkspaceId","Name","Description","Color","Archived","CreatedAt","UpdatedAt","Version") SELECT '44444444-4444-4444-8444-444444444444',"CoachId","WorkspaceId",'Preserved group','','#123456',false,now(),now(),3 FROM coaching."Relationships";
INSERT INTO coaching."Memberships" SELECT g."Id",r."Id",r."CoachId",r."WorkspaceId",now() FROM coaching."Groups" g JOIN coaching."Relationships" r ON g."CoachId"=r."CoachId";
CREATE TABLE public.stage05_preservation (table_name text, rows jsonb);
DO $$ DECLARE n text; BEGIN
FOREACH n IN ARRAY ARRAY['training.plans','training.revisions','coaching."Relationships"','coaching."Groups"','coaching."Memberships"'] LOOP
EXECUTE format('INSERT INTO public.stage05_preservation SELECT %L,jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM %s t',n,n);
END LOOP; END $$;
'@
            & $psql -X -w -v ON_ERROR_STOP=1 -f .local/stage05/upgrade.sql *> .local/stage05/migration-upgrade-apply.log
            if($LASTEXITCODE -ne 0) { throw 'Upgrade failed' }
            Sql @'
DO $$ DECLARE r record; actual jsonb; BEGIN
FOR r IN SELECT * FROM public.stage05_preservation LOOP
EXECUTE format('SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM %s t',r.table_name) INTO actual;
IF actual IS DISTINCT FROM r.rows THEN RAISE EXCEPTION 'Existing data changed: %',r.table_name; END IF;
END LOOP; END $$;
'@
        }
        Sql @'
DO $$ BEGIN
IF (SELECT nspowner FROM pg_namespace WHERE nspname='client_documentation') <> (SELECT oid FROM pg_roles WHERE rolname='trainflow_migrator') THEN RAISE EXCEPTION 'Wrong schema owner'; END IF;
IF NOT has_schema_privilege('trainflow_api','client_documentation','USAGE') OR has_schema_privilege('trainflow_api','client_documentation','CREATE') THEN RAISE EXCEPTION 'Invalid schema grants'; END IF;
IF has_table_privilege('trainflow_api','training.revisions','UPDATE,DELETE') OR has_table_privilege('trainflow_api','training.workout_executions','DELETE') THEN RAISE EXCEPTION 'Deletable history'; END IF;
IF NOT has_table_privilege('trainflow_api','training.assignments','SELECT,INSERT,UPDATE') OR NOT has_table_privilege('trainflow_api','training.program_generations','SELECT,INSERT') THEN RAISE EXCEPTION 'Missing delivery runtime grants'; END IF;
IF NOT EXISTS(SELECT FROM access.configurations WHERE "Id"='v1-default' AND "GrantedFeatures" @> ARRAY['training.generator.use','training.executions.log-own','coaching.documentation.manage']) THEN RAISE EXCEPTION 'Missing feature grants'; END IF;
END $$;
SET ROLE trainflow_api;
BEGIN;
INSERT INTO client_documentation.coach_notes ("Id","RelationshipId","AuthorId","Text","CreatedAt","UpdatedAt","Version") VALUES ('55555555-5555-4555-8555-555555555555',gen_random_uuid(),gen_random_uuid(),'Runtime note',now(),now(),1);
UPDATE client_documentation.coach_notes SET "Text"='Verified' WHERE "Id"='55555555-5555-4555-8555-555555555555';
INSERT INTO training.assignment_batches ("Id","CoachId","IdempotencyKey","RequestHash","CreatedAt") VALUES (gen_random_uuid(),gen_random_uuid(),'runtime','hash',now());
DO $$ BEGIN IF NOT EXISTS(SELECT FROM client_documentation.coach_notes WHERE "Text"='Verified') THEN RAISE EXCEPTION 'Runtime write/read failed'; END IF; END $$;
ROLLBACK;
RESET ROLE;
'@
        $env:PGDATABASE='postgres'
    }
    Write-Output 'Stage 5 clean/upgrade migration, existing row preservation and restricted runtime write/read passed.'
} finally {
    $env:PGDATABASE='postgres'
    foreach($name in $databases) { if($name -match '^trainflow_stage05_verify_[a-f0-9]{32}$') { & $psql -X -w -v ON_ERROR_STOP=1 -c "DROP DATABASE $name WITH (FORCE);" } }
    foreach($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key]) }
    Pop-Location
}
