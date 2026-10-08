import type {
  AnalysisDto,
  AnalysisResult,
  DictionariesDto,
  ExerciseDto,
  FolderDto,
  FormulaDto,
  MediaDto,
  PlanDto,
  ProfileResponse,
  RevisionListItem,
  TrainingDocument,
} from "@trainflow/api-client-web";
import { featureDefinitions } from "@trainflow/api-client-web";
import { mockCoaching } from "./mockCoaching";

// Developer mock data. Clearly fake, used only with VITE_DEV_MOCKS=1 in `npm run dev`.
const now = () => new Date().toISOString();
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const uid = () => crypto.randomUUID();

const EX = {
  squat: "11111111-0000-4000-8000-000000000001",
  rdl: "11111111-0000-4000-8000-000000000002",
  split: "11111111-0000-4000-8000-000000000003",
  bench: "11111111-0000-4000-8000-000000000004",
  row: "11111111-0000-4000-8000-000000000005",
  hip: "11111111-0000-4000-8000-000000000006",
  nordic: "11111111-0000-4000-8000-000000000007",
  plank: "11111111-0000-4000-8000-000000000008",
};

function exercise(id: string, name: string, description: string, primary: string[], patterns: string[], days: number, extra: Partial<ExerciseDto> = {}): ExerciseDto {
  return {
    id,
    name,
    description,
    instructions: "Brace, control the eccentric and keep the bar path over mid-foot.",
    demonstrationUrl: null,
    version: 1,
    isArchived: false,
    isFavorite: false,
    isAuthor: false,
    createdAt: ago(days),
    updatedAt: ago(days),
    tags: [],
    primaryMuscleKeys: primary,
    secondaryMuscleKeys: [],
    movementPatternKeys: patterns,
    ...extra,
  };
}

const db = {
  profile: {
    id: "00000000-0000-4000-8000-000000000000",
    workspaceId: "00000000-0000-4000-8000-0000000000aa",
    username: "demo_coach",
    displayName: "Demo Coach",
    birthDate: "1990-01-01",
    locale: "en",
    timeZone: "Europe/Warsaw",
    onboarded: true,
    roles: ["Coach"],
    contexts: ["Coach"],
    phone: null,
    phoneVisibleToCoach: false,
    version: 2,
  } as ProfileResponse,
  dictionaries: {
    muscles: [
      { key: "quadriceps", labelEn: "Quadriceps", labelPl: "Czworogłowe", isActive: true, version: 1 },
      { key: "hamstrings", labelEn: "Hamstrings", labelPl: "Dwugłowe", isActive: true, version: 1 },
      { key: "gluteus-maximus", labelEn: "Gluteus maximus", labelPl: "Gluteus maximus", isActive: true, version: 1 },
      { key: "pectoralis-major", labelEn: "Pectoralis major", labelPl: "Pectoralis major", isActive: true, version: 1 },
      { key: "latissimus-dorsi", labelEn: "Latissimus dorsi", labelPl: "Latissimus dorsi", isActive: true, version: 1 },
    ],
    movementPatterns: [
      { key: "squat", labelEn: "Squat", labelPl: "Przysiad", isActive: true, version: 1 },
      { key: "hinge", labelEn: "Hip hinge", labelPl: "Zgięcie w biodrach", isActive: true, version: 1 },
      { key: "hip-extension", labelEn: "Hip extension", labelPl: "Hip extension", isActive: true, version: 1 },
      { key: "horizontal-push", labelEn: "Horizontal press", labelPl: "Wypychanie poziome", isActive: true, version: 1 },
      { key: "horizontal-pull", labelEn: "Horizontal pull", labelPl: "Przyciąganie poziome", isActive: true, version: 1 },
    ],
  } as DictionariesDto,
  tags: [
    { id: "22222222-0000-4000-8000-000000000001", name: "Barbell" },
    { id: "22222222-0000-4000-8000-000000000002", name: "Unilateral" },
  ],
  exercises: [] as ExerciseDto[],
  folders: [] as FolderDto[],
  plans: [] as PlanDto[],
  revisions: new Map<string, RevisionListItem[]>(),
  formulas: [] as FormulaDto[],
  media: [] as MediaDto[],
  analyses: [] as AnalysisDto[],
};

