# Quality audit — 2026-10-09

Scope: the current working tree, including Client Details, Teams, messaging, notifications, billing, training and frontend account boundaries. Existing UI and APIs are retained; one bounded client-service summary endpoint is additive. No production deployment or push.

## Fixes and measured effects

| Priority | Root cause | Change / evidence |
| --- | --- | --- |
| P1 | Team ownership acceptance skipped the active Coach check | Reuse `RequireCoachAsync` before accepting a transfer; disabled accounts cannot change ownership. |
| P1 | Notification sockets were authorized only when opened | Recheck active/onboarded recipients in one Accounts projection per nonempty delivery batch. Disabled recipients are cancelled before policies/sends; a live-socket regression covers disabling after connection. |
| P1 | An editor save caller awaited only the current request | One promise covers the queued saves; navigation/publishing waits for queued revisions. |
| P1 | Workspace transitions survived account teardown | Check the account lifecycle after confirmations and asynchronous operations, before storage/state/navigation changes. |
| P1 | Dialog dismissal hid controlled content before the owner accepted closing | Delegate open state to React Aria and the caller. A rejected close must preserve draft state and keep the nested confirmation interactive. Browser regression reproduced an unclickable confirmation above a reopened drawer. |
| P1 | Client rows individually fetched full service pages | A bounded, authorized current-service projection replaces **20 service GETs with 1** for a 20-row page, in both list and card views. |
| P2 | Team access checks repeated assignment lookups per relationship | Batch assignments and reuse Team checks within a policy call, keyed by Team and representative. Fixture: **14 → 2 Coaching SQL commands** for 12 Team relationships. Revocation is rechecked on the next call. |
| P2 | Client name filtering materialized full account-directory entries | Reuse the Accounts SQL search contract before pagination. Fixture: **123 → 3 profile objects** for a three-row page. Literal `%` and `_` retain their meaning. |
| P2 | Notification publication repeated database-enforced uniqueness checks | Use the existing recipient/event unique index with `ON CONFLICT DO NOTHING`; **4 → 2 SQL commands**, retaining centralized preferences and caller transaction rollback. |
| P2 | Empty outbox polls still queried recipient preferences | Return immediately after an empty batch; **2 → 1 SQL commands** per empty delivery poll. DEV statistics showed 24,908 preference reads returning zero rows. |
| P2 | Removed chat memberships bypassed the capacity check | Check all inactive-to-active additions under the existing conversation lock; active additions remain idempotent. |
| P2 | Measurement conversion multiplied before validation | Validate source-unit bounds before multiplication; extreme decimals return validation errors instead of overflow/500. |
| P2 | Error mapping depended on EF exception wrapping | Normalize provider exceptions once; unique/FK violations have identical 409/400 contracts for `SaveChanges`, bulk operations and raw SQL, without disclosing database detail. |
| P2 | Formula cards/dialogs used separate cache paths | Share cancellable, account/version-keyed queries. Two cards plus opening the first editor: **3 → 2 detail GETs**. Preserve unsaved drafts during refresh. |
| P2 | Check-in trigger used a caller-controlled search path | Additive EF migration sets `pg_catalog`; applied to loopback test PostgreSQL and verified Supabase DEV. The trigger remains security-invoker. |

Command counts exclude transaction begin/commit and unrelated module authentication reads. They are repeatable integration/component-test assertions, not production latency estimates.

## Database evidence

Read-only `pg_stat_statements` and `EXPLAIN (ANALYZE, BUFFERS)` were inspected. Existing indexes serve scoped Billing due lists and CheckIns summaries. Local examples: due page 124 candidates/25 results (0.159 ms), check-in summary 802 scoped rows (0.261 ms), small training schedule 4 results (1.227 ms). DEV notification outbox had only 19 rows; its sequential scan is not evidence of a missing index. No speculative index or cache was added.

Analytics already aggregates in SQL and uses historical settlement fee/net snapshots. Reviewed private/Team/platform financial separation, unique clients, acquisition date boundaries and actual-workout progress. Existing definitions were preserved.

## Additive API

`GET /api/v1/coaching/services/current?relationshipIds=<uuid>&relationshipIds=<uuid>`

- Active Coach plus `coaching.services.manage`; at most 100 nonempty IDs.
- Every requested relationship must belong to the actor's Coach/workspace and pass historical-read policy. A foreign/missing ID rejects the whole request before billing is read.
- Returns `{ relationshipId, offerName, currentBilling }[]`, only for relationships with an Active service, selecting `UpdatedAt DESC, Id ASC`. Missing active services are omitted. No offer snapshots or full service pages.
- One and twenty requested relationships both use four Coaching commands plus one Billing command in the fixture. Existing detail endpoints retain broader permitted Team administrative behavior.

## Verification and limits

Focused regressions reproduced the original failures before implementation. Combined checks: **284 integration tests passed**, 2 external Supabase tests skipped; **206 unit + 2 architecture tests passed**; **227 web + 16 UI component tests passed**. TypeScript, ESLint, .NET solution build (zero warnings/errors), generated API contracts and 2 hosting tests passed. Production npm and all .NET package vulnerability checks reported no known vulnerabilities. Local evidence/logs are under ignored `.local/quality-audit/`; they are not required to understand the code.

**20 selected browser scenarios passed across desktop and mobile**: page rendering, workspace switching with drafts, Client Details and nested confirmation, private/shared documentation, suspended access, notification reads, assignment → client workout → coach progress, and optimistic-version conflicts. Eighteen passed in the combined run; the two training-flow cases passed on a focused rerun after updating stale UI selectors. Browser tests use API fixtures; real SQL, permissions and transactions are verified separately by the PostgreSQL integration suite. The entire browser suite was not run.

- No production-scale dataset or load test was available; small DEV timings must not be extrapolated.
- Dialog exit animations remain managed by React Aria/CSS while mounted. A caller that immediately removes its entire dialog can shorten the exit animation; dismissal no longer delays or overrides the caller's state decision.
- The final uninstrumented production frontend build passed, including public HTML, sitemap and SPA fallback. Earlier local prerender HTTP requests intermittently failed with an empty transport error. Direct SSR returned 200; diagnostic builds passed, and an IPv4-preview control was inconclusive. Original Vite config and preexisting local dependency patch were restored byte-for-byte; no speculative workaround was retained. Build transport reliability remains unconfirmed.
- Live Supabase Auth/JWKS rotation and object-storage access require dedicated credentials. Local JWT, role, resource-isolation, storage-boundary and worker tests cover their application mechanisms.
- Existing signed URLs remain usable until expiry (default 120 seconds); JWT validation does not immediately inspect revoked remote sessions. Stricter revocation needs an explicit latency/availability policy.
- Supabase still reports disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); enable it as part of production Auth configuration after confirming availability for the project plan.
- Remaining first-load fan-out includes formula definitions, group member previews and distinct exercise-name lookups. Private analytics retains its existing 10,000-relationship resolver limit. These need separate scale/contract work; this audit does not claim they are solved.
