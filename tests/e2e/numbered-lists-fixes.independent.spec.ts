import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent } from "./helpers";

/**
 * Independent E2E tests for the numbered-list fixes (NL-F, rules 1-15).
 * Tests interact exclusively through the browser editor UI and clipboard events.
 */

/** Move caret to column 0 of a 0-based line index (avoids CM6 smart-Home on indented lines). */
async function caretAtLineStart(page: Page, line: number): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
}

/** Move caret to the end of a 0-based line index. */
async function caretAtEndOfLine(page: Page, line: number): Promise<void> {
  await caretAtLineStart(page, line);
  await page.keyboard.press("End");
}

/** Move caret to a 0-based column offset within a 0-based line index. */
async function caretAtLineOffset(page: Page, line: number, offset: number): Promise<void> {
  await caretAtLineStart(page, line);
  for (let i = 0; i < offset; i++) await page.keyboard.press("ArrowRight");
}

/** Select from column 0 of startLine to the end of endLine (0-based, inclusive). */
async function selectLineRange(page: Page, startLine: number, endLine: number): Promise<void> {
  await caretAtLineStart(page, startLine);
  for (let i = startLine; i < endLine; i++) await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+End");
}

/** Dispatch a paste event with text/plain on .cm-content. */
async function pastePlain(page: Page, plain: string): Promise<void> {
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const target = document.querySelector(".cm-content");
    if (!target) throw new Error("Could not find .cm-content element");
    target.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, plain);
}

/** Dispatch a paste event with text/html (and fallback text/plain) on .cm-content. */
async function pasteHtml(page: Page, html: string, plain = "flat text"): Promise<void> {
  await page.evaluate(
    ({ html, plain }) => {
      const dt = new DataTransfer();
      dt.setData("text/html", html);
      dt.setData("text/plain", plain);
      const target = document.querySelector(".cm-content");
      if (!target) throw new Error("Could not find .cm-content element");
      target.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    { html, plain },
  );
}

/** Dispatch a copy event on .cm-content and return the populated HTML and plain text. */
async function copySelection(page: Page): Promise<{ html: string; plain: string }> {
  return page.evaluate(() => {
    const dt = new DataTransfer();
    const target = document.querySelector(".cm-content");
    if (!target) throw new Error("Could not find .cm-content element");
    target.dispatchEvent(
      new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
    return {
      html: dt.getData("text/html"),
      plain: dt.getData("text/plain"),
    };
  });
}

test.describe("rule 1: Tab and Shift+Tab on the first item of a group", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Tab on the first item of a top-level list shifts the whole group by +2 and keeps numbers", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("  1. a\n  2. b\n  3. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c");
  });

  test("Tab on the first item of an indented sub-group shifts the group and its three-level subtree by +2", async ({ page }) => {
    await setEditorText(page, "1. a\n   1. b\n   2. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n     1. b\n     2. c");

    await setEditorText(page, "1. a\n   1. b\n      1.1. sub\n   2. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n     1. b\n        1.1. sub\n     2. c");
  });

  test("Tab on the first item right under a bullet moves the group to the bullet text column", async ({ page }) => {
    await setEditorText(page, "- bullet\n2. a\n3. b");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("- bullet\n  2. a\n  3. b");

    await setEditorText(page, "* bullet\n2. a\n   2.1. sub\n3. b");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("* bullet\n  2. a\n     2.1. sub\n  3. b");
  });

  test("Tab on the first item of a list starting at 4 keeps 4, 5, 6 for . and ) lists", async ({ page }) => {
    await setEditorText(page, "4. a\n5. b\n6. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("  4. a\n  5. b\n  6. c");

    await setEditorText(page, "4) a\n5) b\n6) c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("  4) a\n  5) b\n  6) c");
  });

  test("Shift+Tab on the first item of an indented group with no parent shifts the group back by 2", async ({ page }) => {
    await setEditorText(page, "  1. a\n  2. b");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n2. b");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("  1. a\n  2. b");

    await setEditorText(page, "  4) a\n     4.1) sub\n  5) b");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("4) a\n   4.1) sub\n5) b");
  });

  test("Tab on a selection starting at the first item shifts selected lines by +2 and restarts the following group at 1", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c\n4. d");
    await selectLineRange(page, 0, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("  1. a\n  2. b\n1. c\n2. d");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c\n4. d");
  });

  test("Tab and Shift+Tab on the first item keep the caret on its character", async ({ page }) => {
    await setEditorText(page, "1. abcd\n2. e");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("ArrowLeft"); // between c and d
    await page.keyboard.press("Tab");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("  1. abcXd\n  2. e");

    await page.keyboard.press("Shift+Tab");
    await page.keyboard.type("Y");
    expect(await activeTabContent(page)).toBe("1. abcXYd\n2. e");
  });
});

