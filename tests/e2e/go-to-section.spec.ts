import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename, cursorLine, currentModal } from "./helpers";

const NOTE = [
  "Standup",
  "=======",
  "# task 1",
  "# task 2",
  "v task 3",
  "",
  "Retrospective",
  "=============",
  "Just discussion",
].join("\n");

test.describe("go to section (Ctrl/Cmd+G, # in palette)", () => {
  test("Ctrl+G opens palette with # prefilled, lists sections with counts, typing filters, Enter jumps to title line", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: NOTE } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+g");

    const modal = page.locator(".modal-card");
    await expect(modal).toBeVisible();

    const input = modal.locator(".modal-input");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("#");

    // Check sections list
    const items = modal.locator(".modal-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Standup");
    await expect(items.nth(0).locator(".item-tag")).toHaveText("☐ 2");
    await expect(items.nth(1)).toContainText("Retrospective");
    await expect(items.nth(1).locator(".item-tag")).toHaveCount(0);

    // Typing filters the list
    await page.keyboard.type("retro");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Retrospective");

    // Enter jumps to the title line
    await page.keyboard.press("Enter");
    await expect(modal).toBeHidden();
    expect(await currentModal(page)).toBe("none");

    // Retrospective title is on line 7
    await expect.poll(() => cursorLine(page)).toBe(7);
  });

  test("# typed in Ctrl+K gives the same section list", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: NOTE } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");

    const modal = page.locator(".modal-card");
    await expect(modal).toBeVisible();

    await page.keyboard.type("#");
    const items = modal.locator(".modal-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Standup");
    await expect(items.nth(0).locator(".item-tag")).toHaveText("☐ 2");
    await expect(items.nth(1)).toContainText("Retrospective");
  });

  test("empty note or note with no sections shows 'No sections in this note'", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "plain text\nno setext headers\n# an action" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+g");

    const modal = page.locator(".modal-card");
    await expect(modal).toBeVisible();

    const items = modal.locator(".modal-item");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("No sections in this note");
    await expect(items.first()).toHaveClass(/muted-row/);
  });
});
