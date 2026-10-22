# Frontend architecture

One site: the public pages at `/` (English) and `/pl` (Polish), the account screens under `/auth` and
`/onboarding`, and the coach application under `/app`. Business data comes only from the ASP.NET API;
Supabase is used for Auth only.

`AccountScope` owns the lifecycle shared by HTTP and both SignalR channels. A generation change
aborts work synchronously; token reads check that lifecycle before and after awaiting Auth. Late
responses, body-read failures and connection starts cannot revive a previous account. Realtime
effects retain their own disposal signal, and StrictMode replay safely re-arms the scope. The
existing account-prefixed query keys and polling policy remain unchanged.

Action feedback uses one top-right toast: a new result replaces the previous message, successes
expire after five seconds and errors remain until dismissed. Leaving an account clears private
feedback. Coaching mutations acknowledge the completed write before refreshing lists in the
background. Library screens share the same accessible cards/list toggle and retain URL filters.

## Stack and versions (checked 2026-10-05)

| Concern | Choice | Version |
| --- | --- | --- |
| UI | React, TypeScript strict | 19.3, 5.9.3 |
| Routing / build | React Router framework mode on Vite | 8.4, 8.3 |
| Server state | TanStack Query | 5.104 |
| Accessible primitives | React Aria Components (wrapped by `@trainflow/ui-web`) | 1.21 |
| Auth | `@supabase/supabase-js` (Auth only) | 2.117 |
| Component docs | Storybook (`apps/ui-catalog`) | 10.6 |
| Tests | Vitest + Testing Library, Playwright | 5.0, 1.63 |
| Icons / fonts | lucide-react; Geist, Geist Mono, Saira via Fontsource | |

**TypeScript 5.9, not 6/7:** `openapi-typescript` (used by CI to regenerate `contracts/generated/api.d.ts`)
and `typescript-eslint` don't support TypeScript ≥ 6.1 yet. 5.9.3 is the newest version all tools accept.

**npm workspaces, not pnpm:** the repository already had an npm lockfile and CI runs `npm ci` and
`npm audit`. Introducing pnpm would mix package managers; npm workspaces give the same monorepo layout with
one lockfile.

**No form library:** forms are small (auth, onboarding, settings, dialogs). React Aria fields provide
validation states and accessible errors; parsing lives next to each form.

**No data-grid library:** the editor grid is domain-specific (typed prescriptions, segments, back-off
references, groups). A generic spreadsheet adapter would still need all of that logic and the capable grids
put range selection/clipboard behind paid tiers. The grid renders one workout at a time, which bounds the
DOM; virtualization was not needed (the unused dependency was removed).

## Rendering

`react-router.config.ts`: `ssr: false` with `prerender` for every public page in both languages, `/404` and
`/sitemap.xml`. Because `/` is pre-rendered, the build also writes `__spa-fallback.html` for client routes.
Private routes run only in the browser: `layouts/private-root.tsx` (QueryClient, Supabase session layer,
app language, toasts) is never part of a pre-rendered page, so no session, token or private request can end
up in static HTML. The landing does not load the Supabase SDK or the editor (verified by an e2e test).

Hosting rules are in [hosting.md](hosting.md).

## Routes and layouts

| Route | Layout | Notes |
| --- | --- | --- |
| `/`, `/features`, `/features/program-builder`, `/features/video-analysis` (+ `/pl/…`) | `PublicLayout` | Pre-rendered, canonical + hreflang + OG |
| `/auth/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/callback` | `AuthLayout` | `noindex` |
| `/onboarding` | `AuthLayout` + `AccountGate(mode="onboarding")` | |
| `/app` → `/app/dashboard`, exercises, programs, templates, formulas, video-analyses, settings | `AppLayout` (`AccountGate` + `AppShell`) | |
| `/app/programs/:id/edit`, `/app/templates/:id/edit` | `AppLayout` | Route `handle.workspace`: fills the content area below the app bar, sidebar stays |
| `*` | – | Not-found page (pre-rendered as `/404`) |

