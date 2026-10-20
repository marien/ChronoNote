import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, readMock } from "./helpers";

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

  // #167: after any edit, putting the caret into a misspelled word (click or arrow keys) hid its underline about 300 ms
  // later, and with it the corrections in the line menu. Only the word being typed may go unmarked.
  test("#167: a word the caret moves into stays marked and keeps its corrections", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await setEditorText(page, "Here is teh wrods in note.\nsecond line");
    await expect(page.locator(".cm-misspelled", { hasText: "wrods" })).toBeVisible();

    // Type somewhere else first: that is what used to switch on the "typing" exclusion for good.
    await page.locator(".cm-line", { hasText: "second line" }).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" more");

    // Caret into the misspelled word with the mouse, then wait past the 300 ms recheck.
    await page.locator(".cm-misspelled", { hasText: "wrods" }).click();
    await page.waitForTimeout(700);
    const wrods = page.locator(".cm-misspelled", { hasText: "wrods" });
    await expect(wrods).toBeVisible();

    // Moving inside it with the keyboard does not hide it either.
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(700);
    await expect(wrods).toBeVisible();

    await wrods.click({ button: "right" });
    await expect(page.locator(".editor-context-menu button.editor-context-item").first()).toHaveText("words");
    await page.keyboard.press("Escape");

    // Typing in the word still hides the mark while typing (no red line under a half-typed word).
    await wrods.click();
    await page.keyboard.type("x");
    await expect(page.locator(".cm-line").first()).toContainText("x"); // the line had no "x" before
    await page.waitForTimeout(700);
    await expect(page.locator(".cm-misspelled", { hasText: /x/ })).toHaveCount(0);
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

  test("with spell check on (mock), Settings shows languages list with Dutch and English ticked by default", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");

    const langBox = page.locator(".spell-languages-box");
    await expect(langBox).toBeVisible();

    const nlCheckbox = langBox.locator(".spell-language-row", { hasText: "(nl-NL)" }).locator("input[type='checkbox']");
    const enCheckbox = langBox.locator(".spell-language-row", { hasText: "(en-US)" }).locator("input[type='checkbox']");

    await expect(nlCheckbox).toBeChecked();
    await expect(enCheckbox).toBeChecked();
  });

  test("unticking English saves to config and survives a reload", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");

    const langBox = page.locator(".spell-languages-box");
    await expect(langBox).toBeVisible();

    const enRow = langBox.locator(".spell-language-row", { hasText: "(en-US)" });
    const enCheckbox = enRow.locator("input[type='checkbox']");
    await expect(enCheckbox).toBeChecked();

    // Untick English
    await enCheckbox.click();
    await expect(enCheckbox).not.toBeChecked();

    // Check mock backend config
    const spellLangs = await readMock(page, () => window.__CHRONO_MOCK__!.spellLanguages);
    expect(spellLangs).toEqual(["nl-NL"]);

    // Reload and reopen settings
    await page.reload();
    await expect(page.locator("#top-bar")).toBeVisible();
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");

    const reloadedBox = page.locator(".spell-languages-box");
    await expect(reloadedBox).toBeVisible();
    const reloadedEn = reloadedBox.locator(".spell-language-row", { hasText: "(en-US)" }).locator("input[type='checkbox']");
    const reloadedNl = reloadedBox.locator(".spell-language-row", { hasText: "(nl-NL)" }).locator("input[type='checkbox']");
    await expect(reloadedEn).not.toBeChecked();
    await expect(reloadedNl).toBeChecked();
  });

  test("last ticked language's checkbox is disabled", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true, spellLanguages: ["nl-NL"] } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");

    const langBox = page.locator(".spell-languages-box");
    await expect(langBox).toBeVisible();

    const nlCheckbox = langBox.locator(".spell-language-row", { hasText: "(nl-NL)" }).locator("input[type='checkbox']");
    await expect(nlCheckbox).toBeChecked();
    await expect(nlCheckbox).toBeDisabled();
  });

  test("with spell check off, languages list is hidden", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: false } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");

    const langBox = page.locator(".spell-languages-box");
    await expect(langBox).toHaveCount(0);
  });

  test("in web backend, no languages list is shown even when spell check is on", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web", spellCheck: true } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");

    const langBox = page.locator(".spell-languages-box");
    await expect(langBox).toHaveCount(0);
  });
});
