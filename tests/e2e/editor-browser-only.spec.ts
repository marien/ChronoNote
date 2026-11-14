import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  activeTabContent,
  statusCounts,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";
import { addDaysISO } from "../../src/lib/date";

/**
 * Browser-only editor tests (test plan step 4): behaviours that depend on a
 * real Chromium DOM/IME/touch/clipboard/drag/layout engine and cannot be
 * exercised in Vitest/jsdom.
 *
 * Expected behaviour comes strictly from `docs/spec.md` (sections 2.2-2.6, 3.6)
 * and `website/guide.html`.
 */

async function composeViaCdp(page: Page, preedit: string, committed: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text: preedit,
    selectionStart: preedit.length,
    selectionEnd: preedit.length,
  });
  if (committed.length > 0) {
    await cdp.send("Input.insertText", { text: committed });
  } else {
    // Empty composition cancels the dead-key / IME preedit session.
    await cdp.send("Input.imeSetComposition", {
      text: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
  }
}

async function writeClipboard(page: Page, payload: { html?: string; plain: string }): Promise<void> {
  await page.evaluate(async ({ html, plain }) => {
    if (html !== undefined) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(plain);
    }
  }, payload);
}

async function dropOutsideOnLine(
  page: Page,
  targetLineIndex: number,
  payload: { plain?: string; html?: string },
  opts: { atEnd?: boolean } = {},
): Promise<void> {
  const atEnd = opts.atEnd ?? true;
  await page.evaluate(
    ({ idx, payload, atEnd }) => {
      const target = document.querySelector(".cm-content");
      if (!target) throw new Error("Could not find .cm-content element");
      const lines = target.querySelectorAll<HTMLElement>(".cm-line");
      const line = lines[idx];
      if (!line) throw new Error(`Could not find .cm-line[${idx}]`);
      const lineRect = line.getBoundingClientRect();
      let clientX = lineRect.left + 8;
      if (atEnd) {
        let lastRight = lineRect.left + Math.min(lineRect.width - 4, 120);
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = walker.nextNode())) {
          const len = (n.nodeValue ?? "").length;
          if (len > 0) {
            const r = document.createRange();
            r.setStart(n, len - 1);
            r.setEnd(n, len);
            lastRight = Math.max(lastRight, r.getBoundingClientRect().right + 4);
          }
        }
        clientX = Math.min(lastRight, lineRect.right - 2);
      }
      const clientY = lineRect.top + lineRect.height / 2;

      const dt = new DataTransfer();
      if (payload.html !== undefined) dt.setData("text/html", payload.html);
      if (payload.plain !== undefined) dt.setData("text/plain", payload.plain);

      target.dispatchEvent(
        new DragEvent("dragover", { dataTransfer: dt, clientX, clientY, bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, clientX, clientY, bubbles: true, cancelable: true }),
      );
    },
    { idx: targetLineIndex, payload, atEnd },
  );
}

