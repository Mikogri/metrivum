# Change log

## Unreleased

- Unify direct chat consent: open by default, opt-in approval, ordinary inbox for pending chats and a disabled composer while waiting. Persist invitation and offer-form cards in the business transaction, with retry-safe keys across web/mobile.
- Add assigned-program cycle check-ins, editable local release time and scheduling explanations. Retain issued history and re-align future scheduling with effective plan changes.
- Harden contract export and worker opt-out, architecture boundaries, bounded diagnostics, mobile mutation lifecycle/invalidation and partial-progress disclosure. Publish API, web and native mobile together; see `docs/architecture/refactor-2026-10-11/` for evidence and remaining limits.

- Mobile UI revision: Geist typeface, compact controls, own switch/segmented/tab controls, a floating icon-only tab bar with the web app's navigation icons, notifications and profile in the title row, a Profile screen for account settings, translucent sheets over a blurred backdrop (system Liquid Glass sheet on iOS 26) and a horizontal stack transition. Switching between the Coach and Client view no longer remounts navigation or clears cached data. Verified on an Android device with a signed-in account; iOS is not device-verified. See `docs/mobile/verification.md`.

- Mobile UI pass: an independent dark/light theme with the Outfit typeface and platform icons, shared motion and haptics, and one bottom-sheet system on the native `@expo/ui` sheet (actions, confirmations, selections, forms with draft protection). Context menus, alerts and centred dialogs are gone from the app. Workout execution is rebuilt for one-hand use (large reps/load entry with step buttons, a set check that saves and starts the rest timer, pinned actions). Verified on an Android device for the design system and sheets only; signed-in screens and all of iOS are not device-verified. See `docs/mobile/visual-direction.md` and `docs/mobile/verification.md`.

- Add an Expo mobile client with native Coach/Client navigation, isolated saved accounts, encrypted drafts, versioned workout saves, daily coaching/check-in workflows, chat/voice/files, calendar and read-only subscription information. Add additive client-analysis provenance and private push transport migrations to confirmed DEV. Local TAPNext++ inference and physical-device validation remain blocked; new web analyses no longer fall back to the server queue. See `docs/mobile/README.md` and `docs/mobile/verification.md` for exact support and limits.

- Replace plan publication with Apply changes: drafts autosave privately; applying updates assigned unstarted workouts, including today, while preserving execution history. Add one-time plan sales through intake and payment, independent buyer-owned copies, and the client Training plans library. Keep legacy revision API contracts.

- Add optional payment-based session/package validity to offer options and immutable revisions. Disclose it before applying; show the settled expiry and expired state in service views without changing historical payments or subscription periods.

- Audit account/resource boundaries and database reads: reject disabled ownership transfers and notification recipients, enforce chat rejoin capacity, validate measurement conversions before overflow, and unify SQL conflict errors.
- Batch client service summaries and Team permission reads, move client name matching into SQL, reduce notification round trips, and share formula detail queries. Make editor save queues and workspace transitions respect their asynchronous/account boundaries; harden the check-in trigger search path in DEV. See `docs/architecture/quality-audit-2026-10-09.md` for measurements and verification limits.
- Keep controlled dialogs mounted until their owner accepts dismissal, preserving drafts and interactive nested confirmations. Refresh browser fixtures and selectors for the current API and UI contracts.

- Destructive actions (decline/revoke invitations, reject/withdraw applications, cancel check-in requests, end schedules and assignments, archive groups and offers, cancel renewal or checkout, decline Team transfers) ask for confirmation; quiet destructive buttons use a new `danger-ghost` variant that turns red on hover and press.
- Groups: new cards with a colour edge, member avatars and an actions menu; the cards/table toggle sits beside New group; group colours are thin bars. Client details: panels share one size and carry tinted icons; Activity, Progress and Check-ins load with skeletons; Profile gets an account header and coloured tags.
- Chat: sent images hug the right edge (fixed shrink-to-fit width); invitation/form cards are flat pressable tiles. The calendar opens a new check-in schedule in a wide right-hand panel. Custom formula cards are compact and show the expression and inputs.

