param([string]$SettingsPath='.local/stage-01/database.json', [string]$StageTwoSql='.local/workspaces-calendar/initial.sql', [string]$CleanSql='.local/messaging/initial.sql')
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
        $file=Join-Path $root '.local/messaging/verify.sql'
        [IO.File]::WriteAllText($file,$body,[Text.UTF8Encoding]::new($false))
        & $psql -X -w -v ON_ERROR_STOP=1 -f $file
        if($LASTEXITCODE -ne 0) { throw 'Migration verification SQL failed' }
    }
    foreach($mode in @('upgrade','clean')) {
        $name='trainflow_messaging_'+[Guid]::NewGuid().ToString('N')
        Sql "CREATE DATABASE $name;"; $databases += $name; $env:PGDATABASE=$name
        $source=if($mode -eq 'upgrade'){$StageTwoSql}else{$CleanSql}
        & $psql -X -w -v ON_ERROR_STOP=1 -f $source *> (Join-Path $root ".local/messaging/migration-$mode.log")
        if($LASTEXITCODE -ne 0) { throw "Initial schema failed: $mode" }
        if($mode -eq 'upgrade') {
            Sql @'
INSERT INTO accounts.profiles ("Id","Username","NormalizedUsername","DisplayName","BirthDate","Locale","TimeZone","TermsAcceptedAt","TermsVersion","Onboarded","Active","Version","Phone","PhoneVisibleToCoach") VALUES
('10000000-0000-0000-0000-000000000001','migration_coach','MIGRATION_COACH','Migration Coach','1990-01-01','en','Europe/Warsaw',now(),'v1',true,true,7,'123',true),
('10000000-0000-0000-0000-000000000002','migration_client','MIGRATION_CLIENT','Migration Client','1992-02-02','pl','UTC',now(),'v1',true,true,3,NULL,false);
INSERT INTO accounts.workspaces VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
INSERT INTO accounts.user_roles VALUES ('10000000-0000-0000-0000-000000000001','Coach'),('10000000-0000-0000-0000-000000000002','Client');
INSERT INTO coaching."Relationships" VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Active','DevFixture',now(),NULL,NULL,NULL,now(),now(),2);
INSERT INTO coaching."Groups" VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Preserved group','Preserved description','#123456',false,now(),now(),2);
INSERT INTO coaching."Memberships" VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',now());
INSERT INTO coaching."StatusChanges" VALUES ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Suspended','Active','Preserved private reason',now(),2);
INSERT INTO coaching."MembershipChanges" VALUES ('60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,now(),2);
INSERT INTO forms.templates ("Id","CoachId","Purpose","Name","Description","Draft","Archived","CreatedAt","UpdatedAt","Version") VALUES ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','CheckIn','Preserved form','','{"sections":[]}',false,now(),now(),3);
CREATE TABLE public.messaging_preservation (table_name text, rows jsonb);
DO $$ DECLARE n text; BEGIN
FOREACH n IN ARRAY ARRAY['accounts.profiles','coaching."Relationships"','coaching."Groups"','coaching."Memberships"','forms.templates'] LOOP
EXECUTE format('INSERT INTO public.messaging_preservation SELECT %L,jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM %s t',n,n);
END LOOP; END $$;
'@
            & $psql -X -w -v ON_ERROR_STOP=1 -f .local/messaging/migration.sql
            if($LASTEXITCODE -ne 0) { throw 'Upgrade failed' }
            Sql @'
DO $$ DECLARE r record; actual jsonb; BEGIN
FOR r IN SELECT * FROM public.messaging_preservation LOOP
EXECUTE format('SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM %s t',r.table_name) INTO actual;
IF actual IS DISTINCT FROM r.rows THEN RAISE EXCEPTION 'Existing stage 2 data changed: %',r.table_name; END IF;
END LOOP; END $$;
'@
        }
        Sql @'
DO $$ BEGIN
IF (SELECT nspowner FROM pg_namespace WHERE nspname='messaging') <> (SELECT oid FROM pg_roles WHERE rolname='trainflow_migrator') THEN RAISE EXCEPTION 'Wrong owner'; END IF;
IF NOT has_schema_privilege('trainflow_api','messaging','USAGE') OR has_schema_privilege('trainflow_api','messaging','CREATE') THEN RAISE EXCEPTION 'Invalid schema grants'; END IF;
IF has_table_privilege('trainflow_api','messaging."Messages"','UPDATE,DELETE') OR has_table_privilege('trainflow_api','messaging."Reports"','UPDATE,DELETE') THEN RAISE EXCEPTION 'Mutable message evidence'; END IF;
END $$;
SET ROLE trainflow_api;
BEGIN;
INSERT INTO messaging."Conversations" ("Id","Type","Title","CreatedAt","UpdatedAt","Sequence") VALUES ('33333333-3333-4333-8333-333333333333','Group','Runtime test',now(),now(),0);
UPDATE messaging."Conversations" SET "Title"='Verified' WHERE "Id"='33333333-3333-4333-8333-333333333333';
DO $$ BEGIN IF NOT EXISTS(SELECT FROM messaging."Conversations" WHERE "Title"='Verified') THEN RAISE EXCEPTION 'Runtime write/read failed'; END IF; END $$;
ROLLBACK;
RESET ROLE;
'@
        $env:PGDATABASE='postgres'
    }
    Write-Output 'Messaging clean/upgrade migrations and restricted runtime writes passed.'
} finally {
    $env:PGDATABASE='postgres'
    foreach($name in $databases) { if($name -match '^trainflow_messaging_[a-f0-9]{32}$') { & $psql -X -w -v ON_ERROR_STOP=1 -c "DROP DATABASE $name WITH (FORCE);" } }
    foreach($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key]) }
    Pop-Location
}
