import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  activeTabContent,
  statusCounts,
  cursorLine,
  mockNote,
  todayFilename,
  toast,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
  activeTabLabel,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";
import { addDaysISO, parseDueWord } from "../../src/lib/date";

const GLYPH_SEL = [
  ".glyph-open",
  ".glyph-done",
  ".glyph-progress",
  ".glyph-cancelled",
  ".glyph-topic-open",
  ".glyph-topic-done",
  ".glyph-topic-skipped",
  ".glyph-bullet",
  ".glyph-emphasis-line",
  ".glyph-followup",
  ".glyph-cyclable",
].join(", ");

const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

async function measureTextX(page: Page, lineIndex: number, needle: string): Promise<number> {
  return page.evaluate(
    ({ idx, sub }) => {
      const line = document.querySelectorAll<HTMLElement>(".cm-content .cm-line")[idx];
      if (!line) return NaN;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const at = (node.nodeValue ?? "").indexOf(sub);
        if (at !== -1) {
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + 1);
          return r.getBoundingClientRect().left;
        }
      }
      return NaN;
    },
    { idx: lineIndex, sub: needle },
  );
}

async function measureOneCh(page: Page, plainLineIndex: number): Promise<number> {
  return page.evaluate((idx) => {
    const line = document.querySelectorAll<HTMLElement>(".cm-content .cm-line")[idx];
    if (!line) return NaN;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if ((node.nodeValue ?? "").length > 0) {
        const r = document.createRange();
        r.setStart(node, 0);
        r.setEnd(node, 1);
        return r.getBoundingClientRect().width;
      }
    }
    return NaN;
  }, plainLineIndex);
}

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

async function externallyWrite(page: Page, filename: string, content: string): Promise<void> {
  await page.evaluate(
    ({ f, c }) => {
      window.__CHRONO_MOCK__!.setNote(f, c);
    },
    { f: filename, c: content },
  );
}

async function checkDrift(page: Page): Promise<void> {
  await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.checkDrift());
}

