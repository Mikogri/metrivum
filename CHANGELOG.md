# Change log

## Unreleased

- Centralize strong numeric request preconditions, retaining legacy error contracts. Make Training/CheckIns relationship operations explicit and test management, execution and historical access independently.
- Share one account lifecycle across HTTP and both realtime channels: abort on account changes, reject delayed tokens/body reads and stop late connections without changing polling or cache policy.

- Audit database/API performance and access boundaries: reduce chat/catalog/media reads, load Team rosters on demand, deduplicate token refresh and reject stale-account requests. Add a measured reverse-block index to the development database.
- Close expired-Team check-in writes and revoked-access assignment retries; reject explicit null required JSON fields, preserve MOV queue admission and keep the preview server alive for malformed URLs. Add integration/security regressions; see `docs/architecture/performance-security-audit-2026-10-08.md`.

- Add real Team organizations with owner-paid seats, Owner/Admin/Member permissions, simulated checkout, immutable Pro upgrade credit, deferred cancellation and durable dissolution. Joining does not cancel a member's personal Pro.
- Add explicit client consent and separate organizational cases, scoped offers/groups/calendar and Personal/Team/TeamMember Analyze. Preserve private history and original financial sellers; close future Team work on departure/dissolution. See `docs/coaching/team-organizations.md`.

- Load worker development credentials from .NET User Secrets after local settings; preserve environment overrides and exclude secrets from Testing. The local startup script defaults to Development.

- Add simulated subscription checkout with server-converted profile-currency prices and explicit paid activation. Stage 6 supersedes the initial Team discovery flow with paid organizations and recipient invitations.
- Add sender-only message tombstones, inline voice playback and live recording controls with a locked composer until Cancel/Send. Match the chat scrollbar to the spreadsheet editor.
- Remove the default two-job analysis admission cap and subscription prompt; add actionable worker startup checks and isolate cleanup failures from analysis claiming.

- Trim training schedule SELECTs, scope action checks to the returned page, close future workouts with one SQL UPDATE and avoid refetching coaching data for recipient previews. See `docs/architecture/query-performance.md`.

- Deliver published programs to individual clients and overlapping groups without duplicating source programs. Add dated workout schedules, frozen prescriptions, actual logs/corrections and SQL-backed client/Analyze progress, with separate coach/client views.
- Add relationship-scoped measurements, private coach notes, shared text/files and progress photos. Enforce current relationship and document visibility before private Media access.
- Add deterministic program generation from reviewed catalog metadata, equipment/skill/time constraints, preview, locked choices and replacements. Save ordinary drafts into the existing builder; never publish or assign implicitly. See `docs/coaching/stage-05.md` for rollout, verification and limits.

- Shorten app-bar search, speed up side panels and use warning colors for unread notifications. Accept MOV analysis uploads (including missing browser MIME metadata) with server-side container checks. Set Pro to USD 25/month and Team to USD 20/person/month; remove obsolete Free feature restrictions from pricing copy.

- Add optional MotionTrace two-point video analysis, exact repetition/phase speeds in px/s, gap-aware charts and video seeking. Run inference in the worker through a bounded, cancellable bridge; document local configuration and remaining fresh GPU verification.

- Reduce repeated account/access reads, scope Analyze section queries, consolidate aggregates and precompute client status intervals. Add measured query indexes and SQL-side conversation name filtering. Load notification history on demand and reduce polling while realtime is connected; see `docs/architecture/query-performance.md`.

- Add durable recipient-scoped notifications, preferences, read state and retryable realtime delivery with scheduled check-in/payment reminders. Preserve the open-chat sound and suppress its bell entry.
- Add separate Free/Pro TrainFlow subscriptions using the existing simulated billing ledger, optional explicit renewal, immutable price/fee history and manual payment confirmation. Both plans retain all implemented capabilities; unconfigured Pro prices stay unavailable.
- Replace Earnings with Analyze and the coach header action with Subscription. Aggregate currency-separated finances, unique clients/acquisition and check-ins on the server; show unavailable training execution data honestly.

- Widen the app-bar search and use the shared secondary icon-button style for notifications.

- Return to the calendar after creating a meeting without automatically opening its details.

- Use the same default conversation selection when entering Messages and returning from Requests/Blocked; preserve explicit mobile list navigation.

- Synchronize chat history immediately when notification polling discovers a message. Keep sound for the open conversation while hiding its notification.

- Open the first conversation on entering Messages and sort conversations by the last received message, preserving explicit selections and mobile back navigation.

- Add an account-scoped app-bar notification center with message/request/invitation previews, unread nav counts and a muteable notification tone. Keep message status on the final own bubble and replace inline actions with an accessible ellipsis menu.