- Bring the newer coaching screens to the app standard with shared `Panel`/`Facts`/`StatStrip` blocks: client details (Overview panels, Activity table, Progress with an Add measurement dialog, Profile, Documentation with a segmented inner menu and Add dialogs, Check-ins), group, invitation, application, service and check-in details, public and coach offers, My coaches, Subscription and client documents. Drop metric explanations under stats.
- Page headers show status badges and facts on the right beside the actions, so they never add height; client and group names carry their Private/Team badge inline. Destructive menu items are red.
- Clients list: avatar, @username, plan, group, offer and payment columns; every Clients hub tab shares Check-in schedules and Invite client. Creating an offer keeps you on the list.
- Cards: taller shared layout with subtitle and key facts (offers, clients, services, coach offers). Chat: own images hug the right edge; invitations and application forms render as action cards. Notifications show outcome icons (red cross for declined, warning for overdue, check for accepted).
- Toasts: solid surface without blur, centred content, type stripe and tinted icon. Alert dialog icons lose the glow. Dashboard sparklines stay inside their cards.
- Video analyses: search, state filter and sort for videos. Editor: clearer selected load unit, comments truncate inside their cell. Cards/table view (per page) and simple/advanced plan mode are remembered in this browser.

- Move body metrics into Client Details Progress with canonical manual measurements, versioned corrections, chronological charts and BF percentage-point changes. Keep Photos/Files/author-private notes in Documentation; add retention-safe deletion and preserve relationship checks on each private download.

- Keep notification read acknowledgements silent, anchor image actions beside the image, and give client details their own Overview/Activity/Progress/Profile/Files navigation with an avatar/name/username header.
- Persist message notification reads with the conversation read marker, preserving newer messages and other conversations. Refresh notification counts across tabs/devices after commit; right-align standalone sent images and dim deleted-message text.
- Show consistent button spinners for pending form and notification actions; keep message deletion confirmation open until completion and report success or failure. Use filled white voice playback icons and a smaller notification count without tinting the bell.
- Polish messaging confirmation, media playback, initial scrolling and optimistic read indicators. Use one top-right action toast with persistent validation errors and immediate success feedback.
- Start form builders empty, add question menus and direct restore actions, validate offer billing terms, and share cards/list controls across the libraries. Move Offers to Library and show dashboard skeletons during the first Analyze load.

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
- Add separate Free/Pro Metrivum subscriptions using the existing simulated billing ledger, optional explicit renewal, immutable price/fee history and manual payment confirmation. Both plans retain all implemented capabilities; unconfigured Pro prices stay unavailable.
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
- Apply and verify the initial Metrivum cloud database in Super Team with explicit authorization.
- Support managed PostgreSQL role ownership during bootstrap and add a reproducible initial SQL exporter.
- Fix the immutable Training trigger's search path through an incremental EF migration; Supabase security advisor reports no findings.

## 0.1.0 - 2026-10-05

- Implement the .NET 10 API and six modules: Accounts, Access, ExerciseCatalog, Training, Media and VideoAnalysis.
- Add Supabase JWT validation, coach onboarding, server-owned roles, configurable feature access and resource ownership checks.
- Add exercise revisions, private training documents/templates, immutable snapshots, bounded formulas and CSV/PDF import/export.
- Add private signed video uploads, verified finalization and a durable analysis worker with leases, cancellation and retries. A real analyzer remains an external dependency.
- Add schema migrations, separate database roles, generated OpenAPI/TypeScript contracts and PostgreSQL-backed CI.
- Document local setup, security boundaries, module structure and actual verification results. Cloud operations require explicit authorization.

- Client Details now composes six relationship-scoped tabs, check-in and payment drawers, actual training progress, editable body measurements, original applications and Team collaboration actions. Added batched service payment summaries and immutable check-in assignment provenance; retained existing domain permissions and snapshots.

- Notifications: acknowledge matching destinations across direct links, chat links and ordinary navigation, with optimistic cache updates, account isolation and hidden-tab protection.

- Shared username autocomplete for client/Team invitations and conversations; invitation details now use a person header outside the invitation list navigation.
