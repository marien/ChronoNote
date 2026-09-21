import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  activeTabLabel,
  currentModal,
  toast,
  tab,
  tabLabels,
  todayFilename,
} from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";

const settings = (page: Page) => modalCard(page, MODAL_LABELS.settings);

async function openSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(settings(page)).toBeVisible();
}

/** Settings is tabbed (Appearance / Notes & Sync /
 * Updates) — always reopens on the first tab, so anything under the other
 * two needs an explicit switch first. */
async function openSettingsTab(page: Page, label: "Appearance" | "Notes & Sync" | "Updates") {
  await settings(page).getByRole("radio", { name: label, exact: true }).click();
}

test.describe("settings (Ctrl/Cmd+,)", () => {
  test("#48: light/dark/system theme control flips data-theme and persists to config", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await openSettings(page);

    // system (default): no data-theme attribute — app.css's plain
    // @media (prefers-color-scheme) rules decide.
    await expect(settings(page).getByRole("radio", { name: "System", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");

    await settings(page).getByRole("radio", { name: "Light", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.themeMode)).toBe("light");

    await settings(page).getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.themeMode)).toBe("dark");

    // Survives a reload (config is read on boot).
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Back to System removes the override entirely.
    await page.keyboard.press("ControlOrMeta+Comma");
    await settings(page).getByRole("radio", { name: "System", exact: true }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.themeMode)).toBe("system");
  });

  test("theme toggle flips data-color-mode and persists to config", async ({ page }) => {
    // Explicit starting mode (rather than relying on whatever the app's
    // own default happens to be) — this test is about the toggle
    // mechanism, not about pinning down the default.
    await seedApp(page, { seed: { ...scenario("busy-week"), colorMode: "grayscale" } });
    await openSettings(page);

    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "grayscale");
    await settings(page).getByRole("radio", { name: "Color", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "color");

    const persisted = await page.evaluate(() => window.__CHRONO_MOCK__!.colorMode);
    expect(persisted).toBe("color");

    // Survives a reload (config is read on boot).
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "color");
  });

  test("the Legacy palette is a third option and persists (§111)", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# an open action" } } });
    await openSettings(page);

    // grayscale by default → the open glyph is just --text
    await settings(page).getByRole("radio", { name: "Grayscale", exact: true }).click();
    const grayOpen = await page
      .locator(".cm-line .glyph-open")
      .first()
      .evaluate((el) => getComputedStyle(el).color);

    await page.keyboard.press("ControlOrMeta+Comma");
    await settings(page).getByRole("radio", { name: "Legacy", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "legacy");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.colorMode)).toBe("legacy");

    // The legacy palette drives the same structural --glyph-open-color the
    // other two modes do — a hue, not grayscale's --text.
    const legacyOpen = await page
      .locator(".cm-line .glyph-open")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(legacyOpen).not.toBe(grayOpen);

    // survives a reload (config is read on boot)
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "legacy");
  });

  test("Editor width: Reading column force-enables wrap + caps + persists (§110/§127)", async ({ page }) => {
    await seedApp(page, { seed: { notes: {} } });
    await openSettings(page);

    // §127 (finding K): the old two-toggle pair (Word wrap / Limit line
    // width, the second disabling the first) is now one 3-way segmented
    // control — Full / Wrap / Reading column.
    const widthOption = (label: string) => settings(page).getByRole("radio", { name: label });
    const contentMaxWidth = () => page.locator(".cm-content").evaluate((el) => getComputedStyle(el).maxWidth);

    // default: Full — no wrap, no cap
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.readableLineLength)).toBe(false);
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.wordWrap)).toBe(false);
    expect(await contentMaxWidth()).toBe("none");
    await expect(widthOption("Full")).toHaveAttribute("aria-checked", "true");

    // Reading column → wrap force-enabled, column capped
    await widthOption("Reading column").click();
    expect(await contentMaxWidth()).toBe("720px");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.readableLineLength)).toBe(true);
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.wordWrap)).toBe(true);

    // survives a reload
    await page.reload();
    await editor(page).click();
    expect(await contentMaxWidth()).toBe("720px");

    // Wrap → cap gone, wrap stays on
    await page.keyboard.press("ControlOrMeta+Comma");
    await widthOption("Wrap").click();
    expect(await contentMaxWidth()).toBe("none");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.wordWrap)).toBe(true);
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.readableLineLength)).toBe(false);

    // Full → wrap off too
    await widthOption("Full").click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.wordWrap)).toBe(false);
  });

  test("word wrap alone doesn't cap the column (§110)", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, wordWrap: true } });
    await editor(page).click();
    const maxWidth = await page.locator(".cm-content").evaluate((el) => getComputedStyle(el).maxWidth);
    expect(maxWidth).toBe("none");
  });

  test("shows the current notes folder path", async ({ page }) => {
    await seedApp(page, { seed: "dir-switch" });
    await openSettings(page);
    await openSettingsTab(page, "Notes & Sync");
    await expect(settings(page)).toContainText("/work-notes");
  });

  test("switching directory via a recent folder resets the workspace", async ({ page }) => {
    await seedApp(page, { seed: "dir-switch" });
    await openSettings(page);
    await openSettingsTab(page, "Notes & Sync");

    // The recent-folders list offers the personal notes dir.
    await settings(page).getByRole("button", { name: "/personal-notes" }).click();

    await expect(settings(page)).toBeHidden();
    await expect(toast(page)).toContainText("/personal-notes");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.notesDir)).toBe("/personal-notes");
    // The personal dir's own saved session is restored (its files, not work's).
    const labels = await tabLabels(page);
    expect(labels.join(" ")).toMatch(/2026-09-07/); // today always present
    // work-notes is now in the recent list.
    await page.keyboard.press("ControlOrMeta+Comma");
    await openSettingsTab(page, "Notes & Sync");
    await expect(settings(page)).toContainText("/work-notes");
  });

  test("switching directory via Browse uses the native folder picker result", async ({ page }) => {
    await seedApp(page, { seed: "dir-switch" });
    // Pre-load a brand-new dir into the mock and make the picker return it.
    await page.evaluate(() => {
      const m = window.__CHRONO_MOCK__!;
      m.nextDialogResult = "/archive-2025";
    });
    await openSettings(page);
    await openSettingsTab(page, "Notes & Sync");
    await settings(page).getByRole("button", { name: "Browse…" }).click();

    await expect(toast(page)).toContainText("/archive-2025");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.notesDir)).toBe("/archive-2025");
  });

  test("a non-empty scratchpad blocks a directory switch until confirmed", async ({ page }) => {
    await seedApp(page, { seed: "dir-switch" });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+n");
    await editor(page).click();
    await page.keyboard.type("unpromoted thoughts");

    await page.keyboard.press("ControlOrMeta+Comma");
    await openSettingsTab(page, "Notes & Sync");
    await settings(page).getByRole("button", { name: "/personal-notes" }).click();

    const warn = modalCard(page, MODAL_LABELS.unsavedScratchpads);
    await expect(warn).toBeVisible();
    await expect(warn).toContainText("permanently lost");
    // §93 shares this gate with the app-close barrier — in the switch
    // context the confirm button must still say "Switch", not "Quit".
    await expect(warn).toContainText(/discard & switch/i);

    await warn.getByRole("button", { name: "Cancel" }).click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.notesDir)).toBe("/work-notes");

    // Try again, this time discard.
    await page.keyboard.press("ControlOrMeta+Comma");
    await openSettingsTab(page, "Notes & Sync");
    await settings(page).getByRole("button", { name: "/personal-notes" }).click();
    await modalCard(page, MODAL_LABELS.unsavedScratchpads)
      .getByRole("button", { name: /Discard/ })
      .click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.notesDir)).toBe("/personal-notes");
  });

  test("#60: grows to show every section in a tab without scrolling on a tall window, styled with the app's own thin scrollbar", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 1024, height: 1100 });
    await openSettings(page);
    // "Notes & Sync" has the most sections of any one tab
    // (Calendar/Notes Location/Data) — the tallest case to prove against.
    await openSettingsTab(page, "Notes & Sync");

    const section = settings(page).locator(".settings-section");
    const [clientHeight, scrollHeight, scrollbarWidth] = await section.evaluate((el) => [
      el.clientHeight,
      el.scrollHeight,
      getComputedStyle(el).scrollbarWidth,
    ]);
    // Every section in this tab fits without needing to scroll — the old
    // fixed 380px cap would have forced scrolling here regardless of how
    // much room the window has.
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
    expect(scrollbarWidth).toBe("thin"); // same treatment as .cm-scroller/.modal-list, not the OS default
    await expect(settings(page).getByText("Data", { exact: true })).toBeVisible();
  });

  test("#60: still caps well clear of the status bar on a short window, scrolling internally instead", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 1024, height: 500 });
    await openSettings(page);
    await openSettingsTab(page, "Notes & Sync");

    const cardBox = (await settings(page).boundingBox())!;
    const statusBarBox = (await page.locator("#status-bar").boundingBox())!;
    expect(cardBox.height).toBeLessThanOrEqual(500 * 0.8 + 1);
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(statusBarBox.y + 1);

    // Content overflows the (now bounded) section, so it scrolls
    // internally rather than growing the card past its cap.
    const section = settings(page).locator(".settings-section");
    const [clientHeight, scrollHeight] = await section.evaluate((el) => [el.clientHeight, el.scrollHeight]);
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    // Close stays reachable — the original bug this cap guards against.
    await settings(page).getByRole("button", { name: "Close", exact: true }).click();
    expect(await currentModal(page)).toBe("none");
  });

  test("typography sliders adjust font size and line height (Area 10.1)", async ({ page }) => {
    await seedApp(page);
    await openSettings(page);

    const fontSizeSlider = settings(page).getByRole("slider", { name: "Editor font size" });
    await expect(fontSizeSlider).toBeVisible();
    await fontSizeSlider.fill("15");
    await fontSizeSlider.dispatchEvent("input");

    // CSS custom property is set on root
    const rootFontSize = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--editor-font-size")
    );
    expect(rootFontSize).toBe("15px");

    const lineHeightSlider = settings(page).getByRole("slider", { name: "Editor line spacing" });
    await expect(lineHeightSlider).toBeVisible();
    await lineHeightSlider.fill("1.7");
    await lineHeightSlider.dispatchEvent("input");

    const rootLineHeight = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--editor-line-height")
    );
    expect(rootLineHeight).toBe("1.7");

    // Persisted in mock backend
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.fontSize)).toBe(15);
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.lineHeight)).toBe(1.7);
  });

  test("pure black OLED toggle is only visible in dark mode and layers data-pure-black (Area 10.2)", async ({
    page,
  }) => {
    await seedApp(page, { seed: { themeMode: "light" } });
    await openSettings(page);

    // In light mode, pure black toggle is not rendered
    await expect(settings(page).getByText("Pure black (OLED)")).toHaveCount(0);

    // Switch to dark theme
    await settings(page).getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Pure black toggle is now visible
    const pureBlackToggle = settings(page).locator(".toggle-switch", { hasText: "Pure black (OLED)" });
    await expect(pureBlackToggle).toBeVisible();
    const pureBlackInput = pureBlackToggle.locator("input");
    await expect(pureBlackInput).not.toBeChecked();
    await expect(page.locator("html")).not.toHaveAttribute("data-pure-black");

    // Toggle on
    await pureBlackToggle.click();
    await expect(pureBlackInput).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-pure-black", "");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.pureBlack)).toBe(true);

    // Toggle off
    await pureBlackToggle.click();
    await expect(pureBlackInput).not.toBeChecked();
    await expect(page.locator("html")).not.toHaveAttribute("data-pure-black");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.pureBlack)).toBe(false);
  });
});
