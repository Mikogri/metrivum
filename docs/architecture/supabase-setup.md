# Supabase setup

Use separate local/test/production projects and credentials. The identified cloud project is Metrivum in Super Team; no cloud migrations are run as part of API startup.

The Metrivum cloud database was initialized on 2026-10-05. See the [deployment record](cloud-deployment.md) before applying further migrations. For a fresh managed database, `infra/export-initial-database.ps1` prepares the complete initial SQL including the administrator's required SET-role grant.

1. In Auth, enable email confirmation and the required email/password and OTP flows. Configure SMTP before relying on production mail delivery. The frontend uses Supabase Auth for registration, password reset, OTP and refresh; Metrivum receives only the resulting access token.
2. Set the site URL and an exact redirect allowlist for each environment (local example `http://localhost:5173/auth/callback`). Never use a broad production wildcard. Configure email templates to match the callback flow.
3. Use asymmetric signing keys. The project inspected on 2026-10-05 exposes an ES256 key. For an older HS256 project, create/activate an asymmetric key, allow old sessions to expire or require sign-in again, then revoke the old key. This API deliberately rejects HS256.
4. Set `Supabase__Auth__ProjectUrl` and audience `authenticated`. Keys are read from `<project>/auth/v1/.well-known/jwks.json`; issuer is `<project>/auth/v1`. Coordinate key rotation with Supabase's edge cache and the API's five-minute configuration cache.
5. Disable the Data API. Keep all application schemas outside its exposed schema list. Auth/Storage continue through their dedicated APIs.
6. Use a direct PostgreSQL endpoint when IPv6 is available, or the session pooler on IPv4. Production Npgsql connection strings require `SSL Mode=VerifyFull`. Transaction pooler is not the supported default. Share one Npgsql data source per process; API pool is capped at 20 connections. Budget API and worker pools across all deployed instances.
7. Bootstrap restricted roles, set separate passwords securely and apply EF migrations using the migration credential. Apply reviewed runtime grants. Never use `postgres` as the API credential.
8. Configure a private Storage bucket and backend-only secret as described in the media guide. Do not grant blanket `authenticated` Storage policies. Large file bytes use a narrowly signed upload created after API authorization.

Configuration values and project URLs are not credentials. Database passwords and the Storage service secret must come from your secret store. A Supabase MCP connection does not itself supply these runtime secrets.

References: [Supabase JWTs](https://supabase.com/docs/guides/auth/jwts), [sessions](https://supabase.com/docs/guides/auth/sessions), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Data API security](https://supabase.com/docs/guides/api/securing-your-api), [ASP.NET bearer validation](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication?view=aspnetcore-10.0).
