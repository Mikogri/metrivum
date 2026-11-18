# Query performance

Latest full audit and coverage: [2026-10-08 performance/security audit](performance-security-audit-2026-10-08.md). Earlier test totals below are historical checkpoints.

The [2026-10-20 read-path follow-up](read-efficiency-and-scaling.md) covers added pagination, Forms summaries, selected-tab Analytics measurements and current horizontal-scaling limits.

## Request budgets

### Formula and check-in read consolidation (2026-11-18)

- Formula lists accept optional `includeDefinitions=true`. Card views request the current definitions in the same paginated response; autocomplete and ordinary lists retain the lightweight default. Older APIs remain supported through per-card detail fallback.
- Formula consumers share account/id/version query keys and fetch that exact version. Card definitions seed the same cache used by editing; inline cells and pickers reuse it. Switching list shape does not reuse lightweight placeholder rows as full cards.
- Assignment schedule updates aggregate last-issued dates for all locked schedules in one query, preserving the assignment-before-schedule lock order and existing transaction. No matching schedules means no request-date query.
- Favorite changes invalidate exercise lists and the changed detail only, preserving dictionary, tag and history caches.
- Applying a plan revision invalidates the Training cache once instead of overlapping parent/child invalidations. Calendar list assembly groups attendees once by event; client roster filtering still happens in SQL before grouping.

Regression coverage checks HTTP ownership and list shape, pinned-version/account cache isolation, request deduplication, old-server fallback and actual PostgreSQL command counts. These are request-count improvements, not measured production latency claims.

The follow-up removed unreferenced former marketing components (`FeatureSection`, `PageFlow`, `Bento`, `HeroBurst`, `Workflow`) and their exclusive styles, plus the unused web `useMediaQuery` hook. Route/import resolution and repository reference searches confirmed no consumers. Legacy compatibility and migration tests remain; the formula refresh test now checks updated card content and list cancellation signals instead of asserting over an empty detail-request collection.

Positive Playwright session fixtures explicitly mark their test email confirmed, matching the current session guard. Missing confirmation previously redirected library-view smoke tests to sign-in rather than exercising their intended screens; production Auth rules are unchanged.

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

## Canonical coach Discovery (2026-10-25)

Five additive EF migrations add the taxonomy and eight query/FK indexes. `SpecializationCode, CoachId, IsPrimary` supports canonical matching; `Specializations.CategoryCode` and the full transfer relationship index cover foreign keys. Accounts uses a partial active/onboarded username prefix index with `varchar_pattern_ops`. Offers uses a partial published coach/card index. Billing indexes team request history (`TeamId, Kind, CreatedAt, Id`) and invitation admission counts (`InviterId, CreatedAt`). The full video-share index (`AnalysisId, RevokedAt`) also covers FK checks for revoked shares, which the existing active-only unique index cannot cover. Existing integrity and filtered indexes remain intact.

Selection matching and deterministic ordering happen in SQL before pagination. Text searches resolve against the bounded 27-item dictionary; they do not repeatedly normalize every coach link. Empty result paths skip downstream modules. Billing priority uses one UNION read, identity role mapping uses one lookup, and showcase client counts share an aggregate. Web text filters debounce for 250 ms without delaying discrete choices.

`DiscoveryReadEfficiencyTests` checks SQL command budgets and EXPLAIN plans on disposable 25,000-row temporary tables. Prefix matching reduced discarded rows from 24,990 to zero; published-offer matching reduced them from 24,967 to zero, using the expected indexes. These are synthetic plan measurements, not production latency guarantees. Small development tables may correctly use sequential scans. Index selection follows [Supabase query optimization guidance](https://supabase.com/docs/guides/database/query-optimization); indexes are not added indiscriminately.

`infra/diagnostics/discovery-performance.sql` inventories full foreign-key coverage, indexes and table counters without reading personal data. Cross-module candidate UUID batches remain a scaling boundary to measure on a realistic directory before introducing a separate search projection.

Applied to the previously confirmed development project `atclvdkpbccafakzpwls` on 2026-10-25. All eight indexes are valid/ready, migration histories have no pending source migrations, and the full-FK diagnostic reports no uncovered foreign keys across the 16 checked application schemas. Runtime dictionary reads succeed; history UPDATE and worker access to coach selections remain denied. The running API was not restarted.

## Access policy and shared account reads (2026-11-02)

Access configuration, assignment, overrides and flags are loaded in one parameterized PostgreSQL statement and one MVCC snapshot instead of three round trips. The snapshot remains request-scoped; session revocation, account state and subsequent permission changes are not positively cached across requests. Existing Access integration tests cover policy changes and cross-account isolation on disposable PostgreSQL.

The web uses an account-scoped resource key for team context, personal subscription and the plan catalog. Coach/Client presentation changes reuse these responses; role-dependent resources keep separate keys. Quota context uses the same team-context key as the app shell. Existing account-wide and resource-specific invalidation prefixes are retained. QueryClient tests verify request deduplication, account isolation, pagination separation and invalidation.

These changes do not alter production regions, create indexes, add a navigation-summary endpoint or narrow default mutation invalidation. Production latency gains must be measured after deployment; reducing policy reads from three round trips to one is not a measured end-to-end speedup.
