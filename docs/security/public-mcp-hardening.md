# Public MCP and abuse hardening — 2026-11-04

This is a code/configuration preparation stage, not approval to deploy or change provider settings.
See [Turnstile](turnstile.md), [distributed limits](distributed-abuse.md), [MCP](../integrations/mcp.md) and [hosting](../frontend/cloudflare-railway.md).

## Trust boundaries reviewed

- Auth goes directly to Supabase; API limits cannot protect those requests. Supabase must enforce CAPTCHA and its own Auth/email/IP limits. Client validation alone is bypassable.
- API JWT validation pins issuer, audience, signature algorithm and lifetime; every authenticated request checks the current Auth session. JWT user metadata does not confer Coach permissions. Second-factor enforcement is separately gated on the installed Auth helper and configuration.
- MCP tokens are isolated from REST and realtime by `client_id`; normal sessions cannot enter MCP without a validated OAuth client. Exact local consent, current domain roles/entitlements, token issue time and normal object-level authorization remain authoritative.
- User messages, plan text and check-in answers remain ordinary untrusted data. They cannot approve pending actions, add grants, choose arbitrary URLs/SQL or execute commands. Human approval uses an ordinary authenticated Metrivum session.
- Private uploads retain normal Media ownership, byte/signature validation and signed capabilities. Public R2 must contain licensed assets/installers only, never user media.
- Browser rendering uses React text escaping. The two `dangerouslySetInnerHTML` boot scripts are fixed developer-owned constants, not database/user text. Formula evaluation uses the existing parser rather than JavaScript eval.
- Multi-account state remains isolated by session lifetime. Account switching is not domain authorization; backend resource policies still apply.

These are traced boundaries and regression tests, not a claim that every vulnerability has been eliminated. ASVS authentication/session/access-control/input-validation/configuration boundaries and API Top 10 object authorization, broken authentication, resource consumption, sensitive business flows and unsafe integrations guide this review.

## Host changes

`Security:OriginToken` optionally requires an edge-to-origin credential on every route except exact `/health/live` and `/health/ready`. Configure a random 32–256 character secret through provider secret storage only. The edge must OVERWRITE `X-Metrivum-Origin-Token` with that value; never trust a client-supplied value. The API compares hashed values in constant time, rejects duplicate/missing headers and removes the credential before endpoint execution. The credential does not authenticate users and does not grant OAuth or domain permissions. This is disabled when unset for staged rollout.

No provider credential was generated or configured by this work. A custom host name or CORS alone cannot prevent direct Railway access. Configure `AllowedHosts` to approved names, but do not mistake it for edge verification: attackers can send a Host header.

API no-store/nosniff/frame/referrer headers now precede authentication and rate-limit middleware so ordinary denied responses receive the same baseline headers. MCP logs classify tool-level errors and oversized results as failures rather than successful calls. Logs contain operation identities/outcomes, not tool arguments, message bodies or access tokens.

## Production configuration and deployment order

1. Review additive migrations and export SQL. Back up and rehearse on disposable/staging PostgreSQL, including existing rows. Obtain separate approval before production DDL. Never run `--migrate` at startup.
2. Apply reviewed schema changes/grants through the restricted migrator workflow. Verify histories and least-privilege runtime access. Install distributed counters before enabling their enforcement; keep local limits as a fast first layer.
3. Deploy backend and compatible web. Keep MCP disabled and Supabase CAPTCHA enforcement off until all active clients are compatible. Native Auth compatibility is a release gate; do not strand existing mobile users.
4. Create Turnstile Managed widget for the actual web hostnames. Use public `VITE_TURNSTILE_SITE_KEY` in Pages and its secret only in Supabase CAPTCHA configuration. Follow the Turnstile staged flags and exact test checklist, then enable provider enforcement and verify direct Auth calls without tokens fail.
5. Supabase: review actual Authentication rate limits for password attempts, signup, OTP verification, resend and recovery; review email sending quotas against Resend. Enable Confirm email. Audit stale unconfirmed identities under an explicit retention policy; do not automatically delete them in this release. Review MFA helper/config, redirect allowlist and password policies. No arbitrary numeric provider setting is asserted as configured here.
6. Cloudflare: proxy the API custom domain, use Full (strict) TLS and HTTPS redirects, and review current plan WAF/rate-rule availability. Preserve POST/GET/DELETE/OPTIONS and streaming HTTP required by MCP. Do not issue browser-only challenges to legitimate MCP clients or globally skip WAF for `/mcp`. Free Bot Fight Mode cannot be skipped by a WAF rule and can challenge APIs; verify the account plan and choose compatible rules before enabling it.
7. If the plan supports an origin request-header rewrite, store/set the edge credential there, confirm it overwrites client headers, then set Railway `Security__OriginToken`. Verify direct Railway requests are refused, normal API/MCP succeed and health probes remain healthy. If unsupported, leave the option unset and record direct-origin exposure; do not pretend a hostname check solves it. Never put this secret in Pages/Vite/public code.
8. Do not cache authenticated API, MCP, OAuth, auth or signed private responses. Keep immutable caching restricted to content-addressed public assets. Verify CSP, CORS and referrer headers on actual Pages/API responses. Existing Pages CSP is partial (not a complete script allowlist); a strict nonce/hash script policy needs compatibility testing and must allow the Turnstile script/frame origin without `unsafe-eval`.
9. Railway: runtime API role only, VerifyFull TLS, bounded connection pool, request-body limits and verified trusted ingress addresses. Never blanket-trust forwarded headers or use them as origin proof. Start one replica until distributed admission/schema and reconnection tests pass. Alert on 429/5xx, latency, DB pool pressure, Auth email volume and denied OAuth calls without logging bodies/tokens. Verify database and Storage restores.
10. Supabase OAuth: enable the OAuth server only after backend/web deployment, configure the existing consent path and real registered callbacks, then enable MCP with exact resource `https://api.metrivum.com/mcp` and web `https://metrivum.com`. Test PKCE, client identity, grants, revocation and audience against the actual provider. A client display name is not platform verification. Missing resource claims under the provider's shared `authenticated` audience remain a provider verification limitation, not proof of resource-bound issuance.
11. Verify approved assignment/message flows using two separate coaches/clients, declined/expired/revoked approvals, stale versions, replay and switching browser accounts. No financial, cooperation termination, role/security administration or arbitrary network/SQL execution tool is allowed.

