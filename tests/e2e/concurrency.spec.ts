import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, activeTabContent, modalCard, MODAL_LABELS, toast } from "./helpers";
import type { SeedApp } from "./helpers";

/** §94: external-modification / conflict detection. A note file changing
 * on disk outside ChronoNote is detected when the tab is (re)activated or
 * the window regains focus; here the check is driven deterministically
 * via the mock's `debug.checkDrift()`.
 *
 *   - no local edits  → silent reload + toast (Case B)
 *   - local edits      → the conflict prompt (Case C), whose three buttons
 *                        each do the right thing
 */

const seed = {
  seed: {
    notes: { "2026-09-07.txt": "Today\n=====\noriginal line\n" },
    session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
  },
} satisfies SeedApp;

async function externallyWrite(page: Page, content: string) {
  await page.evaluate((c) => window.__CHRONO_MOCK__!.setNote("2026-09-07.txt", c), content);
}
async function checkDrift(page: Page) {
  await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.checkDrift());
}
async function diskNote(page: Page) {
  return page.evaluate(() => window.__CHRONO_MOCK__!.getNote("2026-09-07.txt"));
}

test("Case B — file changed on disk, no local edits: silent reload", async ({ page }) => {
  await seedApp(page, seed);
  expect(await activeTabContent(page)).toContain("original line");

  await externallyWrite(page, "Today\n=====\nsomeone else edited this\n");
  await checkDrift(page);

  await expect.poll(() => activeTabContent(page)).toContain("someone else edited this");
  await expect(toast(page)).toContainText(/changed on disk/i);
});

test.describe("Case C — file changed on disk AND local edits: the conflict prompt", () => {
  async function intoConflict(page: Page) {
    await seedApp(page, seed);
    await editor(page).click();
    // Local edit (kept in memory — the drift check runs before the 400ms autosave).
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.setEditorContent("Today\n=====\nMY unsaved edit\n"));
    await externallyWrite(page, "Today\n=====\nEXTERNAL edit\n");
    await checkDrift(page);
    await expect(modalCard(page, MODAL_LABELS.conflict)).toBeVisible();
  }

  test("'Keep disk version' loads the external content", async ({ page }) => {
    await intoConflict(page);
    await modalCard(page, MODAL_LABELS.conflict).getByRole("button", { name: /keep disk/i }).click();
    await expect(modalCard(page, MODAL_LABELS.conflict)).toBeHidden();
    await expect.poll(() => activeTabContent(page)).toContain("EXTERNAL edit");
    expect(await activeTabContent(page)).not.toContain("MY unsaved edit");
  });

  test("'Keep my version' overwrites the disk with the in-memory text", async ({ page }) => {
    await intoConflict(page);
    await modalCard(page, MODAL_LABELS.conflict).getByRole("button", { name: /keep my version/i }).click();
    await expect(modalCard(page, MODAL_LABELS.conflict)).toBeHidden();
    await expect.poll(() => diskNote(page)).toContain("MY unsaved edit");
    expect(await activeTabContent(page)).toContain("MY unsaved edit");
  });

  test("'Save mine as a copy' writes a .chrononote-conflicts file, then loads disk", async ({ page }) => {
    await intoConflict(page);
    await modalCard(page, MODAL_LABELS.conflict).getByRole("button", { name: /save mine as a copy/i }).click();
    await expect(modalCard(page, MODAL_LABELS.conflict)).toBeHidden();

    const copies = await page.evaluate(() => window.__CHRONO_MOCK__!.conflictCopyNames());
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatch(/^2026-09-07-\d{6}\.txt$/);
    const copyBody = await page.evaluate(
      (n) => window.__CHRONO_MOCK__!.conflictCopy(n),
      copies[0],
    );
    expect(copyBody).toContain("MY unsaved edit");
    // The tab now shows the disk version.
    await expect.poll(() => activeTabContent(page)).toContain("EXTERNAL edit");
  });
});

test("a note deleted on disk drops the baseline and keeps the tab (save re-creates)", async ({ page }) => {
  await seedApp(page, seed);
  await page.evaluate(() => window.__CHRONO_MOCK__!.deleteNote("2026-09-07.txt"));
  await checkDrift(page);
  await expect(toast(page)).toContainText(/deleted on disk/i);
  expect(await activeTabContent(page)).toContain("original line"); // content untouched
});

test("switching to a tab whose file changed reloads it (activate trigger)", async ({ page }) => {
  await seedApp(page, {
    seed: {
      notes: {
        "2026-09-07.txt": "Today\n=====\n",
        "2026-09-03.txt": "Older\n=====\nv1\n",
      },
      session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-07.txt" },
    },
  });
  await page.evaluate(() => window.__CHRONO_MOCK__!.setNote("2026-09-03.txt", "Older\n=====\nv2 external\n"));
  await page.locator("#tab-bar .tab", { hasText: "2026-09-03.txt" }).click();
  await expect.poll(() => activeTabContent(page)).toContain("v2 external");
});
