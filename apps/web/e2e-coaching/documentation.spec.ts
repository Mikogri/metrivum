import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const user = "00000000-0000-4000-8000-000000000000";
const relationship = "20000000-0000-4000-8000-000000000051";
const base = `/api/v1/coaching/relationships/${relationship}/documentation`;
const features = JSON.parse(readFileSync(new URL("../../../contracts/generated/features.json", import.meta.url), "utf8")) as { key: string }[];
const paged = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 25 });

async function fixture(page: Page) {
  let client = false; let status = "Active"; let sequence = 0;
  const documents: Record<string, unknown>[] = [];
  const paths: string[] = [];
  await page.addInitScript(({ user }) => {
    localStorage.setItem("tf.auth.slot.0", JSON.stringify({ access_token: "mock-0", refresh_token: "mock-refresh-0", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, email: "documentation@trainflow.test", aud: "authenticated" } }));
    localStorage.setItem("tf.auth.active-slot", "0");
  }, { user });
  await page.route("**/shared/dev/mockApi.ts*", (route) => route.fulfill({ contentType: "text/javascript", body: "export const mockFetch = (input, init) => fetch(input, init);" }));
  await page.route("http://mock.trainflow.invalid/**", async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; paths.push(path);
    const respond = (data: unknown, code = 200) => route.fulfill({ status: code, json: data, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    if (req.method() === "OPTIONS") return respond({});
    if (path === "/api/v1/me") return respond({ id: user, workspaceId: user, username: "documentation", displayName: "Documentation test", onboarded: true, roles: ["Coach", "Client"], contexts: ["Coach", "Client"], version: 1, locale: "en", timeZone: "UTC", birthDate: "1990-01-01" });
    if (path === "/api/v1/me/access") return respond({ version: "test", features: features.map((f) => ({ key: f.key, available: true, reason: "available" })), limits: [] });
    if (path === "/api/v1/messaging/conversations" || path === "/api/v1/messaging/requests") return respond([]);
    if (path === "/api/v1/me/profile-fields") return respond({ currency: "EUR", values: {}, version: 1 });
    if (path === `/api/v1/coaching/clients/${relationship}`) return respond({ id: relationship, client: { id: user, displayName: "Documentation client" }, status, startedAt: new Date().toISOString(), groupIds: [], statusHistory: [], allowedActions: [], version: 1 });
    if (path === "/api/v1/coaching/my-coaches") return respond(paged([{ id: relationship, coach: { id: user, displayName: "Documentation coach" }, status }]));
    if (path === `${base}/`) return status === "Suspended" && client ? respond({ title: "This relationship does not permit documentation access.", status: 403, code: "RELATIONSHIP_ACCESS_DENIED" }, 403) : respond({ status, coach: !client, allowedActions: status === "Active" ? ["create", "measure", "upload", ...(!client ? ["notes"] : [])] : [] });
    if (path === `${base}/measurement-definitions`) return respond([{ key: "weight", label: "Body weight", units: ["kg", "lb"] }]);
    if (path === `${base}/measurements/trend`) return respond({ key: "weight", unit: "kg", points: [] });
    if (path === `${base}/documents` && req.method() === "POST") {
      const body = req.postDataJSON(); const doc = { ...body, id: `document-${++sequence}`, source: client ? "Client" : "Coach", version: 1, hasFile: false, contentType: null, allowedActions: ["edit", "share"] };
      documents.push(doc); return respond(doc);
    }
    if (path === `${base}/documents`) return respond(paged(documents.filter((d) => !client || d.visibility === "SharedWithClient").map((d) => ({ ...d, allowedActions: client || status !== "Active" ? [] : ["edit", "share"] }))));
    if (path === "/api/v1/notifications/unread-count") return respond({ count: 0 });
    return respond(paged([]));
  });
  return {
    paths,
    async asClient(nextStatus = "Active") { client = true; status = nextStatus; await page.addInitScript(({ user }) => localStorage.setItem(`tf.workspace.0:${user}`, "client"), { user }); await page.goto(`/app/my-coaches/${relationship}/documents`); },
  };
}

test("coach shares plain text and client sees shared historical material without private notes", async ({ page }) => {
  const f = await fixture(page);
  await page.goto(`/app/clients/${relationship}?tab=documentation`);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Private training context");
  await page.getByRole("textbox", { name: "Document text", exact: true }).fill("Private context must not reach client");
  await page.getByRole("button", { name: "Save document", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Private training context" })).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Shared recovery instructions");
  await page.getByRole("textbox", { name: "Document text", exact: true }).fill("Rest and record how you feel.");
  await page.getByRole("button", { name: "Visibility" }).click();
  await page.getByRole("option", { name: "Shared with client" }).click();
  await page.getByRole("button", { name: "Save document", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shared recovery instructions" })).toBeVisible();
  await f.asClient("Completed");
  await expect(page.getByText("Completed relationship — historical records are read-only.")).toBeVisible();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shared recovery instructions" })).toBeVisible();
  await expect(page.getByText("Private context must not reach client")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Private notes", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save document", exact: true })).toHaveCount(0);
});

test("suspended client receives unavailable state before protected documentation queries", async ({ page }) => {
  const f = await fixture(page);
  await f.asClient("Suspended");
  const switchButton = page.getByRole("button", { name: "Switch workspace" });
  if (await switchButton.isVisible()) await switchButton.click();
  await expect(page.getByText("This relationship does not permit documentation access.")).toBeVisible();
  expect(f.paths.some((p) => p === `${base}/documents` || p === `${base}/notes` || p === `${base}/measurements`)).toBe(false);
});
