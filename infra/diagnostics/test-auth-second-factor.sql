\set ON_ERROR_STOP on
-- Run only on a disposable local PostgreSQL cluster, in trainflow_auth_mfa_test.
DO $$ BEGIN
  IF current_database() <> 'trainflow_auth_mfa_test'
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
-- The shape of Supabase Auth's tables and enums, reduced to the columns the function reads.
CREATE TYPE auth.aal_level AS ENUM ('aal1', 'aal2', 'aal3');
CREATE TYPE auth.factor_type AS ENUM ('totp', 'webauthn', 'phone');
CREATE TYPE auth.factor_status AS ENUM ('unverified', 'verified');
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users, aal auth.aal_level);
CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users, factor_type auth.factor_type, status auth.factor_status, secret text);
GRANT USAGE ON SCHEMA accounts TO trainflow_api;
\ir ../auth-second-factor.sql

BEGIN;
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
INSERT INTO auth.sessions(id, user_id, aal) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aal1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'aal2');
SET LOCAL ROLE trainflow_api;
DO $$ BEGIN
  IF NOT accounts.auth_session_meets_second_factor('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'A first-level session without any factor was refused';
  END IF;
END $$;
RESET ROLE;
INSERT INTO auth.mfa_factors(id, user_id, factor_type, status, secret) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'totp', 'unverified', 'test-only');
SET LOCAL ROLE trainflow_api;
DO $$ BEGIN
  IF NOT accounts.auth_session_meets_second_factor('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'An unfinished setup locked the account';
  END IF;
END $$;
RESET ROLE;
UPDATE auth.mfa_factors SET status = 'verified';
SET LOCAL ROLE trainflow_api;
DO $$ BEGIN
  IF accounts.auth_session_meets_second_factor('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'A first-level session passed although the account has a verified factor';
  END IF;
  -- Another user's second-level session must not count for this user.
  IF accounts.auth_session_meets_second_factor('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'A foreign second-level session was accepted';
  END IF;
END $$;
RESET ROLE;
UPDATE auth.sessions SET aal = 'aal2' WHERE id = '20000000-0000-0000-0000-000000000001';
SET LOCAL ROLE trainflow_api;
DO $$ BEGIN
  IF NOT accounts.auth_session_meets_second_factor('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'A second-level session was refused';
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_table_privilege('trainflow_api', 'auth.mfa_factors', 'SELECT')
    OR has_table_privilege('trainflow_api', 'auth.sessions', 'SELECT')
    OR has_function_privilege('anon', 'accounts.auth_session_meets_second_factor(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'accounts.auth_session_meets_second_factor(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('trainflow_worker', 'accounts.auth_session_meets_second_factor(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Auth privileges are too broad';
  END IF;
END $$;
ROLLBACK;
SELECT 'Auth second-factor checks passed' AS result;