test.describe("rule 2: Tab looks only within the parent", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Tab on the first sub-item under a second sibling shifts +2 instead of aligning under a previous sibling's sub-item", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. b\n2. c\n   1. d");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n2. c\n     1. d");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n2. c\n   1. d");

    await setEditorText(page, "1. a\n   1.1. b\n2. c\n   1. d\n   2. e");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n2. c\n     1. d\n     2. e");
  });

  test("Tab on a third-level first sub-item under a second sub-parent shifts +2", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. b\n      1.1.1. x\n   1.2. c\n      1.2.1. y");
    await caretAtEndOfLine(page, 4);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n      1.1.1. x\n   1.2. c\n        1.2.1. y");
  });

  test("Tab on an item with a different delimiter under the same parent shifts +2 and keeps caret on its character", async ({ page }) => {
    await setEditorText(page, "1. a\n   1. b\n   1) cd\n   2) e");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("ArrowLeft"); // between c and d
    await page.keyboard.press("Tab");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n     1) cXd\n     2) e");
  });
});

test.describe("rule 3: Enter on an item that has sub-items", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Enter at end of item with dotted sub-items inserts next sibling above them and renumbers prefixes and siblings", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. sub\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n   2.1. sub\n3. b\n4. c");
    await page.keyboard.type("new");
    expect(await activeTabContent(page)).toBe("1. a\n2. new\n   2.1. sub\n3. b\n4. c");

    await page.keyboard.press("ControlOrMeta+z"); // undo typing "new"
    await page.keyboard.press("ControlOrMeta+z"); // undo Enter + renumber in one step
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\n2. b\n3. c");
  });

  test("Enter with plain sub-items, continuation lines, or bullets renumbers following siblings", async ({ page }) => {
    await setEditorText(page, "1. a\n   1. sub\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n   1. sub\n3. b\n4. c");

    await setEditorText(page, "1. a\n   cont\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n   cont\n3. b\n4. c");

    await setEditorText(page, "1. a\n   - bullet\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n   - bullet\n3. b\n4. c");
  });

  test("Enter on an item with sub-items handles lists starting at 4, ) lists, and three levels", async ({ page }) => {
    await setEditorText(page, "4. a\n   4.1. sub\n5. b");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("4. a\n5. \n   5.1. sub\n6. b");

    await setEditorText(page, "1) a\n   1) sub\n2) b");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1) a\n2) \n   1) sub\n3) b");

    await setEditorText(page, "1. a\n   1.1. b\n      1.1.1. c\n   1.2. d\n2. e");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n   1.2. \n      1.2.1. c\n   1.3. d\n2. e");
  });
});

