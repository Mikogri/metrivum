# Messaging — Stage 03A

PostgreSQL is the history source of truth. SignalR provides best-effort notifications after commit; a transport failure cannot undo a message. Reconnect through REST, merge by message ID, and refresh conversation summaries. The current transport supports one API instance; there is no Redis/Azure backplane, durable notification queue, or online-presence service.

## Ownership and access

`backend/modules/Messaging/Metrivum.Messaging` owns the private `messaging` schema: Conversations, Members, MembershipChanges, Messages, Attachments, Requests, Blocks and Reports. Accounts owns trusted identity/account projections, Access owns entitlements, Coaching owns relationships and client groups, and Media owns private objects. Modules communicate through contracts; Coaching changes and linked-chat synchronization share a database transaction. Notifications run after the outer transaction commits.

Every operation checks the current JWT account, capability and resource membership. Coach and Client roles can receive `messaging.direct`, `messaging.groups`, `messaging.group.manage`, `messaging.attachments`, `messaging.voice` and `messaging.report`. A group-only grant works independently of direct messaging. User metadata cannot grant access. Runtime can insert/read messages, reports and membership history but cannot update/delete that evidence or create database objects. Supabase `anon`/`authenticated` roles cannot access the schema.

## Conversation and membership rules

- **Direct:** one canonical conversation per pair. An active coach/client relationship allows creation immediately; otherwise an accepted MessageRequest is required. Existing direct conversations remain available after relationship suspension/completion. Blocking in either direction prevents direct sends and requests but preserves previous history; it does not affect shared groups.
- **Group:** owner-created chat with manual members. Owner/admin management requires `messaging.group.manage`. There is no public join endpoint or role-promotion endpoint.
- **ClientGroupLinked:** created explicitly by the owning coach for an existing Coaching group. Active relationships synchronize eligible members. Suspension, completion, removal or group archive removes future synced access; resume restores eligible members. Manual chat membership survives synchronization. Explicit exclusion/ban wins over synchronization until cleared.

Joining grants access to previous history. Removal/leave/ban preserves a sequence cutoff: the former member can read only messages and attachments at or before that cutoff, cannot send or type, and receives no new conversation events. Repeated removal does not advance the cutoff. Rejoining restores full history. Historical members receive only their own membership metadata, not future group membership changes.

Messages are immutable. Only the authenticated sender is used; clients cannot submit another sender. Replies reference an accessible message in the same conversation. Reports require accessible evidence and retain an immutable snapshot after later membership changes. Moderation review UI/workflow is outside this stage.

## REST reference

All routes require a bearer JWT. JSON fields are camelCase; enums are strings. Failures use the existing ProblemDetails contract. Unauthorized resource IDs generally return 404; inactive membership, blocked communication or missing capabilities return 403. Invalid input returns 400; conflicting idempotency payloads return 409. Successful JSON operations below return 200 unless stated otherwise. Full DTOs are generated in `contracts/generated/api.d.ts` and OpenAPI.

Prefix **`/api/v1/messaging`**:

