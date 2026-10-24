# Messaging UI

Entering Messages or returning to Chats from Blocked automatically opens the first conversation. Deep links and drafts keep their selection. Explicit mobile back navigation uses `view=list` to keep the conversation list open. Conversations are sorted by the latest visible incoming non-system message; own sends do not reorder them. Conversations without incoming messages follow, newest-created first.

Open **Messages** in either Coach or Client mode, or `/app/messages`. The route uses the same account's conversations in both workspace modes. Inner navigation below the header contains Chats and Blocked. Desktop shows a list beside the conversation; mobile opens one view at a time with a back button.

Chats requests one server page of 25 conversations. Previous/Next keep the selected thread open; search waits 250 ms and resets to page 1. A full page enables Next, including a possible final empty page with Previous available. Query keys include account, search and page. Blocked disables the route's conversation query; the shell's existing 100-summary recovery query remains active. Its unread badge covers those loaded summaries and is not a global unread total.

`app/modules/messaging` contains the route, conversation dialogs, account-scoped queries/realtime connection, attachment composer and WAV recorder. It reuses the existing UI library, API transport, feature access, account scope and draft guards. `@microsoft/signalr` is the official client; database operations always use the Metrivum API.

- Start a chat by selecting a username autocomplete result. Direct conversations are open by default. Settings → Profile → Message privacy can require approval for new conversations. A pending introduction is an ordinary chat: its recipient accepts/declines inline, and its sender keeps a visible disabled composer. Opening a private draft sends nothing; the first message creates its conversation. Groups retain their separate creation flow.
- Send text, replies, images, documents, video or a voice recording. Uploads are private, finalized before send and referenced by Media ID. Retrying an unchanged message retains its idempotency key. Download/preview uses authenticated message attachment endpoints and revokes temporary object URLs on unmount.
- Recording requests microphone access only after a click. Browser audio is decoded and encoded as mono PCM WAV, capped at five minutes, then attached to the draft. It is not sent automatically. Recording and unfinished messages participate in account-switch/navigation guards.
- Read markers advance for a visible conversation near its newest message. Removed members see earlier history without a composer. Group owners/admins can rename, add/remove, ban and unban. Direct participants can block/unblock and report messages.
- One account-scoped SignalR connection stays mounted throughout the app, with an app-bar notification center. HTTP acknowledgements and MessageCreated events merge directly into message history; read events refresh only summaries/details. Pending sends appear immediately, failed drafts remain editable, and typing events are throttled to one per 1.5 seconds. Reconnect/window focus and a 15-second poll recover missed notifications. Older messages load in pages of 50. Typing expires locally. Leaving the account stops SignalR, rejects stale callbacks/token requests, aborts uploads and discards private caches.

Backend additions for this UI: `POST /api/v1/messaging/requests/by-username` accepts `{ username, body }`, resolves an exact active account and uses the existing request/block checks. Own request-list DTOs include optional sender/recipient display names, obtained in one batched Accounts lookup. Existing ID-based clients remain compatible. The unified consent migration adds messaging preferences and preserves pending introductions inside normal conversations.

## People search

Deleting a message requires confirmation. Image previews sit outside text bubbles; voice playback
and recorder preview share plain icon controls. Opening a conversation starts at its newest message
and follows delayed image resizing only while the reader stays near the bottom. Conversation and
notification read actions update account-scoped caches immediately, with rollback and server
reconciliation on failure. Notification labels say "Message received" without changing event names.

`GET /api/v1/messaging/people?search=<username-prefix>` requires messaging access and returns at most 20 `{ userId, username, displayName }` results. Only active, onboarded accounts match; the caller and accounts blocked in either direction are excluded. No email, phone or profile details are returned. Search waits 250 ms after typing. Existing POST request endpoints remain compatible; no schema migration is required.

The current backend treats people without an active coaching relationship or accepted request as requiring consent; there is no separate public/private messaging setting yet. Message timestamps remain available in accessible labels, not below bubbles. Only the final own bubble shows Sending, Sent, Read or a retry status; entering a send clears the composer immediately and failure restores its draft. UUID `clientMessageId` values correlate optimistic bubbles with HTTP/SignalR acknowledgements. Read markers apply to all loaded messages up to the marker. Direct headers show the peer display name and @username. Message bubbles have backgrounds only; date separators have plain text.

## Verification

- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: passed. `npm.cmd test`: 123 passed across 32 files, plus the provider regression test (1 passed).
- `npm.cmd run e2e:coaching -- messaging.spec.ts`: sixteen tests across desktop/mobile covering reply/send retry identity, requests, direct creation, draft preservation, removed-member history, viewport fit and private upload token isolation. Screenshots inspected in `.local/messaging/ui-desktop.png` and `ui-mobile.png`.
- Messaging unit tests also cover immediate summary-to-history synchronization, open-chat notification suppression and sound deduplication. Existing tests cover microsecond ordering/deduplication, file-type rules, actual PCM WAV header/sample bytes and disposal/stale callbacks on account changes.
- With local `TRAINFLOW_TEST_DATABASE`, `dotnet test tests/Integration/TrainFlow.IntegrationTests -c Release --no-restore --filter 'FullyQualifiedName~Messaging' --nologo`: 22 PostgreSQL/transport/Media tests passed, including incoming-message conversation ordering before limits, exact-username requests and block enforcement.

