param([string]$SettingsPath='.local/stage-01/database.json', [string]$StageTwoSql='.local/messaging/initial.sql', [string]$CleanSql='.local/stage04/initial.sql')
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
        $file=Join-Path $root '.local/stage04/verify.sql'
        [IO.File]::WriteAllText($file,$body,[Text.UTF8Encoding]::new($false))
        & $psql -X -w -v ON_ERROR_STOP=1 -f $file
        if($LASTEXITCODE -ne 0) { throw 'Migration verification SQL failed' }
    }
    foreach($mode in @('upgrade','clean')) {
        $name='trainflow_stage04_'+[Guid]::NewGuid().ToString('N')
        Sql "CREATE DATABASE $name;"; $databases += $name; $env:PGDATABASE=$name
        $source=if($mode -eq 'upgrade'){$StageTwoSql}else{$CleanSql}
        & $psql -X -w -v ON_ERROR_STOP=1 -f $source *> (Join-Path $root ".local/stage04/migration-$mode.log")
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
INSERT INTO messaging."Conversations" ("Id","Type","Title","CreatedAt","UpdatedAt","Sequence") VALUES ('80000000-0000-0000-0000-000000000001','Group','Preserved conversation',now(),now(),1);
INSERT INTO messaging."Messages" ("Id","ConversationId","SenderUserId","Type","Body","CreatedAt","Sequence","IdempotencyKey","RequestHash") VALUES ('80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Text','Preserved message',now(),1,'upgrade-message','upgrade-hash');
INSERT INTO billing.orders VALUES ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000004',NULL,'Preserved sale','{"Model":"PerSession"}',100,'EUR',0.12,12,88,'Simulated',now(),now());
INSERT INTO billing.payment_dues VALUES ('90000000-0000-0000-0000-000000000005','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',0,now(),NULL,now(),'Paid',100,'EUR',0.12,12,88,'Simulated',now(),now(),'10000000-0000-0000-0000-000000000001','Upgrade fixture');
INSERT INTO billing.payments VALUES ('90000000-0000-0000-0000-000000000006','90000000-0000-0000-0000-000000000005',NULL,'10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',100,0.12,12,88,'EUR','Simulated','Upgrade fixture','upgrade-payment','10000000-0000-0000-0000-000000000001',now());
CREATE TABLE public.messaging_preservation (table_name text, rows jsonb);
DO $$ DECLARE n text; BEGIN
FOREACH n IN ARRAY ARRAY['accounts.profiles','coaching."Relationships"','coaching."Groups"','coaching."Memberships"','forms.templates','messaging."Messages"','messaging."Conversations"','billing.orders','billing.payment_dues','billing.payments'] LOOP
EXECUTE format('INSERT INTO public.messaging_preservation SELECT %L,jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM %s t',n,n);
END LOOP; END $$;
'@
            & $psql -X -w -v ON_ERROR_STOP=1 -f .local/stage04/upgrade.sql
            if($LASTEXITCODE -ne 0) { throw 'Upgrade failed' }
            Sql @'
DO $$ DECLARE r record; actual jsonb; BEGIN
FOR r IN SELECT * FROM public.messaging_preservation LOOP
EXECUTE format('SELECT jsonb_agg(to_jsonb(t) - ''Context'' ORDER BY (to_jsonb(t) - ''Context'')::text) FROM %s t',r.table_name) INTO actual;
IF actual IS DISTINCT FROM r.rows THEN RAISE EXCEPTION 'Existing stage 3A data changed: %',r.table_name; END IF;
END LOOP; END $$;
'@
        }
        Sql @'
DO $$ BEGIN
IF (SELECT nspowner FROM pg_namespace WHERE nspname='notifications') <> (SELECT oid FROM pg_roles WHERE rolname='trainflow_migrator') THEN RAISE EXCEPTION 'Wrong owner'; END IF;
IF NOT has_schema_privilege('trainflow_api','notifications','USAGE') OR has_schema_privilege('trainflow_api','notifications','CREATE') THEN RAISE EXCEPTION 'Invalid schema grants'; END IF;
IF has_table_privilege('trainflow_api','billing.payments','UPDATE,DELETE') OR has_table_privilege('trainflow_api','billing.plan_prices','UPDATE,DELETE') THEN RAISE EXCEPTION 'Mutable financial history'; END IF;
IF EXISTS(SELECT FROM billing.payments WHERE "Context" <> 'CoachingService') THEN RAISE EXCEPTION 'Historic sale context changed'; END IF;
IF (SELECT count(*) FROM billing.platform_plans) <> 2 THEN RAISE EXCEPTION 'Missing Free/Pro plans'; END IF;
IF has_table_privilege('trainflow_api','messaging."Messages"','UPDATE,DELETE') OR has_table_privilege('trainflow_api','messaging."Reports"','UPDATE,DELETE') THEN RAISE EXCEPTION 'Mutable message evidence'; END IF;
END $$;
SET ROLE trainflow_api;
BEGIN;
INSERT INTO notifications."Notifications" ("Id","RecipientUserId","EventKey","Type","Category","SourceModule","SourceId","CreatedAt","AvailableAt","Required","Cancelled") VALUES ('44444444-4444-4444-8444-444444444444','10000000-0000-0000-0000-000000000001','migration-runtime-test','Test','System','System','44444444-4444-4444-8444-444444444444',now(),now(),false,false);
UPDATE notifications."Notifications" SET "ReadAt"=now() WHERE "Id"='44444444-4444-4444-8444-444444444444';
DO $$ BEGIN
IF NOT EXISTS(SELECT FROM notifications."Notifications" WHERE "ReadAt" IS NOT NULL) THEN RAISE EXCEPTION 'Notification runtime write/read failed'; END IF;
BEGIN
INSERT INTO notifications."Notifications" SELECT gen_random_uuid(),"RecipientUserId","EventKey","Type","Category","SourceModule","SourceId","DeepLink","CreatedAt","AvailableAt","ReadAt","Required","Cancelled","DeliveredAt" FROM notifications."Notifications" WHERE "Id"='44444444-4444-4444-8444-444444444444';
RAISE EXCEPTION 'Missing notification deduplication';
EXCEPTION WHEN unique_violation THEN NULL;
END;
END $$;
INSERT INTO messaging."Conversations" ("Id","Type","Title","CreatedAt","UpdatedAt","Sequence") VALUES ('33333333-3333-4333-8333-333333333333','Group','Runtime test',now(),now(),0);
UPDATE messaging."Conversations" SET "Title"='Verified' WHERE "Id"='33333333-3333-4333-8333-333333333333';
DO $$ BEGIN IF NOT EXISTS(SELECT FROM messaging."Conversations" WHERE "Title"='Verified') THEN RAISE EXCEPTION 'Runtime write/read failed'; END IF; END $$;
ROLLBACK;
RESET ROLE;
'@
        $env:PGDATABASE='postgres'
    }
    Write-Output 'Stage 04 clean/upgrade migrations, historical row preservation and restricted runtime writes passed.'
} finally {
    $env:PGDATABASE='postgres'
    foreach($name in $databases) { if($name -match '^trainflow_stage04_[a-f0-9]{32}$') { & $psql -X -w -v ON_ERROR_STOP=1 -c "DROP DATABASE $name WITH (FORCE);" } }
    foreach($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key]) }
    Pop-Location
}
