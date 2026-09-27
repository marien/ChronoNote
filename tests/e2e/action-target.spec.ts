import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent, openViaShortcut } from "./helpers";

/** Which action symbol a command changes when a line holds several (`# do X => # wait`):
 *  - mouse / touch: exactly the glyph that was clicked;
 *  - keyboard, palette, phone buttons: the symbol nearest to the LEFT of the caret, else the nearest to
 *    the right; with none on the line, the whole line becomes that action (as before). */
const LINE = "# do X => # wait";
const glyphs = (page: Page, line: number) => editor(page).locator(".cm-line").nth(line).locator(".glyph-cyclable");

test.describe("clicking a glyph changes exactly that glyph", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("the leading glyph toggles the leading symbol, not the follow-up's", async ({ page }) => {
    await setEditorText(page, LINE);
    await expect(glyphs(page, 0)).toHaveCount(2);
    await glyphs(page, 0).first().click();
    expect(await activeTabContent(page)).toBe("v do X => # wait");
  });

  test("the follow-up's glyph toggles the follow-up's symbol, not the leading one", async ({ page }) => {
    await setEditorText(page, LINE);
    await glyphs(page, 0).last().click();
    expect(await activeTabContent(page)).toBe("# do X => v wait");
  });

  test("with three symbols each glyph changes only itself, and clicks are independent of the caret", async ({ page }) => {
    await setEditorText(page, "# a => v b => x c");
    await page.keyboard.press("ControlOrMeta+Home"); // caret at the start; the clicks must not care
    await glyphs(page, 0).nth(1).click();
    expect(await activeTabContent(page)).toBe("# a => # b => x c");
    await glyphs(page, 0).nth(2).click();
    expect(await activeTabContent(page)).toBe("# a => # b => # c");
    await glyphs(page, 0).nth(0).click();
    expect(await activeTabContent(page)).toBe("v a => # b => # c");
  });

  test("clicking works on other lines and leaves them alone", async ({ page }) => {
    await setEditorText(page, "# one => # two\n# three => # four");
    await glyphs(page, 1).last().click();
    expect(await activeTabContent(page)).toBe("# one => # two\n# three => v four");
  });
});

