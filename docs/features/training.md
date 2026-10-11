# Training v1

Private programs and templates share one document engine. The authenticated owner and personal workspace determine ownership; requests contain neither owner nor workspace. Administrative permissions do not bypass these checks. Metadata and folder relationships are relational in the private `training` schema; draft contents, immutable snapshots, typed formula definitions and validated import sessions use JSONB with explicit schema version 1. The API does not use PostgREST.

## Routes and editing

All routes below are under `/api/v1/training` and require a completed account. Creation, templates, folders and formula libraries are coach-only; clients can read, edit, apply and export their own purchased programs. DTOs are included in generated OpenAPI.

| Route | Purpose |
| --- | --- |
| `GET/POST /programs` | List or create a program/template (`kind: Program/Template`) |
| `GET /programs/{id}` | Read metadata and draft, including ETag |
| `PUT /programs/{id}/draft` | Save metadata, folder and full typed document |
| `POST /programs/{id}/copy` | Independent copy; target kind can turn a template into a program |
| `PUT /programs/{id}/archive` | Archive/restore with `{ "archived": true/false }` |
| `POST /programs/{id}/apply` | Apply the saved draft and atomically update eligible assignments |
| `POST /programs/{id}/revisions` | Compatible alias for Apply changes |
| `GET /programs/{id}/revisions[/{number}]` | List revision metadata or read a snapshot |
| `GET/POST /folders` | List immediate children or create a folder |
| `PUT/DELETE /folders/{id}` | Move, rename, reorder or delete an empty folder |
| `GET/POST /formulas` | List/create owned custom rules |
| `GET/PUT /formulas/{id}` | Read specified/latest version or append a new version |
| `POST /formulas/{id}/copy` | Duplicate a rule with a new name and identity |
| `GET /formulas/built-in` | Get versioned built-in definitions |
| `POST /formulas/evaluate` | Evaluate a typed binding |

Draft, folder, formula and import updates require a single strong `If-Match: "1"` ETag. Missing preconditions return 428; stale versions return `VERSION_CONFLICT` (412). Publishing additionally requires `Idempotency-Key` (1–128 non-control characters). Publication does not change the draft ETag. Retrying the same operation and payload returns the original revision; changed payload with a reused key is a conflict. Published revisions and formula versions are immutable both in EF and with database triggers.

Lists use server-side paging, `page` (default 1), `pageSize` (default 25, maximum 100) and ID as a stable tiebreaker. Programs allow `search`, `kind`, `folderId`, `archived` and `sort=updated|created|name`. Formula lists allow `search`; folder lists take `parentId` and order by `position, id`. Position is a nonnegative sibling ordering value; equal values are resolved by ID. Folder updates check the full bounded tree inside a workspace advisory transaction lock. Removing a folder with nested folders or any documents (including archives) fails; its contents must be moved explicitly.

Programs/templates are archived rather than physically deleted. Archives and formula versions continue to count against storage-related technical quotas. Copying regenerates block/cycle/day/workout/instance/group/set/segment IDs and remaps internal references; catalog exercise IDs and pinned formula versions remain references. It does not share mutable content with its source.

## Document format

```json
{
  "schemaVersion": 1,
  "blocks": [{
    "id": "7c937876-9884-46f1-8247-387e62313dc1", "name": "Strength", "description": "",
    "cycles": [{
      "id": "cd4c0fe0-5c42-47bc-b71a-dd4b7415d007", "name": "Cycle 1", "description": "", "dayCount": 9,
      "days": [{
        "id": "71242194-6a73-4a27-a117-396c768a0811", "dayNumber": 2,
        "workouts": [{
          "id": "a889d8e2-1209-4829-b328-f6e7d2c107f9", "name": "Lower body", "description": "",
          "exercises": [{
            "id": "dfce920e-52de-40f7-8a1e-2841781c8dbb", "exerciseId": "22222222-2222-2222-2222-222222222222", "comment": "",
            "sets": [{
              "id": "1a963810-3870-474c-9750-2d3737d30055", "kind": "Standard",
              "prescription": {
                "reps": { "minimum": 5, "maximum": 5 },
                "load": { "minimum": { "value": 80, "unit": "Kg" }, "maximum": { "value": 85, "unit": "Kg" } },
                "rest": { "value": 2, "unit": "Minutes" }, "tempo": "3-1-X-0", "rpe": 8
              }
            }]
          }], "groups": []
        }]
      }]
    }]
  }]
}
```

Replace the example `exerciseId` with an actual catalog ID. All internal IDs are nonempty and unique across the document. Empty containers are valid drafts. Days are unique within a cycle, between 1 and its positive `dayCount`; cycles need not contain seven days. A day may carry an optional `note` (at most 2000 characters); the editor stores a rest day as a day with a note and no workouts.

