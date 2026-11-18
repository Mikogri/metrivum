import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Pick a highlighted triangle from the real render instead of exposing test-only scene hooks.
const { PNG } = require("pngjs");
test.use({
  launchOptions: {
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});

test("real BodyParts3D geometry, picking, camera, catalogue and attribution", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const shaderErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /WebGLProgram|VALIDATE_STATUS|shader error/i.test(message.text())
    )
      shaderErrors.push(message.text());
  });
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
          email_confirmed_at: "2026-01-01T00:00:00Z",
          aud: "authenticated",
        },
      }),
    );
    localStorage.setItem("tf.auth.active-slot", "0");
  });
  await page.goto("/app/anatomy", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/exercises$/, { timeout: 45_000 });
  await expect(page).toHaveTitle(/Exercises .* Metrivum/, { timeout: 45_000 });
  await expect(
    page.getByRole("link", { name: "Anatomy", exact: true }),
  ).toHaveCount(0);
  const selectMuscle = async (name: string) => {
    const input = page.getByRole("combobox", { name: "Muscle", exact: true });
    await input.fill(name);
    await input.press("ArrowDown");
    await page.getByRole("option", { name, exact: true }).click();
  };
  const canvas = page
    .getByRole("application", { name: "Interactive 3D anatomy" })
    .locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator('[aria-busy="true"]').filter({ has: canvas }),
  ).toHaveCount(0, { timeout: 90_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  const initial = await canvas.screenshot();
  await selectMuscle("Quadriceps");
  await expect(page).toHaveURL(/muscle=quadriceps/);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(initial))
    .toBe(false);
  // Find the actual selected geometry in the rendered image, then pick that pixel on the real canvas.
  const image = PNG.sync.read(await canvas.screenshot());
  let point: { x: number; y: number } | undefined;
  for (let y = 3; y < image.height - 3 && !point; y++) {
    for (let x = 3; x < image.width - 3; x++) {
      const interior = [
        [0, 0],
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ].every(([dx, dy]) => {
        const pixel = ((y + dy) * image.width + x + dx) * 4;
        return (
          image.data[pixel + 1] > image.data[pixel] * 1.35 &&
          image.data[pixel + 1] > image.data[pixel + 2] * 1.1 &&
          image.data[pixel + 1] > 100
        );
      });
      if (interior) {
        point = { x: x / image.width, y: y / image.height };
        break;
      }
    }
  }
  expect(
    point,
    "selected anatomical triangles must be highlighted",
  ).toBeTruthy();
  const rect = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: point!.x * rect.width, y: point!.y * rect.height },
  });
  await expect(page).not.toHaveURL(/muscle=/);
  await expect(
    page.getByRole("link", { name: "Bench press", exact: true }),
  ).toBeVisible();
  const greenPixels = async () => {
    const screenshot = PNG.sync.read(await canvas.screenshot());
    let count = 0;
    for (let i = 0; i < screenshot.data.length; i += 4) {
      if (
        screenshot.data[i + 1] > screenshot.data[i] * 1.35 &&
        screenshot.data[i + 1] > screenshot.data[i + 2] * 1.1 &&
        screenshot.data[i + 1] > 100
      )
        count++;
    }
    return count;
  };
  await selectMuscle("Gluteus maximus");
  const covered = await greenPixels();
  await page.getByRole("button", { name: "Back", exact: true }).last().click();
  await expect.poll(greenPixels).toBeGreaterThan(Math.max(100, covered * 2));
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await expect.poll(greenPixels).toBeLessThan(Math.max(100, covered * 2));
  await page
    .getByRole("button", { name: "Clear selection", exact: false })
    .click();
  await selectMuscle("Latissimus dorsi");
  await expect(
    page.getByText("This muscle is not available in the current 3D model."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear selection", exact: false })
    .click();
  const beforeCamera = await canvas.screenshot();
  await page.getByRole("application").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("+");
  await expect
    .poll(async () => (await canvas.screenshot()).equals(beforeCamera))
    .toBe(false);
  await page.getByRole("button", { name: "Back", exact: true }).last().click();
  await page.getByRole("button", { name: "Reset camera" }).click();
  await page
    .getByRole("checkbox", { name: /^Muscles/ })
    .locator("xpath=ancestor::label")
    .click();
  await page.getByRole("button", { name: "Reset visibility" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Muscles", exact: false }),
  ).toBeChecked();
  if (test.info().project.name === "desktop") {
    for (const name of [
      "Skeleton",
      "Nervous system",
      "Tendons",
      "Ligaments",
      "Skin",
      "Vascular structures",
      "Internal organs",
      "Other / ungrouped",
    ]) {
      const response = page.waitForResponse(
        (response) =>
          response.url().endsWith(".glb") && response.status() === 200,
      );
      await page
        .getByRole("checkbox", {
          name: new RegExp(`^${name.replace("/", "\\/")}`),
        })
        .locator("xpath=ancestor::label")
        .click();
      await response;
      await expect(
        page.locator('[aria-busy="true"]').filter({ has: canvas }),
      ).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    for (const direction of ["Front", "Back", "Left", "Right"]) {
      await page
        .getByRole("button", { name: direction, exact: true })
        .last()
        .click();
      await canvas.screenshot({
        path: `../../.local/anatomy-display-mask-${direction.toLowerCase()}.png`,
      });
    }
    await page.getByText("Transparent anatomy", { exact: true }).click();
    await canvas.screenshot({
      path: "../../.local/anatomy-display-mask-transparent.png",
    });
    await page.getByRole("button", { name: "Reset visibility" }).click();
    await expect(
      page.getByRole("checkbox", { name: /^Tendons/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /^Ligaments/ }),
    ).not.toBeChecked();
  }
  await page.getByRole("main").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: `../../.local/anatomy-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Anatomy Data & Licenses" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
  );
  await expect(
    page.getByRole("link", { name: "CC BY 4.0 legal code" }),
  ).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/4.0/legalcode.en",
  );
  expect(shaderErrors).toEqual([]);
});
