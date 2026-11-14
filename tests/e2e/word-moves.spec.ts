import { expect, test, type Locator, type Page } from "@playwright/test";
import { activeTabContent, editor, seedApp, setEditorText } from "./helpers";

async function wordModFor(page: Page): Promise<"Alt" | "Control"> {
  const isMac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform));
  return isMac ? "Alt" : "Control";
}

async function coordsOfSubstring(
  line: Locator,
  substr: string,
  charOffsetInSubstr = 1,
): Promise<{ x: number; y: number }> {
  return line.evaluate(
    (el, arg) => {
      const fullText = el.textContent ?? "";
      const matchIdx = fullText.indexOf(arg.substr);
      if (matchIdx === -1) {
        throw new Error(`Substring ${JSON.stringify(arg.substr)} not found in line: ${fullText}`);
      }
      const targetOffset = Math.min(fullText.length - 1, Math.max(0, matchIdx + arg.charOffsetInSubstr));
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      let seen = 0;
      while ((node = walker.nextNode())) {
        const len = (node.textContent ?? "").length;
        if (targetOffset < seen + len) {
          const localPos = targetOffset - seen;
          const range = document.createRange();
          range.setStart(node, localPos);
          range.setEnd(node, Math.min(len, localPos + 1));
          const rect = range.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        seen += len;
      }
      throw new Error(`Offset ${targetOffset} out of range for line: ${fullText}`);
    },
    { substr, charOffsetInSubstr },
  );
}

async function doubleClickSubstring(page: Page, line: Locator, substr: string, offset = 1): Promise<void> {
  const { x, y } = await coordsOfSubstring(line, substr, offset);
  await page.mouse.dblclick(x, y);
}

test.describe("word moves around glyphs, dates, pills and names (D11)", () => {
  test("double-click selects whole topic tag, due pill, date, @name, and numbered marker without space", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "# (bug) task",
        "# plan by:2026-11-20 next",
        "# ping by:fri later",
        "# check by:2026-02-30 soon",
        "see (>2026-11-20#Sync) end",
        "ask @dana-k and @dana.k",
        "12. done",
        "fix-it don't",
      ].join("\n"),
    );

    const lines = editor(page).locator(".cm-line");

    // (bug) topic tag
    await doubleClickSubstring(page, lines.nth(0), "bug", 1);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[0]).toBe("#  task");
    await page.keyboard.press("ControlOrMeta+z");

    // due date pill: clicking date digits selects `by:2026-11-20`, no picker remains open
    await doubleClickSubstring(page, lines.nth(1), "2026-11-20", 3);
    await expect(page.locator(".compact-picker")).toHaveCount(0);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[1]).toBe("# plan  next");
    await page.keyboard.press("ControlOrMeta+z");

    // due date pill: clicking leading `by:` flag also selects whole `by:2026-11-20`
    const dueBox = (await lines.nth(1).locator(".cm-due").boundingBox())!;
    await page.mouse.dblclick(dueBox.x + 3, dueBox.y + dueBox.height / 2);
    await expect(page.locator(".compact-picker")).toHaveCount(0);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[1]).toBe("# plan  next");
    await page.keyboard.press("ControlOrMeta+z");

    // dueWord: by:fri and impossible by:2026-02-30
    await lines.nth(7).click(); // deactivate lines 2 and 3 first
    await doubleClickSubstring(page, lines.nth(2), "fri", 1);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[2]).toBe("# ping  later");
    await page.keyboard.press("ControlOrMeta+z");

    await doubleClickSubstring(page, lines.nth(3), "2026-02-30", 4);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[3]).toBe("# check  soon");
    await page.keyboard.press("ControlOrMeta+z");

    // forward link: double-clicking date selects 10-char YYYY-MM-DD only
    await doubleClickSubstring(page, lines.nth(4), "2026-11-20", 3);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[4]).toBe("see (>#Sync) end");
    await page.keyboard.press("ControlOrMeta+z");

    // @dana-k as a whole, @dana.k stops before `.k`
    await doubleClickSubstring(page, lines.nth(5), "dana-k", 2);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[5]).toBe("ask  and @dana.k");
    await page.keyboard.press("ControlOrMeta+z");

    await doubleClickSubstring(page, lines.nth(5), "dana.k", 2);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[5]).toBe("ask @dana-k and .k");
    await page.keyboard.press("ControlOrMeta+z");

    // numbered marker `12.` without its trailing space
    await doubleClickSubstring(page, lines.nth(6), "12.", 0);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[6]).toBe(" done");
    await page.keyboard.press("ControlOrMeta+z");

    // ordinary prose hyphen word stays normal CodeMirror behaviour
    await doubleClickSubstring(page, lines.nth(7), "fix-it", 1);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[7]).toBe("-it don't");
  });

  test("triple-click whole-line selection and glyph clicks remain unchanged", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# toggle me\nsecond line");

    const lines = editor(page).locator(".cm-line");
    await lines.nth(1).click();

    // Glyph click still toggles `#` -> `v`
    await lines.nth(0).locator(".glyph-cyclable").click();
    expect((await activeTabContent(page)).split("\n")[0]).toBe("v toggle me");

    // Double-click on glyph toggles state without selecting text
    await lines.nth(0).locator(".glyph-cyclable").dblclick();
    expect((await activeTabContent(page)).split("\n")[0]).toBe("v toggle me");

    // Triple-click still selects the whole line
    await lines.nth(1).click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("v toggle me\n");
  });

  test("word-move, selection-extend, word-delete, and plain arrow keys work in editor", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# (bug) task by:2026-11-20 fix\nv 12. done");
    const wordMod = await wordModFor(page);

    const lines = editor(page).locator(".cm-line");
    await lines.nth(0).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Home"); // ensure col 0

    // `# ` -> `(bug)` -> `task` -> `by:2026-11-20` -> select `by:2026-11-20`
    await page.keyboard.press(`${wordMod}+ArrowRight`);
    await page.keyboard.press(`${wordMod}+ArrowRight`);
    await page.keyboard.press(`${wordMod}+ArrowRight`);
    await page.keyboard.press(`${wordMod}+ArrowRight`);
    await page.keyboard.press(`Shift+${wordMod}+ArrowLeft`);
    await page.keyboard.press("Backspace");
    expect((await activeTabContent(page)).split("\n")[0]).toBe("# (bug) task  fix");

    // Undo restores the whole `by:2026-11-20` pill
    await page.keyboard.press("ControlOrMeta+z");
    expect((await activeTabContent(page)).split("\n")[0]).toBe("# (bug) task by:2026-11-20 fix");

    // Word-Backspace from end of by:2026-11-20 removes whole pill in 1 undo step
    await page.keyboard.press("End");
    await page.keyboard.press(`${wordMod}+ArrowLeft`); // before `fix`
    await page.keyboard.press(`${wordMod}+ArrowLeft`); // before `by:2026-11-20`
    await page.keyboard.press(`${wordMod}+ArrowRight`); // after `by:2026-11-20`
    await page.keyboard.press(`${wordMod}+Backspace`);
    expect((await activeTabContent(page)).split("\n")[0]).toBe("# (bug) task  fix");
    await page.keyboard.press("ControlOrMeta+z");
    expect((await activeTabContent(page)).split("\n")[0]).toBe("# (bug) task by:2026-11-20 fix");

    // Word-Delete removes ` by:2026-11-20` forward cleanly
    await page.keyboard.press("Home");
    await page.keyboard.press("Home");
    await page.keyboard.press(`${wordMod}+ArrowRight`); // `# |`
    await page.keyboard.press(`${wordMod}+ArrowRight`); // `# (bug)|`
    await page.keyboard.press(`${wordMod}+ArrowRight`); // `# (bug) task|`
    await page.keyboard.press(`${wordMod}+Delete`);
    expect((await activeTabContent(page)).split("\n")[0]).toBe("# (bug) task fix");

    // Word-Delete on combined lead deletes `v ` only, then plain ArrowRight steps 1 char into `12.`
    await lines.nth(1).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Home");
    await page.keyboard.press(`${wordMod}+Delete`);
    expect((await activeTabContent(page)).split("\n")[1]).toBe("12. done");

    // Plain ArrowRight steps character-by-character inside numbered marker `12. done`
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type("X");
    expect((await activeTabContent(page)).split("\n")[1]).toBe("1X2. done");
  });
});
