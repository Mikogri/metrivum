import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const catalog = JSON.parse(
  readFileSync(
    new URL("../../../contracts/generated/features.json", import.meta.url),
    "utf8",
  ),
) as { key: string }[];
const ids = [
  "00000000-0000-4000-8000-000000000000",
  "00000000-0000-4000-8000-000000000001",
];
const evidence = fileURLToPath(
  new URL("../../../.local/mobile-web-2026-10-12/", import.meta.url),
);
mkdirSync(evidence, { recursive: true });
test.setTimeout(90_000);

async function fixture(page: Page, mode = "coach", signedIn = true) {
  await page.addInitScript(
    ({ ids, mode, signedIn }) => {
      ids.forEach((id, slot) => {
        if (signedIn)
          localStorage.setItem(
            `tf.auth.slot.${slot}`,
            JSON.stringify({
              access_token: `mock-${slot}`,
              refresh_token: `mock-refresh-${slot}`,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id,
                email: `person${slot}@trainflow.test`,
                aud: "authenticated",
              },
            }),
          );
        localStorage.setItem(`tf.workspace.${slot}:${id}`, mode);
      });
      if (signedIn) localStorage.setItem("tf.auth.active-slot", "0");
    },
    { ids, mode, signedIn },
  );
  await page.route("**/shared/dev/mockApi.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const mockFetch = (input, init) => fetch(input, init);",
    }),
  );
  await page.route("http://mock.trainflow.invalid/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const slot = request.headers().authorization?.includes("mock-1") ? 1 : 0;
    const respond = (json: unknown) =>
      route.fulfill({
        json,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        },
      });
    if (request.method() === "OPTIONS") return respond(null);
    if (path === "/api/v1/me")
      return respond({
        id: ids[slot],
        workspaceId: ids[slot],
        username: `person${slot}`,
        displayName: `Person ${slot}`,
        birthDate: "1990-01-01",
        locale: "en",
        timeZone: "Europe/Warsaw",
        onboarded: true,
        version: 1,
        roles: ["Coach", "Client"],
        contexts: ["Coach", "Client"],
      });
    if (path === "/api/v1/me/access")
      return respond({
        version: "test",
        features: catalog.map(({ key }) => ({
          key,
          available: true,
          reason: "available",
        })),
        limits: [],
      });
    if (path === "/api/v1/me/profile-fields")
      return respond({ values: {}, version: 1 });
    if (path.endsWith("/unread-count")) return respond({ count: 0 });
    if (path === "/api/v1/teams/mine")
      return respond({ teams: [], requests: [] });
    if (
      path.includes("messaging/") ||
      [
        "/api/v1/analyses",
        "/api/v1/folders",
        "/api/v1/subscriptions/plans",
        "/api/v1/offers/categories",
      ].includes(path)
    )
      return respond([]);
    if (path === "/api/v1/training/schedule") {
      const items =
        url.searchParams.get("status") === "InProgress"
          ? []
          : [
              {
                id: `workout-${slot}`,
                name: `Private workout ${slot}`,
                programName: `Program ${slot}`,
                status: "Scheduled",
                exerciseCount: 3,
              },
            ];
      return respond({ items, total: items.length, page: 1, pageSize: 10 });
    }
    return respond({ items: [], total: 0, page: 1, pageSize: 20 });
  });
}

async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const main = page.locator("#app-main");
  expect(
    await main.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
}

test("responsive sign-in opens the role's existing application session", async ({
  page,
  isMobile,
}) => {
  await fixture(page, "client", false);
  await page.goto("/auth/login?returnTo=/app/today");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("person0@trainflow.test");
  await page.locator('input[name="password"]').fill("MockPassword123!");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/login-${isMobile ? "phone" : "desktop"}.png`,
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Private workout 0", { exact: true }),
  ).toBeVisible();
});

test("phone shell follows native roles, resizes and preserves account isolation", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile);
  await fixture(page);
  await page.goto("/app/dashboard");
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main", exact: true });
  await expect(nav.getByRole("link")).toHaveText([
    "Today",
    "Clients",
    "Messages",
    "Calendar",
    "More",
  ]);
  await expect(
    page.getByText("Private workout 0", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await fits(page);
    await page.screenshot({ path: `${evidence}/today-coach-${width}.png` });
  }
  await nav.getByRole("link", { name: "More" }).click();
  await expect(
    page.getByRole("heading", { name: "More", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Client", exact: true }).click();
  await expect(nav.getByRole("link")).toHaveText([
    "Today",
    "Plans",
    "History",
    "Messages",
    "More",
  ]);
  await nav.getByRole("link", { name: "More" }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  await fits(page);
  await page.screenshot({ path: `${evidence}/more-client-320.png` });
  await page
    .getByRole("button", { name: /Account.*Person 0|Person 0.*account/i })
    .click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: /person1@trainflow.test/ }).click();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByText("Private workout 1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Private workout 0", { exact: true }),
  ).toHaveCount(0);
});

test("phone list filters use a dismissible sheet and keep URL state", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile);
  await fixture(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/app/clients");
  const filters = page.getByRole("button", { name: "Filters", exact: true });
  await filters.click();
  const sheet = page.getByRole("dialog", { name: "Filters and sorting" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /Relationship status/ }).click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await sheet.getByRole("button", { name: "Show results" }).click();
  await expect(page).toHaveURL(/status=Active/);
  await expect(
    page.getByRole("button", { name: "Filters applied" }),
  ).toBeFocused();
  await fits(page);
  await page.getByRole("button", { name: "Filters applied" }).click();
  await page.screenshot({ path: `${evidence}/client-filters-320.png` });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await page.getByRole("link", { name: "More", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "More", exact: true }),
  ).toBeVisible();
  await page.locator("#app-main").evaluate((el) => {
    el.scrollTop = 80;
  });
  await expect
    .poll(() => page.locator("#app-main").evaluate((el) => el.scrollTop))
    .toBe(80);
  await page.getByRole("link", { name: "Video analysis", exact: true }).click();
  await expect(
    page.getByText("No saved analyses", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("New local analysis is not available yet", { exact: true }),
  ).toBeVisible();
  await fits(page);
  await page.goBack();
  await expect
    .poll(() => page.locator("#app-main").evaluate((el) => el.scrollTop))
    .toBe(80);
});

test("tablet and desktop retain the existing navigation", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile);
  await fixture(page);
  await page.goto("/app/more");
  await expect(
    page.getByRole("heading", { name: "More", exact: true }),
  ).toBeVisible();
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
    await expect(
      page.getByRole("link", { name: "Today", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: `${evidence}/desktop-${width}.png` });
  }
  await expect(
    page.getByRole("navigation", { name: "Main", exact: true }),
  ).toBeVisible();
});