async function triggerApplyPhoneChanges(page: Page): Promise<void> {
  // Focus without clicking: a click would move the caret the test is about.
  await editor(page).focus();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = modalCard(page, MODAL_LABELS.commandPalette);
  await expect(palette).toBeVisible();
  await palette.locator(".modal-input").fill("Apply phone changes");
  const row = palette.locator('.modal-item[role="option"]', { hasText: /apply phone changes/i }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test.describe("Editor batch 4 — independent tests", () => {
  // ==========================================================================
  // Rule 1 (decision D6). A marker is its symbol plus exactly one space
  // ==========================================================================
  test.describe("Rule 1: a marker is its symbol plus exactly one space", () => {
    test("1.1: #  task and #   task render one open glyph, keep extra spaces visible, and count 1 open each", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# task\n#  task\n#   task\nplain");

      const lines = editor(page).locator(".cm-line");
      await expect(lines.nth(0).locator(".glyph-open")).toHaveCount(1);
      await expect(lines.nth(1).locator(".glyph-open")).toHaveCount(1);
      await expect(lines.nth(2).locator(".glyph-open")).toHaveCount(1);

      const oneCh = await measureOneCh(page, 3);
      const x0 = await measureTextX(page, 0, "task");
      const x1 = await measureTextX(page, 1, "task");
      const x2 = await measureTextX(page, 2, "task");

      expect(Math.abs(x1 - x0 - oneCh)).toBeLessThan(1.5);
      expect(Math.abs(x2 - x0 - 2 * oneCh)).toBeLessThan(1.5);
      expect(await statusCounts(page)).toEqual({ open: 3, closed: 0, forwarded: 0 });
      expect(await activeTabContent(page)).toBe("# task\n#  task\n#   task\nplain");
    });

    test("1.2: every action and topic symbol with 2 and 3 spaces renders its glyph and keeps extra spaces visible", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });

      const cases: Array<{
        sym: string;
        glyph: string;
        counts: { open: number; closed: number; forwarded: number };
      }> = [
        { sym: "#", glyph: ".glyph-open", counts: { open: 3, closed: 0, forwarded: 0 } },
        { sym: "v", glyph: ".glyph-done", counts: { open: 0, closed: 3, forwarded: 0 } },
        { sym: ">", glyph: ".glyph-progress", counts: { open: 0, closed: 0, forwarded: 3 } },
        { sym: "x", glyph: ".glyph-cancelled", counts: { open: 0, closed: 3, forwarded: 0 } },
        { sym: "o", glyph: ".glyph-topic-open", counts: { open: 0, closed: 0, forwarded: 0 } },
        { sym: ".", glyph: ".glyph-topic-done", counts: { open: 0, closed: 0, forwarded: 0 } },
        { sym: ",", glyph: ".glyph-topic-skipped", counts: { open: 0, closed: 0, forwarded: 0 } },
      ];

      for (const c of cases) {
        await setEditorText(page, `${c.sym} item\n${c.sym}  item\n${c.sym}   item\nplain`);
        const lines = editor(page).locator(".cm-line");
        await expect(lines.nth(0).locator(c.glyph), `${c.sym} (1 space)`).toHaveCount(1);
        await expect(lines.nth(1).locator(c.glyph), `${c.sym} (2 spaces)`).toHaveCount(1);
        await expect(lines.nth(2).locator(c.glyph), `${c.sym} (3 spaces)`).toHaveCount(1);

        const oneCh = await measureOneCh(page, 3);
        const x0 = await measureTextX(page, 0, "item");
        const x1 = await measureTextX(page, 1, "item");
        const x2 = await measureTextX(page, 2, "item");
        expect(Math.abs(x1 - x0 - oneCh), `${c.sym} 2 spaces offset`).toBeLessThan(1.5);
        expect(Math.abs(x2 - x0 - 2 * oneCh), `${c.sym} 3 spaces offset`).toBeLessThan(1.5);
        expect(await statusCounts(page), `${c.sym} counts`).toEqual(c.counts);
      }
    });

    test("1.3: =>  # call (2 and 3 spaces after arrow) renders arrow + open box, counts open, and appears in Actions view", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "=> # call\n=>  # call\n=>   # call\nplain");

      const lines = editor(page).locator(".cm-line");
      for (const i of [0, 1, 2]) {
        await expect(lines.nth(i).locator(".glyph-followup")).toHaveCount(1);
        await expect(lines.nth(i).locator(".glyph-open")).toHaveCount(1);
      }
      const oneCh = await measureOneCh(page, 3);
      const x0 = await measureTextX(page, 0, "call");
      const x1 = await measureTextX(page, 1, "call");
      const x2 = await measureTextX(page, 2, "call");
      expect(Math.abs(x1 - x0 - oneCh)).toBeLessThan(1.5);
      expect(Math.abs(x2 - x0 - 2 * oneCh)).toBeLessThan(1.5);

      expect(await statusCounts(page)).toEqual({ open: 3, closed: 0, forwarded: 0 });

      for (const width of [1280, 900]) {
        await page.setViewportSize({ width, height: 800 });
        const view = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
        await expect(view.locator('.modal-item[role="option"]')).toHaveCount(3);
        await expect(view.locator(".modal-counter")).toContainText(/3 open/);
        await page.keyboard.press("Escape");
        await expect(view).toBeHidden();
      }
    });

    test("1.4: =>  sym item and =>   sym item work for every action and topic symbol", async ({ page }) => {
      await seedApp(page, { seed: "empty" });

      const cases: Array<{
        sym: string;
        glyph: string;
        counts: { open: number; closed: number; forwarded: number };
      }> = [
        { sym: "#", glyph: ".glyph-open", counts: { open: 2, closed: 0, forwarded: 0 } },
        { sym: "v", glyph: ".glyph-done", counts: { open: 0, closed: 2, forwarded: 0 } },
        { sym: ">", glyph: ".glyph-progress", counts: { open: 0, closed: 0, forwarded: 2 } },
        { sym: "x", glyph: ".glyph-cancelled", counts: { open: 0, closed: 2, forwarded: 0 } },
        { sym: "o", glyph: ".glyph-topic-open", counts: { open: 0, closed: 0, forwarded: 0 } },
        { sym: ".", glyph: ".glyph-topic-done", counts: { open: 0, closed: 0, forwarded: 0 } },
        { sym: ",", glyph: ".glyph-topic-skipped", counts: { open: 0, closed: 0, forwarded: 0 } },
      ];

      for (const c of cases) {
        await setEditorText(page, `=>  ${c.sym} item\n=>   ${c.sym} item`);
        const lines = editor(page).locator(".cm-line");
        await expect(lines.nth(0).locator(".glyph-followup")).toHaveCount(1);
        await expect(lines.nth(0).locator(c.glyph), `=>  ${c.sym}`).toHaveCount(1);
        await expect(lines.nth(1).locator(".glyph-followup")).toHaveCount(1);
        await expect(lines.nth(1).locator(c.glyph), `=>   ${c.sym}`).toHaveCount(1);
        expect(await statusCounts(page), `=> ${c.sym} counts`).toEqual(c.counts);
      }
    });

    test("1.5: =>  #  (bug) fix matches #  (bug) fix for topic tag and never yields a topic tag without its action", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "#  (bug) fix\n=>  #  (bug) fix\n# (bug) fix\n=> # (bug) fix");

      const lines = editor(page).locator(".cm-line");
      await expect(lines.nth(0).locator(".glyph-open")).toHaveCount(1);
      await expect(lines.nth(1).locator(".glyph-followup")).toHaveCount(1);
      await expect(lines.nth(1).locator(".glyph-open")).toHaveCount(1);

      // Parity between line start `#  (bug) fix` and follow-up `=>  #  (bug) fix`:
      const lineStartTopicCount = await lines.nth(0).locator(".glyph-topic").count();
      await expect(lines.nth(1).locator(".glyph-topic")).toHaveCount(lineStartTopicCount);

      // Single-space variants definitely produce the (bug) topic pill on both:
      await expect(lines.nth(2).locator(".glyph-open")).toHaveCount(1);
      await expect(lines.nth(2).locator(".glyph-topic")).toHaveText("(bug)");
      await expect(lines.nth(3).locator(".glyph-followup")).toHaveCount(1);
      await expect(lines.nth(3).locator(".glyph-open")).toHaveCount(1);
      await expect(lines.nth(3).locator(".glyph-topic")).toHaveText("(bug)");

      expect(await statusCounts(page)).toEqual({ open: 4, closed: 0, forwarded: 0 });
    });

    test("1.6: #task and other symbols without space stay plain text", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "#task\nvdone\n>fwd\nxwont\notopic\nNotes => #task");

      await expect(editor(page).locator(".glyph-open")).toHaveCount(0);
      await expect(editor(page).locator(".glyph-done")).toHaveCount(0);
      await expect(editor(page).locator(".glyph-progress")).toHaveCount(0);
      await expect(editor(page).locator(".glyph-cancelled")).toHaveCount(0);
      await expect(editor(page).locator(".glyph-topic-open")).toHaveCount(0);
      await expect(editor(page).locator(".glyph-followup")).toHaveCount(1);
      expect(await statusCounts(page)).toEqual({ open: 0, closed: 0, forwarded: 0 });
    });
  });

  // ==========================================================================
  // Rule 2 (decision D7). A backslash keeps a line literal
  // ==========================================================================
  test.describe("Rule 2: a backslash keeps a line literal", () => {
    test("2.1: \\# config is plain text, not counted, excluded from Actions view, stays in file, and renders backslash dimmed", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "\\# config\nplain text");

      const firstLine = editor(page).locator(".cm-line").nth(0);
      await expect(firstLine).toContainText("\\# config");
      await expect(firstLine.locator(GLYPH_SEL)).toHaveCount(0);
      expect(await statusCounts(page)).toEqual({ open: 0, closed: 0, forwarded: 0 });
      expect(await activeTabContent(page)).toBe("\\# config\nplain text");

      await expect.poll(() => mockNote(page, file)).toBe("\\# config\nplain text");

      // Not listed in Actions view
      await page.setViewportSize({ width: 900, height: 720 });
      const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
      await expect(drawer).not.toContainText("config");
      await page.keyboard.press("Escape");

      // Backslash is drawn dimmed compared to plain text
      const dimming = await page.evaluate(() => {
        const lines = document.querySelectorAll<HTMLElement>(".cm-content .cm-line");
        const findCharParent = (el: HTMLElement, ch: string): HTMLElement | null => {
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n: Node | null;
          while ((n = w.nextNode())) {
            if ((n.nodeValue ?? "").includes(ch)) return n.parentElement;
          }
          return null;
        };
        const bsEl = findCharParent(lines[0], "\\");
        const plainEl = findCharParent(lines[1], "p");
        if (!bsEl || !plainEl) return null;
        const bsStyle = getComputedStyle(bsEl);
        const plainStyle = getComputedStyle(plainEl);
        return {
          bsOpacity: Number(bsStyle.opacity),
          plainOpacity: Number(plainStyle.opacity),
          bsColor: bsStyle.color,
          plainColor: plainStyle.color,
        };
      });
      expect(dimming).not.toBeNull();
      const isDimmed =
        dimming!.bsOpacity < dimming!.plainOpacity - 0.05 || dimming!.bsColor !== dimming!.plainColor;
      expect(isDimmed).toBe(true);
    });

    test("2.2: every listed leading marker with a backslash (including indented) stays plain text and uncounted", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      const lines = [
        "\\# config",
        "\\v done",
        "\\> quote",
        "\\x",
        "\\x wont",
        "\\o",
        "\\o topic",
        "\\. discussed",
        "\\, skipped",
        "\\- item",
        "\\* item",
        "\\! note",
        "\\1. not a list",
        "\\=> not a follow-up",
        "  \\# x",
        "  \\- indented bullet",
        "  \\1. indented numbered",
        "plain reference",
      ];
      await setEditorText(page, lines.join("\n"));

      await expect(editor(page).locator(GLYPH_SEL)).toHaveCount(0);
      expect(await statusCounts(page)).toEqual({ open: 0, closed: 0, forwarded: 0 });

      // \! note is not bold
      const emphLine = editor(page).locator(".cm-line").nth(11);
      const emphWeight = await emphLine.evaluate((el) => Number(getComputedStyle(el).fontWeight) || 0);
      expect(emphWeight).toBeLessThan(700);

      // \v done, \> quote, \x wont are not dimmed as resolved lines
      const plainOpacity = await editor(page)
        .locator(".cm-line")
        .last()
        .evaluate((el) => Number(getComputedStyle(el).opacity));
      for (const idx of [1, 2, 4]) {
        const line = editor(page).locator(".cm-line").nth(idx);
        await expect(line).not.toHaveClass(/\bcm-line-resolved\b/);
        const op = await line.evaluate((el) => Number(getComputedStyle(el).opacity));
        expect(op).toBeCloseTo(plainOpacity, 2);
      }

      // Enter at the end of \1. not a list does not continue with "2. "
      await setEditorText(page, "\\1. not a list");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("Enter");
      expect(await activeTabContent(page)).toBe("\\1. not a list\n");
    });

    test("2.3: a \\=> b and a \\=> # b mid-line do not produce an arrow glyph or follow-up part", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "a \\=> b\na \\=> # b");

      await expect(editor(page).locator(".glyph-followup")).toHaveCount(0);
      await expect(editor(page).locator(".glyph-open")).toHaveCount(0);
      expect(await statusCounts(page)).toEqual({ open: 0, closed: 0, forwarded: 0 });
    });

    test("2.4: exports — Markdown keeps \\# config; Print drops backslash and shows # config", async ({
      page,
      context,
    }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.addInitScript(() => {
        window.print = () => {};
        if (window.Window && window.Window.prototype) {
          window.Window.prototype.print = () => {};
        }
      });

      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "\\# config\n\\- item\n\\=> not a follow-up");

      // Markdown keeps \#
      await page.locator("[data-more-trigger]").click();
      await page.locator(".more-actions-item", { hasText: "Export…" }).click();
      const exportModal = page.locator(".export-modal");
      await expect(exportModal).toBeVisible();
      await exportModal.locator("button", { hasText: "Copy as Markdown" }).click();
      const md = await page.evaluate(() => navigator.clipboard.readText());
      expect(md).toContain("\\# config");
      expect(md).not.toContain("- [ ]");

      // Print drops backslash and shows # config
      await page.locator("[data-more-trigger]").click();
      await page.locator(".more-actions-item", { hasText: "Print…" }).click();
      const iframe = page.locator("iframe");
      await expect(iframe).toBeAttached();
      await expect
        .poll(() =>
          page.evaluate(() => document.querySelector("iframe")?.contentDocument?.body?.innerText ?? ""),
        )
        .toContain("# config");
      const printText = await page.evaluate(
        () => document.querySelector("iframe")?.contentDocument?.body?.innerText ?? "",
      );
      expect(printText).toContain("# config");
      expect(printText).not.toContain("\\# config");
    });

    test("2.5: Backspace right after the backslash removes it and activates every marker", async ({ page }) => {
      await seedApp(page, { seed: "empty" });

      const cases: Array<{
        escaped: string;
        unescaped: string;
        bsCol: number;
        glyph: string;
        counts?: { open: number; closed: number; forwarded: number };
      }> = [
        { escaped: "\\# config", unescaped: "# config", bsCol: 1, glyph: ".glyph-open", counts: { open: 1, closed: 0, forwarded: 0 } },
        { escaped: "\\v done", unescaped: "v done", bsCol: 1, glyph: ".glyph-done", counts: { open: 0, closed: 1, forwarded: 0 } },
        { escaped: "\\> quote", unescaped: "> quote", bsCol: 1, glyph: ".glyph-progress", counts: { open: 0, closed: 0, forwarded: 1 } },
        { escaped: "\\x wont", unescaped: "x wont", bsCol: 1, glyph: ".glyph-cancelled", counts: { open: 0, closed: 1, forwarded: 0 } },
        { escaped: "\\o topic", unescaped: "o topic", bsCol: 1, glyph: ".glyph-topic-open" },
        { escaped: "\\. discussed", unescaped: ". discussed", bsCol: 1, glyph: ".glyph-topic-done" },
        { escaped: "\\, skipped", unescaped: ", skipped", bsCol: 1, glyph: ".glyph-topic-skipped" },
        { escaped: "\\- item", unescaped: "- item", bsCol: 1, glyph: ".glyph-bullet" },
        { escaped: "\\* item", unescaped: "* item", bsCol: 1, glyph: ".glyph-bullet" },
        { escaped: "\\! note", unescaped: "! note", bsCol: 1, glyph: ".glyph-emphasis-line" },
        { escaped: "\\=> not a follow-up", unescaped: "=> not a follow-up", bsCol: 1, glyph: ".glyph-followup" },
        { escaped: "  \\# x", unescaped: "  # x", bsCol: 3, glyph: ".glyph-open", counts: { open: 1, closed: 0, forwarded: 0 } },
        { escaped: "a \\=> # b", unescaped: "a => # b", bsCol: 3, glyph: ".glyph-followup", counts: { open: 1, closed: 0, forwarded: 0 } },
      ];

      for (const c of cases) {
        await setEditorText(page, c.escaped);
        await editor(page).click();
        await page.keyboard.press("ControlOrMeta+Home");
        for (let i = 0; i < c.bsCol; i++) await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Backspace");

        expect(await activeTabContent(page), c.escaped).toBe(c.unescaped);
        await expect(editor(page).locator(c.glyph), c.escaped).toHaveCount(1);
        if (c.counts) {
          expect(await statusCounts(page), c.escaped).toEqual(c.counts);
        }
      }

      // \1. not a list -> Backspace after \ turns it into a real numbered list item
      await setEditorText(page, "\\1. not a list");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Backspace");
      expect(await activeTabContent(page)).toBe("1. not a list");
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      expect(await activeTabContent(page)).toBe("1. not a list\n2. ");
    });
  });

  // ==========================================================================
  // Rule 3. Links and dates
  // ==========================================================================
  test.describe("Rule 3: links and dates", () => {
    test("3.1: URL containing a date is one URL link with no date link inside it", async ({ page }) => {
      await seedApp(page, {
        seed: {
          notes: {
            "2026-09-07.txt":
              "See https://example.com/2026-11-14/notes and https://example.com/log?date=2026-11-14#top",
            "2026-11-14.txt": "Target date note\n",
          },
          session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        },
      });

      const urlLinks = editor(page).locator(".cm-link");
      await expect(urlLinks).toHaveCount(2);
      await expect(urlLinks.nth(0)).toHaveText("https://example.com/2026-11-14/notes");
      await expect(urlLinks.nth(0)).toHaveAttribute("data-url", "https://example.com/2026-11-14/notes");
      await expect(editor(page).locator(".cm-date-link")).toHaveCount(0);

      await urlLinks.nth(0).click({ modifiers: ["ControlOrMeta"] });
      await expect(activeTabLabel(page)).toHaveText("2026-09-07");
      const opened = await page.evaluate(() => window.__CHRONO_MOCK__!.openedUrls);
      expect(opened).toEqual(["https://example.com/2026-11-14/notes"]);
    });

    test("3.2: forward link to a section with parentheses (>2026-11-20#Sync (Part 1)) is one link to Sync (Part 1)", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 950, height: 750 });
      await seedApp(page, {
        seed: {
          notes: {
            "2026-09-07.txt": [
              "> follow up (>2026-11-20#Sync (Part 1))",
              "# back ref (<2026-09-03#Retro (Team A))",
              "plain (>2026-11-20#Sync (Part 1)) trailing)",
            ].join("\n"),
            "2026-11-20.txt": "Intro\n=====\ntext\n\nSync (Part 1)\n=============\n# action",
            "2026-09-03.txt": "Retro (Team A)\n==============\n# note",
          },
          session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        },
      });

      const lines = editor(page).locator(".cm-line");
      const fwd0 = lines.nth(0).locator(".cm-fwd-link");
      await expect(fwd0).toHaveCount(1);
      await expect(fwd0).toHaveText("(>2026-11-20#Sync (Part 1))");

      const fwd1 = lines.nth(1).locator(".cm-fwd-link");
      await expect(fwd1).toHaveCount(1);
      await expect(fwd1).toHaveText("(<2026-09-03#Retro (Team A))");

      // Balanced parentheses: trailing ')' outside the link is not swallowed
      const fwd2 = lines.nth(2).locator(".cm-fwd-link");
      await expect(fwd2).toHaveCount(1);
      await expect(fwd2).toHaveText("(>2026-11-20#Sync (Part 1))");

      // Actions drawer also renders the full pill
      const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
      await drawer.getByText("Only Open", { exact: false }).click();
      await expect(drawer.locator(".cm-fwd-link", { hasText: "(>2026-11-20#Sync (Part 1))" })).toHaveCount(1);
      await page.keyboard.press("Escape");

      // Ctrl/Cmd+Click navigates to 2026-11-20 on section "Sync (Part 1)" (line 5)
      await fwd0.click({ modifiers: ["ControlOrMeta"] });
      await expect(activeTabLabel(page)).toHaveText("2026-11-20");
      await expect.poll(() => cursorLine(page)).toBe(5);
    });
  });

  // ==========================================================================
  // Rule 4 (decision D10). An impossible due date is marked
  // ==========================================================================
  test.describe("Rule 4: an impossible due date is marked", () => {
    test("4.1: by:2026-02-30, by:2026-13-01, and by:fridy get a wavy underline and 'Not a date' tooltip", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(
        page,
        ["# a by:2026-02-30", "# b by:2026-13-01", "# c by:fridy", "caret line"].join("\n"),
      );
      await editor(page).locator(".cm-line").nth(3).click();

      const expected = ["by:2026-02-30", "by:2026-13-01", "by:fridy"];
      for (let i = 0; i < expected.length; i++) {
        const line = editor(page).locator(".cm-line").nth(i);
        await expect(line.locator(".cm-due")).toHaveCount(0);
        await expect(line.locator(".cm-due-flag")).toHaveCount(0);

        const mark = line.locator(".cm-due-unknown");
        await expect(mark).toHaveCount(1);
        await expect(mark).toHaveText(expected[i]);
        await expect(mark).toHaveAttribute("title", /Not a date/);

        const style = await mark.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { line: cs.textDecorationLine, style: cs.textDecorationStyle };
        });
        expect(style.line).toContain("underline");
        expect(style.style).toBe("wavy");
      }
    });

    test("4.2: rewritable due words (by:fri, by:tomorrow) look as they do now (not wavy) and rewrite on leaving", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# a by:fri\n# b by:tomorrow\nother");
      await editor(page).locator(".cm-line").nth(2).click();

      for (const i of [0, 1]) {
        const line = editor(page).locator(".cm-line").nth(i);
        await expect(line.locator(".cm-due-unknown")).toHaveCount(0);
      }

      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;
      await editor(page).locator(".cm-line").nth(2).click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.type("# c by:fri");
      await page.keyboard.press("Enter");
      await expect.poll(() => activeTabContent(page)).toContain(`# c by:${expectedFriday}`);
    });

    test("4.3: wavy-underlined dates are excluded from the due count and due view", async ({ page }) => {
      await page.setViewportSize({ width: 950, height: 720 });
      const today = REFERENCE_TODAY;

      // With only impossible due dates, #stat-due is hidden
      await seedApp(page, {
        seed: {
          notes: {
            [`${today}.txt`]: ["# bad feb by:2026-02-30", "# bad month by:2026-13-01", "# typo day by:fridy"].join(
              "\n",
            ),
          },
          session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
        },
      });
      await expect(page.locator("#stat-due")).toHaveCount(0);

      // Alongside one real overdue action, count is 1 and due view lists only the real one
      await setEditorText(
        page,
        [
          "# bad feb by:2026-02-30",
          "# bad month by:2026-13-01",
          "# typo day by:fridy",
          "# real overdue by:2026-09-01",
        ].join("\n"),
      );

      const statOverdue = page.locator("#stat-due .stat-due-overdue");
      await expect(statOverdue).toBeVisible();
      await expect(statOverdue.locator(".stat-full")).toHaveText("1 overdue");

      await page.locator("#stat-due").click();
      const drawer = modalCard(page, MODAL_LABELS.actions);
      await expect(drawer).toBeVisible();
      await expect(drawer).toContainText("real overdue");
      await expect(drawer).not.toContainText("bad feb");
      await expect(drawer).not.toContainText("bad month");
      await expect(drawer).not.toContainText("typo day");
    });
  });

  // ==========================================================================
  // Rule 5. Outside changes never split a character, and keep the caret
  // ==========================================================================
  test.describe("Rule 5: outside changes never split a character, and keep the caret", () => {
    test("5.1: outside change next to an emoji yields exact text with no lone surrogate or U+FFFD", async ({
      page,
    }) => {
      const file = todayFilename();
      await seedApp(page, {
        seed: {
          notes: { [file]: "📅 meeting\n" },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("End");

      // Emoji replaced with another emoji sharing the same high surrogate (\uD83D)
      await externallyWrite(page, file, "📆 meeting\n");
      await checkDrift(page);
      await expect.poll(() => activeTabContent(page)).toBe("📆 meeting\n");

      const replacedText = await activeTabContent(page);
      expect(LONE_SURROGATE_RE.test(replacedText)).toBe(false);
      expect(replacedText).not.toContain("\uFFFD");
      await expect(editor(page).locator(".cm-line").nth(0)).toHaveText("📆 meeting");

      // Text inserted right after an emoji
      await externallyWrite(page, file, "📆 urgent meeting\n");
      await checkDrift(page);
      await expect.poll(() => activeTabContent(page)).toBe("📆 urgent meeting\n");

      const insertedText = await activeTabContent(page);
      expect(LONE_SURROGATE_RE.test(insertedText)).toBe(false);
      expect(insertedText).not.toContain("\uFFFD");

      // Another emoji inserted right after the first emoji
      await externallyWrite(page, file, "📆📅 urgent meeting\n");
      await checkDrift(page);
      await expect.poll(() => activeTabContent(page)).toBe("📆📅 urgent meeting\n");

      const twoEmojiText = await activeTabContent(page);
      expect(LONE_SURROGATE_RE.test(twoEmojiText)).toBe(false);
      expect(twoEmojiText).not.toContain("\uFFFD");
    });

    test("5.1b: phone companion change on an emoji line leaves no lone surrogate or U+FFFD", async ({ page }) => {
      const file = todayFilename();
      const inbox = JSON.stringify({
        format: 1,
        writer: "test",
        requests: [
          {
            id: "r1",
            type: "setState",
            date: REFERENCE_TODAY,
            section: "Planning",
            line: "# 📅 meeting",
            n: 3,
            state: "done",
          },
        ],
      });

      await seedApp(page, {
        seed: {
          phoneCompanion: true,
          notes: { [file]: "Planning\n========\n# 📅 meeting\n" },
          session: { openTabs: [file], activeTab: file },
          phoneInbox: inbox,
        },
      });

      await triggerApplyPhoneChanges(page);
      await expect(toast(page)).toContainText("1 change from your phone applied.");
      await expect.poll(() => activeTabContent(page)).toBe("Planning\n========\nv 📅 meeting\n");
      const content = await activeTabContent(page);
      expect(LONE_SURROGATE_RE.test(content)).toBe(false);
      expect(content).not.toContain("\uFFFD");
    });

    test("5.2: on a 5,000-line note, a one-line outside change far from the caret keeps caret text and scroll position", async ({
      page,
    }) => {
      const file = todayFilename();
      const lines = Array.from({ length: 5000 }, (_, i) => `line ${i + 1}`);
      await seedApp(page, {
        seed: {
          notes: { [file]: lines.join("\n") },
          session: { openTabs: [file], activeTab: file },
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Home");
      for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");

      await expect.poll(() => cursorLine(page)).toBe(4990);
      const scroller = page.locator(".cm-scroller");
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
      const scrollBefore = await scroller.evaluate((el) => el.scrollTop);

      // Modify only line 10 externally (far from caret at line 4990)
      const updated = [...lines];
      updated[9] = "line 10 UPDATED OUTSIDE";
      await externallyWrite(page, file, updated.join("\n"));
      await checkDrift(page);
      await expect.poll(() => activeTabContent(page)).toContain("line 10 UPDATED OUTSIDE");

      expect(await cursorLine(page)).toBe(4990);
      const scrollAfter = await scroller.evaluate((el) => el.scrollTop);
      expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(50);

      // Typing proves the caret stayed at the exact character on line 4990
      await page.keyboard.type("Z");
      const outLines = (await activeTabContent(page)).split("\n");
      expect(outLines[4989]).toBe("lineZ 4990");
    });

    test("5.2b: on a 5,000-line note, a phone companion addLine far from the caret keeps caret on the same text and preserves scroll", async ({
      page,
    }) => {
      const file = todayFilename();
      const body = Array.from({ length: 4997 }, (_, i) => `line ${i + 4}`);
      const initialLines = ["Planning", "========", "# first", ...body];
      const inbox = JSON.stringify({
        format: 1,
        writer: "test",
        requests: [
          {
            id: "r1",
            type: "addLine",
            date: REFERENCE_TODAY,
            section: "Planning",
            text: "# from phone",
          },
        ],
      });

      await seedApp(page, {
        seed: {
          phoneCompanion: true,
          notes: { [file]: initialLines.join("\n") },
          session: { openTabs: [file], activeTab: file },
          phoneInbox: inbox,
        },
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Home");
      await expect.poll(() => cursorLine(page)).toBe(4990);

      const scroller = page.locator(".cm-scroller");
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
      const scrollBefore = await scroller.evaluate((el) => el.scrollTop);

      await triggerApplyPhoneChanges(page);
      await expect(toast(page)).toContainText("1 change from your phone applied.");
      await expect.poll(() => activeTabContent(page)).toContain("# from phone");

      const scrollAfter = await scroller.evaluate((el) => el.scrollTop);
      expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(60);

      await page.keyboard.type("Z");
      expect(await activeTabContent(page)).toContain("Zline 4990");
    });
  });

  // ==========================================================================
  // Rule 6. Pasting lists from other apps
  // ==========================================================================
  test.describe("Rule 6: pasting HTML lists from other apps", () => {
    test.beforeEach(async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await editor(page).click();
    });

    test("6.1: <ul><li>&nbsp;item</li></ul> pastes as '- item' (one space)", async ({ page }) => {
      await pasteHtml(page, "<ul><li>&nbsp;item</li></ul>");
      await expect.poll(() => activeTabContent(page)).toBe("- item");
    });

    test("6.2: <ol><li>Step<ul><li><input type='checkbox'> sub</li></ul></li></ol> pastes as '1. Step\\n   - sub'", async ({
      page,
    }) => {
      await pasteHtml(page, '<ol><li>Step<ul><li><input type="checkbox"> sub</li></ul></li></ol>');
      await expect.poll(() => activeTabContent(page)).toBe("1. Step\n   - sub");
    });

    test("6.3: <ul><li>run:<pre>npm i\\nnpm test</pre></li></ul> keeps lines aligned under item text", async ({
      page,
    }) => {
      await pasteHtml(page, "<ul><li>run:<pre>npm i\nnpm test</pre></li></ul>");
      await expect.poll(() => activeTabContent(page)).toBe("- run:\n  npm i\n  npm test");
    });

    test("6.4: Google Docs HTML preserves top-level indent 0 and aria-level='2' one level in", async ({ page }) => {
      const gdocsHtml =
        '<b id="docs-internal-guid-12345678-1234-1234-1234-123456789abc" style="font-weight:normal;">' +
        "<ul>" +
        '<li dir="ltr" aria-level="1"><p dir="ltr">Top</p></li>' +
        "<ul>" +
        '<li dir="ltr" aria-level="2"><p dir="ltr">Sub</p></li>' +
        "</ul>" +
        '<li dir="ltr" aria-level="1"><p dir="ltr">Next</p></li>' +
        "</ul>" +
        "</b>";
      await pasteHtml(page, gdocsHtml);
      await expect.poll(() => activeTabContent(page)).toBe("- Top\n  - Sub\n- Next");
    });

    test("6.5: Word/Outlook mso-list paragraph without mso-list:Ignore span pastes with one marker ('1. text')", async ({
      page,
    }) => {
      const html =
        `<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1">1.\ttext</p>` +
        `<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1">2.  more</p>`;
      await pasteHtml(page, html);
      await expect.poll(() => activeTabContent(page)).toBe("1. text\n2. more");
    });
  });

  // ==========================================================================
  // Rule 7 (decision D9). Dropping text follows the paste rules
  // ==========================================================================
  test.describe("Rule 7: dropping text follows the paste rules", () => {
    test.beforeEach(async ({ page }) => {
      await seedApp(page, { seed: "empty" });
    });

    test("7.1: dropping outside text applies state-first (- # task -> # - task)", async ({ page }) => {
      await dropOutsideOnLine(page, 0, { plain: "- # task" }, { atEnd: false });
      await expect.poll(() => activeTabContent(page)).toBe("# - task");
    });

    test("7.2: dropping outside text rewrites due words (# call by:tomorrow -> ISO date)", async ({ page }) => {
      const expectedTomorrow = addDaysISO(REFERENCE_TODAY, 1);
      await dropOutsideOnLine(page, 0, { plain: "# call by:tomorrow" }, { atEnd: false });
      await expect.poll(() => activeTabContent(page)).toBe(`# call by:${expectedTomorrow}`);
    });

    test("7.3: dropping outside '# task' onto empty '# ' merges marker -> '# task'", async ({ page }) => {
      await setEditorText(page, "# ");
      await dropOutsideOnLine(page, 0, { plain: "# task" }, { atEnd: true });
      await expect.poll(() => activeTabContent(page)).toBe("# task");
    });

    test("7.4: dropping outside numbered items into a list renumbers surrounding items", async ({ page }) => {
      await setEditorText(page, "1. a\n2. \n3. z");
      await dropOutsideOnLine(page, 1, { plain: "1. x\n2. y" }, { atEnd: true });
      await expect.poll(() => activeTabContent(page)).toBe("1. a\n2. x\n3. y\n4. z");
    });

    test("7.5: dropping outside HTML list converts it to ChronoNote list syntax", async ({ page }) => {
      await dropOutsideOnLine(
        page,
        0,
        { html: "<ul><li>One<ul><li>Sub</li></ul></li></ul>", plain: "flat text" },
        { atEnd: false },
      );
      await expect.poll(() => activeTabContent(page)).toBe("- One\n  - Sub");
    });

    test("7.6: dragging text from inside the note applies paste rules (empty-marker merge, state-first, list renumber) in one undo step", async ({
      page,
    }) => {
      // Empty-marker merge + one undo step
      await setEditorText(page, "# task\nplain\n# ");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("Shift+End");

      await dragSelectionToLine(page, 2, "# task", { atEnd: true });
      await expect.poll(() => activeTabContent(page)).toBe("\nplain\n# task");

      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("# task\nplain\n# ");

      // State-first on internal move + one undo step
      await setEditorText(page, "- # task\nplain\n");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("Shift+End");

      await dragSelectionToLine(page, 2, "- # task", { atEnd: false });
      await expect.poll(() => activeTabContent(page)).toBe("\nplain\n# - task");

      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("- # task\nplain\n");

      // List renumber on internal move + one undo step
      await setEditorText(page, "1. first\n2. second\n3. ");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("Shift+End");

      await dragSelectionToLine(page, 2, "1. first", { atEnd: true });
      await expect.poll(() => activeTabContent(page)).toBe("\n1. second\n2. first");

      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => activeTabContent(page)).toBe("1. first\n2. second\n3. ");
    });
  });
});
