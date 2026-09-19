import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  typeInEditor,
  tab,
  activeTabLabel,
  todayFilename,
  currentModal,
  modalCard,
  MODAL_LABELS,
  activeTabContent,
  tabLabels,
  dateLabel,
  mockFiles,
  mockNote,
} from "./helpers";

test.describe("tabs — lifecycle & safe close", () => {
  test("Ctrl/Cmd+N creates a scratchpad, Ctrl/Cmd+W closes an empty one with no prompt", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+n");
    await expect(activeTabLabel(page)).toHaveText("Scratchpad 1");

    await page.keyboard.press("ControlOrMeta+w");
    await expect(tab(page, "Scratchpad 1")).toHaveCount(0);
    await expect(activeTabLabel(page)).toHaveText(new RegExp(dateLabel(todayFilename())));
  });

  test("#63: closing a dated tab that was never actually written into deletes nothing new (no file existed)", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await editor(page).click();
    // Ctrl+O to a date that has no note yet — the tab is opened, empty,
    // but nothing has ever been saved for it.
    await page.keyboard.press("ControlOrMeta+o");
    await page.locator(".datepicker-jump").fill("2026-09-20");
    await page.keyboard.press("Enter");
    await expect(activeTabLabel(page)).toHaveText("2026-09-20");

    await page.keyboard.press("ControlOrMeta+w");
    expect(await mockFiles(page)).not.toContain("2026-09-20.txt");
  });

  test("#63: fully clearing a note's content, then closing the tab, deletes the file from disk", async ({ page }) => {
    await seedApp(page, { seed: { notes: { "2026-09-01.txt": "some real content" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+o");
    await page.locator(".datepicker-jump").fill("2026-09-01");
    await page.keyboard.press("Enter");
    await expect(activeTabLabel(page)).toHaveText("2026-09-01");
    expect(await mockNote(page, "2026-09-01.txt")).toBe("some real content");

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    expect(await activeTabContent(page)).toBe("");

    await page.keyboard.press("ControlOrMeta+w");
    expect(await mockNote(page, "2026-09-01.txt")).toBeNull();
    expect(await mockFiles(page)).not.toContain("2026-09-01.txt");
  });

  test("closing a tab with unresolved open actions prompts, and Cancel keeps it", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await typeInEditor(page, "# an unresolved task");

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");

    const warn = modalCard(page, MODAL_LABELS.safety);
    await expect(warn).toBeVisible();
    await expect(warn).toContainText("unresolved open action");

    await warn.getByRole("button", { name: "Cancel" }).click();
    await expect(activeTabLabel(page)).toHaveText(new RegExp(dateLabel(todayFilename())));
    expect(await currentModal(page)).toBe("none");
  });

  test("'Close Anyway' on the warning actually closes the tab", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.keyboard.press("ControlOrMeta+n");
    await typeInEditor(page, "scratch content that would be lost");

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");
    const warn = modalCard(page, MODAL_LABELS.safety);
    await expect(warn).toContainText("permanently discard");
    await warn.getByRole("button", { name: "Close Anyway" }).click();

    await expect(tab(page, "Scratchpad 1")).toHaveCount(0);
  });

  test("Ctrl/Cmd+Shift+T reopens the last closed tab", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });

    const labels = await tabLabels(page);
    const victim = labels.find((l) => !l.includes(dateLabel(todayFilename())))!;
    await tab(page, victim).locator(".tab-close").click();

    // A dated tab with unresolved `# ` actions asks first — confirm it.
    const warn = modalCard(page, MODAL_LABELS.safety);
    if (await warn.isVisible().catch(() => false)) {
      await warn.getByRole("button", { name: "Close Anyway" }).click();
    }
    await expect(tab(page, victim)).toHaveCount(0);

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+T");
    await expect(tab(page, victim)).toHaveCount(1);
  });

  test("Ctrl/Cmd+Tab cycles tabs in display order", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const first = await activeTabLabel(page).textContent();

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Tab");
    const second = await activeTabLabel(page).textContent();
    expect(second).not.toBe(first);

    await page.keyboard.press("ControlOrMeta+Shift+Tab");
    await expect(activeTabLabel(page)).toHaveText(first!);
  });

  test("closing the last remaining tab spawns a fresh scratchpad", async ({ page }) => {
    await seedApp(page, { seed: "single-day" });

    // Close every tab (single-day scenario has just today, no open actions
    // are guaranteed — if the warning shows, confirm it).
    for (let i = 0; i < 6; i++) {
      const tabs = page.locator("#tab-bar .tab");
      if ((await tabs.count()) === 0) break;
      await tabs.first().locator(".tab-close").click();
      const warn = modalCard(page, MODAL_LABELS.safety);
      if (await warn.isVisible().catch(() => false)) {
        await warn.getByRole("button", { name: "Close Anyway" }).click();
      }
    }
    // Never zero tabs — a scratchpad backfills.
    await expect(page.locator("#tab-bar .tab")).toHaveCount(1);
    await expect(activeTabLabel(page)).toHaveText(/Scratchpad/);
    expect(await activeTabContent(page)).toBe("");
  });
});

/** #76: the unresolved-actions warning is for notes that are due — today and
 * earlier. A future-dated note's actions are still ahead of you, so it
 * closes silently. (The e2e clock is pinned to 2026-09-07.) */
test.describe("close warning by date (#76)", () => {
  const note = (filename: string) => ({
    seed: {
      notes: { [filename]: "# something to do" },
      session: { openTabs: [filename], activeTab: filename },
    },
  });

  test("a future-dated note with open actions closes without asking", async ({ page }) => {
    await seedApp(page, note("2026-12-01.txt"));
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");
    expect(await currentModal(page)).toBe("none");
    await expect(tab(page, "2026-12-01")).toHaveCount(0);
  });

  test("a note from the past with open actions still asks", async ({ page }) => {
    await seedApp(page, note("2026-08-01.txt"));
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");
    await expect(modalCard(page, MODAL_LABELS.safety)).toContainText("unresolved open action");
  });
});
