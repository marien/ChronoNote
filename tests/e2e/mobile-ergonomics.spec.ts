import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  openViaShortcut,
  todayFilename,
} from "./helpers";

test.describe("mobile ergonomics & modal reflow (Area 5.4, 5.5, 6)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "single-day" });
  });

  test("palette legend tap chips (> ! @ ?) filter query and toggle on repeat tap", async ({ page }) => {
    const palette = await openViaShortcut(page, "ControlOrMeta+k", "commandPalette");
    const input = palette.locator(".modal-input");
    const chips = palette.locator(".palette-chip");

    await expect(chips).toHaveCount(4);

    const cmdChip = chips.nth(0);
    const actChip = chips.nth(1);
    const dateChip = chips.nth(2);
    const helpChip = chips.nth(3);

    // Tap '>' chip
    await cmdChip.click();
    await expect(input).toHaveValue(">");
    await expect(cmdChip).toHaveClass(/\bactive\b/);

    // Tap '>' chip again to toggle off
    await cmdChip.click();
    await expect(input).toHaveValue("");
    await expect(cmdChip).not.toHaveClass(/\bactive\b/);

    // Tap '!' chip
    await actChip.click();
    await expect(input).toHaveValue("!");
    await expect(actChip).toHaveClass(/\bactive\b/);

    // Tap '@' chip - replaces existing prefix
    await dateChip.click();
    await expect(input).toHaveValue("@");
    await expect(dateChip).toHaveClass(/\bactive\b/);
    await expect(actChip).not.toHaveClass(/\bactive\b/);

    // Tap '?' chip
    await helpChip.click();
    await expect(input).toHaveValue("?");
    await expect(helpChip).toHaveClass(/\bactive\b/);

    await page.keyboard.press("Escape");
  });

  test("ShortcutsModal reflows to segmented switcher on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 720 });
    const modal = await openViaShortcut(page, "ControlOrMeta+/", "shortcuts");

    const mobileTabs = modal.locator(".shortcuts-mobile-tabs");
    await expect(mobileTabs).toBeVisible();

    const shortcutsTabBtn = mobileTabs.locator("button", { hasText: "Shortcuts" });
    const glyphsTabBtn = mobileTabs.locator("button", { hasText: "Glyphs & Symbols" });

    // Initial state: Shortcuts tab active
    await expect(shortcutsTabBtn).toHaveClass(/\bactive\b/);
    const shortcutsCol = modal.locator(".shortcuts-col").nth(0);
    const glyphsCol = modal.locator(".shortcuts-col").nth(1);

    await expect(shortcutsCol).toBeVisible();
    await expect(glyphsCol).toBeHidden();

    // Switch to Glyphs & Symbols
    await glyphsTabBtn.click();
    await expect(glyphsTabBtn).toHaveClass(/\bactive\b/);
    await expect(shortcutsTabBtn).not.toHaveClass(/\bactive\b/);
    await expect(glyphsCol).toBeVisible();
    await expect(shortcutsCol).toBeHidden();

    await page.keyboard.press("Escape");
  });

  test("HistoryModal reflows to adaptive tabs on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 720 });
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: "Sprint Sync\n====\n# Discuss launch\n",
          "2026-09-19.txt": "Sprint Sync\n====\nv Closed yesterday\n",
        },
      },
    });

    const modal = await openViaShortcut(page, "ControlOrMeta+Shift+h", "history");
    const mobileTabs = modal.locator(".history-mobile-tabs");
    await expect(mobileTabs).toBeVisible();

    const listTabBtn = mobileTabs.locator(".history-tab-btn").nth(0);
    const previewTabBtn = mobileTabs.locator(".history-tab-btn").nth(1);

    await expect(listTabBtn).toHaveClass(/\bactive\b/);
    const historyMain = modal.locator(".history-main");
    const historyPreview = modal.locator(".history-preview");

    await expect(historyMain).toBeVisible();
    await expect(historyPreview).toBeHidden();

    // Switch to Preview
    await previewTabBtn.click();
    await expect(previewTabBtn).toHaveClass(/\bactive\b/);
    await expect(historyPreview).toBeVisible();
    await expect(historyMain).toBeHidden();

    await page.keyboard.press("Escape");
  });

  test("Dynamic floating toast displays below top bar when mobile is active", async ({ page }) => {
    // 1. Desktop mode: toast appears in status bar
    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.debug!.setMobile(false);
      window.__CHRONO_MOCK__!.debug!.showToast("Desktop toast test");
    });

    const statMessage = page.locator("#stat-message");
    await expect(statMessage).toBeVisible();
    await expect(statMessage).toHaveText("Desktop toast test");
    await expect(page.locator(".mobile-toast")).toHaveCount(0);

    // 2. Mobile mode: toast appears floating below top bar
    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.debug!.setMobile(true);
      window.__CHRONO_MOCK__!.debug!.showToast("Mobile floating toast test");
    });

    const mobileToast = page.locator(".mobile-toast");
    await expect(mobileToast).toBeVisible();
    await expect(mobileToast).toHaveText("Mobile floating toast test");
    await expect(mobileToast).toHaveAttribute("role", "status");
    await expect(mobileToast).toHaveAttribute("aria-live", "polite");

    // Status bar stat-message should not be visible when mobile is active
    await expect(statMessage).toHaveCount(0);
  });
});
