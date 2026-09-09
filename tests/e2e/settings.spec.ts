import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, activeTabLabel, currentModal, toast, tab } from "./helpers";

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
    await settings(page).getByRole("button", { name: "Color", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "color");

    const persisted = await page.evaluate(() => window.__CHRONO_MOCK__!.colorMode);
    expect(persisted).toBe("color");

    // Survives a reload (config is read on boot).
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "color");
  });

  test("readable line width persists and only constrains the editor with wrap on (§99)", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, wordWrap: true } });
    await openSettings(page);

    const readableToggle = () => settings(page).getByText("Limit line width for readability", { exact: false });
    const contentMaxWidth = () =>
      page.locator(".cm-content").evaluate((el) => getComputedStyle(el).maxWidth);

    // default on: wrap on + readable on → column capped at 720px
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.readableLineLength)).toBe(true);
    expect(await contentMaxWidth()).toBe("720px");

    // turn it off → column spans full width again, and the mock persisted it
    await readableToggle().click();
    expect(await contentMaxWidth()).toBe("none");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.readableLineLength)).toBe(false);

    // survives a reload (read from config on boot)
    await page.reload();
    await editor(page).click();
    expect(await contentMaxWidth()).toBe("none");
  });

  test("readable line width is a no-op while word wrap is off (§99)", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, wordWrap: false, readableLineLength: true } });
    await editor(page).click();
    // readable on but wrap off → no column cap (wide tables still scroll)
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
    const labels = await page.locator("#tab-bar .tab span").allTextContents();
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