test.describe("rule 4: splitting and joining lists", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("pasting text with a blank line splits the list and restarts the second part at 1", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await pastePlain(page, "\n");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n\n1. b\n2. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c");

    await setEditorText(page, "4. a\n5. b\n6. c");
    await caretAtEndOfLine(page, 0);
    await pastePlain(page, "\n");
    await expect.poll(() => activeTabContent(page)).toBe("4. a\n\n1. b\n2. c");
  });

  test("Alt+ArrowDown moving text into a list splits it; Alt+ArrowUp moving it out joins it keeping first start", async ({ page }) => {
    await setEditorText(page, "text\n1. a\n2. b\n3. c");
    await caretAtLineStart(page, 0);
    await page.keyboard.press("Alt+ArrowDown");
    expect(await activeTabContent(page)).toBe("1. a\ntext\n1. b\n2. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("text\n1. a\n2. b\n3. c");

    await setEditorText(page, "4. a\ntext\n1. b\n2. c");
    await caretAtLineStart(page, 1);
    await page.keyboard.press("Alt+ArrowUp");
    expect(await activeTabContent(page)).toBe("text\n4. a\n5. b\n6. c");
  });

  test("typing over a multi-line selection that spans items splits the list", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c\n4. d");
    await selectLineRange(page, 1, 2);
    await page.keyboard.type("x");
    expect(await activeTabContent(page)).toBe("1. a\nx\n1. d");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c\n4. d");
  });

  test("Backspace then Shift+Tab on a middle item in a list starting at 4 splits the list and restarts the tail at 1", async ({ page }) => {
    await setEditorText(page, "4. a\n5. b\n6. c");
    await caretAtLineOffset(page, 1, 3); // 5. |b
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("4. a\n   b\n5. c");

    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("4. a\nb\n1. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("4. a\n   b\n5. c");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("4. a\n5. b\n6. c");
  });

  test("Enter on an empty middle item exits and restarts the rest at 1 (including ) lists and start > 1)", async ({ page }) => {
    await setEditorText(page, "1. a\n2. \n3. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n\n1. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n3. c");

    await setEditorText(page, "1) a\n2) \n3) c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1) a\n\n1) c");

    await setEditorText(page, "4. a\n5. \n6. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("4. a\n\n1. c");
  });

  test("deleting a blank line or indenting separating text joins two lists keeping the first start", async ({ page }) => {
    await setEditorText(page, "4. a\n\n1. b\n2. c");
    await caretAtLineStart(page, 1);
    await page.keyboard.press("Delete");
    expect(await activeTabContent(page)).toBe("4. a\n5. b\n6. c");

    await setEditorText(page, "4) a\ntext\n1) b\n2) c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("4) a\n   text\n5) b\n6) c");
  });
});

test.describe("rule 5: typing or deleting a number never renumbers", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("typing a digit on an indented blank line between two lists does not renumber, while typing a letter joins them", async ({ page }) => {
    await setEditorText(page, "1. a\n   \n3. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.type("2");
    expect(await activeTabContent(page)).toBe("1. a\n   2\n3. c");

    await setEditorText(page, "1. a\n   \n3. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.type("x");
    expect(await activeTabContent(page)).toBe("1. a\n   x\n2. c");

    await setEditorText(page, "1) a\n   \n3) c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.type("2");
    expect(await activeTabContent(page)).toBe("1) a\n   2\n3) c");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("x");
    expect(await activeTabContent(page)).toBe("1) a\n   x\n2) c");
  });

  test("deleting a digit on a line starting with a number does not renumber", async ({ page }) => {
    await setEditorText(page, "1. a\n   25\n3. c");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   2\n3. c");

    await setEditorText(page, "1. a\n23. b\n4. c");
    await caretAtLineOffset(page, 1, 2); // between 3 and .
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n4. c");
  });
});

test.describe("rule 6: second Backspace with intervening sub-items or bullets", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("first and second Backspace after sub-items remove the marker then indent, keep caret, and undo in one step each", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. sub\n2. c");
    await caretAtLineOffset(page, 2, 3); // 2. |c
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\n   c");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\nc");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\nXc");

    await page.keyboard.press("ControlOrMeta+z"); // undo X
    await page.keyboard.press("ControlOrMeta+z"); // undo 2nd Backspace
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\n   c");
    await page.keyboard.press("ControlOrMeta+z"); // undo 1st Backspace
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\n2. c");
  });

  test("first and second Backspace after sub-items or bullets renumber following items", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. sub\n2. c\n3. d");
    await caretAtLineOffset(page, 2, 3);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\n   c\n2. d");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. sub\nc\n1. d");

    await setEditorText(page, "1. a\n   - bullet\n2. c\n3. d");
    await caretAtLineOffset(page, 2, 3);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   - bullet\n   c\n2. d");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   - bullet\nc\n1. d");
  });

  test("first and second Backspace on a middle item renumber twice for 1., 4., and ) lists", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtLineOffset(page, 1, 3);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   b\n2. c");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\nb\n1. c");

    await setEditorText(page, "4. a\n5. b\n6. c");
    await caretAtLineOffset(page, 1, 3);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("4. a\n   b\n5. c");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("4. a\nb\n1. c");

    await setEditorText(page, "1) a\n2) b\n3) c");
    await caretAtLineOffset(page, 1, 3);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1) a\n   b\n2) c");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1) a\nb\n1) c");
  });

  test("first Backspace at three levels aligns under sub-parent text and renumbers siblings", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. b\n      1.1.1. sub\n   1.2. c\n   1.3. d");
    await caretAtLineOffset(page, 3, 8); // "   1.2. |c"
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n      1.1.1. sub\n        c\n   1.2. d");
  });
});