async function dragSelectionToLine(
  page: Page,
  targetLineIndex: number,
  fallbackPlain: string,
  opts: { atEnd?: boolean } = {},
): Promise<void> {
  const atEnd = opts.atEnd ?? true;
  await page.evaluate(
    ({ idx, fallbackPlain, atEnd }) => {
      const target = document.querySelector(".cm-content");
      if (!target) throw new Error("Could not find .cm-content element");
      const lines = target.querySelectorAll<HTMLElement>(".cm-line");
      const line = lines[idx];
      if (!line) throw new Error(`Could not find .cm-line[${idx}]`);
      const lineRect = line.getBoundingClientRect();
      let clientX = lineRect.left + 8;
      if (atEnd) {
        let lastRight = lineRect.left + Math.min(lineRect.width - 4, 120);
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = walker.nextNode())) {
          const len = (n.nodeValue ?? "").length;
          if (len > 0) {
            const r = document.createRange();
            r.setStart(n, len - 1);
            r.setEnd(n, len);
            lastRight = Math.max(lastRight, r.getBoundingClientRect().right + 4);
          }
        }
        clientX = Math.min(lastRight, lineRect.right - 2);
      }
      const clientY = lineRect.top + lineRect.height / 2;

      const dt = new DataTransfer();
      target.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true, cancelable: true }));
      if (!dt.getData("text/plain") && fallbackPlain) {
        dt.setData("text/plain", fallbackPlain);
      }
      target.dispatchEvent(
        new DragEvent("dragover", { dataTransfer: dt, clientX, clientY, bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, clientX, clientY, bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(new DragEvent("dragend", { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { idx: targetLineIndex, fallbackPlain, atEnd },
  );
}

// ============================================================================
// 1. Composition and dead keys
// ============================================================================
test.describe("1. Composition and dead keys", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await editor(page).click();
  });

  test("1.1: cancelled dead-key composition at start of empty line then typing '# ' gives an open action", async ({
    page,
  }) => {
    await composeViaCdp(page, "'", "");
    await page.keyboard.type("# task");

    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("# task");
    expect(await statusCounts(page)).toEqual({ open: 1, closed: 0, forwarded: 0 });
  });

  test("1.2: composing '#' at start of empty line then typing ' task' gives an open action", async ({ page }) => {
    await composeViaCdp(page, "#", "#");
    await page.keyboard.type(" task");

    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("# task");
    expect(await statusCounts(page)).toEqual({ open: 1, closed: 0, forwarded: 0 });
  });

  test("1.3: '# caf' + composed '\\u00e9' keeps the action glyph and the text '# caf\\u00e9'", async ({ page }) => {
    await page.keyboard.type("# caf");
    await composeViaCdp(page, "'", "\u00e9");

    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("# caf\u00e9");
    expect(await statusCounts(page)).toEqual({ open: 1, closed: 0, forwarded: 0 });
  });

  test("1.4: dead-key quote followed by space inserts literal '\"' inside an action", async ({ page }) => {
    await page.keyboard.type("# say ");
    await composeViaCdp(page, "\"", "\"");
    await page.keyboard.type("hi");
    await composeViaCdp(page, "\"", "\"");

    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
    expect(await activeTabContent(page)).toBe("# say \"hi\"");
  });

  test("1.5: typing 'by:' + composed character keeps due-word handling sane ('by:' stays text until a date)", async ({
    page,
  }) => {
    const expectedTomorrow = addDaysISO(REFERENCE_TODAY, 1);

    await page.keyboard.type("# task by:");
    await composeViaCdp(page, "'", "\u00e9");

    expect(await activeTabContent(page)).toBe("# task by:\u00e9");
    await expect(editor(page).locator(".cm-due")).toHaveCount(0);

    // Leaving the line with non-date composed text must not produce a valid due pill.
    await page.keyboard.press("Enter");
    await expect(editor(page).locator(".cm-due")).toHaveCount(0);
    expect((await activeTabContent(page)).split("\n")[0]).toBe("# task by:\u00e9");

    // Replacing the composed character with a valid due word and leaving rewrites to the ISO date.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("tomorrow");
    await page.keyboard.press("ArrowDown");

    await expect.poll(() => activeTabContent(page)).toContain(`# task by:${expectedTomorrow}`);
    await expect(editor(page).locator(".cm-due")).toHaveCount(1);
  });

  test("1.6: Enter right after a composition ends continues '# caf\\u00e9' with a new '# '", async ({ page }) => {
    await page.keyboard.type("# caf");
    await composeViaCdp(page, "'", "\u00e9");
    await page.keyboard.press("Enter");

    expect(await activeTabContent(page)).toBe("# caf\u00e9\n# ");
    await expect(editor(page).locator(".glyph-open")).toHaveCount(2);
  });

  test("1.7: one Ctrl+Z undoes the composed character without breaking the line", async ({ page }) => {
    // Establish '# caf' as the baseline before composition so Ctrl+Z targets only the composed character.
    await setEditorText(page, "# caf");
    await editor(page).click();
    await page.keyboard.press("End");

    await composeViaCdp(page, "'", "\u00e9");
    expect(await activeTabContent(page)).toBe("# caf\u00e9");

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => activeTabContent(page)).toBe("# caf");
    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);
  });
});

