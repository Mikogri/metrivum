# Query performance

Latest full audit and coverage: [2026-10-08 performance/security audit](performance-security-audit-2026-10-08.md). Earlier test totals below are historical checkpoints.

The [2026-10-20 read-path follow-up](read-efficiency-and-scaling.md) covers added pagination, Forms summaries, selected-tab Analytics measurements and current horizontal-scaling limits.

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

### 2026-10-20 paged team reads

Two additive `PagedTeamReadIndexes` EF migrations add four B-tree indexes:

- Coaching cases: `(TeamId, CreatedAt DESC, Id)`.
- Transfers: `(TeamId, CreatedAt DESC, Id)` and `(ClientId, CreatedAt DESC, Id)`.
- Billing memberships: `(TeamId, JoinedAt, UserId) WHERE Status = 'Active'`.

Existing status-first indexes cannot provide date ordering across all statuses. Keep them for status-filtered operations; keep existing unique and foreign-key indexes. The mixed date/ID directions match stable pagination. These indexes do not eliminate deep OFFSET cost or replace authorization.

The live Supabase Performance Advisor reported 65 unused-index notices and no missing-index notice on this development workload. This is insufficient evidence to delete integrity or infrequently used access indexes. New indexes were selected from actual query shapes following [Supabase index guidance](https://supabase.com/docs/guides/database/postgres/indexes).

Reproduce synthetic PostgreSQL 17 plans with `psql -v ON_ERROR_STOP=1 -f infra/paged-team-index-benchmark.sql` against a disposable local database. On 120,000 rows, first-page execution buffer accesses fell from 161 to 29 (team), 1376 to 29 (client), and 188 to 27 (active members). Plans changed from bitmap scans plus top-N sorts to ordered index scans reading 25 rows. These are synthetic plan measurements, not production latency guarantees. The benchmark uses temporary tables and rolls back.

`infra/paged-team-read-indexes.sql` is the atomic development export, guarded by exact module history, lock timeout and the migration role. EF migrations remain authoritative. Integration coverage checks migration rollback/reapply, preservation of existing indexes, stable page ties, roster compatibility and access isolation.

Applied on 2026-10-20 to the previously confirmed development project `atclvdkpbccafakzpwls` in Super Team. All four indexes are valid/ready and owned by `trainflow_migrator`; 12 focused PostgreSQL integration tests passed. The post-change Advisor reports only 69 informational unused-index notices, including the four new indexes before normal traffic has used them ([Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).

### Earlier indexes

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