db.exercises = [
  exercise(EX.squat, "Back squat", "High-bar back squat to full depth.", ["quadriceps", "gluteus-maximus"], ["squat"], 40, { tags: [db.tags[0]!], isFavorite: true }),
  exercise(EX.rdl, "Romanian deadlift", "Hip hinge with soft knees.", ["hamstrings", "gluteus-maximus"], ["hinge"], 32, { tags: [db.tags[0]!] }),
  exercise(EX.split, "Bulgarian split squat", "Rear-foot elevated split squat.", ["quadriceps"], ["squat"], 20, { tags: [db.tags[1]!] }),
  exercise(EX.bench, "Bench press", "Competition-grip bench press with pause.", ["pectoralis-major"], ["horizontal-push"], 18, { tags: [db.tags[0]!] }),
  exercise(EX.row, "Chest-supported row", "Row to lower ribs.", ["latissimus-dorsi"], ["horizontal-pull"], 12),
  exercise(EX.hip, "Single-leg hip thrust", "", ["gluteus-maximus"], ["hip-extension"], 9, { tags: [db.tags[1]!], isAuthor: true }),
  exercise(EX.nordic, "Nordic curl", "Eccentric hamstring curl.", ["hamstrings"], ["hinge"], 4, { isFavorite: true }),
  exercise(EX.plank, "Copenhagen plank", "Adductor plank.", [], [], 2, { isArchived: true }),
];

const offSeason = { id: "33333333-0000-4000-8000-000000000001", name: "Off-season", parentId: null, position: 0, version: 1 };
db.folders = [
  offSeason,
  { id: "33333333-0000-4000-8000-000000000002", name: "Hypertrophy", parentId: offSeason.id, position: 0, version: 1 },
  { id: "33333333-0000-4000-8000-000000000003", name: "In-season", parentId: null, position: 1, version: 1 },
];

function set(kind: TrainingDocument["blocks"][number]["cycles"][number]["days"][number]["workouts"][number]["exercises"][number]["sets"][number]["kind"], prescription: object, extra: object = {}) {
  return { id: uid(), kind, prescription, ...extra };
}

function demoDocument(): TrainingDocument {
  const top = set("TopSet", { reps: { minimum: 3, maximum: 3 }, loadPercent: 85, baseValue: { value: 140, unit: "Kg" }, rpe: 8, rest: { value: 4, unit: "Minutes" } });
  const squatId = uid();
  const rdlId = uid();
  return {
    schemaVersion: 1,
    blocks: [
      {
        id: uid(),
        name: "Accumulation",
        description: "",
        cycles: [
          {
            id: uid(),
            name: "Cycle 1",
            description: "",
            dayCount: 10,
            days: [
              {
                id: uid(),
                dayNumber: 1,
                workouts: [
                  {
                    id: uid(),
                    name: "Lower body",
                    description: "",
                    groups: [],
                    exercises: [
                      {
                        id: squatId,
                        exerciseId: EX.squat,
                        comment: "",
                        sets: [
                          top,
                          set("BackOff", { reps: { minimum: 5, maximum: 5 }, load: { minimum: { value: 110, unit: "Kg" }, maximum: { value: 110, unit: "Kg" } }, rpe: 7, rest: { value: 3, unit: "Minutes" } }, { sourceSetId: top.id }),
                          set("BackOff", { reps: { minimum: 5, maximum: 5 }, load: { minimum: { value: 110, unit: "Kg" }, maximum: { value: 110, unit: "Kg" } }, rpe: 7.5, rest: { value: 3, unit: "Minutes" } }, { sourceSetId: top.id }),
                        ],
                      },
                      {
                        id: rdlId,
                        exerciseId: EX.rdl,
                        comment: "Pause below the knee.",
                        sets: [
                          set(
                            "Ramp",
                            { reps: { minimum: 8, maximum: 10 }, rir: 2, rest: { value: 2, unit: "Minutes" }, tempo: "3-1-X-0" },
                            {
                              segments: [
                                { id: uid(), prescription: { reps: { minimum: 8, maximum: 8 }, load: { minimum: { value: 60, unit: "Kg" }, maximum: { value: 60, unit: "Kg" } } } },
                                { id: uid(), prescription: { reps: { minimum: 8, maximum: 8 }, load: { minimum: { value: 70, unit: "Kg" }, maximum: { value: 70, unit: "Kg" } } } },
                                { id: uid(), prescription: { reps: { minimum: 8, maximum: 8 }, load: { minimum: { value: 80, unit: "Kg" }, maximum: { value: 80, unit: "Kg" } } } },
                              ],
                            },
                          ),
                        ],
                      },
                      {
                        id: uid(),
                        exerciseId: EX.split,
                        comment: "",
                        sets: [
                          set("Standard", { reps: { minimum: 10, maximum: 10 }, load: { minimum: { value: 24, unit: "Kg" }, maximum: { value: 24, unit: "Kg" } }, rir: 3, rest: { value: 90, unit: "Seconds" } }),
                          set("Standard", { reps: { minimum: 10, maximum: 10 }, load: { minimum: { value: 24, unit: "Kg" }, maximum: { value: 24, unit: "Kg" } }, rir: 2, rest: { value: 90, unit: "Seconds" } }),
                        ],
                      },
                    ],
                  },
                ],
              },
              { id: uid(), dayNumber: 3, workouts: [{ id: uid(), name: "Upper body", description: "", groups: [], exercises: [{ id: uid(), exerciseId: EX.bench, comment: "", sets: [set("Standard", { reps: { minimum: 5, maximum: 5 }, load: { minimum: { value: 90, unit: "Kg" }, maximum: { value: 92.5, unit: "Kg" } }, rpe: 8 })] }] }] },
            ],
          },
        ],
      },
    ],
  };
}

