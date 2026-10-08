# Security model

## Identity and authorization

Supabase Auth owns credentials, email verification/OTP and sessions. TrainFlow accepts an asymmetric RS256/ES256 access token for the configured issuer/audience, a UUID subject/session, `role=authenticated` and `is_anonymous=false`. The configured JWKS endpoint is independent of untrusted token headers. Microsoft IdentityModel caches keys, refreshes periodically and rate-limits refresh after an unknown key. There is no symmetric fallback.

Business roles live in `accounts.user_roles`; `user_metadata` and JWT role claims do not grant application permissions. Each request checks account state. Onboarding requires accepted terms and a declared age of 18; this is not document-based identity verification. Private operations derive identity/workspace from the validated subject and query by owner. Missing and foreign private resources return the same 404.

Local JWT validation does not immediately revoke a Supabase token after logout. Keep the Supabase access-token lifetime short (for example 15 minutes), revoke Supabase sessions when appropriate and disable the TrainFlow account or remove its admin role for immediate application-level denial. Sensitive access administration rechecks database-controlled roles and account state on every request. TrainFlow does not maintain its own refresh-token/session store.

## Database boundary

All business tables belong to non-exposed schemas: `accounts`, `access`, `coaching`, `exercise_catalog`, `training`, `media`, `video_analysis`, `billing`, `forms`, `offers`, `calendar`, `checkins`, `messaging`, `notifications` and `client_documentation`. No PostgREST integration exists. Disable Data API in Supabase; accidental re-enabling is also constrained by revoked schema/table privileges for `anon` and `authenticated`.

The v1 tenant boundary is **API ownership checks plus private schemas and restricted database roles**. Initial migrations explicitly leave application-table RLS disabled. There are no per-user RLS policies and no claim of database row-level tenant isolation. A verified ASP.NET token does not populate `auth.uid()` in Npgsql. A stolen runtime database credential can access the application rows granted to that role; keep it server-side and rotate it after a compromise.

`trainflow_migrator` owns app DDL. `trainflow_api` has reviewed table privileges and cannot modify migration history or published revision content. `trainflow_worker` can read/update media and analysis jobs, read notification preferences/outbox and append notifications. None has superuser/BYPASSRLS/create-role/create-database. Startup rejects privileged API credentials and schema CREATE privileges. Managed `auth`, `storage`, and `realtime` tables are not migrated by this application.

Run `infra/bootstrap-roles.sql`, then EF migrations as the migrator, then `infra/runtime-grants.sql`. Runtime grants are explicit and must be reviewed for new tables. Create the first administrative role with `infra/bootstrap-admin.sql`; registration never creates an administrator. Catalog/access admins do not bypass resource ownership.

## Other boundaries

- JSON rejects unknown fields and explicit nulls for non-nullable reference fields before services run. Profile forms cannot set owner, role or entitlements.
- Feature entitlements, operational flags, dependencies and quotas are separate. DB decisions have no cross-request cache; flags/overrides apply across instances. Resource mutations reserve quotas transactionally.
- Stored programs and revisions remain readable after an advanced-editing capability is revoked. Import/copy/draft validation enforces the same feature rules as direct editing.
- Private responses use `Cache-Control: no-store`; explicit CORS origins are required. HTTP rate limits are per API instance; database reservations are global.
- Error responses contain stable `code` and `traceId` fields without SQL details. Logs omit tokens, private payloads and signed Storage URLs.
- Secrets are supplied through environment variables or .NET user-secrets. Real `.env`/local configuration files and test database credentials are ignored by Git.
- Frontend requests bind to account identity/generation before token use, refresh and response-body delivery. Cached idempotent responses also require current resource authorization on the server.

The [2026-10-08 audit](performance-security-audit-2026-10-08.md) records regressions, external-service checks, remaining operational boundaries and product decisions.

## Shared request and access rules

`RequestPreconditions` parses one positive, quoted numeric `If-Match` version for versioned module endpoints. Weak tags, lists, signs, whitespace inside quotes and nonpositive values cannot reach a write. Media/analysis retain their legacy `428 IF_MATCH_REQUIRED` response; other consumers retain `428 VERSION_REQUIRED` / `400 VALIDATION_FAILED`. The original profile PATCH keeps its exact ETag comparison and `PRECONDITION_REQUIRED` / `VERSION_CONFLICT` contract.

Training and check-ins pass explicit `RelationshipOperation` values to the existing coaching policy: historical reads, protected client writes and coach management remain distinct. Transaction locks, version checks and feature gates still run in their original order. Regression tests independently revoke each write permission while checking historical reads and unchanged persisted data.

## Stage 04 boundaries

Notifications are private-schema records scoped to the authenticated recipient. Domain publishers derive recipients from authorized membership; notification payloads contain event labels/source links, not message text, check-in answers or analysis content. Following a source link always uses its existing authorization. Read-all updates only the caller's records. Realtime clients use identity-scoped caches and restore authoritative state through REST.

Only the messaging and notifications SignalR transport paths accept query-string access tokens for WebSocket/SSE. Ordinary REST and negotiation still require the Authorization header. Connections close when authentication expires.

Platform checkout uses the authenticated coach, configured/versioned server prices and persisted dues. It shares the existing simulated payment pipeline, with unique settlement identities, locking and immutable financial history. A platform purchase is never coaching revenue. Free/Pro do not bypass role, ownership or resource-limit checks. No card PAN, CVC or expiry is collected.

Analyze obtains authorized aggregates from the owning modules through Contracts. Shared clients do not join coaches' finances, content or workspace records. Notification records and analytics aggregates are not exposed through Supabase Data API; runtime roles cannot create database objects.
