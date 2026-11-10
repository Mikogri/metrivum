import { test, expect } from "@playwright/test";

for (const [name, path] of [
  ["forms", "/app/forms"],
  ["offers", "/app/offers"],
  ["exercises", "/app/exercises"],
  ["analyses", "/app/video-analyses"],
  ["videos", "/app/video-analyses?tab=videos"],
]) {
  test(`${name} supports persistent cards and table views`, async ({
    page,
  }) => {
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
    await page.goto(path!);
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("radio", { name: "Cards", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page).toHaveURL(/view=cards/);
    await page.reload();
    await expect(
      page.getByRole("radio", { name: "Cards", exact: true }),
    ).toBeChecked();
    await expect(page.getByRole("table")).toHaveCount(0);
    if (name === "videos" || name === "analyses" || name === "exercises") {
      await expect(
        page.getByRole("main").locator("ul").last().locator("li").first(),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("main").getByRole("article").first(),
      ).toBeVisible();
    }
    await page.screenshot({
      path: `../../.local/ui-polish/${name}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
  });
}