Browser tests use explicit mock sessions and intercepted API responses. They do not claim a live authenticated two-browser exchange or a physical microphone recording. Private Storage and backend persistence were independently verified in [Stage 03A](../coaching/messaging-verification.md). Current limits: one SignalR API instance, up to 100 conversation/contact summaries in shell recovery polling (the Chats list is pageable), supported attachment types from the backend, and no calls or transcription. No publication or Git push.

## Notifications

The app bar bell combines unread conversation previews, incoming pending message requests and pending coaching invitations. It uses account-scoped API queries; opening a preview navigates to the corresponding conversation/request/invitation. The Messages nav badge is shown outside Messages, including in the collapsed sidebar; each conversation retains its own unread count. Current summaries are capped at the existing API limits (100 conversations/requests and 100 invitations), rather than a separate durable notification archive.

One global SignalR connection updates messages. Notifications also refresh every 15 seconds for invitations and reconnect fallback. Summary polling immediately merges newly discovered messages into cached history and refreshes it to recover any gaps. A short Web Audio tone plays for new incoming messages/requests, including the open conversation. The open conversation is excluded from the notification center and its count. Initial history and duplicate realtime/poll events stay silent. Audio requires a browser user gesture, throttles bursts, and can be muted per account from the bell panel. No browser push permission is requested; this is an in-app notification center.

Message actions are exposed through a focusable ellipsis menu on hover/focus (always available on touch), retaining Reply and Report authorization rules.

## Message deletion and voice recording

The sender's ellipsis menu deletes through `DELETE /api/v1/messaging/messages/{id}`. The API returns the same message identity with `deletedAt`, an empty body and no attachments; chat and reply previews display “This message was deleted”. `MessageDeleted` refreshes history/last-message caches without a new-message sound. New attachment links are denied after deletion; an already issued signed URL can remain usable until expiry. Media remains privately stored/pinned; this action is a conversation tombstone, not a storage erasure promise.

Voice messages play inline. Recording displays elapsed time, a red stop square, a live microphone waveform and Cancel. Stopping prepares an audio preview. Text stays disabled through preparation and preview until Cancel or Send. Cancellation/unmount releases microphone tracks and AudioContext; stale permission/decode callbacks cannot attach an obsolete recording. The message viewport uses the spreadsheet scrollbar styling.

Regression coverage includes sender/recipient isolation, repeated deletion, private attachment denial, cached older pages, recording cancellation and actual synthetic WAV playback on desktop/mobile. Physical microphone and live two-user Supabase transport remain separate manual checks.

Conversation reads also persist matching notification reads on the server. Only events through the authorized message sequence are consumed; leaving the conversation cannot restore its unread notification count. The UI invalidates notification counts after a successful read.

### Coaching actions in direct chats

The composer menu lets eligible coaches share an active offer's application page or send a coaching invitation to the current participant without a lead or relationship. Existing coaching permissions and recipient acceptance still apply. Links are ordinary text messages with allowlisted internal destinations; composing a separate message preserves the draft. Invitation-message retries retain the created invitation and reuse the message idempotency key. If sending fails after invitation creation, the invitation remains available in Invitations and the dialog explains how to retry.

### Destination-based notification reads

The app shell acknowledges available notifications when their destination is visible, regardless of navigation entry point. `POST /api/v1/me/notifications/read-target` matches the exact path and all query parameters required by the notification; extra view filters are allowed. Reads are recipient-scoped, idempotent, exclude cancelled/future events, and broadcast counter changes. Cached rows update optimistically with rollback; unopened notification pages do not need downloading. Hidden tabs do not acknowledge, and realtime/poll refreshes handle new arrivals while staying in a view. MessageCreated retains the conversation message-watermark read mechanism. Publishers must link to the specific view where their notification is considered seen.

## Durable coaching entries

Invitation creation and active-offer form sharing produce a typed `coachingEntry` message through the server transaction. The UI sends one business command with a stable idempotency key, then refreshes its conversation; it never sends an additional text message to represent the action. Existing text cards remain readable. The native app opens invitation details or a form sheet and uses the same endpoints. Form sharing does not create coaching consent or a relationship.

Modern attachment uploads include `conversationId`, enabling the API to reject pending-chat uploads before storage transfer. Older clients can still stage private unattached files; sending or exposing them remains blocked by the authoritative conversation policy.
