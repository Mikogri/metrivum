# Metrivum — Stage 4: Notifications, Free/Pro Subscriptions, Simulated Payments & Analyze

## Mission

Implement this as the NEXT END-TO-END STAGE in the EXISTING Metrivum project. Extend the current ASP.NET Core modular monolith, Supabase PostgreSQL (EF Core/Npgsql), Supabase Auth, existing React/TypeScript web UI and design system. Reuse Stage 1 relationships/groups, Stage 2 offers, forms, check-ins and simulated billing, and Stage 3A durable messaging/SignalR. VERIFY what was actually implemented first; previous prompts are not evidence that code exists.

Requested outcome:
1. Durable in-app **Notifications** for check-ins, chat messages, invitations, leads, offers, payments, platform subscriptions and other events from real implemented modules.
2. Complete the simulated purchase experience: show normal configured price; user clicks **Confirm payment**; real backend payment/order/transaction state is persisted and treated as successfully paid, but **no real funds move**.
3. Add/manage **Metrivum platform plans Free and Pro**, distinct from clients buying coach offers/subscriptions.
4. **Both Free and Pro currently unlock ALL product features/capabilities.** Do not gate CheckIns, Messaging, Analytics, Programs, Export, VideoAnalysis, etc. behind Pro.
5. Coach app top-right: **REPLACE** `New Program` with a **Subscription** button linking to the platform subscription page. Program creation must remain possible from Programs.
6. Replace **Earnings** navigation/page with **Analyze**, a full analytics workspace: finance, revenue, client growth/acquisition, funnels, retention, active client counts, check-ins, engagement and actual logged training/client progress where available.
7. Implement real backend/API, migrations, React integration, tests and documentation. No fake data pretending to be real.

DO NOT implement: real Stripe/card charges, card capture, refunds/chargebacks, invoices/VAT engine, audio/video calls, LiveKit, mobile app, fabricated program execution data, or full email/SMS/push delivery unless already supported by existing services.

## 1. Audit and working method

Read `AGENTS.md`, `CLAUDE.md`, architecture/module docs, git status, OpenAPI, schema/migration history, feature-access catalog, current app header/sidebar, Earnings UI, and tests. Inspect existing Accounts, Access, Coaching, Offers, Forms, CheckIns, Messaging, Billing, Media, Analytics/Training code. Preserve unrelated user changes. Identify reusable real implementations, missing prerequisites, concrete migrations and route contracts. Write a concise execution plan then implement in cohesive, tested slices; do not end at the plan. No general rewrite or duplicate modules.

Work in order: audit -> plan/subscription model -> checkout and billing -> notifications -> header/subscription/bell UI -> analytics API -> Analyze UI -> regression/integration tests -> verify dev migrations. Document any gaps. Do not invent missing production behavior to make it look complete.

## 2. Two types of subscription MUST be separated

A. `PlatformSubscription`: a COACH paying Metrivum for Free/Pro plan; this is a Metrivum platform commercial relationship. Not revenue for that coach's client services.

B. `CoachingServiceSubscription`: a CLIENT paying a coach for a PeriodSubscription OFFER; this belongs to the coach's services/orders/payment dues and is income attributable to that coach.

A person can be both Coach and Client on the same account. One coach-client relationship can have multiple paid services. These are NOT multiple unique clients.

Use existing Billing infrastructure/`IPaymentProvider` where possible. Do not duplicate Order, PaymentDue, PaymentAttempt, Payment, Transaction, fee or revenue ledger tables if they exist. Distinguish billing beneficiary, transaction source and context through typed fields.

## 3. Free / Pro feature access

Both plans grant ALL implemented product capabilities for NOW. Retain the centralized entitlement/capability evaluator rather than scattered `if(plan == Pro)` logic. Roles, ownership, resource permissions, relationship status and admin authorizations still matter: full features do NOT mean accessing someone else's data.

Previously discussed distinctions: Free platform commission 10%, Pro commission 5% on coach-client sales; earlier quantitative client limits Free 3/Pro 20. Keep current configured commission policy (snapshot at settlement) independently of capability access. Do not silently delete previously implemented numeric limits; report whether they still apply and how they differ from capability availability. Do NOT add any new Pro-only restrictions or new limits. Explicitly test that both plans expose the same features in `/me/access`.

## 4. Platform plans and management

