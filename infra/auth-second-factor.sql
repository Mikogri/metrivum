-- Run as the Supabase database administrator after infra/auth-session-validation.sql.
-- Lets the API refuse a first-level (aal1) session of an account that has a verified second factor, so a stolen
-- password alone (or a session created before the second step) cannot reach application data.
-- Runtime gets only a boolean answer, never Auth factors, secrets or sessions.
BEGIN;
-- Supabase's postgres can read Auth, but does not normally own the Accounts schema.
SET LOCAL ROLE trainflow_migrator;
GRANT CREATE ON SCHEMA accounts TO postgres;
RESET ROLE;
CREATE OR REPLACE FUNCTION accounts.auth_session_meets_second_factor(user_id uuid, session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  -- Enum values are compared as text so newer Auth factor types cannot break the function.
  SELECT NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = $1 AND f.status::text = 'verified' AND f.factor_type::text IN ('totp', 'phone', 'webauthn'))
    OR EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id = $2 AND s.user_id = $1 AND s.aal::text = 'aal2');
$function$;
REVOKE ALL ON FUNCTION accounts.auth_session_meets_second_factor(uuid, uuid) FROM PUBLIC, anon, authenticated, trainflow_worker;
GRANT EXECUTE ON FUNCTION accounts.auth_session_meets_second_factor(uuid, uuid) TO trainflow_api;
SET LOCAL ROLE trainflow_migrator;
REVOKE CREATE ON SCHEMA accounts FROM postgres;
COMMIT;