// ============================================================================
// 2. Touch on the phone layout
// ============================================================================
test.describe("2. Touch on the phone layout", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });

  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.setMobile(true));
  });

  test("2.1: tapping an action or topic glyph toggles it as a click does", async ({ page }) => {
    await setEditorText(page, "# open task\no agenda topic\nv finished task");
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.setMobile(true));

    await editor(page).locator(".glyph-open").first().tap();
    expect(await activeTabContent(page)).toBe("v open task\no agenda topic\nv finished task");

    await editor(page).locator(".glyph-topic-open").first().tap();
    expect(await activeTabContent(page)).toBe("v open task\n. agenda topic\nv finished task");

    await editor(page).locator(".glyph-done").nth(1).tap();
    expect(await activeTabContent(page)).toBe("v open task\n. agenda topic\n# finished task");
  });

  test("2.2: tapping one glyph on a multi-part line toggles only that glyph", async ({ page }) => {
    await setEditorText(page, "# first => # second");
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.setMobile(true));

    await editor(page).locator(".glyph-cyclable").nth(1).tap();
    expect(await activeTabContent(page)).toBe("# first => v second");
  });

  test("2.3: phone toolbar state and Bullet buttons act on the line with the caret", async ({ page }) => {
    await setEditorText(page, "first line\nsecond line");
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.setMobile(true));

    // Tap line 2 to focus the editor (bringing up the accessory toolbar) and place the caret there.
    await editor(page).locator(".cm-line").nth(1).tap();
    const toolbar = page.locator(".mobile-accessory-bar");
    await expect(toolbar).toBeVisible();

    await toolbar.getByRole("button", { name: "Open task (box)" }).tap();
    expect(await activeTabContent(page)).toBe("first line\n# second line");

    await toolbar.getByRole("button", { name: "Completed task (check)" }).tap();
    expect(await activeTabContent(page)).toBe("first line\nv second line");

    await toolbar.getByRole("button", { name: "Open task (box)" }).tap();
    expect(await activeTabContent(page)).toBe("first line\n# second line");

    // Bullet lives in the More overflow panel when the caret is on an action line, and combines (# + - -> # - ).
    await toolbar.getByRole("button", { name: "More" }).tap();
    await toolbar.getByRole("button", { name: "Bullet list" }).tap();
    expect(await activeTabContent(page)).toBe("first line\n# - second line");
  });

  test("2.4: phone toolbar Indent and Dedent buttons act on the line with the caret", async ({ page }) => {
    await setEditorText(page, "1. first\n2. second");
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.setMobile(true));

    await editor(page).locator(".cm-line").nth(1).tap();
    const toolbar = page.locator(".mobile-accessory-bar");
    await expect(toolbar).toBeVisible();

    await toolbar.getByRole("button", { name: "Indent (2 spaces)" }).tap();
    expect(await activeTabContent(page)).toBe("1. first\n   1. second");

    await toolbar.getByRole("button", { name: "Dedent (2 spaces)" }).tap();
    expect(await activeTabContent(page)).toBe("1. first\n2. second");
  });

  test("2.5: long-press on a glyph or text line does not lose text", async ({ page }) => {
    const noteText = "# keep this text\nplain line";
    await setEditorText(page, noteText);
    await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.setMobile(true));

    // Long-press the action glyph (500ms+): opens the line menu sheet without toggling or deleting text.
    const glyph = editor(page).locator(".glyph-open").first();
    await glyph.evaluate(async (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      await new Promise((r) => setTimeout(r, 600));
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
    });

    await expect(page.locator(".editor-context-menu")).toBeVisible();
    expect(await activeTabContent(page)).toBe(noteText);
    await page.keyboard.press("Escape");
    await expect(page.locator(".editor-context-menu")).toBeHidden();

    // Long-press on plain text inside the editor must also preserve the full text.
    const plainLine = editor(page).locator(".cm-line").nth(1);
    await plainLine.evaluate(async (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + 20;
      const y = rect.top + rect.height / 2;
      const touch = new Touch({ identifier: 2, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      await new Promise((r) => setTimeout(r, 600));
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
    });

    expect(await activeTabContent(page)).toBe(noteText);
  });
});

// ============================================================================
// 3. Right-click Paste with HTML
// ============================================================================
test.describe("3. Right-click Paste with HTML", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await editor(page).click();
  });

  test("3.1: right-click Paste converts an HTML bullet list into '- ' lines", async ({ page }) => {
    await writeClipboard(page, {
      html: "<ul><li>Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>",
      plain: "Parent\nChild\nSibling",
    });

    await editor(page).locator(".cm-line").first().click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    await menu.locator('.editor-context-icon-btn[aria-label="Paste"]').click();

    await expect.poll(() => activeTabContent(page)).toBe("- Parent\n  - Child\n- Sibling");
    await expect(editor(page).locator(".glyph-bullet")).toHaveCount(3);
  });

  test("3.2: right-click Paste converts an HTML numbered list into '1. ' lines", async ({ page }) => {
    await writeClipboard(page, {
      html: "<ol><li>Step one</li><li>Step two<ol><li>Sub step</li></ol></li></ol>",
      plain: "Step one\nStep two\nSub step",
    });

    await editor(page).locator(".cm-line").first().click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    await menu.locator('.editor-context-icon-btn[aria-label="Paste"]').click();

    await expect.poll(() => activeTabContent(page)).toBe("1. Step one\n2. Step two\n   1. Sub step");
  });

  test("3.3: right-click Paste inserts plain text and non-list HTML as plain text", async ({ page }) => {
    await writeClipboard(page, { plain: "plain alpha\nplain beta" });

    await editor(page).locator(".cm-line").first().click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    await menu.locator('.editor-context-icon-btn[aria-label="Paste"]').click();

    await expect.poll(() => activeTabContent(page)).toBe("plain alpha\nplain beta");

    // Non-list HTML falls back to text/plain per spec 2.4.
    await setEditorText(page, "");
    await editor(page).click();
    await writeClipboard(page, { html: "<p>Hello <b>world</b></p>", plain: "Hello world" });

    await editor(page).locator(".cm-line").first().click({ button: "right" });
    await expect(menu).toBeVisible();
    await menu.locator('.editor-context-icon-btn[aria-label="Paste"]').click();

    await expect.poll(() => activeTabContent(page)).toBe("Hello world");
  });
});

