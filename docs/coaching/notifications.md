# Durable in-app notifications

Notifications use the private `notifications` PostgreSQL schema. `INotificationPublisher` enlists the originating module's `ModuleTransaction`; the notification and its delivery state commit together. `(RecipientUserId, EventKey)` is unique and publication serializes retries with a transaction advisory lock. Suppressed events retain their identity, so unmuting never resurrects a retried historical event.

The durable row is also the smallest outbox and reminder queue. `AvailableAt` determines when REST exposes a notification. API delivery runs every three seconds with `FOR UPDATE SKIP LOCKED`; after a restart, overdue rows are delivered without a browser being online. SignalR hints have at-least-once delivery, so consumers refetch recipient-scoped REST state instead of appending duplicate payloads. REST remains authoritative when disconnected. Read actions emit `UnreadCountChanged` immediately; multi-tab polling recovers lost hints.

Only safe event type/category, source identifiers and relative application links are stored and delivered. No message/introduction body, form answers, private coach notes, health data, signed URLs or payment method detail appears in notification data. Source pages call their authorized domain APIs again. Safe generic history can remain visible after access changes; opening an inaccessible source uses its existing unavailable/error state.

Implemented sources:
- Messaging: direct/group messages to current active, capability-authorized members except sender; message requests and accepted/declined responses. Membership transitions and sending share conversation locks.
- CheckIns: per-client available, due soon (half response window capped at 24 hours), overdue; submitted to coach and reviewed to client. Generation persists all reminders atomically. Submission/cancellation cancels future reminders. Delivery rechecks request state and active relationship.
- Coaching: invitation received/responded/revoked; submitted application, accepted/rejected outcome; relationship status changes. Applications are the implemented lead/intake source; no separate Lead store exists.
- Calendar: invitation/change/cancellation to attendees and response to organizer.
- VideoAnalysis: fenced completed job to its owner, atomically with completion. The analysis engine must actually return a valid result.
- Billing: owner module publishes its real due/payment/platform events and supplies a delivery policy for outstanding reminders; see platform billing documentation.

No training assignment or execution subsystem exists. Private program publication does not produce an irrelevant self-notification. Email, SMS and push are deferred.

API (all JWT-user scoped, with the Accounts contract enforcing active completed onboarding for either Coach or Client):
- `GET /api/v1/me/notifications?page=1&pageSize=25&unread=false`
- `GET /api/v1/me/notifications/unread-count`
- `POST /api/v1/me/notifications/{id}/read`
- `POST /api/v1/me/notifications/read-all`
- `GET/PATCH /api/v1/me/notification-preferences`
- SignalR `/api/v1/notifications/hub`: `NotificationCreated`, `UnreadCountChanged`.

List/count accept optional `activeConversation` to hide active-chat message notifications while preserving message sound and navigation behavior. Opening the bell never marks all rows read. The bell supports explicit read/read-all, unread filter, preferences and older/newer pages. Messaging, CheckIns, Coaching and System are optional categories; billing and explicitly required alerts cannot be muted. Muting cancels future category reminders while keeping existing readable history. Sound preference is independent.

React queries and hub callbacks are keyed/guarded by account identity and session generation. A switched account cannot invalidate or display the previous account's notification data. The hub checks active completed onboarding when a connection starts. JWT query tokens are allowed only for the exact notification hub WebSocket path, and hubs close when authentication expires.
