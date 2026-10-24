-- Run as the Supabase database administrator after Accounts migrations.
-- Runtime gets only a boolean check, never direct access to Auth users or session tables.
BEGIN;
-- Supabase's postgres can read Auth, but does not normally own the Accounts schema.
SET LOCAL ROLE trainflow_migrator;
GRANT CREATE ON SCHEMA accounts TO postgres;
RESET ROLE;
CREATE OR REPLACE FUNCTION accounts.auth_session_is_active(user_id uuid, session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
    WHERE s.id = $2 AND s.user_id = $1
      AND u.deleted_at IS NULL AND NOT COALESCE(u.is_anonymous, false)
      AND (u.banned_until IS NULL OR u.banned_until <= CURRENT_TIMESTAMP)
      AND (s.not_after IS NULL OR s.not_after > CURRENT_TIMESTAMP)
  );
$function$;
REVOKE ALL ON FUNCTION accounts.auth_session_is_active(uuid, uuid) FROM PUBLIC, anon, authenticated, trainflow_worker;
GRANT EXECUTE ON FUNCTION accounts.auth_session_is_active(uuid, uuid) TO trainflow_api;
SET LOCAL ROLE trainflow_migrator;
REVOKE CREATE ON SCHEMA accounts FROM postgres;
COMMIT;
