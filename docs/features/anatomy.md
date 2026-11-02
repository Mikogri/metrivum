# Anatomy Explorer

`/app/exercises` uses the existing authenticated `exercises.browse` capability and account-scoped exercise dictionaries. Coach/client menus and mobile web More expose the route. English and Polish controls use the current app locale; catalogue labels are unchanged. New anatomical records retain their official English labels as the Polish fallback until reviewed translations exist.

`apps/web/app/modules/anatomy` owns selection, visibility and the lazy Three.js viewer. `model.ts` builds explicit muscle-key ↔ FMA/representation/FJ indexes from versioned import output, never runtime name guesses. Picking prefers the most specific catalogue entry over overlapping group entries. The URL muscle filter drives both the exercise results and mesh highlights. Unmapped dictionary entries stay selectable with an explanation. Non-muscle structures remain selectable and hideable without being inserted into the muscle catalogue.

The viewer downloads only selected visibility categories, initially muscles; loaded layers stay in memory during that visit. Camera updates do not rerender React. GLB files retain independent nodes and all source triangles. Z-up millimetres are rotated at display time. Selection changes colour without bypassing depth testing or render order. Covering opaque anatomy hides selected structures; picking always resolves the closest visible surface. The explicit transparency/isolation controls can expose deeper structures. Source skin and every other structure remain available. Superficial/deep layers are not asserted: the archive does not supply a reliable classification. Tendons and ligaments have independent visibility switches. A reviewed display classification includes the calcaneal tendon (`FMA51061`) in tendons, despite the archived ISA tree placing it under skeletal ligament; the original source hierarchy remains intact. Classification uses official FMA ancestry, including neural-tree organs/segments and ligament components; Other preserves the remaining unclassified structures rather than guessing their anatomy.

## Permanent display exclusion

The web viewer excludes penile structures (stable FJ IDs in `display-policy.ts`) from rendering and picking regardless of layers, selection, isolation or reset. A fixed source-coordinate fragment mask covers the external genital region only in the full-body skin and pubic-hair meshes (`FJ2810`, `FJ2815`); ray picking applies the identical surface-specific rule. Muscles, tendons, ligaments and other neighbouring structures are not regionally clipped. This is a display-only exclusion. Original archives, GLBs, identifiers, hierarchy and catalogue data remain intact. The original geometry is retained for source verification but is intentionally not fully displayed by the application. This explicit product choice supersedes the original requirement to show every anatomical structure.

## Reproduce the assets

```powershell
python infra/anatomy/prepare.py
python infra/anatomy/verify_assets.py
python -m unittest discover -s infra/anatomy -p test_*.py
```

Original archives and metadata remain unchanged under `.local/bodyparts3d-4.0/source`. `source-lock.json` pins their SHA-256 hashes; upstream changes fail preparation. The ISA and PART-OF variants are combined by stable FJ identity only after comparing geometry, avoiding duplicate meshes while retaining both hierarchies/provenance. OBJ structures without anatomical names/IDs remain in the model with their FJ identifier.

Generated GLBs and `manifest.json` live in `apps/web/public/anatomy/bodyparts3d-4.0`. The GLBs are generated deployment assets, ignored by Git. Run preparation before the web build and deploy that complete directory at `/anatomy/bodyparts3d-4.0/`. Serve hashed GLBs with long-lived immutable caching; revalidate `manifest.json`. The static host must serve `.glb` as `model/gltf-binary`, not the SPA fallback. A missing asset produces an error, never a replacement body. No third-party runtime/CDN is needed. Full dataset is approximately 175 MiB; the initial muscle layer is approximately 56 MiB. No extra mesh compression, decimation or content removal is performed.

`npm run build` prepares anatomy automatically through the web `prebuild` hook (Python 3 required) unless `PAGES_ASSET_ORIGIN` selects separately published assets. In that deployment mode, the application build makes no BodyParts3D requests; explicit `anatomy:prepare` still generates and verifies new asset releases. Downloads require HTTP 200, matching Content-Length when supplied, and the pinned SHA-256 before entering the source cache. Failed downloads retry at most three times; a persistent mismatch still fails the build and reports the actual hash and size. Existing corrupt cache entries fail explicitly and must be removed before retrying. For a fresh development checkout, run `npm run anatomy:prepare --workspace @metrivum/web` before opening Exercises. Frontend CI caches the hash-pinned original downloads and checks generated geometry after the build.

