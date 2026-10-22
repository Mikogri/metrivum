#!/usr/bin/env node
// Builds an idempotent SQL seed for the shared exercise catalog from the JSON files in this folder.
//
//   node infra/catalog/build-catalog-seed.mjs [--out .local/catalog-seed.sql]
//
// Inputs (all in infra/catalog):
//   movement_patterns.<locale>.json   [{ "key": "hinge", "label": "Hip hinge" }]   en required, pl optional
//   muscles.<locale>.json             same shape                                    optional (see below)
//   exercises.en.json                 [{ name, description, instructions, demonstrationUrl,
//                                         primaryMuscles, secondaryMuscles, movementPatterns, tags }]
//
// Dictionaries keep one label per language: <name>.en.json fills label_en, <name>.pl.json fills label_pl.
// Without a Polish file the English label is used for new rows and existing Polish labels are kept.
// Without muscles.en.json, muscles are taken from the keys used by the exercises and labelled from the key
// (e.g. "gluteus-maximus" -> "Gluteus maximus") until the real list is added.
//
// The script validates everything first and exits non-zero on the first problem, so a broken file never
// produces half a seed. Run the output as one transaction with the migration role (trainflow_migrator).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf("--out");
const out = resolve(outArg > 0 ? process.argv[outArg + 1] : join(here, "../../.local/catalog-seed.sql"));

/** Account the shared catalog is attributed to. Coaches see these exercises but are not their authors. */
export const CATALOG_AUTHOR = "7f1c0000-0000-4000-8000-00000000ca7a";
/** Namespace for deterministic ids (UUID v5), so re-running the seed updates rows instead of duplicating them. */
const NAMESPACE = "6b3f1d2e-9a4c-4e8b-b5d7-0c1a2e3f4d5c";

const KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const fail = (message) => {
  console.error(`catalog seed: ${message}`);
  process.exit(1);
};
const read = (file) => JSON.parse(readFileSync(join(here, file), "utf8"));
const optional = (file) => (existsSync(join(here, file)) ? read(file) : null);

// Same rules as CatalogText.Clean / Normalize on the server (NFKC, trim, collapse spaces, upper case).
const clean = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const normalize = (value) => clean(value).toUpperCase();

function uuidv5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const sql = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

function dictionary(name, fallbackKeys) {
  const en = optional(`${name}.en.json`);
  const pl = optional(`${name}.pl.json`);
  let entries;
  if (en) {
    entries = en.map((item, i) => {
      if (!item || typeof item.key !== "string" || typeof item.label !== "string") fail(`${name}.en.json[${i}] needs "key" and "label"`);
      return { key: item.key, en: clean(item.label) };
    });
  } else if (fallbackKeys) {
    const words = (key) => key.replace(/-/g, " ");
    entries = [...fallbackKeys].sort().map((key) => ({ key, en: words(key).charAt(0).toUpperCase() + words(key).slice(1), generated: true }));
  } else fail(`${name}.en.json is required`);
  const seen = new Set();
  for (const entry of entries) {
    if (!KEY.test(entry.key) || entry.key.length > 80) fail(`${name}: invalid key "${entry.key}" (lowercase words joined by "-", max 80)`);
    if (seen.has(entry.key)) fail(`${name}: duplicate key "${entry.key}"`);
    seen.add(entry.key);
    if (!entry.en || entry.en.length > 120) fail(`${name}: label for "${entry.key}" must be 1-120 characters`);
  }
  const polish = new Map((pl ?? []).map((item) => [item.key, clean(item.label ?? "")]));
  for (const key of polish.keys()) if (!seen.has(key)) fail(`${name}.pl.json: key "${key}" is not in ${name}.en.json`);
  return { entries: entries.map((e) => ({ ...e, pl: polish.get(e.key) ?? null })), hasPolish: Boolean(pl) };
}

// ---------------------------------------------------------------------------------------------
// Load and validate

const exercises = read("exercises.en.json");
if (!Array.isArray(exercises)) fail("exercises.en.json must be an array");
const usedMuscles = new Set(exercises.flatMap((e) => [...(e.primaryMuscles ?? []), ...(e.secondaryMuscles ?? [])]));
const patterns = dictionary("movement_patterns");
const muscles = dictionary("muscles", usedMuscles);
const patternKeys = new Set(patterns.entries.map((e) => e.key));
const muscleKeys = new Set(muscles.entries.map((e) => e.key));

