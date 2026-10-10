import { test, expect } from "@playwright/test";
import budgets from "./perf-budgets.json" with { type: "json" };
import { seedApp, editor, tab, activeTabLabel, modalCard, MODAL_LABELS } from "./helpers";

interface PerfBudgets {
  startupMs: number;
  tabSwitchMs: number;
  searchAllNotesMs: number;
  actionsDrawerAllFilesMs: number;
  sectionHistoryMs: number;
  typingPerCharMs: number;
  measured?: Record<string, number>;
}

/** The budgets were measured on the maintainer's laptop; GitHub's shared runners are about twice as slow, so CI gets
 * twice the room. A real regression is usually several times slower, so this still catches it. */
const CI_FACTOR = process.env.CI ? 2 : 1;

function loadBudgets(): PerfBudgets {
  const b = budgets as PerfBudgets;
  return {
    startupMs: b.startupMs * CI_FACTOR,
    tabSwitchMs: b.tabSwitchMs * CI_FACTOR,
    searchAllNotesMs: b.searchAllNotesMs * CI_FACTOR,
    actionsDrawerAllFilesMs: b.actionsDrawerAllFilesMs * CI_FACTOR,
    sectionHistoryMs: b.sectionHistoryMs * CI_FACTOR,
    typingPerCharMs: b.typingPerCharMs * CI_FACTOR,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

test.describe("performance budgets at real sizes (2,000 notes, ~5,000-line note)", () => {
  test.use({ viewport: { width: 1100, height: 720 } });

  test("measure startup, tab switch, search, drawers and typing latency", async ({ page }) => {
    test.setTimeout(120_000);
    const budgets = loadBudgets();

    // -----------------------------------------------------------------------
    // 1. Start-up: from page.goto until editor is typeable (.cm-content visible
    // and status bar shows counts).
    // Measured with performance.now() in the page (navigationStart = 0).
    // -----------------------------------------------------------------------
    const startupWallStart = performance.now();
    await seedApp(page, { seed: "perf" });
    await expect(editor(page)).toBeVisible();
    await expect(page.locator("#stat-open .stat-full")).toBeVisible();
    await expect(page.locator("#stat-words")).not.toHaveText("");

    const startupPageMs = await page.evaluate(() => performance.now());
    const startupWallMs = performance.now() - startupWallStart;
    console.log(`[PERF] Start-up: page=${startupPageMs.toFixed(1)}ms, wall=${startupWallMs.toFixed(1)}ms (budget: ${budgets.startupMs}ms)`);
    expect(startupPageMs, "Start-up time exceeded budget").toBeLessThanOrEqual(budgets.startupMs);

    // -----------------------------------------------------------------------
    // 2. Tab switch: to the big note (2026-09-06.txt) and back (median of 5).
    // Measured with wall time around Playwright calls.
    // -----------------------------------------------------------------------
    const tabSwitchRounds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await tab(page, "2026-09-06.txt").click();
      await expect(activeTabLabel(page)).toHaveText("2026-09-06");
      await expect(editor(page)).toBeVisible();

      await tab(page, "2026-09-07.txt").click();
      await expect(activeTabLabel(page)).toHaveText("2026-09-07");
      await expect(editor(page)).toBeVisible();
      const roundMs = performance.now() - t0;
      tabSwitchRounds.push(roundMs);
    }
    const tabSwitchMs = median(tabSwitchRounds);
    console.log(`[PERF] Tab switch (median of 5 rounds): ${tabSwitchMs.toFixed(1)}ms (rounds: ${tabSwitchRounds.map((r) => r.toFixed(1)).join(", ")}) (budget: ${budgets.tabSwitchMs}ms)`);
    expect(tabSwitchMs, "Tab switch time exceeded budget").toBeLessThanOrEqual(budgets.tabSwitchMs);

    // -----------------------------------------------------------------------
    // 3. Search across all notes: Ctrl+Shift+F, type word that occurs often,
    // wait for the first result row.
    // Measured with wall time around Playwright calls.
    // -----------------------------------------------------------------------
    await editor(page).click();
    const searchModal = modalCard(page, MODAL_LABELS.search);
    const searchStart = performance.now();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await expect(searchModal).toBeVisible();
    await searchModal.getByRole("radio", { name: "All Files" }).click();
    await searchModal.locator(".modal-input").fill("Standup");
    await expect(searchModal.locator('.modal-item[role="option"]').first()).toBeVisible();
    const searchAllNotesMs = performance.now() - searchStart;
    console.log(`[PERF] Search across all notes: ${searchAllNotesMs.toFixed(1)}ms (budget: ${budgets.searchAllNotesMs}ms)`);
    await page.keyboard.press("Escape");
    await expect(searchModal).not.toBeVisible();
    expect(searchAllNotesMs, "Search across all notes time exceeded budget").toBeLessThanOrEqual(budgets.searchAllNotesMs);

    // -----------------------------------------------------------------------
    // 4. Actions drawer with "All files" on, and Section history opened on a
    // recurring section (time to first row).
    // Measured with wall time around Playwright calls.
    // -----------------------------------------------------------------------
    // 4a. Actions drawer with "All files" on
    await editor(page).click();
    const actionsDrawer = modalCard(page, MODAL_LABELS.actions);
    const actionsStart = performance.now();
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(actionsDrawer).toBeVisible();
    await actionsDrawer.getByRole("radio", { name: "All Files" }).click();
    await expect(actionsDrawer.locator('.modal-item[role="option"]').first()).toBeVisible();
    const actionsDrawerAllFilesMs = performance.now() - actionsStart;
    console.log(`[PERF] Actions drawer (All files): ${actionsDrawerAllFilesMs.toFixed(1)}ms (budget: ${budgets.actionsDrawerAllFilesMs}ms)`);
    await page.keyboard.press("Escape");
    await expect(actionsDrawer).not.toBeVisible();
    expect(actionsDrawerAllFilesMs, "Actions drawer time exceeded budget").toBeLessThanOrEqual(budgets.actionsDrawerAllFilesMs);

    // 4b. Section history opened on a section that recurs (time to first row)
    // Switch to big note (2026-09-06.txt) where line 0 is "Daily Standup"
    await tab(page, "2026-09-06.txt").click();
    await expect(activeTabLabel(page)).toHaveText("2026-09-06");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    const historyModal = modalCard(page, MODAL_LABELS.history);
    const historyStart = performance.now();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(historyModal).toBeVisible();
    await expect(historyModal.locator(".history-occ-tab").first()).toBeVisible();
    const sectionHistoryMs = performance.now() - historyStart;
    console.log(`[PERF] Section history (Daily Standup): ${sectionHistoryMs.toFixed(1)}ms (budget: ${budgets.sectionHistoryMs}ms)`);
    await page.keyboard.press("Escape");
    await expect(historyModal).not.toBeVisible();
    expect(sectionHistoryMs, "Section history time exceeded budget").toBeLessThanOrEqual(budgets.sectionHistoryMs);

    // -----------------------------------------------------------------------
    // 5. Typing in the big note: 50 characters, time per character (median),
    // measured inside the page.
    // -----------------------------------------------------------------------
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");

    await page.evaluate(() => {
      (window as any).__charLatencies = [];
      const el = document.querySelector(".cm-content");
      if (!el) return;
      let t0 = 0;
      el.addEventListener("keydown", (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key && ke.key.length === 1) {
          t0 = performance.now();
        }
      });
      el.addEventListener("keyup", (e: Event) => {
        const ke = e as KeyboardEvent;
        if (t0 > 0 && ke.key && ke.key.length === 1) {
          (window as any).__charLatencies.push(performance.now() - t0);
          t0 = 0;
        }
      });
    });

    const chars50 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX"; // exactly 50 chars
    for (const char of chars50) {
      await page.keyboard.type(char);
    }

    const charLatencies: number[] = await page.evaluate(() => (window as any).__charLatencies ?? []);
    const typingPerCharMs = median(charLatencies);
    console.log(`[PERF] Typing in big note (50 chars, median): ${typingPerCharMs.toFixed(2)}ms (samples: ${charLatencies.length}) (budget: ${budgets.typingPerCharMs}ms)`);
    expect(charLatencies.length, "Recorded 50 character typing samples").toBeGreaterThanOrEqual(40);
    expect(typingPerCharMs, "Typing latency per character exceeded budget").toBeLessThanOrEqual(budgets.typingPerCharMs);
  });
});