test.describe("keyboard commands change the symbol at the caret", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, LINE);
  });

  test("caret at the start: the leading symbol (nothing on the left, so the right is used)", async ({ page }) => {
    await page.keyboard.press("Home");
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe("v do X => # wait");
  });

  test("caret in the text after the leading symbol: the leading symbol (left first)", async ({ page }) => {
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight"); // over the glyph
    await page.keyboard.press("ArrowRight"); // into the text
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe("v do X => # wait");
  });

  test("caret at the end of the line: the follow-up's symbol", async ({ page }) => {
    await page.keyboard.press("End");
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe("# do X => v wait");
  });

  test("Ctrl+Shift+Space reopens the symbol at the caret only", async ({ page }) => {
    await setEditorText(page, "v a => v b");
    await page.keyboard.press("End");
    await page.keyboard.press("Control+Shift+Space");
    expect(await activeTabContent(page)).toBe("v a => # b");
    await page.keyboard.press("Home");
    await page.keyboard.press("Control+Shift+Space");
    expect(await activeTabContent(page)).toBe("# a => # b");
  });

  test("Ctrl+Space does nothing when the symbol at the caret is not open (it does not hunt for another)", async ({ page }) => {
    await setEditorText(page, "v a => # b");
    await page.keyboard.press("Home"); // the leading symbol is done, so there is nothing to close
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe("v a => # b");
  });

  test("Ctrl+Space and Ctrl+Shift+Space preserve caret position on actions and agenda topics", async ({ page }) => {
    // Action line: caret in the middle of the line (between 'buy ' and 'groceries')
    await setEditorText(page, "# buy groceries");
    await page.keyboard.press("Home");
    // Move into text after '# buy '
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe("v buy groceries");
    await page.keyboard.type("fresh ");
    expect(await activeTabContent(page)).toBe("v buy fresh groceries");

    // Reopen action with Ctrl+Shift+Space: caret stays in place
    await page.keyboard.press("Control+Shift+Space");
    expect(await activeTabContent(page)).toBe("# buy fresh groceries");
    await page.keyboard.type("!");
    expect(await activeTabContent(page)).toBe("# buy fresh !groceries");

    // Agenda topic: caret at end
    await setEditorText(page, "o discuss budget");
    await page.keyboard.press("End");
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe(". discuss budget");
    await page.keyboard.type(" now");
    expect(await activeTabContent(page)).toBe(". discuss budget now");

    // Reopen agenda topic with Ctrl+Shift+Space: caret stays at end
    await page.keyboard.press("Control+Shift+Space");
    expect(await activeTabContent(page)).toBe("o discuss budget now");
    await page.keyboard.type("!");
    expect(await activeTabContent(page)).toBe("o discuss budget now!");
  });

  test("Ctrl+1..4 set the state of the symbol at the caret", async ({ page }) => {
    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+3");
    expect(await activeTabContent(page)).toBe("> do X => # wait");
    await page.keyboard.press("End");
    await page.keyboard.press("ControlOrMeta+4");
    expect(await activeTabContent(page)).toBe("> do X => x wait");
    await page.keyboard.press("ControlOrMeta+2");
    expect(await activeTabContent(page)).toBe("> do X => v wait");
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("> do X => # wait");
  });

  test("Ctrl+Shift+O opens the symbol at the caret and never promotes a plain line", async ({ page }) => {
    await setEditorText(page, "v a => x b\nplain");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+O");
    expect(await activeTabContent(page)).toBe("# a => x b\nplain");
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+Shift+O");
    expect(await activeTabContent(page)).toBe("# a => x b\nplain");
  });

  test("a line with no action symbol becomes that action, as before", async ({ page }) => {
    await setEditorText(page, "plain text\n=> a follow-up\n- a bullet");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+2");
    expect(await activeTabContent(page)).toBe("v plain text\n=> a follow-up\n- a bullet");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+3");
    expect(await activeTabContent(page)).toBe("v plain text\n=> > a follow-up\n- a bullet");
    await page.keyboard.press("ArrowDown"); // a bullet is left alone
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("v plain text\n=> > a follow-up\n- a bullet");
  });

  test("a multi-line selection: each line by its own reference column", async ({ page }) => {
    await setEditorText(page, "# a => # b\n# c => # d\nplain");
    await page.keyboard.press("ControlOrMeta+A"); // the caret (head) ends at the end of the last line
    await page.keyboard.press("ControlOrMeta+2");
    // lines 1 and 2: column 0 -> the leading symbol; line 3 (the caret's line, no symbol): the whole line
    expect(await activeTabContent(page)).toBe("v a => # b\nv c => # d\nv plain");
  });
});

test.describe("the command palette works on the symbol at the caret", () => {
  test("Reopen done action on current line uses the pre-palette caret", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "v a => v b");
    await page.keyboard.press("End");
    const palette = await openViaShortcut(page, "ControlOrMeta+k", "commandPalette");
    await palette.locator(".modal-input").fill("reopen done");
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("v a => # b");
  });
});

test.describe("phone action buttons work on the symbol at the caret", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("the done button at the end of the line sets the follow-up; at the start, the leading symbol", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await expect(page.locator(".mobile-accessory-bar")).toBeVisible();
    await setEditorText(page, LINE);
    await page.keyboard.press("End");
    await page.locator(".mobile-accessory-bar").getByRole("button", { name: /completed/i }).first().click();
    expect(await activeTabContent(page)).toBe("# do X => v wait");
    await page.keyboard.press("Home");
    await page.locator(".mobile-accessory-bar").getByRole("button", { name: /completed/i }).first().click();
    expect(await activeTabContent(page)).toBe("v do X => v wait");
  });
});
