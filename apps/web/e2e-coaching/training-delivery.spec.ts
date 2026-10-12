import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const ids = {
  coach: "00000000-0000-4000-8000-000000000071", client: "00000000-0000-4000-8000-000000000072",
  relationship: "20000000-0000-4000-8000-000000000071", program: "30000000-0000-4000-8000-000000000071",
  revision: "30000000-0000-4000-8000-000000000072", assignment: "40000000-0000-4000-8000-000000000071",
  occurrence: "40000000-0000-4000-8000-000000000072", execution: "40000000-0000-4000-8000-000000000073",
  workout: "50000000-0000-4000-8000-000000000071", exercise: "50000000-0000-4000-8000-000000000072",
  instance: "50000000-0000-4000-8000-000000000073", set1: "50000000-0000-4000-8000-000000000074", set2: "50000000-0000-4000-8000-000000000075",
};
const catalog = JSON.parse(readFileSync(new URL("../../../contracts/generated/features.json", import.meta.url), "utf8")) as { key: string }[];
const today = new Date().toISOString().slice(0, 10);
const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 20, total: items.length });
const prescription = {
  revisionId: ids.revision, programName: "Foundation strength", formulas: {},
  exercises: { [ids.exercise]: { id: ids.exercise, name: "Bench press", version: 1, description: "Barbell bench press", instructions: "Controlled repetitions" } },
  workout: { id: ids.workout, name: "Upper body A", description: "Main session", groups: [], exercises: [{ id: ids.instance, exerciseId: ids.exercise, comment: "Prescribed session", sets: [ids.set1, ids.set2].map(id => ({ id, kind: "Standard", segments: [], prescription: { reps: { minimum: 8, maximum: 10 }, load: { minimum: { value: 80, unit: "kg" }, maximum: { value: 80, unit: "kg" } }, rpe: 8, rest: { value: 120, unit: "s" } } })) }] },
};
type ActualSet = { reps: number | null; load: number | null; rpe: number | null; rir: number | null; skipped: boolean; loadUnit: string | null; loadMeaning: string };
type ActualBody = { performedDate: string; comment: string; durationSeconds: number | null; exercises: { prescribedInstanceId: string | null; exerciseId: string; comment: string; sets: ActualSet[] }[] };
type Execution = ActualBody & { startedAt: string; completedAt: string | null; id: string; status: string; version: number; allowedActions: string[] };

