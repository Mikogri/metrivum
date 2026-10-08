import { expect, test } from "@playwright/test";

/** Visible text of static HTML (headlines are split into per-word spans for the entrance animation). */
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

test.describe("public site (pre-rendered)", () => {
  test("landing HTML contains real content and metadata without JavaScript", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(textOf(html)).toContain("The training spreadsheet, rebuilt for coaches");
    expect(html).toMatch(/<title>TrainFlow — the training spreadsheet, rebuilt for coaches<\/title>/);
    expect(html).toContain('rel="canonical"');
    expect(html.toLowerCase()).toContain('hreflang="pl"');
    expect(html).toContain('property="og:title"');
    // No session or private data in static HTML.
    expect(html).not.toContain("access_token");
  });

  test("Polish pages are pre-rendered with lang=pl", async ({ request }) => {
    const html = await (await request.get("/pl/features/program-builder")).text();
    expect(html).toContain('<html lang="pl"');
    expect(textOf(html)).toContain("Edytor programów, który rozumie serie");
  });

  test("landing does not preload the session SDK or the editor", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toMatch(/SessionProvider-[\w-]+\.js/);
    expect(html).not.toMatch(/program-editor-[\w-]+\.js/);
  });

  test("unknown public URLs return a real 404", async ({ request }) => {
    const response = await request.get("/does-not-exist");
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain("This page does not exist");
  });

  test("API paths and missing assets are never answered with HTML", async ({ request }) => {
    expect((await request.get("/api/v1/me")).status()).toBe(404);
    const asset = await request.get("/assets/missing-file.js");
    expect(asset.status()).toBe(404);
    expect(asset.headers()["content-type"]).not.toContain("text/html");
  });

  test("sitemap lists both languages", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/features/video-analysis</loc>");
    expect(xml).toContain("/pl/features/video-analysis</loc>");
    expect(xml).toContain('hreflang="x-default"');
  });

  test("landing renders, switches language and keeps keyboard focus visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("rebuilt for coaches");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.goto("/");
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 900) {
      await page.getByRole("link", { name: "PL" }).click();
      await expect(page).toHaveURL(/\/pl$/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Arkusz treningowy");
    }
  });
});

test.describe("app routes (SPA fallback)", () => {
  test("deep link into the editor is served and asks for a session", async ({ page, request }) => {
    const response = await request.get("/app/programs/8db154f8-10f0-4fba-9e1d-cf0e74528132/edit");
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toBe("noindex");
    await page.goto("/app/programs/8db154f8-10f0-4fba-9e1d-cf0e74528132/edit");
    // Without a session the gate redirects to sign-in and keeps a safe return path.
    await expect(page).toHaveURL(/\/auth\/login\?returnTo=%2Fapp%2Fprograms%2F/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("auth pages are noindex", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