Implement/extend persistent catalog: stable `Free`, `Pro` identifiers, display metadata, server-configured price/currency/billing period, versioned price/accepted terms, state. `Free` costs zero. NEVER invent a permanent production Pro price: use existing pricing if set, otherwise make Pro price centrally configurable and create clearly labeled development/test seed price only. If unset in running environment show "price not configured", not a fictional public price. A monthly interval is acceptable initially if this is the existing convention; do not invent annual discount, trial or proration.

Track PlatformSubscription owner, plan, status, accepted price/version, currency, billing interval, current period start/end, next due, auto-renew flag, pending scheduled plan change, change history, timestamps and concurrency token. Switch Free -> Pro upon successful simulated payment confirmation. Pro -> Free: default schedule downgrade at end of paid period, preserving paid entitlement and historical records. Cancel renewal at period end (unless repository already has a different approved policy). At unpaid expiry switch to Free according to documented deterministic policy, WITHOUT deleting customer data or losing currently equal features. Implement idempotent transitions and durable renewal scheduling.

## 5. Simulated payment — production-grade internal lifecycle

User selects an available offer, its exact billing option, or Pro platform plan, at its NORMAL CONFIGURED PRICE (no arbitrary $0.01 test value). Show price and currency. On **Confirm payment**, backend validates authenticated payer and offer/plan version, authoritative amount/currency and outstanding due/order, and runs the real internal payment flow:

`Order / Subscription -> PaymentDue -> PaymentAttempt -> IPaymentProvider(SimulatedPaymentProvider) -> Paid/Settled Transaction -> financial fee/earnings posting (ONLY for coach-service sales) -> subscription/service billing state -> notification event`.

The ONLY mock is the external processor boundary. On valid payment request it returns success at any permitted price. Payment is saved and downstream business logic behaves as paid. Always persist `Provider=Simulated` and show a clear "Simulated payment — no real money charged" indicator in subscription and payment history; NEVER call simulated settlement real transferred cash. Do not just set `IsPaid=true` and do not mark paid before a persisted provider-success result.

Manual flow: person may click Confirm payment WITHOUT saving any fake card. Optional simulated saved payment method supports automatic renewal only if explicitly enabled. Store no PAN, expiry, CVC, or fake equivalents. Without method, generate due item and leave AwaitingPayment until user confirms. Free / zero-cost offers do not require a fake processor charge. External/off-platform payment stays explicitly separate and must not be represented as simulated provider success; audit who marked externally paid and when. If policy for platform fees on external settlements is unresolved, expose/configure and document the ambiguity rather than guessing.

Double-click, concurrent confirmation and retry must produce exactly ONE settlement. Use domain idempotency keys, DB uniqueness, transaction boundaries and concurrency tokens. Monetary values must be decimal/numeric, with centralized rounding and currency precision. Client-service sales record gross, fee %, fee amount, coach net and currency in immutable history. Existing Free 10% / Pro 5% fees are charged according to server-side rate at the relevant settlement, NOT frontend values, and remain unchanged if coach later upgrades.

VERY IMPORTANT: paying for Metrivum Pro is the COACH paying Metrivum; it must NEVER incur a coach marketplace commission, and must NEVER show as that coach's earnings. Relationship Active is NOT synonymous with Service Paid. Services/relationships may be active before payment is due according to accepted terms. Do not suspend all of a coach's client relationships because a single due is unpaid.

## 6. Subscription UI / top-right header

In the existing coach AppLayout top-right, replace `New Program` with a primary/appropriate **Subscription** action. Link to `/app/subscription` (adapt to existing routing conventions). Do not leave the old header action in the same spot. Preserve a clear `Create Program` action inside `/app/programs`. Add a compact notification bell near the new Subscription action, without redesigning the entire layout.

Build `/app/subscription` integrated with REAL API: current Free/Pro status, plan comparison, ALL capabilities shown available in BOTH tiers, differences in commission and any existing quantitative limits, server-configured real price/currency, period dates, paid-through date, auto-renew, upgrade/downgrade/cancel, payment/plan history and due invoices/records only if they truly exist. For paid checkout, show summary and **Confirm payment**. Display pending, success, failure, retry-safe states. Show successful change only AFTER backend confirms. Do not fabricate card form, card numbers, prices, receipts or paid status. Show simulated-mode explanation.

If current account has both roles, ensure the platform plan belongs to the correct account context; do not confuse client's purchased coaching service with user's Metrivum plan. Reuse existing components, typography, spacing, colors, responsiveness and accessibility.

## 7. Durable in-app notifications: data and delivery

