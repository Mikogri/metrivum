# Workspaces and Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Coach and Client workspaces, consolidate client management, and deliver a persisted calendar with invitations and check-ins.

**Architecture:** Reuse the existing account scope, shell, authorization and check-in scheduler. Add a Calendar module for events and attendance; access Coaching through contracts. Implement the six deliverables below in order because the calendar UI depends on workspace selection and the backend contracts.

**Tech Stack:** Existing React, React Router, TanStack Query, React Aria, @internationalized/date, ASP.NET Core, EF Core and PostgreSQL; no additional calendar dependency.

**Spec:** `docs/coaching/workspaces-calendar-design.md`

## Execution status

Implemented on 2026-10-07. Final contracts and scope decisions are in `docs/coaching/calendar.md`. Native execution retained the existing dirty checkout without committing unrelated stage-two work. CheckIns exposes its calendar projection through its own endpoint; no unused Contracts project was introduced. Verification uses equivalent behavioral tests rather than the provisional test names below.

## Global Constraints

- All code, UI copy and documentation remain English.
- "Server authorization remains role-, feature- and ownership-based."
- "Existing deep links continue to resolve."
- "Weeks start Monday."
- "Clients see only issued requests belonging to them."
- "Clients see the organizer, event details and their own response, never group membership, private coach notes or other attendees."
- Preserve the existing dirty working tree. Do not reset, broadly stage, or publish unrelated changes. Record selective commits only after reviewing their complete dependencies; a clean worktree from HEAD alone lacks the uncommitted stage-two baseline.
- The previously confirmed Supabase development target is authorized for migrations; verify its identity before applying them. Never print connection strings or secrets.

## Review Focus

- A delayed response from the old workspace must not populate the new workspace (Task 1).
- Old links into the other mode must preserve their destination after switching (Task 2).
- Removed invitees and suspended relationships must not regain write access through stale invitations (Task 3).
- A long-running check-in response window must appear when it overlaps the requested range (Task 4).
- A DST transition and an all-day event must retain their intended local dates (Task 5).

## 1. Account-scoped workspace switching

**Files:** Create `apps/web/app/shared/session/WorkspaceScope.tsx`, `WorkspaceScope.test.tsx` and `apps/web/app/layouts/components/WorkspaceSwitcher.tsx`. Modify `layouts/app-layout.tsx`, `layouts/components/{AppShell,CommandPalette,nav}.tsx` (nav is `.ts`), `modules/dashboard/routes/app-index.tsx`, `shared/session/useAccountActions.ts` and `modules/coaching/api.ts` under `apps/web/app`.

**Interfaces:** Export `WorkspaceMode = "coach" | "client"` and `useWorkspace(): { mode: WorkspaceMode; switchMode: (mode: WorkspaceMode, destination?: string) => Promise<boolean>; switching: boolean }`. A false result means cancelled or unsuccessful switching. Keep the login account scope separate from workspace selection. Key coaching/calendar private queries by account and mode.

- [ ] Add tests `switch_updates_navigation_and_home`, `discard_cancel_preserves_editor`, `late_coach_response_never_enters_client_view`, and `client_only_cannot_select_coach`; assert navigation/actions and rendered data, not just stored mode.
- [ ] Run `npm test -- WorkspaceScope` and confirm the new tests fail for missing behavior.
- [ ] Implement mode persistence per account and the explicit existing `POST /api/v1/me/roles/client` flow for Coach-only accounts. Refresh the profile before entering Client mode; preserve Coach mode on failure. Use the existing unsaved-work guard before any mutation/navigation. Cancel old private requests and remount the mode-dependent outlet; avoid cancelling unrelated account activation calls.
- [ ] Wire desktop/mobile switcher, menu, commands and start route to mode. Account login switching navigates through `/app`, which resolves the remembered permitted mode. Invalid persisted values fall back safely.
- [ ] Run the focused tests and `npm run typecheck`; record the verified file set for selective commit.

## 2. Clients hub and route compatibility

**Files:** Create `apps/web/app/modules/coaching/ClientsLayout.tsx` and `clients-navigation.test.tsx`. Modify `apps/web/app/routes.ts`, `layouts/components/nav.ts`, `modules/coaching/routes/{applications,invitations,check-ins,services,groups,group}.tsx`, and existing coaching styles. Add coverage in `apps/web/e2e-coaching/coaching.spec.ts`.

**Interfaces:** `ClientsLayout` renders the exact tabs `Clients`, `Leads`, `Invitations`, `Groups`, `Check-ins`. Preserve `/app/clients`, `/app/leads`, `/app/invitations`, `/app/groups`, `/app/check-ins` and their detail links using a shared layout. Shared detail pages choose the layout from `useWorkspace()`; list requests send an explicit matching API role.