db.plans = [
  { id: "44444444-0000-4000-8000-000000000001", name: "Strength block A", description: "10-day cycles, top set + back-offs.", kind: "Program", folderId: offSeason.id, archived: false, version: 7, updatedAt: ago(0.1), document: demoDocument() },
  { id: "44444444-0000-4000-8000-000000000002", name: "Hypertrophy 4-day", description: "", kind: "Program", folderId: db.folders[1]!.id, archived: false, version: 3, updatedAt: ago(3), document: { schemaVersion: 1, blocks: [] } },
  { id: "44444444-0000-4000-8000-000000000003", name: "Strength 10-day template", description: "Starting point for strength blocks.", kind: "Template", folderId: null, archived: false, version: 2, updatedAt: ago(9), document: demoDocument() },
];
db.revisions.set(db.plans[0]!.id, [
  { id: uid(), number: 2, draftVersion: 6, publishedAt: ago(1) },
  { id: uid(), number: 1, draftVersion: 3, publishedAt: ago(6) },
]);

const BUILT_INS = [
  { key: "percentage-1rm", version: 1, definition: { expression: "base1Rm * percentage", inputs: { base1Rm: "Kg", percentage: "Scalar" }, outputUnit: "Kg" } },
  { key: "previous-cycle-increment", version: 1, definition: { expression: "previous + increment", inputs: { previous: "Kg", increment: "Kg" }, outputUnit: "Kg" } },
  { key: "top-set-back-off", version: 1, definition: { expression: "topSet * (1 - drop / 100)", inputs: { topSet: "Kg", drop: "Percent" }, outputUnit: "Kg" } },
];
db.formulas = [{ id: "55555555-0000-4000-8000-000000000001", name: "Wave loading", version: 2, archived: false, definition: { expression: "base * (0.7 + wave * 0.05)", inputs: { base: "Kg", wave: "Scalar" }, outputUnit: "Kg" } }];

