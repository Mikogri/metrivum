# Client-aware training formulas

The advanced editor supports resizing spreadsheet column headers. Blocks, workouts, connectors and selection geometry share cumulative column coordinates; widths are bounded and remembered per account and plan. Drag a header edge, use keyboard arrows on its separator, or double-click to reset it. Cycle and max-table headers also resize their own columns: these preferences travel with the element, and vacated columns return to their base widths.

## Cells and reusable formulas

Load cells accept `=80 * (1 - 0.2)` or `=maxBench1r * 80%`. Basic scalar arithmetic uses kg in a load cell; explicit units retain the existing dimension checks. Cells show the server-calculated result and reveal the expression when selected. Load is edited in the cell itself. `=` offers math helpers and reusable formulas; `/` offers client variables, including `oneRepMax` for the selected exercise. Missing data can remain symbolic in drafts or be replaced with a formula-local manual value; parameter sources can be manual constants or a named client variable. Missing values remain missing, never zero. **Keep variable** explicitly retains unresolved bindings; closing the variable panel keeps the binding, while Cancel/Escape discard the editing session. Linked cells show a formula marker. Variable names autocomplete inside expressions without a slash. `ROUND_TO_STEP(value, 2.5)` uses the value’s unit for an unqualified step; explicitly incompatible units still fail. The advanced toolbar can create a reusable formula and opens formula help.

`FormulaEngine` remains the only calculation authority. Browser previews are debounced, account-scoped and discard obsolete results. There is no JavaScript `eval` or scripting runtime. Existing formula IDs, built-ins, pinned versions and input contracts remain valid; `FormulaUse.expression` and `variableBindings` are additive optional fields. A binding maps a declared parameter to an alias, for example `base1Rm -> maxBench1r`.

Context menus consume their opening/dismissal gestures, including portal events, so interacting with a menu cannot grab a sheet card. Opening a menu also cancels any active pointer capture.

## Client variables

`training.client_exercise_maxes` stores one client result per row: client/exercise IDs, repetition count, normalized kg, measurement date, alias and version. A unique client/alias index supports lookup and prevents ambiguous names. Aliases are case-sensitive. An active owning coaching relationship with manage permission is required to read or modify these client-owned values; merely receiving realtime data grants no access. Updates require `If-Match` and serialize by client. API grants are SELECT/INSERT/UPDATE only; the worker and public Supabase roles cannot read the table.

The editor's **Client data** dialog lists and edits exercise results. Profile variables come through `Accounts.Contracts`: `weight`, `bodyweight`, `bodyWeight` (kg), `height` (scalar cm), and `hrMax` (scalar bpm). These names and engine functions/units are reserved. Unset profile fields are omitted. This change does not infer one-repetition maxes from multi-repetition results: each entered result retains its actual repetition count.

## Snapshots and assignment

The plan name toolbar lists assigned clients, reuses the client/group assignment flow, and allows a client preview without assigning. Each assigned client owns a separate formula snapshot: concrete variables, their source versions, evaluated expressions and results. Changing a max or profile field never silently recalculates assigned workouts. The editor warns only when a source actually used by its formulas changes; an explicit refresh previews current sources, checks assignment/source versions again, then updates unstarted workouts from today onwards. Started/completed execution prescriptions remain immutable.

Applying an edited plan retains existing frozen variable values. Newly introduced aliases are supplemented from current authorized client data; a genuinely missing input aborts the entire apply transaction. Historical revisions, existing assignments and other clients' snapshots are retained. Plain preview selection is UI state and does not mutate the draft or create an assignment.

## API additions

All paths are relative to `/api/v1/training`:

