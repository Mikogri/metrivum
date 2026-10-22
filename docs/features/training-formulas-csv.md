# Formula, CSV and PDF contracts

## Formulas

See [client-aware formulas](training-client-formulas.md) for advanced inline cells, named exercise/profile variables, and per-client frozen assignment snapshots. The legacy library bindings described below remain supported.

The domain engine is independent of HTTP and EF. It uses a bounded recursive parser and decimal arithmetic; there is no scripting runtime, reflection, SQL, file/network access or `eval`.

Case-sensitive identifiers match `[A-Za-z_][A-Za-z0-9_]*`. Numeric literals use a decimal dot (including `.8`), without thousands separators or exponent notation. Arithmetic is `+ - * /`, unary `+/-`, parentheses, and comparisons `> >= < <= == !=`. Precedence is unary, multiplication/division, addition/subtraction, then a comparison. Comparisons yield scalar 1/0. Input names and all inputs must be explicitly declared; missing inputs are validation errors. Program bindings supply prescribed values, not athlete execution history.

Literal units are `kg`, `lb`, `s`, `min`, `m`, `km`, `%`; omitting the unit makes a scalar. Kilograms/pounds, seconds/minutes and meters/kilometers convert within a dimension; 1 lb is exactly 0.45359237 kg. Percent is a scalar divided by 100. Addition/subtraction and comparisons require compatible dimensions. Multiplication needs a scalar operand; division permits a scalar divisor or matching dimensions producing a scalar. Derived dimensions such as kg·m are intentionally unsupported.

Functions are uppercase:

- `MIN`, `MAX`, `AVG`: 1–32 dimensionally compatible arguments.
- `IF(condition, a, b)`: scalar condition (nonzero means true), same-dimension branches. Both branches are validated and evaluated; missing inputs or division by zero in either branch is an error. It is not a mechanism for hiding invalid input.
- `ROUND_TO_STEP(value, step)`: positive compatible step, midpoint rounding **away from zero**, including negative values. `ROUND_TO_STEP(81.25 kg, 2.5 kg)` returns 82.5 kg.

Expressions, parsing depth, operation count, graph nodes and graph traversal depth have independent bounds. The graph evaluator shares one operation budget across nodes and rejects cycles and collisions between input/node names. Divide by zero and decimal overflow fail explicitly. Custom definition validation checks syntax and types without substituting guessed training values. Actual evaluation uses the complete program binding.

A custom definition is `{expression,inputs:{base1Rm:"Kg"},outputUnit:"Kg"}`. Rules append immutable numbered versions. Plan load bindings have one of `formulaId` or `builtIn`, a positive `version`, and `inputs:{name:{value,unit}}`. Loads must evaluate to nonnegative mass. A binding pins its definition version; edits to the rule library append a new version and leave existing plans/revisions alone.

Built-ins (all v1): `percentage-1rm` (`base1Rm * percentage`), `previous-cycle-increment` (`previousCycleLoad + increment`), `top-set-back-off` (`prescribedTopSetLoad * percentage`). The input values come from the plan; there is no client training log or implicit default zero.

## CSV import

1. `POST /api/v1/training/imports/csv?delimiter=,` with raw UTF-8 `text/csv`. Supported delimiters: comma, semicolon, tab. Optional UTF-8 BOM and RFC-style quoted fields (including embedded delimiters/newlines) are supported.
2. Response returns private preview session ID, expiry, ETag, row count and first 100 previews. `GET /imports/{id}?page=1&pageSize=100` pages through previews. Catalog matches are suggestions; unmatched names remain unmapped. The importer never creates catalog exercises.
3. `PUT /imports/{id}/mapping` with `If-Match` and `{ "exercises": { "0": "catalog-exercise-guid" } }`. Keys are zero-based **data-row** indexes. This replaces the mapping; include all selected exercise rows. Only current-user session rows and existing catalog IDs are accepted.
4. `POST /imports/{id}/validate` builds and validates the authoritative server-held rows, mapping, units, hierarchy, formula versions and feature access.
5. `POST /imports/{id}/commit` with `If-Match`, `Idempotency-Key` and `{name,kind,folderId}` repeats validation and atomically creates one independent document. Commit does not trust a client-submitted preview document. A retry returns the existing plan; changed content under a reused key returns `IDEMPOTENCY_CONFLICT`. A failed commit creates no partial plan. Expired sessions return 410; successful commits can still be replayed idempotently.

Only structured TrainFlow CSV v1 is supported, not arbitrary spreadsheets or PDF import. Export a revision as a starting template. Exact header order:

```text
format_version,row_kind,program_name,program_description,block_id,block_name,block_description,cycle_id,cycle_name,cycle_description,cycle_days,day_id,day_number,workout_id,workout_name,workout_description,instance_id,exercise_name,comment,sets_json,groups_json,exercise_snapshot_json,formula_snapshots_json
```

`format_version` is 1. Ordinary rows use `row_kind=exercise`; one row is one exercise instance, with its entire `sets_json` typed array. Superset/circuit groups are repeated as identical `groups_json` in the workout's exercise rows. Formula bindings remain in prescriptions with pinned IDs/version and typed inputs; published evaluations are explicit `formula_snapshots_json`. Exercise snapshot columns retain revision-time catalog data for exported records; **import matches/selects the live catalog and revalidates formula ownership**, never trusts snapshots to grant access. Conflicting repeated hierarchy metadata is rejected.

Empty parent containers use `row_kind=program|block|cycle|day|workout` and blank IDs below that level. Numeric cycle/day fields unused at a level are `0`; unused sets/groups are `[]`; optional snapshots are empty. GUIDs use canonical hyphenated form. Names/descriptions are repeated so a selected block/cycle/workout export carries its context. Numbers and JSON use invariant decimal dots; comma decimals and thousands separators are rejected.

Spreadsheet injection defense prefixes potentially dangerous text cells (`=`, `+`, `-`, `@`, leading whitespace/control characters) with an apostrophe. Existing leading apostrophes are escaped by doubling. Import removes this one format escape. Typed numeric fields and numeric JSON values remain actual numbers; they are not rewritten into text. CSV quoting is handled by CsvHelper 33.1.0.

Raw upload bytes are parsed in memory and discarded; the private database stores only bounded, typed session rows/mapping with ownership and expiry. Expired uncommitted sessions are deleted on the owner's next preview upload. Committed sessions retain an idempotency record. These imports do not create public Storage objects.

## Revision exports

`GET /programs/{id}/revisions/{number}/export?format=csv|pdf&scope=program|block|cycle|workout&scopeId=...`

`scopeId` is required for block/cycle/workout and omitted for the whole program. The resource owner and corresponding export feature are rechecked. Export always uses the requested immutable revision and its captured exercise/formula metadata. The GET operation is read-only and repeatable; it creates no permanent file/object or queued task. Bounded files stream to the authorized response and are not stored in public buckets.

PDF uses real text/tables, page breaks, units, comments, group/segment details and captured formula expressions/inputs/results. It embeds Noto Sans for Polish characters and does not fetch URLs from document content. PDFsharp 6.2.2 is pinned; its [official license is MIT](https://docs.pdfsharp.net/General/License/License.html), and the [6.2.2 package exists](https://www.nuget.org/packages/PDFsharp/6.2.2). The bundled unmodified Noto Sans regular font is redistributed under [SIL OFL 1.1](https://raw.githubusercontent.com/googlefonts/noto-fonts/main/LICENSE); the license is included alongside the font in the module.