test.describe("rule 7: Backspace on an empty sub-item", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Backspace on an empty sub-item under a numbered parent promotes it and undoes in one step", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. b\n   1.2. ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n2. ");
    await page.keyboard.type("c");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n2. c");

    await page.keyboard.press("ControlOrMeta+z"); // undo c
    await page.keyboard.press("ControlOrMeta+z"); // undo Backspace promotion
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n   1.2. ");
  });

  test("Backspace on an empty sub-item handles ) lists, start > 1, three levels, and following sub-items", async ({ page }) => {
    await setEditorText(page, "1) a\n   1) b\n   2) ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1) a\n   1) b\n2) ");

    await setEditorText(page, "4. a\n   4.1. b\n   4.2. ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("4. a\n   4.1. b\n5. ");

    await setEditorText(page, "1. a\n   1.1. b\n      1.1.1. c\n      1.1.2. ");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n      1.1.1. c\n   1.2. ");

    await setEditorText(page, "1. a\n   1. b\n   2. \n   3. c\n2. d");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n2. \n   1. c\n3. d");
  });

  test("Backspace on an empty top-level item or an empty item under a bullet keeps existing marker-removal behaviour", async ({ page }) => {
    await setEditorText(page, "1. a\n2. ");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   ");

    await setEditorText(page, "- a\n  1. ");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("- a\n  ");
  });
});

test.describe("rule 8: Enter on an empty sub-item", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Enter on an empty sub-item promotes it and turns following sub-items into its children from 1", async ({ page }) => {
    await setEditorText(page, "1. a\n   1. b\n   2. \n   3. c\n2. d");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n2. \n   1. c\n3. d");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n2. X\n   1. c\n3. d");

    await page.keyboard.press("ControlOrMeta+z"); // undo X
    await page.keyboard.press("ControlOrMeta+z"); // undo Enter
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n   2. \n   3. c\n2. d");
  });

  test("Enter on an empty sub-item handles dotted, ) lists, start > 1, and three levels", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. b\n   1.2. \n   1.3. c\n2. d");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n2. \n   2.1. c\n3. d");

    await setEditorText(page, "1) a\n   1) b\n   2) \n   3) c\n2) d");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1) a\n   1) b\n2) \n   1) c\n3) d");

    await setEditorText(page, "4. a\n   1. b\n   2. \n   3. c\n5. d");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("4. a\n   1. b\n5. \n   1. c\n6. d");

    await setEditorText(page, "1. a\n   1.1. b\n      1.1.1. c\n      1.1.2. \n      1.1.3. d\n   1.2. e");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n      1.1.1. c\n   1.2. \n      1.2.1. d\n   1.3. e");
  });
});

