# Messaging delivery evidence

## Implemented

- New direct contact is open by default. `messaging.Preferences.RequireApproval` is an explicit opt-in; no historical account is silently opted in. Existing conversations retain their consent state.
- Pending introductions are persisted immediately in the direct conversation. Conversation responses expose `request`, `canSendMessages`, and `canUploadAttachments`. Acceptance keeps the introduction once; decline/cancel prevents further sends. Membership cutoffs and blocking remain authoritative.
- Sends and replies enforce consent in the transaction after pair/conversation locks. Scoped upload creation/finalization enforce the same state. Own-message deletion remains available under existing ownership/history rules.
- Invitation creation atomically persists the invitation, typed chat card, and one `InvitationReceived` durable notification with a chat link. Optional UUID `Idempotency-Key` makes HTTP invitation retries safe. Realtime is dispatched after commit.
- `POST /api/v1/coaching/form-shares` validates the current active offer and its application-form version, then writes a typed `OfferForm` card and one durable message notification. It requires UUID `Idempotency-Key`; it creates neither an invitation nor a coaching relationship.
- `CoachingChatEntry` contains only kind, invitation/offer/coach/revision/form IDs and offer title. Access to underlying private content remains with the owning module.

## Migration and compatibility

`20261011165625_UnifiedConversationConsent` expands Messaging with a nullable JSON card column and a preference table. It moves existing pending requests into conversations and preserves Pending state, introductions, blocks and existing members. It emits no notifications. Exact EF upgrade SQL is generated from `20261008173117_MessagingReadIndexes`; runtime grants include only SELECT/INSERT/UPDATE for the preference table.

The upgrade backfill is set-based and transactional, and scans pending requests and message sequences. Review pending-row volume and deployment lock time before a large production rollout; this task does not claim a production benchmark. Existing accepted/declined/cancelled request history is retained.

Legacy clients can still stage unscoped, account-owned uploads. New clients pass `conversationId` on upload creation and finalization. Pending conversations always reject message/attachment publication, including from legacy clients; unscoped staging cannot reveal content to the recipient. This explicit compatibility exception avoids breaking installed clients.

An owning-module `ReplayPendingInvitationChatsAsync` method supports bounded, cursor-based dry-run/apply replay of outstanding invitations without notifications/realtime or consent changes. It respects blocks and pending conversation restrictions; skipped rows may be retried from an earlier cursor. There is no public repair endpoint or automatic remote replay. Historical terminal invitations are not resent. Existing old form-share text remains readable.

## Verification

- Initial PostgreSQL regressions observed default stranger contact returning 403 and missing preference/form-share endpoints returning 404.
- Upgrade regression observed a legacy pending request retaining a null ConversationId before the backfill, then passed against an isolated PostgreSQL database after the migration.
- First combined Messaging/Coaching intake/media/transport/migration run: 42 passed, 1 failed because the new test incorrectly sent `fileName` instead of `name`; corrected test data.
- Final targeted run: 5 passed, 0 failed, 0 skipped (open strangers; explicit approval and send/reply/scoped upload/finalize denial; invitation retry/quiet replay/block rollback; form-share deduplication/no consent; migration upgrade).
- Local runtime-role preference INSERT/SELECT passed after the grants script; verification transaction rolled back.
- Final notification-count assertion and removal of the active-coaching exception to explicit approval are included for the parent integrated run. These last changes do not alter exported DTOs or migration SQL.

Local evidence: `.local/refactor-2026-10-11/messaging-*.log` and `test-results/messaging-*.trx`. No remote database writes, commits, or pushes were performed by this implementation task. The parent owns DEV application, final integrated tests and Graphify refresh.
