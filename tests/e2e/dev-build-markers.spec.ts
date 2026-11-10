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

  test("an ordinary build shows neither", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await expect(page.getByTestId("dev-badge")).toHaveCount(0);
    await expect(page).toHaveTitle(/^ChronoNote - /);
  });
});