test.describe("rule 9: Shift+Tab on a selection", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Shift+Tab on a selection of sub-items leaves remaining sub-items starting again at 1 and undoes in one step", async ({ page }) => {
    await setEditorText(page, "1. a\n   4. b\n   5. c\n   6. d");
    await selectLineRange(page, 1, 2);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c\n   1. d");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n   4. b\n   5. c\n   6. d");
  });

  test("Shift+Tab on a selection handles dotted lists, ) lists, start > 1, and three levels", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. b\n   1.2. c\n   1.3. d");
    await selectLineRange(page, 1, 2);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c\n   3.1. d");

    await setEditorText(page, "1) a\n   4) b\n   5) c\n   6) d");
    await selectLineRange(page, 1, 2);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1) a\n2) b\n3) c\n   1) d");

    await setEditorText(page, "4. a\n   1. b\n   2. c\n   3. d");
    await selectLineRange(page, 1, 2);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("4. a\n5. b\n6. c\n   1. d");

    await setEditorText(page, "1. a\n   1.1. b\n      1.1.1. c\n      1.1.2. d\n      1.1.3. e");
    await selectLineRange(page, 2, 3);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n   1.2. c\n   1.3. d\n      1.3.1. e");
  });
});

test.describe("rule 10: a marker that changes width moves its subtree along", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("renumbering 9. to 10. shifts continuation lines and sub-items by +1 column, and shrinking back shifts by -1", async ({ page }) => {
    await setEditorText(page, "8. pre\n9. a\n   sub text\n   1. sub");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("8. pre\n9. \n10. a\n    sub text\n    1. sub");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("8. pre\n9. a\n   sub text\n   1. sub");

    // Delete line "9. y" so 10. shrinks back to 9.
    await setEditorText(page, "8. pre\n9. y\n10. a\n    sub text\n    1. sub");
    await caretAtLineStart(page, 1);
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Delete");
    expect(await activeTabContent(page)).toBe("8. pre\n9. a\n   sub text\n   1. sub");
  });

  test("renumbering 9.9. to 9.10. and three-level 9. to 10. shifts deeper subtrees accordingly", async ({ page }) => {
    await setEditorText(page, "9.8. prev\n9.9. a\n     sub text\n     1. sub");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("9.8. prev\n9.9. \n9.10. a\n      sub text\n      1. sub");

    await setEditorText(page, "8. x\n9. a\n   9.1. b\n        9.1.1. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("8. x\n9. \n10. a\n    10.1. b\n          10.1.1. c");
  });

  test("renumbering 9) to 10) in a ) list shifts continuation lines and sub-items by +1 column", async ({ page }) => {
    await setEditorText(page, "8) pre\n9) a\n   sub text\n   1) sub");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("8) pre\n9) \n10) a\n    sub text\n    1) sub");
  });
});

test.describe("rule 11: tabs in the indent are compared by width", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Enter mid-list renumbers past a tab-indented sub-item and mixed tab/space widths", async ({ page }) => {
    await setEditorText(page, "1. a\n\t1.1. sub\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n\t2.1. sub\n3. b\n4. c");

    await setEditorText(page, "\t1. a\n    1.1. sub\n\t2. b");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("\t1. a\n\t2. \n    2.1. sub\n\t3. b");
  });

  test("first Backspace on a tab-indented item keeps the tab, keeps caret, and undoes in one step", async ({ page }) => {
    await setEditorText(page, "\t1. a\n\t2. b\n\t3. c");
    await caretAtLineOffset(page, 1, 4); // \t2. |b
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("\t1. a\n\t   b\n\t2. c");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("\t1. a\n\t   Xb\n\t2. c");

    await page.keyboard.press("ControlOrMeta+z"); // undo X
    await page.keyboard.press("ControlOrMeta+z"); // undo Backspace
    expect(await activeTabContent(page)).toBe("\t1. a\n\t2. b\n\t3. c");

    await setEditorText(page, "\t1) a\n\t2) b");
    await caretAtLineOffset(page, 1, 4);
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("\t1) a\n\t   b");
  });
});