## Catalogue import

`catalog-baseline.json` records the pre-import dictionary and exercise-link count/hash from the confirmed development project. `aliases.json` contains reviewed spelling/group expansions. Official ISA muscle-organ, muscle-zone and muscle-head ancestry restricts eligible concepts; bilateral names are collapsed to a non-lateral concept. Anatomical classes and ambiguous composites are reported, not inserted. Existing IDs, labels, versions, inactive states and links are never updated.

`mappings.json` is the reviewable, versioned mapping source; the public manifest carries the same records plus all geometry and hierarchy metadata. `import-report.json` lists matched, missing and unresolved concepts and every proposed addition. FMA IDs are also retained in new stable `anatomy-fma…` catalogue keys. New runtime dictionary entries not covered by the manifest appear without a 3D mapping.

Migration `20261018160000_ImportBodyParts3DMuscles` contains the generated `muscles.sql` insert-only import. Every insert uses `ON CONFLICT (key) DO NOTHING`; reimport preserves local modifications. Down deliberately retains imported catalogue records because they can acquire exercise relationships. No new endpoint, request requirement or exercise relationship is introduced. Apply with the existing explicit migration command only to a verified development target. Never apply at API startup.

The ordinary exercise catalogue seed excludes the separately owned `anatomy-fma…` namespace from retirement, so rerunning that seed cannot deactivate anatomical additions.

## Verified integration (2026-10-18)

The additive EF migration was applied to the previously confirmed development Metrivum project `atclvdkpbccafakzpwls`, using its existing `trainflow_migrator` role and original EF history record. No schema changes or broader grants were needed. Before/after comparison preserved all 80 existing records exactly and all 2173 exercise-muscle links (including their ordered digest). 59 existing entries map to geometry; 21 remain unmapped. 99 new named muscles were inserted, giving 179 catalogue entries. The report lists 68 ambiguous/class/composite candidates excluded from automatic insertion; these are distinct from the 21 unmapped existing entries.

The model contains 2234 independently selectable structures and 6,681,030 original triangles: 395 muscle structures, 204 skeletal structures, 104 nervous structures, 7 tendon structures, 20 ligament structures, 3 skin structures, 914 vascular structures, 189 internal-organ structures and 398 other structures. All generated positions/normals/indices were compared against both official archives. Category counts describe rendered FJ structures, not numbers of distinct human muscles.

Validation includes real PostgreSQL catalogue/idempotency tests, selection/navigation unit tests, import/conversion checks, static hosting checks, and desktop/mobile-web Chromium tests using the actual GLBs (all nine categories on desktop). The production application bundle builds with lazy 3D code; build verification skipped copying unrelated multi-GB public installer payloads. Browser tests use explicit account/API fixtures, while catalogue preservation was also checked on the live development database. Native-device GPU performance and production CDN delivery have not been measured.

For a new dataset release, review changed hashes and aliases, regenerate all outputs, and create a new additive migration rather than rewriting an applied migration. Exercise visualizations can reuse the viewer with muscle keys supplied by the existing exercise contract; that feature is not implemented here.

See [data attribution](../licenses/bodyparts3d.md) for the separate CC BY data license and original archive notice discrepancy.

The Exercises library embeds the viewer beside its results (above them on smaller screens). Model selection and the muscle combobox share the URL `muscle` filter and reset pagination, preserving other filters. The existing API filters primary and secondary muscle links. Clicking the selected muscle clears it. Non-muscle structures remain inspectable without changing the exercise filter. Muscles without linked exercises show the standard empty results state. The former `/app/anatomy` route redirects to Exercises; there is no separate navigation tab.

Every shared 3D viewer includes an Anatomy Data & Licenses shortcut, including previews and training heatmaps. All three views show the original BodyParts3D muscles by default. The skeleton remains an optional layer in the explorer. Reset visibility restores muscles only. No supplementary head model is loaded.
