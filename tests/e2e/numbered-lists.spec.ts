import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, typeInEditor, activeTabContent, statusCounts } from "./helpers";

/** Numbered lists: `1.`, `2)`, and numbered sub-items `1.1.`. Plain text with no styling: Enter continues the
 * numbering, an empty item exits, Tab indents like a bullet, and no number is ever rewritten. The marker has
 * to be the first non-blank character of the line, so a bullet (or an action) on the same line wins. */

async function caretAtEndOfLine(page: Page, line: number) {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
}

test.describe("numbered lists: Enter", () => {
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

  test("a list may start at any number", async ({ page }) => {
    await typeInEditor(page, "7. seven");
    await page.keyboard.press("Enter");
    await page.keyboard.type("eight");
    expect(await activeTabContent(page)).toBe("7. seven\n8. eight");
  });

  test("the 1) style continues as 2) and keeps the parenthesis", async ({ page }) => {
    await typeInEditor(page, "1) a");
    await page.keyboard.press("Enter");
    await page.keyboard.type("b");
    expect(await activeTabContent(page)).toBe("1) a\n2) b");
  });

  test("carries over the digit boundary: 9 to 10 and 99 to 100", async ({ page }) => {
    await typeInEditor(page, "9. nine");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("9. nine\n10. ");
    await page.keyboard.type("ten");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("9. nine\n10. ten\n11. ");
    await setEditorText(page, "99. x");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("99. x\n100. ");
  });

  test("an empty item exits the list and leaves a blank line", async ({ page }) => {
    await typeInEditor(page, "1. a");
    await page.keyboard.press("Enter"); // "2. "
    await page.keyboard.press("Enter"); // empty: exit
    expect(await activeTabContent(page)).toBe("1. a\n");
    await page.keyboard.type("plain text");
    expect(await activeTabContent(page)).toBe("1. a\nplain text");
  });

  test("an empty item exits at any indentation, for sub-items too", async ({ page }) => {
    await setEditorText(page, "1. a\n  1.1. b\n  1.2. ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n  1.1. b\n");
  });

  test("Enter in the middle of an item splits it; the tail becomes the next item", async ({ page }) => {
    await setEditorText(page, "1. hello world");
    await page.keyboard.press("Home");
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight"); // after "1. hello"
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. hello\n2.  world");
  });

  test("with the caret before the marker, Enter is a plain newline and the marker is not duplicated", async ({ page }) => {
    await setEditorText(page, "1. one");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("\n1. one");
  });

  test("with the caret inside the marker, Enter is a plain newline", async ({ page }) => {
    await setEditorText(page, "12. twelve");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight"); // between the 1 and the 2
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1\n2. twelve");
  });

  test("Shift+Enter aligns the next line under the item's text and adds no number", async ({ page }) => {
    await typeInEditor(page, "1. first");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("more");
    expect(await activeTabContent(page)).toBe("1. first\n   more");
    await setEditorText(page, "10. tenth");
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("more");
    expect(await activeTabContent(page)).toBe("10. tenth\n    more");
  });

  test("Enter then undo takes back the whole continuation in one step", async ({ page }) => {
    await setEditorText(page, "1. a");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. ");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a");
  });
});

test.describe("numbered sub-lists (1.1.)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Enter continues 1.1. as 1.2., then 1.3.", async ({ page }) => {
    await typeInEditor(page, "1.1. first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await page.keyboard.type("third");
    expect(await activeTabContent(page)).toBe("1.1. first\n1.2. second\n1.3. third");
  });

  test("only the last number changes, across the digit boundary and at three levels", async ({ page }) => {
    await typeInEditor(page, "2.9. nine");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("2.9. nine\n2.10. ");
    await setEditorText(page, "1.2.3) deep");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1.2.3) deep\n1.2.4) ");
  });

  test("a sub-list under its parent: numbers are never rewritten when you indent", async ({ page }) => {
    await setEditorText(page, "1. parent\n2. child");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. parent\n  2. child");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. parent\n  2. child\n  3. ");
  });

  test("typing your own sub-numbers works: an indented 1.1. list under a 1. item", async ({ page }) => {
    await typeInEditor(page, "1. topic");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace"); // remove "2. "
    await page.keyboard.type("  1.1. detail");
    await page.keyboard.press("Enter");
    await page.keyboard.type("more");
    expect(await activeTabContent(page)).toBe("1. topic\n  1.1. detail\n  1.2. more");
  });
});

