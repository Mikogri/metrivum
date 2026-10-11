# Mobile screens and API contracts

The ASP.NET source and `contracts/generated/api.d.ts` are authoritative. The mobile feature types use `Schema<>` from the existing neutral client. No production data is mocked. All paths below start with `/api/v1`.

## Daily features implemented

| Screen / operation | API | Authorization and behavior |
| --- | --- | --- |
| Today | `GET training/schedule`, `check-ins/requests`, `calendar/events`; Coach `coaching/clients`, `coaching/leads` | Account/role query keys; API relationship filtering. Today plus resumable executions in the last 365 days, counts and first pages of upcoming work. No full Analyze dashboard. |
| Plans | `GET training/assignments`, `training/purchases` | Client view explicitly supplied. Multiple relationships/programs retained. Locked purchases only show availability; no payment action. |
| Assigned plan | `GET training/assignments/{id}`, `training/schedule` | Assignment scope and status from API; open occurrences for immutable prescription snapshots. See full-plan gap below. |
| Owned plan | `GET training/programs/{id}` | Server owns plan authorization. Blocks, cycles of arbitrary day count, days, workouts, groups and rich prescriptions are read-only. |
| History / activity | `GET training/schedule` | Server date/status/program/relationship filters and paging. Completed, Skipped, Missed, InProgress and Scheduled are server values. |
| Workout | `GET training/workouts/{id}`, `POST .../start`, `POST .../skip` | `allowedActions` determines actions; API also authorizes. Original revision is shown. |
| Execution save / correction | `PUT training/executions/{id}` | Full actual set dimensions, prescribed set/segment links, extra sets, skips/substitution, notes, performed date and duration. `If-Match`; one serial queue, encrypted local draft before HTTP. Blank actuals stay unknown. |
| Finish | `POST training/executions/{id}/complete` | Waits for all queued saves and sends current version. Failed/conflicted drafts remain. Explicit fresh server comparison precedes applying a retained local draft over the newer version. |
| Rest timer | Local expiry timestamp | UI recomputes remaining seconds from wall clock on foreground and ticks; no background processing claim. |
| Progress | `GET training/progress` | API actual-performance rows and adherence, date/program/exercise filters. No inferred lifts from prescriptions. |
| Measurements | `GET .../documentation/measurement-definitions`, `.../measurements`; `POST .../measurements` | Relationship-scoped, dates and units from API. Write button only with `measure` action. |
| Check-in list / detail | `GET check-ins/requests`, `check-ins/relationships/{relationshipId}/requests/{id}` | Role and relationship scope; paging/search/status. Opening does not mark reviewed. |
| Check-in response | `POST check-ins/requests/{id}/submit` | Versioned form; local encrypted draft, serialized local writes before submit; all currently supported answer types, PL decimal separator. Server validation remains decisive. |
| Review | `POST check-ins/requests/{id}/review` | Coach reply and private notes separate; explicit Mark as Reviewed. Uses request version. |
| Assign check-in | `GET forms`; `POST check-ins/schedules` | Published CheckIn forms only. One client or group from its detail, once/daily/weekly/monthly supported recurrence, response window and timezone. No form builder. |
| Clients | `GET coaching/clients`, `coaching/clients/{id}` | Search/status/paging; client header distinguishes Team/Private and assigned coach. Collaboration start date stays in Overview. |
| Client tabs | Assignments, services, groups, schedule, progress, profile, documentation, check-ins | Six internal areas; existing module records, no duplicate mobile client model. |
| Current profile / historical applications | `GET coaching/relationships/{id}/profile`, `.../applications`, `coaching/applications/{id}` | Current permitted fields remain separate from historical submitted answers. |
| Leads | `GET coaching/leads`, `coaching/applications/{id}`; `POST .../accept`, `.../reject` | Online action using allowedActions and version; review submitted answers/offer before confirming. TrainingPlan acceptance requires delivery selection not implemented in this client. |
| Invitations | `GET offers`, `coaches/{coachId}/offers/{id}`, `coaching/invitations`; `POST coaching/invitations`, `.../{id}/revoke` | Exact username resolved by server, published offer revision/variant. No account directory enumeration. |
| Groups | `GET coaching/groups`, `.../{id}/members`; `PUT/DELETE .../{id}/members/{relationshipId}` | Action flags, current group version, active relationship candidates. |
| Assign program | `GET training/programs`, `.../{id}/revisions`; `POST .../{id}/assignments/preview`, `.../assignments` | Existing published revision, client/group, date/timezone; explicit recipient preview before idempotent assignment. No Program Builder. |
| Message from client/group | `POST messaging/conversations/direct`, `coaching/groups/{id}/conversation` | Server permits conversation creation and membership; opens native conversation route. |
| Payment history | `GET coaching/relationships/{id}/billing` | Read-only due/history list. No checkout, card, settlement or payment mutation. |
| Documentation | `GET .../documentation`, `.../documents`, `.../notes`; `POST .../notes`, `.../documents`, `.../share` | Relationship actions and coach-private/shared visibility. Private notes are requested only for authorized coach. |
| File upload / read | `POST .../documentation/uploads`, `.../uploads/{id}/finalize`, `.../documents/{id}/read-url` | Native picker, signed storage upload with no API bearer token, server finalization, short-lived authorized read URL. |