Folders are URL state (`?folder=`), not a separate product area: the library shows folder cards next to plan cards (or rows in the table view, `?view=table`), and opening a folder narrows the same screen. Collections (exercises, templates, formulas, analyses, videos) use the `DataTable` component. Legal pages `/privacy` and `/terms` are not
built: no content was supplied (see the release blockers in [api-gaps.md](api-gaps.md)).

## Code layout

```
apps/web/app/
  root.tsx, routes.ts
  layouts/                public, private-root, auth, app (+ shell components)
  modules/                feature modules; each exposes index.ts
    marketing/ auth/ accounts/ dashboard/ exercises/ training/{library,editor,import-export,…}
    video-analysis/ settings/
  shared/                 cross-cutting infrastructure only
    access/ session/ http/ i18n/ lib/ dev/
packages/ui-web/          component library (tokens, styles, primitives, components)
packages/api-client-web/  typed contract (re-exports contracts/generated)
apps/ui-catalog/          Storybook (developer tool, not deployed)
```

Boundaries are enforced twice: ESLint `no-restricted-imports` and `app/architecture.test.ts`
(modules import other modules only through `~/modules/<name>`, `shared/` never imports modules, `ui-web`
never imports the app, Supabase, React Query or the API client, and nothing calls `supabase.from()`).

## Component library (`@trainflow/ui-web`)

Local package with React as a peer dependency, `sideEffects: ["**/*.css"]` for tree-shaking, and one explicit
stylesheet import (`@trainflow/ui-web/styles.css`). Groups: actions (Button, LinkButton, IconButton, Link),
typography, fields (TextField, TextArea, NumberInput, DateField, SearchInput, Select, Combobox, Checkbox,
Radio, Switch, SegmentedControl), overlays (Dialog, AlertDialog, Popover, Tooltip, DropdownMenu),
structure (Tabs, Breadcrumbs, Card, Separator, PageHeader, SectionHeader, Toolbar, Pagination, List/ListRow),
feedback (Badge, Alert, Toast, Spinner, Skeleton, EmptyState, ErrorState) and display (Avatar, Kbd, FileCard).

Domain components (set grid, exercise picker, formula picker, charts) live in their modules. `ui-web`
knows nothing about endpoints, users or feature access: a `Button` receives `isDisabled`/`loading`; the app
decides why (`LockedReason` explains it with a tooltip).

## Data and state

- One transport (`shared/http/transport.ts`): base URL, Bearer token of *the account that started the
  request*, 20s timeout, `AbortSignal`, ProblemDetails → `ApiError` with stable `code`, quoted `If-Match`,
  `Idempotency-Key`, raw CSV bodies, blob downloads, empty 202/204. Absolute URLs are rejected so the token
  never leaves the API origin. A 401 refreshes once and replays **only GET**; writes are never resent. 403
  never refreshes.
- TanStack Query keys always start with the account key (`slot:userId`). Nothing is persisted to storage.
  Retries only for network/5xx. A `FEATURE_UNAVAILABLE` response invalidates the cached access snapshot.
- Resource-scoped coaching invalidation matches complete URL path segments across pages and workspace modes. Group writes refresh group/client/relationship views; other mutations retain their existing dependency coverage.
- Messaging events carrying a conversation ID refresh only that conversation and its summaries. Reconnect and events without an ID reconcile the whole messaging cache. Existing 60-second live / 15-second fallback polling remains a recovery mechanism; hidden-tab polling stays disabled by TanStack Query defaults. Typing expiry preserves state identity when nothing expires, avoiding idle provider renders.
- The training editor serializes once per immutable document/metadata change and reuses that snapshot for dirty checks and saves. Status-only renders do not serialize the initial plan again; in-flight edits and version conflicts retain their existing behavior.
- List state (search, filters, sort, folder, page) lives in the URL; changing a filter resets the page.
  Empty library, no results and server errors are separate states.
