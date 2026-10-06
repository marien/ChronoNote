import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, tab } from "./helpers";

/** Peek stays inside the section it was opened from. The rest of the note is hidden in the same document, so every
 * way of editing has to be unable to touch it: select-all, backspace/delete at the section's edges, undo, typing
 * on the title lines, paste. To move to another section you leave Peek. */
const NOTE = [
  "Standup", //                0
  "=======", //                1
  "# one", //                  2
  "", //                       3
  "Weekly sync", //            4   <- Peek section starts here
  "===========", //            5
  "o budget", //               6
  "- today", //                7
  "", //                       8
  "Other", //                  9   <- hidden
  "=====", //                  10
  "x elsewhere", //            11
].join("\n");

const HEAD = "Standup\n=======\n# one\n\nWeekly sync\n===========\n";
const TAIL = "\n\nOther\n=====\nx elsewhere";

async function docText(page: Page): Promise<string> {
  return page.evaluate(() => window.__CHRONO_MOCK__!.debug!.getEditorContent());
}

async function enterPeek(page: Page, downLines = 6) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < downLines; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ControlOrMeta+Alt+KeyP");
  await expect(page.locator("body.peek-mode")).toBeVisible();
}

/** Everything outside the section must be byte-for-byte what it was. */
function expectHiddenIntact(doc: string) {
  expect(doc.startsWith(HEAD)).toBe(true);
  expect(doc.endsWith("Other\n=====\nx elsewhere")).toBe(true);
}

test.describe("peek stays inside its section", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": NOTE,
          "2026-09-12.txt": "Nothing here\n============\nx",
        },
        session: { openTabs: ["2026-09-07.txt", "2026-09-12.txt"], activeTab: "2026-09-07.txt" },
        peek: {},
      },
    });
  });

  test("select all + delete only clears the section's body", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    expectHiddenIntact(await docText(page));
    expect(await docText(page)).not.toContain("budget");
  });

  test("select all + typing replaces only the section's body", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("fresh");
    const doc = await docText(page);
    expectHiddenIntact(doc);
    expect(doc).toContain("fresh");
  });

  test("backspace at the start of the section's first line does not eat into the title", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Backspace");
    expect(await docText(page)).toBe(NOTE);
  });

  test("delete at the end of the section does not pull the next (hidden) section up", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Delete");
    expect(await docText(page)).toBe(NOTE);
  });

  test("backspace/delete at the section's edges never touches the neighbours", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
    await page.keyboard.press("ControlOrMeta+End");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Delete");
    expectHiddenIntact(await docText(page));
    expect(await docText(page)).toContain("Weekly sync\n===========");
  });

  test("the title and underline are not drawn, and the caret starts on the first line of the body", async ({ page }) => {
    await enterPeek(page);
    const text = await editor(page).innerText();
    expect(text).not.toContain("Weekly sync");
    expect(text).not.toContain("=====");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.type("ZZ");
    const doc = await docText(page);
    expect(doc).toContain("Weekly sync\n===========\nZZo budget");
    expectHiddenIntact(doc);
  });

  test("typing on a new line at the end of the section stays in the section", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- from peek");
    const doc = await docText(page);
    expect(doc.indexOf("- from peek")).toBeGreaterThan(doc.indexOf("- today"));
    expect(doc.indexOf("- from peek")).toBeLessThan(doc.indexOf("Other"));
    expect(doc.endsWith("Other\n=====\nx elsewhere")).toBe(true);
    await expect(editor(page)).toContainText("from peek");
    await expect(editor(page)).not.toContainText("elsewhere");
  });

  test("a multi-line paste lands inside the section", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("line a\nline b");
    const doc = await docText(page);
    expect(doc.indexOf("line b")).toBeLessThan(doc.indexOf("Other"));
    expectHiddenIntact(doc);
  });

  test("undo cannot reach back into text outside the section", async ({ page }) => {
    // An edit made in the full note, before Peek: it lives in the hidden part.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.type("ZZ");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Alt+KeyP");
    await expect(page.locator("body.peek-mode")).toBeVisible();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ControlOrMeta+Z");
    expect((await docText(page)).startsWith("ZZStandup")).toBe(true);
  });

  test("undo and redo of an edit made in Peek still work", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("temp");
    expect(await docText(page)).toContain("temp");
    await page.keyboard.press("ControlOrMeta+Z");
    expect(await docText(page)).not.toContain("temp");
    await page.keyboard.press("ControlOrMeta+Shift+Z");
    expect(await docText(page)).toContain("temp");
  });

  test("shift-selecting up past the title stops at the section's first line", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+Shift+Home");
    await page.keyboard.press("Delete");
    const doc = await docText(page);
    expectHiddenIntact(doc);
    expect(doc).not.toContain("budget");
  });

  test("moving to a note without this section ends Peek (to go elsewhere, leave Peek)", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("Control+Tab");
    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await expect(tab(page, "2026-09-12.txt")).toHaveCount(1);
  });
});
