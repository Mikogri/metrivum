# Security model

## Identity and authorization

Supabase Auth owns credentials, email verification/OTP and sessions. TrainFlow accepts an asymmetric RS256/ES256 access token for the configured issuer/audience, a UUID subject/session, `role=authenticated` and `is_anonymous=false`. The configured JWKS endpoint is independent of untrusted token headers. Microsoft IdentityModel caches keys, refreshes periodically and rate-limits refresh after an unknown key. There is no symmetric fallback.

Business roles live in `accounts.user_roles`; `user_metadata` and JWT role claims do not grant application permissions. Each request checks account state. Onboarding requires accepted terms and a declared age of 18; this is not document-based identity verification. Private operations derive identity/workspace from the validated subject and query by owner. Missing and foreign private resources return the same 404.

Local JWT validation does not immediately revoke a Supabase token after logout. Keep the Supabase access-token lifetime short (for example 15 minutes), revoke Supabase sessions when appropriate and disable the TrainFlow account or remove its admin role for immediate application-level denial. Sensitive access administration rechecks database-controlled roles and account state on every request. TrainFlow does not maintain its own refresh-token/session store.

## Database boundary

All business tables belong to non-exposed schemas: `accounts`, `access`, `exercise_catalog`, `training`, `media`, `video_analysis`. No PostgREST integration exists. Disable Data API in Supabase; accidental re-enabling is also constrained by revoked schema/table privileges for `anon` and `authenticated`.

The v1 tenant boundary is **API ownership checks plus private schemas and restricted database roles**. Initial migrations explicitly leave application-table RLS disabled. There are no per-user RLS policies and no claim of database row-level tenant isolation. A verified ASP.NET token does not populate `auth.uid()` in Npgsql. A stolen runtime database credential can access the application rows granted to that role; keep it server-side and rotate it after a compromise.

`trainflow_migrator` owns app DDL. `trainflow_api` has reviewed table privileges and cannot modify migration history or published revision content. `trainflow_worker` can only read/update media and analysis jobs. None has superuser/BYPASSRLS/create-role/create-database. Startup rejects privileged API credentials and schema CREATE privileges. Managed `auth`, `storage`, and `realtime` tables are not migrated by this application.

Run `infra/bootstrap-roles.sql`, then EF migrations as the migrator, then `infra/runtime-grants.sql`. Runtime grants are explicit and must be reviewed for new tables. Create the first administrative role with `infra/bootstrap-admin.sql`; registration never creates an administrator. Catalog/access admins do not bypass resource ownership.

## Other boundaries

- JSON rejects unknown fields. Profile forms cannot set owner, role or entitlements.
- Feature entitlements, operational flags, dependencies and quotas are separate. DB decisions have no cross-request cache; flags/overrides apply across instances. Resource mutations reserve quotas transactionally.
- Stored programs and revisions remain readable after an advanced-editing capability is revoked. Import/copy/draft validation enforces the same feature rules as direct editing.
- Private responses use `Cache-Control: no-store`; explicit CORS origins are required. HTTP rate limits are per API instance; database reservations are global.
- Error responses contain stable `code` and `traceId` fields without SQL details. Logs omit tokens, private payloads and signed Storage URLs.
- Secrets are supplied through environment variables or .NET user-secrets. Real `.env`/local configuration files and test database credentials are ignored by Git.
