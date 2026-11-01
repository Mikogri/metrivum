# Stage 04: notifications, platform subscriptions and Analyze

See [verification and migration status](stage-04-verification.md) for the completed checks and environment boundaries.

The coach app bar links to `/app/subscription`; Programs retains its create action. `/app/analyze` replaces Earnings and `/app/earnings` redirects while preserving the query string.

## Module boundaries

- Notifications owns durable recipient history and preferences. A notification row also acts as a delivery outbox; domain transactions publish through `INotificationPublisher`. Scheduled events persist while browsers are closed. SignalR is a hint; authenticated REST restores state after reconnect. Payloads contain safe labels and source links, never message bodies or health answers.
- Billing reuses Orders, Dues, Attempts, Payments and Transactions for both `CoachingService` and `Platform` contexts. Platform subscriptions, immutable accepted prices and change history are separate from purchased coaching services. Manual Confirm payment needs no saved method; automatic renewal requires explicit opt-in and an eligible simulator method. No real money is charged.
- Analytics has no separate ledger. Module-owned providers aggregate authorized records through Contracts. Amounts remain separated by currency; platform purchases and unpaid dues are excluded from settled coaching revenue. The training library has no execution records, so training completion/progress is unavailable.

See [notifications](notifications.md), [subscription billing](platform-subscriptions.md) and [metric definitions](analytics.md) for the detailed contracts and rules.

## Price and commission policy

Configure `Billing:PlatformPlans:Pro:Amount`, `Currency`, `PriceVersion` and `TermsVersion` on the API server. Without a positive configured price, checkout returns a conflict and the UI shows **Price not configured**. Change the price version when changing accepted terms; existing price rows are immutable. There is no invented production price.

Free and Pro expose the same implemented capability catalog. Default coaching-service commission is 10% for Free and 5% for Pro at settlement, with existing explicit policy overrides preserved. External settlements retain zero platform commission. Historic fees never change after settlement. Ownership, roles and configured numeric limits still apply.

## Reproduce verification

```powershell
$env:TRAINFLOW_TEST_DATABASE = (Get-Content .local/stage-01/database.json -Raw | ConvertFrom-Json).ConnectionString
dotnet test Metrivum.slnx -c Debug
./infra/export-stage04.ps1
./infra/export-initial-database.ps1 -Configuration Debug -OutputPath .local/stage04/initial.sql
./infra/test-stage04-migrations.ps1
npm.cmd run typecheck --workspace @metrivum/web
npm.cmd run lint
npm.cmd test
npm.cmd run build --workspace @metrivum/web
npm.cmd run e2e:coaching --workspace @metrivum/web
```

Migration tests create disposable loopback databases, seed Stage 3A profiles, relationships, groups, forms, messages and financial records, then compare original fields after upgrading. They also check clean creation, immutable history, notification deduplication and restricted runtime writes.

## Guarded development fixture

`tools/Metrivum.DevFixtures --stage 4` requires four explicitly confirmed, existing onboarded test identities: two coaches and two clients. Use fresh dedicated accounts with default fee policy and a configured development-only Pro price. It activates Coach A's Pro plan through simulated checkout, leaves Coach B Free, and reuses Stage 2's real offers, payments and submitted/reviewed check-in. It also writes a real chat message.

Expected Coach A totals: **EUR 360 gross, 4 fee, 356 net, two settlements, two unique active clients**. The EUR 80 internal sale uses Pro's 5% fee; EUR 280 external payment uses no platform fee. The platform purchase is excluded. The local verification uses explicitly labelled fixture accounts and a test-only EUR 29.99 Pro price; this is not the application's configured commercial price.

## Migration application

On 2026-10-08, six Stage 04 EF migrations were applied to the owner-confirmed development project `atclvdkpbccafakzpwls` after checking its identity/history and passing local clean/upgrade tests: InitialNotifications, PlatformSubscriptions, PlatformBillingGuards, StageFourFeatures and the Coaching/CheckIns AnalyticsDateIndexes. EF history remains authoritative; Supabase migration wrappers record the exported batches. No managed Auth/Storage schema was changed. The restricted `trainflow_api` connection passed a notification insert/update/read transaction that was rolled back afterward.

Only the development database was migrated. Production deployment, real payments, email/push/SMS delivery and training execution tracking are outside this stage.
