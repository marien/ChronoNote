import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, todayFilename } from "./helpers";

const search = (page: Page) => modalCard(page, MODAL_LABELS.search);
const palette = (page: Page) => modalCard(page, MODAL_LABELS.commandPalette);

test.describe("saved searches", () => {
  test("save with star, click chip, launch from palette, and remove with right-click", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "# open task\nv done task",
        },
      },
    });

    // 1. Open Search, type is:open, click "Save this search", and see a chip is:open.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+F");
    await expect(search(page)).toBeVisible();

    const searchInput = search(page).locator(".modal-input");
    await searchInput.fill("is:open");
    await search(page).getByRole("button", { name: "Save this search" }).click();

    const savedRow = search(page).locator('[aria-label="Saved searches"]');
    const savedChip = savedRow.locator(".search-chip", { hasText: "is:open" });
    await expect(savedChip).toBeVisible();
    await expect(savedChip).toHaveClass(/\bselected\b/);
    await expect(search(page).locator(".search-chips-row")).toHaveCount(1);
    await expect(savedChip.locator(".saved-search-remove-btn")).toBeVisible();

    // 2. Clear the input, click the chip: the input reads is:open and the chip becomes selected again.
    await searchInput.fill("");
    await expect(searchInput).toHaveValue("");
    await expect(savedChip).not.toHaveClass(/\bselected\b/);
    await savedChip.locator(".saved-search-run-btn").click();
    await expect(searchInput).toHaveValue("is:open");
    await expect(savedChip).toHaveClass(/\bselected\b/);

    // 3. Close Search. Open the palette, type is:op, choose the "Saved searches" row:
    // Search opens with is:open on "All files".
    await page.keyboard.press("Escape");
    await expect(search(page)).toBeHidden();

    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    await palette(page).locator(".modal-input").fill("is:op");
    const row = palette(page).locator('.modal-item[role="option"]', { hasText: "is:open" }).first();
    await expect(row).toBeVisible();
    await row.click();

    await expect(search(page)).toBeVisible();
    await expect(search(page).locator(".modal-input")).toHaveValue("is:open");
    await expect(search(page).getByRole("radio", { name: "All", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // 4. Right-click or click × on the selected chip: it disappears.
    const reopenedChip = search(page).locator('[aria-label="Saved searches"] .search-chip', { hasText: "is:open" });
    await expect(reopenedChip).toBeVisible();
    await expect(search(page).locator(".search-chips-row")).toHaveCount(1);
    await reopenedChip.locator(".saved-search-remove-btn").click();
    await expect(reopenedChip).toBeHidden();

    // 5. Save again, focus the chip with Tab, and press Delete: it disappears.
    await search(page).getByRole("button", { name: "Save this search" }).click();
    await expect(reopenedChip).toBeVisible();
    const runBtn = reopenedChip.locator(".saved-search-run-btn");
    await runBtn.focus();
    await expect(runBtn).toBeFocused();
    await page.keyboard.press("Delete");
    await expect(reopenedChip).toBeHidden();
  });
});
