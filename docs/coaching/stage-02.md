# Coaching stage 02

Stage 02 adds Forms, Offers, Billing and CheckIns, with applications, invitations and services in Coaching. Each module owns its PostgreSQL schema and shares only contracts. Published definitions, issued requests, financial records and submitted answers preserve their original snapshots.

An authenticated Client browses a coach's active offers and starts a private application. `InProgress` drafts are visible only to that Client. Submission freezes the answers and exposes the lead to the owning Coach. Explicit profile saving updates only allowlisted system fields on the Client's own profile, in the same transaction; custom answers remain in the submission. Applications become `Submitted`, then `Accepted` or `Rejected`; drafts/submissions can become `Withdrawn`. History remains readable to the authorized parties.

Invitations resolve an exact username and freeze the offer and form revision. A `Pending` invitation becomes `Accepted` or `Declined` by its recipient, or `Revoked` by its Coach. Invitation acceptance creates a controlled application draft and does not create a relationship. Application acceptance atomically creates the service and Billing order: an existing Active pair is reused, a Completed pair is reactivated with an audit, and a Suspended pair requires an explicit resume first. A unique service per application and shared `ModuleTransaction` prevent duplicate or partial acceptance under retries and concurrent requests. Completing a service does not complete the relationship or settle its dues.

Coaches edit form drafts and publish immutable versions. Offers use a published application form belonging to the same Coach. Offer states are `Draft`, `Active`, `Inactive` and terminal `Archived`; issued invitations and applications retain their frozen revision when the current offer changes. File attachments are unavailable until a private Media integration exists.

Billing supports PerSession, CustomPackage, FixedPackage and PeriodSubscription options. Quotes calculate amounts on the server. Subscription periods use weeks, months or years, bounded between one week and one year. `EndOfServicePeriod` is accepted only for PeriodSubscription; other models have no configured service end. Coach currency defaults to EUR and is copied into published offers and orders. Platform fees come from `Billing:PlatformFeeRate` or `Billing:CoachFeeRates:<coach-id>` and are frozen per order; monetary values use two decimal places. The simulated provider stores a label and outcome, never card numbers, CVC or expiry. Zero amounts become `Free`; successful simulated settlement becomes `Paid`. An authorized Coach can record `PaidExternally` with actor, source and timestamp, with zero platform fee and no provider transaction. `AwaitingPayment` dues expose overdue as a time-derived property. Payment idempotency keys prevent duplicate settlements. Subscription renewal failures persist across restarts; completing a service stops future period generation immediately and preserves existing dues.

CheckIns schedules target direct relationships or groups, deduplicating overlapping recipients. Generation uses current group membership and Active relationships; already issued requests retain their recipient and form snapshot. Schedules support OneTime, EveryNDays, EveryNWeeks (multiple weekdays) and monthly recurrence with short-month clamping. IANA timezone and local release time are required. A DST gap resolves to the first valid local minute; an overlap chooses the earlier UTC occurrence once. Stored requests start `Scheduled`, become Available/Overdue by UTC time, and can become `Submitted`, `Reviewed` or `Cancelled`. Response windows use elapsed UTC duration. Billing and CheckIns durable workers run inside the API host; the separate analysis worker retains access only to Media and VideoAnalysis. No email or push delivery is claimed.

Every operation checks server-owned roles, current features, resource ownership and relationship policy. Admin does not bypass private owner projections. Client and Coach DTOs expose only their allowed fields; other-owner IDs return 404 and missing roles/features return 403. Invalid input returns 400 and invalid state transitions return 409. Versioned commands require a strong `If-Match`: missing is 428, malformed is 400 and stale is 412. Version validation precedes state idempotency. Main lists are bounded, paged and deterministically sorted. See generated OpenAPI and feature catalog for exact route/request contracts.