- The editor keeps its working document outside the query cache, so a background refetch can never
  overwrite unsaved edits.

## Sessions and multiple accounts

`shared/session/manager.ts` keeps up to three Supabase clients, each with its own `storageKey`
(`tf.auth.slot.N`), PKCE verifier and refresh timer. The active account is per tab (`sessionStorage`, with
the last choice remembered in `localStorage`).

- Adding an account signs in through `/auth/login?slot=N&add=1`; the other sessions are untouched. Email
  links carry `?slot=N` back to `/auth/callback`, so the client holding the PKCE verifier exchanges the code.
  Signing in twice as the same person keeps one copy.
- Switching asks about unsaved work (editor guard), then bumps a generation counter. `AccountScope` is keyed
  by account + generation: the subtree remounts (editor state, selection, errors reset), the old account's
  `AbortController` aborts its requests, polls and downloads, and its cache entries are removed. Responses
  that still arrive are rejected as `StaleAccountError` because each request remembers the account and
  generation it started with.
- Signing out one account (`scope: "local"`) never touches the others. An account that disappears without a
  user action (refresh failed, other tab) is announced with a toast.
- Session states rendered by `AccountGate`: loading (neutral boot screen, no private data), signed out
  (redirect to login with a sanitized `returnTo`), onboarding required, ready, account disabled
  (`ACCOUNT_DISABLED`), session expired (401) and communication error (retry). A failing `/me` is never
  treated as a new, empty account.
- `returnTo` accepts only same-origin `/app…` and `/onboarding` paths.

## Feature access

`useFeatureAccess(key)` reads `GET /me/access`. Only an explicit `available` decision opens a feature;
loading, unknown keys or a failed request keep it closed. Reasons (`not_granted`, `explicit_deny`,
`operationally_disabled`, `dependency_unavailable`, `limit_reached`) are shown as text. `RequireFeature`
guards routes, `FeatureGate` hides optional UI, `LockedReason` explains disabled actions. Existing data stays
readable (e.g. advanced sets remain visible and removable after `training.sets.advanced` is revoked). The UI
never replaces the API check.

## Editor

The editor fills the content area of the app shell (sidebar and app bar stay). It has two modes; the
document underneath is always the API's tree (program → blocks → cycles of 1–366 days → numbered days →
workouts → exercises → sets).

- **Simple**: one cycle at a time, day by day. Each workout is a table with one row per exercise
  (the same cells as the sheet: a single click starts typing, sets is a number applied to every set,
  exercises are picked by typing a name or muscle). The right panel shows the volume of the day and of
  the cycle. Available
  for every plan and never changes its structure: it only limits what can be created (no blocks, cycles,
  connections or formulas; plain loads, an existing formula stays visible). A 7-day cycle shows weekdays
  (day 1 = Monday), other lengths show "Day N"; with several cycles a select picks which one. A day without
  workouts is a rest day with an optional note. An empty plan starts as one block with one 7-day cycle.
  Plans shaped like that open in simple mode, others in advanced; the toggle switches at any time.
