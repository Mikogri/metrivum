# Training Plan Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace plan publication with applied revisions, automatically update assignments, and sell independent client-owned plan copies after payment.

**Architecture:** Reuse Training revisions and delivery rules. Keep product intake distinct from coaching activation, with a typed Training fulfillment contract invoked inside Billing's existing ModuleTransaction. The buyer library merges authorized assignment summaries and owned purchases, never private seller drafts.

**Tech Stack:** ASP.NET Core/.NET 10, EF Core/PostgreSQL, React/TypeScript, existing Vitest and PostgreSQL integration suites.

**Spec:** `docs/superpowers/specs/2026-10-10-training-plan-ownership-design.md` (approved by the user).

## Global Constraints

- Autosave keeps a private draft; Apply changes alone changes the effective version.
- Include today's unstarted workouts, using each assignment's timezone. Preserve past workouts and all execution snapshots/results.
- Purchases deliver an independent editable personal copy, never a coaching assignment or an implicitly activated relationship.
- No plan content, exports or source-library access before settlement.
- Module boundaries use Contracts; one physical transaction commits settlement and delivery.
- Existing drafts, revisions, services and payment records remain compatible. All code/docs/UI copy are English.
- Preserve the preexisting dirty tree. Stage only changes attributable to this task; do not commit unrelated accumulated work.

## Review Focus

1. Applying while a workout starts must produce one consistent prescription, never overwrite the new execution (Task 1).
2. DST/local-midnight boundaries must update today's workouts according to the client's timezone (Task 1).
3. Team/private ownership and a malicious source revision ID must not expose another coach's plan (Tasks 2–3).
4. Formula/exercise snapshots must remain usable when the seller archives the source (Task 3).
5. Payment retry or lost response must not create multiple copies or expose content before commit (Tasks 3–4).

### Task 1: Applied revisions and shared assignment refresh

**Files:** `backend/modules/Training/TrainFlow.Training/Features/TrainingService.cs`, `Delivery/TrainingDeliveryService.cs`, new `Delivery/AssignmentRevisionUpdater.cs`, `ModuleRegistration.cs`; existing `tests/Integration/TrainFlow.IntegrationTests/TrainingDeliveryPostgresTests.cs`.

**Interfaces:** `TrainingService.ApplyAsync(Guid id, long expectedVersion, string idempotencyKey, CancellationToken ct): Task<RevisionDto>`; `AssignmentRevisionUpdater.ApplyAsync(Guid planId, Guid revisionId, CancellationToken ct): Task`. Existing PublishAsync delegates to ApplyAsync for compatibility. Explicit RefreshAsync uses the same internal refresh routine.

- [ ] Add failing PostgreSQL tests: autosave alone preserves EffectiveRevisionId; Apply advances Active/Paused/direct/group assignments, including today's unstarted occurrence; started/completed/skipped and past occurrences retain prescriptions. Assert closed/inactive-collaboration assignments remain unchanged.
- [ ] Run `dotnet test tests/Integration/TrainFlow.IntegrationTests --filter FullyQualifiedName~AppliedTrainingRevisionTests` on local PostgreSQL; record the expected behavior failure.
- [ ] Extract the current refresh algorithm, changing the date boundary to >= today. Lock plan then assignments consistently; execution-start also takes the assignment lock. Batch relationship authorization and affected occurrence/execution reads. Preserve stable historical IDs and prevent duplicate regenerated occurrences.
- [ ] Implement ApplyAsync in the existing transaction boundary; preserve expected-version checks and idempotency. An unchanged draft reuses its effective revision. Register `/api/v1/training/programs/{id}/apply` alongside the existing route using the existing authorization group and response contract.
- [ ] Add tests for concurrent apply/save/start and retry, timezone date boundaries, and transaction rollback during assignment refresh. Run these and existing TrainingDelivery tests to PASS.

### Task 2: Product offer and reviewed purchase intake

**Files:** `backend/modules/Offers/TrainFlow.Offers.Contracts/IOfferLibrary.cs`, Offers `Domain/OfferEntities.cs`, `Domain/OfferRules.cs`, `Features/OffersService.cs`, `Infrastructure/OffersDbContext.cs`; Coaching `Domain/IntakeEntities.cs`, `Features/IntakeDtos.cs`, `Features/CoachingIntakeService.cs`, `IntakeRegistration.cs`; Billing Contracts `IBillingOrders.cs`; new `tests/Integration/TrainFlow.IntegrationTests/PlanPurchaseIntakeTests.cs`.