## Concrete gaps and limits

- `FormRules.ValidateDefinition` rejects `FileAttachment` with `FILE_ATTACHMENT_UNSUPPORTED`. There is no authorized form-answer media workflow. Mobile reports this explicitly; it does not invent a media reference format.
- `SaveExecutionRequest` / `ActualSet` have no attachment IDs or per-set completed flag. The app records actual values and skipped state, supports saving a set and starting rest, and does not send fictional completion or attachment properties.
- There is no client endpoint returning the full effective assigned-program revision document. Mobile shows the authorized assignment schedule and individual workout snapshots. Full owned-plan documents are supported. Assigned plan full blocks/cycles require an additive authorized API contract.
- Progress renders actual-set charts by exercise/load meaning/unit and adherence summaries. Measurement charts explicitly display the current history page. The API does not expose an e1RM field; the mobile client does not add a second formula engine.
- Picker result sets for program/form/offer assignment are bounded first pages (50); catalog substitutions use server search (20). Full paging in those pickers, selected-client batch check-in assignment, advanced schedule management, measurement/note editing remain follow-up work.
- Documentation file opening hands a short-lived signed link to the platform. An already exported copy cannot be revoked. Upload lifecycle/identity cancellation is supplied by the shared infrastructure.
- Auth, tabs, settings and shared controls have typed EN/PL translations; daily feature copy is still partly English. PL decimal input is accepted. Complete localization and scroll-to-first-validation-error remain unverified/incomplete; see localization.md.
- No iOS/Android device acceptance is claimed by TypeScript checks or pure tests. Native Back/gesture confirmation, keyboard behavior, restart draft recovery, two-device conflict reconciliation, private file opening and real API role isolation still need end-to-end device verification.

## Verification

`node.exe node_modules/vitest/vitest.mjs run --project mobile-core apps/mobile/src/features/training/model.test.ts apps/mobile/src/features/today/model.test.ts` — eight adapter tests passed (decimal parsing including negative form answers, blank actuals, segment identity, actual/prescribed separation, rich labels, clock-based rest, date-only round trips and stable seven-day calendar windows). Shared serial queue tests cover drain/conflicts and concurrent local persistence. `node.exe node_modules/typescript/bin/tsc --noEmit -p apps/mobile/tsconfig.json` passed after integration.

`NativeDateField` uses the installed DateTimePicker 9.1 API: imperative Android system dialogs, native iOS picker inside a mobile Sheet, and local calendar-date formatting without UTC conversion. The Today calendar query freezes its range on mount and explicitly sends the selected role; coach schedule aggregation without a relationship ID is supported and policy-filtered by `TrainingDeliveryService.VisibleAsync`. Actual native behavior remains device-unverified.

Client intake additionally supports `/coaches`, `/invitation/[id]` and `/application/[id]`: own coaches/invitations/applications, allowed accept/decline/revoke, active offer terms including package expiry, custom session count, application draft/submit/withdraw with encrypted restoration and explicit version reconciliation. These are applications, not mobile checkout flows.
