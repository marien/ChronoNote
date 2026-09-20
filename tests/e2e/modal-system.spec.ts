import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  openViaShortcut,
  currentModal,
  MODAL_LABELS,
  todayFilename,
} from "./helpers";

test.describe("modal system modernization (Area 5.1 & 5.3)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "single-day" });
  });

  test("modal sizing scale applies semantic 4-tier classes (.modal-sm, .modal-md, .modal-lg, .modal-xl)", async ({ page }) => {
    // 1. AboutModal uses .modal-sm (440px max)
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    await expect(about).toHaveClass(/\bmodal-sm\b/);
    const aboutWidth = await about.evaluate((el) => window.getComputedStyle(el).width);
    expect(parseFloat(aboutWidth)).toBeLessThanOrEqual(440);
    await page.keyboard.press("Escape");

    // 2. SettingsModal uses .modal-md (560px max)
    const settings = await openViaShortcut(page, "ControlOrMeta+,", "settings");
    await expect(settings).toHaveClass(/\bmodal-md\b/);
    const settingsWidth = await settings.evaluate((el) => window.getComputedStyle(el).width);
    expect(parseFloat(settingsWidth)).toBeLessThanOrEqual(560);
    await page.keyboard.press("Escape");

    // 3. SearchModal uses .modal-lg (720px max)
    const search = await openViaShortcut(page, "ControlOrMeta+Shift+f", "search");
    await expect(search).toHaveClass(/\bmodal-lg\b/);
    const searchWidth = await search.evaluate((el) => window.getComputedStyle(el).width);
    expect(parseFloat(searchWidth)).toBeLessThanOrEqual(720);
    await page.keyboard.press("Escape");

    // 4. ShortcutsModal uses .modal-xl (880px max)
    const shortcuts = await openViaShortcut(page, "ControlOrMeta+/", "shortcuts");
    await expect(shortcuts).toHaveClass(/\bmodal-xl\b/);
    const shortcutsWidth = await shortcuts.evaluate((el) => window.getComputedStyle(el).width);
    expect(parseFloat(shortcutsWidth)).toBeLessThanOrEqual(880);
    await page.keyboard.press("Escape");
  });

  test("universal close affordance (.modal-close-btn) dismisses modals on click", async ({ page }) => {
    // Test close button on AboutModal
    const about = await openViaShortcut(page, "ControlOrMeta+Shift+Comma", "about");
    const aboutCloseBtn = about.locator(".modal-close-btn");
    await expect(aboutCloseBtn).toBeVisible();
    await aboutCloseBtn.click();
    expect(await currentModal(page)).toBe("none");

    // Test close button on CommandPaletteModal
    const palette = await openViaShortcut(page, "ControlOrMeta+k", "commandPalette");
    const paletteCloseBtn = palette.locator(".modal-close-btn");
    await expect(paletteCloseBtn).toBeVisible();
    await paletteCloseBtn.click();
    expect(await currentModal(page)).toBe("none");

    // Test close button on ActionDrawerModal
    const actions = await openViaShortcut(page, "ControlOrMeta+Shift+a", "actions");
    const actionsCloseBtn = actions.locator(".modal-close-btn");
    await expect(actionsCloseBtn).toBeVisible();
    await actionsCloseBtn.click();
    expect(await currentModal(page)).toBe("none");

    // Test close button on SearchModal
    const search = await openViaShortcut(page, "ControlOrMeta+Shift+f", "search");
    const searchCloseBtn = search.locator(".modal-close-btn");
    await expect(searchCloseBtn).toBeVisible();
    await searchCloseBtn.click();
    expect(await currentModal(page)).toBe("none");

    // Test close button on SettingsModal
    const settings = await openViaShortcut(page, "ControlOrMeta+,", "settings");
    const settingsCloseBtn = settings.locator(".modal-close-btn");
    await expect(settingsCloseBtn).toBeVisible();
    await settingsCloseBtn.click();
    expect(await currentModal(page)).toBe("none");

    // Test close button on ShortcutsModal
    const shortcuts = await openViaShortcut(page, "ControlOrMeta+/", "shortcuts");
    const shortcutsCloseBtn = shortcuts.locator(".modal-close-btn");
    await expect(shortcutsCloseBtn).toBeVisible();
    await shortcutsCloseBtn.click();
    expect(await currentModal(page)).toBe("none");
  });

  test("SafetyModal close button triggers safety cancel", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "# open action to block closing" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");

    const safety = modalCard(page, MODAL_LABELS.safety);
    await expect(safety).toBeVisible();
    await expect(safety).toHaveClass(/\bmodal-sm\b/);

    const closeBtn = safety.locator(".modal-close-btn");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    expect(await currentModal(page)).toBe("none");
  });
});