Build/extend `Notifications` module rather than sprinkling ad-hoc message strings in feature handlers. Persist: Notification Id, RecipientUserId, type, source module/id, safe localized structured presentation data, CreatedAt, ReadAt, optional deep link, dedupe/event identity, optional batch key. Storage is PostgreSQL, not SignalR/in-memory. User recovers all past unread items after days offline/refresh.

Prefer existing outbox/transactional event flow: domain commit -> durable event -> idempotent notification materialization -> SignalR `NotificationCreated` / `UnreadCountChanged`; REST provides source-of-truth list/counter. If no outbox, add the smallest reliable durable processing mechanism needed; do not build Kafka or a new microservice. Retry/worker restart/multiple API instances must not duplicate notifications. Scheduled reminders must be generated while frontend is offline. If an originating operation truly cannot be made durable, document its guarantee honestly.

Cover REAL implemented events, respecting ownership and visibility:

- Check-ins: newly available for a client; due soon; overdue reminder; client submitted -> coach; reviewed/coach response -> client when visible.
- Messaging: new direct/group message -> current authorized recipients except sender; new message request; accepted/declined request. Do not notify removed/banned members for messages after removal.
- Coaching/application: invitation received/responded; Lead submitted; application accepted/rejected; relationship status updated.
- Billing: new due and approaching due; confirmed payment; coach notified of client service payment; renewal; overdue; platform plan change/cancellation.
- Other existing events if truly implemented: program assigned/published, calendar invitation/change, completed video analysis, shared file.

Do not fake notifications from missing modules. Avoid irrelevant self-echo. For group check-ins, send personal notifications per assigned client; never expose another client's answers. Never expose message bodies, health data, signed storage URLs or sensitive payment details in notification payload/logs. Notification click navigates to source but ALWAYS rechecks current authorization. If user lost access, show safe unavailable state.

Preferences per user: messaging; check-ins; applications/coaching; billing/subscriptions; system. Optional category mute; preserve required account/security/billing alerts according to product policy. Only IN-APP channel required now. Email/push/SMS may be deferred unless already correctly integrated; never claim transport delivery without transport.

API, adapt to repository:
- `GET /api/v1/me/notifications` (filters/cursor or pagination)
- `GET /api/v1/me/notifications/unread-count`
- `POST /api/v1/me/notifications/{id}/read`
- `POST /api/v1/me/notifications/read-all`
- `GET/PATCH /api/v1/me/notification-preferences`.

All notifications always scoped to JWT user; no cross-account leaks.

## 8. Bell / notification UI

Add bell to existing header with unread badge/count. Popover or notification center (reuse UI primitives) with latest items, date/type, safe preview, click-through, read/unread, mark all read, filters if helpful, loading/empty/error states and a way to see older notifications. SignalR updates immediately if connected; REST refetch on reconnect or page load. No hard-coded sample notifications. Multi-account browser switching must change subscriber/query cache and not show previous account's notifications. Opening popover does not mark every notification read automatically unless there's a deliberate UX action.

## 9. Earnings -> Analyze: required UX

Replace visible sidebar/navigation text `Earnings` with **`Analyze`** and implement `/app/analyze`. Redirect old `/app/earnings` to `/app/analyze` so bookmarks survive. This is a substantial analytics workspace, NOT only a renamed earnings chart. Suggested organization: `Overview`, `Finance`, `Clients & Acquisition`, `Training & Progress`, `Check-ins & Operations` — use tabs or responsive sections suitable for existing application and design system.

Date filters: last 7/30/90 days, this month, previous month, custom dates; optional offer/group filters where meaningful. Use explicit timezone/calendar-day normalization and consistent comparison period. KPI cards with percent changes, trend charts, funnel, groupings, drill-down to source screens, tables, no-data states, export only if current infra supports it. Reuse chart/UI libraries already in project. DO NOT use random/demo chart series in production view. All analytics data must come from proper API aggregations.

### Finance (coach perspective)

- settled gross client-service purchase amount;
- platform fee amount;
- coach net earnings;
- pending/unpaid due amount;
- payment counts, average settled order value;
- payment time-series;
- top offers and revenue by offer/service/billing type;
- recurring client-service subscriptions, renewal history;
- MRR if definable using documented weekly/monthly/yearly normalization;
- average revenue per paying client, where sensible;
- breakdown simulated vs externally recorded settlement;
- comparisons with previous period.

Definitions: settled paid records count once; unpaid dues are not revenue; gross != coach net; platform Pro payment is NOT coach earning; historical fee snapshot is authoritative; no sum across different currencies into single value (separate/filter by currency); distinguish MRR from received cash; no invented real-cash metric.

### Clients & Acquisition

