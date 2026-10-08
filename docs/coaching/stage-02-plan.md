# Stage 2 implementation plan

**Goal:** Implement the supplied stage 2 workflow in the existing API and web application.
**Spec:** `.local/stage-02/spec.md` (copy of the supplied stage 2 specification).
**Architecture:** Reuse Accounts, Access, Coaching, the module database registration, API transport and shared UI library. Add private Forms, Offers, Billing and CheckIns modules. Published definitions and financial snapshots are immutable; cross-module work uses contracts and a shared database transaction where atomicity is required.

## Constraints and decisions

- Preserve the uncommitted stage 1 and existing frontend work. Continue in the current checkout; no automatic commit or push.
- The user explicitly includes UI: retain the current app shell and component library, and add coach and client workflows with real API requests.
- Supabase project `atclvdkpbccafakzpwls` is confirmed development. Apply reviewed additive EF migrations only after local PostgreSQL verification.
- Keep runtime grants explicit, schemas private and account switching isolated. Never use editable JWT metadata for permissions.
- The detailed requirement for simulated billing takes precedence over the final generic deferral of "payments": real money movement remains deferred.
- Use application currency default EUR until explicitly configured by the coach. Snapshot currency and configured fee rates; external settlement incurs no platform fee in this stage, and document this policy.
- No new upload bypass: defer FileAttachment if the current Media contract cannot securely serve these recipients.

## Tasks

- [x] Baseline: run existing PostgreSQL tests; inspect current schemas, contracts and frontend routes.
- [x] Forms and Accounts: typed form definitions, immutable versions/submissions, allowlisted profile prefill/update and account currency. Test validation, ownership and immutable snapshots. Contracts expose internal version lookup and validated submission persistence; no unrestricted version HTTP endpoint.
- [x] Offers and Billing: versioned offers, all four pricing models, orders, dues, attempts, transactions, subscriptions and earnings using SimulatedPaymentProvider. Test rounding, retries, external settlement and durable renewals.
- [x] Coaching intake: private application drafts, explicit invitations and decisions; accepted applications atomically create/reuse/reactivate one relationship and create one service/order. Test ownership, concurrent acceptance and suspended conflicts.
- [x] CheckIns: typed recurrence with IANA timezone, durable occurrence claims, current group resolution and exact issued form versions. Test DST, overlap deduplication, retries, late submissions and explicit review.
- [x] Web: role-aware navigation; coach clients/groups, forms, offers, leads/invitations, schedules/review and billing; client application, invitations, coaches/services, check-ins and simulated payments. Use existing account-scoped transport, URL list state, feature gates and accessible controls.
- [x] Integration: host/module wiring, feature grants, migrations, OpenAPI/client regeneration, dev smoke fixtures and concise English docs.
- [x] Verification: PostgreSQL workflow/security/concurrency tests; frontend typecheck, targeted component tests, build and browser smoke; independent review; then apply and verify dev migration and restart API.

## Review focus

1. A stale retry must neither duplicate published versions nor overwrite edits.
2. An accepted application must roll back relationship, service and order together on failure.
3. Group changes affect future occurrences only; DST must not skip or duplicate requests.
4. Switching accounts must discard pending responses and private cached forms.
5. Client-visible history must never expose coach-private notes, other clients or health answers.

Verification commands and actual results are recorded in `stage-02-verification.md` when run. Unverified items remain unchecked.