async function fixture(page: Page, options: { assigned?: boolean; conflict?: boolean; initialRole?: "Coach" | "Client" } = {}) {
  let actor = options.initialRole ?? "Coach"; let assigned = options.assigned ?? false; let execution: Execution | null = null;
  const reads: string[] = [];
  const writes: { path: string; method: string; actor: string; body: unknown; etag: string | undefined; key: string | undefined }[] = [];
  const assignment = { id: ids.assignment, relationshipId: ids.relationship, programId: ids.program, programName: "Foundation strength", status: "Active", startDate: today, timeZone: "UTC", version: 1, effectiveRevisionId: ids.revision, allowedActions: ["status"], groupAssignmentId: null };
  const occurrence = () => ({ revisionId: ids.revision, blockId: ids.workout, cycleId: ids.workout, performedDate: execution?.performedDate ?? null, durationSeconds: execution?.durationSeconds ?? null, hasComment: !!execution?.comment, id: ids.occurrence, assignmentId: ids.assignment, relationshipId: ids.relationship, programId: ids.program, programName: "Foundation strength", name: "Upper body A", scheduledDate: today, deadline: `${today}T23:59:59Z`, status: execution?.status ?? "Scheduled", executionId: execution?.id ?? null, loggedLate: false, allowedActions: execution ? [] : ["start", "skip"] });
  await page.addInitScript(({ coach, client, initialRole }) => {
    const role = sessionStorage.getItem("training-fixture-role") || initialRole;
    const user = role === "Coach" ? coach : client;
    localStorage.setItem("tf.auth.slot.0", JSON.stringify({ access_token: "mock-0", refresh_token: "mock-refresh-0", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, email: `${role.toLowerCase()}@trainflow.test`, aud: "authenticated" } }));
    localStorage.setItem("tf.auth.active-slot", "0"); localStorage.setItem(`tf.workspace.0:${user}`, role.toLowerCase());
  }, { coach: ids.coach, client: ids.client, initialRole: actor });
  await page.route("**/shared/dev/mockApi.ts*", route => route.fulfill({ contentType: "text/javascript", body: "export const mockFetch = (input, init) => fetch(input, init);" }));
  await page.route("http://mock.trainflow.invalid/**", async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    if (request.method() === "OPTIONS") return respond({});
    if (request.method() === "GET") reads.push(path);
    if (path === "/api/v1/me") return respond({ id: actor === "Coach" ? ids.coach : ids.client, workspaceId: ids.coach, username: actor.toLowerCase(), displayName: `Training ${actor}`, onboarded: true, roles: [actor], contexts: [actor], version: 1, locale: "en", timeZone: "UTC", birthDate: "1990-01-01" });
    if (path === "/api/v1/me/access") return respond({ version: "test", features: catalog.map(f => ({ key: f.key, available: true, reason: "available" })), limits: [] });
    if (path === "/api/v1/me/profile-fields") return respond({ currency: "EUR", values: {}, version: 1 });
    if (path === "/api/v1/messaging/conversations" || path === "/api/v1/messaging/requests") return respond([]);
    if (path === "/api/v1/notifications/unread-count") return respond({ count: 0 });
    const relation = { id: ids.relationship, client: { id: ids.client, displayName: "Training Client", username: "training_client" }, status: "Active", startedAt: new Date().toISOString(), groupIds: [], statusHistory: [], allowedActions: [], version: 1 };
    if (path === `/api/v1/coaching/clients/${ids.relationship}`) return respond(relation);
    if (path === "/api/v1/coaching/clients") return respond(paged([relation]));
    if (path === "/api/v1/training/programs") return respond(paged([{ id: ids.program, name: "Foundation strength" }]));
    if (path === `/api/v1/training/programs/${ids.program}/revisions`) return respond(paged([{ id: ids.revision, number: 1 }]));
    if (path === "/api/v1/training/assignment-summary") return respond(assigned ? [{ assignment, endDate: today, scheduled: 1, completed: execution?.status === "Completed" ? 1 : 0 }] : []);
    if (path === "/api/v1/training/last-activity") return respond({ performedDate: execution?.status === "Completed" ? today : null, completedAt: execution?.completedAt ?? null });
    if (path === "/api/v1/training/activity-options") return respond({ programs: assigned ? [{ id: ids.program, name: "Foundation strength" }] : [], structure: [] });
    if (path.endsWith("/documentation/")) return respond({ relationshipId: ids.relationship, coach: true, allowedActions: ["create"], status: "Active" });
    if (path.endsWith("/measurement-definitions")) return respond([{ key: "weight", units: ["kg", "lb"], label: "Body weight", minimum: 1, maximum: 500 }]);
    if (path.endsWith("/measurements/trend")) return respond({ key: "weight", unit: "kg", points: [], latestValue: null, latestAt: null, change: null, aggregation: "Daily" });
    if (path.endsWith("/summary") && path.includes("/check-ins/")) return respond({ awaitingReview: 0, overdue: 0, submitted: 0, reviewed: 0, latest: null, next: null });
    if (path.endsWith("/billing")) return respond({ dues: paged([]), payments: paged([]), entitlements: [], summary: { lastSettlement: null, overdueByCurrency: [], nextDue: null } });
    if (path === "/api/v1/teams/mine") return respond({ teams: [], invitations: [] });
    if (path === "/api/v1/training/assignments") return respond(paged(assigned ? [assignment] : []));
    if (path === "/api/v1/training/schedule") return respond(paged(assigned ? [occurrence()] : []));
    if (path === `/api/v1/training/workouts/${ids.occurrence}`) return respond({ occurrence: occurrence(), prescription, execution });
    if (path === "/api/v1/training/progress") {
      const complete = execution?.status === "Completed";
      const actual = complete ? execution!.exercises.flatMap(e => e.sets).filter(s => !s.skipped && s.reps != null) : [];
      const reps = actual.reduce((n, s) => n + (s.reps ?? 0), 0);
      const volume = actual.reduce((n, s) => n + (s.load ?? 0) * (s.reps ?? 0), 0);
      return respond({ from: url.searchParams.get("from"), to: url.searchParams.get("to"), planned: assigned ? 1 : 0, due: assigned ? 1 : 0, completed: complete ? 1 : 0, skipped: 0, missed: 0, inProgress: execution?.status === "InProgress" ? 1 : 0, completionPercentage: assigned ? complete ? 100 : 0 : null, loggedLate: 0, activeAssignments: assigned ? 1 : 0, actualSets: actual.length, actualReps: reps, volumeKg: volume, programs: [{ programId: ids.program, programName: "Foundation strength", completed: complete ? 1 : 0 }], clients: [{ relationshipId: ids.relationship, due: 1, completed: complete ? 1 : 0, missed: 0, latestCompletedAt: complete ? new Date().toISOString() : null }], performance: complete ? [{ occurrenceId: ids.occurrence, exerciseId: ids.exercise, name: "Bench press", performedDate: today, loadMeaning: "TotalExternal", sets: actual.length, reps, volumeKg: volume, bestLoadKg: Math.max(...actual.map(s => s.load ?? 0)), averageRpe: actual[0]?.rpe ?? null, averageRir: actual[0]?.rir ?? null, substitutionSets: 0 }] : [], metricDefinition: "Completed occurrences / due occurrences in the selected date window. Actual recorded sets only." });
    }
    if (request.method() !== "GET") {
      const body = request.postData() ? request.postDataJSON() : null;
      writes.push({ path, method: request.method(), actor, body, etag: request.headers()["if-match"], key: request.headers()["idempotency-key"] });
      if (path.endsWith("/assignments/preview")) return respond([{ id: ids.relationship, clientId: ids.client, displayName: "Training Client", username: "training_client" }]);
      if (path === `/api/v1/training/programs/${ids.program}/assignments`) { assigned = true; assignment.startDate = body.startDate; assignment.timeZone = body.timeZone; return respond([assignment]); }
      if (path === `/api/v1/training/workouts/${ids.occurrence}/start`) {
        execution ??= { startedAt: new Date().toISOString(), completedAt: null, id: ids.execution, version: 1, status: "InProgress", performedDate: today, comment: "", durationSeconds: null, exercises: [], allowedActions: ["edit", "complete"] };
        return respond(execution);
      }
      if (path === `/api/v1/training/executions/${ids.execution}`) {
        const input = body as ActualBody;
        if (input.exercises.some(exercise => exercise.sets.some(set => set.load == null && set.loadUnit != null || set.load != null && set.loadUnit == null)))
          return respond({ title: "Load and load unit must be supplied together.", code: "VALIDATION_FAILED", status: 400 }, 400);
        if (options.conflict) return respond({ title: "This execution changed in another tab.", detail: "Copy your changes before reloading the latest execution.", code: "VERSION_CONFLICT", status: 409 }, 409);
        execution = { ...execution!, ...(body as ActualBody), version: execution!.version + 1 }; return respond(execution);
      }
      if (path === `/api/v1/training/executions/${ids.execution}/complete`) { execution = { ...execution!, status: "Completed", completedAt: new Date().toISOString(), version: execution!.version + 1, allowedActions: ["correct"] }; return respond(execution); }
      return respond({});
    }
    return respond(paged([]));
  });
  return {
    writes, reads,
    async asRole(role: "Coach" | "Client", path: string) { actor = role; await page.evaluate(role => sessionStorage.setItem("training-fixture-role", role), role); await page.goto(path, { waitUntil: "domcontentloaded" }); },
  };
}

