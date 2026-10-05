-- Run as a database administrator before EF migrations. Set LOGIN passwords separately
-- with psql \password or your secret manager; never put passwords in this file.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trainflow_migrator') THEN
        CREATE ROLE trainflow_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trainflow_api') THEN
        CREATE ROLE trainflow_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trainflow_worker') THEN
        CREATE ROLE trainflow_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
END $$;

DO $$
DECLARE schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis'] LOOP
        EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION trainflow_migrator', schema_name);
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', schema_name);
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon', schema_name);
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON SCHEMA %I FROM authenticated', schema_name);
        END IF;
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO trainflow_api', schema_name);
        EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO trainflow_migrator', schema_name);
    END LOOP;
END $$;
GRANT USAGE ON SCHEMA media, video_analysis TO trainflow_worker;

-- Managed PostgreSQL administrators are not superusers. Set defaults as the owner.
-- The administrator must be allowed to SET ROLE trainflow_migrator.
SET ROLE trainflow_migrator;
DO $$
DECLARE schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis'] LOOP
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM PUBLIC', schema_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', schema_name);
    END LOOP;
END $$;
RESET ROLE;
