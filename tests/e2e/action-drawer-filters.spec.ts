import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
  todayFilename,
} from "./helpers";

const drawer = (page: Page) => modalCard(page, MODAL_LABELS.actions);
const rows = (d: Locator) => d.locator('.modal-item[role="option"]');
const filterInput = (d: Locator) => d.locator(".modal-input");
const chips = (d: Locator) => d.locator(".search-chip");

test.describe("Action drawer filters & chips", () => {
  const seedNotes = {
    [todayFilename()]: [
      "# (budget) Review quarterly spend",
      "# (infra) Upgrade database cluster",
      "v (budget) Settle office invoice",
      "# Plan sprint",
    ].join("\n"),
  };

  test("typing tag:budget shows a chip, filters actions, and removing chip restores list while keeping focus", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const input = filterInput(d);

    // Initial state: 3 open actions (the 'v' line is hidden by default 'Only open')
    await expect(rows(d)).toHaveCount(3);
    await expect(chips(d)).toHaveCount(0);

    // Type operator
    await input.fill("tag:budget");
    await expect(chips(d)).toHaveCount(1);
    await expect(chips(d).first()).toContainText("tag:budget");

    // Only 1 open action with tag:budget
    await expect(rows(d)).toHaveCount(1);
    await expect(rows(d).first()).toContainText("Review quarterly spend");

    // Removing chip restores the list and preserves focus in input
    const removeBtn = chips(d).first().locator(".chip-remove-btn");
    await removeBtn.click();

    await expect(chips(d)).toHaveCount(0);
    await expect(rows(d)).toHaveCount(3);
    await expect(input).toBeFocused();
  });

  test("is:done lists done actions although Only open is on, and shows Only open toggle as disabled with tooltip", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const input = filterInput(d);
    const onlyOpenToggle = d.locator(".toggle-switch").filter({ hasText: /only open/i });
    const onlyOpenCheckbox = onlyOpenToggle.locator('input[type="checkbox"]');

    // Only open is on by default and enabled
    await expect(onlyOpenCheckbox).toBeChecked();
    await expect(onlyOpenCheckbox).toBeEnabled();

    // Type is:done
    await input.fill("is:done");
    await expect(chips(d)).toHaveCount(1);
    await expect(chips(d).first()).toContainText("is:done");

    // Toggle is disabled with tooltip "Set by is: in the filter"
    await expect(onlyOpenCheckbox).toBeDisabled();
    await expect(onlyOpenToggle).toHaveAttribute("title", "Set by is: in the filter");
    // Stored value remains checked
    await expect(onlyOpenCheckbox).toBeChecked();

    // Lists the done action
    await expect(rows(d)).toHaveCount(1);
    await expect(rows(d).first()).toContainText("Settle office invoice");

    // Removing is:done restores Only open toggle
    await chips(d).first().locator(".chip-remove-btn").click();
    await expect(onlyOpenCheckbox).toBeEnabled();
    await expect(onlyOpenCheckbox).toBeChecked();
    await expect(rows(d)).toHaveCount(3);
  });

  test("chips row works in docked pane (desktop)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await page.keyboard.press("ControlOrMeta+Shift+A");
    const pane = page.locator(".actions-pane");
    await expect(pane).toBeVisible();

    const input = pane.locator(".modal-input");
    await input.fill("tag:infra");

    const paneChips = pane.locator(".search-chip");
    await expect(paneChips).toHaveCount(1);
    await expect(paneChips.first()).toContainText("tag:infra");
    await expect(pane.locator('.modal-item[role="option"]')).toHaveCount(1);
    await expect(pane).toContainText("Upgrade database cluster");

    // Remove chip in docked pane
    await paneChips.first().locator(".chip-remove-btn").click();
    await expect(paneChips).toHaveCount(0);
    await expect(pane.locator('.modal-item[role="option"]')).toHaveCount(3);
    await expect(input).toBeFocused();
  });

  test("chips row works on mobile ($isMobile)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const input = filterInput(d);

    await input.fill("tag:budget");
    await expect(chips(d)).toHaveCount(1);
    await expect(rows(d)).toHaveCount(1);

    await chips(d).first().locator(".chip-remove-btn").click();
    await expect(chips(d)).toHaveCount(0);
    await expect(rows(d)).toHaveCount(3);
  });
});
