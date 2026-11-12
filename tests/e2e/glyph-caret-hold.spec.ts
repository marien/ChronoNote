import { test, expect, type Page } from "@playwright/test";
import { seedApp, setEditorText, activeTabContent } from "./helpers";

/** §463: a symbol typed in front of a space that was already there (a line that only looked empty) completes a
 * token with the caret between the symbol and its space. It stays text until the caret leaves, so the word being
 * typed is not cut in two. */

/** The caret at column 0 of line `line` (0-based). Not Home: on a line of spaces it goes to the end of the indent. */
async function caretAtStartOfLine(page: Page, line: number) {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
}

const glyphs = (page: Page, line: number) =>
  page.evaluate(
    (i) => Array.from(document.querySelectorAll(".cm-line")[i].querySelectorAll('[class*="glyph-"][aria-label]')).map((g) => g.getAttribute("aria-label")),
    line,
  );

test.describe("a symbol typed before an existing space (§463)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  for (const spaces of [" ", "   "]) {
    test(`=> then a word starting with v on a line of ${spaces.length} space(s) keeps the word whole`, async ({ page }) => {
      await setEditorText(page, "Notes\n" + spaces);
      await caretAtStartOfLine(page, 1);
      await page.keyboard.type("=> v");
      expect(await glyphs(page, 1)).toEqual(["Follow-up"]);
      await page.keyboard.type("ery good");
      expect(await activeTabContent(page)).toBe("Notes\n=> very good" + spaces);
      expect(await glyphs(page, 1)).toEqual(["Follow-up"]);
    });
  }

  for (const sym of ["x", ">", "#", ".", ","]) {
    test(`=> ${sym} before an existing space stays text until the caret moves on`, async ({ page }) => {
      await setEditorText(page, "Notes\n  ");
      await caretAtStartOfLine(page, 1);
      await page.keyboard.type(`=> ${sym}`);
      expect(await glyphs(page, 1)).toEqual(["Follow-up"]);
      // Past the space it is a real token, drawn as its glyph.
      await page.keyboard.press("ArrowRight");
      expect((await glyphs(page, 1)).length).toBe(2);
      expect(await activeTabContent(page)).toBe(`Notes\n=> ${sym}  `);
    });
  }

  test("an action symbol at the start of a line of spaces: the word stays whole", async ({ page }) => {
    await setEditorText(page, "Notes\n  ");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.type("x");
    expect(await glyphs(page, 1)).toEqual([]);
    await page.keyboard.type("-ray");
    expect(await activeTabContent(page)).toBe("Notes\nx-ray  ");
  });

  test("on a really empty line, typing the space still draws the glyph at once", async ({ page }) => {
    await setEditorText(page, "Notes\n");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.type("=> v ");
    expect((await glyphs(page, 1)).length).toBe(2);
    await page.keyboard.type("paid");
    expect(await activeTabContent(page)).toBe("Notes\n=> v paid");
  });
});
