import { test, expect } from "@playwright/test";
import { seedApp, toast } from "./helpers";

test.describe("config schema version", () => {
  test("status bar shows message when config is from a newer app version", async ({ page }) => {
    await seedApp(page, { seed: { schemaVersion: 99 } });
    await expect(toast(page)).toHaveText("Settings were saved by a newer ChronoNote. Some may not apply.");
  });

  test("status bar does not show newer version message with default seed", async ({ page }) => {
    await seedApp(page);
    await expect(toast(page)).toHaveCount(0);
  });
});
