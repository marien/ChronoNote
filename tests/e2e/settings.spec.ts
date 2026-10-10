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

const settings = (page: Page) => page.locator(".settings-modal-card, .settings-page");

async function openSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(settings(page)).toBeVisible();
}

/** Settings is tabbed (Appearance / Notes & Sync / About) — always reopens on
 * the first tab, so anything under the other tabs needs an explicit switch first. */
async function openSettingsTab(page: Page, label: "Appearance" | "Notes & Sync" | "About") {
  await settings(page).getByRole("tab", { name: label, exact: true }).click();
}

/** i18n roadmap: the new Language control (below Theme) also has a
 * "System" option, so a bare `getByRole("radio", { name: "System" })`
 * inside the whole Settings card now matches two elements — scope to
 * the Theme radiogroup specifically (the one that also has "Light"). */
function themeControl(page: Page) {
  return settings(page)
    .getByRole("radiogroup")
    .filter({ has: page.getByRole("radio", { name: "Light", exact: true }) });
}

test.describe("settings (Ctrl/Cmd+,)", () => {
  test("the tab strip in the header has no scrollbar of its own (its tabs sit 1px low to cover the rule)", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await openSettings(page);
    const strip = await settings(page).locator(".settings-tabs").evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(strip.scrollHeight).toBeLessThanOrEqual(strip.clientHeight);
  });

  test("#48: light/dark/system theme control flips data-theme and persists to config", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await openSettings(page);

    // system (default): no data-theme attribute — app.css's plain
    // @media (prefers-color-scheme) rules decide.
    await expect(themeControl(page).getByRole("radio", { name: "System", exact: true })).toHaveAttribute(
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
    await themeControl(page).getByRole("radio", { name: "System", exact: true }).click();
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

  test("Color is red open / amber deferred / green done, and there is no Legacy option any more (§328)", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# an open action" }, colorMode: "color", themeMode: "dark" } });
    const open = await page
      .locator(".cm-line .glyph-open")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(open).toBe("rgb(255, 107, 107)");
    await openSettings(page);
    await expect(settings(page).getByRole("radio", { name: "Color", exact: true })).toBeVisible();
    await expect(settings(page).getByRole("radio", { name: "Grayscale", exact: true })).toBeVisible();
    await expect(settings(page).getByRole("radio", { name: "Legacy", exact: true })).toHaveCount(0);
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

    // Try again, this time discard. Cancel went back to Settings (Ctrl+, would now close the page, §344).
    await expect(settings(page)).toBeVisible();
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
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(statusBarBox.y + 1);

    // Content overflows the (now bounded) page, so it scrolls
    // internally rather than growing past the status bar.
    const [clientHeight, scrollHeight] = await settings(page).evaluate((el) => [el.clientHeight, el.scrollHeight]);
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    // Back button stays reachable — the original bug this cap guards against.
    await settings(page).locator(".settings-back-btn").click();
    expect(await currentModal(page)).toBe("none");
  });

  test("the tabs are real tabs: one selected, Left/Right move between them", async ({ page }) => {
    await seedApp(page);
    await openSettings(page);
    const tabs = settings(page).getByRole("tab");
    await expect(tabs).toHaveCount(3); // Appearance, Notes & Sync, About (the Updates tab moved into About, §349)
    await expect(settings(page).getByRole("tab", { name: "Appearance", exact: true })).toHaveAttribute("aria-selected", "true");

    await settings(page).getByRole("tab", { name: "Appearance", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(settings(page).getByRole("tab", { name: "Notes & Sync", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(settings(page).getByRole("tab", { name: "Notes & Sync", exact: true })).toBeFocused();
    await expect(settings(page).getByText("Startup", { exact: true })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft"); // wraps round to the last tab
    await expect(settings(page).getByRole("tab", { name: "About", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  test("every setting is laid out the same way: a labelled row with its control", async ({ page }) => {
    await seedApp(page);
    await openSettings(page);
    // Theme, Language, Glyphs, Text width, Font size and Line spacing are all rows.
    for (const label of ["Theme", "Language", "Glyphs", "Text width", "Font size", "Line spacing"]) {
      const row = settings(page).locator(".s-row", { has: page.locator(".s-label", { hasText: label }) });
      await expect(row, label).toHaveCount(1);
      await expect(row.locator(".s-control"), label).toBeVisible();
    }
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

  test("language control switches display language and persists to config", async ({ page }) => {
    await seedApp(page);
    await openSettings(page);

    const langSelect = settings(page).locator("select.settings-select");

    // Switch to French
    await langSelect.selectOption("fr");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.languageMode)).toBe("fr");
    await expect(settings(page).locator(".settings-page-title, .modal-title")).toContainText("Paramètres");

    // Switch to Polish
    await langSelect.selectOption("pl");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.languageMode)).toBe("pl");
    await expect(settings(page).locator(".settings-page-title, .modal-title")).toContainText("Ustawienia");

    // Switch to Spanish
    await langSelect.selectOption("es");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.languageMode)).toBe("es");
    await expect(settings(page).locator(".settings-page-title, .modal-title")).toContainText("Ajustes");

    // Switch to Italian
    await langSelect.selectOption("it");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.languageMode)).toBe("it");
    await expect(settings(page).locator(".settings-page-title, .modal-title")).toContainText("Impostazioni");

    // Survives reload
    await page.reload();
    await openSettings(page);
    await expect(settings(page).locator(".settings-page-title, .modal-title")).toContainText("Impostazioni");

    // Switch back to English
    await settings(page).locator("select.settings-select").selectOption("en");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.languageMode)).toBe("en");
    await expect(settings(page).locator(".settings-page-title, .modal-title")).toContainText("Settings");
  });

  test("language control renders as a ComboBox select fitting within narrow viewports without overflowing", async ({
    page,
  }) => {
    await seedApp(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await openSettings(page);

    const langSelect = settings(page).locator("select.settings-select");
    await expect(langSelect).toBeVisible();

    const cardBox = (await settings(page).boundingBox())!;
    const selectBox = (await langSelect.boundingBox())!;

    // Must be completely contained horizontally within the card (no overflow/clipping)
    expect(selectBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(selectBox.x + selectBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);

    // All 8 language options are present
    const optionTexts = await langSelect.locator("option").allInnerTexts();
    for (const name of ["System", "English", "Nederlands", "Deutsch", "Français", "Polski", "Español", "Italiano"]) {
      expect(optionTexts.some((t) => t.startsWith(name))).toBe(true);
    }

    // Community translations are marked; reviewed locales (English, Nederlands) are not
    const deOption = optionTexts.find((t) => t.startsWith("Deutsch"));
    const nlOption = optionTexts.find((t) => t.startsWith("Nederlands"));
    const enOption = optionTexts.find((t) => t.startsWith("English"));
    expect(deOption).toContain("(community translation)");
    expect(nlOption).not.toContain("(community translation)");
    expect(enOption).not.toContain("(community translation)");
  });
});

test.describe("settings page mode and mobile sheet (§Z2)", () => {
  test("desktop: Ctrl+, replaces editor with .settings-page, Escape restores editor", async ({ page }) => {
    await seedApp(page);
    await editor(page).click();
    await expect(page.locator("#editor-container")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(page.locator(".settings-page")).toBeVisible();
    await expect(page.locator("#editor-container")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.locator(".settings-page")).toBeHidden();
    await expect(page.locator("#editor-container")).toBeVisible();
  });

  test("desktop: Ctrl+Shift+, opens settings directly on About tab showing version card", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, appVersion: "1.2.3" } });
    await editor(page).click();

    await page.keyboard.press("ControlOrMeta+Shift+Comma");
    await expect(page.locator(".settings-page")).toBeVisible();
    await expect(page.locator(".settings-page").getByRole("tab", { name: "About", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".settings-page .about-version-card")).toBeVisible();
    await expect(page.locator(".settings-page .about-version-card")).toContainText("1.2.3");
  });

  test.describe("mobile sheet behavior", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("on mobile, settings opens as a modal card sheet and about opens as a modal card sheet", async ({ page }) => {
      await seedApp(page, { seed: { notes: {}, appVersion: "1.2.3" } });
      await editor(page).click();

      // Open settings on mobile
      await page.keyboard.press("ControlOrMeta+Comma");
      await expect(page.locator(".modal-card.settings-modal-card")).toBeVisible();
      await expect(page.locator(".settings-page")).toHaveCount(0);
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.locator(".modal-card.settings-modal-card")).toBeHidden();

      // Open about on mobile
      await page.keyboard.press("ControlOrMeta+Shift+Comma");
      await expect(page.locator(".modal-card.about-modal-card")).toBeVisible();
      await expect(page.locator(".modal-card.about-modal-card .about-version-card")).toBeVisible();
    });
  });
});
