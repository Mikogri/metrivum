-- Read-only verification. No credential handling, DDL, DML, grants or migration execution.
\conninfo
BEGIN READ ONLY;
SELECT current_user = :'expected_role' AND current_database() = 'postgres' AS expected_identity \gset
\if :expected_identity
\else
  \echo 'ERROR: unexpected database identity; verification failed.'
  \quit 3
\endif

SELECT current_user, current_database(), current_setting('server_version') AS postgres_version;
DO $verify$
DECLARE schema_name text; history_oid oid;
BEGIN
    IF current_user NOT IN ('trainflow_api','trainflow_migrator','trainflow_worker') THEN
        RAISE EXCEPTION 'Unexpected verification role';
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname=current_user
        AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Application role has unsafe administrative attributes';
    END IF;
    IF current_user <> 'trainflow_migrator' THEN
        IF pg_has_role(current_user, 'trainflow_migrator', 'MEMBER')
            OR pg_has_role(current_user, 'postgres', 'MEMBER') THEN
            RAISE EXCEPTION 'Runtime role is a member of an administrative/migration role';
        END IF;
        FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins','calendar','messaging','notifications','client_documentation','integrations'] LOOP
            IF has_schema_privilege(current_user,schema_name,'CREATE') THEN
                RAISE EXCEPTION 'Runtime role can create objects in %',schema_name;
            END IF;
            -- Resolve through catalogs: name-based privilege checks require schema USAGE.
            -- A missing relation must fail, never silently pass via a NULL privilege result.
            SELECT c.oid INTO STRICT history_oid
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=schema_name AND c.relname='__EFMigrationsHistory' AND c.relkind='r';
            IF has_table_privilege(current_user,history_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                OR has_any_column_privilege(current_user,history_oid,'SELECT,INSERT,UPDATE,REFERENCES') THEN
                RAISE EXCEPTION 'Runtime role has migration history access';
            END IF;
        END LOOP;
        -- Attempt real forbidden reads, not just catalog checks. Permission failures are expected.
        BEGIN
            PERFORM 1 FROM auth.users LIMIT 1;
            RAISE EXCEPTION 'Runtime role unexpectedly read Auth users';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
    ELSE
        IF NOT pg_has_role(current_user,'trainflow_migrator','MEMBER') THEN
            RAISE EXCEPTION 'Unexpected migrator identity';
        END IF;
        IF NOT has_schema_privilege(current_user,'training','CREATE') THEN
            RAISE EXCEPTION 'Migrator is missing expected schema privileges';
        END IF;
        PERFORM 1 FROM training."__EFMigrationsHistory" LIMIT 1;
    END IF;
    IF current_user='trainflow_worker' THEN
        BEGIN
            PERFORM 1 FROM accounts.profiles LIMIT 1;
            RAISE EXCEPTION 'Worker unexpectedly read account profiles';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
    END IF;
END;
$verify$;
-- Actual allowed read for all three roles. No business rows are printed.
SELECT count(*) AS visible_analysis_jobs FROM video_analysis.jobs;
COMMIT;
\echo 'Identity, role attributes, scope and read-only access checks passed.'
