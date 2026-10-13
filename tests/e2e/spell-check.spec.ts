import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText } from "./helpers";

test.describe("spell check (proposal D2)", () => {
  test("off by default: no marks and .cm-content has spellcheck='false' on desktop", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Here is teh wrods to test.");
    const content = page.locator(".cm-content");
    await expect(content).toHaveAttribute("spellcheck", "false");
    await page.waitForTimeout(400);
    await expect(page.locator(".cm-misspelled")).toHaveCount(0);
  });

  test("with spell check on (mock), a 120-line note shows marks that survive scrolling to bottom and back", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    const lines = Array.from({ length: 120 }, (_, i) => `teh wrods on line ${i + 1}`).join("\n");
    await setEditorText(page, lines);

    const firstMisspelled = page.locator(".cm-misspelled").first();
    await expect(firstMisspelled).toBeVisible();
    await expect(page.locator(".cm-content")).toHaveAttribute("spellcheck", "false");

    const scroller = page.locator(".cm-scroller");
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(400);

    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(firstMisspelled).toBeVisible();
  });

  test("tokens (# , @teh, a URL with teh) are not marked", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await setEditorText(page, "# first action\n@teh assignee\nhttps://example.com/teh\nregular teh");

    await page.waitForTimeout(400);

    const marks = page.locator(".cm-misspelled");
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveText("teh");

    await expect(page.locator(".glyph-assignee .cm-misspelled")).toHaveCount(0);
    await expect(page.locator(".cm-link .cm-misspelled")).toHaveCount(0);
  });

  test("right-click on wrods shows words at the top of the line menu, choosing it replaces the word (one Ctrl+Z restores it)", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await setEditorText(page, "Here is teh wrods in note.");

    const wrodsMark = page.locator(".cm-misspelled", { hasText: "wrods" });
    await expect(wrodsMark).toBeVisible();

    await wrodsMark.click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    const firstMenuItem = menu.locator("button.editor-context-item").first();
    await expect(firstMenuItem).toHaveText("words");

    await firstMenuItem.click();
    await expect(menu).toHaveCount(0);

    await expect(page.locator(".cm-content")).toContainText("Here is teh words in note.");

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator(".cm-content")).toContainText("Here is teh wrods in note.");
  });

  test("'Ignore' removes the mark", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await setEditorText(page, "This word is mispeled here.");

    const mispeledMark = page.locator(".cm-misspelled", { hasText: "mispeled" });
    await expect(mispeledMark).toBeVisible();

    await mispeledMark.click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    const ignoreBtn = menu.locator("button.editor-context-item", { hasText: "Ignore" });
    await expect(ignoreBtn).toBeVisible();
    await ignoreBtn.click();
    await expect(menu).toHaveCount(0);

    await expect(page.locator(".cm-misspelled")).toHaveCount(0);
  });
});
