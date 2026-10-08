# Analyze metric definitions

`/app/analyze` replaces Earnings; `/app/earnings` redirects. All aggregates run in ASP.NET against each source module's own PostgreSQL context. Analytics references Contracts only. React receives aggregates, never financial/customer raw rows for summation.

## API and scope

Authenticated coach routes: `GET /api/v1/analyze/overview`, `/financial`, `/clients`, `/acquisition`, `/training`, `/check-ins`. The overview includes current and comparison results, filter options and content-free messaging counts. Specialized endpoints expose the corresponding typed overview slice. Coach role, `analytics.view`, authenticated owner and workspace are checked before querying. A foreign/unknown group or offer revision returns 404.

Query parameters: `from`, `to` (inclusive calendar dates), `timeZone` (IANA zone; default UTC; recognized Windows identifiers are normalized to IANA before SQL aggregation), `grouping=day|week|month`, optional `groupId` and `offerRevisionId`. Date bounds are 1901-9998 with at most 366 days; comparison is the immediately preceding equal number of calendar days. SQL timestamps use `[start, end)` UTC boundaries derived from the requested zone. DST days can contain 23/25 hours. Zones with a nonexistent selected midnight return 400 rather than silently shifting a calendar date. The default date uses the requested zone, not the server's UTC date.

Daily SQL aggregates are bucketed on the server; weeks begin Monday and months begin on day 1. Bucket labels can precede the requested start for partial weeks/months. Daily active-client snapshots use the last available day of a larger bucket. Filter cohorts are limited to 10,000 relationships; filter options/groups 200 and top offer rows 100. Range and owner indexes support bounded queries. Existing history `(RelationshipId, Version)` indexes support status-at-time lookups. No new analytics tables or warehouse exist.

## Finance

- Source: exactly one immutable `Payment` per settled due, including explicit simulated and external settlement modes. Only `Context=CoachingService` contributes. A coach's TrainFlow platform plan purchase is excluded even though they own the account.
- Gross, fee and net use payment snapshots, not the current plan. `gross = fee + net`. Amounts stay decimal and currencies remain separate. There is no FX conversion or combined multi-currency total.
- Period selection uses `Payment.SettledAt`, grouped in the selected time zone. Payment count is settled due payments, not distinct orders (renewals are separate settlements).
- Pending = currently AwaitingPayment dues whose due date falls within the selected range. It is an outstanding-current-state metric, not revenue or a reconstructed historic receivable snapshot.
- Average payment = gross / settled payment count. Gross per paying client = gross / distinct payer ids within the currency. Multiple services for one person count once per currency.
- Offer breakdown uses immutable offer revision/name snapshots on the order. Selecting a revision is deliberate; different published revisions are not silently merged.
- MRR is the contracted gross recurring service run rate at period end: orders joined to subscriptions with anchor before the end and no end date before that end. Weekly amount / interval × 52 / 12; monthly amount / interval; yearly amount / interval / 12. It is not received cash and unpaid contracts can contribute. Immutable recorded end dates are authoritative for historical queries.
- Renewal count = settled coaching dues with sequence > 0 and settlement date in the range. Simulated and external gross are reported separately. Simulated payment does not transfer real money. Existing external settlement policy stores zero fee; historic snapshots remain authoritative.

## Clients and acquisition

- Overall counts deduplicate `ClientId` within the authenticated coach/workspace. Three service payments or two overlapping groups do not create three/two clients.
- Active/suspended/completed = unique relationship clients in that status at the selected period's end, reconstructed from immutable status history. Daily active counts use that day's end. Initial status comes from the earliest history's previous status when no earlier transition exists.
- New = first relationship `StartedAt` within the period. Reactivated = distinct clients with Suspended/Completed -> Active transitions in the period, reported separately from new. Departed = distinct clients with Active -> Suspended/Completed transitions. A client can both depart and reactivate within one period.
- Net growth = active-at-end minus active-at-start. Retention = starting active cohort still active at end / starting active cohort × 100. A departure followed by return can be retained; this is endpoint retention, not uninterrupted retention.
- Group filter uses current membership; offer revision filter uses relationships with a service from that revision. Group membership counts are current and may overlap; never sum them into an overall client count. They do not claim historic group attribution.
- Acquisition is a submitted-date application cohort: applications submitted in range and their latest accepted/rejected/pending outcome, even if decided after range end. Conversion = accepted / submitted × 100. Direct and Invitation are the actual supported source values. Offer revision filters apply. Group filters do not alter acquisition because unaccepted leads have no group attribution.
- Invitations use a sent-date cohort and latest accepted/declined state. Offer revision filters apply. No invented advertising/channel sources or decision-date conversion rate.
- Any zero denominator or previous-period zero baseline returns/displays N/A, never NaN/infinity.

## Check-ins and operations

Source is concrete `CheckInRequest` recipients, not schedules/targets; overlapping target groups cannot duplicate a request. Cohort = AvailableAtUtc in selected range, excluding requests cancelled before period end. Operational cutoff is the earlier of period end and now, so future scheduled requests are not counted as issued or prematurely overdue. Submitted = submission before that cutoff; overdue = due before cutoff without a submission before that boundary; pending review = submitted before cutoff without review before cutoff. Submission rate = submitted / issued × 100. Average review hours = mean(ReviewedAt - SubmittedAt) over that cohort's reviews before end. Current group/offer relationship cohort filters apply. Private health answers, replies and notes are never read.

Messaging counts are messages sent/received and distinct conversations with activity in the range, restricted to the coach's currently active, nonexcluded memberships and messages after joining. System messages are excluded. These personal conversation counts ignore offer/group filters and never analyze message bodies. They do not reconstruct revoked historic conversation access.

## Training availability

The current program library has document/revision data, but no recorded workout/session execution logs. Analyze explicitly shows `No recorded training data`; no scheduled set is counted as executed, no adherence/volume/lift-progress metric is fabricated. Execution logging remains a future module dependency.

## Reproducible fixture

`AnalyticsTests` creates isolated explicitly labeled PostgreSQL fixtures. Expected: one client with three EUR coaching payments 100 + 200 simulated + 50 external -> gross 350, fee 30, net 320, payments 3, paying clients 1; EUR pending due 80 stays outside revenue. PLN payment 500 stays separate. Platform purchase 999 and another coach's 900 are excluded. At 22:30 UTC, Warsaw assigns payments to the next calendar day. Two overlapping groups count that client twice in group rows but once overall; Completed -> Active is reactivation, not first acquisition. Three noncancelled requests with two submissions, one overdue, one pending review and one review after four hours -> 66.67% submission and 4-hour mean review.

Run `dotnet test tests/Unit/TrainFlow.UnitTests --filter FullyQualifiedName~Analytics` and PostgreSQL-enabled `dotnet test tests/Integration/TrainFlow.IntegrationTests --filter FullyQualifiedName~Analytics`. Browser fixture: `npm.cmd run e2e:coaching --workspace @trainflow/web -- analyze.spec.ts` (desktop/mobile, dates/filters/buckets, legacy route, header action, training empty state). No fixture values are displayed as production customer data.

Additive owner migrations: Coaching `20261008090132_AnalyticsDateIndexes` and CheckIns `20261008090203_AnalyticsDateIndexes`; they add four owner/workspace/date indexes and preserve rows. Apply through the existing EF migration workflow only after development database verification.
