/* global document, getComputedStyle, innerWidth */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Run against the production preview, never a developer server: CSS chunk ordering matters.
test("production public pages retain their theme, ray geometry and auth card", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.route("**/api/v1/subscriptions/catalog", (route) =>
        route.fulfill({ json: [] }),
      );
      for (const route of [
        "/",
        "/pl",
        "/auth/login",
        "/auth/register",
        "/auth/forgot-password",
      ]) {
        await page.goto(
          (process.env.PUBLIC_UI_TEST_URL ?? "http://localhost:4188") + route,
        );
        await page.waitForFunction(
          () => document.querySelector("canvas")?.height > 100,
        );
        const result = await page.evaluate(() => {
          const card = document.querySelector("main > div");
          return {
            theme: getComputedStyle(
              document.querySelector('[data-public-theme="night"]'),
            )
              .getPropertyValue("--ui-glass")
              .trim(),
            background: card ? getComputedStyle(card).backgroundColor : "",
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.ok(result.theme, `${route}: missing night palette`);
        assert.equal(result.overflow, false, `${route}: horizontal overflow`);
        if (route.startsWith("/auth"))
          assert.notEqual(result.background, "rgba(0, 0, 0, 0)");
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("Pages SPA rewrites avoid HTML canonicalization redirects", async () => {
  const rules = await readFile(
    new URL("../public/_redirects", import.meta.url),
    "utf8",
  );
  for (const source of ["/auth/*", "/app/*", "/onboarding/*"]) {
    assert.ok(rules.includes(`${source} /__spa-fallback 200`));
  }
  assert.equal(rules.includes("/__spa-fallback.html"), false);
});
