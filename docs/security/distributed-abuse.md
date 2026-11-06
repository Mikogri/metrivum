# Distributed application admission

This supplements [the existing policy inventory](stage-01.md). Public API writes and selected costly owning-service operations now use the existing `IAbuseProtection` policy names with asynchronous admission. Local .NET limiters still reject bursts before a database round trip; Access owns the shared technical counters in its private schema.

## Invariants and coverage

`access.abuse_windows` contains one row per verified user and registered operation policy. An atomic conditional PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` spends a permit only if the shared budget permits it. API replicas and restarts cannot each obtain a fresh allowance. A supplied OAuth client ID, object ID, tab, account workspace or arbitrary scope does not create a separate user allowance. The stricter shared user budget deliberately aggregates all authorized OAuth clients; the MCP transport additionally applies its existing user/client partition.

Fixed windows begin with the first accepted call. Message budgets retain the existing burst capacity and periodic refill. The database uses its own timestamp rather than an API instance's clock. Concurrent conflicting admissions serialize on the unique owner/policy row; no caller controls policy names. Admission uses a separate autocommit command, so invalid operations, downstream failures and business rollbacks cannot refund permits. Existing domain idempotency checks remain before the message/check-in/duplicate-form service admission where they were already present. Generic HTTP admission and MCP tool admission charge attempts, including idempotent transport retries.

| Shared admission | Defaults |
| --- | --- |
| Ordinary authenticated HTTP writes | 90/minute |
| MCP tool reads / writes | 60/minute / 15/minute, shared by all clients of the user |
| Message send, introduction and nonhistorical coaching card | Burst 40; refill 30/minute |
| Invitation / form share / application start | 15/hour / 15/hour / 10/hour |
| Program create/copy/import/generation / draft save / exports | Existing 30/hour / 120/minute / 20/hour policies |
| Form create/update/duplicate, all purposes | 120/hour; check-in creation/duplication also 30/hour |
| Offer create/update | 60/hour |
| Check-in schedule target changes / answer submission | 60/hour / 10/hour |
| Analytics scope resolution | 60/minute |
| People/exercise/discovery search | 60/minute shared across these services |
| Upload capability / signed download generation | 30/hour / 120/minute |
| Existing simulated payment confirmation | 10/minute; unchanged domain idempotency/authorization |

All values remain configurable under `AbuseProtection:Policies:<policy>`. Policy names and semantics are startup validated. Rejections use the existing `RATE_LIMIT_EXCEEDED` HTTP 429 mapping and positive `Retry-After`; the shared store returns a conservative full policy window, not an exact remaining-window estimate. Callers should wait for that delay before retrying. Ordinary reads, anonymous HTTP, hub frames/connections and the overall global HTTP budget remain local. Health and CORS preflight retain their existing exemptions.

The separate rate-admission pool permits four PostgreSQL connections per API replica; the independent running-operation pool permits eight. Both have a three-second connection timeout and five-second command timeout. Budget these in addition to the host's application pool and worker pools. This avoids deadlock when domain admission runs while `ModuleTransaction` holds an application-pool connection. Do not parallelize work on `ModuleTransaction.Connection`. Store failures propagate and reject the operation; there is no automatic local-only fallback. `AbuseProtection:DistributedEnabled` defaults to true. Set it false only in explicit isolated tests or an approved, temporary rollback to a single replica.

## Existing durable safeguards

Reuse remains deliberate: stranger-contact and group ledgers in Messaging, Media pending/global/daily storage reservations, analysis queue admission and business idempotency/version/ownership checks remain authoritative. No second ledger replaces these rules. Identical retries cannot create duplicate messages, plan assignments, form copies or analysis jobs through this limiter; that guarantee belongs to their owning transaction and unique keys.

Export concurrency now uses transaction-scoped PostgreSQL advisory slots per user/policy (two by default), in addition to the local lease. The Access store holds its independent transaction until actual export disposal, which works through transaction poolers; no session advisory lock is used. A separate local eight-operation cap prevents the lease pool starving rate counters. Pool exhaustion returns 429 and connection failures reject without a local fallback. Database restart/connection loss releases server locks; a successful HTTP response still does not imply automatic retry is safe.

Export CSV/PDF renderers are synchronous and cannot interrupt rendering with a cancellation token. Releasing an operation lease merely when the request cancels would let unfinished renders exceed the cap, so it stays held until the real operation exits and disposes it. Acquisition is bounded/cancelable; no expiry timer pretends to stop synchronous CPU work. Configure external idle-transaction policies with this behavior in mind and investigate hung renders before increasing replica counts. Hub connections remain process-local. MCP retains its request timeout and bounded input/output. These guards do not protect database CPU against every simultaneously admitted user: retain provider ingress limits and measured DB/worker capacity. The existing durable analysis queue coordinates server analysis admissions. No production load or replica soak test is claimed.

## Migration and deployment

1. Review/export Access migration `20261104194425_DistributedAbuseAndAssignmentFeature`. It adds only the counter table/index and the separately documented MCP assignment feature grant. Confirm the exact development/production target and migration history. Apply through the existing guarded migration process as `trainflow_migrator`, with separate production approval; never at API startup.
2. Apply/review `infra/runtime-grants.sql` through that same controlled process. The table is private: API gets SELECT/INSERT/UPDATE/DELETE; browser roles, PUBLIC and the worker receive no access. Verify the existing private Access schema grants and ensure it is not added to Supabase's exposed schemas.
3. Deploy the API with distributed admission enabled and the restricted API role. Exercise two local/staging instances against the same disposable DB and confirm the aggregate cap and `Retry-After`. Monitor database errors, pool waits, rejection rates and legitimate repeated operations before increasing replicas.
4. Counter storage is bounded by active user/policy pairs rather than by requests. Retire inactive rows through an operator-owned maintenance task, conservatively older than 25 hours; no registered fixed window exceeds 24 hours. Example, only after target/role review: `DELETE FROM access.abuse_windows WHERE "WindowStart" < CURRENT_TIMESTAMP - INTERVAL '25 hours'`. Deleted-account rows may be removed by maintenance. No production scheduler has been configured.

Rollback: restore the previous API release while leaving this additive table/migration in place. If disabling distributed admission is needed temporarily, first return to one replica and retain the existing local/edge controls. Deleting recent counters or rolling back the table resets protection and is unnecessary. Re-enable distributed admission before scaling out.

## Provider boundaries requiring live verification

Supabase Auth signup, password/OTP login, recovery and resend requests go directly to Supabase; the API's counters cannot enforce those routes. Review the actual project's Auth rate-limit values and SMTP/Resend quota, verification/resend cooldowns and anti-enumeration behavior. Enable Supabase's native Turnstile CAPTCHA only after compatible web and mobile clients are deployed and verified. Do not assume a local API limiter protects direct Auth traffic. See [Supabase Auth limits](https://supabase.com/docs/guides/auth/rate-limits) and [native CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

Cloudflare must enforce volumetric/ingress protection without globally exempting `/mcp` from WAF. Railway's direct origin must not provide an unprotected alternate ingress. Configure only verified ingress proxies; forged CF/X-Forwarded headers must not choose an identity. DNS/proxy state, plan entitlements, WAF rules, origin restrictions, SMTP quotas and production alerts are provider configuration work; none were inspected or changed by these tests. See the production hardening runbook for concrete deployment settings.

## Verification

`DistributedAbuseTests` creates random temporary databases only on an explicit loopback PostgreSQL server. It tests simultaneous admission over independent store/limiter instances, restart persistence, aggregation across client scope strings, user/operation isolation, failed business rollback, window expiry, refill/burst behavior, long elapsed periods, HTTP 429/Retry-After over two hosts, distributed export lease disposal/cancellation and operation-pool saturation without counter starvation. `AbuseProtectionConfigurationTests` additionally verifies missing/unavailable stores fail closed and explicit isolated test mode works. Existing Messaging, Media, MCP and HTTP tests exercise their other authorization/idempotency callers. The PostgreSQL atomicity used here is documented by [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html).

These tests do not prove production connection budgets, live provider settings, real-device behavior or volumetric DDoS resistance.
