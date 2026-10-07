import { test, expect, type Page } from "@playwright/test";
import { seedApp, toast, tab } from "./helpers";
import type { SeedApp } from "./helpers";

/** #63 + review task A: an empty dated tab's file is deleted on close, but only if the
 * file on disk is still the version the tab loaded (a background tab is never drift-checked). */

const seed = {
  seed: {
    notes: { "2026-09-06.txt": "# other\n", "2026-09-07.txt": "" },
    session: { openTabs: ["2026-09-06.txt", "2026-09-07.txt"], activeTab: "2026-09-06.txt" },
  },
} satisfies SeedApp;

function diskNote(page: Page) {
  return page.evaluate(() => window.__CHRONO_MOCK__!.getNote("2026-09-07.txt"));
}

test("an empty note that nothing changed is deleted on close", async ({ page }) => {
  await seedApp(page, seed);
  await tab(page, "2026-09-07.txt").click({ button: "middle" });
  await expect.poll(() => diskNote(page)).toBeNull();
});

test("an empty tab does not delete a note that changed on disk meanwhile", async ({ page }) => {
  await seedApp(page, seed);
  await page.evaluate(() => window.__CHRONO_MOCK__!.setNote("2026-09-07.txt", "# from laptop B\n"));
  await tab(page, "2026-09-07.txt").click({ button: "middle" });
  await expect(toast(page)).toContainText(/changed on disk/i);
  expect(await diskNote(page)).toBe("# from laptop B\n");
});
