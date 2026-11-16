import { test, expect } from "@playwright/test";
import {
  activeTabContent,
  editor,
  mockNote,
  modalCard,
  seedApp,
  toast,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

const TODAY = `${REFERENCE_TODAY}.txt`;
const YESTERDAY = "2026-09-06.txt";
const TOMORROW = "2026-09-08.txt";

const YESTERDAY_TEXT = "Coffee rota\n===========\n# ask @dana\n";
const TODAY_TEXT = "Coffee rota\n===========\n# bring milk\n";
const TOMORROW_TEXT = "Coffee rota\n===========\n# tomorrow task\n";

test.describe("rename everywhere", () => {
  test("skips future titles, honours unticked notes, supports Ctrl+Z, and undoes via toast", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [YESTERDAY]: YESTERDAY_TEXT,
          [TODAY]: TODAY_TEXT,
          [TOMORROW]: TOMORROW_TEXT,
        },
        session: {
          openTabs: [TODAY],
          activeTab: TODAY,
        },
      },
    });

    // Right-click the title in today's note and choose "Rename everywhere…".
    await editor(page).locator(".cm-line").first().click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Rename everywhere…" }).click();

    const dialog = modalCard(page, "Rename everywhere");
    await expect(dialog).toBeVisible();

    const toInput = dialog.getByLabel("To");
    await expect(toInput).toBeFocused();
    await toInput.fill("Hospitality rota");

    // Tomorrow's note is left alone: only 2 notes appear in the preview.
    await expect(dialog.locator(".rename-summary")).toHaveText("2 lines in 2 notes");

    // Untick yesterday's note, leaving today ticked.
    const yesterdayRow = dialog.locator(".rename-row", { hasText: "2026-09-06" });
    await yesterdayRow.locator('input[type="checkbox"]').uncheck();

    const confirmBtn = dialog.getByRole("button", { name: "Rename in 1 note" });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(dialog).toBeHidden();

    // Today's note shows the new title; unticked and tomorrow notes are unchanged.
    await expect(editor(page)).toContainText("Hospitality rota");
    await expect.poll(() => activeTabContent(page)).toBe("Hospitality rota\n================\n# bring milk\n");
    await expect.poll(() => mockNote(page, TODAY)).toBe("Hospitality rota\n================\n# bring milk\n");
    expect(await mockNote(page, YESTERDAY)).toBe(YESTERDAY_TEXT);
    expect(await mockNote(page, TOMORROW)).toBe(TOMORROW_TEXT);

    await expect(toast(page)).toContainText("Renamed in 1 note. Click to undo.");

    // Ctrl+Z brings the old title back in one undo step, and Ctrl+Shift+Z redoes it.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => activeTabContent(page)).toBe(TODAY_TEXT);

    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => activeTabContent(page)).toBe("Hospitality rota\n================\n# bring milk\n");
    await expect.poll(() => mockNote(page, TODAY)).toBe("Hospitality rota\n================\n# bring milk\n");

    // Clicking the toast undoes the rename in the note that was renamed.
    await toast(page).click();
    await expect(toast(page)).toContainText("Undone in 1 note.");
    await expect.poll(() => activeTabContent(page)).toBe(TODAY_TEXT);
    await expect.poll(() => mockNote(page, TODAY)).toBe(TODAY_TEXT);
    expect(await mockNote(page, YESTERDAY)).toBe(YESTERDAY_TEXT);
    expect(await mockNote(page, TOMORROW)).toBe(TOMORROW_TEXT);
  });

  test("toast click undoes a multi-note rename immediately without editor undo", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [YESTERDAY]: YESTERDAY_TEXT,
          [TODAY]: TODAY_TEXT,
          [TOMORROW]: TOMORROW_TEXT,
        },
        session: {
          openTabs: [TODAY],
          activeTab: TODAY,
        },
      },
    });

    await editor(page).locator(".cm-line").first().click({ button: "right" });
    await page.locator(".editor-context-menu").getByRole("menuitem", { name: "Rename everywhere…" }).click();

    const dialog = modalCard(page, "Rename everywhere");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("To").fill("Hospitality rota");
    await expect(dialog.locator(".rename-summary")).toHaveText("2 lines in 2 notes");

    await dialog.getByRole("button", { name: "Rename in 2 notes" }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => mockNote(page, TODAY)).toBe("Hospitality rota\n================\n# bring milk\n");
    await expect.poll(() => mockNote(page, YESTERDAY)).toBe("Hospitality rota\n================\n# ask @dana\n");
    expect(await mockNote(page, TOMORROW)).toBe(TOMORROW_TEXT);

    await toast(page).click();
    await expect(toast(page)).toContainText("Undone in 2 notes.");
    await expect.poll(() => mockNote(page, TODAY)).toBe(TODAY_TEXT);
    await expect.poll(() => mockNote(page, YESTERDAY)).toBe(YESTERDAY_TEXT);
  });
});
