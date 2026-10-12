import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { DictionariesDto } from "@trainflow/api-client-web";

const features = JSON.parse(readFileSync(new URL("../../../contracts/generated/features.json", import.meta.url), "utf8")) as { key: string }[];
const userId = "00000000-0000-4000-8000-000000000000";
const programId = "12000000-0000-4000-8000-000000000001";
const exerciseId = "0e78cee8-0685-531f-8a54-5313fd6ef631";
const dictionaries: DictionariesDto = {
  muscles: [{ key: "rectus-abdominis", labelEn: "Rectus abdominis", labelPl: "Mięsień prosty brzucha", isActive: true, version: 1 }],
  movementPatterns: [],
};
const guid = (n: number) => `23000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const document = { schemaVersion: 1, blocks: [{ id: guid(1), name: "Generated baseline", description: "", cycles: [{ id: guid(2), name: "Cycle 1", description: "", dayCount: 10,
  days: [{ id: guid(3), dayNumber: 1, workouts: [{ id: guid(4), name: "Session 1", description: "Warm up before training.", groups: [], exercises: [{ id: guid(5), exerciseId, comment: "Repetitions per side", sets: [{ id: guid(6), kind: "Standard", prescription: { reps: { minimum: 8, maximum: 10 }, rir: 3, rest: { value: 90, unit: "Seconds" } } }] }] }] }] }] }] };

test("generator previews constraints, locks choices, saves explicitly and opens the normal builder", async ({ page }, testInfo) => {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript(({ id }) => {
    localStorage.setItem("tf.auth.slot.0", JSON.stringify({ access_token: "mock-0", refresh_token: "mock-refresh-0", expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, email: "generator@trainflow.test", aud: "authenticated" } }));
    localStorage.setItem("tf.auth.active-slot", "0");
  }, { id: userId });
  await page.route("**/shared/dev/mockApi.ts*", route => route.fulfill({ contentType: "text/javascript", body: "export const mockFetch = (input, init) => fetch(input, init);" }));
  const exercise = { id: exerciseId, name: "Dead Bug", catalogVersion: 1, family: "trunk-control", role: "core", muscles: ["rectus-abdominis"], equipmentAnyOf: [{ allOf: [] }], minimumLevel: 0,
    requiredSkills: [], status: "candidate", reviewed: true, prescriptionMode: "reps", setupSeconds: 30, repetitionCounting: "per-side" };
  const input = { mode: "Strength", level: "Beginner", sessionMinutes: 60, cycleDays: 10, daySlots: [1], cycles: 1, seed: 42, equipment: [], skills: [], excludedExercises: [], priorityMuscles: [], preferredFamilies: [], progressRepetitions: false };
  const state = { input, recipeVersion: "fixture-1", metadataVersion: "fixture-1", datasetVersion: "fixture-1", selectionSeed: 42, setsPerExercise: 3, includeAccessory: true, cardioSeconds: 600,
    selections: { "session-1/core": exerciseId }, lockedSlots: [] as string[] };
  const preview = { feasible: true, state, document,
    slots: [{ key: "session-1/core", role: "core", exerciseId, name: "Dead Bug", family: "trunk-control", muscles: ["rectus-abdominis"], equipment: [], locked: false, prescription: "3 × 8–10, RIR 3", repetitionCounting: "per-side" }],
    durations: [{ dayNumber: 1, generalWarmupSeconds: 300, specificWarmupSeconds: 60, workSeconds: 240, restSeconds: 180, setupSeconds: 30, bufferSeconds: 180, totalSeconds: 990 }], issues: [], assumptions: ["Working load remains unfilled."] };
  const plan = { id: programId, name: "Generated program", description: "", kind: "Program", folderId: null, archived: false, version: 1, updatedAt: "2026-10-08T12:00:00Z", document };
  await page.route("http://mock.trainflow.invalid/**", async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const respond = (data: unknown) => route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    if (request.method() === "OPTIONS") return respond(null);
    if (request.method() === "POST") writes.push({ path, body: request.postDataJSON() });
    if (path === "/api/v1/me") return respond({ id: userId, workspaceId: userId, username: "generator_coach", displayName: "Generator Coach", locale: "en", timeZone: "Europe/Warsaw", birthDate: "1990-01-01", onboarded: true, version: 1, roles: ["Coach"], contexts: ["Coach"] });
    if (path === "/api/v1/me/access") return respond({ version: "fixture", features: [...features, { key: "training.generator.use" }].map(x => ({ key: x.key, available: true, reason: "available" })), limits: [] });
    if (path.startsWith("/api/v1/messaging/")) return respond([]);
    if (path === "/api/v1/me/notifications/unread-count") return respond({ count: 0 });
    if (path.endsWith("/generator/options")) return respond({ recipeVersion: "fixture-1", metadataVersion: "fixture-1", datasetVersion: "fixture-1", equipment: ["dumbbells"], skills: [], muscles: ["rectus-abdominis"], families: ["trunk-control"], exercises: [exercise] });
    if (path.endsWith("/generator/preview")) return respond(preview);
    if (path.endsWith("/generator/reshuffle")) return respond({ ...preview, state: request.postDataJSON().state, slots: preview.slots.map(x => ({ ...x, locked: true })) });
    if (path.endsWith("/generator/save-draft") || path === `/api/v1/training/programs/${programId}`) return respond(plan);
    if (path.endsWith("/formulas/built-in")) return respond([]);
    if (path === "/api/v1/exercise-dictionaries") return respond(dictionaries);
    if (path.endsWith("/revisions")) return respond({ items: [], page: 1, pageSize: 25, total: 0 });
    if (path.startsWith("/api/v1/exercises/")) return respond({ ...exercise, description: "", instructions: "", version: 1, primaryMuscleKeys: ["rectus-abdominis"], secondaryMuscleKeys: [], movementPatternKeys: [], tags: [], isArchived: false });
    return respond({ items: [], page: 1, pageSize: 25, total: 0 });
  });
  await page.goto("/app/programs/generate");
  await expect(page.getByRole("heading", { name: "Program generator", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview program" }).click();
  await expect(page.getByRole("heading", { name: "Preview · Strength" })).toBeVisible();
  expect(writes.map(x => x.path)).toEqual(["/api/v1/training/generator/preview"]);
  await page.getByText("Lock exercise", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Lock Dead Bug on day 1" })).toBeChecked();
  await page.getByRole("button", { name: "Reshuffle unlocked exercises" }).click();
  await expect.poll(() => writes.find(x => x.path.endsWith("reshuffle"))?.body).toMatchObject({ state: { lockedSlots: ["session-1/core"] } });
  await page.getByRole("button", { name: "Save draft and open builder" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/programs/${programId}/edit$`));
  await expect(page.getByRole("toolbar").first()).toBeVisible();
  expect(writes.some(x => /assignments|revisions/.test(x.path))).toBe(false);
  expect(writes.find(x => x.path.endsWith("save-draft"))?.body).toMatchObject({ state: { lockedSlots: ["session-1/core"] }, name: "Generated program" });
  await expect(page.locator("#program-name")).toBeEditable();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("program-editor.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("radio", { name: "Simple", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("program-editor-simple.png"), fullPage: true, animations: "disabled" });
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  await expect(exportButton).toBeVisible();
  await exportButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(async () => {
    const bounds = await dialog.boundingBox();
    return bounds != null && bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize()!.width + 1;
  }).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("export-dialog.png"), fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(exportButton).toBeFocused();
});