- `GET /clients/{relationshipId}/variables`: variables, source versions and exercise result rows.
- `POST /clients/{relationshipId}/exercise-maxes`: validate and create a result.
- `PUT /clients/{relationshipId}/exercise-maxes/{id}`: versioned result update.
- `POST /programs/{id}/client-preview`: evaluate a saved or supplied draft for an authorized client without assignment.
- `GET /assignments/{id}/formula-snapshot`: frozen values/results and stale flag.
- `POST /assignments/{id}/formula-snapshot/preview`: calculate a proposed refresh without writing.
- `POST /assignments/{id}/formula-snapshot/refresh`: atomically adopt the previewed source versions, requiring assignment `If-Match`.

Migration `20261015150321_ClientFormulaSnapshots` adds the result table and nullable assignment snapshot. Contracts are exported using `infra/export-contracts.ps1`; neither startup nor browser UI runs migrations.

## Verification — 2026-10-15

The migration was applied to the previously confirmed development project `atclvdkpbccafakzpwls`; migration history, migrator ownership and API/public/worker privileges were re-read afterwards. Disposable local PostgreSQL checks passed: 40 Training integration tests and 236 unit tests. Frontend/mobile suite: 405 passed; the final cell/dialog/metric checks also passed (nine cases). Workspace typecheck, ESLint, web/API builds and the source secret guard passed; Graphify was refreshed. Evidence is ignored under `.local/training-advanced-2026-10-15/`.

No physical-device or browser end-to-end acceptance was performed for this feature. The attempted running-API restart was rejected by the execution policy; restart the development API manually to load the new source. New builds were verified in an isolated artifact directory so the running API was not overwritten.

The measured 1RM is the most recent single-repetition result for that exercise (ties use version, then ID). Multi-rep results are not converted. Bindings use a reserved `exercise1Rm_<exercise ID>` source key, retain source versions, and follow the existing frozen assignment/recalculation rules. The editor initially selects an active assigned client when available.

## Draft validation and rounding

`ROUND_TO_STEP_LOWER(value, step)` rounds towards negative infinity; `ROUND_TO_STEP_UPPER(value, step)` rounds towards positive infinity. Old `ROUND_TO_STEP` expressions retain nearest-step behavior for compatibility. Unqualified steps use the value's unit.

Stored formula inputs contain manual constants only; variable bindings contain source aliases. Evaluation requests resolve those sources separately. The same storage normalization covers exercise rows, individual sets, segments and complete document saves.

Draft saves enforce structural limits, catalog membership, formula ownership and feature permissions, while allowing unfinished formula syntax or incompatible expression units. Apply performs authoritative formula validation before creating a revision or updating assignments. Invalid cells retain their expression with a subtle red fill and unchanged borders. The save status shows “Draft saved — invalid format” after a successful draft save; “Couldn't save — invalid format” means the save was rejected. Typing keeps the cell background transparent; the source inspector opens from the formula data sources button, the cell context menu.

## Block exercise maxes

Advanced mode's **Add maxes table** creates a disconnected, compact sheet table with no initial rows. Edit its cells directly; exercise names use autocomplete and loads use the same inline formula editor as workout cells. Each value has an explicit kg/lb selector. `/` offers typed variables such as `oneRepMax_kg` and `oneRepMax_lb`; `=` offers functions and saved formulas. For example, `=ROUND_TO_STEP_LOWER(oneRepMax_kg, 2.5)` rounds in kg. Profile weight aliases also support kg/lb; HR max remains client-wide. Legacy unqualified aliases remain valid.

Transparent cells follow the sheet widths, with the same rounded frame, movement transitions, options button and cable plug as cycle cards. Right-click a letter in the main sheet header to reset that column width. Cables choose outward-facing sides from the current card bounds; stacked cards use vertical connections and plugs rotate with their attachment side. Drag the table socket onto a block to connect it; table options disconnect or delete it. One block accepts one table; deleting a block detaches its table without losing rows. Each of at most 64 rows has one unique exercise, a repetition count (1–100), and a positive mass or formula. Blank values remain editable drafts but block Apply. An explicitly entered variable can remain active while athlete data is missing.