db.media = [
  { id: "66666666-0000-4000-8000-000000000001", name: "squat-top-set.mp4", contentType: "video/mp4", size: 48_211_002, state: "Ready", pinned: true, createdAt: ago(2), version: 2 },
  { id: "66666666-0000-4000-8000-000000000002", name: "rdl-ramp.webm", contentType: "video/webm", size: 22_004_881, state: "Ready", pinned: false, createdAt: ago(1), version: 1 },
];
db.analyses = [
  { id: "77777777-0000-4000-8000-000000000001", name: "Squat top set — week 3", note: "Mock analysis result (developer data).", tags: ["squat", "top set"], mediaId: db.media[0]!.id, configuration: { movement: "squat", metersPerPixel: null }, status: "Completed", createdAt: ago(2), completedAt: ago(2), failureCode: null, attempts: 1, version: 3 },
  { id: "77777777-0000-4000-8000-000000000002", name: "RDL ramp", note: null, tags: ["hinge"], mediaId: db.media[1]!.id, configuration: { movement: "unspecified", metersPerPixel: null }, status: "Failed", createdAt: ago(1), completedAt: ago(1), failureCode: "ANALYZER_NOT_CONFIGURED", attempts: 1, version: 2 },
];

function demoResult(): AnalysisResult {
  const trajectory = [];
  const reps = [];
  for (let r = 0; r < 3; r++) {
    const start = 1 + r * 3.2;
    reps.push({ number: r + 1, startSeconds: start, endSeconds: start + 2.8, phases: [{ kind: "Eccentric", startSeconds: start, endSeconds: start + 1.5 }, { kind: "Concentric", startSeconds: start + 1.5, endSeconds: start + 2.8 }] });
  }
  for (let i = 0; i <= 400; i++) {
    const t = i * 0.027;
    const phase = ((t - 1) % 3.2) / 2.8;
    const inRep = t >= 1 && phase >= 0 && phase <= 1;
    const depth = inRep ? Math.sin(Math.PI * phase) : 0;
    trajectory.push({ seconds: t, x: 320 + Math.sin(phase * Math.PI * 2) * 6 * depth, y: 180 + depth * 210, velocity: null, quality: 0.85 + Math.random() * 0.1, occluded: false });
  }
  return { schemaVersion: 1, engineVersion: "mock-0.0", modelVersion: "developer-data", method: "mock", positionUnit: "px", metersPerPixel: null, repetitions: reps, trajectory, warnings: ["Developer mock data — not a real measurement."] };
}

// -----------------------------------------------------------------------------------------------

