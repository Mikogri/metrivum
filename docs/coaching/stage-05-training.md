# Training delivery and actual progress

Published programs remain immutable. Delivery uses the existing `training` schema and Training DbContext; `Training.Contracts.ITrainingProgressReader` supplies the existing Analyze section without exposing Training entities across modules.

## API

All routes require authentication and live relationship authorization. Base: `/api/v1/training`.

| Operation | Route |
| --- | --- |
| Resolve/deduplicate active recipients | `POST /programs/{id}/assignments/preview` |
| Assign a published revision | `POST /programs/{id}/assignments` |
| List/get assignments | `GET /assignments`, `GET /assignments/{id}` |
| Pause/resume/close individual assignment | `PUT /assignments/{id}/status` |
| Explicitly refresh future prescription | `POST /assignments/{id}/refresh` |
| Schedule and prescription/actual detail | `GET /schedule`, `GET /workouts/{id}` |
| Start/resume or explicitly skip | `POST /workouts/{id}/start`, `POST /workouts/{id}/skip` |
| Save actual values / complete | `PUT /executions/{id}`, `POST /executions/{id}/complete` |
| Actual progress | `GET /progress` |

Assignment creation requires `Idempotency-Key`. Reusing a key with a different payload returns `IDEMPOTENCY_CONFLICT`; a new key deliberately creates a separate assignment. Status/refresh/save/complete require a strong numeric `If-Match`; changed versions return `VERSION_CONFLICT`. Repeated start and completion return the existing execution. A skipped workout can be reopened with Start for late logging.

Recipient preview returns `{id, clientId, displayName, username}` for each unique authorized relationship. Names are loaded through the Accounts directory in one batch. Users with both account roles can read their own client assignments as well as assignments for their coaching relationships; ownership checks apply independently to each record.

Assignments, schedule and progress accept `view=coach|client`, requiring that account role and filtering its relationship perspective. Omitting the view preserves the union for dual-role accounts. Analyze explicitly selects the coach view, so personal workouts assigned by another coach never inflate a coach's client totals.

List filters include relationship/program; assignments also accept group, and progress accepts group/exercise. Lists use page/pageSize (maximum 100). Schedule/progress require inclusive `from` and `to` dates, at most 367 dates. Performance returns at most the latest 1000 exercise/date/load-meaning groups; narrow the date/exercise filters for detail. Report counts are SQL aggregates, not sums of this bounded chart response.

## Schedule and revision semantics

The explicit schedule time zone belongs to each assignment. Dates concatenate cycle lengths across blocks and honor each cycle's 1-based day position, including multiple workouts per day. A ten-day cycle consumes ten dates, never an assumed calendar week. Deadlines are UTC instants representing the next midnight in the assignment zone; DST days may be 23 or 25 hours. Invalid local midnight advances to the first valid minute; ambiguous midnight uses the later instant.

Refresh accepts a newer published revision only. It supersedes unstarted occurrences strictly after the assignment-local current date and rebuilds eligible future dates. Past/today/started occurrences keep their IDs, dates and effective revision. Their source workout IDs remain reserved even if the revised structure moves those workouts. This deliberately prioritizes preserved history over replaying moved historical workouts. In-progress means started and is never refreshed.

Each assignment batch has explicit group assignment records. A deduplicated recipient has one assignment and all original group-source links, so overlapping group views show the same assignment. Membership is resolved at assignment time. Adding/removing group members never rewrites historical assignments. To include a new member, explicitly assign them with a chosen start date; to exclude one, cancel that assignment without changing group membership.

Pause leaves schedule dates unchanged. Closing/cancelling hides today's and future unstarted occurrences from schedule/attendance; it preserves past occurrences and all started logs. Closed assignments cannot be resumed.

## Actual records and access

Starting creates a blank execution and freezes its prescription snapshot, catalog names and evaluated formula snapshots. Actual exercises and sets are separate relational records. Prescribed instance/set/segment references preserve comparisons and advanced-set context; a null reference denotes an extra exercise/set. Omitting a prior actual row removes it on save. Substitution stores the performed canonical exercise and name without changing the prescription.

Logs retain repetitions, kg/lb, load meaning (total external/per-hand/bodyweight/assisted), RPE/RIR, duration, distance, rest, tempo, comments, performed date and completion timestamp. Completion requires at least one performed set with positive repetitions, duration or distance; it never copies predicted values. Corrections overwrite actual records with updated author/time/version and preserve the frozen prescription. No offline sync or edit-version archive is implied.

Active relationships permit logging. Suspended clients cannot fetch protected training. Completed relationships retain historical read-only access. Coaches can review their own relationship history; another coach of the same client cannot access it. Paused/closed assignments prohibit new execution; a completed execution can be corrected while its relationship remains active. DTO `allowedActions` expresses these transitions; server checks remain authoritative.

Assignment and completion publish idempotent in-app events inside the shared module transaction. Delivery rechecks recipient/relationship eligibility. Notification payloads contain no prescription, exercise or private note text.

## Metric definitions

- **Due:** occurrences whose local-day deadline has passed within the selected scheduled-date window.
- **Completion:** completed due occurrences / due occurrences × 100; no due occurrences returns null (N/A).
- **Missed:** a due occurrence with no execution log. This means not logged by deadline, not proof no training occurred. In-progress and explicitly skipped are separate counts. Late completion changes the occurrence to Completed.
- **Logged late:** completion timestamp is on/after deadline. Performed date remains independently recorded, so late logging does not imply late training.
- **Actual sets/reps:** completed executions in the performed-date window, excluding skipped and entirely blank sets. Extra sets and substitutions count as actual work. AMRAP counts only recorded repetitions.
- **Volume:** sum of kg × repetitions for explicit total-external loads; pounds convert using 0.45359237. Missing, bodyweight, per-hand and assisted loads are excluded rather than guessed. No comparable values returns null.
- **Performance:** grouped by canonical exercise, performed date and load meaning; includes actual sets/reps, maximum recorded load, average recorded RPE/RIR and substitution counts. Maximum load is not an estimated or tested 1RM. No e1RM or opaque adherence quality score is generated.

Program/client summaries and current group cohorts are scoped to authorized relationship IDs and deduplicated. Attendance uses planned dates; performance uses performed dates. These windows can legitimately show different totals. Frozen prescription and current actual rows provide the drilldown for every exercise and set.

Optional clip attachments, cross-version check-in comparison and automated personal-best flags are not implemented by this delivery slice.
