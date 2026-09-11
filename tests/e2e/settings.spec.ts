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

const settings = (page: Page) => modalCard(page, MODAL_LABELS.settings);

async function openSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("Control+Comma");
  await expect(settings(page)).toBeVisible();
}

test.describe("settings (Ctrl+,)", () => {
  test("theme toggle flips data-color-mode and persists to config", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
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

    await page.keyboard.press("Control+Comma");
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
    await page.keyboard.press("Control+Comma");
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
    await expect(settings(page)).toContainText("/work-notes");
  });

  test("switching directory via a recent folder resets the workspace", async ({ page }) => {
    await seedApp(page, { seed: "dir-switch" });
    await openSettings(page);

    // The recent-folders list offers the personal notes dir.
    await settings(page).getByRole("button", { name: "/personal-notes" }).click();

    await expect(settings(page)).toBeHidden();
    await expect(toast(page)).toContainText("/personal-notes");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.notesDir)).toBe("/personal-notes");
    // The personal dir's own saved session is restored (its files, not work's).
    const labels = await tabLabels(page);
    expect(labels.join(" ")).toMatch(/2026-09-07/); // today always present
    // work-notes is now in the recent list.
    await page.keyboard.press("Control+Comma");
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
    await settings(page).getByRole("button", { name: "Browse…" }).click();

    await expect(toast(page)).toContainText("/archive-2025");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.notesDir)).toBe("/archive-2025");
  });

  test("a non-empty scratchpad blocks a directory switch until confirmed", async ({ page }) => {
    await seedApp(page, { seed: "dir-switch" });
    await editor(page).click();
    await page.keyboard.press("Control+n");
    await editor(page).click();
    await page.keyboard.type("unpromoted thoughts");

    await page.keyboard.press("Control+Comma");
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
    await page.keyboard.press("Control+Comma");
    await settings(page).getByRole("button", { name: "/personal-notes" }).click();
    await modalCard(page, MODAL_LABELS.unsavedScratchpads)
      .getByRole("button", { name: /Discard/ })
      .click();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.notesDir)).toBe("/personal-notes");
  });
});
