import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.setTimeout(60_000);

const coach = "00000000-0000-4000-8000-000000000081";
const planId = "30000000-0000-4000-8000-000000000081";
const cycleId = "30000000-0000-4000-8000-000000000082";
const relationship = "20000000-0000-4000-8000-000000000081";
const features = JSON.parse(readFileSync(new URL("../../../contracts/generated/features.json", import.meta.url), "utf8")) as { key: string }[];
const pageOf = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 30 });

async function fixture(page: Page, preview = false, locale: "en" | "pl" = "en") {
  const exercise = { id: "50000000-0000-4000-8000-000000000081", name: "Bench press", version: 1, description: "", instructions: "" };
  let plan = {
    id: planId, name: "Interaction test", updatedAt: "2026-01-01T00:00:00Z", description: "", kind: "Program", folderId: null, archived: false, version: 1,
    document: { schemaVersion: 1, blocks: [{ id: "30000000-0000-4000-8000-000000000083", name: "Block", description: "", cycles: [{ id: cycleId, name: "Cycle", description: "", dayCount: 7,
      days: [{ id: "30000000-0000-4000-8000-000000000084", dayNumber: 1, workouts: [{ id: "30000000-0000-4000-8000-000000000085", name: "Workout A", description: "", groups: [], exercises: [{ id: "30000000-0000-4000-8000-000000000086", exerciseId: exercise.id, comment: "", sets: [{ id: "30000000-0000-4000-8000-000000000087", kind: "Standard", prescription: { load: { minimum: { value: 70, unit: "Kg" }, maximum: { value: 70, unit: "Kg" } } } }] }] }] }] }] }] },
  };
  await page.addInitScript(({ coach, locale }) => {
    localStorage.setItem("tf.locale", locale);
    localStorage.setItem("tf.auth.slot.0", JSON.stringify({ access_token: "mock-0", refresh_token: "mock-refresh-0", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: coach, email: "sheet@trainflow.test", email_confirmed_at: "2026-01-01T00:00:00Z", aud: "authenticated" } }));
    localStorage.setItem("tf.auth.active-slot", "0");
    localStorage.setItem(`tf.workspace.0:${coach}`, "coach");
    localStorage.setItem("tf.editor.mode", "advanced");
  }, { coach, locale });
  await page.route("**/shared/dev/mockApi.ts*", route => route.fulfill({ contentType: "text/javascript", body: "export const mockFetch = (input, init) => fetch(input, init);" }));
  await page.route("http://mock.trainflow.invalid/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const respond = (json: unknown) => route.fulfill({ json, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    if (route.request().method() === "OPTIONS") return respond({});
    if (path === "/api/v1/me") return respond({ id: coach, workspaceId: coach, username: "sheet_coach", displayName: "Sheet Coach", onboarded: true, roles: ["Coach"], contexts: ["Coach"], version: 1, locale, timeZone: "UTC" });
    if (path === "/api/v1/me/access") return respond({ version: "test", features: features.map(item => ({ key: item.key, available: true, reason: "available" })), limits: [] });
    if (path === "/api/v1/me/profile-fields") return respond({ values: {}, currency: "USD", version: 1 });
    if (path === "/api/v1/subscriptions/plans") return respond([]);
    if (path === "/api/v1/notifications/unread-count") return respond({ count: 0 });
    if (path === "/api/v1/messaging/conversations" || path === "/api/v1/messaging/requests") return respond([]);
    if (path === "/api/v1/teams/mine") return respond({ teams: [], invitations: [] });
    if (path === "/api/v1/coaching/clients") return respond(pageOf([{ id: relationship, client: { displayName: "Sheet Client", username: "sheet_client" }, status: "Active" }]));
    if (path.endsWith(`/clients/${relationship}/variables`)) return respond({ variables: { maxBench1r: { value: 100, unit: "Kg" } }, sourceVersions: { maxBench1r: "1" }, exerciseMaxes: [] });
    if (path === `/api/v1/training/programs/${planId}/revisions`) return respond(pageOf([]));
    if (path === `/api/v1/training/programs/${planId}`) return respond(plan);
    if (path.endsWith("/draft") && route.request().method() === "PUT") { plan = { ...plan, ...route.request().postDataJSON(), version: plan.version + 1 }; return respond(plan); }
    if (path === "/api/v1/training/formulas/built-in") return respond([{ key: "percentage-1rm", version: 1, definition: { expression: "base1Rm * percentage", inputs: { base1Rm: "Kg", percentage: "Scalar" }, outputUnit: "Kg" } }]);
    if (path === "/api/v1/training/formulas/evaluate" && route.request().postDataJSON().expression === "80 * (") return route.fulfill({ status: 400, json: { type: "about:blank", title: "Invalid formula", status: 400, code: "VALIDATION_FAILED", detail: "Unexpected expression" } });
    if (path === "/api/v1/training/formulas/evaluate") return respond({ expression: route.request().postDataJSON().expression ?? "base1Rm * percentage", version: 1, inputs: {}, result: { value: route.request().postDataJSON().expression === "oneRepMax_kg" ? route.request().postDataJSON().inputs?.oneRepMax_kg?.value ?? 80 : 80, unit: route.request().postDataJSON().outputUnit ?? "Kg" } });
    if (path === `/api/v1/exercises/${exercise.id}`) return respond(exercise);
    if (path === "/api/v1/exercises") return respond(pageOf([exercise]));
    return respond(pageOf([]));
  });
  await page.goto(`/app/programs/${planId}${preview ? "" : "/edit"}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-node][data-kind="cycle"]')).toBeVisible({ timeout: 15_000 });
  await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
}

test("context menu consumes the dismissal gesture without capturing the card behind it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Desktop pointer capture regression");
  await fixture(page);
  const card = page.locator('[data-node][data-kind="cycle"]');
  const initial = await card.boundingBox();
  expect(initial).not.toBeNull();
  await card.click({ button: "right", position: { x: 25, y: 20 } });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const bounds = (await menu.boundingBox())!;
  await page.mouse.click(bounds.x + 2, bounds.y + 2);
  await expect(menu).toBeVisible();
  // Dismiss onto a different part of the same card, then keep moving with the button held.
  const x = initial!.x + initial!.width - 20;
  const y = initial!.y + initial!.height - 20;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 70, { steps: 5 });
  await page.mouse.up();
  await expect(menu).not.toBeVisible();
  expect((await card.boundingBox())!.x).toBeCloseTo(initial!.x, 0);
  expect((await card.boundingBox())!.y).toBeCloseTo(initial!.y, 0);
  // A separate deliberate gesture must still drag normally.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 70, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await card.boundingBox())!.x).not.toBe(initial!.x);
});

test("load typing stays inside its sheet cell and slash suggestions can be clicked", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Advanced desktop sheet");
  await fixture(page);
  await page.getByRole("combobox", { name: "Client perspective" }).fill("Sheet");
  await page.getByRole("option", { name: /Sheet Client/ }).click();
  await expect(page.getByText("Preview only · not assigned", { exact: false })).toBeVisible();
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const input = cycle.getByRole("combobox", { name: "Load", exact: true });
  await expect(input).toBeVisible();
  await input.click();
  await input.fill("=MIN");
  await page.getByRole("option", { name: "MIN(…)" }).click();
  await expect(input).toHaveValue("=MIN()");
  await input.fill("/oneRep");
  await page.getByRole("option", { name: "oneRepMax_kg", exact: true }).click();
  await expect(input).toHaveValue("=oneRepMax_kg");
  await page.getByRole("button", { name: "Formula data sources" }).click();
  const manual = page.getByRole("spinbutton", { name: "oneRepMax_kg manual value" });
  await expect(manual).toBeVisible();
  await manual.fill("100");
  await input.press("Enter");
  await expect(input).toHaveValue("100");
  await input.click();
  await input.fill("/maxB");
  await page.getByRole("option", { name: "maxBench1r_kg", exact: true }).click();
  await expect(input).toHaveValue("=maxBench1r_kg");
  await input.fill("=maxBench1r * 0.8");

  await input.press("Enter");
  await expect(input).toHaveValue("80");
});


test("opening the formula editor creates one dialog without an exiting duplicate", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "New formula", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.locator('[data-exiting][inert]')).toHaveCount(0);
});

test("cancel discards edits and missing variables can remain linked without trapping the panel", async ({ page }) => {
  await fixture(page);
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const input = cycle.getByRole("combobox", { name: "Load", exact: true });
  await input.click();
  await input.fill("=oneRepMax * .8");
  await page.getByRole("button", { name: "Formula data sources" }).click();
  await page.getByRole("spinbutton", { name: "oneRepMax manual value" }).fill("100");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(input).toHaveValue("70");
  await expect(page.getByRole("spinbutton", { name: "oneRepMax manual value" })).toHaveCount(0);
  await input.click();
  await input.fill("=oneRepMax * .8");
  await expect(page.getByRole("button", { name: "Close variable options" })).toHaveCount(0);
  await page.getByRole("button", { name: "Formula data sources" }).click();
  await page.getByRole("button", { name: "Keep variable", exact: true }).click();
  await expect(input).toHaveValue("=oneRepMax * .8");
  await expect(cycle.getByLabel("Linked variable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close variable options" })).toHaveCount(0);
  await input.click();
  await page.getByRole("button", { name: "Formula data sources" }).click();
  await page.getByRole("button", { name: "Close variable options" }).click();
  await expect(input).toHaveValue("=oneRepMax * .8");
  await expect(page.getByRole("button", { name: "Close variable options" })).toHaveCount(0);
});

test("rounding choices, source inspector, invalid draft and resize hover", async ({ page }) => {
  await fixture(page);
  const resize = page.getByRole("separator", { name: "Resize column A" });
  await resize.hover();
  await expect(resize).toHaveCSS("cursor", "ew-resize");
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const input = cycle.getByRole("combobox", { name: "Load", exact: true });
  await input.click();
  await input.fill("=ROUND");
  await expect(page.getByRole("option", { name: "ROUND↓(…)" })).toBeVisible();
  await expect(page.getByRole("option", { name: "ROUND↑(…)" })).toBeVisible();
  await expect(page.getByRole("option", { name: "ROUND_TO_STEP(…)" })).toHaveCount(0);
  await input.fill("=80 / 2");
  await input.press("Enter");
  await expect(input).toHaveValue("80");
  await input.click();
  await expect(page.getByText(/Data source/)).toHaveCount(0);
  await page.getByRole("button", { name: "Formula data sources" }).click();
  await expect(page.getByText(/Data source/)).toHaveText(/Entered expression/);
  await input.fill("=80 * (");
  await expect(input.locator("xpath=ancestor::*[@data-inline-load]")).toHaveAttribute("data-invalid", "true");
  await input.press("Control+s");
  await expect(input).toHaveValue("=80 * (");
  await expect(page.locator('[role="status"][data-status="saved"]')).toBeVisible();
  await expect(page.locator('[role="status"][data-status="saved"]')).toHaveText(/Draft saved.*invalid format/);
  await page.locator('[role="status"][data-status="saved"]').hover();
  await expect(page.getByRole("tooltip")).toContainText(/Cycle.*Load.*Unexpected expression/s);
});

test("maxes cells start disconnected, connect by cable, resize with columns and retain variables", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "Add maxes table", exact: true }).click();
  const table = page.locator('[data-node][data-kind="maxes"]');
  await expect(table).toBeVisible();
  await expect(page.locator('[data-maxes-connection]')).toHaveCount(0);
  await expect(table).toHaveCSS("height", "98px");
  await expect(table.getByRole("combobox", { name: "Max load 1", exact: true })).toHaveCount(0);
  await table.getByRole("button", { name: "Exercise", exact: true }).click();
  await expect(table.getByRole("combobox", { name: "Max load 1", exact: true })).toHaveCount(0);
  await table.getByRole("combobox", { name: "Exercise", exact: true }).press("Escape");
  await expect(table.getByRole("combobox", { name: "Max load 1", exact: true })).toHaveCount(0);
  await table.getByRole("button", { name: "Exercise", exact: true }).click();
  await page.getByRole("option", { name: /Bench press/ }).click();
  await table.getByRole("combobox", { name: "Max load 1", exact: true }).click();
  await table.getByRole("combobox", { name: "Max load 1", exact: true }).fill("150 kg");
  await table.getByRole("combobox", { name: "Max load 1", exact: true }).press("Enter");
  const handle = await table.locator('[title="Connect to block"]').boundingBox();
  const block = await page.locator('[data-block-id]').boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(block!.x + 20, block!.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-maxes-connection]')).toHaveCount(1);
  await expect(table).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(table).not.toHaveCSS("border-top-left-radius", "0px");
  const cable = page.locator('[data-maxes-connection]');
  await expect(cable.locator("rect")).toHaveAttribute("rx", "2");
  expect(await cable.locator("path").count()).toBeGreaterThanOrEqual(3);
  const before = await table.boundingBox();
  const resize = await page.getByRole("separator", { name: "Resize column B" }).boundingBox();
  await page.mouse.move(resize!.x + resize!.width / 2, resize!.y + 10);
  await page.mouse.down(); await page.mouse.move(resize!.x + 40, resize!.y + 10, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await table.boundingBox())!.width).toBeGreaterThan(before!.width);
  const column = (index: number) => page.locator(`[data-sheet-column="${index}"]`);
  const reps = table.getByRole("gridcell", { name: /Max reps 1/ });
  await expect.poll(async () => Math.abs((await reps.boundingBox())!.x - (await column(3).boundingBox())!.x)).toBeLessThan(1);
  await column(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Reset column width", exact: true }).click();
  await expect(page.getByRole("separator", { name: "Resize column B" })).toHaveAttribute("aria-valuenow", "104");
  await expect.poll(async () => (await table.boundingBox())!.width).toBeCloseTo(before!.width, 0);
  await expect.poll(async () => Math.abs((await reps.boundingBox())!.x - (await column(3).boundingBox())!.x)).toBeLessThan(1);
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const input = cycle.getByRole("combobox", { name: "Load", exact: true });
  await input.click(); await input.fill("/oneRep");
  await page.getByRole("option", { name: "oneRepMax_kg", exact: true }).click();
  await page.getByRole("button", { name: "Formula data sources" }).click();
  await expect(page.getByRole("button", { name: /oneRepMax_kg source/ })).toHaveText("From block table");
  await input.press("Enter");
  await expect(input).toHaveValue("150");
  await table.getByRole("combobox", { name: "Max load 1", exact: true }).click();
  await table.getByRole("combobox", { name: "Max load 1", exact: true }).fill("");
  await table.getByRole("combobox", { name: "Max load 1", exact: true }).press("Enter");
  await expect(input).toHaveValue("=oneRepMax_kg");
  await expect(table.locator('[data-inline-load][data-invalid="true"]')).toHaveCount(1);
  const maxInput = table.getByRole("combobox", { name: "Max load 1", exact: true });
  await maxInput.click(); await maxInput.fill("/oneRepMax_");
  await page.getByRole("option", { name: "oneRepMax_kg", exact: true }).click();
  await maxInput.press("Enter");
  await expect(maxInput).toHaveValue("=oneRepMax_kg");
  await table.getByRole("button", { name: /Max load 1 unit/ }).click();
  await page.getByRole("option", { name: "lb", exact: true }).click();
  await expect(table.getByRole("button", { name: /Max load 1 unit/ })).toContainText("lb");
  await table.getByRole("button", { name: /Exercise maxes/ }).click();
  await page.getByRole("menuitem", { name: "Disconnect", exact: true }).click();
  await expect(page.locator('[data-maxes-connection]')).toHaveCount(0);
  await expect(table.getByRole("gridcell", { name: /Max reps 1/ })).toHaveText("1");
  await table.getByRole("button", { name: "Collapse table", exact: true }).click();
  await expect(maxInput).not.toBeVisible();
  await expect(table).toHaveAttribute("data-collapsed", "true");
  await expect(table).toHaveCSS("margin-left", "4px");
  await table.getByRole("button", { name: "Expand table", exact: true }).click();
  await expect(maxInput).toBeVisible();
  await expect(maxInput).toHaveValue("=oneRepMax_kg");
  await expect(page.locator('[role="status"][data-status="saved"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("maxes-table.png") });
  await page.evaluate(() => document.querySelectorAll("style").forEach(style => { if (style.textContent?.includes("*, *::before, *::after { animation: none")) style.remove(); }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(table).toHaveCSS("transition-property", /left/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(table).toHaveCSS("transition-property", "none");

});

test("cables switch between horizontal and vertical ports when a block moves around a cycle", async ({ page }) => {
  await fixture(page);
  const block = page.locator('[data-node][data-kind="block"]');
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  const plug = page.locator('[data-edge] [data-plug-side]');
  await expect(plug).toHaveAttribute("data-plug-side", "left");
  const target = (await cycle.boundingBox())!;
  const start = (await block.boundingBox())!;
  const x = start.x + 35; const y = start.y + 15;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + target.x - start.x, y + target.y + target.height + 64 - start.y, { steps: 12 });
  await page.mouse.up();
  await expect(plug).toHaveAttribute("data-plug-side", "bottom");
  const terminalY = await plug.evaluate(node => (node as SVGGraphicsElement).getScreenCTM()!.f);
  expect(terminalY).toBeCloseTo((await cycle.boundingBox())!.y + (await cycle.boundingBox())!.height, 0);
  await page.screenshot({ path: test.info().outputPath("bottom-plug.png") });
  const lower = (await block.boundingBox())!;
  await page.mouse.move(lower.x + 35, lower.y + 15); await page.mouse.down();
  await page.mouse.move(lower.x + 35 + target.x + target.width + 104 - lower.x, lower.y + 15 + target.y - lower.y, { steps: 12 });
  await page.mouse.up();
  await expect(plug).toHaveAttribute("data-plug-side", "right");
});

test("annotation cards are global by default and connection preview snaps to highlighted targets", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  const note = page.locator('[data-annotation-id]');
  await expect(note.getByText("Global · plan", { exact: true })).toBeVisible();
  await expect(note.getByRole("button", { name: "Comment visibility" })).toHaveText("Coach only");
  await note.getByRole("textbox", { name: "Comment text" }).fill("Recover well between sessions");
  await note.getByRole("button", { name: "Comment visibility" }).click();
  await expect(note.getByRole("button", { name: "Comment visibility" })).toHaveText("Coach & client");
  const handle = await note.locator('[title="Connect annotation"]').boundingBox();
  const block = page.locator('[data-block-id]');
  const target = (await block.boundingBox())!;
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2); await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await expect(block).toHaveAttribute("data-link-target", "true");
  await expect(page.locator('[data-link-preview]')).toHaveAttribute("data-target-id", /.+/);
  const terminal = await page.locator('[data-preview-side]').evaluate(node => { const m = (node as SVGGraphicsElement).getScreenCTM()!; return { x: m.e, y: m.f }; });
  expect(terminal.y <= target.y + 1 || terminal.y >= target.y + target.height - 1 || terminal.x <= target.x + 1 || terminal.x >= target.x + target.width - 1).toBeTruthy();
  await page.mouse.up();
  await expect(page.locator('[data-annotation-connection]')).toHaveCount(1);
  await expect(block).not.toHaveAttribute("data-link-target", "true");
  await expect(note.getByText("Block", { exact: true })).toBeVisible();
  await note.getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("menuitem", { name: "Make global" }).click();
  await expect(page.locator('[data-annotation-connection]')).toHaveCount(0);
  await expect(note.getByText("Global · plan", { exact: true })).toBeVisible();
  await note.getByRole("button", { name: "Collapse card", exact: true }).click();
  await expect(note.getByRole("textbox", { name: "Comment text" })).not.toBeVisible();
  await note.getByRole("button", { name: "Expand card", exact: true }).click();
  await expect(note.getByRole("textbox", { name: "Comment text" })).toHaveValue("Recover well between sessions");
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
  await expect(page.locator('[role="status"][data-status="saved"]')).toBeVisible();
});

test("resizing a cycle header follows the cycle and releases its old sheet column", async ({ page }) => {
  await fixture(page);
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const handle = cycle.getByRole("separator", { name: "Resize Load column in element", exact: true });
  const header = cycle.getByRole("columnheader", { name: /Load/ });
  const heading = (await header.boundingBox())!;
  const grip = (await handle.boundingBox())!;
  expect(Math.abs(grip.x + grip.width / 2 - heading.x - heading.width)).toBeLessThan(2);
  const mainHeader = (await page.locator('[data-sheet-column="8"]').boundingBox())!;
  expect(Math.abs(mainHeader.x - heading.x)).toBeLessThan(1);
  expect(Math.abs(mainHeader.width - heading.width)).toBeLessThan(1);
  const load = (await cycle.locator("[data-inline-load]").boundingBox())!;
  expect(Math.abs(load.x - heading.x)).toBeLessThan(2);
  expect(Math.abs(load.width - heading.width)).toBeLessThan(2);
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down(); await page.mouse.move(grip.x + grip.width / 2 + 16, grip.y + grip.height / 2, { steps: 6 }); await page.mouse.up();
  await expect(page.getByRole("separator", { name: "Resize column I", exact: true })).toHaveAttribute("aria-valuenow", "120");
  const name = cycle.locator("[data-rename]");
  await name.scrollIntoViewIfNeeded();
  const before = (await name.boundingBox())!;
  await page.mouse.move(before.x + 12, before.y + 8); await page.mouse.down();
  await page.mouse.move(before.x + 12 + 104, before.y + 8, { steps: 12 }); await page.mouse.up();
  await expect(page.getByRole("separator", { name: "Resize column I", exact: true })).toHaveAttribute("aria-valuenow", "104");
  await expect(page.getByRole("separator", { name: "Resize column J", exact: true })).toHaveAttribute("aria-valuenow", "120");
  await expect(page.locator("[data-width-animating]")).toHaveCount(0);
  await header.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Reset column width", exact: true }).click();
  await expect(page.getByRole("separator", { name: "Resize column J", exact: true })).toHaveAttribute("aria-valuenow", "104");
});


test("empty editing and saved library formulas stay left aligned without a formula marker", async ({ page }) => {
  await fixture(page);
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const input = cycle.getByRole("combobox", { name: "Load", exact: true });
  await input.click(); await input.fill("");
  await expect(input).toHaveCSS("text-align", "left");
  await input.fill("=perc");
  await page.getByRole("option", { name: /1RM/i }).click();
  await page.getByRole("button", { name: "Formula data sources" }).click();
  await page.getByRole("spinbutton", { name: "percentage value" }).fill("80");
  await page.getByRole("button", { name: "Close variable options" }).click();
  await expect(input).toHaveCSS("text-align", "left");
  await expect(cycle.getByLabel("Linked variable", { exact: true })).toHaveCount(0);
});


test("cycle and max-table loads share a left-aligned stretching input and right-edge unit selector", async ({ page }) => {
  await fixture(page);
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  await page.getByRole("button", { name: "Add maxes table", exact: true }).click();
  const table = page.locator('[data-node][data-kind="maxes"]');
  await table.getByRole("button", { name: "Exercise", exact: true }).click();
  await page.getByRole("option", { name: /Bench press/ }).click();
  const max = table.getByRole("combobox", { name: "Max load 1", exact: true });
  await max.fill("100"); await max.press("Enter");
  for (const [owner, input, label] of [[cycle, cycle.getByRole("combobox", { name: "Load", exact: true }), "Load"], [table, max, "Max load 1"]] as const) {
    await expect(input).toHaveCSS("text-align", "left");
    const cell = input.locator('xpath=ancestor::*[@data-inline-load]');
    const box = (await cell.boundingBox())!;
    const value = (await input.boundingBox())!;
    const unit = (await owner.getByRole("button", { name: new RegExp(`${label} unit`) }).boundingBox())!;
    expect(Math.abs(value.x - box.x)).toBeLessThan(2);
    expect(Math.abs(unit.x + unit.width - box.x - box.width)).toBeLessThan(2);
    expect(Math.abs(unit.x - value.x - value.width)).toBeLessThan(4);
    await input.click({ button: "right" });
    await expect(page.getByText("Entered manually", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
});


test("sources use the app select and expand into a side editor without losing inputs", async ({ page }) => {
  await fixture(page);
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const input = cycle.getByRole("combobox", { name: "Load", exact: true });
  await input.fill("=perc");
  await page.getByRole("option", { name: /1RM/i }).click();
  await page.getByRole("button", { name: "Formula data sources" }).click();
  await page.getByRole("button", { name: /base1Rm source/ }).click();
  await page.getByRole("option", { name: "Manual value" }).click();
  await page.getByRole("spinbutton", { name: "base1Rm value" }).fill("120");
  await page.getByRole("spinbutton", { name: "percentage value" }).fill("75");
  await page.getByRole("button", { name: "Expand formula editor" }).click();
  const panel = page.getByRole("dialog", { name: "Load", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("spinbutton", { name: "base1Rm value" })).toHaveValue("120");
  await expect(panel.getByRole("spinbutton", { name: "percentage value" })).toHaveValue("75");
  await panel.getByRole("spinbutton", { name: "percentage value" }).fill("80");
  const saved = page.waitForRequest(request => request.url().endsWith("/draft") && request.method() === "PUT");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  const body = (await saved).postDataJSON();
  expect(body.document.blocks[0].cycles[0].days[0].workouts[0].exercises[0].sets[0].prescription.loadFormula.inputs.percentage.value).toBe(.8);
});

test("all headers reset together and count/time cells persist typed formulas", async ({ page }) => {
  await fixture(page);
  const cycle = page.locator('[data-node][data-kind="cycle"]');
  await cycle.getByRole("button", { name: "Expand into cells", exact: true }).click();
  const handle = cycle.getByRole("separator", { name: "Resize Load column in element", exact: true });
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 25, grip.y + grip.height / 2); await page.mouse.up();
  await page.getByRole("button", { name: "Reset all column widths", exact: true }).click();
  await expect(page.getByRole("separator", { name: "Resize column I", exact: true })).toHaveAttribute("aria-valuenow", "104");
  for (const name of ["Sets", "Reps", "Time", "Rest"]) {
    if (name === "Time" || name === "Rest") await cycle.getByRole("gridcell", { name: new RegExp(`^${name}:`) }).press("=");
    const input = cycle.getByRole("combobox", { name, exact: true });
    await input.fill(name === "Time" || name === "Rest" ? "=30 s + 15 s" : "=2 + 1");
    await input.press("Enter");
  }
  await expect(cycle.getByRole("button", { name: /Sets unit/ })).toHaveCount(0);
  const saved = page.waitForRequest(request => request.url().endsWith("/draft") && request.method() === "PUT");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const p = (await saved).postDataJSON().document.blocks[0].cycles[0].days[0].workouts[0].exercises[0].sets[0].prescription;
  expect(p.fieldFormulas.Sets.outputUnit).toBe("Scalar");
  expect(p.fieldFormulas.Reps.outputUnit).toBe("Scalar");
  expect(p.fieldFormulas.WorkTime.outputUnit).toBe("Seconds");
  expect(p.fieldFormulas.Rest.outputUnit).toBe("Seconds");
});

test("time maxes save separately and pointer menus flip away from viewport edges", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "Add maxes table", exact: true }).click();
  const table = page.locator('[data-node][data-kind="maxes"]');
  await table.getByRole("button", { name: "Exercise", exact: true }).click();
  await table.getByRole("combobox", { name: "Exercise", exact: true }).fill("Bench");
  await table.getByRole("option", { name: /Bench press/ }).click();
  await table.getByRole("gridcell", { name: /^Max time 1:/ }).click();
  const minutes = table.getByRole("spinbutton", { name: "Minutes" });
  await minutes.press("1"); await minutes.press("ArrowRight");
  const seconds = table.getByRole("spinbutton", { name: "Seconds" });
  await seconds.press("3"); await seconds.press("0"); await seconds.press("Enter");
  await expect(table.getByRole("gridcell", { name: "Max time 1: 1:30", exact: true })).toBeVisible();
  await expect(table.getByRole("combobox", { name: "Max load 1", exact: true }).locator("xpath=ancestor::*[@data-inline-load]")).not.toHaveAttribute("data-invalid");
  const saved = page.waitForRequest(request => request.url().endsWith("/draft") && request.method() === "PUT");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  expect((await saved).postDataJSON().document.maxesTables[0].rows[0].time).toEqual({ value: 90, unit: "Seconds" });
  const viewport = page.viewportSize()!;
  await table.locator('[role="row"]').evaluate((row, viewport) => row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: viewport.width - 10, clientY: viewport.height - 10 })), viewport);
  const menu = page.getByRole("menu", { name: "Exercise maxes" });
  await expect(menu).toBeVisible();
  await expect.poll(async () => { const box = (await menu.boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(viewport.width - 7);
  await expect.poll(async () => { const box = (await menu.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(viewport.height - 7);
});

test("sheet preview stays bounded and responsive on program details", async ({ page }) => {
  await fixture(page, true);
  await page.goto(`/app/programs/${planId}`);
  await expect(page.locator('[data-kind="block"][data-node]')).toBeVisible();
  const measurements = await page.evaluate(async () => {
    const samples: number[] = [];
    for (let i = 0; i < 25; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      samples.push(document.documentElement.scrollWidth);
    }
    return { samples, width: innerWidth };
  });
  expect(Math.max(...measurements.samples)).toBeLessThanOrEqual(measurements.width + 1);
});

test("sheet preview is bounded when shared sheet styles load after route styles", async ({ page }) => {
  await fixture(page, true);
  const sheetClass = await page.locator('[data-node][data-kind="block"]').evaluate(node => {
    const sheet = node.closest('[role="group"]')!.parentElement!.parentElement!.parentElement!;
    return [...sheet.classList].find(name => name.startsWith('_sheet_'))!;
  });
  await page.addStyleTag({ content: `.${sheetClass} { height: 100%; }` });
  await expect.poll(async () => page.locator('[data-node][data-kind="block"]').evaluate(node =>
    node.closest('[role="group"]')!.parentElement!.parentElement!.clientHeight
  )).toBeLessThan(900);
});

test("sheet editor keeps column resizing inside its viewport", async ({ page }) => {
  await fixture(page);
  const block = page.locator('[data-node][data-kind="block"]');
  const before = (await block.boundingBox())!.width;
  const separator = page.getByRole('separator', { name: 'Resize column B', exact: true });
  await separator.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '112');
  await expect.poll(async () => (await block.boundingBox())!.width).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});


test("Polish preview localizes controls without translating plan and exercise names", async ({ page }) => {
  await fixture(page, true, "pl");
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("link", { name: "Otwórz edytor", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Interaction test", exact: true })).toBeVisible();
  await expect(page.getByText("Bench press", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open editor", exact: true })).toHaveCount(0);
});