test.describe("rule 12: paste onto an empty numbered item", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("pasting plain numbered items onto an empty numbered item replaces the marker and continues numbering", async ({ page }) => {
    await setEditorText(page, "1. a\n2. ");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1. x\n2. y");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n2. x\n3. y");

    await setEditorText(page, "1. a\n2. \n3. z");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1. x\n2. y");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n2. x\n3. y\n4. z");

    await setEditorText(page, "4. a\n5. ");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1. x\n2. y");
    await expect.poll(() => activeTabContent(page)).toBe("4. a\n5. x\n6. y");

    await setEditorText(page, "1) a\n2) ");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1) x\n2) y");
    await expect.poll(() => activeTabContent(page)).toBe("1) a\n2) x\n3) y");

    await setEditorText(page, "1. a\n   1.1. b\n   1.2. ");
    await caretAtEndOfLine(page, 2);
    await pastePlain(page, "   1.1. x\n   1.2. y");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n   1.1. b\n   1.2. x\n   1.3. y");
  });

  test("pasting an HTML <ol> onto an empty numbered item replaces the marker, continues numbering, and undoes in one step", async ({ page }) => {
    await setEditorText(page, "1. a\n2. \n3. z");
    await caretAtEndOfLine(page, 1);
    await pasteHtml(page, "<ol><li>x</li><li>y</li></ol>");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n2. x\n3. y\n4. z");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n3. z");
  });
});

test.describe("rule 13: copying a list with continuation lines as HTML", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("copying a numbered list with continuation lines produces one <ol> with <br> in the first <li>, and pasting the HTML back restores it", async ({ page }) => {
    const text = "1. a\n   cont\n2. b";
    await setEditorText(page, text);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+a");

    const clip = await copySelection(page);
    expect(clip.plain).toBe(text);

    const parsed = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const ols = Array.from(doc.body.querySelectorAll("ol"));
      if (ols.length !== 1) return { error: `Expected 1 <ol>, got ${ols.length}` };
      const lis = Array.from(ols[0].children).filter((c) => c.tagName === "LI");
      if (lis.length !== 2) return { error: `Expected 2 <li>, got ${lis.length}` };
      const br = lis[0].querySelector("br");
      if (!br) return { error: "First <li> missing <br>" };
      // The text between <br> elements, read from the DOM (no regex tag stripping).
      const parts = [""];
      for (const node of Array.from(lis[0].childNodes)) {
        if (node.nodeName === "BR") parts.push("");
        else parts[parts.length - 1] += node.textContent ?? "";
      }
      for (let i = 0; i < parts.length; i++) parts[i] = parts[i].trim();
      return {
        error: null,
        olCount: ols.length,
        liCount: lis.length,
        firstParts: parts,
        secondText: lis[1].textContent?.trim(),
      };
    }, clip.html);

    expect(parsed.error).toBeNull();
    expect(parsed.olCount).toBe(1);
    expect(parsed.liCount).toBe(2);
    expect(parsed.firstParts).toEqual(["a", "cont"]);
    expect(parsed.secondText).toBe("b");

    // Paste the HTML (without ChronoNote's own-copy marker, as another app would hand it over) into an empty editor.
    await setEditorText(page, "");
    await editor(page).click();
    await pasteHtml(page, clip.html.replace(/\s*data-chrononote=""/g, ""));
    await expect.poll(() => activeTabContent(page)).toBe(text);

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("");
  });

  test("copying and pasting HTML with multiple continuation lines and a list starting at 10 round-trips", async ({ page }) => {
    const text = "10. a\n    cont1\n    cont2\n11. b";
    await setEditorText(page, text);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+a");

    const clip = await copySelection(page);
    expect(clip.plain).toBe(text);

    const olInfo = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const ols = doc.body.querySelectorAll("ol");
      const lis = ols.length === 1 ? Array.from(ols[0].children).filter((c) => c.tagName === "LI") : [];
      return {
        olCount: ols.length,
        liCount: lis.length,
        brCount: lis[0]?.querySelectorAll("br").length ?? 0,
      };
    }, clip.html);
    expect(olInfo).toEqual({ olCount: 1, liCount: 2, brCount: 2 });

    await setEditorText(page, "");
    await editor(page).click();
    await pasteHtml(page, clip.html.replace(/\s*data-chrononote=""/g, ""));
    await expect.poll(() => activeTabContent(page)).toBe(text);
  });
});

