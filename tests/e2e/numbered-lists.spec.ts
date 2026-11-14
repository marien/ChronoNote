import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, typeInEditor, activeTabContent, statusCounts } from "./helpers";

/** Numbered lists: `1.`, `2)`, and numbered sub-items `1.1.`. Most cases are covered in the Vitest
 * editing tables; this spec keeps real-browser checks for DOM rendering and one representative
 * Enter, Tab, and Backspace flow. */

async function caretAtEndOfLine(page: Page, line: number) {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
}

test.describe("numbered lists: browser wiring", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("continues 1. 2. 3. and leaves the text you type in place", async ({ page }) => {
    await typeInEditor(page, "1. one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("two");
    await page.keyboard.press("Enter");
    await page.keyboard.type("three");
    expect(await activeTabContent(page)).toBe("1. one\n2. two\n3. three");
  });

  test("no styling: the line renders as plain text with no glyph, and counts as no action", async ({ page }) => {
    await setEditorText(page, "1. first\n2) second\n1.1. sub");
    await expect(editor(page).locator('[class*="glyph-"]')).toHaveCount(0);
    await expect(editor(page).locator(".cm-line").nth(0)).toHaveText("1. first");
    expect(await statusCounts(page)).toMatchObject({ open: 0, closed: 0, forwarded: 0 });
  });

  test("Tab indents under parent text and restarts numbering at 1", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b");
  });

  test("Backspace on marker converts to continuation spaces; second Backspace deletes leading whitespace", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   b");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\nb");
  });
});
