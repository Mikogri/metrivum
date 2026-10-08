# Performance and security audit — 2026-10-08

This audit covers the current working tree, including Team organizations. It combines real PostgreSQL/HTTP integration, frontend request tests, browser workflows, dependency advisories and development Supabase smoke checks. It is not a proof that every vulnerability or concurrency interleaving has been eliminated.

## Implemented changes

| Path | Before | After | Evidence |
| --- | --- | --- | --- |
| Chat membership authorization | 2 SQL reads | 1 joined read | Messaging command interceptor |
| Conversation detail | 9 module reads | 6 | Authorization/roster reuse; current membership remains checked |
| Empty message history / conversation list | 4 / 3 reads | 2 / 1 | Skip unrelated attachment/roster queries |
| Exercise detail | 5 reads | 4 | Favorite projected with parent; split child collections retained |
| Analysis comparison | 4 reads, duplicate result transfer | 1 read | Both owner checks precede completion-state errors |
| Analysis metadata | Full row including potentially 8 MiB result | Metadata projection | Result omitted from SQL, including update/cancel/replay lookups |
| Media read/open | 2 owned-row reads | 1 | Actual storage bytes/type and purpose still validated |
| Team overview, one Team | 2 HTTP requests | 1 | Roster fetched only for Members/Clients tabs |
| Concurrent token refresh, same account | 2 refreshes | 1 | Per-account in-flight promise; accounts remain isolated |
| Request delayed across account switch | Could send/refresh/return stale data | Rejected at each asynchronous boundary | Real transport/session-manager regressions |

SQL counts exclude Accounts/Access unless stated. These are measured query/request reductions, not production latency percentages. No cross-request authorization cache or parallel queries on a shared EF connection were introduced.

`20261008173117_MessagingReadIndexes` adds `messaging.Blocks(BlockedUserId)` for the reverse half of the symmetric block filter. On a synthetic 120,000-row table, buffers fell from 1,000 to 26 and a sequential scan became BitmapOr. Reproduce with `infra/diagnostics/messaging-block-search-plan.sql`. The existing primary key covers the forward half. Other indexes were retained; empty development tables do not justify removing indexes reported as unused.

## Reproduced defects and fixes

- **Expired Team write bypass:** reviewing/cancelling check-ins used historical-read authorization. Mutations now require the Team write policy; permitted history remains readable.
- **Revoked access on idempotent replay:** retrying an existing training assignment could return its batch after relationship access was revoked. Replay now rechecks every persisted relationship before returning it.
- **Account-switch races:** token lookup, refresh and response-body completion could outlive the account view. Requests verify generation/identity before sending and returning; token acquisition also verifies the actual SDK user before a deferred auth event arrives.
- Browser verification caught a StrictMode effect-replay regression in the new guard. Account controller reactivation now runs before descendant query effects; a real SessionManager/React Query regression proves one successful initial request without weakening stale-account checks.
- **Malformed JSON:** explicit nulls in required reference fields could reach services and fail as server errors. ASP.NET JSON binding now respects nullable annotations and rejects them with 400 before database access. Optional nullable fields remain supported.
- **Malformed preview URLs:** invalid percent encoding and invalid request targets could terminate the Node preview server. They now return 404 and subsequent requests still succeed; the new Node regression runs in frontend CI.
- **MOV admission mismatch:** upload validation accepted QuickTime, while analysis admission accepted only MP4/WebM. Validated MOV files can now enter the queue. This does not assess the ML model's accuracy.

Each implementation defect has a regression observed failing before the fix. An independent review checked the database projection and frontend identity changes.

## Integration and security coverage

