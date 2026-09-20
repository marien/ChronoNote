import { test, expect } from "@playwright/test";
import { seedApp, editor, typeInEditor, setEditorText, activeTabContent, statusCounts } from "./helpers";

/** Spec 2.2 — every token renders its glyph on screen while the document
 * on disk stays literal plain text. The glyph parsing itself is unit-
 * tested in `src/lib/tokens.test.ts`; this checks it actually wires
 * through CodeMirror in a real browser. */
test.describe("editor — token glyphs", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("the four action symbols each render their glyph", async ({ page }) => {
    await setEditorText(page, "# open one\nv done one\nx wont one\n> fwd one");

    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    await expect(editor(page).locator(".glyph-done")).toHaveCount(1);
    await expect(editor(page).locator(".glyph-cancelled")).toHaveCount(1);
    await expect(editor(page).locator(".glyph-progress")).toHaveCount(1);

    // Status bar buckets: x folds in with v (Closed); > is Forwarded.
    expect(await statusCounts(page)).toEqual({ open: 1, closed: 2, forwarded: 1 });
  });

  test("bullets, emphasis, follow-ups and delegation", async ({ page }) => {
    await setEditorText(page, "- a bullet\n* also a bullet\n! remember this\n=> a follow up\n=> @dana do the thing");

    await expect(editor(page).locator(".glyph-bullet")).toHaveCount(2);
    await expect(editor(page).locator(".glyph-emphasis-line")).toHaveCount(1);
    await expect(editor(page).locator(".glyph-followup")).toHaveCount(2); // one plain, one on the delegated line
    // @name stays real, editable text (a mark, not a replaced widget).
    await expect(editor(page).locator(".glyph-assignee")).toHaveText("@dana");
  });

  test("consequence-action: => # mid-line renders arrow + open glyph", async ({ page }) => {
    await setEditorText(page, "Talked to Sam => # follow up with the team");

    await expect(editor(page).locator(".glyph-followup")).toHaveCount(1);
    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    // Counts toward Open even though it's not at the line start.
    expect((await statusCounts(page)).open).toBe(1);
    expect(await activeTabContent(page)).toContain("=> # follow up");
  });

  test("#35: @name is highlighted anywhere on a `=> ` line, not just after the arrow", async ({ page }) => {
    await setEditorText(page, "=> ask @dana and cc @sam\nemail @dana about lunch");
    // both @names on the delegation line are badged
    await expect(editor(page).locator(".cm-line").first().locator(".glyph-assignee")).toHaveCount(2);
    // the @name on the plain prose line is left alone
    await expect(editor(page).locator(".cm-line").nth(1).locator(".glyph-assignee")).toHaveCount(0);
  });

  test("#125/#126: a hyphenated @name, and a parenthesised (@name), both badge", async ({ page }) => {
    await setEditorText(page, "=> @jean-luc owns it\n# review the plan (@mary-jane)");
    await expect(editor(page).locator(".cm-line").nth(0).locator(".glyph-assignee")).toHaveText("@jean-luc");
    const paren = editor(page).locator(".cm-line").nth(1);
    await expect(paren.locator(".glyph-assignee")).toHaveText("@mary-jane");
    await expect(paren.locator(".glyph-topic")).toHaveCount(0); // (@name) is a delegate, not a topic
  });

  test("#36/#39: a (topic) tag is highlighted only right after the action symbol", async ({ page }) => {
    await setEditorText(
      page,
      "# (release) ship the docs\n# ship the docs (release)\njust prose (an aside) here",
    );
    // right after the symbol → highlighted
    await expect(editor(page).locator(".cm-line").nth(0).locator(".glyph-topic")).toHaveText("(release)");
    // elsewhere on an action line → plain
    await expect(editor(page).locator(".cm-line").nth(1).locator(".glyph-topic")).toHaveCount(0);
    // in prose → plain
    await expect(editor(page).locator(".cm-line").nth(2).locator(".glyph-topic")).toHaveCount(0);
  });

  test("#73: Ctrl+Space closes an open line to done, and does nothing more (no cycling)", async ({ page }) => {
    await typeInEditor(page, "# a task");
    await page.keyboard.press("Control+Space");
    await expect(editor(page).locator(".glyph-done")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("v a task");
    // pressing it again on an already-done line is a no-op
    await page.keyboard.press("Control+Space");
    expect(await activeTabContent(page)).toBe("v a task");
  });

  test("#73: Ctrl/Cmd+Enter is the same close action as Ctrl+Space (§106)", async ({ page }) => {
    await typeInEditor(page, "# a task");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(editor(page).locator(".glyph-done")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("v a task");
  });

  test("#73: Ctrl+Shift+Space reopens a done line, and does nothing more (§145)", async ({ page }) => {
    await typeInEditor(page, "v a task");
    await page.keyboard.press("Control+Shift+Space");
    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("# a task");
    // pressing it again on an already-open line is a no-op
    await page.keyboard.press("Control+Shift+Space");
    expect(await activeTabContent(page)).toBe("# a task");
  });

  test("#73: Ctrl/Cmd+Shift+Enter is the same reopen action as Ctrl+Shift+Space (§145)", async ({ page }) => {
    await typeInEditor(page, "v a task");
    await page.keyboard.press("ControlOrMeta+Shift+Enter");
    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("# a task");
  });

  test("#73: Ctrl+Space and Ctrl+Shift+Space are no-ops on deferred, won't-do, or plain lines", async ({ page }) => {
    await setEditorText(page, "> deferred\nx wont do\njust prose");
    for (let i = 0; i < 3; i++) {
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      for (let j = 0; j < i; j++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Home");
      await page.keyboard.press("Control+Space");
      await page.keyboard.press("Control+Shift+Space");
    }
    expect(await activeTabContent(page)).toBe("> deferred\nx wont do\njust prose");
  });

  test("#70: Ctrl+1/2/3/4 set the current line directly to open/done/deferred/won't-do", async ({ page }) => {
    await typeInEditor(page, "a task");
    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+2");
    expect(await activeTabContent(page)).toBe("v a task");
    await page.keyboard.press("ControlOrMeta+3");
    expect(await activeTabContent(page)).toBe("> a task");
    await page.keyboard.press("ControlOrMeta+4");
    expect(await activeTabContent(page)).toBe("x a task");
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("# a task");
  });

  test("#70: Ctrl+2 (done) promotes a plain line directly, not just an existing action", async ({ page }) => {
    await typeInEditor(page, "just prose");
    await page.keyboard.press("Home");
    await page.keyboard.press("ControlOrMeta+2");
    expect(await activeTabContent(page)).toBe("v just prose");
  });

  test("#70: Ctrl+3 (deferred) applies across a multi-line selection", async ({ page }) => {
    await setEditorText(page, "# first\nplain\n# second");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+3");
    expect(await activeTabContent(page)).toBe("> first\n> plain\n> second");
  });

  test("#65/#73: Ctrl/Cmd+Shift+O marks every already-actioned line as open, but does NOT promote plain lines or a section header", async ({
    page,
  }) => {
    await setEditorText(
      page,
      "v done\nplain text\nTalked to Sam => x follow up\n> deferred\nSection\n========",
    );
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+Shift+O");

    expect(await activeTabContent(page)).toBe(
      "# done\nplain text\nTalked to Sam => # follow up\n# deferred\nSection\n========",
    );
  });

  test("#65: a true no-op selection (bullets, emphasis, plain text, and a section header) leaves the document untouched", async ({
    page,
  }) => {
    await setEditorText(page, "- a bullet\n! remember this\nplain text\nSection\n========");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+Shift+O");

    expect(await activeTabContent(page)).toBe("- a bullet\n! remember this\nplain text\nSection\n========");
  });

  test("#34: hovering a cyclable glyph previews the next state, then reverts", async ({ page }) => {
    await setEditorText(page, "# a task\nplain line");
    const glyph = editor(page).locator(".cm-line").first().locator(".glyph-cyclable");
    await expect(glyph).toHaveText("☐");

    await glyph.hover();
    await expect(glyph).toHaveText("☑"); // preview of `# → v`
    await expect(glyph).toHaveClass(/glyph-cyclable-preview/);

    await editor(page).locator(".cm-line").nth(1).hover(); // move away
    await expect(glyph).toHaveText("☐");
    // the document was never touched — preview only
    expect(await activeTabContent(page)).toBe("# a task\nplain line");
  });

  test("clicking a glyph cycles that line's state (§106)", async ({ page }) => {
    await setEditorText(page, "# first task\n# second task");
    const secondGlyph = editor(page).locator(".cm-line").nth(1).locator(".glyph-open");
    await secondGlyph.click();
    // only the clicked line changed
    expect(await activeTabContent(page)).toBe("# first task\nv second task");
    // the cursor/selection wasn't yanked onto the glyph
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toContain("X");
  });

  test("indented action symbols still render and count", async ({ page }) => {
    await typeInEditor(page, "  # indented task");
    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    expect((await statusCounts(page)).open).toBe(1);
    // The indentation is untouched real whitespace.
    expect(await activeTabContent(page)).toBe("  # indented task");
  });

  test("bullet continuation: Enter repeats the marker, empty bullet + Enter exits", async ({ page }) => {
    await typeInEditor(page, "- first");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Enter"); // empty bullet
    await page.keyboard.press("Enter"); // exits the list
    await page.keyboard.type("plain");

    expect(await activeTabContent(page)).toBe("- first\n- second\nplain");
  });

  test("action continuation (#12): Enter on an action line starts a new open action", async ({ page }) => {
    await typeInEditor(page, "# first task");
    await page.keyboard.press("Enter"); // continues as a new open action
    await page.keyboard.type("second task");
    await page.keyboard.press("Enter"); // empty action line
    await page.keyboard.press("Enter"); // exits — symbol removed
    await page.keyboard.type("plain line");

    expect(await activeTabContent(page)).toBe("# first task\n# second task\nplain line");
    expect((await statusCounts(page)).open).toBe(2);
  });

  test("action continuation (#12): a done/deferred line still spawns an *open* action, and Enter mid-line splits it", async ({ page }) => {
    await typeInEditor(page, "v shipped the thing");
    // walk the caret back to just before "the thing", then split there
    for (let i = 0; i < "the thing".length; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");

    expect(await activeTabContent(page)).toBe("v shipped \n# the thing");
    expect((await statusCounts(page)).open).toBe(1);
    expect((await statusCounts(page)).closed).toBe(1);
  });

  test("action continuation (#12): Shift+Enter stays a plain newline", async ({ page }) => {
    await typeInEditor(page, "# a task");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("continued prose");

    expect(await activeTabContent(page)).toBe("# a task\ncontinued prose");
  });

  test("#34: Enter with the caret before the glyph is a plain newline, no duplicated symbol", async ({ page }) => {
    await typeInEditor(page, "# a task");
    await page.keyboard.press("ControlOrMeta+Home"); // caret to the very start, before `#`
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("\n# a task");
  });

  test("#34: Enter on a plain `=> ` follow-up continues as `=> ` — no action symbol added", async ({ page }) => {
    await typeInEditor(page, "=> chase the vendor");
    await page.keyboard.press("Enter");
    await page.keyboard.type("call them back");
    await page.keyboard.press("Enter"); // empty `=> ` line
    await page.keyboard.press("Enter"); // exits
    await page.keyboard.type("plain");

    expect(await activeTabContent(page)).toBe("=> chase the vendor\n=> call them back\nplain");
  });

  test("#34: Enter on a `=> # ` consequence-action continues as a fresh open `=> # `", async ({ page }) => {
    await typeInEditor(page, "=> # ship the docs");
    await page.keyboard.press("Enter");
    await page.keyboard.type("write the notes");

    expect(await activeTabContent(page)).toBe("=> # ship the docs\n=> # write the notes");
  });

  test("resolved lines (v, x) are dimmed (opacity 0.72) and restore full opacity (1) when caret is on the line", async ({ page }) => {
    await setEditorText(page, "# open line\nv done line");

    const lines = editor(page).locator(".cm-line");
    await expect(lines).toHaveCount(2);

    // Click on first line so caret is on line 1 (# open line)
    await lines.first().click();

    // Line 2 should have cm-line-resolved with opacity 0.72
    await expect(lines.nth(1)).toHaveClass(/\bcm-line-resolved\b/);
    const dimmedOpacity = await lines.nth(1).evaluate((el) => window.getComputedStyle(el).opacity);
    expect(parseFloat(dimmedOpacity)).toBeCloseTo(0.72, 2);

    // Move caret to line 2 (v done line)
    await page.keyboard.press("ArrowDown");

    // Line 2 should now receive cm-line-resolved-active and restore opacity 1
    await expect(lines.nth(1)).toHaveClass(/\bcm-line-resolved-active\b/);
    await expect
      .poll(async () => {
        const op = await lines.nth(1).evaluate((el) => window.getComputedStyle(el).opacity);
        return parseFloat(op);
      })
      .toBeCloseTo(1.0, 2);
  });
});