- [ ] Add tests `clients_tabs_and_details_keep_active_section` and `legacy_link_switch_preserves_destination`; assert all five tabs, correct active state and destination after confirmation. Assert Client mode never renders the hub.
- [ ] Run `npm test -- clients-navigation` and observe the expected failure.
- [ ] Replace pathname-based role detection with workspace context. Guard mode-specific links with an explicit switch prompt that reuses Task 1. Rename coach-facing Applications to Leads and Client groups to Groups. Remove the five separate primary links and Schedules from primary navigation; introduce Calendar.
- [ ] Run focused unit tests and `npm run e2e:coaching`; adapt existing navigation expectations while preserving earlier editor tests. Review the selective change set.

## 3. Persisted calendar events and invitations

**Files:** Create `backend/modules/Calendar/TrainFlow.Calendar/{Domain/CalendarEntities.cs,Domain/CalendarRules.cs,Features/CalendarDtos.cs,Features/CalendarService.cs,Infrastructure/CalendarDbContext.cs,ModuleRegistration.cs,TrainFlow.Calendar.csproj}` and EF migrations beneath `Infrastructure/Migrations`. Modify API project/Program, solution, Access feature migration, `infra/{bootstrap-roles,runtime-grants}.sql`, initial migration export and integration test fixture registration. Create `tests/Unit/TrainFlow.UnitTests/CalendarRulesTests.cs` and `tests/Integration/TrainFlow.IntegrationTests/CalendarTests.cs`.

**Interfaces:** Base route `/api/v1/calendar`. `GET /events` accepts `role`, UTC `from`/`to`, display `timeZone`, `page` and `pageSize`; returns `{items,page,pageSize,total}`. `POST /events`, `GET/PATCH /events/{id}`, `POST /events/{id}/cancel`, `POST /events/{id}/response` return role-safe versioned DTOs. Mutation responses include ETag; PATCH/cancel/response require strong If-Match. Response body is `{status: "Accepted" | "Declined"}`.

Event write fields: `kind` (Meeting/Event), `title`, `description`, `timeZone`, `startsAtUtc`/`endsAtUtc` for timed entries or `startDate`/`endDateExclusive` for all-day entries, `location`, `meetingUrl`, `relationshipIds`, `groupIds`. Require exactly one time representation. Title 1–200, description at most 10000, location at most 500, URL at most 2048 and HTTP(S). Range maximum 370 days, page size 1–100. Reject invalid timezone/range and duplicate or unauthorized recipient references with existing API error conventions.

Store event ownership, event version, attendee response and attendee version; respond using the attendee ETag from the client DTO. Event timing changes atomically reset responses and increment attendee versions, so stale replies fail. Use features `calendar.events.manage`, `calendar.events.read-own`, `calendar.invitations.respond-own` with role-appropriate grants.

- [ ] Add rules and PostgreSQL tests for timed/all-day validation, owner isolation, group deduplication, recipient snapshot, private client DTOs, stale event writes, concurrent response/timing updates, cancellation and attendee removal. Assert old versions return 412, unauthorized users cannot discover events, and a removed attendee loses access. Suspended/completed relationships retain existing event history but cannot receive new invitations; cancelled events reject responses.
- [ ] Run `dotnet test TrainFlow.slnx --filter Calendar` against the local test database; confirm failures before implementation.
- [ ] Implement entities, ownership constraints/indexes, service operations and immutable audit in the same transaction. Resolve new invitations through `IRelationshipRecipients`; never read Coaching's DbContext. Return peers only to the organizer. Use range overlap (`start < to && end > from`), stable ordering and explicit pagination.
- [ ] Register the module, generate EF migrations and grants, and test clean install plus upgrade from the current stage-two baseline. Extend architecture tests for module isolation and runtime privilege tests for the Calendar schema.
- [ ] Run Calendar, architecture and privilege tests. Regenerate OpenAPI/API types/features with the repository's existing export commands; record the selective change set including generated dependencies.

## 4. Check-in calendar projections

**Files:** Create `backend/modules/CheckIns/TrainFlow.CheckIns.Contracts/TrainFlow.CheckIns.Contracts.csproj`, `ICheckInCalendar.cs`, and `backend/modules/CheckIns/TrainFlow.CheckIns/Features/CheckInCalendarService.cs`. Modify CheckIns registration/project, reuse `Domain/CheckInRules.cs`, extend `tests/Integration/TrainFlow.IntegrationTests/CheckInTests.cs` and `tests/Unit/TrainFlow.UnitTests/CheckInRulesTests.cs`.

**Interfaces:** `ICheckInCalendar.ReadAsync(CheckInCalendarQuery query, CancellationToken ct)` returns `Task<CheckInCalendarPage>`. Query carries role, from/to, timezone, page/pageSize. Items carry stable ID, `kind` (Request/Planned), schedule ID, optional request ID, name, available/due timestamps, status and navigation target. The implementation resolves current identity itself. Expose `GET /api/v1/check-ins/calendar` with the same range/page bounds as Task 3.

