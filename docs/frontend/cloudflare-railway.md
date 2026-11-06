# Cloudflare Pages + Railway

Target: `https://metrivum.com` (static web), `https://api.metrivum.com` (API).
Provider projects, DNS, secrets and deployment are not provisioned by these files.

## Railway

Create an API service from this GitHub repository. Use the repository root as build context;
`railway.toml` selects the API Dockerfile and `/health/ready`. Start with one replica.
Deploy only the reviewed release commit on `main`; apply required additive migrations before deploying code that depends on them.
Never configure a migration pre-deploy/start command.

Configure service variables, never Git files:

| Variable | Value / boundary |
| --- | --- |
| `AllowedHosts` | `api.metrivum.com;<actual Railway hostname>` |
| `Cors__Origins__0` | `https://metrivum.com` |
| `Cors__Origins__1` | `https://www.metrivum.com` only if that origin serves the app |
| `ConnectionStrings__Database` | Restricted API role, session pooler, `SSL Mode=VerifyFull`; no Windows certificate path |
| `Supabase__Auth__ProjectUrl` | Intended production Supabase project URL |
| `Supabase__Auth__Audience` | `authenticated` |
| `Storage__Url`, `Storage__Bucket`, `Storage__SecretKey` | Intended private bucket and server-only credential (`sb_secret_` preferred; legacy `service_role` JWT also supported) |

The runtime image includes the public Supabase Root 2021 CA at `/app/certs/supabase-prod-ca.crt` (read-only, readable by `APP_UID`) and sets `PGSSLROOTCERT` for Npgsql. Keep `SSL Mode=VerifyFull`; the CA validates the production Session Pooler at `aws-1-eu-central-1.pooler.supabase.com:5432`. An explicit `Root Certificate` connection-string parameter overrides this environment default and must not contain a Windows path. Review the CA before its expiry on 2031-04-26.

Npgsql 10 may report missing `libgssapi_krb5.so.2` while probing optional GSSAPI credentials. It handles that failure and falls back to TLS; no Kerberos package is required. See [Npgsql security](https://www.npgsql.org/doc/security.html) and [connection parameters](https://www.npgsql.org/doc/connection-string-parameters.html).
Do not set `Trust Server Certificate`, weaken TLS, or place migration/admin database credentials in runtime variables.
Set any module-specific provider secrets separately after reviewing the existing local configuration keys.
Keep MCP disabled until its public URLs and OAuth consent have been configured.
Configure trusted proxy addresses only from verified Railway network details; never blindly trust arbitrary forwarded IP headers.

Add `api.metrivum.com` in Railway and apply exactly the DNS target/verification records Railway supplies.
Verify HTTPS, readiness, unauthenticated rejection, authenticated reads, uploads, realtime and local-analyzer pairing.
The API image does not contain Python/ML; local analysis remains on the user's computer.

## Cloudflare Pages

Create a Pages Git project for the same reviewed release branch, with repository root as root directory.
Use a Node version satisfying root `package.json` and npm 11.21.0.
Build command: `npx --yes npm@11.21.0 ci && npx --yes npm@11.21.0 run build && node apps/web/scripts/prepare-pages.mjs`.
Output directory: `apps/web/build/client`. With `PAGES_ASSET_ORIGIN`, the prebuild does not download or regenerate anatomy. Python 3 is required only when bundling anatomy locally without that variable, or explicitly generating a new asset release.

Set production build variables (public values only):

```text
VITE_API_URL=https://api.metrivum.com
VITE_SITE_URL=https://metrivum.com
VITE_SUPABASE_URL=<intended Supabase project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<public publishable key>
VITE_DEV_MOCKS=0
PAGES_ASSET_ORIGIN=https://assets.metrivum.com
```

No PostgreSQL password or Storage service/secret key belongs in Pages build variables.
Existing `_redirects` handles only SPA areas; `_headers` sets the baseline security headers.
`prepare-pages.mjs` adds a real top-level 404 and rejects files exceeding Pages' 25 MiB limit.
Create a public R2 bucket on `assets.metrivum.com` for public licensed anatomical assets and analyzer distributions only.
Upload the prepared `apps/web/public/anatomy/` and `apps/web/public/downloads/` trees preserving their paths.
Never upload user videos/private Supabase files to this public bucket. Configure R2 CORS for GET/HEAD
from `https://metrivum.com` (and www only if used), correct MIME types, and immutable caching only on hash-named objects.
Publish and verify the complete anatomy asset release before enabling `PAGES_ASSET_ORIGIN`; application builds deliberately do not depend on the upstream BodyParts3D server. To update model assets, run `npm run anatomy:prepare --workspace @metrivum/web` explicitly, verify them, then upload the complete output separately.

With `PAGES_ASSET_ORIGIN`, the preparation script removes only those generated build folders and creates
302 redirects to R2, preserving existing application URLs. Upload and verify R2 objects before publishing Pages.
Several analyzer runtime archives exceed 5 GB; use R2 multipart upload rather than a single PUT.
Check asset count and total build limits in the chosen Pages plan before publishing.

Add `metrivum.com` through Pages Custom Domains; follow Cloudflare's apex nameserver requirements.
Add `www` only with an intentional canonical redirect. Do not invent DNS target records before project creation.
Update Supabase Site URL and the exact callback/reset redirect allowlist for the production domain;
retain localhost only in the development environment. Configure production SMTP and test actual email flows.

## Release gates

Use the isolated production project (`metrivum-production`); never substitute the development project or import its demo identities/data.
Do not silently publish it as a production database. Apply reviewed migrations/grants explicitly.
Complete remaining dependency/security gates in `docs/security/hardening-2026-11-01.md`, verify database
plus Storage restore, and disable/publicly label simulated billing before accepting real customers.
Provider account access and final DNS values are needed to perform deployment and end-to-end verification.

Storage REST requests send opaque secret keys only through the `apikey` header; legacy JWT keys also use `Authorization: Bearer`. Keep `Storage__SecretKey` server-only. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Public-page production regressions: the night palette is global CSS (not a side-effect-only CSS module), and the shared LightRays container uses zero specificity so route geometry survives CSS chunk ordering. Pages SPA rewrites target `/__spa-fallback` without `.html` to avoid Pages canonicalization redirecting the browser away from the original route. After deployment, verify a fresh direct visit to `/auth/login` stays on that URL.

Public MCP/Auth rollout and origin protection: see [security release gates](../security/public-mcp-hardening.md). Provider configuration always needs separate approval.
