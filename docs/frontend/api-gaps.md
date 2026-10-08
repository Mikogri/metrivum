# API gaps and release blockers

What the web frontend needed from the current contract and didn't find, how it works around each gap today,
and what would resolve it. The backend was not changed to fit the frontend.

## Release blockers

1. **Privacy policy and terms are missing.** Onboarding requires `acceptedTerms: true`, but there is no
   document to accept or link. The register and onboarding screens say so explicitly. Public registration
   must not open until the texts exist and `/privacy` and `/terms` are published.
2. **Nothing has been verified against a live API and Supabase project.** All integrations are typed against
   `contracts/generated` and exercised with the developer mock. Before release, run the flows in
   [verification checklist](#verification-still-required) against local/staging services.
3. **Auth email templates are unconfirmed.** The frontend supports both code entry (`/auth/verify`, `{{ .Token }}`)
   and links (`/auth/callback` with `code` or `token_hash`). The Supabase templates and redirect allowlist must
   be configured to match (see [hosting.md](hosting.md)).
4. **CORS only allows `http://localhost:5173`.** Staging and production origins must be added to
   `Cors:Origins` in the API configuration.

## Contract gaps

| # | Gap | Effect / workaround | Suggested API change |
| --- | --- | --- | --- |
| 1 | `Content-Disposition` is not in `Access-Control-Expose-Headers` | The browser can't read the server file name; the client builds `<program>-r<n>[-scope].<ext>` | Expose `Content-Disposition` |
| 2 | No `GET /training/folders/{id}` (or path) | Breadcrumbs come from folder lists already loaded; a deep link into a nested folder shows “…” for unknown ancestors | Folder by id including its ancestor path |
| 3 | No bulk exercise lookup | The editor and import fetch `GET /exercises/{id}` once per distinct exercise (cached for the session) | `GET /exercises?ids=…` or names in `PlanDto` |
| 4 | `ExerciseListItemDto` has no tags/muscles/patterns | The list shows name, description and date only | Add taxonomy keys to list items |
| 5 | Media and analysis lists return arrays without totals | Previous/next paging; “next” is enabled when a full page came back | Paged envelope with `total` |
| 6 | Moving a document requires `PUT /draft` with the whole document | Move = load + save draft with a new `folderId`; archived documents can't be moved; can conflict with an open editor (412 is reported) | Metadata-only move endpoint |
| 7 | Import mapping `PUT` replaces the whole mapping; whether auto-matched rows must be resent is undocumented | The client loads every preview page and sends all exercise rows (auto-matched + manual) | Document it, or merge auto-matches server-side |
| 8 | `AnalysisResult` doesn't state the velocity unit | Labelled `m/s` only when `metersPerPixel` is set, otherwise `<positionUnit>/s` | Add `velocityUnit` |
| 9 | Accepted values of `AnalysisConfiguration.movement` are undocumented | Free text, default `"unspecified"` | Enumerate or document |
| 10 | `LimitDecision` units are implicit | `media.maxVideoBytes` is assumed to be bytes | Add a unit per limit |
| 11 | Feature `titleKey`s use two naming schemes (`features.exercises.browse.title`, `training.export.csv.title`) | The frontend translates by feature key, not `titleKey` | Normalise |
| 12 | Analysis jobs expose status only, no progress | Indeterminate indicator with stage text; no percentage bars | Optional progress field (only if the analyzer can provide one) |
| 13 | Signed read URLs live ~120s | Playback URL is requested on demand and re-requested on error | – (documented behaviour) |
| 14 | No bulk operations (archive/move many) | UI offers single-item actions only, never a pretend-atomic bulk action | Bulk endpoints if needed |
| 15 | `POST /analyses` returns 503 `ANALYZER_NOT_CONFIGURED` in the shipped build | Shown as a real state after upload; the video stays in the library | Install an analyzer adapter |

## Verification still required

Against a local or staging API with real Supabase Auth:

1. Register → email confirmation (code and link) → onboarding → dashboard; expired code; rate limit message.
2. Password reset through `/auth/callback?slot=N&next=/auth/reset-password`.
3. Three accounts in one browser: add, switch while a request is in flight, sign out one, let one session
   expire in another tab; confirm no data from the previous account appears.
4. Feature revocation: remove `training.sets.advanced` / an export feature and confirm the UI and the API both
   refuse, while existing content stays readable.
5. Two tabs editing the same draft → 412 conflict dialog; save-as-copy and reload paths.
6. CSV import with unmatched rows, validation errors (row detail) and commit retry with the same key.
7. CSV/PDF downloads open as real files for program/block/cycle/workout scopes.
8. Upload, finalize, analysis creation (503 without analyzer), polling after refresh, cancel.
9. Screen-reader pass of the editor grid and dialogs (automated checks are not a substitute).
