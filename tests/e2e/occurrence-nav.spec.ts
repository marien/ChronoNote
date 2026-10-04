import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, tab, activeTabLabel, mockNote } from "./helpers";

/** Alt+Left / Alt+Right between the occurrences of the section the cursor is in (always on), and the experimental
 * "< (X/Y) >" hint after the section title (off by default). Every test seeds the app exactly once. */
const note = (extra: string, solo = "") =>
  ["Standup", "=======", "# one", "", "Weekly sync", "===========", "o budget", extra, "", "Other", "=====", "x elsewhere", solo].join(
    "\n",
  );

async function seed(page: Page, opts: { hint?: boolean; openTabs?: string[] } = {}) {
  await seedApp(page, {
    seed: {
      notes: {
        "2026-09-01.txt": note("- last month"),
        "2026-09-07.txt": note("- today", "\nSolo\n====\nonly here"),
        "2026-09-10.txt": note("- next week"),
      },
      session: { openTabs: opts.openTabs ?? ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      occurrenceHint: opts.hint ?? false,
    },
  });
}

/** Puts the caret on 0-based `line` of the active note. */
async function goToLine(page: Page, line: number) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
}

const BODY = 6; // "o budget" in Weekly sync
const TITLE = 4; // "Weekly sync"
const SOLO_BODY = 15; // "only here", a section that exists only in 09-07

test.describe("Alt+Left / Alt+Right between the occurrences of a section", () => {
  test.beforeEach(async ({ page }) => seed(page));

  test("Alt+Left shows the previous occurrence, Alt+Right the next one", async ({ page }) => {
    await goToLine(page, BODY);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
    await expect(editor(page)).toContainText("last month");
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Alt+ArrowRight");
    await expect(activeTabLabel(page)).toContainText("2026-09-10");
    await expect(editor(page)).toContainText("next week");
  });

  test("it works on the title line too", async ({ page }) => {
    await goToLine(page, TITLE);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
  });

  test("it works on the underline, and the tabs stay open (no clean-up like Peek has)", async ({ page }) => {
    await goToLine(page, TITLE + 1);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
    await expect(tab(page, "2026-09-07.txt")).toHaveCount(1);
    await expect(tab(page, "2026-09-01.txt")).toHaveCount(1);
  });

  test("at the last occurrence nothing happens", async ({ page }) => {
    await goToLine(page, BODY);
    await page.keyboard.press("Alt+ArrowRight");
    await expect(activeTabLabel(page)).toContainText("2026-09-10");
    await page.keyboard.press("Alt+ArrowRight");
    await expect(activeTabLabel(page)).toContainText("2026-09-10");
  });

  test("a section that occurs only once leaves the key alone", async ({ page }) => {
    await goToLine(page, SOLO_BODY);
    await expect(page.locator("#stat-pos")).toContainText("16");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(activeTabLabel(page)).toContainText("2026-09-07");
  });

  test("Shift+Alt+Arrow (select by syntax) and Alt+Down (move line) are not taken", async ({ page }) => {
    await goToLine(page, BODY);
    await page.keyboard.press("Shift+Alt+ArrowLeft");
    await expect(activeTabLabel(page)).toContainText("2026-09-07");
    await page.keyboard.press("Alt+ArrowDown");
    await expect(activeTabLabel(page)).toContainText("2026-09-07");
  });

  test("with the setting off the editor shows no hint", async ({ page }) => {
    await goToLine(page, BODY);
    await expect(page.locator(".occ-hint")).toHaveCount(0);
  });
});

test.describe("the < (X/Y) > hint after the section title (experimental)", () => {
  test.beforeEach(async ({ page }) => seed(page, { hint: true }));

  test("shows the position on the title line of the section the caret is in", async ({ page }) => {
    await goToLine(page, BODY);
    await expect(page.locator(".occ-hint")).toHaveCount(1);
    await expect(page.locator(".occ-hint")).toContainText("(2/3)");
    const line = editor(page).locator(".cm-line", { hasText: "Weekly sync" }).first();
    await expect(line.locator(".occ-hint")).toHaveCount(1);
  });

  test("is not part of the note and is hidden while the caret is on the title line", async ({ page }) => {
    await goToLine(page, BODY);
    await expect(page.locator(".occ-hint")).toHaveCount(1);
    await page.keyboard.press("ArrowUp"); // underline
    await page.keyboard.press("ArrowUp"); // title line
    await expect(page.locator(".occ-hint")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".occ-hint")).toHaveCount(1);
    expect(await mockNote(page, "2026-09-07.txt")).not.toContain("(2/3)");
  });

  test("the arrows go to the previous / next occurrence; the first and last arrow are dimmed", async ({ page }) => {
    await goToLine(page, BODY);
    const hint = page.locator(".occ-hint");
    await hint.locator(".occ-hint-btn").first().click();
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
    await goToLine(page, BODY);
    await expect(hint).toContainText("(1/3)");
    await expect(hint.locator(".occ-hint-btn").first()).toHaveClass(/\boff\b/);
    await hint.locator(".occ-hint-btn").last().click();
    await goToLine(page, BODY);
    await hint.locator(".occ-hint-btn").last().click();
    await expect(activeTabLabel(page)).toContainText("2026-09-10");
    await goToLine(page, BODY);
    await expect(hint).toContainText("(3/3)");
    await expect(hint.locator(".occ-hint-btn").last()).toHaveClass(/\boff\b/);
  });

  test("a section that occurs only once gets no hint", async ({ page }) => {
    await goToLine(page, SOLO_BODY);
    await expect(page.locator("#stat-pos")).toContainText("16");
    await expect(page.locator(".occ-hint")).toHaveCount(0);
  });

  test("the shortcut keeps working with the hint on", async ({ page }) => {
    await goToLine(page, BODY);
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(activeTabLabel(page)).toContainText("2026-09-01");
    await expect(page.locator(".occ-hint")).toContainText("(1/3)");
  });
});

test.describe("the setting", () => {
  test("is off by default, can be switched on in Settings, is saved and shows the hint at once", async ({ page }) => {
    await seed(page);
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.occurrenceHint)).toBe(false);
    await goToLine(page, BODY);
    await page.keyboard.press("ControlOrMeta+Comma");
    const settings = page.locator(".settings-modal-card");
    await expect(settings).toBeVisible();
    await settings.locator("label.toggle-switch", { hasText: "occurrence hint" }).click();
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.occurrenceHint)).toBe(true);
    await page.keyboard.press("Escape");
    await goToLine(page, BODY);
    await expect(page.locator(".occ-hint")).toContainText("(2/3)");
    await page.reload();
    await goToLine(page, BODY);
    await expect(page.locator(".occ-hint")).toHaveCount(1);
  });
});
