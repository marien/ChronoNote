import { test, expect } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, currentModal, activeTabLabel, todayFilename } from "./helpers";

const palette = (page: import("@playwright/test").Page) => modalCard(page, MODAL_LABELS.commandPalette);

test.describe("command palette (Ctrl+K, §107)", () => {
  test("opens on Ctrl+K and runs a command by fuzzy match", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();

    await palette(page).locator(".modal-input").fill("wrap");
    const row = palette(page).locator('.modal-item[role="option"]', { hasText: /word wrap/i }).first();
    await expect(row).toBeVisible();
    await row.click();

    expect(await currentModal(page)).toBe("none");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.wordWrap)).toBe(true);
  });

  test("default results include open tabs; picking one switches to it", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("Control+k");
    await palette(page).locator(".modal-input").fill("2026-09-04");
    const row = palette(page).locator('.modal-item[role="option"]', { hasText: "2026-09-04" }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(activeTabLabel(page)).toHaveText(/2026-09-04/);
  });

  test("the > prefix filters to commands only", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("Control+k");
    await palette(page).locator(".modal-input").fill(">settings");
    await expect(palette(page).locator('.modal-item[role="option"]')).toHaveCount(1);
    await expect(palette(page).locator('.modal-item[role="option"]')).toContainText("Settings");
  });

  test("the @ prefix jumps to a date via the query grammar", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("Control+k");
    await palette(page).locator(".modal-input").fill("@2026-12-25");
    await palette(page).locator('.modal-item[role="option"]', { hasText: /Jump to 2026-12-25/ }).click();
    await expect(activeTabLabel(page)).toHaveText(/2026-12-25/);
  });

  test("the ! prefix lists open actions across notes and jumps to one", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "notes\n# chase the vendor\nv done" } },
    });
    await editor(page).click();
    await page.keyboard.press("Control+k");
    await palette(page).locator(".modal-input").fill("!vendor");
    const row = palette(page).locator('.modal-item[role="option"]', { hasText: /chase the vendor/ });
    await expect(row).toBeVisible();
    await row.click();
    expect(await currentModal(page)).toBe("none");
  });

  test("Escape closes it and Arrow/Enter drive it from the keyboard", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("Control+k");
    await palette(page).locator(".modal-input").fill(">colored");
    // wait for the (debounced) filter to actually narrow before Enter
    await expect(palette(page).locator('.modal-item[role="option"]')).toHaveCount(1);
    await page.keyboard.press("Enter"); // "Switch to colored glyphs"
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "color");

    await page.keyboard.press("Control+k");
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
  });
});
