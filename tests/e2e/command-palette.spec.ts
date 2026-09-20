import { test, expect } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, currentModal, activeTabLabel, todayFilename, activeTabContent } from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

const palette = (page: import("@playwright/test").Page) => modalCard(page, MODAL_LABELS.commandPalette);

test.describe("command palette (Ctrl/Cmd+K, §107)", () => {
  test("opens on Ctrl/Cmd+K and runs a command by fuzzy match", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
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
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill("2026-09-04");
    const row = palette(page).locator('.modal-item[role="option"]', { hasText: "2026-09-04" }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(activeTabLabel(page)).toHaveText(/2026-09-04/);
  });

  test("the > prefix filters to commands only", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill(">settings");
    await expect(palette(page).locator('.modal-item[role="option"]')).toHaveCount(1);
    await expect(palette(page).locator('.modal-item[role="option"]')).toContainText("Settings");
  });

  test("the @ prefix jumps to a date via the query grammar", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill("@2026-12-25");
    await palette(page).locator('.modal-item[role="option"]', { hasText: /Jump to 2026-12-25/ }).click();
    await expect(activeTabLabel(page)).toHaveText(/2026-12-25/);
  });

  test("the ! prefix lists open actions across notes and jumps to one", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "notes\n# chase the vendor\nv done" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill("!vendor");
    const row = palette(page).locator('.modal-item[role="option"]', { hasText: /chase the vendor/ });
    await expect(row).toBeVisible();
    await row.click();
    expect(await currentModal(page)).toBe("none");
  });

  test("Escape closes it and Arrow/Enter drive it from the keyboard", async ({ page }) => {
    // Explicit starting mode — the palette's colour command's label names
    // the *next* mode in the grayscale → color → legacy cycle, so this
    // test (which searches for "colored" specifically) needs to start
    // from grayscale regardless of the app's own default.
    await seedApp(page, { seed: { ...scenario("busy-week"), colorMode: "grayscale" } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill(">colored");
    // wait for the (debounced) filter to actually narrow before Enter
    await expect(palette(page).locator('.modal-item[role="option"]')).toHaveCount(1);
    await page.keyboard.press("Enter"); // "Switch to colored glyphs"
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "color");

    // §111: the palette command cycles grayscale → color → legacy → …
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill(">legacy glyphs");
    await expect(palette(page).locator('.modal-item[role="option"]')).toHaveCount(1);
    await page.keyboard.press("Enter"); // "Switch to legacy glyphs (…)"
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "legacy");

    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
  });

  test("renders .palette-match elements for matched query characters", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill(">wrap");

    const matchEl = palette(page).locator(".palette-match").first();
    await expect(matchEl).toBeVisible();
    await expect(matchEl).toHaveText(/w|r|a|p/i);
  });

  test("Current line commands act on pre-palette selection and restore focus (Decision 2)", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "First line\n# Action on second line\nThird line" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    // Navigate caret to second line
    await page.keyboard.press("ArrowDown");

    // Open palette with Ctrl+K
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();

    // Palette first item is NOT the line command — filter for it
    await palette(page).locator(".modal-input").fill(">close open action");
    const option = palette(page).locator('.modal-item[role="option"]', { hasText: /Close open action on current line/ });
    await expect(option).toBeVisible();
    await option.click();

    // Second line should now be closed 'v', first and third untouched
    expect(await currentModal(page)).toBe("none");
    const text = await activeTabContent(page);
    expect(text).toBe("First line\nv Action on second line\nThird line");
  });

  test("Current line command applies to a multi-line selection", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "# Item 1\n# Item 2\n# Item 3" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    // Select first two lines using Shift+Down
    await page.keyboard.press("Shift+ArrowDown");

    // Open palette and run Won't-Do
    await page.keyboard.press("ControlOrMeta+k");
    await palette(page).locator(".modal-input").fill(">won't-do");
    await palette(page).locator('.modal-item[role="option"]', { hasText: /Won't-Do/ }).click();

    expect(await currentModal(page)).toBe("none");
    const text = await activeTabContent(page);
    expect(text).toBe("x Item 1\nx Item 2\n# Item 3");
  });
});