`repMax` uses the selected exercise's repetition count from the connected table. `oneRepMax` always refers to a measured single: a five-rep row cannot overwrite it. A table constant overrides the athlete source only inside that block; HR max, weight and height remain client-wide. Copies and applied revision snapshots carry the table. Editing a draft does not mutate athlete records or earlier revisions.

Table formulas resolve against athlete data before their result becomes a block override, preventing self-reference. Their underlying source versions propagate to consuming workouts so changed athlete data marks frozen snapshots stale. Purchased copies do not retain seller-owned max-table formula references.

The additive optional `TrainingDocument.maxesTables` array stores independent table IDs, nullable block connections and rows in the existing JSON document; no database migration is needed. Legacy `Block.exerciseMaxes` tables remain readable. Saves from older clients preserve omitted tables; an explicit empty array clears them. Copy remaps table and block IDs together. Disconnected tables never contribute formula values. The owning API rechecks catalog references and evaluates the block scope for Apply, client previews and assignment snapshots. Block constants do not receive athlete source versions, so changing an unused athlete max cannot make them falsely stale.

## Comments and goals

Advanced mode stores movable Comment/Goal cards in optional `TrainingDocument.annotations`. Cards start global and coach-only. Drag a socket onto a block or persisted cycle to scope it; **Make global** disconnects without removing its text. **Coach & client** explicitly shares it. Removing the target detaches the card. Copies remap annotation/target IDs; older clients preserve omitted annotations.

API workout snapshots carry only annotations relevant to their block/cycle plus global notes. Client responses and purchased plan copies exclude coach-only annotations server-side. Started workouts retain their original annotations; Apply updates unstarted occurrences through the existing revision lifecycle. Shared notes are visible in web and mobile workouts. No database migration is required: content remains in existing JSON documents.

While connecting, eligible hovered cards receive a frame and the preview plug snaps to their edge; other cards also block the preview endpoint. Release commits only an eligible target.

## Verification — 2026-10-16

Affected checks passed: 111 web unit/component tests, 68 backend unit tests, 29 PostgreSQL integration tests (including plan purchase), and nine desktop Chromium interaction tests. Workspace typecheck (including mobile), scoped ESLint, web build and API compilation passed. Graphify was refreshed. No new database migration is required; restart the development API to load the updated JSON contracts. Device tests were not run.

Max-table exercise rows use the cycle autocomplete: selecting an exercise creates the row, while cancelling creates nothing. Already listed exercises are excluded. Missing exercises mark their own cell independently of load validation. Inline mass cells use the shared Select component and show units only in its selector; read-only values retain their unit labels. Column adaptation interpolates one shared geometry map for headers, cards, grid lines and cables, respects reduced motion, and follows direct pointer resizing immediately.

Cycle headings own their resize handles and share column bounds with the exercise cells. Suggestions expose unit-qualified mass names, with bodyWeight_kg/bodyWeight_lb labelled Body weight; legacy aliases remain accepted in saved expressions. All load input text aligns left. The input fills the cell and the unit selector anchors its right edge. Library formulas omit the linked-variable marker. Formula menus clamp to the viewport so the close action stays reachable.

Max-table load values share the cycle cell styling and inline editing control. Their repMax variable uses the table row's repetition count. Function suggestions show compact ROUND↓/ROUND↑ labels while inserting and storing the canonical ROUND_TO_STEP_LOWER/ROUND_TO_STEP_UPPER expressions.


`percentage-1rm`: select **Percentage of 1RM** after typing `=`, open **Formula data sources**, choose the selected exercise's 1RM or a manual base, and enter **80** for 80%. The UI stores `.8` for the existing scalar contract: 100 kg at 80% produces 80 kg. Reopening a built-in restores its complete declared parameter list, including bound or missing inputs.