**Interfaces:** add `OfferPurpose { CoachingService, TrainingPlan }` to draft/revision/quote DTOs with the compatible CoachingService default. Add `BillingModel.OneTime` for plan sales. AcceptApplicationRequest gains optional `Guid? TrainingPlanRevisionId`. Add `CreatePlanPurchaseOrderCommand(Guid ApplicationId, Guid CoachId, Guid ClientId, Guid OfferRevisionId, Guid BillingOptionId, Guid TrainingPlanRevisionId, SettlementMode SettlementMode, Guid? TeamId)` and `IBillingOrders.CreateForPlanPurchaseAsync(command, ct): Task<ServiceOrderSnapshot>` (retain existing order/payment identifiers and amounts; no service is created).

- [ ] Add failing tests for one-time offer validation and reviewed plan-sale acceptance: frozen amount/form/revision, required source selection, foreign source rejection, and zero new relationships/services/assignments.
- [ ] Run the focused test class to establish RED.
- [ ] Persist purpose through immutable offer revisions and application snapshots. Reject session counts, expiry days and recurring billing for TrainingPlan offers. Keep existing coaching validation unchanged.
- [ ] Branch the accepted application workflow by purpose after shared historical quote/submission validation. The product branch invokes typed source validation and creates the purchase order without coaching activation. Authorize seller and Team scope explicitly.
- [ ] Add additive EF migrations and snapshot updates. Default historical rows to CoachingService. Test old offers/intake, application retries and concurrent acceptance; run tests to PASS.

### Task 3: Atomic delivery and independent ownership

**Files:** new `backend/modules/Training/TrainFlow.Training.Contracts/ITrainingPurchases.cs`; new Training `Purchases/TrainingPurchaseService.cs`, `Purchases/TrainingPurchase.cs`, `Purchases/PurchaseEndpoints.cs`; Training `Infrastructure/TrainingDbContext.cs`, `Features/TrainingService.cs`, `Features/ImportExport.cs`, `ModuleRegistration.cs`; Billing `Domain/PlatformEntities.cs`, `Domain/BillingEntities.cs`, `Features/BillingService.cs`, `Infrastructure/BillingDbContext.cs`, module project references; new `tests/Integration/TrainFlow.IntegrationTests/TrainingPurchaseTests.cs`.

**Interfaces:** `ITrainingPurchases.PrepareAsync(Guid orderId, Guid revisionId, Guid sellerId, Guid buyerId, Guid? teamId, CancellationToken ct): Task` freezes the authorized deliverable; `FulfillAsync(Guid orderId, CancellationToken ct): Task<Guid>` idempotently creates/returns the buyer's plan ID. These internal methods require the owning transaction and never accept a browser-supplied paid flag. Add BillingContext.TrainingPlan; product references must not masquerade as service/relationship IDs.

- [ ] Add failing tests for unpaid buyer/stranger denial on detail, source revision, export and previews; payment decline leaves no owned copy; settled payment creates exactly one buyer-owned copy.
- [ ] Run the new test class to RED.
- [ ] Create a typed purchase record with unique OrderId, seller/buyer/source provenance and frozen delivery data; separate safe purchase summaries from protected content DTOs. Make product-order relationship/service references optional only for the new context, with explicit check constraints preserving existing coaching invariants.
- [ ] Call FulfillAsync from successful centralized settlement in the same ModuleTransaction, including free/external payments. Persist a personal TrainingPlan copy and purchase receipt; retain the frozen exercise/formula values required for independent use. Never copy a private media URL as authorization.
- [ ] Authorize buyer access/edit/export to the owned copy without giving clients access to the coach library, coach-only features or source formulas. Add owner-scoped list indexes and unique fulfillment constraints.
- [ ] Test concurrent payment retries, rollback after copy creation, seller archive/edit, revoked collaboration, copied formula evaluation and Team ownership. Run existing OffersBilling/Platform/Team regression tests to PASS.

### Task 4: Apply UI and client Training plans

**Files:** training `components/PublishDialog.tsx`, `api.ts`, `queries.ts`, `editor/useEditor.ts`, `editor/EditorWorkspace.tsx`, `routes/program-detail.tsx`, `generator/GeneratorScreen.tsx`, `delivery/Assignments.tsx`; new `purchases/TrainingPlans.tsx`, `purchases/PurchasedPlan.tsx`; coaching `offer-editor.tsx`, `offer-validation.ts`, `pricing.tsx`, `routes/application.tsx`, `routes/offer-public.tsx`, `settlements.tsx`; `apps/web/app/layouts/components/nav.ts`, route registration and existing i18n dictionaries.

