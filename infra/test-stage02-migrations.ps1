param([string]$SettingsPath = '.local/stage-01/database.json', [string]$PsqlPath = '.local/postgresql/pgsql/bin/psql.exe')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$saved = @{}
$databases = @()
try {
    foreach ($key in @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGOPTIONS')) { $saved[$key] = [Environment]::GetEnvironmentVariable($key) }
    $connection = (Get-Content $SettingsPath -Raw | ConvertFrom-Json).ConnectionString
    $fields = @{}
    foreach ($match in [regex]::Matches($connection, '(?:^|;)\s*([^=;]+)=([^;]*)')) { $fields[$match.Groups[1].Value.Trim().ToLowerInvariant()] = $match.Groups[2].Value.Trim().Trim('"') }
    if ($fields['host'] -notin @('127.0.0.1','localhost','::1')) { throw 'Migration verification requires a loopback PostgreSQL host.' }
    $env:PGHOST = $fields['host']; $env:PGPORT = $fields['port']; $env:PGUSER = $fields['username']; $env:PGPASSWORD = $fields['password']; $env:PGDATABASE = 'postgres'; $env:PGOPTIONS = '-c client_min_messages=warning'
    if (!$env:PGPORT) { $env:PGPORT = '5432' }
    $psql = [IO.Path]::GetFullPath($PsqlPath)
    if (!(Test-Path $psql)) { throw 'psql is unavailable; supply -PsqlPath.' }
    foreach ($file in @('.local/coaching-stage02.sql','.local/supabase-initial.sql')) { if (!(Test-Path $file)) { throw "Generate $file before verification." } }
    $parts = '.local/cloud-migration'
    function Invoke-Sql([string]$body) {
        $path = Join-Path $root '.local/stage-02/migration-verification.sql'
        [IO.File]::WriteAllText($path, $body, [Text.UTF8Encoding]::new($false))
        $result = & $psql -X -w -v ON_ERROR_STOP=1 -q -f $path 2>&1
        if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }
    }
    $baseline = @(
        @('Accounts','20261006210202_ClientAccounts'), @('Access','20261006210211_CoachingDefaultFeatures'),
        @('ExerciseCatalog','20261005124810_InitialExerciseCatalog'), @('Training','20261005135233_HardenImmutableTriggerSearchPath'),
        @('Media','20261005125102_InitialMedia'), @('VideoAnalysis','20261005125107_InitialVideoAnalysis'), @('Coaching','20261006210339_InitialCoaching')
    )
    $stage1 = "BEGIN;`n" + (Get-Content infra/bootstrap-roles.sql -Raw).Replace(",'forms','offers','billing','checkins'",'') + "`nSET LOCAL ROLE trainflow_migrator;`n"
    foreach ($entry in $baseline) {
        $body = Get-Content "$parts/$($entry[0]).sql" -Raw
        $end = [regex]::Match($body, "(?s)INSERT INTO [^;]+?VALUES \('$($entry[1])', '[^']+'\);")
        if (!$end.Success) { throw "Missing generated full-history baseline fragment: $($entry[0])" }
        $stage1 += $body.Substring(0, $end.Index + $end.Length) + "`n"
    }
    $stage1 += "RESET ROLE; COMMIT;"
    $seed = @'
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
CREATE TABLE public.migration_preservation (table_name text PRIMARY KEY, rows jsonb);
DO $$ DECLARE name text; snapshot jsonb; BEGIN
FOREACH name IN ARRAY ARRAY['accounts.profiles','accounts.workspaces','accounts.user_roles','coaching."Relationships"','coaching."Groups"','coaching."Memberships"','coaching."StatusChanges"','coaching."MembershipChanges"'] LOOP
EXECUTE format('SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM %s t',name) INTO snapshot;
INSERT INTO public.migration_preservation VALUES(name,snapshot);
END LOOP; END $$;
'@
    $verify = @'
DO $$ DECLARE schema_name text; count_total int := 0; n int; row record; actual jsonb; BEGIN
FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins'] LOOP
IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname=schema_name AND nspowner=(SELECT oid FROM pg_roles WHERE rolname='trainflow_migrator')) THEN RAISE EXCEPTION 'Wrong owner: %',schema_name; END IF;
EXECUTE format('SELECT count(*) FROM %I."__EFMigrationsHistory"',schema_name) INTO n; count_total := count_total+n;
IF NOT has_schema_privilege('trainflow_api',schema_name,'USAGE') OR has_schema_privilege('trainflow_api',schema_name,'CREATE') THEN RAISE EXCEPTION 'Invalid schema grant: %',schema_name; END IF;
IF has_table_privilege('trainflow_api',format('%I."__EFMigrationsHistory"',schema_name),'SELECT') THEN RAISE EXCEPTION 'Runtime history access'; END IF;
END LOOP;
IF count_total<>22 THEN RAISE EXCEPTION 'Expected 22 histories, got %',count_total; END IF;
IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname IN ('accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins') AND c.relkind IN ('r','S') AND c.relowner<>(SELECT oid FROM pg_roles WHERE rolname='trainflow_migrator')) THEN RAISE EXCEPTION 'Wrong table/sequence owner'; END IF;
IF (SELECT cardinality(conkey) FROM pg_constraint WHERE conrelid='coaching."Services"'::regclass AND confrelid='coaching."Relationships"'::regclass)<>4 THEN RAISE EXCEPTION 'Service client owner FK missing'; END IF;
IF NOT EXISTS (SELECT FROM pg_index WHERE indexrelid='coaching."IX_Services_ApplicationId"'::regclass AND indisunique) OR NOT EXISTS (SELECT FROM pg_index WHERE indexrelid='billing."IX_orders_ServiceId"'::regclass AND indisunique) OR NOT EXISTS (SELECT FROM pg_index WHERE indexrelid='checkins."IX_Requests_ScheduleId_AvailableAtUtc_RelationshipId"'::regclass AND indisunique) THEN RAISE EXCEPTION 'Idempotency indexes missing'; END IF;
FOREACH schema_name IN ARRAY ARRAY['forms.versions','forms.submissions','forms.operations','offers.revisions','offers.revision_billing_options','coaching."ApplicationChanges"','billing.orders','billing.payments','billing.transactions'] LOOP
IF NOT has_table_privilege('trainflow_api',schema_name,'SELECT') OR NOT has_table_privilege('trainflow_api',schema_name,'INSERT') OR has_table_privilege('trainflow_api',schema_name,'UPDATE') OR has_table_privilege('trainflow_api',schema_name,'DELETE') THEN RAISE EXCEPTION 'Immutable grants invalid: %',schema_name; END IF;
END LOOP;
FOREACH schema_name IN ARRAY ARRAY['IX_Targets_GroupId_CoachId_WorkspaceId','IX_Targets_RelationshipId_CoachId_WorkspaceId','IX_Schedules_FormTemplateId','IX_Requests_FormVersionId','IX_Requests_RelationshipId_CoachId_WorkspaceId'] LOOP
IF to_regclass(format('checkins.%I',schema_name)) IS NULL THEN RAISE EXCEPTION 'Advisor FK index missing: %',schema_name; END IF;
END LOOP;
IF NOT has_table_privilege('trainflow_api','billing.renewal_failures','UPDATE') OR has_table_privilege('trainflow_worker','billing.orders','SELECT') THEN RAISE EXCEPTION 'Worker grants invalid'; END IF;
IF to_regclass('public.migration_preservation') IS NOT NULL THEN
FOR row IN SELECT * FROM public.migration_preservation LOOP
EXECUTE format('SELECT jsonb_agg((to_jsonb(t)-''Currency''-''SystemValues'') ORDER BY (to_jsonb(t)-''Currency''-''SystemValues'')::text) FROM %s t',row.table_name) INTO actual;
IF actual IS DISTINCT FROM row.rows THEN RAISE EXCEPTION 'Stage01 row changed: %',row.table_name; END IF;
END LOOP;
END IF;
END $$;
'@
    foreach ($scenario in @('rollforward','clean')) {
        $name = 'trainflow_stage02_' + $scenario + '_' + [Guid]::NewGuid().ToString('N')
        $env:PGDATABASE = 'postgres'; Invoke-Sql "CREATE DATABASE $name;"; $databases += $name; $env:PGDATABASE = $name
        if ($scenario -eq 'rollforward') { Invoke-Sql $stage1; Invoke-Sql $seed; Invoke-Sql (Get-Content .local/coaching-stage02.sql -Raw) }
        else { Invoke-Sql (Get-Content .local/supabase-initial.sql -Raw) }
        Invoke-Sql $verify
        Write-Output "$scenario verified: 11 owned schemas, 22 migration histories, constraints/indexes/runtime grants."
        if ($scenario -eq 'rollforward') { Write-Output 'Preserved 10 seeded rows across 8 stage01 tables; added exactly 11 migration histories.' }
    }
}
finally {
    $env:PGDATABASE = 'postgres'
    foreach ($name in $databases) { & $psql -X -w -q -c "DROP DATABASE IF EXISTS $name WITH (FORCE);" | Out-Null }
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key]) }
    Pop-Location
}
