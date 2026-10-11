# Training plans: applied revisions and purchased copies

Date: 2026-10-10
Status: Implemented; verification evidence is recorded in the implementation plan.

## Intent and confirmed behavior

Autosave keeps the coach's private draft. Apply changes creates an immutable effective revision and updates assigned clients. There is no separate publication concept in the plan UI. Revision history remains available. The user confirmed that today's unstarted workouts must also update; started and completed workouts retain their original prescriptions and results.

A coach can sell a plan through an offer and application form. After reviewing the application, the coach selects the delivery plan and accepts the sale. The buyer sees the price and purchase status, but no plan content before payment. Successful payment delivers an independent owned copy, not an assignment. Future changes by the seller do not affect the copy. The client has a Training plans section containing current assigned plans and purchases.

## Existing mechanisms and gaps

- TrainingService.SaveAsync and the editor already maintain a versioned draft. PublishAsync creates immutable revisions with exercise and formula snapshots.
- TrainingDeliveryService.RefreshAsync already preserves execution history, but refresh is manual and currently excludes all workouts scheduled for today.
- CoachingIntakeService.AcceptAsync always activates a relationship and creates a coaching service. Reusing that branch for a product sale would create unintended permissions and assignments.
- Billing settlement already centralizes successful, external and free payments. Product delivery must depend on that server-owned result, never on a client redirect or UI flag.

## Proposed implementation

### Draft and apply

Retain the immutable revision storage and numbering. Add Apply changes as the public operation; preserve the previous API route as a compatibility alias to the same implementation. Update plan UI, editor, generator text, notifications and documentation. An applied revision is private, not a publicly discoverable plan.

The apply operation flushes pending editor saves, checks the expected draft version and uses an idempotency key. Creating the revision and updating eligible assignments share a transaction and consistent locking. A repeated request must neither create another revision nor refresh schedules twice. Applying an unchanged draft returns the existing effective version.

Refresh Active and Paused assignments in currently authorized collaborations, including group assignments. Update today's and future unstarted occurrences. Preserve past occurrences, started/completed/skipped executions, their identifiers and snapshots. Closed assignments and ended collaborations retain their historical version. Reuse one refresh mechanism for automatic application and the compatible explicit refresh endpoint.

Assignment uses the latest applied revision. For a plan with no applied revision, the assignment flow offers Apply changes and assign as one explicit action. Unsaved/unapplied edits never silently reach clients. Applying existing drafts is never automatic during migration.

### Plan sale

Add an explicit offer purpose: Coaching service or Training plan. Existing offers default to Coaching service. Plan purchases use a one-time server-calculated price, not a session package or recurring subscription. The session-validity setting does not expire ownership of a purchased plan.

Reuse offer revisions, form versions, submission validation and application review. For a plan sale, acceptance requires the coach to select an owned, applied plan revision. Freeze this revision for the order at acceptance; later seller edits cannot change the promised delivery. Acceptance creates a plan-purchase order without activating a coaching relationship or creating a service/assignment. Existing relationships remain unaffected.

Before payment, purchaser DTOs contain commercial metadata and state only. Training content, source revision snapshots, exercises, exports and preview endpoints remain inaccessible. Selecting a source plan by a forged ID or from another workspace must fail server-side. Apply equivalent scope checks to Team offers.

### Settlement and ownership

Extend Billing with a distinct TrainingPlan purchase context and a typed Training contract for fulfillment. Keep module DbContexts private. Reuse the current shared database transaction mechanism: settlement and copy creation commit together. Unique purchase/order identity ensures one owned copy under concurrent payments and retries. Failed/cancelled payments grant nothing; existing free-payment handling delivers a zero-price plan exactly once.

The purchased document lives in the buyer's personal library with immutable purchase provenance. Clone the accepted snapshot, including safe exercise/formula data needed for independent access; do not expose private source-library links or depend on the seller retaining the plan. Archiving the source or ending a collaboration cannot remove the delivered copy.

Proposed ownership behavior: the buyer may edit their own copy, without changing the purchased receipt snapshot or seller's plan. Private media is not made public by a purchase; any dependent attachment needs an explicit authorized delivery snapshot or is excluded from the deliverable.

### Client UI

Add Training plans in client navigation, with All, Assigned and Purchased filters. Assigned entries show the current applied version and link to execution/schedule. Purchased entries open the independent owned plan. Pending purchases show price, payment action and status without a content preview. Keep My training for scheduled workout execution.

Use the existing editor/viewer and list/card components. Apply and purchase actions show pending state, prevent duplicate submission and use existing success/error notifications. Invalidate the relevant plan, assignment, schedule and purchase queries after committed changes.

## Compatibility and migration

Additive migrations retain all current drafts, revisions, assignments and payments. Existing revisions become effective history without rewriting snapshots or results. Existing offers/orders keep their original purpose. Introduce explicit product-order references rather than fake relationship/service identifiers. Preserve restrictive runtime grants and composite owner/workspace constraints. Index owner-scoped purchase lists and the unique fulfillment identity; do not add speculative indexes.

## Verification

- Draft autosave does not change client content; applying does, including today's unstarted workouts.
- Started/completed/historical workouts and their results survive structural edits.
- Active/paused/group assignments update; closed/foreign/inactive-collaboration assignments do not leak or mutate.
- Apply/save/assignment races and repeated apply requests preserve versions and do not duplicate occurrences.
- Plan-sale acceptance creates no coaching service, relationship or assignment.
- Buyer/stranger cannot read content, exports, source revisions or private media before payment.
- Successful, free and external settlement create one copy; failed/cancelled/concurrent/retried payments do not grant early or duplicate access.
- Seller edits/archive and collaboration changes do not alter or revoke purchased content.
- Existing coaching/session billing and platform subscriptions retain their behavior.
- Frontend tests cover autosave/apply sequencing, both library types and locked purchase states; PostgreSQL integration tests cover constraints, permissions and transaction rollback.

## Delivery sequence

1. Implement applied revisions and the shared assignment refresh mechanism with regression tests.
2. Add typed plan-sale intake, order and atomic fulfillment contracts with additive migrations.
3. Add offer/review/payment UI and the client Training plans library.
4. Regenerate API contracts, run integration/frontend checks, apply verified DEV migrations, update concise documentation and Graphify.
