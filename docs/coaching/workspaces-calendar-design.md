# Workspaces and calendar

Status: implemented on 2026-10-07; see calendar.md for final contracts and verification.

## Outcome

A coach can use the same account in either Coach or Client mode. Switching
changes the entire application workspace. Coach navigation groups client
management under Clients. Calendar replaces Schedules and supports month,
week and year views, meetings, events, invitations and dated check-ins.

## Approach

Recommended: keep the existing application shell and check-in scheduling
engine, add an account-scoped workspace selector and a Calendar module for
events and attendance. This preserves existing contracts and avoids a second
check-in scheduler.

Alternatives considered: separate coach/client applications would duplicate
authentication and shell maintenance; treating meetings as check-in schedules
would mix form submissions with attendance and cancellation semantics.

## Workspace switching

- Show Coach / Client near the top of the sidebar, including mobile navigation.
- Client-only accounts have the Client workspace. Coach accounts can switch
  into Client mode; if necessary, that explicit action enables the existing
  Client role through the account API before entering the workspace.
- Remember the last workspace per signed-in account. First use defaults to
  Coach for coaches and Client for other accounts.
- Switch navigation, home route, breadcrumbs, command palette and contextual
  actions together. Coach starts at Dashboard; Client starts at My coaches.
- Protect unsaved work with the existing discard dialog. Cancel leaves the
  current workspace and editor intact.
- Scope private data by account and workspace. A mode change resets active
  views and prevents stale requests from populating the next workspace.
- Server authorization remains role-, feature- and ownership-based. UI mode
  never grants permissions. A link into the other mode offers an explicit
  switch, preserving its target after success.

## Navigation

Coach primary navigation contains Clients and Calendar alongside the existing
training, library, forms, offers, earnings and preference destinations.

Clients contains an internal menu in this order:
Clients | Leads | Invitations | Groups | Check-ins.
The menu remains visible on related detail pages. Use Groups everywhere
instead of Client groups and Leads instead of Applications in coach navigation.
Existing deep links continue to resolve; shared client/coach detail pages
derive their layout from the active workspace rather than path comparisons.

Client navigation contains My coaches, Calendar, My applications,
My invitations, My check-ins and My payments. Client mode exposes only the
current client's records, even when that account also owns a coach workspace.

## Calendar interaction

- Default to Month; provide Week, Month, Year, Today and previous/next controls.
  Weeks start Monday. The selected date and view are URL state.
- Month shows a date grid with compact event/check-in summaries and overflow.
  Week shows timed entries and an all-day area. Year shows twelve navigable
  months with activity indicators; selecting a day opens its agenda.
- Mobile retains all three views with a readable selected-day agenda.
- Selecting a date or New opens a choice of Meeting, Event or Check-in.
  Meeting and Event share an editor: title, description, date/time, timezone,
  optional location or meeting URL, and invitees. Events may be all-day.
- Coach can edit/cancel their events and see invitation responses. A client
  can accept/decline their own invitation and inspect the event details.
- All writes persist through the API. Loading, empty, failed and stale-version
  states follow the existing application patterns. Dialogs are keyboard
  accessible, restore focus and guard unsaved edits.

## Invitations

Invite existing active clients individually or through
the coach's groups, with Accept / Decline inside Metrivum. Group selection
expands to a deduplicated recipient snapshot when invitations are saved;
later membership changes do not silently change event attendance.

Clients see the organizer, event details and their own response, never group
membership, private coach notes or other attendees. Cancellation remains visible
to invited clients. Changes to timing reset existing responses to Pending and
clearly identify that the invitation changed.

External email invitations, arbitrary-account invitations and external calendar
synchronization are separate extensions.

## Check-ins

Reuse existing published forms and schedule endpoints. A selected date
prefills a one-time schedule, recipients, release time and response window;
the coach can choose existing recurrence options in the same flow.

Calendar distinguishes planned schedule occurrences from issued requests.
Clients see only issued requests belonging to them. Coach can filter meetings,
events and check-ins, inspect both release and due dates, and open the existing
submission/review screen. Issued requests display submission/review status.
Existing schedule management remains accessible from Calendar; old schedule
links remain valid. Future previews must use the same recurrence/DST rules as
the worker and must never fabricate issued requests.

## Persistence and API boundaries

Add a Calendar module with a private schema, owner/workspace-scoped events and
event invitees linked through trusted Coaching contracts. Timed events store
UTC start/end and an IANA display timezone; all-day events store local date
bounds with an exclusive end date. Validate end after start and bounded text.

Provide bounded range queries, event create/detail/update/cancel operations
and invitation responses. Require optimistic concurrency for updates and
responses; enforce ownership and participation on the server. Coach range
responses include their own events; client range responses include only their
invitations. Never trust a caller-supplied coach or workspace identity.

Check-in range reads and planned occurrence projections belong to CheckIns
and are exposed through contracts, without reading another module's DbContext.
Use overlap queries with exclusive range ends; paginate dense ranges rather
than silently truncating. Keep feature grants, generated OpenAPI/types,
migration exports and runtime schema/table grants consistent.

## Acceptance checks

- Switching a dual-role account changes the entire workspace; a client-only
  account cannot access coach routes, and unsaved changes are protected.
- Clients has all five internal sections with working details and old links.
- Month/week/year navigate correctly across year boundaries and DST changes.
- A created event survives reload; invited clients can respond, unrelated
  accounts cannot discover it, and stale updates fail without overwrites.
- Group invites deduplicate recipients and do not expose other clients.
- Selecting a day can create a real check-in schedule; existing recurring
  schedules still issue exactly one request per eligible recipient/release.
- PostgreSQL tests cover authorization, concurrency, range boundaries and
  migration grants. Browser tests cover desktop/mobile workspaces, calendar
  views, event invitation/response and dated check-in creation.
- Run frontend typecheck/lint/build/tests, backend tests and graphify update.
  Apply verified migrations to the previously confirmed development target
  and verify a representative authorized write/read, not readiness alone.
