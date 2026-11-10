import { expect, test } from "@playwright/test";

test("browser tabs identify the current page", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "tf.auth.slot.0",
      JSON.stringify({
        access_token: "mock-0",
        refresh_token: "mock-refresh-0",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: "00000000-0000-4000-8000-000000000000",
          email: "coach@trainflow.test",
          aud: "authenticated",
        },
      }),
    );
    localStorage.setItem("tf.auth.active-slot", "0");
  });
  for (const [path, title] of [
    ["/app/calendar", "Calendar"],
    ["/app/offers", "Offers"],
    ["/app/offers/new", "New offer"],
    ["/app/forms/new", "New form"],
    ["/app/messages", "Messages"],
    ["/app/training-plans", "Training plans"],
  ]) {
    await page.goto(path!, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(`${title} — Metrivum`);
  }
});