test("coach assigns a published program, client records blank actuals, coach sees actual progress", async ({ page }) => {
  test.setTimeout(90000);
  const f = await fixture(page);
  await page.goto(`/app/clients/${ids.relationship}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tablist", { name: "Clients sections" })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Client views" }).getByRole("tab")).toHaveText(["Overview", "Activity", "Progress", "Profile", "Documentation", "Check-ins"]);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Assign program" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Program$/ }).click();
  await page.getByRole("option", { name: "Foundation strength", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Training Client" })).toBeChecked();
  const [year, month, day] = today.split("-");
  for (const [segmentName, value] of [["year", year], ["month", month], ["day", day]] as const) {
    const segment = dialog.getByRole("spinbutton", { name: `${segmentName}, Start date`, exact: true });
    await segment.focus();
    await segment.pressSequentially(value!);
    await expect(segment).toHaveAttribute("aria-valuenow", String(Number(value)));
  }
  await dialog.getByRole("textbox", { name: "Schedule time zone" }).fill("UTC");
  const scheduleReads = () => f.reads.filter(path => path === "/api/v1/training/schedule").length;
  const beforePreview = scheduleReads();
  await dialog.getByRole("button", { name: "Preview recipients" }).click();
  await expect(dialog.getByText(/^1 unique active clients will receive this program/)).toBeVisible();
  expect(scheduleReads()).toBe(beforePreview);
  await dialog.getByRole("button", { name: "Assign program", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Foundation strength", exact: true })).toBeVisible();
  const assignmentWrite = f.writes.find(w => w.path === `/api/v1/training/programs/${ids.program}/assignments`)!;
  expect(assignmentWrite.key).toBeTruthy();
  expect(assignmentWrite.body).toMatchObject({ relationshipIds: [ids.relationship], groupIds: [], revisionId: ids.revision, startDate: today, timeZone: "UTC" });
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  const workout = page.getByRole("button", { name: /Upper body A/ });
  await expect(workout).toBeVisible();
  await page.getByRole("button", { name: /Sort$/ }).click();
  await page.getByRole("option", { name: "Oldest first", exact: true }).click();
  await workout.click();
  await expect(page).toHaveURL(/activity.workout=/);
  await page.getByRole("button", { name: "Back to activity", exact: true }).click();
  await expect(page.getByRole("button", { name: /Sort$/ })).toContainText("Oldest first");
  await f.asRole("Client", "/app/my-training");
  await page.getByRole("link", { name: /^Upper body A/ }).click();
  await expect(page.getByText(/8–10 reps/).first()).toBeVisible();
  await page.getByRole("button", { name: "Start workout", exact: true }).click();
  const reps = page.getByRole("spinbutton", { name: "Bench press set 1 reps", exact: true });
  const load = page.getByRole("spinbutton", { name: "Bench press set 1 load", exact: true });
  await expect(reps).toHaveValue(""); await expect(load).toHaveValue("");
  await expect(page.getByRole("spinbutton", { name: "Bench press set 1 RPE", exact: true })).toHaveValue("");
  await reps.fill("6"); await load.fill("42.5");
  await page.getByRole("spinbutton", { name: "Bench press set 1 RPE", exact: true }).fill("7");
  await page.getByRole("spinbutton", { name: "Bench press set 1 RIR", exact: true }).fill("3");
  await page.getByRole("textbox", { name: "Session comment", exact: true }).fill("Actual session completed with lighter load");
  await page.getByRole("button", { name: "Save and complete workout" }).click();
  await expect(page.getByRole("button", { name: "Save correction", exact: true })).toBeVisible();
  const save = f.writes.find(w => w.method === "PUT" && w.path === `/api/v1/training/executions/${ids.execution}`)!;
  expect(save.actor).toBe("Client"); expect(save.etag).toBe('"1"');
  const actual = save.body as ActualBody;
  expect(actual.comment).toBe("Actual session completed with lighter load");
  expect(actual.exercises[0]?.sets[0]).toMatchObject({ reps: 6, load: 42.5, loadUnit: "kg", loadMeaning: "TotalExternal", rpe: 7, rir: 3 });
  expect(actual.exercises[0]?.sets[1]).toMatchObject({ reps: null, load: null, loadUnit: null, rpe: null, rir: null });
  expect(f.writes.find(w => w.path.endsWith("/complete"))?.etag).toBe('"2"');
  expect(f.writes.filter(w => w.path.includes("/programs/") && !w.path.includes("/assignments"))).toHaveLength(0);
  await f.asRole("Coach", `/app/clients/${ids.relationship}`);
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training progress", exact: true })).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  const performance = page.locator("section").filter({ has: page.getByRole("heading", { name: "Bench press", exact: true }) }).last();
  await performance.locator("summary").click();
  await expect(performance.getByRole("cell", { name: "1 / 6", exact: true })).toBeVisible();
  await expect(performance.getByRole("cell", { name: "42.5", exact: true })).toBeVisible();
  await expect(performance.getByRole("cell", { name: "255", exact: true })).toBeVisible();
  await expect(performance.getByRole("cell", { name: "7 / 3", exact: true })).toBeVisible();
});

test("execution conflict preserves typed actual values and offers an explicit reload", async ({ page }) => {
  const f = await fixture(page, { assigned: true, conflict: true, initialRole: "Client" });
  await page.goto(`/app/my-training/workouts/${ids.occurrence}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start workout", exact: true }).click();
  const reps = page.getByRole("spinbutton", { name: "Bench press set 1 reps", exact: true });
  await expect(reps).toHaveValue(""); await reps.fill("7");
  await page.getByRole("spinbutton", { name: "Bench press set 1 load", exact: true }).fill("45");
  await page.getByRole("textbox", { name: "Session comment", exact: true }).fill("Keep my unsaved draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("main").getByText("Copy your changes before reloading the latest execution.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Notifications", exact: true }).getByText("Copy your changes before reloading the latest execution.")).toBeVisible();
  await expect(reps).toHaveValue("7");
  await expect(page.getByRole("textbox", { name: "Session comment", exact: true })).toHaveValue("Keep my unsaved draft");
  await page.getByRole("button", { name: "Reload latest version", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Reload the latest version?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(reps).toHaveValue("7");
  expect(f.writes.filter(w => w.method === "PUT" && w.path.includes("/executions/"))).toHaveLength(1);
  expect(f.writes.some(w => w.path.endsWith("/complete"))).toBe(false);
});


test("responsive Plans, History, workout and client details retain native priorities", async ({ page }, testInfo) => {
  const f = await fixture(page, { assigned: true, initialRole: "Client" });
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/app/my-training?tab=plans", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: mobile ? "Plans" : "Training", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assigned programs", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchased plans", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Foundation strength/ })).toBeVisible();
  await fits();
  await page.screenshot({ path: testInfo.outputPath("plans.png"), fullPage: true, animations: "disabled" });
  await page.goto("/app/my-training?tab=history", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: mobile ? "History" : "Training", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Upper body A/ })).toBeVisible();
  await fits();
  await page.screenshot({ path: testInfo.outputPath("history.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("link", { name: /Upper body A/ }).click();
  await page.getByRole("button", { name: "Start workout", exact: true }).click();
  const reps = page.getByRole("spinbutton", { name: "Bench press set 1 reps", exact: true });
  await reps.fill("8");
  await expect(reps).toHaveAttribute("inputmode", "decimal");
  if (mobile) await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await fits();
  await reps.evaluate(element => element.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: testInfo.outputPath("workout.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  if (mobile) await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  expect(f.writes.find(w => w.method === "PUT")?.body).toMatchObject({ exercises: [{ sets: [{ reps: 8 }, {}] }] });
  await f.asRole("Coach", `/app/clients/${ids.relationship}`);
  await expect(page.getByRole("tablist", { name: "Client views" }).getByRole("tab")).toHaveText(["Overview", "Activity", "Progress", "Profile", "Documentation", "Check-ins"]);
  await expect(page.getByRole("heading", { name: "Assigned programs", exact: true })).toBeVisible();
  await fits();
  await page.screenshot({ path: testInfo.outputPath("client-overview.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("button", { name: /Upper body A/ })).toBeVisible();
  await fits();
  await page.screenshot({ path: testInfo.outputPath("client-activity.png"), fullPage: true, animations: "disabled" });
});