const names = new Set();
const tags = new Map();
for (const [i, e] of exercises.entries()) {
  const at = `exercises.en.json[${i}] (${e?.name ?? "?"})`;
  if (typeof e?.name !== "string" || !clean(e.name) || clean(e.name).length > 200) fail(`${at}: name must be 1-200 characters`);
  const n = normalize(e.name);
  if (names.has(n)) fail(`${at}: duplicate name`);
  names.add(n);
  if ((e.description ?? "").length > 10000 || (e.instructions ?? "").length > 20000) fail(`${at}: description or instructions too long`);
  if (e.demonstrationUrl != null && !/^https:\/\/\S+$/.test(e.demonstrationUrl)) fail(`${at}: demonstrationUrl must be https:// or null`);
  const primary = e.primaryMuscles ?? [];
  const secondary = e.secondaryMuscles ?? [];
  for (const key of [...primary, ...secondary]) if (!muscleKeys.has(key)) fail(`${at}: unknown muscle "${key}"`);
  for (const key of primary) if (secondary.includes(key)) fail(`${at}: "${key}" is both primary and secondary`);
  for (const key of e.movementPatterns ?? []) if (!patternKeys.has(key)) fail(`${at}: unknown movement pattern "${key}"`);
  for (const tag of e.tags ?? []) {
    const name = clean(tag);
    if (!name || name.length > 80) fail(`${at}: tag "${tag}" must be 1-80 characters`);
    tags.set(normalize(name), name);
  }
}

// ---------------------------------------------------------------------------------------------
// SQL

const lines = [];
const push = (...items) => lines.push(...items);
push(
  "-- Generated by infra/catalog/build-catalog-seed.mjs. Do not edit; change the JSON and regenerate.",
  `-- ${patterns.entries.length} movement patterns, ${muscles.entries.length} muscles${muscles.entries[0]?.generated ? " (labels generated from keys)" : ""}, ${tags.size} tags, ${exercises.length} exercises.`,
  "BEGIN;",
  "SET LOCAL search_path TO exercise_catalog;",
  "",
);

function upsertDictionary(table, dict) {
  // BodyParts3D owns a separate additive namespace; the exercise seed must not retire those entries.
  const externalEntries = table === "muscles" ? " AND key NOT LIKE 'anatomy-fma%'" : "";
  push(`-- ${table}`);
  push(`INSERT INTO ${table} AS t (key, label_en, label_pl, is_active, version) VALUES`);
  push(dict.entries.map((e) => `  (${sql(e.key)}, ${sql(e.en)}, ${sql(e.pl ?? e.en)}, true, 1)`).join(",\n"));
  const pl = dict.hasPolish ? "EXCLUDED.label_pl" : "t.label_pl";
  push(
    `ON CONFLICT (key) DO UPDATE SET label_en = EXCLUDED.label_en, label_pl = ${pl}, is_active = true, version = t.version + 1`,
    `  WHERE t.label_en IS DISTINCT FROM EXCLUDED.label_en OR t.label_pl IS DISTINCT FROM ${pl} OR NOT t.is_active;`,
    // Entries no longer in the list stay (exercises may reference them) but are hidden from pickers.
    `UPDATE ${table} SET is_active = false, version = version + 1 WHERE is_active${externalEntries} AND key NOT IN (${dict.entries.map((e) => sql(e.key)).join(", ")});`,
    "",
  );
}
upsertDictionary("movement_patterns", patterns);
upsertDictionary("muscles", muscles);

push("-- tags (an existing tag with the same normalized name is reused)");
push("INSERT INTO tags (id, name, normalized_name, merged_into_id) VALUES");
push([...tags].map(([n, name]) => `  (${sql(uuidv5(`tag:${n}`))}, ${sql(name)}, ${sql(n)}, NULL)`).join(",\n"));
push("ON CONFLICT (normalized_name) DO NOTHING;", "");