**Interfaces:** Apply uses the new endpoint and existing RevisionDto; the client library consumes paginated authorized purchased/assigned summaries. Pending purchase responses never contain a TrainingDocument. Regenerate `contracts/generated/openapi.json` and `api.d.ts` before consuming added DTOs.

- [ ] Add failing editor tests: Apply waits for queued autosave, uses the resulting version, disables duplicate clicks and reports failed saves without applying. Add intake/library tests for locked/unlocked content and purchase filters.
- [ ] Run focused Vitest tests to RED.
- [ ] Replace publication wording/actions with Apply changes and version history. First assignment offers Apply changes and assign; later assignments use the effective revision. Remove manual refresh as the normal workflow, preserving the API compatibility path.
- [ ] Add offer-purpose/one-time-price fields and source plan selection during acceptance. Show pending payment status without the plan contents; use standard spinners and toasts.
- [ ] Add client Training plans with All/Assigned/Purchased filters, retaining My training for scheduled execution. Reuse existing plan viewer/editor with owner-specific capabilities. Invalidate plan/schedule/purchase queries after successful mutations and payment responses.
- [ ] Run focused tests, `npm run typecheck`, lint on changed files and `npm run build` to PASS. Verify client/coach navigation and failed-payment UI with browser fixtures.

### Task 5: Migration, regression verification and documentation

**Files:** module EF migration directories, `infra/runtime-grants.sql` if new tables require grants, `docs/features/training.md`, `docs/coaching/stage-02.md`, `docs/frontend/coaching.md`, `CHANGELOG.md`, generated contracts.

- [ ] Verify fresh local migrations and roll-forward against an existing local database; verify legacy revisions, nullable references, owner indexes and financial immutability triggers.
- [ ] Run .NET unit tests and all affected Training/Offers/Billing/Coaching integration suites. Add HTTP integration checks for new routes and purchase privacy, including manipulated identifiers and exports.
- [ ] Confirm DEV project identity and migration histories; apply only the reviewed additive migrations to authorized TrainFlow DEV, then check schema ownership and representative runtime grants. Do not apply production migrations.
- [ ] Document autosave/apply, today's update boundary, purchase ownership, payment gating and API compatibility. Run `graphify update .` and whitespace checks.
- [ ] Review the exact diff against the starting dirty tree; report tests, migration status and any remaining limitation. Commit only task-owned changes after the selective staged diff is verified, never unrelated preexisting edits.

## Execution record — 2026-10-10

Implementation complete for Tasks 1–4. Tests live beside their existing PostgreSQL fixtures rather than introducing a parallel fixture framework. The shared assignment updater stays internal to Training; settlement calls the typed Training purchase contract inside ModuleTransaction.

- Verified draft/apply separation, today's unstarted refresh, retained execution history, retry/no-op handling, and existing Training delivery regressions.
- Verified intake-to-payment HTTP flow: no coaching relationship/service, locked source/draft/revision/export before payment, owner-only copy read/edit afterward, and no assignment side effect.
- Verified simulated decline/success, external and zero-price settlement, concurrent retries, one receipt/copy, immutable purchase data, seller archive independence and frozen private formula values.
- Fresh reviewer identified client content-feature role gates and revoked Team seller access. Regression tests reproduced both issues before fixes. Shared feature policy now allows owner-scoped client content operations while coach creation/templates/formulas/assignments stay restricted. Team settlement uses the existing Team policy and membership lock.
- DEV migrations applied: Offers `20261009234129_PlanSales`, Billing `20261009234144_PlanPurchaseOrders`, Training `20261009234137_PlanPurchases` and `20261009235338_ProtectPlanPurchases`. Runtime grants checked; no anon/authenticated/worker access to purchases.
- Verification: 215 .NET unit tests, 86 affected PostgreSQL integration tests, 59 targeted frontend tests. Frontend typecheck, targeted lint and production build checked separately. Browser-driven E2E was not run; HTTP integration covers the server purchase journey.
- Ruling: retain legacy revision route/DTO names for compatibility; UI uses Apply changes. Cost: internal historical names remain.
- Existing accumulated uncommitted work is preserved. No blanket staging or commit of unrelated changes.

The checklists above preserve the original plan, including broader exploratory test scenarios; this execution record states the checks actually performed.