- current active UNIQUE clients;
- new clients per period;
- returning/reactivated clients separately;
- active client count over time using relationship status history;
- suspended/completed counts;
- net growth and percent change;
- leads/applications by date and source;
- submitted -> accepted/rejected conversion with explicit cohort/time definition;
- invitations sent/accepted/declined;
- offer/source funnel;
- clients and revenue by offers, group breakdown;
- retention/churn where a documented and actually computable definition exists.

A person in 3 services or 2 client groups counts once in overall unique client KPI. Returning Completed->Active must not automatically be counted as a first-time new acquisition. Handle zero denominators as N/A rather than infinity/NaN. Group totals can overlap; label them accordingly.

### Training & Progress

Use ACTUAL assignments and execution logs ONLY IF implemented:
- planned/due/completed/skipped/missed sessions;
- completion/adherence percentage with explicit formula;
- workout activity trend;
- actual logged training volume and comparable lift progress when measurements exist;
- client drill-down and exercise/period filters.

DO NOT treat scheduled sets as completed reps. If training execution data is NOT yet available, show clear `No recorded training data` empty state and document dependency; do not build fake tracking or fabricate progress. Read-only currently-available program counts can be shown if correctly labeled. No invented injury/readiness scoring.

### Check-ins & Operations

- issued check-ins;
- submitted vs overdue;
- submission rate;
- pending coach review count;
- response time distribution if computable;
- trends and direct links to pending client check-ins;
- messaging activity counts where meaningful, without analyzing private message contents;
- optional outstanding leads/payment tasks counts.

Check-in groups and schedules may overlap; dedupe concrete recipient requests, never double-count one request. Never publish private health responses in aggregate charts.

## 10. Analytics architecture / APIs

Implement server-side aggregate query services, scoped to authenticated coach/workspace, with bounded validated date ranges, grouping (day/week/month), offer/group filters, stable currency semantics, indexes, efficient SQL/EF projections. Do not download all raw rows to React and aggregate there; avoid N+1/unbounded scans.

Representative API, conform to existing version/style:
- `GET /api/v1/analyze/overview`
- `GET /api/v1/analyze/financial`
- `GET /api/v1/analyze/clients`
- `GET /api/v1/analyze/acquisition`
- `GET /api/v1/analyze/training`
- `GET /api/v1/analyze/check-ins`.

Return typed values, timestamps, currency/units, comparison period and availability reason where appropriate. Document metric definitions and test them against fixtures with known expected aggregates. No need for a data warehouse or new analytics microservice at current scale.

## 11. Existing billing/subscription APIs

Reuse existing Stage 2 APIs where present and extend rather than duplicate. Representative platform and payer routes:
- `GET /api/v1/subscriptions/plans`
- `GET /api/v1/me/platform-subscription`
- `POST /api/v1/me/platform-subscription/checkout`
- `POST /api/v1/me/platform-subscription/confirm-payment`
- `POST /api/v1/me/platform-subscription/change-plan`
- `POST /api/v1/me/platform-subscription/cancel-renewal`
- `GET /api/v1/me/platform-subscription/history`
- `GET /api/v1/me/orders`
- `GET /api/v1/me/payment-dues`
- `POST /api/v1/me/payment-dues/{id}/confirm-payment`
- `GET /api/v1/me/payment-history`.

Adapt route names to repo. Client's service purchase is a different billing context than platform plan checkout. Buyer identity and actual amounts derive from JWT/server records, NEVER payload-provided totals.

## 12. Database/migrations/Supabase

Continue repo's actual migration source of truth (EF Core if already used). Reuse Stage 2 Orders, Dues, Attempts, Transactions and service subscriptions; DO NOT create shadow financial tables. Add only missing `PlatformPlans/PlanPrices/PlatformSubscriptions/PlanChangeHistory`, Notifications/NotificationPreferences/outbox processed-event keys, indexes and check constraints. Preserve all historic clients/offers/messages/check-ins/payments.

Can apply NON-DESTRUCTIVE migrations to ONLY an unambiguously verified Supabase DEVELOPMENT database (host/project ref + migration history confirmed). Never apply to production or guess project identity. If unverified: code/local migration tests only and report blocked remote application. No new business data through supabase.from/Data API; keep private schemas, correct grants/RLS, least-privilege runtime role. Do not modify managed auth/storage schema. `auth.uid()` is not automatically set on ordinary Npgsql connections. Test clean migration AND Stage 1-3A upgrade with representative data. Read current Supabase docs/changelog before actual migration changes.

