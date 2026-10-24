# Stage 04 verification — 2026-10-08

## IMPLEMENTED

Durable notification history/preferences, recipient-scoped REST/SignalR, persisted reminders and real domain publications; separate Free/Pro platform subscriptions through the existing simulated billing ledger; methodless manual confirmation and explicit renewal; Subscription header action; Analyze API/UI and legacy Earnings redirect. See [stage overview](stage-04.md), [notifications](notifications.md), [billing](platform-subscriptions.md) and [metric definitions](analytics.md).

The final review fixed notification access for disabled/unonboarded accounts, separated publisher-only worker registration, moved the legacy redirect into the route loader to avoid a workspace-switch race, and normalized Windows timezone identifiers before PostgreSQL aggregation. Existing meeting creation still closes the editor without opening details; the regression test now checks that behavior before explicitly opening the calendar item.

## TESTED

| Check | Result |
|---|---|
| Baseline | 121 .NET unit, 146 integration, 2 architecture and 124 frontend tests passed; 2 external integration tests skipped |
| Final .NET unit coverage | 130 tests passed across the full suite and final Analytics regression (129 full-suite tests plus the added timezone normalization test) |
| Final PostgreSQL/integration coverage | 166 tests passed across full suite and targeted fixes; 2 external tests skipped |
| Architecture | 2 .NET tests passed; frontend architecture checks are included in the 124 frontend tests |
| Frontend unit tests | 124 tests in 33 files passed |
| Playwright | All 40 desktop/mobile scenarios passed across the full run and targeted reruns |
| Build/tooling | Solution Release build: zero warnings/errors; frontend build, TypeScript and ESLint passed |
| Migration checks | Empty install and Stage 3A upgrade passed, including nonempty historical payment/message preservation, notification dedupe and restricted runtime writes |
| Fixture | Restricted local runtime verified two coaches, two clients, real offers/check-in/chat and EUR 360 gross / 4 fee / 356 net; platform purchase excluded |
| Development runtime | Restarted API on HTTP 59120 / HTTPS 59119; readiness/liveness return 200 and anonymous new REST routes return 401 |

The full backend run initially exposed one worker DI failure; after fixing the publisher registration, all 7 worker startup and 8 notification tests passed. Final Analytics checks passed 9 unit and 5 integration tests. The browser run initially exposed a legacy workspace redirect race, an outdated meeting expectation, a malformed fixture handler and an encoding error in a status assertion. Targeted reruns passed every failed scenario. The initial cold browser startup timeout also passed on rerun without increasing timeouts.

Commands are in [stage overview](stage-04.md#reproduce-verification). Detailed local logs are under ignored `.local/stage04/`: `dotnet-full.log`, `regression-fixes.log`, `analytics-final.log`, `web-tests.log`, `e2e-full.log`, `e2e-recheck.log`, `e2e-final.log`, `migration-verification.log`, `dev-fixture.log`, `remote-runtime.log`, `release-final.log`, `typecheck-final.log`, `lint-final.log`, `web-build-final.log`. Screenshots cover Subscription, Analyze and the notification bell. Browser fixtures are clearly labeled mocks; actual persistence is verified by PostgreSQL tests and the guarded fixture.

## MIGRATIONS CREATED

- Notifications: `20261008083449_InitialNotifications`
- Access: `20261008083659_StageFourFeatures`
- Billing: `20261008084000_PlatformSubscriptions`, `20261008084224_PlatformBillingGuards`
- Coaching: `20261008090132_AnalyticsDateIndexes`
- CheckIns: `20261008090203_AnalyticsDateIndexes`

Each migration lives in its owning module's `Infrastructure/Migrations` directory. `infra/export-stage04.ps1` exports the complete Stage 3A upgrade; `infra/test-stage04-migrations.ps1` verifies clean/upgrade databases on loopback only.

## APPLIED TO DEV

All six migrations are recorded in EF histories on the owner-confirmed Supabase development project `atclvdkpbccafakzpwls` (Metrivum, eu-west-1). Project identity, migration baseline and application ownership were checked before applying. Two Supabase wrapper migrations recorded the EF-generated batches. Existing messages remained present; local upgrade fixtures verified exact preservation of original fields and historical fee amounts.

The actual restricted `trainflow_api` TLS connection successfully inserted, updated and read a notification in a rolled-back transaction. It has schema USAGE without CREATE; financial/price histories remain immutable. No managed Auth or Storage schema was changed and no remote customer fixture data was inserted.

## NOT APPLIED

No production migration/deployment, commit or push. No commercial Pro price was invented. Development still shows **Price not configured** until `Billing:PlatformPlans:Pro:Amount` and currency/versioned terms are configured. EUR 29.99 used by the local fixture and other prices used by tests are explicitly test-only.

## BLOCKED

No implementation blocker. The optional local Supabase Auth/Storage integration tests were skipped because their external test environment was not configured; normal JWT/permission/worker tests ran. Real Pro checkout requires the owner's price configuration.

## DEFERRED

Real payment processor/charges, email/SMS/push, workout execution tracking and the resulting training progress analytics. Analyze shows an honest unavailable state for training; finance, clients, acquisition, check-ins and messaging use actual recorded module data. No subsequent Calls/WebRTC stage was started.