Prescriptions support integer repetition exact/ranges, mass exact/ranges, `loadPercent` plus `baseValue`, `rpe` (0–10) or `rir` (0–100), `workTime`, `rest`, `distance`, `tempo` and `comment`. Exact values use identical range endpoints. Mass units: `Kg`, `Lb`; time: `Seconds`, `Minutes`; distance: `Meters`, `Kilometers`; formula scalars: `Scalar`, `Percent`. Ranges are compared after unit conversion. Absolute load, percentage load and load formula are mutually exclusive. RPE and RIR are mutually exclusive. Tempo is four dash-separated numbers (0–99) or `X`, such as `3-1-X-0`.

Set `kind` is `Standard`, `Amrap`, `Ramp`, `TopSet`, `BackOff`, `DropSet`, `RestPause` or `Cluster`. `Amrap` cannot also fix a repetition range. Ramp, dropset, rest-pause and cluster have 2–20 typed `segments: [{id,prescription}]`; other kinds cannot have segments. Segments cannot recursively contain more sets. `BackOff.sourceSetId` must refer to an earlier `TopSet` in the same exercise instance. Other set kinds cannot use that reference.

Workout `groups: [{id,kind,exerciseIds,rounds,restSeconds}]` describe `Superset` (exactly two exercises) or `Circuit` (at least two). Groups reference exercise instance IDs in the same workout, cannot overlap, and cannot contain other groups. Group rounds range 1–100. They are distinct from the segments of a single exercise set.

Publication snapshots exercise names, descriptions, instructions and catalog versions, plus formula expression/version, typed inputs and evaluated output. Later catalog or formula changes do not change old revision reads or exports.

## Feature and quota enforcement

Training owns `training.programs.read/create/manage`, `training.folders.manage`, `training.templates.manage`, `training.sets.advanced`, `training.formulas.custom`, `training.import.csv`, `training.export.csv` and `training.export.pdf`. All mutation paths, including whole JSON saves, copy and CSV commit, enforce the same content gates. Existing content remains readable after advanced/custom access is revoked. Retaining unchanged advanced constructs is allowed; creating, changing or rebinding them requires access. Removing them is permitted. Saving/editing custom rule definitions requires custom-formula access.

Workspace-scoped PostgreSQL transaction advisory locks serialize folder-tree changes and authoritative quota checks with writes across API instances. ETags still detect stale edits. `/me/access` obtains current document/folder/formula usage from this module. Defaults are technical safeguards, not commercial plans:

| `Training` option | Default |
| --- | ---: |
| `MaximumDocuments` | 1000, programs and templates combined |
| `MaximumFolders` / `MaximumFolderDepth` | 1000 / 16 |
| `MaximumFormulaRules` / `MaximumRevisionsPerDocument` | 500 / 1000 |
| `Document.MaximumBytes` / `Document.MaximumNodes` | 1 MiB / 10,000 |
| `Document.MaximumCycleDays` / `Document.MaximumSegments` | 366 / 20 |
| `MaximumImportBytes` / `MaximumImportRows` | 2 MiB / 5000 |
| `MaximumActiveImports` / `ImportLifetimeMinutes` | 10 / 30 |
| `Formula.MaximumLength` / `Formula.MaximumDepth` | 2048 / 32 |
| `Formula.MaximumOperations` / `Formula.MaximumGraphNodes` | 512 / 64 |

Settings are validated at startup. No automatic database migrations run at API startup. RLS is explicitly disabled on these private backend-owned tables; isolation is enforced by schema/role restrictions and API ownership checks, not by per-user database claims.

## Applied changes and purchased ownership

Autosave changes only the private draft. **Apply changes** creates an immutable revision and updates active/paused authorized assignments in the same transaction. Today's unstarted workouts and future unstarted workouts are regenerated; past workouts and every execution keep their original revision and results. Workspace and assignment locks serialize applying, assigning and starting workouts. Reapplying an unchanged draft does not create another revision.

Training-plan offers use `Purpose: TrainingPlan` and `BillingModel: OneTime`. Accepting an application requires `trainingPlanRevisionId`; it freezes delivery terms without creating a coaching relationship, service or assignment. Pending purchase summaries expose no document. `GET /training/purchases` lists the buyer's paginated receipts; `GET /me/plan-purchases/{orderId}/due` and `/by-application/{applicationId}/due` expose authorized payment status.

Successful simulated, external or zero-price settlement creates one buyer-owned plan and initial revision in the same transaction as the receipt. Payment retries cannot deliver twice. Failed payment leaves content locked. The copy belongs to the buyer's actual personal workspace; seller edits and relationship changes do not affect it. Seller-owned formulas become frozen quantities, without copying private formula expressions or granting source-library access. Purchase provenance and completed delivery are immutable in PostgreSQL. Team seller reads/settlement require current administrative Team access, synchronized with membership changes.

The client **Training plans** screen combines assignments and purchased copies. The existing `/programs/{id}` ownership checks protect draft, revision and export routes for both coaches and buyers. Historical `publishedAt` fields and revision endpoints retain their names for API compatibility.