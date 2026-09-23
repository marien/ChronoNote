import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  openViaShortcut,
  todayFilename,
  REFERENCE_INSTANT,
} from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

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

/** Narrow-width reflows for the two dialogs that only ever show up in specific flows
 * (OneDrive sync conflicts, calendar-sync review). */
test.describe("narrow reflow: sync conflicts and calendar review (Area 5.4)", () => {
  test.use({
    viewport: { width: 400, height: 800 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  });

  test("sync conflicts: a view switcher shows one version at a time, both by default", async ({ page }) => {
    await seedApp(page, {
      seed: {
        backendKind: "web",
        notes: { "2030-01-01.txt": "one\nphone edit\n" },
        oneDriveConflicts: [{ name: "2030-01-01.txt", remote: "one\npc edit\n" }],
      },
    });
    await page.locator("#stat-conflicts").click();
    const dialog = page.getByRole("dialog", { name: "Sync conflicts" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".conflict-view-tabs")).toBeVisible();

    const local = page.getByTestId("conflict-local");
    const remote = page.getByTestId("conflict-remote");
    await expect(local).toBeVisible();
    await expect(remote).toBeVisible();

    await dialog.locator(".conflict-view-btn", { hasText: "This Device" }).click();
    await expect(local).toBeVisible();
    await expect(remote).toBeHidden();

    await dialog.locator(".conflict-view-btn", { hasText: "OneDrive" }).click();
    await expect(remote).toBeVisible();
    await expect(local).toBeHidden();

    await dialog.locator(".conflict-view-btn", { hasText: "Side-by-Side" }).click();
    await expect(local).toBeVisible();
    await expect(remote).toBeVisible();
  });

  test("calendar review: a removed section's controls stack under its title and stay inside the card", async ({ page }) => {
    const today = REFERENCE_INSTANT.toISOString().slice(0, 10);
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([{ date: today, start: "09:00", end: "09:30", title: "Standup" }]),
        notes: { [todayFilename()]: "Standup\n=======\nnotes\nOld Meeting\n===========\nimportant content\n" },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    // On a phone-width top bar the button is folded into More actions; the shortcut is the direct route.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+C");
    const dialog = page.getByRole("dialog", { name: "Sync review" });
    await expect(dialog).toBeVisible();

    const removal = dialog.locator(".sync-review-removal").first();
    await expect(removal).toBeVisible();
    expect(await removal.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("column");

    const card = (await dialog.boundingBox())!;
    const controls = (await removal.locator(".sync-review-removal-controls").boundingBox())!;
    expect(controls.x).toBeGreaterThanOrEqual(card.x - 1);
    expect(controls.x + controls.width).toBeLessThanOrEqual(card.x + card.width + 1);
  });
});
