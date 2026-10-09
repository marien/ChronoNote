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
    // §344: About and Settings are a page on desktop (sheets on a phone), so they are no longer in this scale.

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
    // (About used to be the first case here; since §344 it is a Settings tab on desktop.)
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

    // The Settings page (§344) closes with its back button
    await openViaShortcut(page, "ControlOrMeta+,", "settings");
    const settingsCloseBtn = page.locator(".settings-back-btn");
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

  test("SafetyModal dismisses on Escape", async ({ page }) => {
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: "# open action to block closing" } },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");

    const safety = modalCard(page, MODAL_LABELS.safety);
    await expect(safety).toBeVisible();
    await expect(safety).toHaveClass(/\bmodal-sm\b/);

    await page.keyboard.press("Escape");
    expect(await currentModal(page)).toBe("none");
  });
});