function json(status: number, body: unknown, etag?: number) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json", ...(etag !== undefined ? { ETag: `"${etag}"` } : {}) },
  });
}
const problem = (status: number, code: string, detail?: string) => json(status, { status, title: code, code, detail: detail ?? code, traceId: "mock-trace" });
const page = <T,>(items: T[], params: URLSearchParams, size = 25) => {
  const p = Number(params.get("page") ?? params.get("Page") ?? 1);
  const s = Number(params.get("pageSize") ?? params.get("PageSize") ?? size);
  return { items: items.slice((p - 1) * s, p * s), total: items.length, page: p, pageSize: s };
};
const listItem = (plan: PlanDto) => ({ id: plan.id, name: plan.name, description: plan.description, kind: plan.kind, folderId: plan.folderId, archived: plan.archived, version: plan.version, updatedAt: plan.updatedAt });
const ifMatch = (init: RequestInit) => Number(String(new Headers(init.headers).get("If-Match") ?? "").replace(/"/g, ""));

export async function mockFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, 180 + Math.random() * 220));
  const url = new URL(String(input));
  const method = (init.method ?? "GET").toUpperCase();
  const path = url.pathname;
  const q = url.searchParams;
  const body = typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : undefined;
  let m: RegExpMatchArray | null;

  if (path === "/api/v1/me" && method === "GET") return json(200, db.profile, db.profile.version);
  if (path === "/api/v1/me" && method === "PATCH") {
    if (ifMatch(init) !== db.profile.version) return problem(412, "VERSION_CONFLICT");
    db.profile = { ...db.profile, ...body, version: db.profile.version + 1 };
    return json(200, db.profile, db.profile.version);
  }
  if (path === "/api/v1/me/access") {
    return json(200, {
      version: "mock",
      features: featureDefinitions.map((f) => ({ key: f.key, available: true, reason: "available" })),
      limits: [
        { key: "training.documents", maximum: 1000, used: db.plans.length },
        { key: "training.folders", maximum: 1000, used: db.folders.length },
        { key: "training.formulas", maximum: 500, used: db.formulas.length },
        { key: "media.maxVideoBytes", maximum: 268_435_456, used: 0 },
        { key: "analysis.concurrent", maximum: 2, used: 0 },
        { key: "coaching.active-clients", maximum: 30, used: 23 },
      ],
    });
  }
  if (path === "/api/v1/exercise-dictionaries") return json(200, db.dictionaries);
  if (path === "/api/v1/exercise-tags" && method === "GET") return json(200, db.tags);
  if (path === "/api/v1/exercise-tags" && method === "POST") {
    const tag = { id: uid(), name: body.name };
    db.tags.push(tag);
    return json(200, tag);
  }
  if (path === "/api/v1/exercises" && method === "GET") {
    let items = db.exercises.filter((e) => !e.isArchived);
    const search = q.get("Search")?.toLowerCase();
    // Like the API: the name or any worked muscle (label or key) matches.
    if (search) {
      const key = search.replace(/ /g, "-");
      const muscleHit = (k: string) => k.includes(key) || db.dictionaries.muscles.some((m) => m.key === k && (m.labelEn.toLowerCase().includes(search) || m.labelPl.toLowerCase().includes(search)));
      items = items.filter((e) => e.name.toLowerCase().includes(search) || [...e.primaryMuscleKeys, ...e.secondaryMuscleKeys].some(muscleHit));
    }
    if (q.get("TagId")) items = items.filter((e) => e.tags.some((t) => t.id === q.get("TagId")));
    if (q.get("MuscleKey")) items = items.filter((e) => e.primaryMuscleKeys.includes(q.get("MuscleKey")!) || e.secondaryMuscleKeys.includes(q.get("MuscleKey")!));
    if (q.get("MovementPatternKey")) items = items.filter((e) => e.movementPatternKeys.includes(q.get("MovementPatternKey")!));
    if (q.get("FavoritesOnly") === "true") items = items.filter((e) => e.isFavorite);
    const sort = q.get("Sort") ?? "name";
    items = [...items].sort((a, b) => (sort.includes("createdAt") ? a.createdAt.localeCompare(b.createdAt) : a.name.localeCompare(b.name)) * (sort.startsWith("-") ? -1 : 1));
    return json(200, page(items.map((e) => ({ id: e.id, name: e.name, description: e.description, version: e.version, isFavorite: e.isFavorite, createdAt: e.createdAt, primaryMuscleKeys: e.primaryMuscleKeys })), q));
  }
  if (path === "/api/v1/exercises" && method === "POST") {
    if (db.exercises.some((e) => e.name.toLowerCase() === String(body.name).toLowerCase())) return problem(409, "EXERCISE_NAME_EXISTS");
    const created = exercise(uid(), body.name, body.description ?? "", body.primaryMuscleKeys ?? [], body.movementPatternKeys ?? [], 0, { isAuthor: true, instructions: body.instructions ?? "", tags: db.tags.filter((t) => body.tagIds?.includes(t.id)) });
    db.exercises.push(created);
    return json(201, created);
  }
  if ((m = path.match(/^\/api\/v1\/exercises\/([^/]+)$/))) {
    const found = db.exercises.find((e) => e.id === m![1]);
    if (!found) return problem(404, "RESOURCE_NOT_FOUND");
    if (method === "PATCH") {
      Object.assign(found, { description: body.description, instructions: body.instructions, version: found.version + 1, updatedAt: now() });
    }
    return json(200, found);
  }
  if ((m = path.match(/^\/api\/v1\/exercises\/([^/]+)\/history$/))) {
    const found = db.exercises.find((e) => e.id === m![1]);
    return json(200, found ? [{ version: found.version, description: found.description, instructions: found.instructions, isArchived: found.isArchived, createdAt: found.updatedAt }] : []);
  }
  if ((m = path.match(/^\/api\/v1\/exercises\/([^/]+)\/favorite$/))) {
    const found = db.exercises.find((e) => e.id === m![1]);
    if (found) found.isFavorite = method === "PUT";
    return new Response(null, { status: 204 });
  }
  if ((m = path.match(/^\/api\/v1\/exercises\/([^/]+)\/archive$/))) {
    const found = db.exercises.find((e) => e.id === m![1]);
    if (found) found.isArchived = true;
    return new Response(null, { status: 204 });
  }

  // Training
  if (path === "/api/v1/training/programs" && method === "GET") {
    let items = db.plans.filter((p) => p.kind === (q.get("kind") ?? "Program") && p.archived === (q.get("archived") === "true"));
    if (q.get("folderId")) items = items.filter((p) => p.folderId === q.get("folderId"));
    else if (q.get("rootOnly") === "true") items = items.filter((p) => !p.folderId);
    const search = q.get("search")?.toLowerCase();
    if (search) items = items.filter((p) => p.name.toLowerCase().includes(search));
    items = [...items].sort((a, b) => (q.get("sort") === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));
    return json(200, page(items.map(listItem), q));
  }
  if (path === "/api/v1/training/programs" && method === "POST") {
    const plan: PlanDto = { id: uid(), name: body.name, description: body.description, kind: body.kind, folderId: body.folderId, archived: false, version: 1, updatedAt: now(), document: body.document };
    db.plans.push(plan);
    return json(200, plan, plan.version);
  }
  if ((m = path.match(/^\/api\/v1\/training\/programs\/([^/]+)$/))) {
    const plan = db.plans.find((p) => p.id === m![1]);
    return plan ? json(200, plan, plan.version) : problem(404, "RESOURCE_NOT_FOUND");
  }
  if ((m = path.match(/^\/api\/v1\/training\/programs\/([^/]+)\/draft$/))) {
    const plan = db.plans.find((p) => p.id === m![1]);
    if (!plan) return problem(404, "RESOURCE_NOT_FOUND");
    if (ifMatch(init) !== plan.version) return problem(412, "VERSION_CONFLICT", "Resource changed; reload and retry.");
    Object.assign(plan, { name: body.name, description: body.description, folderId: body.folderId, document: body.document, version: plan.version + 1, updatedAt: now() });
    return json(200, plan, plan.version);
  }
  if ((m = path.match(/^\/api\/v1\/training\/programs\/([^/]+)\/copy$/))) {
    const source = db.plans.find((p) => p.id === m![1]);
    if (!source) return problem(404, "RESOURCE_NOT_FOUND");
    const plan: PlanDto = { ...structuredClone(source), id: uid(), name: body.name, kind: body.kind, folderId: body.folderId, version: 1, updatedAt: now() };
    db.plans.push(plan);
    return json(200, plan, 1);
  }
  if ((m = path.match(/^\/api\/v1\/training\/programs\/([^/]+)\/archive$/))) {
    const plan = db.plans.find((p) => p.id === m![1]);
    if (!plan) return problem(404, "RESOURCE_NOT_FOUND");
    Object.assign(plan, { archived: body.archived, version: plan.version + 1 });
    return json(200, plan, plan.version);
  }
  if ((m = path.match(/^\/api\/v1\/training\/programs\/([^/]+)\/revisions$/))) {
    const list = db.revisions.get(m[1]!) ?? [];
    if (method === "POST") {
      const plan = db.plans.find((p) => p.id === m![1])!;
      const revision = { id: uid(), number: (list[0]?.number ?? 0) + 1, draftVersion: plan.version, publishedAt: now() };
      db.revisions.set(m[1]!, [revision, ...list]);
      return json(200, { ...revision, snapshot: { schemaVersion: 1, name: plan.name, description: plan.description, kind: plan.kind, document: plan.document, exercises: {}, formulas: {} } });
    }
    return json(200, page(list, q));
  }
  if ((m = path.match(/^\/api\/v1\/training\/programs\/([^/]+)\/revisions\/(\d+)$/))) {
    const plan = db.plans.find((p) => p.id === m![1])!;
    return json(200, { id: uid(), number: Number(m[2]), draftVersion: plan.version, publishedAt: now(), snapshot: { schemaVersion: 1, name: plan.name, description: plan.description, kind: plan.kind, document: plan.document, exercises: {}, formulas: {} } });
  }
  if (path.match(/\/revisions\/\d+\/export$/)) {
    return new Response(`Developer mock export (${q.get("format")}) — not a real TrainFlow file.`, { status: 200, headers: { "content-type": "text/plain" } });
  }
  if (path === "/api/v1/training/folders" && method === "GET") {
    const parent = q.get("parentId");
    return json(200, page(db.folders.filter((f) => f.parentId === (parent || null)), q, 100));
  }
  if (path === "/api/v1/training/folders" && method === "POST") {
    const folder = { id: uid(), name: body.name, parentId: body.parentId, position: body.position, version: 1 };
    db.folders.push(folder);
    return json(200, folder, 1);
  }
  if ((m = path.match(/^\/api\/v1\/training\/folders\/([^/]+)$/))) {
    const folder = db.folders.find((f) => f.id === m![1]);
    if (!folder) return problem(404, "RESOURCE_NOT_FOUND");
    if (method === "DELETE") {
      if (db.folders.some((f) => f.parentId === folder.id) || db.plans.some((p) => p.folderId === folder.id)) return problem(409, "CONFLICT");
      db.folders = db.folders.filter((f) => f.id !== folder.id);
      return new Response(null, { status: 204 });
    }
    Object.assign(folder, { name: body.name, parentId: body.parentId, position: body.position, version: folder.version + 1 });
    return json(200, folder, folder.version);
  }
  if (path === "/api/v1/training/formulas/built-in") return json(200, BUILT_INS);
  if (path === "/api/v1/training/formulas" && method === "GET") return json(200, page(db.formulas.map((f) => ({ id: f.id, name: f.name, version: f.version, archived: f.archived })), q));
  if (path === "/api/v1/training/formulas" && method === "POST") {
    const formula = { id: uid(), name: body.name, version: 1, archived: false, definition: body.definition };
    db.formulas.push(formula);
    return json(200, formula, 1);
  }
  if (path === "/api/v1/training/formulas/evaluate") {
    const inputs = body.inputs as Record<string, { value: number; unit: string }>;
    const values = Object.values(inputs).map((i) => i.value);
    const result = body.builtIn === "percentage-1rm" ? (values[0] ?? 0) * (values[1] ?? 0) : values.reduce((a, b) => a + b, 0);
    return json(200, { expression: "mock", version: body.version, inputs, result: { value: Math.round(result * 100) / 100, unit: "Kg" } });
  }
  if ((m = path.match(/^\/api\/v1\/training\/formulas\/([^/]+)$/))) {
    const formula = db.formulas.find((f) => f.id === m![1]);
    if (!formula) return problem(404, "RESOURCE_NOT_FOUND");
    if (method === "PUT") Object.assign(formula, { name: body.name, definition: body.definition, version: formula.version + 1 });
    return json(200, formula, formula.version);
  }
  if (path.startsWith("/api/v1/training/imports")) return problem(503, "INTEGRATION_UNAVAILABLE", "CSV import is not simulated in developer mock mode.");

  // Media & analysis
  if (path === "/api/v1/media" && method === "GET") return json(200, db.media.filter((x) => !q.get("state") || x.state === q.get("state")));
  if (path === "/api/v1/media/uploads") return problem(503, "INTEGRATION_UNAVAILABLE", "Uploads are not simulated in developer mock mode.");
  if (path === "/api/v1/analyses" && method === "GET") {
    let items = db.analyses;
    if (q.get("status")) items = items.filter((a) => a.status === q.get("status"));
    return json(200, items);
  }
  if (path === "/api/v1/analyses" && method === "POST") return problem(503, "ANALYZER_NOT_CONFIGURED");
  if ((m = path.match(/^\/api\/v1\/analyses\/([^/]+)$/))) {
    const analysis = db.analyses.find((a) => a.id === m![1]);
    return analysis ? json(200, analysis, analysis.version) : problem(404, "RESOURCE_NOT_FOUND");
  }
  if (path.match(/^\/api\/v1\/analyses\/[^/]+\/result$/)) return json(200, demoResult());
  if (path === "/api/v1/analyses/compare") return json(200, { left: demoResult(), right: demoResult() });
  if (path.match(/^\/api\/v1\/media\/[^/]+\/read-url$/)) return problem(503, "INTEGRATION_UNAVAILABLE", "Playback is not simulated in developer mock mode.");

  const coaching = mockCoaching(path, method, q, body, new Headers(init.headers).get("Authorization"));
  if (coaching) return json(coaching.status, coaching.body);
  return problem(404, "RESOURCE_NOT_FOUND", `Mock has no handler for ${method} ${path}`);
}
