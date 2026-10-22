import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.setTimeout(90_000);
const user = "00000000-0000-4000-8000-000000000000";
const connectionId = "60000000-0000-4000-8000-000000000001";
const actionId = "60000000-0000-4000-8000-000000000002";
const features = JSON.parse(readFileSync(new URL("../../../contracts/generated/features.json", import.meta.url), "utf8")) as { key: string }[];
const callback = "https://assistant.fixture.test/callback";

// Browser fixtures exercise real UI/transport; they do not validate a live OAuth provider or MCP host.
async function fixture(page: Page) {
  const writes: { path: string; body: unknown }[] = [];
  const connection = { id: connectionId, clientId: "fixture-oauth-client", clientName: "Fixture assistant", grants: ["read_training"], createdAt: "2026-10-14T08:00:00Z", lastUsedAt: null, revokedAt: null as string | null, version: 3 };
  const preferences = { note: "Preserve exercise order", shareWithIntegrations: false, version: 1 };
  const action = { id: actionId, connectionId, clientName: connection.clientName, type: "SendMessage", status: "Pending", conversationId: "60000000-0000-4000-8000-000000000003", conversationTitle: "Client follow-up", recipients: [{ userId: "60000000-0000-4000-8000-000000000004", displayName: "Client Alice" }], body: "Please record your next workout.\nI will review your progress tomorrow.", payloadHash: "fixture-hash", createdAt: "2026-10-14T08:00:00Z", expiresAt: "2099-01-01T00:00:00Z", approvedAt: null as string | null, executedAt: null as string | null, messageId: null as string | null, version: 4, reviewUrl: `/app/integrations/actions/${actionId}` };
  await page.addInitScript(({ user }) => {
    localStorage.setItem("tf.auth.slot.0", JSON.stringify({ access_token: "mock-0", refresh_token: "mock-refresh-0", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, email: "integrations@trainflow.test", aud: "authenticated" } }));
    localStorage.setItem("tf.auth.active-slot", "0");
    localStorage.setItem(`tf.workspace.0:${user}`, "coach");
  }, { user });
  await page.route("**/shared/dev/mockApi.ts*", route => route.fulfill({ contentType: "text/javascript", body: "export const mockFetch = (input, init) => fetch(input, init);" }));
  await page.route("https://assistant.fixture.test/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Fixture OAuth callback</h1>" }));
  await page.route("http://mock.trainflow.invalid/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    if (method === "OPTIONS") return respond({});
    if (method !== "GET") writes.push({ path, body: request.postData() ? request.postDataJSON() : null });
    if (path === "/api/v1/me") return respond({ id: user, workspaceId: user, username: "integrations", displayName: "Integration coach", onboarded: true, roles: ["Coach", "Client"], contexts: ["Coach", "Client"], version: 1, locale: "en", timeZone: "UTC", birthDate: "1990-01-01" });
    if (path === "/api/v1/me/access") return respond({ version: "fixture", features: features.map(feature => ({ key: feature.key, available: true, reason: "available" })), limits: [] });
    if (path === "/api/v1/teams/mine") return respond({ teams: [], invitations: [] });
    if (path === "/api/v1/notifications/unread-count") return respond({ count: 0 });
    if (path === "/api/v1/me/ai-integrations") return respond([connection]);
    if (path === `/api/v1/me/ai-integrations/${connectionId}/grants`) {
      const body = request.postDataJSON();
      if (body.expectedVersion !== connection.version) return respond({ title: "Permissions changed. Reload the connection.", status: 409 }, 409);
      connection.grants = body.grants;
      connection.version++;
      return respond(connection);
    }
    if (path === `/api/v1/me/ai-integrations/${connectionId}/revoke`) {
      connection.revokedAt = new Date().toISOString(); connection.version++;
      return respond(connection);
    }
    if (path === "/api/v1/me/ai-programming-preferences") {
      if (method === "PATCH") {
        const body = request.postDataJSON();
        if (body.expectedVersion !== preferences.version) return respond({ title: "Preferences changed. Reload your note.", status: 409 }, 409);
        preferences.note = body.note; preferences.shareWithIntegrations = body.shareWithIntegrations; preferences.version++;
      }
      return respond(preferences);
    }
    if (path === "/api/v1/me/ai-actions") return respond(action.status === "Pending" ? [action] : []);
    if (path === `/api/v1/me/ai-actions/${actionId}`) return respond(action);
    if (path === `/api/v1/me/ai-actions/${actionId}/approve` || path === `/api/v1/me/ai-actions/${actionId}/reject`) {
      const body = request.postDataJSON();
      if (body.expectedVersion !== action.version || action.status !== "Pending") return respond({ title: "This action is no longer pending.", status: 409 }, 409);
      action.version++;
      action.status = path.endsWith("/approve") ? "Executed" : "Rejected";
      if (action.status === "Executed") { action.approvedAt = new Date().toISOString(); action.executedAt = action.approvedAt; action.messageId = "60000000-0000-4000-8000-000000000005"; }
      return respond(action);
    }
    if (path === "/api/v1/me/ai-consent/fixture-request") {
      if (method === "POST") return respond({ redirectUrl: `${callback}?code=fixture-code&state=fixture-state`, connection: { ...connection, grants: request.postDataJSON().grants } });
      return respond({ authorizationId: "fixture-request", clientId: connection.clientId, clientName: "Verified fixture assistant", redirectUri: callback, scopes: ["openid", "profile"], availableGrants: ["read_training", "write_training_drafts", "read_messages", "prepare_messages", "send_approved_messages"] });
    }
    if (path === "/api/v1/me/ai-consent/fixture-request/deny") return respond({ redirectUrl: `${callback}?error=access_denied&state=fixture-state` });
    if (path.startsWith("/api/v1/messaging/")) return respond([]);
    return respond({ items: [], total: 0, page: 1, pageSize: 20 });
  });
  return { writes, connection, preferences, action };
}