## Migration requested separately

CheckIns `ScheduleStatusIndex` adds `IX_Schedules_Status` on `checkins."Schedules" ("Status")`, PostgreSQL's default btree. It does not change rows. The existing `(Status, NextAvailableAtUtc, RetryAtUtc)` index already supports a Status prefix; the additional narrower index is explicitly requested, not a claimed measured speedup. Use production EXPLAIN/pg_stat_user_indexes before deciding long-term redundancy. Down removes only this index. No production migration is performed in this stage.

## Rollback

Disable MCP first if consent/approval verification fails. For CAPTCHA, turn OFF Supabase enforcement before reverting a compatible frontend (or use the documented staged bypass while enforcement is off). For origin enforcement, unset Railway `Security__OriginToken` before removing/changing the edge rewrite. Preserve additive schema/approval/receipt history; do not delete receipts or automatically reverse migrations after writes. Disable a failing new admission configuration only after evaluating the security impact and return to one replica. Revoke affected OAuth grants and rotate exposed credentials if compromise is suspected.

## Verification boundaries

Local tests cannot establish real provider enforcement, Cloudflare plan/rules, Railway network topology, TLS or actual assistant OAuth behavior. No production load/spam tests or provider configuration changes are part of this run. Final executed checks and skipped live checks are reported with the task result.

Sources: [ASVS](https://owasp.org/www-project-application-security-verification-standard/), [API Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/), [Supabase Auth limits](https://supabase.com/docs/guides/auth/rate-limits), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Cloudflare Bot Fight Mode limitations](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/).

Dependency check: npm production-tree audit returned 14 findings (3 high, 9 moderate, 2 low), rooted in the Expo/native tooling chain (including Zod 3). npm proposes an incompatible Expo major change; no forced override/SDK downgrade was made. Web runtime impact must be distinguished from tooling reachability; this remains an unresolved dependency gate, not a clean audit. Re-evaluate against the installed lockfile before release.

Generate reviewable per-module idempotent SQL with `./infra/export-security-hardening.ps1` (outputs in ignored `.local/security-hardening` with SHA-256). It generates scripts only, never applies them. The explicit baselines assume previous migrations are already present; compare actual target histories before approval. Apply Access before enabling distributed admission, plus Integrations and CheckIns; refresh reviewed runtime grants afterwards.

OAuth replay boundary: access tokens are bearer credentials, not sender-constrained DPoP tokens. Signature/issuer/audience/expiry, live session and consent checks, TokenNotBefore and idempotent approved writes reduce stale-token/action replay; they cannot distinguish a stolen still-active bearer token from its holder. Provider-supported sender constraints and resource-bound token issuance require separate live validation. Revoke the session/connection on suspected theft.

## Executed verification — 2026-11-05

[Machine-readable counters](public-mcp-verification.json) record 479 passing integration cases, zero failures and two explicitly skipped real local Supabase Auth/Storage cases, across 481 unique cases. Fresh-process batches avoid accumulated test-host memory; the final MCP approval run replaces its earlier results. The initial monolithic run was stopped at low system memory, not reported as a pass. Its four failures were resolved: explicit analytics contract-test request budget (production remains unchanged), current migration version/feature expectations, additive avatar response contract and removal of stale local configuration from build outputs. The worker startup cases passed after building their separate worker project.

Other checks: 418 unit tests, eight architecture tests, full Vitest 823 cases, final Auth lifetime regression file seven cases, and 24 Chromium desktop/mobile cases (12 Auth + 12 integrations) passed. The new concurrent revoke/assignment test permits only serialization before revocation or denial after it; delayed successful login cannot bind to a changed account lifetime. API/integration and worker builds and web production build/typecheck passed. Lint had zero errors and one existing hook dependency warning in `analyzer-jobs.tsx`. Secret-pattern scan covered 2228 source files without findings. NuGet API/transitive audit reported no vulnerable packages; the separate npm/Expo findings above remain open. No production migration, provider setting change, commit or push was performed.

The production web build was verified with the explicit staging CAPTCHA override and enforcement off; it does not establish real widget keys/server enforcement. Configure the public key (or deliberately stage with `VITE_AUTH_CAPTCHA_REQUIRED=false` while Supabase enforcement is off) before deployment. Native compatibility and real provider/Auth/Storage/OAuth/replay checks remain release gates. Read-only independent review found no additional important defect; concurrent assignment status/refresh races beyond the covered stale-state tests remain useful future soak coverage.
