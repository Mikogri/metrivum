# Team organizations (Stage 6)

Team is an organization of coaches, with its own subscription. Client groups remain a separate concept. All existing records default to Personal. Team membership never imports private clients, programs, documents, form answers or direct messages.

## Billing and membership

- Owner pays for purchased seats; Owner, Admin and Member each occupy one. Pending invitations do not reserve capacity. Invitation acceptance takes a database lock and checks capacity and the recipient's single active membership. A pending seat reduction also limits new acceptances until the owner cancels it or buys seats.
- Only Owner manages billing, roles, ownership and dissolution. Admin manages member invitations and client assignments and sees organizational summaries. Members see their own assigned Team clients and personal workspace. Server permissions and `allowedActions` control access.
- Server configuration is `Billing:PlatformPlans` in API `appsettings.json`: Pro USD 25/month; Team USD 20/seat/month. The existing profile-currency converter applies to listed prices. Quotes expire after 15 minutes. Prices, quantities, currency and accepted terms are frozen; missing prices block checkout.
- Every checkout explicitly confirms a **simulated payment; no real money moves**. Team activation uses the existing Order, PaymentDue, PaymentAttempt and settlement flow in one transaction. No card details are collected. Failed attempts retain their history; retry with a new idempotency key. Repeated successful confirmation does not charge twice.
- Pro upgrade credit uses the actually settled current Pro period: `round(paidValue * clamp(end - quoteTime, 0, end - start) / (end - start), 2)`. A 100 PLN paid period with half remaining produces 50 PLN credit; a 300 PLN Team purchase charges 250 PLN. Initial Team and Pro purchases start a full calendar month at confirmation. Credit sources cannot be reused.
- Cross-currency credit and credit exceeding the initial Team price **block purchase** pending an approved conversion/residual-credit policy. Paid value is never silently discarded. No wallet or refund flow is introduced.
- Added seats are prorated over the remaining paid period without extending its end. Decreases take effect next renewal, cannot be below occupancy and do not refund the current period. Quoting the existing purchased count cancels a pending decrease.
- Joining someone else's Team preserves personal Pro and renewal preferences. Members can cancel personal renewal separately. Leaving returns effective access to still-valid personal Pro or Free. Free and Pro retain feature parity; active Team membership has Pro commercial terms. Existing explicit commission overrides remain authoritative.

## Client and resource boundaries

Coaching owns `TeamClientCase`, historical coach assignments and client transfer requests. Personal-to-Team transfer requires the actual client's versioned consent. It completes the old personal relationship and creates a separate Team relationship for future work. Historical private records retain their original relationship and seller. Active personal services or unresolved payments block transfer with an actionable error.

New Team offers use the existing application/intake flow and require explicit organizational consent. Seller scope is immutable on offers, services, orders, dues and settlements. One organizational client can have several coaches and is counted once in Team totals. Owners/Admins may reassign within the accepted organizational staff scope; previous assignments and attribution remain recorded.

Programs/forms remain their author's assets; assigning them to a Team relationship does not transfer the source asset. New check-ins, assignments, documents and calendar events inherit their authorized relationship scope. Personal history is never relabelled. Sensitive document and form access retains the existing participant/visibility rules; administrative aggregate access is not blanket access to raw notes or answers. Personal DMs stay private. Linking Team client groups to chat is explicitly blocked until organizational chat ownership and departure permissions are implemented; existing Personal group chats remain available.

Reassignment creates the replacement coach's own organizational relationship. It does not automatically hand over the previous coach's detailed document, check-in or workout records; the client retains permitted history and administrative reports retain aggregates. Selected historical record sharing needs a separate permission workflow and is not introduced here.

Groups have an immutable optional `TeamId`; membership and target resolution reject mixed Personal/Team records. Team groups remain managed by their original coach while membership is active; Admins see aggregate group/case reporting. Departing coaches' Team groups are archived. Calendar similarly rejects mixed scopes and keeps original creator attribution.

Analyze supports Personal, Team and TeamMember. Active Owner/Admin default to Team; Members may select only their own Team attribution. The server resolves authorized relationships and filters financial records by their recorded seller scope, never current membership. Platform seat purchases are excluded from coaching revenue; currencies stay separate. Existing charts and training/check-in aggregate sources are reused.