| Method and path | Input | Result / behavior |
|---|---|---|
| GET `/conversations` | `search?`, `page?` (default 1, max 1000000), `limit?` (default 25, max 100) | `ConversationDto[]`: type/title, membership state, visible last message, unread count, safe member projections. Searches titles and participant names; paging applies after authorization and sorting. |
| POST `/conversations/direct` | `{ userId }` | Canonical `ConversationDto`; concurrent/repeated requests reuse the same pair. Strangers get `MESSAGE_REQUEST_REQUIRED`. |
| POST `/conversations/group` | `{ title, userIds }` | New group `ConversationDto`, caller becomes owner. |
| GET `/conversations/{id}` | — | Authorized `ConversationDto`. |
| PATCH `/conversations/{id}` | `{ title }` | 204; owner/admin renames a group. |
| GET `/conversations/{id}/messages` | `before?` or `after?`, `limit?` (default 50, max 100) | `MessagePage { items, olderCursor, newerCursor }`; membership cutoff applies. |
| POST `/conversations/{id}/messages` | `{ type, body?, replyToMessageId?, mediaIds? }`; required `Idempotency-Key` header | Persisted `MessageDto`, including safe attachment metadata and cursor. Repeating the same key/body returns the existing message. `System` cannot be submitted. |
| POST `/conversations/{id}/read` | `{ messageId }` | 204; advances only the caller's durable read marker. |
| GET `/conversations/{id}/members` | — | Authorized `MemberDto[]`. |
| POST `/conversations/{id}/members` | `{ userId }` | 204; add/rejoin as a manual member. |
| DELETE `/conversations/{id}/members/{userId}` | — | 204; remove with retained cutoff, or leave as self. |
| POST `/conversations/{id}/members/{userId}/ban` | — | 204; exclude from future synchronization. |
| POST `/conversations/{id}/members/{userId}/unban` | — | 204; clear exclusion, restore if currently eligible. |
| GET `/requests` | `page?`, `limit?` | Own sent/received `RequestDto[]`, including state and accepted conversation ID. Without parameters, retains the 100-row limit; opting in defaults to page 1/limit 25 (max page 1000000/limit 100). |
| POST `/requests` | `{ userId, body }` | `RequestDto`; one pending request per canonical pair. |
| POST `/requests/by-username` | `{ username, body }` | `RequestDto`; exact active username lookup with the same capability/block rules. Own request lists include optional display names. |
| POST `/requests/{id}/accept` | — | Recipient accepts; `RequestDto` includes direct conversation ID. |
| POST `/requests/{id}/decline` | — | Recipient declines; `RequestDto`. |
| POST `/requests/{id}/cancel` | — | Sender cancels; `RequestDto`. |
| POST `/messages/{id}/report` | `{ category, details? }` | `{ reportId }`; durable evidence snapshot. |
| GET `/messages/{messageId}/attachments/{mediaId}` | — | Authorized binary stream; content type, attachment disposition and `nosniff`. Rechecks historical visibility; never exposes object paths. |
| POST `/uploads/` | `{ name, contentType, size }` | `UploadTicket { file, uploadUrl, expiresAt, method }`; signed non-overwriting upload. |
| POST `/uploads/{id}/finalize` | — | Ready `MediaDto` after owner/purpose, byte-size, type/signature and audio-duration validation. |
| DELETE `/uploads/{id}` | `If-Match: "version"` | 202 for unreferenced owned messaging uploads; referenced media returns `MEDIA_IN_USE`. |

Other routes:

| Method and path | Result |
|---|---|
| GET `/api/v1/me/blocked-users` | Own blocked user ID array. |
| POST `/api/v1/me/blocked-users/{userId}` | 204; block direct communication. |
| DELETE `/api/v1/me/blocked-users/{userId}` | 204; unblock. |
| GET `/api/v1/coaching/groups/{groupId}/conversation` | Owning coach gets existing linked `ConversationDto`; does not create one. |
| POST `/api/v1/coaching/groups/{groupId}/conversation` | Owning coach creates/reuses linked `ConversationDto`. |

## Ordering, reads and reconnect

Conversation summaries are ordered by the latest incoming non-system message visible to the caller, before applying the limit. Own sends do not affect this order. Conversations without incoming messages follow; creation time descending and ID break ties. Removed members' cutoff also applies to ordering.

Messages carry an opaque cursor bound to their conversation, ordered by `(CreatedAt, Id)`. Never manufacture cursors or combine `before` and `after`. Initial/older pages are newest-first; `after` pages are oldest-first so reconnect can drain missed messages. Continue from returned message cursors, merge by ID, and stop when no items remain. Database locks enforce a strictly increasing microsecond timestamp even with a frozen/backward clock; IDs break ties in existing history.

Each conversation also has an internal monotonic sequence. Read state advances to an accessible message sequence and never moves backward. Unread counts exclude the caller's own messages and respect removal cutoffs. `ReadMarkerChanged` is an invalidation event; refetch conversation/member state. No message body/full-text search or conversation-list cursor is supplied in this stage.

## SignalR contract

Endpoint: **`/api/v1/messaging/hub`**. Use the current account's Supabase access token via the SignalR access-token factory. Negotiation/REST require the Authorization header. Only WebSocket/SSE transport on the exact hub route accepts `access_token` in the query. Connections close at authentication expiration; account switching must dispose the old connection and clear account-specific cache/cursors. Do not log signed URLs or access tokens.

