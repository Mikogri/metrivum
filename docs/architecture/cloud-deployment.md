# Cloud database deployment

Applied on 2026-10-05 after explicit user authorization.

- Organization/project: **Super Team / Metrivum** (`atclvdkpbccafakzpwls`).
- PostgreSQL: 17.11. Preflight found no existing application schemas or public tables.
- Supabase migration records: `20261005135119_trainflow_initial_backend` and `20261005135334_trainflow_harden_immutable_trigger_search_path`.
- EF remains the schema source of truth: all eight migration IDs are recorded in the six module-owned `__EFMigrationsHistory` tables.

## Applied structure

| Schema | Application tables |
| --- | ---: |
| `accounts` | 3 |
| `access` | 5 |
| `exercise_catalog` | 9 |
| `training` | 6 |
| `media` | 1 |
| `video_analysis` | 1 |

The 25 application tables and six history tables belong to `trainflow_migrator`. Seed data includes `v1-default` with 16 feature keys, 10 muscles and 9 movement patterns. No test users or business records were inserted.

## Verification

### Runtime schema access repair (2026-10-05)

Authenticated requests failed with PostgreSQL `42501` (`permission denied for schema accounts`): table grants existed, but runtime schema USAGE grants were missing. Applied `restore_runtime_schema_usage` as `trainflow_migrator`, granting API USAGE on all six application schemas and worker USAGE only on media/video_analysis. `infra/runtime-grants.sql` now restores these permissions explicitly when run as the schema owner.

Verified through the actual API pooler login: profile/workspace inserts, profile update, Coach role insertion and profile read succeeded in a transaction that was rolled back. No test records were retained. The earlier readiness check tested connectivity only and did not detect the missing schema permissions.

The privilege integration test also passed, including HTTP onboarding after deliberately revoking schema USAGE and restoring it through the runtime grant script. Bootstrap now switches to the schema owner before granting permissions, as required for the managed administrator without inherited owner privileges. Security advisor reported no database findings; its separate Auth warning was [leaked password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Initial deployment checks

- API/worker roles have no schema CREATE, superuser, BYPASSRLS, role-management or database-creation privileges, and no managed Auth/Storage/Realtime table grants.
- `anon` and `authenticated` have no application schema/table access. Tenant isolation remains the API ownership model described in [security](security.md).
- API cannot modify immutable revisions or migration history; worker can access jobs but cannot access profiles.
- All indexes and constraints are valid. Both Training migration records and the immutable trigger's fixed `search_path` were checked.
- Supabase security advisor returned zero findings after the hardening migration.
- The generated initial SQL was rehearsed transactionally on local PostgreSQL; the clean-migration/runtime-privilege integration test also passed after the managed-role bootstrap correction.

## Reproducing and continuing

`./infra/export-initial-database.ps1` generates an initial deployment bundle in ignored `.local/supabase-initial.sql`. It combines EF SQL, role bootstrap, default feature data and runtime grants. Execute it atomically as `postgres` **only on a database without the six application schemas**. It preserves EF history and refuses to initialize existing schemas. The Supabase administrator is granted SET (without INHERIT) on the migration role so objects are owned by that role.

For subsequent deployments, generate incremental SQL from each module's recorded EF migration ID, execute as `trainflow_migrator`, and keep the generated EF history inserts. Do not replay the initial bundle or maintain a second independent schema model.

The cloud `trainflow_api` role now has a generated runtime password. Local API configuration is stored in ignored `apps/api/Metrivum.Api/appsettings.Local.json`; it uses the IPv4 session pooler on port 5432, a pool limit of 10, and `SSL Mode=VerifyFull` with the Supabase CA certificate in ignored `.local/certificates/supabase-ca.crt`. Auth points to the Metrivum project. Neither credentials nor local configuration belong in Git.

Local startup was verified on 2026-10-05: `/health/live` and `/health/ready` returned 200, unauthenticated `/api/v1/me` returned 401, and CORS accepted `http://localhost:5173`. When moving to another machine, provision local secrets and obtain the [Supabase CA certificate](https://supabase.com/docs/guides/platform/ssl-enforcement) again; the certificate path in the connection string is machine-specific.

The worker password remains unassigned. Storage bucket/credentials, real Auth/Storage integration tests, and cloud application deployment remain separate steps; database migration does not deploy the API or an ML engine.