| Area | Exercised boundaries |
| --- | --- |
| API/Auth | Every registered business/OpenAPI route rejects anonymous requests; REST rejects query-string tokens; invalid signature, issuer, audience, lifetime, role, subject/session, anonymous and rotated keys; null DTO fields |
| Accounts/access | Disabled accounts, concurrent onboarding, untrusted metadata, role/feature changes and request-local cache invalidation |
| Team/coaching | Foreign Team identifiers, membership/capacity/owner transitions, client consent, scope separation, lifecycle cleanup, stale versions, expired-Team mutations and revoked-access retries |
| Billing/offers/forms | Server-owned amounts/sellers, repeated payment returns one settlement, changed-payload idempotency conflict, concurrent operations, immutable history, foreign acceptance/publish and stale acceptance ETags |
| Documentation | Private/shared/private transitions, client/stranger/admin boundaries, stale share versions, feature revocation, suspension, cross-relationship files; denied requests never reach URL signing |
| Messaging/notifications | Membership/history cutoffs, blocking, message ownership/tombstones, attachments, replay, read/unread and realtime/polling account isolation |
| Training/calendar/check-ins | Frozen prescriptions, partial/started workouts, stale revisions, assignments, permission changes, scheduling/timezones and lifecycle closure |
| Media/analysis | Foreign-file denial, disguised bytes/size mismatch, concurrent quotas, delayed deletion, idempotent admission, transaction rollback, lease reclaim/cancellation fencing and bounded results |
| Frontend | Account switching/late responses, concurrent refresh, lazy roster, existing components and browser workflows; malformed real preview-server requests |

Backend: **188 unit + 254 integration + 2 architecture tests passed**, build with zero warnings/errors. Two optional loopback Supabase tests remain skipped because local Supabase Auth/Storage is unavailable. Separate real development checks below cover the external services without removing those tests' loopback safeguards.

Frontend: **159 Vitest + 2 Node hosting tests passed**; all workspace type checks, full ESLint (plus changed-file recheck after the StrictMode fix) and production build passed. **96 browser scenarios passed**: 18 public-site and 78 application workflows, covering desktop and mobile.

## Development Supabase verification

- Target: owner-confirmed development project `atclvdkpbccafakzpwls`; no production mutation.
- Index migration clean install, upgrade, down/up, row/grant preservation and migrator ownership passed in a disposable local database. Development migration applied using the existing `trainflow_migrator` role; index valid/ready, EF history recorded, rows preserved.
- Runtime/migrator/worker roles have no superuser, BYPASSRLS, CREATE ROLE or CREATE DATABASE. No `anon`, `authenticated` or PUBLIC table grants were found in the checked business schemas.
- Actual `trainflow_api` connection passed Team insert/update/read with deferred constraints and messaging insert/reverse lookup. Both fixtures rolled back; runtime migration-history writes remain forbidden.
- Real private Storage smoke: PNG/PDF/MP4/WAV signed upload/read passed; overwrite and public reads denied; only this run's generated objects were removed.
- Real Supabase password sign-in and asymmetric JWKS were accepted by the running API; absent/tampered JWTs rejected. `infra/diagnostics/development-auth-smoke.py` creates and removes one random Auth fixture without email or TrainFlow business records.
- npm and NuGet (including transitive dependencies across 35 projects) reported no known advisories at audit time. A known-secret scan of non-ignored files under 2 MB found no matches for the configured private database/Storage secrets. This is not a complete historical-secret or supply-chain audit.
- Rebuilt and restarted the local API after verification; `/health/ready` and a fresh real Auth/JWKS smoke passed on the updated runtime.

## Remaining boundaries and product questions

1. Which Team screens should retain read-only history after subscription expiry? Calendar/case gates currently differ from Training/check-ins. Should completing outstanding services remain allowed to resolve obligations?
2. Is the short validity window of already-issued document URLs acceptable after unsharing/suspension, or is immediate revocation required? New URL requests recheck permissions; existing Storage capabilities expire naturally.
3. Must Supabase logout revoke existing access JWTs immediately? Current local validation accepts them until expiry; TrainFlow account disablement is checked by business operations.
4. What infrastructure guard should cap analysis backlog/concurrency fairly while Free retains all features? The existing default intentionally leaves per-owner admission uncapped; per-instance HTTP limiting is not a global abuse budget.

Supabase's security advisor still reports **leaked-password protection disabled**. Enable it before public onboarding; see [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No Auth settings were changed during this audit.

Browser business flows use controlled API fixtures; PostgreSQL HTTP tests and the development Auth/Storage smokes provide separate real integration evidence. Real card charging, SMTP delivery, GPU/model accuracy, production load/distributed denial-of-service and exhaustive state-space exploration were not tested. Business schemas intentionally rely on API ownership plus restricted server roles, not per-user RLS; a stolen runtime database credential remains a broad compromise.

Machine-specific logs/TRX/query plans are under ignored `.local/audit-20261008`. Human-facing architecture and policies remain in `security.md`, `query-performance.md` and `../coaching/team-organizations.md`.
