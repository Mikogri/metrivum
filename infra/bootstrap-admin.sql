-- psql -v user_id=<existing Supabase UUID> -f infra/bootstrap-admin.sql
-- Run using the migration role after the user has requested /api/v1/me.
-- A catalog/access administrator receives no cross-owner access to private resources.
BEGIN;
INSERT INTO accounts.user_roles ("UserId", "Role")
SELECT "Id", role FROM accounts.profiles CROSS JOIN (VALUES ('CatalogAdmin'), ('AccessAdmin')) AS roles(role)
WHERE "Id" = :'user_id'::uuid
ON CONFLICT DO NOTHING;
INSERT INTO access.audit ("Id", "ActorId", "Operation", "Subject", "Change", "At")
SELECT gen_random_uuid(), "Id", 'bootstrap_admin', "Id"::text,
    '{"roles":["CatalogAdmin","AccessAdmin"],"source":"operational_script"}'::jsonb, now()
FROM accounts.profiles WHERE "Id" = :'user_id'::uuid;
COMMIT;