Invalid-format status hover text lists the affected card, row/exercise and column with the validation reason. Draft saving remains separate from Apply validation. Maxes tables and annotation cards can fold without discarding content or diagnostics; their account/plan-scoped arrangement remembers the folded state. Folded cards use the same small inset as cycles. Right-click any cycle column heading for **Reset column width**, or double-click its resize edge; resetting an element preference leaves other columns intact.

Cycle and max-table load cells share the same input, unit selector and options implementation. The separate cycle load popup was removed. Training-specific effort modes remain available in the shared options; max rows retain their positive-mass validation.

Explicit Save and Ctrl+S flush active Load edits before serializing the draft, including unfinished autocomplete expressions. Mass selectors contain only kg/lb; time selectors use s/min and count cells have no units. Formula parameter menus retain focus across their portal; save-status diagnostics use the shared styled tooltip.

After updating LoadFormula/LoadUnit support, rebuild and restart an already running API; older hosts reject these max-table fields during JSON binding. JSON binding errors report the failing field path without exposing submitted values.


### Typed fields and larger editing

Sets, Reps, Time and Rest reuse the Load expression editor, source selectors, suggestions and side panel. `fieldFormulas` stores their versioned formulas without mass units; Sets belongs to the first standard set and supports 1–50 whole sets. Apply also bounds the total calculated sets by the document node limit. Reps requires whole positive values; time/rest resolve to seconds. Invalid expressions remain saveable drafts.

**Expand formula editor** transfers the current expression, parameters and manual sources to the existing right-side dialog. Cancel discards the whole edit. Menus measure their content and flip above or left before clamping to the viewport; scrolling is reserved for content larger than the viewport. **Reset all column widths** clears both global and element widths for this account/plan.

Exercise-max tables now have an optional Time column (s/min), literal or formula. A row needs a mass or time value. `maxTime_s` / `maxTime_min` refer only to the connected block and row repetition count; they never supply an exercise 1RM. Snapshots, deliveries and purchased copies share typed formula freezing. The additive JSON fields need no SQL/EF migration; regenerate contracts and rebuild/restart the API.

Literal time values in cycles, Rest and maxes use the original segmented clock (h/m/s for Time and maxes, m/s for Rest). Type `=` or `/` in the cell, or use **Edit formula** in its context menu, to open expression editing. This does not replace the clock interaction for ordinary durations.

## Editor previews and maximum effort

Detailed workout editors own their block formula scope, including linked maxes tables, regardless of the entry point. API/MCP-created expressions resolve explicit bindings and named snapshot variables using the same rules as typed expressions. Manual inputs stay fixed; missing sources stay unresolved and never reuse a previous numerical preview. Arithmetic remains in the API. MCP document DTOs preserve field formulas, output units, timed maxes and cycle/block metadata when reading and patching a web-created plan; strict JSON roundtrip tests guard against silent loss and rejected fields.

Type `AMRAP` directly in Reps to use the existing Amrap set kind (no fixed reps or Reps formula). Typing a number or formula replaces that kind with Standard. In exercise Time, type `/` and choose `MAX` for maximum effort duration. This persists the optional `workTimeMax` flag without a fixed WorkTime or WorkTime formula. A literal duration or formula replaces MAX. Existing documents omit the flag; no database migration is needed because prescriptions are JSON. Deploy the API before the updated client. Actual repetitions and duration remain optional client log fields, never inferred as zero or copied from a maximum target. A saved, non-skipped maximum-effort set permits completion without numerical results; an empty workout, unknown set ID or skipped set does not. AMRAP is a basic set marker in both editor modes.

In the exercise comment popover, Enter finishes and closes; Ctrl+Enter (Cmd+Enter on macOS) inserts a newline. IME composition Enter does not finish editing.

Repetition prescriptions and Reps formula outputs accept whole numbers from 1 to 999, with the upper bound at least the lower bound. Actual logs accept 0–999 or no result; AMRAP remains open-ended. Invalid drafts can still be saved, but applying them is blocked with the field location and permitted bounds. Existing revision/history reads are unchanged.