test("settings saves versioned permissions and opt-in notes, then revokes the connection", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/app/settings?section=integrations", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Connected AI assistants" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Create and edit private training drafts" }).press("Space");
  await page.getByRole("button", { name: "Save permissions", exact: true }).click();
  await expect.poll(() => f.connection.version).toBe(4);
  expect(f.writes.find(write => write.path.endsWith("/grants"))?.body).toEqual({ grants: ["read_training", "write_training_drafts"], expectedVersion: 3 });
  await page.getByRole("textbox", { name: "Programming preferences" }).fill("Keep ten-day cycles and preserve exercise order.");
  await page.getByRole("checkbox", { name: "Share this note with connected assistants" }).press("Space");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect.poll(() => f.preferences.version).toBe(2);
  expect(f.preferences.shareWithIntegrations).toBe(true);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Read training programs and exercises" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("OAuth consent uses verified identity and redirects only after selected grants are accepted", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/app/integrations/consent?authorization_id=fixture-request&client_name=Spoofed&redirect_uri=https://attacker.test", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Connect Verified fixture assistant" })).toBeVisible();
  await expect(page.getByText(callback, { exact: true })).toBeVisible();
  await expect(page.getByText("Spoofed", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Allow selected permissions" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Read training programs and exercises" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Read training programs and exercises" }).press("Space");
  await page.getByRole("button", { name: "Allow selected permissions" }).click();
  await expect(page).toHaveURL(`${callback}?code=fixture-code&state=fixture-state`);
  expect(f.writes.filter(write => write.path === "/api/v1/me/ai-consent/fixture-request")).toEqual([{ path: "/api/v1/me/ai-consent/fixture-request", body: { grants: ["read_training"] } }]);
});

test("OAuth denial returns to the verified callback without saving permissions", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/app/integrations/consent?authorization_id=fixture-request", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Connect Verified fixture assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page).toHaveURL(`${callback}?error=access_denied&state=fixture-state`);
  expect(f.writes.filter(write => write.path.includes("/ai-consent/"))).toEqual([{ path: "/api/v1/me/ai-consent/fixture-request/deny", body: null }]);
});

test("pending action sends the exact reviewed message only after an explicit user click", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/app/settings?section=integrations", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Review message to Client Alice" }).click();
  await expect(page.getByRole("heading", { name: "Review assistant action" })).toBeVisible();
  await expect(page.getByText("Client Alice", { exact: true })).toBeVisible();
  await expect(page.getByText(f.action.body, { exact: true })).toBeVisible();
  expect(f.writes.filter(write => write.path.includes("/ai-actions/"))).toEqual([]);
  await page.getByRole("button", { name: "Send this message", exact: true }).click();
  await expect(page.getByText("Message sent", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send this message", exact: true })).toHaveCount(0);
  expect(f.writes.filter(write => write.path.includes("/ai-actions/"))).toEqual([{ path: `/api/v1/me/ai-actions/${actionId}/approve`, body: { expectedVersion: 4 } }]);
});

test("pending action can be rejected without sending", async ({ page }) => {
  const f = await fixture(page);
  await page.goto(`/app/integrations/actions/${actionId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(f.action.body, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText("Action rejected", { exact: true })).toBeVisible();
  expect(f.action.messageId).toBeNull();
  expect(f.writes.filter(write => write.path.includes("/ai-actions/"))).toEqual([{ path: `/api/v1/me/ai-actions/${actionId}/reject`, body: { expectedVersion: 4 } }]);
});
