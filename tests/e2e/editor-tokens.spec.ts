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

  test("Ctrl+Space cycles the action symbol # -> v -> > -> x -> #", async ({ page }) => {
    await typeInEditor(page, "# a task");
    const line = editor(page).locator(".cm-line").first();

    for (const cls of ["glyph-done", "glyph-progress", "glyph-cancelled", "glyph-open"]) {
      await page.keyboard.press("Control+Space");
      await expect(line.locator(`.${cls}`)).toHaveCount(1);
    }
    expect(await activeTabContent(page)).toBe("# a task");
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
});
