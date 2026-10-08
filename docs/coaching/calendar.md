# Workspaces and calendar

The sidebar switches the entire app between Coach and Client for coach accounts.
The choice is remembered per login account. Switching protects unsaved changes,
remounts the workspace and separates private query caches. It does not grant
server permissions; entering Client mode explicitly enables the existing Client
role if needed. Links into the other workspace offer a switch preserving the URL.

Coach client management lives under **Clients**, with Clients, Leads, Invitations,
Groups and Check-ins inside. Existing URLs remain valid. **Calendar** replaces
the Schedules sidebar entry; recurring check-in management remains reachable
from Calendar.

## Calendar UI

`/app/calendar?view=month&date=2026-11-04` supports `week`, `month` and `year`.
Weeks start Monday. The profile timezone determines displayed dates. Select a
day to see its agenda and add a meeting, event or check-in. Week has timed and
all-day lanes; year provides twelve month grids. Mobile retains all views.

Meetings/events support editing, cancellation and invitations to active clients
or groups. Groups expand to a deduplicated snapshot when saved. Later membership
changes do not alter attendees. Editing retains existing suspended/completed
invitees' history, while adding inactive relationships is rejected. Clients see
the organizer and their own response, without peers or private group data.
Timing changes reset responses to Pending. All-day events use an exclusive end
date. Ambiguous/nonexistent local times must be corrected before saving.

Check-in creation prefills a one-time schedule from the selected day and reuses
the published-form and recipient workflow. Issued requests and future planned
releases are distinct calendar entries; clients only receive authorized issued
requests. Planning uses the same recurrence/DST rules as the worker and writes
nothing. Request intervals overlapping the visible range are included.

## API

All endpoints require authentication, current role/feature and resource access.

| Method and path | Result |
| --- | --- |
| `GET /api/v1/calendar/events` | Paged events overlapping `from`/`to` UTC bounds; explicit `role=coach|client`, optional `timeZone`, `page`, `pageSize`. |
| `POST /api/v1/calendar/events` | Creates an event and recipient snapshot; returns `EventDto` and ETag. |
| `GET /api/v1/calendar/events/{id}?role=...` | Role-safe detail including organizer name; organizer gets attendees, client gets only their response/version. |
| `PATCH /api/v1/calendar/events/{id}` | Updates the event and explicit recipients; requires event If-Match. |
| `POST /api/v1/calendar/events/{id}/cancel` | Cancels the event, preserving history; requires event If-Match. |
| `POST /api/v1/calendar/events/{id}/response` | `{ "status": "Accepted" }` or `Declined`; requires **responseVersion** as If-Match, not event version. |
| `GET /api/v1/check-ins/calendar` | Paged `Request` or coach-only `Planned` entries with release/due timestamps, status and request/schedule IDs; accepts `role`, `kind`, `from`, `to`, `page`, `pageSize`. |

Ranges are at most 370 days; page size is 1–100. Lists return
`{ items, page, pageSize, total }`; the UI follows all pages. Writes use the
existing error envelope: 400 validation, 403 access, 404 unavailable resource,
409 lifecycle conflict, 412 stale version, 428 missing If-Match.

`EventWrite` has kind, title, description, timezone, optional location/meeting URL,
relationshipIds and groupIds. Provide either UTC start/end or local startDate and
endDateExclusive. A title is required (200 characters); descriptions allow 10000,
locations 500, HTTP(S) URLs 2048. Up to 100 groups and 10000 explicit clients are
accepted so an expanded group snapshot remains editable.

## Implementation and deployment

- `backend/modules/Calendar`: private `calendar` schema, event/attendee/audit
  persistence. Event row locks serialize edits, cancellations and responses.
  Attendee foreign keys include event owner/workspace and relationship client.
  Audit rows are immutable; runtime has explicit grants and no schema CREATE.
- `backend/modules/CheckIns/.../Features/CheckInCalendar.cs`: read-only calendar
  projection inside its owning module; no cross-module DbContext access.
- `apps/web/app/shared/session/WorkspaceScope.tsx`: workspace lifecycle/guards.
- `apps/web/app/modules/calendar`: views, editor, detail and API range loading.
- `infra/export-calendar.ps1`: guarded stage-two upgrade; initial exports include
  Calendar. `infra/test-calendar-migrations.ps1` verifies clean and upgrade paths
  on disposable loopback databases and checks restricted runtime writes.

The development Supabase migration `calendar_events_and_invitations` was applied
on 2026-10-07. A real `trainflow_api` write/read was verified and rolled back.
Browser workflows use isolated HTTP fixtures; authorization, invitation races,
history, groups, overlap and recurrence are tested against real local PostgreSQL.
External email invitations and external calendar synchronization are not included.

## Verification (2026-10-07)

- Backend: 110 unit, 124 PostgreSQL/HTTP integration and 2 architecture tests passed; 2 external Auth/Storage checks skipped without their dedicated environment.
- Frontend: 107 unit/component tests; typecheck, lint and production build passed.
- Browser: 14 desktop/mobile scenarios, including invitation acceptance, workspace switching, dirty-state protection and calendar creation/date selection.
- Clean/upgrade migrations, restricted runtime transaction and API readiness passed.