test.describe("numbered lists: indentation like bullets", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Tab indents by two spaces and Shift+Tab takes them back, numbers untouched", async ({ page }) => {
    await setEditorText(page, "1. a");
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("  1. a");
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("    1. a");
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("  1. a");
  });

  test("an indented item keeps its indentation on the next item", async ({ page }) => {
    await setEditorText(page, "    3. deep");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("    3. deep\n    4. ");
  });

  test("a tab-indented item keeps its tab", async ({ page }) => {
    await setEditorText(page, "\t1. tabbed");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("\t1. tabbed\n\t2. ");
  });

  test("Tab on a selection of several numbered items indents each of them", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("  1. a\n  2. b\n  3. c");
  });
});

test.describe("numbered lists mixed with bullets", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Enter on a numbered item between two bullets continues the NUMBERS and leaves the bullets alone", async ({ page }) => {
    await setEditorText(page, "- a\n1. b\n- c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("- a\n1. b\n2. \n- c");
  });

  test("Enter on a bullet next to a numbered item continues the BULLET", async ({ page }) => {
    await setEditorText(page, "1. a\n- b\n2. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n- b\n- \n2. c");
  });

  test("the last bullet before a numbered line and the first bullet after one each continue their own kind", async ({ page }) => {
    await setEditorText(page, "- x\n1. y\n- z");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("- x\n- \n1. y\n- z");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("- x\n- \n1. y\n- z\n- ");
  });

  test("numbered children under a bullet: the indentation is kept and the numbers continue", async ({ page }) => {
    await setEditorText(page, "- parent\n  1. child");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("- parent\n  1. child\n  2. ");
  });

  test("bullet children under a numbered item: the indentation is kept and the bullet continues", async ({ page }) => {
    await setEditorText(page, "1. parent\n  - child");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. parent\n  - child\n  - ");
  });

  test("a bullet whose text starts with a number is a bullet; a numbered item whose text starts with a bullet is numbered", async ({ page }) => {
    await setEditorText(page, "- 1. bullet");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("- 1. bullet\n- ");
    await setEditorText(page, "1. - numbered");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. - numbered\n2. ");
  });

  test("an empty bullet and an empty numbered item each exit on their own", async ({ page }) => {
    await setEditorText(page, "- a\n1. b\n- ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("- a\n1. b\n");
    await setEditorText(page, "- a\n- b\n1. ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("- a\n- b\n");
  });

  test("Shift+Enter under a numbered item beside a bullet still aligns under its own text", async ({ page }) => {
    await setEditorText(page, "- a\n1. b");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("x");
    expect(await activeTabContent(page)).toBe("- a\n1. b\n   x");
  });
});

test.describe("things that are NOT numbered lists", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  for (const text of ["3.5 hours", "1.5", "1.1 not a sublist", "12 monkeys", "0. zero", "01. leading zero", "a. letter", "1.x", "(1). x", "1: x"]) {
    test(`"${text}" gets a plain newline on Enter`, async ({ page }) => {
      await setEditorText(page, text);
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      expect(await activeTabContent(page)).toBe(text + "\n");
    });
  }

  test("a bare marker without its space is not an item yet: Enter is a plain newline", async ({ page }) => {
    await setEditorText(page, "1.");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1.\n");
  });

  test("a marker that is not the first non-blank character (after text or an action symbol) is not a list", async ({ page }) => {
    await setEditorText(page, "see 1. here");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("see 1. here\n");
    await setEditorText(page, "# 1. an action");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("# 1. an action\n# "); // continued as an action, not as a numbered item
  });
});

test.describe("numbered lists: everything else stays as it was", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("no styling: the line renders as plain text with no glyph, and counts as no action", async ({ page }) => {
    await setEditorText(page, "1. first\n2) second\n1.1. sub");
    await expect(editor(page).locator('[class*="glyph-"]')).toHaveCount(0);
    await expect(editor(page).locator(".cm-line").nth(0)).toHaveText("1. first");
    expect(await statusCounts(page)).toMatchObject({ open: 0, closed: 0, forwarded: 0 });
  });

  test("Ctrl+1 leaves a numbered item alone (like a bullet) but promotes prose that merely starts with a number", async ({ page }) => {
    await setEditorText(page, "1. item\n3.5 hours");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("1. item\n3.5 hours");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("1. item\n# 3.5 hours");
  });

  test("a numbered line that is a section title keeps its underline: Enter does not insert a number between them", async ({ page }) => {
    await setEditorText(page, "1. Introduction\n===============\nbody");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    const content = await activeTabContent(page);
    expect(content).not.toContain("2.");
    expect(content).toBe("1. Introduction\n\n===============\nbody");
  });

  test("continuing a numbered list next to an action line is unaffected", async ({ page }) => {
    await setEditorText(page, "# task\n1. item");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("# task\n1. item\n2. ");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("# task\n# \n1. item\n2. ");
  });
});
