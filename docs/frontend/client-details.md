# Client Details

The route `/app/clients/:relationshipId` identifies a coaching relationship, never a global client profile. Its tabs are Overview, Activity, Progress, Profile, Documentation and Check-ins. Data loads only for the selected tab; query keys include the account, workspace mode, relationship and filters.

- **Overview:** status/context, collaboration start date, last recorded training, paginated active assignments/services, groups, check-ins and service payment summary. Accepted offer revisions supply prices. Global Pro/Team subscription payments are excluded. The common header has no start date.
- **Activity:** SQL-filtered/paginated occurrences, program/block/cycle/status/date filters, recorded execution details and original prescription snapshot. `activity.*` URL parameters preserve navigation. Planned values are never substituted for actual execution.
- **Progress:** canonical body measurements, versioned corrections and dated trends. BF differences use percentage points. Strength metrics use exact actual ExerciseId and load meaning. Completion uses past-due scheduled occurrences, excludes cancelled/rescheduled originals, and does not penalize future sessions. Skipped and absent records remain distinct. Definitions are returned by the Training API.
- **Profile:** shared account fields and allowed training information; original submissions are read through a relationship-scoped endpoint. A service link determines which historical application belongs here. Unavailable account fields show Not shared.
- **Documentation:** Photos, Files, and author-private coach notes. API checks grants on every download; revocation prevents new signed URL issuance. Delete is versioned soft deletion, retaining pinned media according to retention policy.
- **Check-ins:** server counters/filters, immutable issued form version, explicit review action, separate private note/client reply. Opening the right drawer does not change status. Unsaved reviews require confirmation before closing.

`drawer=payments`, `checkIn=<id>` and `application=<id>` restore detail panels. Payment filters use `pay*`; check-in filters use `ci*`. Date filters in billing/check-ins are UTC date boundaries with an exclusive upper bound. The displayed timestamps use the browser's configured local timezone.

## Data limits

- Existing global profile visibility does not expose email, locale or timezone to this view; no new account visibility rule was invented.
- Historical check-ins without persisted assignment provenance show Not recorded. New occurrences snapshot Direct/Group and permitted group names.
- e1RM has no approved estimation rule in the existing engine. Working/warm-up classification, execution-linked videos, reliable package session consumption and adherence are not recorded by their owning modules; unavailable metrics remain unavailable rather than inferred from prescriptions, calendar attendance or payments.
- Current block/cycle is shown only when provided by a reliable model; filters and original program links remain available.
- Training all-period charts use bounded server aggregates; the documented maximum of 1,000 strength points may truncate the oldest plotted history.

## Migrations

`20261009145839_PreserveCheckInAssignmentSource`, `20261009145726_ClientDetailsMeasurementsAndNotes`, and `20261009150700_DocumentRetentionDeletion` are additive. Applied and verified on local PostgreSQL and the user-confirmed Metrivum DEV project `atclvdkpbccafakzpwls`. Existing rows are retained; historical unknown source/size stays null.

## Verification

Backend unit: 206 passed. The broad integration run passed 259 cases; seven worker startup failures were fixed and verified in the final 96-case regression run. Two external Supabase Auth/Storage cases were skipped because their test credentials were unavailable. Frontend: 217 unit tests and 12 desktop/mobile browser cases passed; typecheck, ESLint and production build passed. The local API was restarted with the final build and readiness returned 200.