## End-of-period behavior

Cancelling personal Pro renewal or selecting Free preserves the paid period. Cancelling Team renewal preserves its period and seats; expiry becomes `BillingInactive`, with Team workflows read-only and active entitlements suspended. Manual successful renewal restores eligibility. Personal records are unaffected.

Dissolution is a separate Owner action requiring recent interactive authentication and explicit consequences. It is scheduled at the paid period end (now if already expired), disables renewal and can be cancelled before execution. Cancelling dissolution does not silently resume automatic billing. Ownership transfer also requires recent authentication and recipient acceptance; old payer renewal authorization is cleared.

The existing API-hosted Billing worker executes persisted transitions under transaction locks. Dissolution ends memberships, organizational cases and assignments, revokes pending invitations/transfers, archives groups and cancels future Team work/reminders. Completed history and money records remain. Former Team clients are never converted into personal relationships. Active Team service obligations block dissolution until explicitly resolved; this stage does not invent refunds or forfeiture.

## API map

All routes below use `/api/v1`, authenticated bearer tokens and the existing JSON error contract. Mutations accepting `version` reject stale state. Exact fields are in generated OpenAPI and `contracts/generated/api.d.ts`.

| Route | Input and result |
| --- | --- |
| `GET /me/team-context` | Current membership, role, status and active paid eligibility, or null |
| `GET /teams/mine` | Membership summary, permitted actions and relevant invitations |
| `POST /teams/checkout-quote` | Team name, seat count, current price version, optional renewal method; returns frozen gross/credit/due breakdown |
| `POST /teams/confirm-purchase` | Quote ID, idempotency key, optional simulated method; returns billing state or `PaymentFailed` |
| `GET /teams/{id}/billing` | Owner-only period, purchased/occupied/pending seats and quote history |
| `POST /teams/{id}/seats/quote` | Desired seats and billing version; returns adjustment quote |
| `POST /teams/{id}/seats/confirm` | Quote ID and idempotency key; confirms adjustment or renewal quote |
| `POST /teams/{id}/renewal/quote` | Quotes renewal after paid expiry |
| `POST /teams/{id}/renewal` | Version, explicit auto-renew choice and eligible simulated method; returns billing state |
| `PATCH /teams/{id}` | Version, name and description; returns Team summary |
| `GET /teams/{id}/members` | Authorized roster with display names, usernames, roles and join dates |
| `POST /teams/{id}/invitations` | Exact existing username and role; creates/reuses a bounded, expiring invitation |
| `POST /teams/requests/{id}/decision` | Recipient accepts/declines; seat checks run atomically |
| `POST /teams/{id}/invitations/{requestId}/revoke` | Revoke pending invitation; no response body |
| `PATCH /teams/{id}/members/{userId}/role` | Owner supplies version and role; no response body |
| `DELETE /teams/{id}/members/{userId}?version=...` | Authorized removal; preserves organizational cases/history |
| `POST /teams/{id}/leave` | Version; Owner must transfer ownership or dissolve first |
| `POST /teams/{id}/ownership-transfer` | Version and recipient member ID; recent authentication required |
| `POST /teams/{id}/ownership-transfer/accept` | Recipient version and recent authentication; changes Owner atomically |
| `POST /teams/{id}/schedule-dissolution` | Version and explicit confirmation; returns scheduled Team state |
| `POST /teams/{id}/cancel-dissolution` | Version, `resumeRenewal: false`; restores unscheduled state |
| `GET /teams/{id}/clients` | Organizational cases; Members receive only assigned cases |
| `GET /teams/{id}/clients/{caseId}` | Authorized case summary and assignment metadata |
| `POST /teams/{id}/clients/{caseId}/assign-coach` | Coach ID and case version; returns case |
| `DELETE /teams/{id}/clients/{caseId}/assignments/{coachId}` | Version in body; ends assignment, retains history |
| `GET/POST /teams/{id}/client-transfer-requests` | Read permitted requests / propose an eligible personal relationship transfer |
| `GET /me/team-client-transfer-requests` | Actual client's incoming requests and consent wording |
| `POST /me/team-client-transfer-requests/{id}/accept` or `/decline` | Client's request version; returns updated consent state |