test.describe("rule 14: the 1.1. style rule", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("dotted items in a . list do not affect a ) list under a different delimiter", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. x\n1) p\n2) q");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. x\n1) p\n   1) q");
  });

  test("dotted items under a bullet parent do not trigger dotted style for a numbered list", async ({ page }) => {
    await setEditorText(page, "- bullet\n  1.1. x\n1. a\n2. b");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("- bullet\n  1.1. x\n1. a\n   1. b");
  });

  test("Tab placing a plain item before an existing dotted sub-group adopts dotted style, keeps caret, and undoes in one step", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. x\n2. b\n3. cd\n   3.1. e");
    await caretAtEndOfLine(page, 3);
    await page.keyboard.press("ArrowLeft"); // between c and d
    await page.keyboard.press("Tab");
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. x\n2. b\n   2.1. cXd\n   2.2. e");

    await page.keyboard.press("ControlOrMeta+z"); // undo X
    await page.keyboard.press("ControlOrMeta+z"); // undo Tab
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. x\n2. b\n3. cd\n   3.1. e");
  });

  test("three-level dotted style adoption when Tab places a sub-item in front of a dotted third-level group", async ({ page }) => {
    await setEditorText(page, "1. a\n   1.1. b\n        1.1.1. x\n   1.2. c\n   1.3. d\n        1.3.1. e");
    await caretAtEndOfLine(page, 4);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1.1. b\n        1.1.1. x\n   1.2. c\n        1.2.1. d\n        1.2.2. e");
  });
});

test.describe("rule 15: speed on 3,000-line notes", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Tab on item 2 of a 3,000-item list finishes with correct text within 1 second", async ({ page }) => {
    const lines = Array.from({ length: 3000 }, (_, i) => `${i + 1}. item ${i + 1}`);
    await setEditorText(page, lines.join("\n"));
    await caretAtEndOfLine(page, 1);

    const start = Date.now();
    await page.keyboard.press("Tab");
    await expect.poll(async () => {
      const content = await activeTabContent(page);
      const outLines = content.split("\n");
      return (
        outLines.length === 3000 &&
        outLines[0] === "1. item 1" &&
        outLines[1] === "   1. item 2" &&
        outLines[2] === "2. item 3" &&
        outLines[2999] === "2999. item 3000"
      );
    }, { timeout: 1000 }).toBe(true);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  test("typing on a blank line of a 3,000-line note finishes with correct text within 1 second", async ({ page }) => {
    const lines = Array.from({ length: 3000 }, (_, i) => (i === 1500 ? "" : `line ${i + 1}`));
    await setEditorText(page, lines.join("\n"));
    await caretAtLineStart(page, 1500);

    const start = Date.now();
    await page.keyboard.type("z");
    await expect.poll(async () => {
      const content = await activeTabContent(page);
      const outLines = content.split("\n");
      return outLines.length === 3000 && outLines[1500] === "z" && outLines[2999] === "line 3000";
    }, { timeout: 1000 }).toBe(true);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});