Constraints/indices needed: one current platform subscription per owner; unique renewal per billing interval; unique settled payment/due idempotency; unique notification per recipient/source event; owner/date/status indexes; proper immutable historical price/fee snapshots; no destructive cascade of financial or notification history.

## 13. Concurrency/security

Test double-click Confirm payment, concurrent purchase, renewal worker retries, plan downgrade timing, historic fee snapshots, notification event retries, unread/read isolation, and analytics double-counting. Payment settlement and relevant outbox creation must be durable/atomic where required. Money values decimal, not float.

Security: Supabase JWT verified in ASP.NET; never accept mutable `user_metadata` as entitlement source; no service-role keys in client; no card PAN/CVC/expiry; notification recipient based on domain access; check-in/message notifications must not disclose sensitive data; no cross-coach access to financial/customer analysis; a client being shared by two coaches does not merge their financial or coaching records. SignalR user-scoped and reauthorized. Multi-account React caches/subscriptions isolated per identity. Logs redact sensitive data.

## 14. Tests and acceptance checks

Run existing tests before changes; implement unit and PostgreSQL integration tests, and frontend interaction/E2E tests where harness supports them. At minimum verify:

1. All capability checks allow both Free and Pro for EVERY currently implemented feature; resource ownership still enforced.
2. Pro price comes from backend config; absent price shows honest unconfigured state.
3. Free activation produces no dummy provider charge.
4. Paid plan/service checkout at valid price -> one simulated successful settlement.
5. Two confirm clicks -> exactly one transaction/fee posting.
6. Confirmation without saved card works; no PAN/expiry/CVC stored.
7. Auto-renew executes only when enabled and payment method eligible; otherwise due waits for manual confirmation.
8. Repeated renewal jobs don't produce duplicate periods/payments.
9. Free->Pro and Pro->Free/cancellation dates work; old history preserved.
10. Coach Free 10% / Pro 5% client-service fee snapshots correct; Pro platform payment not counted as coach earnings.
11. PaymentDue awaiting settlement is NOT counted as settled revenue; external settlement is labeled external.
12. New message notifies authorized recipient but not sender or removed group member.
13. Check-in available/due/overdue/submitted/reviewed events target correct recipients, are retry-safe and persist offline.
14. Lead, invitation and payment events create notifications only for correct user.
15. Mark-read/read-all cannot modify someone else's notifications; counts recover after reconnect.
16. Simulated provider state and notifications are not fabricated only in React.
17. Header has Subscription instead of New Program; Programs still has create action.
18. Analyze replaces Earnings and legacy URL redirects.
19. Analytics filters/date buckets correct; no cross-account/coach leaks.
20. Three services for one client counts one unique client; overlapping groups don't duplicate totals.
21. Finance gross/fee/net calculations match known fixtures, with no double-counting and no cross-currency sum.
22. Lead funnel/reactivation metric formulas match documented definitions; zero denominators handled.
23. If training execution missing, UI shows accurate empty state and no fake progress.
24. Check-in rates count actual issued/submitted requests and no duplicates.
25. Existing authentication, offers, forms, check-ins, chat, billing, programs and existing pages still work.
26. Migrations preserve existing data, required grants and runtime DB permissions.

## 15. Deliverables and end condition

Update OpenAPI, generated API client/types if used, feature catalog, architecture docs, financial metric definitions, frontend routes and UI. Include dev smoke scenario with two coaches, clients, offers with differently priced payments, submitted check-ins and real chat messages, one Free and one Pro plan, and known expected analytics figures. Only use explicitly labeled dev fixture data; never show it as real customer statistics.

Final report MUST separate: `IMPLEMENTED`, `TESTED`, `MIGRATIONS CREATED`, `APPLIED TO DEV`, `NOT APPLIED`, `BLOCKED`, `DEFERRED`. Include concrete tests/commands, actual paths/endpoints, plan price configuration, status of simulated payment integration and actual nonempty/empty analytics sources. Do not claim real money charged, emails/push delivered, or client training progress tracked unless those systems truly exist. Do not push/deploy production without authorization.

STOP after this stage. Do NOT proceed automatically to WebRTC/Calls/Meetings/Calendar.

**Expected acceptance:** A coach sees top-right Subscription and notification bell, can confirm a normally-priced simulated Pro or client-service purchase and see its actual persisted paid record, can review durable notifications originating from genuine check-ins/messages/billing and can open Analyze (instead of Earnings) to inspect truthful financial, client growth/acquisition and operational statistics and real training metrics when recorded.
