import { test, expect } from "@playwright/test";
import {
  seedApp,
  modalCard,
  MODAL_LABELS,
  openViaShortcut,
  parkMouse,
} from "./helpers";

test.describe("saved searches", () => {
  test("save, apply from chip, launch from command palette, and remove via right-click", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });

    // 1. Open Search (Ctrl+Shift+F), type is:open, click "Save this search"
    const searchModal = await openViaShortcut(page, "ControlOrMeta+Shift+F", "search");
    const searchInput = searchModal.locator('input[type="text"], input[type="search"], input:not([type])').first();
    await searchInput.fill("is:open");

    const saveBtn = searchModal.getByRole("button", { name: "Save this search" });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    const chip = searchModal.getByRole("button", { name: "Saved search: is:open", exact: true });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(searchModal.locator(".search-chips-row")).toHaveCount(1);
    await expect(searchModal.getByRole("button", { name: "Remove saved search: is:open" })).toBeVisible();
    await expect(searchModal.getByRole("button", { name: "Remove from saved searches" })).toBeVisible();

    // 2. Clear the input and click the chip: the input reads is:open
    await searchInput.fill("");
    await expect(searchInput).toHaveValue("");
    await chip.click();
    await expect(searchInput).toHaveValue("is:open");

    // 3. Close Search, open the palette, type is:op, choose the Saved searches row
    await page.keyboard.press("Escape");
    await expect(searchModal).toBeHidden();

    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+k");
    const palette = modalCard(page, MODAL_LABELS.commandPalette);
    await expect(palette).toBeVisible();

    await palette.locator(".modal-input").fill("is:op");
    const groupHeading = palette.getByText(/^Saved searches$/i).first();
    await expect(groupHeading).toBeVisible();

    const savedRow = palette.locator('.modal-item[role="option"]', { hasText: "is:open" }).first();
    await expect(savedRow).toBeVisible();

    const groupBox = await groupHeading.boundingBox();
    const rowBox = await savedRow.boundingBox();
    expect(groupBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.y).toBeGreaterThanOrEqual(groupBox!.y);

    await savedRow.click();
    await expect(searchModal).toBeVisible();
    await expect(searchInput).toHaveValue("is:open");

    // The scope's "all notes" option is labelled "All" since U1 (§482); the brief said "All files".
    const allFilesBtn = searchModal
      .getByRole("button", { name: /^All( files)?$/i })
      .or(searchModal.getByRole("radio", { name: /^All( files)?$/i }))
      .or(searchModal.getByRole("tab", { name: /^All( files)?$/i }))
      .first();
    await expect(allFilesBtn).toBeVisible();
    await expect
      .poll(async () =>
        allFilesBtn.evaluate((el) => {
          const ariaPressed = el.getAttribute("aria-pressed");
          const ariaSelected = el.getAttribute("aria-selected");
          const ariaChecked = el.getAttribute("aria-checked");
          return (
            ariaPressed === "true" ||
            ariaSelected === "true" ||
            ariaChecked === "true" ||
            el.classList.contains("active") ||
            el.classList.contains("selected")
          );
        }),
      )
      .toBe(true);

    // 4. Right-click the chip: it disappears
    const reopenedChip = searchModal.getByRole("button", { name: "Saved search: is:open", exact: true });
    await expect(reopenedChip).toBeVisible();
    await reopenedChip.click({ button: "right" });
    await expect(reopenedChip).toBeHidden();
  });
});
