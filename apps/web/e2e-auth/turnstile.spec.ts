import { expect, test, type Page } from "@playwright/test";

const widgetScript = `(() => {
  let active; let id = 0;
  window.turnstile = {
    render(element, options) { active = options; window.__challenge = options; return String(++id); },
    reset() {}, remove() { active = null; }
  };
  window.__solve = token => active.callback(token);
  window.__expire = () => active["expired-callback"]();
  window.__fail = () => active["error-callback"]();
})();`;
async function solve(page: Page, token = "browser-one-use-token") {
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __challenge?: unknown }).__challenge),
  );
  await page.evaluate(
    (value) =>
      (window as unknown as { __solve: (token: string) => void }).__solve(
        value,
      ),
    token,
  );
}
test.beforeEach(async ({ page }) => {
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: widgetScript,
      }),
  );
});
for (const operation of [
  "signup",
  "password",
  "otp",
  "reset",
  "resend",
] as const) {
  test(`${operation} gates requests and sends CAPTCHA through the real SDK`, async ({
    page,
  }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route("http://127.0.0.1:54321/auth/v1/**", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "captcha_failed",
          msg: "Security verification failed",
        }),
      });
    });
    if (operation === "resend") await page.clock.install();
    await page.goto(
      operation === "signup"
        ? "/auth/register"
        : operation === "reset"
          ? "/auth/forgot-password"
          : operation === "resend"
            ? "/auth/verify?type=signup&slot=0&email=local%40example.test"
            : "/auth/login",
    );
    if (operation === "otp")
      await page
        .getByRole("button", { name: "Sign in with an email link instead" })
        .click();
    if (operation !== "resend")
      await page.getByLabel(/^Email/).fill("local@example.test");
    if (operation === "signup" || operation === "password")
      await page.getByLabel(/^Password/).fill("test-password-123");
    if (operation === "signup") {
      await page.getByRole("checkbox", { name: /I accept the/ }).focus();
      await page.keyboard.press("Space");
      await expect(
        page.getByRole("checkbox", { name: /I accept the/ }),
      ).toBeChecked();
    }
    if (operation === "resend") {
      await expect(
        page.getByRole("button", { name: /^New link in/ }),
      ).toBeVisible();
      await page.clock.setSystemTime(new Date(Date.now() + 61000));
      await page.clock.runFor(1500);
    }
    const submit = page.getByRole("button", {
      name:
        operation === "signup"
          ? "Create account"
          : operation === "password"
            ? /^Sign in$/
            : operation === "otp"
              ? "Email me a sign-in link"
              : operation === "reset"
                ? "Send reset link"
                : "Send a new link",
    });
    await expect(submit).toBeDisabled();
    expect(bodies).toHaveLength(0);
    await solve(page);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({
      gotrue_meta_security: { captcha_token: "browser-one-use-token" },
    });
    await expect(submit).toBeDisabled();
  });
}
test("expiry and widget failures block submission and allow retry", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await solve(page);
  await page.evaluate(() =>
    (window as unknown as { __expire: () => void }).__expire(),
  );
  await expect(page.getByRole("alert")).toContainText("expired");
  await expect(page.getByRole("button", { name: /^Sign in$/ })).toBeDisabled();
  await page.getByRole("button", { name: "Retry verification" }).click();
  await page.evaluate(() =>
    (window as unknown as { __fail: () => void }).__fail(),
  );
  await expect(page.getByRole("alert")).toContainText("failed");
});

test("a delayed successful login cannot replace a saved account after leaving the form", async ({
  page,
}) => {
  const user = (name: string) => ({
    id: `${name.repeat(8)}-${name.repeat(4)}-4${name.repeat(3)}-8${name.repeat(3)}-${name.repeat(12)}`,
    email: `${name}@example.test`,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  });
  const session = (name: string) => ({
    access_token: `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user(name).id, email: user(name).email, role: "authenticated", aal: "aal1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`,
    refresh_token: `refresh-${name}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: user(name),
  });
  const saved = session("a");
  await page.addInitScript((value) => {
    localStorage.setItem("tf.auth.slot.0", JSON.stringify(value));
    sessionStorage.setItem("tf.auth.active-slot", "0");
  }, saved);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const inFlight = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("http://127.0.0.1:54321/auth/v1/**", async (route) => {
    if (route.request().url().includes("/token?grant_type=password")) {
      started();
      await gate;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(session("c")),
      });
    } else
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(user("a")),
      });
  });
  await page.goto("/auth/login?add=1&slot=0");
  await page.getByLabel(/^Email/).fill("c@example.test");
  await page.getByLabel(/^Password/).fill("test-password-123");
  await solve(page);
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await inFlight;
  await page.locator('a[href="/auth/forgot-password?slot=0"]').click();
  await expect(page).toHaveURL(/\/auth\/forgot-password/);
  const response = page.waitForResponse((value) =>
    value.url().includes("/token?grant_type=password"),
  );
  release();
  await response;
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tf.auth.slot.0")!).user.id,
    ),
  ).toBe(saved.user.id);
  await expect(page).toHaveURL(/\/auth\/forgot-password/);
});
