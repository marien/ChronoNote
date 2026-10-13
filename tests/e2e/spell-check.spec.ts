import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, modalCard, MODAL_LABELS } from "./helpers";

const settings = (page: Page) => modalCard(page, MODAL_LABELS.settings);

async function openSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(settings(page)).toBeVisible();
}

test.describe("spell check (proposal D2)", () => {
  test("spell check is off by default: .cm-content has spellcheck='false'", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const content = page.locator(".cm-content");
    await expect(content).toHaveAttribute("spellcheck", "false");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.spellCheck)).toBe(false);
  });

  test("turning the setting on in Settings sets spellcheck='true' and survives reload", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await openSettings(page);

    const toggle = settings(page).locator(".toggle-switch", { hasText: "Spell check" });
    await expect(toggle).toBeVisible();
    const input = toggle.locator("input");
    await expect(input).not.toBeChecked();

    await toggle.click();
    await expect(input).toBeChecked();
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.spellCheck)).toBe(true);

    await page.keyboard.press("Escape");
    const content = page.locator(".cm-content");
    await expect(content).toHaveAttribute("spellcheck", "true");

    await page.reload();
    await expect(editor(page)).toBeVisible();
    await expect(page.locator(".cm-content")).toHaveAttribute("spellcheck", "true");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.spellCheck)).toBe(true);
  });

  test("an @name badge and a link have spellcheck='false'", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Meeting with @alice at https://example.com/notes");

    const badge = page.locator(".glyph-assignee");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("spellcheck", "false");

    const link = page.locator(".cm-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("spellcheck", "false");
  });

  test("with spell check on, Shift+right-click does not open the line menu and plain right-click does", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action line to test right click");

    // Turn spell check on
    await openSettings(page);
    const toggle = settings(page).locator(".toggle-switch", { hasText: "Spell check" });
    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-content")).toHaveAttribute("spellcheck", "true");

    // Plain right-click opens the editor context menu
    const line = page.locator(".cm-content .cm-line").first();
    await line.click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    // Close context menu
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Shift+right-click does NOT open the line menu (.editor-context-menu count 0)
    await line.click({ button: "right", modifiers: ["Shift"] });
    await expect(menu).toHaveCount(0);
  });
});
