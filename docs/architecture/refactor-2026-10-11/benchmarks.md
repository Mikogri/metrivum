# Current verification and measurement boundaries

Environment: Windows/PowerShell, local working tree dated 11 October 2026; PostgreSQL 17 fixture database on loopback. No customer dataset or shared-cloud load test. Earlier documents' latency/query counts and test totals are historical and are not reused as current measurements.

| Command / scenario | Current result |
|---|---|
| `npx vitest run apps/web/app/architecture.test.ts` before import fix | 1 failed / 7 passed: Analyze imported Coaching internals through two relative paths missed by the old regex. |
| Same command after public-index imports | 8 passed. |
| `npx vitest run apps/mobile/src/infrastructure/networking/queries.test.ts apps/web/app/architecture.test.ts` | 12 passed (4 account/invalidation cases + 8 architecture cases). |
| Targeted ESLint on architecture, Analyze import, Progress web/mobile and mutation hook/tests | Passed. |
| Final full solution build with locked restore | Passed, 0 warnings / 0 errors. Initial locked restore exposed three stale project-reference lock files; refreshed project graph without changing NuGet package versions. |
| Current migrations from empty local PostgreSQL database | Passed using the final API build in Testing. This includes the revised pending Messaging migration. |
| Final Unit / Architecture suites after correction build | 219/219 and 8/8 passed again, no skips (6s / 2s). Architecture includes inheritance and generic-constraint cases. |
| `psql -X -v ON_ERROR_STOP=1 -f infra/diagnostics/consistency.sql` against disposable local fixture DB | Ten result rows and ROLLBACK. All integrity checks zero; 249 aged notification fixture records, intentionally inactive delivery workers. No repair performed. |
| New hardening integration cases | 9 passed in the full run: export isolation/worker registration (3), endpoint DTO wire parity/graph/model snapshots (3), disabled worker startup (1), PostgreSQL Progress (1), read-only diagnostic (1). |
| Endpoint response graph before/after DTO correction | Initially failed on five routes exposing OfferCategory/PlanChange/TeamRequest EF types. Compatible DTO projections now pass both graph and JSON-property/value parity tests. |
| First complete Integration suite, fresh migrated local DB | 310 passed / 5 failed / 2 skipped, 317 total, 8m6s. Failures identified worker API-only DI registration, Unicode catalog search, two stale client-plan access expectations and a batch-order-sensitive push fixture. Correction reruns are recorded separately below. Supabase Storage/Auth tests were deliberately skipped because no local Supabase stack was configured. |
| Worker startup after registration correction | 8/8 passed. API explicitly registers `ClientAnalysisLibrary`; the shared worker module no longer requires its API-only Training reference service. TLS rejection/connection-boundary checks and disabled-worker exit all pass. |
| Affected integration classes after final locked rebuild | 43/43 passed, zero skips, 50.7s: Catalog 12, Coaching 12, TeamCoaching 9, MobileBackend 3, endpoint contracts/snapshots 3, export isolation 3, consistency diagnostic 1. This is a focused correction run, not a second complete integration run. |
| Mobile Expo iOS/Android export | Both platform bundles passed locally; explicit CI workflow added. Native/device parity is not inferred. |
| Coordinated frontend projects | 53 mobile-core, 250 web and 16 ui-web tests passed; parent owns combined frontend logs. |
| `npm audit --audit-level=moderate` | Fails: 31 affected dependency nodes (20 high / 11 moderate), four underlying advisories. Gate preserved; details in [operations](operations.md#dependency-gate). |

No speedup is claimed. Partialness detection adds at most one client group and one performance group to the already bounded detail reads; it adds no count query and changes no summary formula. Mobile chat mutations stop invalidating unrelated finance/training queries, verified by predicate tests; no device/network timing reduction was measured.

The full-run TRX also confirms CheckIns 18/18, Messaging 26/26 plus its migration 1/1, and TrainingDeliveryPostgres 18/18. The push correction is test-only: an explicit 101-row backlog reproduced the single-batch assumption; the fixture now performs bounded delivery passes and counts only its own device. The catalog correction normalizes the small muscle dictionary in the application before matching keys in SQL, including composed/decomposed Unicode; no database locale change or migration was needed.

Backend evidence is preserved under ignored `.local/refactor-2026-10-11/`: `audit-final-build.log`, `audit-integration.log`, `audit-affected.log`, and `final-results/{integration,affected,worker,unit-final,architecture-final}.trx`. The build used `--artifacts-path .local/refactor-2026-10-11/audit-build -m:1 -p:BuildInParallel=false -p:RestoreLockedMode=true`; tests used that same artifact path with `--no-build --no-restore`. Only `TRAINFLOW_TEST_DATABASE` pointed to the disposable loopback database; Supabase test URL/key were unset. The affected run had a three-minute per-test hang bound and completed normally.

For later performance work, use the existing `CoachingQueryPerformanceTests`, `AccountQueryTests` and synthetic SQL plans under `infra/diagnostics/`. Record fixture seed/count, commit, machine/PG version, concurrency, cold/warm state and error rate. Obtain repeated SQL counts, command/pool wait and HTTP timings separately; percentile latency requires enough samples. Do not load-test the shared Supabase project without its explicit dedicated budget.

Remaining measurements: actual top-screen p50/p95/p99, multi-replica connection pressure, retained outbox/job trends, full restore time/data-loss window and real target ML decode/inference/memory/thermal/parity. These are **NEEDS MEASUREMENT** or **BLOCKED**, not zero or passing.