- **Advanced**: a spreadsheet-like sheet (lettered columns, numbered rows). Blocks and cycles are cards that
  can be placed on any cell (drag, or arrow keys on a focused card); names and descriptions are typed
  directly on the cards. Dragging from a block's handle onto a cycle connects them (the cycle moves into that
  block). Right click opens context menus everywhere: the sheet (add here, arrange, reset zoom), cards,
  connections and exercise cells; Shift+F10 or the Menu key opens them from the keyboard. Ctrl + scroll
  zooms around the pointer (40–180%); the sheet always has enough cells, column letters and row numbers to
  fill the screen at 40%. The minimap in the bottom-right corner moves the view and holds the zoom controls.
  Buttons on the sheet keep the normal cursor; editable names show a text cursor. The toolbar is a
  full-width dark blurred bar on top (the sheet scrolls under it); the minimap floats bottom-right.
  On an expanded cycle the heading row and each workout row sit on the cycle's columns: name in the
  first two cells, cycle length / day in the third, ⋮ in the last — no extra frames.
  - **Connections**: a block has a small socket on its edge; dragging from it draws a cable, which ends in a
    plug on the cycle's header. Cables are green; hovering a block, a cycle or a cable sends an animated
    current along every cable it belongs to (static highlight with reduced motion).
  - **Folded cycle**: a mini calendar (7 numbered tiles per line: blue for training days, quiet for rest
    days, a dot for a note) and a legend of its workouts with their day. A cycle opens only from a
    training-day tile or its arrow; clicking a rest tile edits its note.
  - **Selection**: dragging on empty cells draws a rectangle and selects every card it touches
    (Shift adds); dragging any selected card moves the whole selection; Escape or a click clears it. The note is stored on the day (`note`), so a rest day exists in the
    document only while it has one.
  - **Cells**: clicking a folded cycle expands it (only its arrow folds it again). Block and cycle names
    show a text cursor: a click edits them, pressing and dragging still moves the card; "Rename" in the
    menu does the same. The expanded cycle is
    transparent: its table is written straight into the sheet's cells. Workouts A, B, C… sit one under
    another; each heading row holds the name, a day chip (changing it moves this workout to that day of
    the cycle, it never adds one) and a ⋮ menu (also on right click, which frames the whole workout including the menu cell): rename,
    change day, add exercise, fold, duplicate, remove. Columns, all optional: exercise (typed with
    autocomplete that matches names and worked muscles and shows each suggestion's primary muscles; text
    that matches no picked exercise turns the cell red), sets, reps, load (unit first:
    RIR — the default — RPE, kg or lbs, then the value), time (h:mm:ss) and rest (m:ss) — segmented fields
    like the birth date input: editing starts on minutes and jumps to the next part as you type and comment (a larger text box). Typing a value writes every set of that
    exercise; exercises whose sets differ are shown in italics. The exercise context menu offers duplicate,
    reorder, remove, the detailed set editor and the load formula select; the cycle menu offers duplicate
    and cycle length.
  - **Volume**: sets, reps, hard sets (RPE ≥ 7, RIR ≤ 3 or AMRAP) and kg (reps × absolute load) per
    primary muscle (default), secondary muscle or movement pattern — primary and secondary muscles are
    counted separately. One small table per workout plus the total, no sideways scrolling. The same
    content is the sheet's side panel and the simple editor's right panel.
  - Expanding and folding resize the card smoothly; new content fades in (only rows of a just-unfolded
    workout animate, so editing never flickers); hovers fade.
  - Cards never overlap: an expanding cycle keeps its place and neighbours glide to the nearest free cells;
    "Arrange" animates back to the default layout.
  - **Progression**: a block's context menu offers "Progression…": pick an exercise, what to increase (load,
    load %, reps) and the step per cycle; later cycles of the block are rewritten from the first cycle that
    has the exercise. The result is ordinary values, so any day can still be changed by hand.
  - A disconnected cycle lives only in memory, is marked "not connected" and is not saved; leaving with one
    that has days asks first. Card positions, expanded cycles and folded workouts are remembered in
    this browser per plan (`usePersistentSheet`, also used by the program preview); zoom is not.
- The program detail page shows the same sheet read-only (pan, zoom, expand) as a preview, starting at 70% zoom.
- Exercise table (both modes): arrows, Shift+arrows (range), Home/End, Enter/F2 to edit, typing starts
  editing, Escape, Tab, Delete clears, Ctrl/⌘+C/V (whole set prescription or TSV ranges), Ctrl/⌘+D duplicate,
  Alt+↑/↓ reorder, Ctrl/⌘+Enter add set. Focus stays on the grid (`aria-activedescendant`). Undo/redo is
  local and ignored inside text fields; Ctrl/⌘+S saves.
