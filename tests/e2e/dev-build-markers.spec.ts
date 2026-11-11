import { test, expect } from "@playwright/test";
import { seedApp } from "./helpers";

// §458: a debug build shows a DEV badge and "(dev)" in the window title (the mock copies set_title to document.title).
// `?devbuild` stands in for TAURI_ENV_DEBUG under the mock; the orange icon is set in Rust and not covered here.
test.describe("dev build markers (§458)", () => {
  test("a debug build shows the DEV badge and says (dev) in the window title", async ({ page }) => {
    await seedApp(page, { seed: "busy-week", query: "devbuild" });
    await expect(page.getByTestId("dev-badge")).toHaveText("DEV");
    await expect(page).toHaveTitle(/^ChronoNote \(dev\) - /);
  });

  test("the badge sits on the row of the app icon", async ({ page }) => {
    await seedApp(page, { seed: "busy-week", query: "devbuild" });
    const centre = async (selector: string) => {
      const box = (await page.locator(selector).first().boundingBox())!;
      return box.y + box.height / 2;
    };
    expect(Math.abs((await centre(".dev-badge")) - (await centre(".app-icon")))).toBeLessThanOrEqual(0.5);
  });

  test("an ordinary build shows neither", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await expect(page.getByTestId("dev-badge")).toHaveCount(0);
    await expect(page).toHaveTitle(/^ChronoNote - /);
  });
});