// ============================================================================
// 4. Drag and drop
// ============================================================================
test.describe("4. Drag and drop", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("4.1: dragging selected text within the note moves it in one undo step", async ({ page }) => {
    await setEditorText(page, "alpha\nbeta\ngamma");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Shift+End");

    await dragSelectionToLine(page, 2, "alpha", { atEnd: true });
    await expect.poll(() => activeTabContent(page)).toBe("\nbeta\ngammaalpha");

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => activeTabContent(page)).toBe("alpha\nbeta\ngamma");
  });

  test("4.2: dropping an HTML list from outside converts it like a paste", async ({ page }) => {
    await dropOutsideOnLine(
      page,
      0,
      { html: "<ul><li>One<ul><li>Two</li></ul></li></ul>", plain: "One Two" },
      { atEnd: false },
    );
    await expect.poll(() => activeTabContent(page)).toBe("- One\n  - Two");
    await expect(editor(page).locator(".glyph-bullet")).toHaveCount(2);

    await setEditorText(page, "");
    await dropOutsideOnLine(
      page,
      0,
      { html: "<ol><li>First</li><li>Second</li></ol>", plain: "First Second" },
      { atEnd: false },
    );
    await expect.poll(() => activeTabContent(page)).toBe("1. First\n2. Second");
  });

  test("4.3: dropping plain text starting with a symbol onto an empty '# ' merges like a paste", async ({ page }) => {
    await setEditorText(page, "# ");
    await dropOutsideOnLine(page, 0, { plain: "# call Dana" }, { atEnd: true });
    await expect.poll(() => activeTabContent(page)).toBe("# call Dana");
  });

  test("4.4: dropping an HTML list onto an empty '# ' merges the leading marker like a paste", async ({ page }) => {
    await setEditorText(page, "# ");
    await dropOutsideOnLine(
      page,
      0,
      { html: "<ul><li>buy milk</li><li>send mail</li></ul>", plain: "buy milk\nsend mail" },
      { atEnd: true },
    );
    await expect.poll(() => activeTabContent(page)).toBe("- buy milk\n- send mail");
  });
});

// ============================================================================
// 5. Spell check while typing
// ============================================================================
test.describe("5. Spell check while typing", () => {
  test("5.1: a misspelled word gets its mark after typing pauses", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await editor(page).click();
    await expect(editor(page)).toHaveAttribute("spellcheck", "false");

    await page.keyboard.type("Here is wrods ");
    const mark = editor(page).locator(".cm-misspelled");
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText("wrods");
  });

  test("5.2: the misspelled mark moves with the text when typing before it", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await setEditorText(page, "wrods");

    const mark = editor(page).locator(".cm-misspelled");
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText("wrods");

    await editor(page).click();
    await page.keyboard.press("Home");
    await page.keyboard.type("Prefix ");

    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText("wrods");

    // Wait past the spell-check debounce to confirm the recheck keeps the shifted mark exact.
    await page.waitForTimeout(500);
    expect(await activeTabContent(page)).toBe("Prefix wrods");
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText("wrods");
  });

  test("5.3: a glyph or date pill never gets a misspelled mark", async ({ page }) => {
    await seedApp(page, { seed: { spellCheck: true } });
    await setEditorText(page, "# (teh) wrods by:2026-09-10\n=> @teh sentense\n- mispeled");

    // Trigger a trailing edit and pause so spell check runs after typing too.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" ");

    const marks = editor(page).locator(".cm-misspelled");
    await expect(marks).toHaveCount(3);
    expect(await marks.allTextContents()).toEqual(["wrods", "sentense", "mispeled"]);

    await expect(editor(page).locator(".glyph-open .cm-misspelled")).toHaveCount(0);
    await expect(editor(page).locator(".glyph-followup .cm-misspelled")).toHaveCount(0);
    await expect(editor(page).locator(".glyph-bullet .cm-misspelled")).toHaveCount(0);
    await expect(editor(page).locator(".glyph-topic .cm-misspelled")).toHaveCount(0);
    await expect(editor(page).locator(".glyph-assignee .cm-misspelled")).toHaveCount(0);
    await expect(editor(page).locator(".cm-due .cm-misspelled")).toHaveCount(0);
    await expect(editor(page).locator(".cm-due-flag .cm-misspelled")).toHaveCount(0);
    await expect(editor(page).locator(".cm-date-link .cm-misspelled")).toHaveCount(0);
  });
});