Legacy Team search returns no directory and unrestricted join is rejected. Team creation begins in Subscription; nonmembers see invitations/empty state. Existing Coaching list/group routes accept optional `teamId`, validated against current membership. Existing Analyze routes accept `scope` and authorized `memberId` filters.

## Migration policy

EF migrations are authoritative. `infra/export-stage06.ps1` assembles the baseline-checked upgrade and runtime grants. Nullable scope columns preserve existing Personal records. New immutable credit/audit/quote guards, global active membership, exactly-one-owner and paid-capacity constraints protect write paths. Client group scope has a database guard in addition to application checks.

Legacy Teams without a verifiable organizational paid-seat ledger block migration instead of fabricating payment history. The approved development project has no such legacy rows. Application roles have only required table/schema privileges; Supabase anonymous/authenticated roles and the video worker receive no Team data access. No production migration or deployment is included.

Applied to approved development Supabase `atclvdkpbccafakzpwls` on 2026-10-08 as `stage06_team_organizations`:

- Coaching: `20261008162102_TeamClientConsent`, `20261008163049_TeamResourceScope`, `20261008165117_TeamClientGroups`.
- Offers: `20261008163057_TeamOfferScope`.
- Billing: `20261008162520_TeamOrganizations`, `20261008164148_PlatformConfirmationPeriods`.
- Calendar: `20261008163800_TeamCalendarScope`.

## Verification — 2026-10-08

Final build: zero warnings/errors. Final backend run: **188 unit + 234 PostgreSQL integration + 2 architecture tests passed, zero failures**. Two optional local Supabase Auth/Storage tests were skipped because those external fixtures were not configured. The initial regression found three outdated fixture/DTO expectations; they were corrected and the full regression rerun successfully.

Executed `dotnet build TrainFlow.slnx --no-restore --artifacts-path .local/stage06/build -m:1 /nodeReuse:false`, then `dotnet test` separately for the Unit, Architecture and Integration projects with `--no-build --no-restore --artifacts-path .local/stage06/build`. TRX results are in ignored `.local/stage06/final-results`.

Tests cover exact 100/50/300/250 credit, delayed provider settlement time, duplicate confirmation/credit, declined payment retry, last-seat concurrency, owner acceptance, consent/decline and private isolation, Team intake, unique client/reactivation counts, seller-scoped finance, client group scope, read-only expiry, durable lifecycle and Team-lock check-in generation. A blocked dissolution does not prevent another Team's transition or unrelated renewal passes.

Final focused Coaching/intake/Messaging rerun: **32/32 passed**. It also verifies required client notices after assignment/removal/departure/closure, recipient isolation and idempotency, and the explicit Team group-chat boundary.

Frontend: **148 tests across 39 files**, **50 distinct desktop/mobile browser cases** and two additional dissolution viewport checks passed. Browser cases use explicit API fixtures; HTTP integration tests exercise the business API against real local PostgreSQL. TypeScript, targeted ESLint, generated contracts and production client/SSR build passed. Initial Vite navigation timeouts under memory pressure disappeared on the unchanged serial rerun.

`infra/test-stage06-migrations.ps1` passed clean installation and baseline upgrade, preserving seeded Personal relationships, group memberships and programs. Development fingerprints of 11 affected tables matched before/after. `infra/team-runtime-smoke.sql` passed using the actual restricted API connection (the managed administrator cannot impersonate this role); all fixture writes were rolled back. API cannot update/delete credit history, worker has no Team access, and Supabase anonymous/authenticated roles have no business-schema access.

Only the local TrainFlow API was rebuilt/restarted. HTTP `/health/live` returned 200 and `/health/ready` returned `ready`; startup logs were clean. No production data, deployment, commit or push was performed.

Supabase security advisor reported no new database findings. It retains an Auth warning for disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); this stage does not change Auth configuration.

Blocked business cases remain explicit: incompatible credit currencies, credit exceeding the initial Team bill, unresolved private obligations before transfer, and active Team service obligations before dissolution. Selected historical record sharing, automatic Team group chat and real payment processing are outside this delivery.