Client calls: `Subscribe(conversationId)` validates active access; `Typing(conversationId, typing)` publishes ephemeral state. Delivery targets currently eligible users, not remembered conversation groups, and rechecks blocks, membership and features. Typing is throttled per connection/conversation to 750 ms, expires after five seconds, and is never stored.

| Server event | Payload / client action |
|---|---|
| `MessageCreated` | `MessageDto`; merge by ID. |
| `ConversationUpdated` | `{ conversationId }`; refresh summary. |
| `MembershipChanged` | `{ conversationId, userId? }`; refresh membership/summary. Removed users do not receive subsequent events. |
| `ReadMarkerChanged` | `{ conversationId, userId }`; refresh read/unread state. |
| `MessageRequestCreated`, `MessageRequestUpdated` | `RequestDto`; refresh own request list. |
| `TypingChanged` | `{ conversationId, userId, typing, expiresAt }`; expire locally. |

TypeScript event/method contracts: `contracts/messaging-events.ts`. Notifications may be lost or duplicated and are not a delivery receipt; HTTP history is authoritative after reconnect.

## Private Media and voice

Upload, finalize, then send the returned Media ID. Upload bytes directly with the ticket's method and matching Content-Type. The service validates ownership and ready state again when attaching, pins the object against deletion, and authorizes every subsequent download through the message. A signed upload URL grants only that upload, not private reads or overwrite.

Supported types: PNG, JPEG, GIF, WebP, PDF, plain text, ZIP, MP4, WebM and PCM WAV. Generic files are downloaded as attachments. Validation checks bytes/signatures and declared MIME/size; it is not malware scanning or full image/video decoding. Uploaded videos are stored files and do not invoke analysis or calls.

`VoiceMessage` requires exactly one PCM WAV, with duration derived from actual RIFF/fmt/data bytes, not client metadata. Default maximum duration is five minutes. Compressed browser recorder formats such as Opus are not accepted yet; clients must supply supported WAV. No transcription, inference or waveform processing runs.

`Storage:MaxAttachmentBytes` defaults to 64 MiB (hard validation ceiling), `Storage:MaxVoiceDurationMs` to 300000. `Messaging` defaults: MaxAttachments 10, MaxAttachmentBytes 100 MiB total per message, MaxVoiceDurationMs 300000, MaxGroupMembers 500. The lower Media/bucket limits also apply. The confirmed dev bucket `trainflow-private` is private and capped at 50 MiB per object; local dev configuration matches that cap. Storage credentials remain server-only in ignored local configuration. Production storage remains an explicit operational setup.

## Development and migrations

See [verification](messaging-verification.md) for executed checks. EF migrations are the source of truth; `infra/export-messaging.ps1` exports the pinned Media/Messaging/Access upgrade plus explicit runtime grants. `infra/test-messaging-migrations.ps1` verifies clean/upgrade paths only on loopback test databases. It requires the recorded pre-messaging SQL baseline and a current clean export; it never targets Supabase.

Apply migrations with the existing explicit `--migrate` command and migration-role connection, then `infra/runtime-grants.sql` as schema owner. Run the API using only `trainflow_api`. For real PostgreSQL tests set `TRAINFLOW_TEST_DATABASE` to a disposable local administrator connection. Regenerate REST contracts with `infra/export-contracts.ps1` and typecheck `contracts/messaging-events.ts` after DTO/event changes.

The guarded console accepts `--stage 3a`, `--confirm-test-accounts true`, `--coach-a`, `--coach-b`, `--client-c`, `--client-d`, and optional `--user-e`. Use existing onboarded test accounts and the restricted runtime connection. It creates direct/linked chats, text/reply/read state, a manual member and a ban. Attachment options accept ready owned IDs (`--image-media`, `--file-media`, `--video-media`, `--voice-media`) or local fixture files (`--image-file`, `--file-file`, `--video-file`, `--voice-file`) through configured private Storage. Re-running uses stable message keys. Remote fixture execution additionally requires `--confirm-project atclvdkpbccafakzpwls`; there is no fixture HTTP endpoint or production identity bypass.

The [Messaging frontend](../frontend/messaging.md) now provides conversations, requests, attachments and browser voice recording. Calls, meetings, WebRTC, calendar changes, presence, transcription and the moderation review workflow remain deferred.