- Cell notation is parsed into typed fields (`8-10`, `82,5 kg` in Polish, `85%`, `RPE 8`, `RIR 2`, `1:30`,
  `3-1-X-0`) and never stored as free text. Ambiguous input (`2,5` in English) is rejected.
- Autosave waits 2.5s after the last edit, is single-flight, and sends the version the edit started from.
  412 opens a conflict dialog (keep my work as a copy, or load the latest); nothing is overwritten.
- Formulas: the formula editor suggests functions (`MIN`, `MAX`, `AVG`, `IF`, `ROUND_TO_STEP`, as accepted by
  the server's FormulaEngine), the formula's input names and units after a number (Enter accepts,
  Ctrl+Space opens). In the editor the formula is picked from a searchable list. Results are always
  evaluated by the server; there is no client expression engine.
- On screens under 56rem the editor is read-only with an explanation.
- Lists show 20 rows per page with page controls on the right. Larger forms (`Dialog` size lg/xl or `placement="right"`) open as a full-height panel
  flush with the right edge, actions pinned to the bottom. Dialog actions are compact, right-aligned,
  primary last (the rule for any right-aligned group). Disabled controls keep the normal cursor.
  Comboboxes cap their list at 15rem. The program page preview switches between
  the simple day view and the advanced sheet.
- Context menus open without a pre-selected item (arrow keys pick the first). Toasts are dark, lightly blurred
  panels with a faint tint and hairline of their type (info, success, warning, danger) and confirm creating, moving, renaming,
  archiving and deleting.
- Start-up (before hydration and while the session resolves) shows a faint skeleton of the app shell
  (`shared/ui/BootSkeleton`), fading in after 150 ms, instead of a logo.

## Internationalisation

Typed dictionaries (`shared/i18n/messages/*.en.ts` / `*.pl.ts`); TypeScript and a test require the Polish
dictionaries to have exactly the English keys. Public pages take the language from the URL; app and auth
screens take it from the profile (`locale`) or the stored preference. Numbers and dates use `Intl`; numeric
inputs are locale-aware (React Aria `NumberField`, `parseLocaleNumber`). User content is never translated.

## Exercise catalog data

The shared catalog (movement patterns, muscles, exercises) is maintained as JSON in `infra/catalog` and loaded
with an idempotent SQL seed (`npm run catalog:seed`, see `infra/catalog/README.md`). Dictionaries keep one
label per language (`*.en.json` → `label_en`, `*.pl.json` → `label_pl`), which maps onto the existing API
(`labelEn`/`labelPl`); the UI shows the label for the current language. Long dictionaries (75 muscles, 73
patterns, 176 tags) use searchable comboboxes, and retired entries are hidden from pickers.

## Developer mock mode

`VITE_DEV_MOCKS=1 npm run dev` replaces Supabase Auth and the API with in-memory fakes so screens can be
reviewed without a backend. It is only possible in the dev server (`import.meta.env.DEV`), shows a permanent
banner, is excluded from production builds (checked by grepping the build), and is never a fallback for a
failing real API. Uploads and CSV import are deliberately not simulated.

## Commands

```bash
npm run dev               # web app on http://localhost:5173 (PORT overrides)
npm run build             # production build in apps/web/build/client
npm run preview           # serve the build with the production routing rules (port 4173)
npm run storybook         # component catalog on http://localhost:6006
npm run storybook:build
npm run lint
npm run typecheck
npm test                  # Vitest (ui-web + web)
npm run e2e               # Playwright against the production build (run `npm run build` first)
```

Environment: copy `apps/web/.env.example` to `apps/web/.env.local`. Only public values belong there.

### User selection

`accounts/UserAutocomplete` is the shared username picker for client invitations, Team invitations and new conversations. It debounces a minimum two-character prefix, hides stale suggestions, cancels obsolete queries and keys its cache by account and search policy. Accounts exposes only public active/onboarded directory entries through `/api/v1/accounts/people`; messaging retains its own endpoint to enforce block filtering. Invitation details use a person header and no list hub navigation; viewing an invitation does not create a coaching relationship.
