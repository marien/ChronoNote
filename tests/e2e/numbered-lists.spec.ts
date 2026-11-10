import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, typeInEditor, activeTabContent, statusCounts } from "./helpers";

/** Numbered lists: `1.`, `2)`, and numbered sub-items `1.1.`. Plain text with no styling: Enter continues the
 * numbering, an empty item exits, Tab indents like a bullet, and the only numbers ever rewritten are the ones an
 * item inserted mid-list pushes down (#123). The marker has
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

  test("an empty sub-item converts to parent group marker, then exits on next Enter", async ({ page }) => {
    await setEditorText(page, "1. a\n  1.1. b\n  1.2. ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n  1.1. b\n2. ");
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

  test("a sub-list under its parent: numbers are rewritten when you indent under text", async ({ page }) => {
    await setEditorText(page, "1. parent\n2. child");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. parent\n   1. child");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. parent\n   1. child\n   2. ");
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
    expect(await activeTabContent(page)).toBe("# 1. an action\n# 2. "); // an action continues with the next number (§367)
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

  test("Ctrl+1 puts the symbol in front of a numbered item (§367) and promotes prose that merely starts with a number", async ({ page }) => {
    await setEditorText(page, "1. item\n3.5 hours");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("# 1. item\n3.5 hours");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("# 1. item\n# 3.5 hours");
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

test.describe("numbered lists: an item inserted in the middle renumbers the rest (#123)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Enter after item 1 of 4 pushes 2, 3, 4 down", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c\n4. d");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    await page.keyboard.type("new");
    expect(await activeTabContent(page)).toBe("1. a\n2. new\n3. b\n4. c\n5. d");
  });

  test("splitting an item in the middle also renumbers what follows, and the caret stays in the new item", async ({ page }) => {
    await setEditorText(page, "1. one two\n2. b\n3. c");
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight"); // after "1. one "
    await page.keyboard.press("Enter");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("1. one \n2. Xtwo\n3. b\n4. c");
  });

  test("a blank line ends the list: a second list below is left alone", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n\n2. other\n3. more");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    await page.keyboard.type("new");
    expect(await activeTabContent(page)).toBe("1. a\n2. new\n3. b\n\n2. other\n3. more");
  });

  test("sub-items move with their parent", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n  2.1. b one\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    await page.keyboard.type("new");
    expect(await activeTabContent(page)).toBe("1. a\n2. new\n3. b\n  3.1. b one\n4. c");
  });

  test("the insert and the renumbering are one undo step", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n3. b\n4. c");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c");
  });
});

test.describe("numbered lists: smarter nesting", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("removing an empty item's number splits the list; typing on that line joins it again", async ({ page }) => {
    // Marien on a dev build: 1) 2) 3), the second emptied and its number removed: the third became 1); typing on
    // the second line must make it 2) again.
    await setEditorText(page, "1) a\n2) \n3) c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1) a\n   \n1) c");
    await page.keyboard.type("more about a");
    expect(await activeTabContent(page)).toBe("1) a\n   more about a\n2) c");
    // Deleting that text again splits the list once more.
    for (let i = 0; i < "more about a".length; i++) await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1) a\n   \n1) c");
  });

  test("Tab on text under a list item lines it up with the item's text, then with deeper items", async ({ page }) => {
    await setEditorText(page, "1. a\n   - x\nb\n2. c");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   - x\n   b\n2. c");
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   - x\n     b\n2. c");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    // Back at the margin, the text ends the list again: the item after it starts a list of its own.
    expect(await activeTabContent(page)).toBe("1. a\n   - x\nb\n1. c");
  });

  test("Tab on unindented text below a list joins it: the items after it continue the numbering", async ({ page }) => {
    await setEditorText(page, "1. a\nnote\n1. b");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    await page.keyboard.type("!");
    expect(await activeTabContent(page)).toBe("1. a\n   note!\n2. b");
  });

  test("Backspace on the first item's marker renumbers the rest from 1", async ({ page }) => {
    await setEditorText(page, "1. first\n2. second\n3. third");
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("first\n1. second\n2. third");
  });

  test("Tab on a selection that ends at the start of a line leaves that line alone", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c\n4. d");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n   2. c\n2. d");
  });

  test("Tab and Shift+Tab with the caret inside the text keep the caret on the same character", async ({ page }) => {
    await setEditorText(page, "1. a\n2. bcd\n3. e");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Tab");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("1. a\n   1. bcXd\n2. e");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.type("Y");
    expect(await activeTabContent(page)).toBe("1. a\n2. bcXYd\n3. e");
  });

  test("Tab indents under parent text and restarts numbering at 1", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b");
  });

  test("Shift+Tab outdents to parent indent and renumbers outer and child groups", async ({ page }) => {
    await setEditorText(page, "1. a\n   1. b\n   2. c\n2. d");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n   1. c\n3. d");
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

  test("Enter on an empty sub-item replaces it with the next marker in the parent group", async ({ page }) => {
    await setEditorText(page, "1. parent\n   1.1. child\n   1.2. ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. parent\n   1.1. child\n2. ");
  });

  test("deleting a whole item line renumbers subsequent items", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Delete");
    expect(await activeTabContent(page)).toBe("1. b\n2. c");
  });

  test("Alt+ArrowDown moving an item renumbers items in doc order", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Alt+ArrowDown");
    expect(await activeTabContent(page)).toBe("1. b\n2. a\n3. c");
  });

  test("Tab on a sub-bullet with a numbered predecessor indents under its text", async ({ page }) => {
    await setEditorText(page, "1. a\n- b");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   - b");
  });
});
