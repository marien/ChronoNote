import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent } from "./helpers";

async function charCenter(
  page: Page,
  lineIndex: number,
  needle: string,
  offset = 0,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ idx, text, off }) => {
      const line = document.querySelectorAll<HTMLElement>(".cm-editor .cm-line")[idx];
      if (!line) throw new Error(`Missing .cm-line[${idx}]`);
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const val = node.nodeValue ?? "";
        const found = val.indexOf(text);
        if (found !== -1) {
          const at = found + off;
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          const rect = range.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      }
      throw new Error(`Text ${JSON.stringify(text)} not found in .cm-line[${idx}]`);
    },
    { idx: lineIndex, text: needle, off: offset },
  );
}

async function dblclickChar(page: Page, lineIndex: number, needle: string, offset = 0): Promise<void> {
  const pt = await charCenter(page, lineIndex, needle, offset);
  await page.mouse.dblclick(pt.x, pt.y);
}

async function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

async function wordModKey(page: Page): Promise<"Alt" | "Control"> {
  const isMac = await page.evaluate(() => /Mac|iPod|iPhone|iPad/.test(navigator.platform));
  return isMac ? "Alt" : "Control";
}

test.describe("D11 independent E2E: double-click and word moves around glyphs", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  // =========================================================================
  // Rule 4: Double-click
  // =========================================================================
  test("double-click on 'bug' in '(bug)' selects '(bug)'", async ({ page }) => {
    await setEditorText(page, "# (bug) fix login\nplain line");
    await editor(page).locator(".cm-line").nth(1).click();

    await dblclickChar(page, 0, "bug", 1);
    expect(await selectedText(page)).toBe("(bug)");
  });

  test("double-click anywhere on a due date pill selects 'by:2026-11-20' (digits and by: flag)", async ({
    page,
  }) => {
    await setEditorText(page, "# task by:2026-11-20 urgent\nplain line");
    await editor(page).locator(".cm-line").nth(1).click();

    // Double-click on the date digits
    await dblclickChar(page, 0, "2026-11-20", 5);
    await expect(page.locator(".compact-picker")).toHaveCount(0);
    expect(await selectedText(page)).toBe("by:2026-11-20");

    // Reset caret off the line, then double-click on the `by:` flag part of the pill
    await editor(page).locator(".cm-line").nth(1).click();
    const flagBox = await editor(page).locator(".cm-line").first().locator(".cm-due-flag").boundingBox();
    expect(flagBox).not.toBeNull();
    await page.mouse.dblclick(flagBox!.x + flagBox!.width / 2, flagBox!.y + flagBox!.height / 2);
    await expect(page.locator(".compact-picker")).toHaveCount(0);
    expect(await selectedText(page)).toBe("by:2026-11-20");
  });

  test("double-click on by:fri and impossible by:2026-02-30 selects the full token", async ({ page }) => {
    await setEditorText(page, "# first by:fri\n# second by:2026-02-30\nplain line");
    await editor(page).locator(".cm-line").nth(2).click();

    await dblclickChar(page, 0, "fri", 1);
    expect(await selectedText(page)).toBe("by:fri");

    await editor(page).locator(".cm-line").nth(2).click();
    await dblclickChar(page, 1, "2026-02-30", 5);
    expect(await selectedText(page)).toBe("by:2026-02-30");
  });

  test("double-click on a plain date link or inside '(>2026-11-20)' selects '2026-11-20'", async ({ page }) => {
    await setEditorText(page, "see 2026-11-20 notes\n# task (>2026-11-20#Standup)\nplain line");
    await editor(page).locator(".cm-line").nth(2).click();

    await dblclickChar(page, 0, "2026-11-20", 5);
    expect(await selectedText(page)).toBe("2026-11-20");

    await dblclickChar(page, 1, "2026-11-20", 5);
    expect(await selectedText(page)).toBe("2026-11-20");
  });

  test("double-click on 'dana' selects '@dana', '@dana.k', '@dana-k', and omits trailing '.'", async ({
    page,
  }) => {
    await setEditorText(
      page,
      ["ask @dana now", "ask @dana.k now", "ask @dana-k now", "ask @dana.", "plain line"].join("\n"),
    );
    await editor(page).locator(".cm-line").nth(4).click();

    await dblclickChar(page, 0, "dana", 1);
    expect(await selectedText(page)).toBe("@dana");

    await dblclickChar(page, 1, "dana", 1);
    expect(await selectedText(page)).toBe("@dana.k");

    await dblclickChar(page, 2, "dana", 1);
    expect(await selectedText(page)).toBe("@dana-k");

    await dblclickChar(page, 3, "dana", 1);
    expect(await selectedText(page)).toBe("@dana");
  });

  test("double-click on numbered marker ('12. done', '2) item', '1.1. sub') selects marker without space", async ({
    page,
  }) => {
    await setEditorText(page, ["12. done", "v 12. done", "2) item", "1.1. sub", "plain line"].join("\n"));
    await editor(page).locator(".cm-line").nth(4).click();

    await dblclickChar(page, 0, "12.", 0);
    expect(await selectedText(page)).toBe("12.");

    await dblclickChar(page, 1, "12.", 0);
    expect(await selectedText(page)).toBe("12.");

    await dblclickChar(page, 2, "2)", 0);
    expect(await selectedText(page)).toBe("2)");

    await dblclickChar(page, 3, "1.1.", 2);
    expect(await selectedText(page)).toBe("1.1.");
  });

  test("double-click on an action or topic glyph keeps toggling state and does not select the marker", async ({
    page,
  }) => {
    await setEditorText(page, "# open task\no open topic\nplain line");
    await editor(page).locator(".cm-line").nth(2).click();

    // Observe glyph-state DOM mutations on lines 0 and 1 during double-click
    // (a double-click sends two clicks, so it may toggle # -> v -> # or # -> v).
    await page.evaluate(() => {
      (window as unknown as { __d11Toggles: string[] }).__d11Toggles = [];
      const content = document.querySelector(".cm-content")!;
      const obs = new MutationObserver(() => {
        const lines = document.querySelectorAll(".cm-editor .cm-line");
        const marks = [0, 1].map((i) => lines[i]?.querySelector(".glyph-cyclable")?.className ?? "");
        (window as unknown as { __d11Toggles: string[] }).__d11Toggles.push(marks.join("|"));
      });
      obs.observe(content, { childList: true, subtree: true, attributes: true });
    });

    const actionGlyph = editor(page).locator(".cm-line").nth(0).locator(".glyph-cyclable");
    await actionGlyph.dblclick();
    expect(await selectedText(page)).toBe("");

    const topicGlyph = editor(page).locator(".cm-line").nth(1).locator(".glyph-cyclable");
    await topicGlyph.dblclick();
    expect(await selectedText(page)).toBe("");

    const seen = await page.evaluate(
      () => (window as unknown as { __d11Toggles: string[] }).__d11Toggles,
    );
    expect(seen.some((s) => s.includes("glyph-done"))).toBe(true);
    expect(seen.some((s) => s.includes("glyph-topic-done"))).toBe(true);

    // Single click still toggles cleanly
    const before = (await activeTabContent(page)).split("\n")[0];
    await actionGlyph.click();
    const after = (await activeTabContent(page)).split("\n")[0];
    expect(after).not.toBe(before);
  });

  // =========================================================================
  // Rule 5 & prose: triple-click and prose double-click unchanged
  // =========================================================================
  test("triple-click selects the whole line and double-click on 'fix-it' selects only 'fix'", async ({
    page,
  }) => {
    await setEditorText(
      page,
      ["see 2026-11-20 @dana fix-it", "# task by:2026-11-20 (bug)", "last line"].join("\n"),
    );
    await editor(page).locator(".cm-line").nth(2).click();

    await dblclickChar(page, 0, "fix", 1);
    expect(await selectedText(page)).toBe("fix");

    const pt0 = await charCenter(page, 0, "see", 1);
    await page.mouse.click(pt0.x, pt0.y, { clickCount: 3 });
    expect((await selectedText(page)).trim()).toBe("see 2026-11-20 @dana fix-it");

    // Triple-click on a glyph line selects the entire line including its leading marker
    const pt1 = await charCenter(page, 1, "task", 1);
    await page.mouse.click(pt1.x, pt1.y, { clickCount: 3 });
    await page.keyboard.type("REPLACED");
    const updated = await activeTabContent(page);
    expect(updated).toContain("see 2026-11-20 @dana fix-it");
    expect(updated).toContain("REPLACED");
    expect(updated).toContain("last line");
    expect(updated).not.toContain("# task");
    expect(updated).not.toContain("2026-11-20 (bug)");
  });

  // =========================================================================
  // End-to-end Ctrl+Arrow / Ctrl+Shift+Arrow / Ctrl+Backspace
  // =========================================================================
  test("end-to-end Ctrl+Arrow, Ctrl+Shift+Arrow, and Ctrl+Backspace with undo in browser", async ({
    page,
  }) => {
    const mod = await wordModKey(page);
    await setEditorText(page, "# (bug) task by:2026-11-20 @dana");

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // Step across `# ` (widget glyph), verify caret landed right after `# `
    await page.keyboard.press(`${mod}+ArrowRight`);
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("# X(bug) task by:2026-11-20 @dana");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("# (bug) task by:2026-11-20 @dana");

    // Now extend selection across `(bug)`, `task`, `by:2026-11-20`, `@dana`
    await page.keyboard.press(`${mod}+Shift+ArrowRight`);
    expect(await selectedText(page)).toBe("(bug)");

    await page.keyboard.press(`${mod}+Shift+ArrowRight`);
    expect(await selectedText(page)).toBe("(bug) task");

    await page.keyboard.press(`${mod}+Shift+ArrowRight`);
    expect(await selectedText(page)).toBe("(bug) task by:2026-11-20");

    await page.keyboard.press(`${mod}+Shift+ArrowRight`);
    expect(await selectedText(page)).toBe("(bug) task by:2026-11-20 @dana");

    // Collapse to end, step left over `@dana`, then delete `by:2026-11-20` in one Ctrl+Backspace + undo
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(`${mod}+ArrowLeft`); // `# (bug) task by:2026-11-20 |@dana`
    await page.keyboard.press(`${mod}+Backspace`); // `# (bug) task |@dana`
    expect(await activeTabContent(page)).toBe("# (bug) task @dana");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("# (bug) task by:2026-11-20 @dana");

    // Also test Ctrl+ArrowLeft across `v 12. done` and Ctrl+Backspace at `# task by:2026-11-20|`
    await setEditorText(page, "v 12. done\n# task by:2026-11-20");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");
    await page.keyboard.press(`${mod}+ArrowLeft`); // `v 12. |done`
    await page.keyboard.type("X");
    expect(await activeTabContent(page)).toBe("v 12. Xdone\n# task by:2026-11-20");
    await page.keyboard.press("ControlOrMeta+z");

    await page.keyboard.press(`${mod}+ArrowLeft`); // `v |12. done`
    await page.keyboard.type("Y");
    expect(await activeTabContent(page)).toBe("v Y12. done\n# task by:2026-11-20");
    await page.keyboard.press("ControlOrMeta+z");

    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press(`${mod}+Backspace`);
    expect(await activeTabContent(page)).toBe("v 12. done\n# task ");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("v 12. done\n# task by:2026-11-20");
  });
});
