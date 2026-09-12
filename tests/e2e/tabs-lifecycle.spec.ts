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
} from "./helpers";

test.describe("tabs — lifecycle & safe close", () => {
  test("Ctrl+N creates a scratchpad, Ctrl+W closes an empty one with no prompt", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+n");
    await expect(activeTabLabel(page)).toHaveText("Scratchpad 1");

    await page.keyboard.press("ControlOrMeta+w");
    await expect(tab(page, "Scratchpad 1")).toHaveCount(0);
    await expect(activeTabLabel(page)).toHaveText(new RegExp(dateLabel(todayFilename())));
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

  test("Ctrl+Shift+T reopens the last closed tab", async ({ page }) => {
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

  test("Ctrl+Tab cycles tabs in display order", async ({ page }) => {
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
