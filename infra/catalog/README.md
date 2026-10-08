# Shared exercise catalog

Source data for the catalog every coach sees: movement patterns, muscles and exercises. The JSON here is the
source of truth; `build-catalog-seed.mjs` turns it into one idempotent SQL transaction.

| File | Shape |
| --- | --- |
| `movement_patterns.en.json` | `[{ "key": "hinge", "label": "Hip hinge" }]` |
| `movement_patterns.pl.json` (optional) | same keys, Polish labels |
| `muscles.en.json` / `muscles.pl.json` (optional for now) | same shape |
| `exercises.en.json` | `[{ name, description, instructions, demonstrationUrl, primaryMuscles, secondaryMuscles, movementPatterns, tags }]` |
| `EXERCISE_INDEX.md` | Human-readable index by category (documentation only) |

Dictionaries store one label per language: `<name>.en.json` fills `label_en`, `<name>.pl.json` fills
`label_pl`. Without a Polish file, new entries show the English label in Polish too and existing Polish
labels are kept. Until `muscles.en.json` exists, muscles are created from the keys the exercises use with a
label derived from the key (`gluteus-maximus` → "Gluteus maximus").

## Build and run

```bash
npm run catalog:seed          # writes .local/catalog-seed.sql (ignored by git)
```

The script validates first (key format, duplicates, unknown muscles/patterns, lengths, https URLs) and stops
on the first problem. Run the output with the migration role, once per environment, after the EF migrations:

```bash
psql "$TRAINFLOW_MIGRATION_DATABASE" -v ON_ERROR_STOP=1 -f .local/catalog-seed.sql
```

What the seed does:

- Upserts patterns and muscles; entries that disappeared from the lists are marked inactive (not deleted, so
  coaches' exercises that use them keep working; pickers stop offering them).
- Creates missing tags (an existing tag with the same normalized name is reused).
- Upserts exercises attributed to the catalog author `7f1c0000-0000-4000-8000-00000000ca7a`, with
  deterministic ids, a revision per version, and their muscle/pattern/tag links. A coach's own exercise with
  the same name is never touched. Re-running changes nothing unless the JSON changed.

The seed was verified on PostgreSQL (PGlite) against the schema generated from the EF migrations: two runs
give identical results, and a pre-existing coach exercise with a catalog name is left alone.