- Show outgoing chat messages immediately with Sending/Sent/Read or retry status, reconcile realtime acknowledgements by client message ID, and retain failed drafts. Add usernames to conversation headers, align the sidebar list, and remove message borders/day-label backgrounds.

- Add username autocomplete and chat-first message requests; preserve introductions on acceptance and show request notifications across app routes. Render sends without waiting for history refetches, throttle typing, hide bubble timestamps and align the composer.

- Offer Coach/Client at signup, preserve the choice through email confirmation and onboarding, and distinguish Auth service/SMTP failures from connection errors. Document development Resend delivery limits in `docs/frontend/registration.md`.

- Add Messages in both workspace modes: responsive conversations, requests, groups, replies, private attachments, WAV voice recording, read/typing state and account-isolated SignalR. Preserve failed-send drafts/idempotency and add exact-username contact requests; see `docs/frontend/messaging.md`.

- Add persistent direct/group Messaging, atomic client-group membership sync, historical access cutoffs, requests, blocking, immutable reports, read/unread state and after-commit SignalR events. Validate private image/file/video/WAV attachments through Media; export REST and realtime contracts and document deployment checks in `docs/coaching/messaging-verification.md`.

- Place hub navigation below page headers and simplify load errors to a borderless message with retry and a gently glowing icon; respect reduced motion.

- Align Clients and Programs/Templates inner navigation with Video analyses underline tabs. Replace the workspace toggle with a compact Coach/Client dropdown and keep parent sidebar entries active across their sections.

- Separate Coach/Client workspaces and consolidate client management under Clients. Add month/week/year Calendar with persisted events, group invitation snapshots, client responses and dated check-ins. Preserve existing URLs, private projections, unsaved-work guards and recurrence behavior.
- Add the private Calendar schema, versioned API, immutable audit and development migrations; document contracts in `docs/coaching/calendar.md`.

- Add published Forms/Offers, private applications and exact-username invitations, atomic acceptance into relationship services and Billing orders, simulated payments, external settlement, subscription renewal and timezone-aware CheckIns. Preserve issued snapshots, private projections and immutable audits; enforce roles, current features, ownership and optimistic concurrency.
- Add explicit grants for all eleven private schemas and a guarded stage 02 SQL exporter with pinned stage 01 baselines. Keep the historical stage 01 exporter pinned and extend fresh-database exports to the complete module set.

- Add Client/dual-role accounts and the Coaching relationship/group core with versioned commands, private projections, immutable audits and PostgreSQL ownership constraints. Apply stage 01 EF migrations to the confirmed development project; add guarded dev fixtures and backward-compatible generated contracts.
- Isolate Testing configuration from local runtime secrets and reject non-loopback test databases.
- Add the React web frontend (`apps/web`): pre-rendered EN/PL public site with landing and feature pages, Supabase Auth screens, onboarding, dashboard, exercise catalog, folders/programs/templates, spreadsheet-style program editor with autosave and conflict handling, formulas, CSV import, server CSV/PDF export, video uploads, analysis results and comparison.
- Add `@trainflow/ui-web` component library with design tokens and a Storybook catalog (`apps/ui-catalog`).
- Support up to three independently signed-in accounts per browser with isolated sessions, caches and in-flight requests.
- Add frontend lint, typecheck, unit, Storybook build and Playwright checks, plus a separate Frontend CI workflow.
- Document frontend architecture, design reference, API integration map, API gaps/release blockers and hosting rules.
- Document every API operation, JSON type, access requirement, success response, concurrency rule and representative client workflow.
- Apply and verify the initial TrainFlow cloud database in Super Team with explicit authorization.
- Support managed PostgreSQL role ownership during bootstrap and add a reproducible initial SQL exporter.
- Fix the immutable Training trigger's search path through an incremental EF migration; Supabase security advisor reports no findings.

## 0.1.0 - 2026-10-05

- Implement the .NET 10 API and six modules: Accounts, Access, ExerciseCatalog, Training, Media and VideoAnalysis.
- Add Supabase JWT validation, coach onboarding, server-owned roles, configurable feature access and resource ownership checks.
- Add exercise revisions, private training documents/templates, immutable snapshots, bounded formulas and CSV/PDF import/export.
- Add private signed video uploads, verified finalization and a durable analysis worker with leases, cancellation and retries. A real analyzer remains an external dependency.
- Add schema migrations, separate database roles, generated OpenAPI/TypeScript contracts and PostgreSQL-backed CI.
- Document local setup, security boundaries, module structure and actual verification results. Cloud operations require explicit authorization.
