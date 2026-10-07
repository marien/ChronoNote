import { test, expect } from "@playwright/test";
import { seedApp, tab } from "./helpers";
import type { SeedApp } from "./helpers";

/** A note written by another editor with CRLF line endings: the app must
 * handle it as LF text, hash it as LF text (so it is not rewritten on open
 * or flagged as changed), and its line rules must still match. */

const CRLF = "Today\r\n=====\r\n# task one\r\n";

const seed = {
  seed: {
    notes: { "2026-09-06.txt": "other\n", "2026-09-07.txt": CRLF },
    session: { openTabs: ["2026-09-06.txt", "2026-09-07.txt"], activeTab: "2026-09-07.txt" },
  },
} satisfies SeedApp;

test("opening a CRLF note and switching tabs does not rewrite the file", async ({ page }) => {
  await seedApp(page, seed);
  await tab(page, "2026-09-06.txt").click();
  await tab(page, "2026-09-07.txt").click();
  await page.waitForTimeout(1000);
  const disk = await page.evaluate(() => window.__CHRONO_MOCK__!.getNote("2026-09-07.txt"));
  expect(disk).toBe(CRLF);
});

test("the status bar counts the open action in a CRLF note", async ({ page }) => {
  await seedApp(page, seed);
  await expect(page.locator("#stat-open")).toContainText("1");
});