push(
  "-- exercises: catalog rows are updated in place; a coach's own exercise with the same name is left alone",
  "INSERT INTO exercises AS e (id, author_id, name, normalized_name, description, instructions, demonstration_url, version, is_archived, created_at, updated_at) VALUES",
);
push(
  exercises
    .map((x) => {
      const n = normalize(x.name);
      return `  (${sql(uuidv5(`exercise:${n}`))}, ${sql(CATALOG_AUTHOR)}, ${sql(clean(x.name))}, ${sql(n)}, ${sql(x.description ?? "")}, ${sql(x.instructions ?? "")}, ${sql(x.demonstrationUrl ?? null)}, 1, false, now(), now())`;
    })
    .join(",\n"),
);
push(
  "ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, instructions = EXCLUDED.instructions,",
  "  demonstration_url = EXCLUDED.demonstration_url, is_archived = false, version = e.version + 1, updated_at = now()",
  `  WHERE e.author_id = ${sql(CATALOG_AUTHOR)} AND (e.name, e.description, e.instructions, e.demonstration_url, e.is_archived) IS DISTINCT FROM`,
  "    (EXCLUDED.name, EXCLUDED.description, EXCLUDED.instructions, EXCLUDED.demonstration_url, false);",
  "",
  "-- history: one revision per catalog exercise version",
  "INSERT INTO exercise_revisions (exercise_id, version, description, instructions, is_archived, created_at, changed_by)",
  `SELECT id, version, description, instructions, is_archived, now(), ${sql(CATALOG_AUTHOR)} FROM exercises WHERE author_id = ${sql(CATALOG_AUTHOR)}`,
  "ON CONFLICT DO NOTHING;",
  "",
);

const seeded = `SELECT id, normalized_name FROM exercises WHERE author_id = ${sql(CATALOG_AUTHOR)} AND normalized_name IN (${[...names].map(sql).join(", ")})`;
push(
  "-- taxonomy links are rewritten for catalog exercises on every run",
  `CREATE TEMP TABLE seeded ON COMMIT DROP AS ${seeded};`,
  "DELETE FROM exercise_muscles WHERE exercise_id IN (SELECT id FROM seeded);",
  "DELETE FROM exercise_movement_patterns WHERE exercise_id IN (SELECT id FROM seeded);",
  "DELETE FROM exercise_tags WHERE exercise_id IN (SELECT id FROM seeded);",
  "",
  "INSERT INTO exercise_muscles (exercise_id, muscle_key, is_primary)",
  "SELECT s.id, v.muscle_key, v.is_primary FROM (VALUES",
);
push(
  exercises
    .flatMap((x) => [
      ...(x.primaryMuscles ?? []).map((k) => `  (${sql(normalize(x.name))}, ${sql(k)}, true)`),
      ...(x.secondaryMuscles ?? []).map((k) => `  (${sql(normalize(x.name))}, ${sql(k)}, false)`),
    ])
    .join(",\n"),
);
push(") AS v(normalized_name, muscle_key, is_primary) JOIN seeded s USING (normalized_name);", "");
push("INSERT INTO exercise_movement_patterns (exercise_id, pattern_key)", "SELECT s.id, v.pattern_key FROM (VALUES");
push(exercises.flatMap((x) => (x.movementPatterns ?? []).map((k) => `  (${sql(normalize(x.name))}, ${sql(k)})`)).join(",\n"));
push(") AS v(normalized_name, pattern_key) JOIN seeded s USING (normalized_name);", "");
push("INSERT INTO exercise_tags (exercise_id, tag_id)", "SELECT DISTINCT s.id, COALESCE(t.merged_into_id, t.id) FROM (VALUES");
push(exercises.flatMap((x) => (x.tags ?? []).map((tag) => `  (${sql(normalize(x.name))}, ${sql(normalize(tag))})`)).join(",\n"));
push(
  ") AS v(normalized_name, tag) JOIN seeded s USING (normalized_name) JOIN tags t ON t.normalized_name = v.tag",
  "ON CONFLICT DO NOTHING;",
  "",
  "COMMIT;",
  "",
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"), "utf8");
console.log(
  `catalog seed: ${out}\n  ${patterns.entries.length} movement patterns, ${muscles.entries.length} muscles${muscles.entries[0]?.generated ? " (labels generated from keys: add muscles.en.json)" : ""}, ${tags.size} tags, ${exercises.length} exercises`,
);