- [ ] Test `calendar_includes_overlapping_response_window`, `client_never_receives_planned_or_peer_requests`, and `preview_matches_worker_across_dst_and_month_end`. Assert one planned marker per schedule/release, issued requests remain identifiable separately, and emitted occurrences are not shown again as future planned markers.
- [ ] Run `dotnet test TrainFlow.slnx --filter CheckIn` and confirm the new tests fail.
- [ ] Implement authorized range reads, preserving worker recurrence semantics without writes. Preview only future releases of active schedules; use deterministic paging and bounded computation. Reuse/refactor the recurrence calculation shared with the worker rather than duplicate its DST rules.
- [ ] Run CheckIn tests including existing generation/deduplication tests; regenerate contracts and review the selective change set.

## 5. Calendar views, event editing and check-in creation

**Files:** Create `apps/web/app/modules/calendar/{api.ts,calendar-model.ts,calendar-model.test.ts,CalendarViews.tsx,EventEditor.tsx,EventDetail.tsx,calendar.module.css,routes/calendar.tsx}`. Modify `apps/web/app/routes.ts`, `modules/coaching/routes/schedule.tsx` and existing schedule links. Create `apps/web/e2e-coaching/calendar.spec.ts`.

**Interfaces:** Route `/app/calendar?view=month|week|year&date=YYYY-MM-DD`; default month/current local day. API hooks consume Tasks 3–4 with explicit workspace role. `calendar-model.ts` exports `visibleRange(view, date, timeZone)` and `daysForMonth(date)` using the existing @internationalized/date library. Event editor accepts a selected local date and optional existing event. Add `date` query prefill to the existing new schedule route; apply it only to new drafts.

- [ ] Add model tests for Monday-first grids, leap year, December/January navigation and DST local-day bounds. Add browser tests `calendar_views_keep_selected_day`, `event_survives_reload_and_client_accepts`, `selected_day_prefills_checkin`, and `all_day_event_keeps_local_dates`; include keyboard and narrow viewport assertions.
- [ ] Run `npm test -- calendar-model` and the new Playwright tests to establish missing behavior.
- [ ] Implement Month grid/overflow, Week time grid/all-day lane, Year twelve-month overview and selected-day agenda. Provide Today/previous/next/view controls plus Meeting/Event/Check-in filters. Fetch all pages needed for the visible range with progressive loading and actionable retry; do not silently omit overflow data.
- [ ] Implement event creation/edit/cancel and client response through real API hooks, strong ETags and existing dirty guards. Choose clients/groups with search and persistent selected-recipient chips. On a changed invitation, display Pending and require a fresh response.
- [ ] Link calendar check-in creation to the existing schedule editor with date/timezone prefill, published-form prerequisite and recipient selection. Keep recurrence editing and management reachable from Calendar. Request entries open submission/review; planned entries open schedule details.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run e2e:coaching`. Inspect desktop/mobile calendar screenshots and verify live API persistence with designated development test accounts, not mocked browser responses alone.

## 6. Migration verification and delivery

**Files:** Add `infra/test-calendar-migrations.ps1` and `infra/export-calendar.ps1`; update `docs/{STRUCTURE,api-endpoints}.md`, `docs/frontend/coaching.md`, `CHANGELOG.md` and this plan's progress.

**Interfaces:** Follow existing export/test scripts: deterministic migration SQL, clean and upgrade verification, explicit runtime grants, no credentials in tracked files or output.

- [ ] Test both migration paths against disposable loopback PostgreSQL databases; assert stage-two rows survive, new ownership constraints work, and the restricted runtime can perform representative authorized Calendar writes/reads.
- [ ] Run `dotnet test TrainFlow.slnx -m:1` with the local test database configured privately. Stop only the exact repository API process if its output files are locked. Require full suite success or explicitly identify environment-only skipped checks.
- [ ] Apply verified migrations to the already confirmed development Supabase project after matching its project ID; check applied history and execute a transactionally rolled-back authorized write/read. Restart the local API and verify readiness plus authenticated calendar behavior.
- [ ] Run `graphify update .`, `git diff --check`, and inspect the complete task diff for secrets and unrelated edits. Keep concise endpoint/structure/change documentation aligned with the final implementation.
- [ ] Record test results, migration IDs and any remaining limitations. If committing, review the index explicitly and run `git diff --cached --check`; never commit an incomplete subset of the dirty stage-two baseline. Publication is a separate action unless already authorized for this change.

## Self-review

Coverage: workspace and dirty-state rules → Task 1; navigation/deep links → Task 2;
events/privacy/invitations → Task 3; request/preview semantics → Task 4;
three calendar views and dated creation → Task 5; migrations/contracts/docs → Task 6.
All five Review Focus conditions have an owning test. Native implementation and independent review completed. The final code preserves the shared contracts and existing stage-two working tree.
