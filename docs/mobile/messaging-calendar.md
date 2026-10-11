# Mobile messaging and calendar

The native screens use the existing generated API schemas and account-scoped transport. There are no production mocks, direct application-table Supabase queries or new backend contracts in this change.

| Screen/action | API contract |
|---|---|
| Messages, search and unread summaries | `GET /api/v1/messaging/conversations?search&limit=100` |
| Permitted contact search and direct chat | `GET /api/v1/messaging/people?search`, `POST /conversations/direct` |
| Message requests | `GET /requests`, `POST /requests/by-username`, `POST /requests/{id}/{accept,decline,cancel}` |
| Conversation, members, receipts | `GET /conversations/{id}` |
| Older history, retryable send | `GET/POST /conversations/{id}/messages`; cursor pagination, `Idempotency-Key` |
| Read visible incoming messages | `POST /conversations/{id}/read` |
| Private attachment upload | `POST /api/v1/messaging/uploads/`, signed upload, `POST /uploads/{id}/finalize` |
| Private attachment download | `GET /api/v1/messaging/messages/{messageId}/attachments/{mediaId}`; authenticated binary response |
| Calendar month and details | `GET /api/v1/calendar/events?role&from&to&timeZone&page&pageSize`, `GET /events/{id}?role` |
| Create/edit/cancel | `POST /events`, `PATCH /events/{id}`, `POST /events/{id}/cancel` |
| RSVP | `POST /events/{id}/response`, attendee `responseVersion` as `If-Match` |
| Invitation recipients | Existing paginated coaching clients/groups; API expands groups and enforces Personal/Team boundaries |

Messaging paths without a prefix in this table are relative to `/api/v1/messaging`; calendar paths are relative to `/api/v1/calendar`. API authorization remains decisive even when the UI exposes an action.

The route exports are `MessagesScreen`, `ConversationScreen` (`/conversation/[id]`), `CalendarScreen` and `EventScreen` (`/event/[id]`, with `new` for creation). Components use the shared mobile theme and native controls. Expo SDK 57 uses the `expo-router/react-navigation` exports for navigation guards.

## Messaging behavior

The conversation uses a virtualized inverted list with cursor pagination. Merging replaces duplicate message IDs, preserves sub-millisecond server timestamp ordering and does not infer a read receipt from an unknown marker. Read markers are sent only for incoming items that became visible while the screen and app are foregrounded. Server sequence ordering prevents marker regression.

Text, reply target, finalized attachment ID and message idempotency key are saved through the account's encrypted draft store. A serial local queue finishes before send. Failed or ambiguous sends retain the same payload/key and remain visibly unconfirmed; editing is locked until retry or explicit discard. Retrying therefore does not create a second message. The draft survives navigation/restart, subject to the store's retention policy. An in-flight request may reach the server even if navigation or account switching interrupts its response; the draft is not silently treated as delivered.

The app-level realtime component owns SignalR. These screens do not open a second hub. Focus/foreground transitions refresh the visible data; the app-level hub updates message history immediately, invalidates only messaging/notification queries and provides a 60-second reconnect fallback. Screens do not run duplicate 15-second polling. History cache key: `[accountId, 'mobile-messages', conversationId]`. History is memory-only. The conversation component is remounted for account changes, and transport/account signals reject late work.

File uploads use the shared upload helper. A generic attachment is a `File` message, which the actual server contract permits. Voice uploads use the distinct `VoiceMessage` type and `audio/wav`; the backend checks its true duration/content. One attachment per draft is currently supported.

Downloads use the authenticated message attachment endpoint, never the coach-only video-library read URL. Explicit open/play creates a random account-prefixed native cache file. Audio uses `expo-audio`; other files use the native sharing/open sheet. Download/temporary files are cleared on component unmount/account abort, and non-audio exports clear the app copy after the sheet returns. Playback pauses on screen blur/background. An exported copy is outside app control. Startup additionally removes stale chat cache files left by a killed process; this is not a durable offline attachment library or a guarantee of remote revocation of an exported copy.

The implemented iOS recorder requests microphone permission, records 16-kHz mono 16-bit PCM WAV, previews the recording, caps it at five minutes, stops on background, and deletes unattached files on unmount. Android uses the local [trainflow-voice Expo module](../../apps/mobile/modules/trainflow-voice/README.md), because Expo's MediaRecorder formats do not supply PCM WAV. It captures PCM16 with `AudioRecord`, writes a real RIFF/WAVE header, and shares the existing preview/upload flow. Native session tokens prevent a late old-account cancellation from affecting another recording. These are code paths, **not physical-device verification**. Both platforms can also select and send an existing PCM WAV file. Renaming AAC to `.wav` is not used.

The [Expo audio documentation](https://docs.expo.dev/versions/latest/sdk/audio/) describes recording/playback and platform recording options. The [file-system documentation](https://docs.expo.dev/versions/latest/sdk/filesystem/) and [React Navigation guard documentation](https://reactnavigation.org/docs/preventing-going-back/) informed the adapters; actual native behavior still needs device testing.

## Calendar behavior

Calendar shows a paginated monthly agenda. Coach creation/editing supports Meeting/Event, timed/all-day events, native date/time pickers, location/link, clients and groups. Existing retained invitees are preserved during edits. Display explicitly distinguishes event time zone from device display time zone. The all-day editor presents the last inclusive day and converts it to the API's exclusive end date. Pure tests cover the DST transition boundary and reject invalid/reversed times.

Edits/cancellation send the event version. RSVP sends the attendee response version. A conflict remains an error with editor values intact. An event is never treated as a workout execution, and Pending/NoResponse is never shown as Accepted. Unsaved editor navigation and composer navigation use native stack guards; closing a request sheet also prompts before discarding typed work. Date changes are not represented as a recurrence engine.

## Verification and remaining work

Executed from repository root:

```powershell
& 'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc -p apps/mobile/tsconfig.json --noEmit
& 'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run --project mobile-core apps/mobile/src/features/messaging/model.test.ts apps/mobile/src/features/calendar/model.test.ts
```

Typecheck passed; four tests passed. Explicit `node.exe` matters on this host: empty extensionless `C:/Windows/System32/node` and `npm` files shadow bare commands and can produce a misleading empty exit-0 result.

The local module also passed `./apps/mobile/modules/trainflow-voice/test-wav.ps1` (real Java header code, little-endian fields, duration/size bounds). Expo autolinking resolves its Android module without custom generated-project edits. The subsequent native Android build passed both `:trainflow-voice:compileDebugKotlin` and `compileDebugJavaWithJavac`. This still does not exercise its microphone.

Not device-verified: keyboard/back/gesture guards, date/time pickers, microphone/WAV encoding, playback, native sharing, encrypted draft reopen, actual authenticated API round trips, SignalR reconnect, background transitions and multi-account late completion. There is no mobile native UI test harness result in this milestone.

Remaining scope: native build/UI/E2E and authenticated device tests; full English/Polish copy; group administration and message moderation actions; push navigation/device verification (owned by app infrastructure); calendar aggregation of check-in schedule entries. Existing linked/group conversations are readable and writable subject to server membership. Native recording support must not be advertised as device-verified until its required format and lifecycle are proven on actual hardware.

The chat also has native reply/delete action menus with destructive confirmation, a pending message inside the inverted history list, optimistic read counters with guarded rollback, latest-outgoing-message receipts, and authenticated inline images limited to 5 MB and 24 MP. The shared infrastructure resolves tapped push notifications through the owner-filtered API endpoint before routing.