| Resource | Transitions | Authorized party |
| --- | --- | --- |
| Form | Draft edit → publish new immutable version; archive ↔ restore | Owning Coach with the purpose's form-management feature |
| Offer | Draft → Active after publish; Active ↔ Inactive; → Archived | Owning Coach with `offers.manage` |
| Application | InProgress → Submitted → Accepted/Rejected; InProgress/Submitted → Withdrawn | Applicant submits/withdraws; owning Coach decides; acceptance also requires services management |
| Invitation | Pending → Accepted/Declined/Revoked | Target accepts/declines; owning Coach revokes |
| Service | Active → Completed | Owning Coach with services management; relationship policy still applies |
| Schedule | Active ↔ Paused; → Ended | Owning Coach with schedule management |
| Request | Scheduled → Available/Overdue by time; → Submitted → Reviewed; pending → Cancelled | Client submits; owning Coach reviews/cancels |
| Due | AwaitingPayment → Paid/PaidExternally; zero-price → Free | Client pays own due; owning Coach confirms an external receipt |

| API area | Main routes and returned data |
| --- | --- |
| Accounts | GET/PATCH `/api/v1/me/profile-fields`, PATCH `/me/currency`: currency, allowlisted values and profile version |
| Forms | `/api/v1/forms`: paged templates; detail/create/edit/publish/duplicate/archive/restore return template DTOs; `/forms/versions/{id}` returns an owned frozen definition |
| Offers | `/api/v1/offers`: paged owner drafts and versioned commands; `/coaches/{coachId}/offers`: only active published revisions |
| Intake | `/api/v1/coaching/applications`, `/leads`: side-specific lists/details, answers and allowed actions; coach-only projection includes private audit/current allowed profile |
| Invitations | `/api/v1/coaching/invitations`, `/my-invitations`: frozen terms, target/coach summary, status and allowed actions |
| Services | `/api/v1/coaching/relationships/{id}/services`, `/services/{id}`: accepted offer snapshot, order ID, status and allowed actions |
| CheckIns | `/api/v1/check-ins/schedules`, `/requests`: recurrence/targets or issued request state; detail includes frozen form and submission, with private notes only for the Coach |
| Billing | `/api/v1/me/payment-methods`, `/orders`, `/payment-dues`: own methods and financial records; pay returns due/attempt/payment result; relationship billing returns dues and related audit records; `/coaching/earnings` groups settled totals by currency |

See [Coaching UI](../frontend/coaching.md) for screens and [verification](stage-02-verification.md) for actual test/deployment results. Exact per-route methods, payloads and result types remain in generated OpenAPI.

All 11 schemas are private application schemas owned by `trainflow_migrator`. `trainflow_api` has explicit table privileges, no schema CREATE and no migration-history access; immutable tables have SELECT/INSERT only. `trainflow_worker` has SELECT/UPDATE on analysis jobs and media only. Public, anon and authenticated receive no application table access. These grants complement API authorization; they do not provide per-user RLS or populate `auth.uid()` from the API JWT. Auth, Storage and Realtime managed schemas are untouched.

Generate reviewed SQL locally (no database connection is made):

```powershell
dotnet build TrainFlow.slnx -c Release --no-restore
./infra/export-coaching-stage02.ps1 -Configuration Release
# Fresh empty database only:
./infra/export-initial-database.ps1 -Configuration Release -NoBuild
# Historical pre-stage-01 database only:
./infra/export-coaching-stage01.ps1 -Configuration Release
```

The stage 02 script refuses mismatched complete stage 01 histories or existing new schemas, creates four schemas as the migration owner, applies eleven pinned EF migrations and reconciles explicit runtime grants in one transaction. Review the generated ignored `.local/coaching-stage02.sql` before administrator execution. Generation is not deployment. Keep database credentials in ignored local configuration or a secret manager. Verification evidence and deployment status are recorded separately by the release task.

Verify the generated clean and roll-forward exports on temporary loopback databases:

```powershell
./infra/test-stage02-migrations.ps1
```

The verifier uses the ignored local settings, applies the exact exported SQL, checks ten seeded stage 01 rows plus owners/history/constraints/indexes/grants, and drops both temporary databases. It performs no builds or cloud operations.

For local stage 02 sample data, start the normally configured API and apply migrations/feature grants first, then run the guarded DevFixtures CLI with its existing four onboarded account IDs and `--stage 2`. Existing development target/environment gates still apply. The scenario requires preexisting feature grants and reports an actionable error if a fixture offer/form has been archived. Repeated runs reuse the same fixture data; omitting `--stage 2` preserves the stage 01 scenario.

The additive `IndexCheckInForeignKeys` migration indexes the five CheckIns foreign keys reported by the development database advisor. It changes no rows or applied migration definitions.
