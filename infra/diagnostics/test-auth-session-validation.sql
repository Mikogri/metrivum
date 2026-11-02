\set ON_ERROR_STOP on
-- Run only on a disposable local PostgreSQL cluster, in trainflow_auth_session_test.
DO $$ BEGIN
  IF current_database() <> 'trainflow_auth_session_test'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'An explicitly named disposable loopback database is required';
  END IF;
END $$;
CREATE ROLE trainflow_migrator;
CREATE ROLE trainflow_api;
CREATE ROLE trainflow_worker;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA accounts AUTHORIZATION trainflow_migrator;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email_confirmed_at timestamptz, deleted_at timestamptz, is_anonymous boolean, banned_until timestamptz);
CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users, not_after timestamptz);
GRANT USAGE ON SCHEMA accounts TO trainflow_api;
\ir ../auth-session-validation.sql

BEGIN;
INSERT INTO auth.users(id, email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000001', now());
INSERT INTO auth.sessions(id, user_id) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
SET LOCAL ROLE trainflow_api;
DO $$ BEGIN
  IF NOT accounts.auth_session_is_active('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Valid session rejected';
  END IF;
  IF accounts.auth_session_is_active('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Session accepted for another user';
  END IF;
  IF accounts.auth_session_is_active('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Missing session accepted';
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_table_privilege('trainflow_api', 'auth.users', 'SELECT')
    OR has_table_privilege('trainflow_api', 'auth.sessions', 'SELECT')
    OR has_function_privilege('anon', 'accounts.auth_session_is_active(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'accounts.auth_session_is_active(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('trainflow_worker', 'accounts.auth_session_is_active(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Auth privileges are too broad';
  END IF;
END $$;

DO $$
DECLARE change text;
BEGIN
  FOREACH change IN ARRAY ARRAY[
    'UPDATE auth.users SET email_confirmed_at=NULL',
    'UPDATE auth.users SET deleted_at=now()',
    'UPDATE auth.users SET is_anonymous=true',
    'UPDATE auth.users SET banned_until=now()+interval ''1 hour''',
    'UPDATE auth.sessions SET not_after=now()-interval ''1 second'''
  ] LOOP
    UPDATE auth.users SET email_confirmed_at=now(), deleted_at=NULL, is_anonymous=false, banned_until=NULL;
    UPDATE auth.sessions SET not_after=NULL;
    EXECUTE change;
    IF accounts.auth_session_is_active('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') THEN
      RAISE EXCEPTION 'Invalid session accepted after %', change;
    END IF;
  END LOOP;
END $$;
DELETE FROM auth.sessions;
DELETE FROM auth.users;
DO $$ BEGIN
  IF accounts.auth_session_is_active('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Deleted identity accepted';
  END IF;
END $$;
ROLLBACK;
SELECT 'Auth session validation checks passed' AS result;
