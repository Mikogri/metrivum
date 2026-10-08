# Query performance

Latest full audit and coverage: [2026-10-08 performance/security audit](performance-security-audit-2026-10-08.md). Earlier test totals below are historical checkpoints.

## Request budgets

Counts below exclude optional group/offer filter resolution. They are SQL command counts, not HTTP latency benchmarks.

| Existing, onboarded account | Before | After |
| --- | ---: | ---: |
| Coach identity + feature authorization | 13 | 4 |
| Analyze overview, business queries | 33 | 23 |
| Analyze financial section, business queries | 33 | 4 |
| Analyze clients section, business queries | 33 | 3 |
| Analyze acquisition section, business queries | 33 | 2 |
| Analyze check-ins section, business queries | 33 | 1 |
| Analyze training section, business queries | 33 | 0 |

`AccountContext` projects active/onboarded state, workspace and roles in one read. Existing accounts do not execute provisioning INSERTs. Missing accounts retain conflict-safe provisioning. `FeatureAccessService` loads assignment/configuration together, plus overrides and flags. Both caches are request-scoped and invalidated after their context saves changes; never promote them to singleton or cross-request caches. Public access snapshots still calculate usage and version hashes; internal feature checks skip that work.

Analyze section routes retain identity, feature, filter ownership, date and grouping validation. Finance uses grouping sets; invitation and messaging counters use conditional aggregation. The client series builds status intervals once, respecting version precedence and local-day boundaries. Module queries remain sequential because a request shares a connection.

## Messaging and notifications

- Name filtering runs in Accounts SQL over authorized peer IDs; matching never caps the candidate set before membership filtering. Only result IDs return to Messaging, which applies its existing sort and limit.
- The closed notification bell loads only its count; history and preferences load when opened.
- Connected SignalR uses 60-second safety polling; disconnected/reconnecting uses 15 seconds. Push handling and reconnect catch-up remain immediate. Account generation guards ignore stale callbacks.
- Message summaries and history share the connection-aware interval. The obsolete provider invitation poll was removed; invitation screens and durable notifications retain their own data sources.

## Indexes and verification

Three EF `QueryPerformanceIndexes` migrations add five indexes: pending/unread notifications, sent requests, coaching payment settlement dates and awaiting-payment due dates. The existing recipient request index remains sufficient. The reviewed atomic development export is `infra/query-performance.sql`; per-module EF migration history remains authoritative. It preserves application rows and grants and aborts on lock timeout.

Local `EXPLAIN (ANALYZE, BUFFERS)` on representative 120,000-row tables showed unread notification buffers 154 → 4, request search buffers 2308 → 131, and awaiting-dues buffers 110 → 16. These synthetic measurements are not production latency guarantees. Avoid adding overlapping indexes without checking query plans and write cost.

Regression coverage includes authorization command budgets, same-request invalidation, disabled accounts, concurrent onboarding, section isolation, currency-separated aggregates, DST/history boundaries, SQL name matching and realtime polling/account isolation.

Verified on 2026-10-08: 305 backend and 131 frontend tests passed, together with frontend type checking; two local Supabase Auth/Storage tests require services not configured for this run. Disposable PostgreSQL test databases must support Unicode case conversion (for example PostgreSQL 17 `LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`). Build the worker before startup tests; those tests also support `dotnet --artifacts-path` outputs.

All three migrations were applied to the owner-confirmed development project `atclvdkpbccafakzpwls`. Its five new indexes are valid/ready and owned by `trainflow_migrator`.

## Training delivery follow-up

- Schedule pages select only occurrence, assignment and execution summary fields. Neither prescription JSON snapshot is transferred or deserialized; detail endpoints retain both historical semantics and their full payloads. The training query budget remains two reads (count and page), excluding authorization.
- Action authorization checks only distinct relationships on the returned page, after the existing visibility filter. Empty pages do not trigger action checks.
- Closing an assignment supersedes eligible future workouts with one SQL UPDATE under the existing transaction and assignment lock. Started workouts remain available; no occurrence snapshots are loaded for this update.
- Revision refresh reads only the previous revision number for comparison, instead of its complete snapshot.
- Recipient preview does not invalidate coaching queries. Saving an assignment still refreshes active views.

Verified on 2026-10-08 with PostgreSQL command interception: schedule and closure no longer select `Prescription`. Regression tests cover mixed scheduled/executed rows, retained started workouts, concurrency, revisions and access boundaries. Browser tests confirm zero extra schedule requests for preview and a refresh after assignment on desktop and mobile. Validation: 11 training delivery integration tests, 144 frontend tests and 4 browser scenarios passed; frontend type checking and changed-file lint also passed. These are query/payload reductions, not measured production latency percentages. No migration is required.
