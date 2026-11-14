import { test, expect, type Page } from "@playwright/test";
import { seedApp, setEditorText, activeTabContent } from "./helpers";

async function caretAtEndOfLine(page: Page, line: number) {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
}

async function caretAtStartOfLine(page: Page, line: number) {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
}

test.describe("smarter numbered lists: Tab, Shift+Tab, and renumbering", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Tab indents to text column, restarts numbering at 1, and renumbers outer list", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n2. c");
  });

  test("Shift+Tab continues the outer list and renumbers following items", async ({ page }) => {
    await setEditorText(page, "1. a\n   1. b\n   2. c\n2. d");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n   1. c\n3. d");
  });

  test("Tab on a bullet under a numbered item indents under the text column", async ({ page }) => {
    await setEditorText(page, "1. a\n- x");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   - x");
  });

  test("sub-bullet inside a numbered list stays unnumbered and does not break list numbering", async ({ page }) => {
    await setEditorText(page, "1. a\n   - x\n2. b");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    await page.keyboard.type("c");
    expect(await activeTabContent(page)).toBe("1. a\n   - x\n2. b\n3. c");
  });

  test("Backspace on marker aligns text under previous item, and a second Backspace removes leading whitespace", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtStartOfLine(page, 1);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight"); // right after "2. "
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\n   b\n2. c");
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("1. a\nb\n1. c");
  });

  test("Enter on an empty sub-item turns it into the parent list's next item and shifts outer list items", async ({ page }) => {
    await setEditorText(page, "1. a\n   1. b\n   2. \n2. c");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n2. \n3. c");
  });

  test("Enter on an empty bullet sub-item under a numbered parent turns it into parent list's next item", async ({ page }) => {
    await setEditorText(page, "1. a\n   - ");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n2. ");
  });

  test("deleting a whole item line with Home, Shift+ArrowDown, Delete renumbers remaining items", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtStartOfLine(page, 0);
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Delete");
    expect(await activeTabContent(page)).toBe("1. b\n2. c");
  });

  test("deleting a middle item line closes the numbering gap", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Delete");
    expect(await activeTabContent(page)).toBe("1. a\n2. c");
  });

  test("Alt+ArrowDown moving the first item down keeps numbering consecutive 1, 2, 3", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtStartOfLine(page, 0);
    await page.keyboard.press("Alt+ArrowDown");
    expect(await activeTabContent(page)).toBe("1. b\n2. a\n3. c");
  });

  test("typing 5. x on a new line below 1. a leaves 5. alone without renumbering", async ({ page }) => {
    await setEditorText(page, "1. a\n");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.type("5. x");
    expect(await activeTabContent(page)).toBe("1. a\n5. x");
  });

  test("one Ctrl+Z after Tab restores the text and numbers exactly in one step", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtStartOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n   1. b\n2. c");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c");
  });
});
