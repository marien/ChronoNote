import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText } from "./helpers";

/** §79 — a line carrying a token glyph must be exactly as tall as a plain
 * line. The geometric glyph characters (☐ ☑ ☒ » ➔ •) fall back to a
 * symbol font whose glyph box runs ~1px taller than the editor's line
 * box; the CSS pins the glyph `inline-block` to one line so that can't
 * leak into layout. */
const SAMPLER = [
  "plain reference line, no token",
  "# open action",
  "v done action",
  "x wont-do action",
  "> deferred action",
  "  # indented open action",
  "- bulleted item",
  "=> plain follow-up",
  "=> @dana delegated",
  "Talked to Sam => # consequence action",
  "! emphasis line",
  "another plain reference line",
].join("\n");

test.describe("glyph line layout", () => {
  test("every glyph line is the same height as a plain line", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, SAMPLER);

    const heights = await page.$$eval(".cm-line", (els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height * 100) / 100),
    );
    expect(new Set(heights).size).toBe(1);
  });

  test("holds even when the glyph renders from a taller fallback font", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "plain line\n# open action\nplain line");

    // Force the glyph onto Segoe UI Symbol / Emoji — the exact fallback
    // WebView2 uses, and the metrics that caused the bug.
    const heightWithTallFont = await page.evaluate(() => {
      const g = document.querySelector<HTMLElement>(".glyph-open")!;
      g.style.fontFamily = '"Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"';
      const line = g.closest(".cm-line")!;
      return line.getBoundingClientRect().height;
    });
    const plainHeight = await page.$$eval(
      ".cm-line",
      (els) => els[els.length - 1].getBoundingClientRect().height,
    );
    expect(Math.abs(heightWithTallFont - plainHeight)).toBeLessThan(0.5);
  });

  test("the glyph is vertically aligned with the line's own text (§87 / #16)", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# open action");

    // Compare the glyph's vertical centre to the first real character
    // after it, not to the line box — the two should track each other so
    // the glyph reads as part of the line, not floating above it.
    const delta = await page.evaluate(() => {
      const g = document.querySelector<HTMLElement>(".glyph-open")!;
      const line = g.closest(".cm-line")!;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let textNode: Node | null = null;
      while ((textNode = walker.nextNode())) {
        if (textNode.nodeValue && textNode.nodeValue.trim()) break;
      }
      const r = document.createRange();
      r.setStart(textNode!, 0);
      r.setEnd(textNode!, 1);
      const cr = r.getBoundingClientRect();
      const gr = g.getBoundingClientRect();
      return gr.y + gr.height / 2 - (cr.y + cr.height / 2);
    });
    expect(Math.abs(delta)).toBeLessThan(1);
  });

  test("#42: a delegated `@name` / `(topic)` badge doesn't shift text or lengthen the line", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    // Each glyph line paired with its raw equivalent (`== ` and `x ` are
    // the same character width as `=> ` and `# `).
    await setEditorText(
      page,
      [
        "=> @dana chase it now",
        "== @dana chase it now",
        "# (billing) chase it now",
        "x (billing) chase it now",
      ].join("\n"),
    );

    const { assigneeDelta, topicDelta } = await page.evaluate(() => {
      const lines = [...document.querySelectorAll<HTMLElement>(".cm-editor .cm-line")];
      const xOf = (el: HTMLElement, needle: string) => {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = w.nextNode())) {
          const i = n.nodeValue!.indexOf(needle);
          if (i !== -1) {
            const r = document.createRange();
            r.setStart(n, i);
            r.setEnd(n, i + 1);
            return r.getBoundingClientRect().left;
          }
        }
        return NaN;
      };
      return {
        assigneeDelta: xOf(lines[0], "chase") - xOf(lines[1], "chase"),
        topicDelta: xOf(lines[2], "chase") - xOf(lines[3], "chase"),
      };
    });
    // Text after each badge sits on the same column as the un-glyphed line.
    expect(Math.abs(assigneeDelta)).toBeLessThan(1);
    expect(Math.abs(topicDelta)).toBeLessThan(1);
  });

  test("the glyph sits at the column its token started at, not centred in the cell (§87 / #16)", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# open action\n  # indented open\nplain line");

    const { unindented, indented, oneCh } = await page.evaluate(() => {
      const lines = [...document.querySelectorAll<HTMLElement>(".cm-editor .cm-line")];
      // x of column 0, measured from the plain line's first character.
      const t = lines[2].firstChild!;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 1);
      const col0 = r.getBoundingClientRect();
      const g0 = lines[0].querySelector<HTMLElement>(".glyph-open")!.getBoundingClientRect();
      const gi = lines[1].querySelector<HTMLElement>(".glyph-open")!.getBoundingClientRect();
      return {
        unindented: g0.left - col0.left,
        indented: gi.left - col0.left,
        oneCh: col0.width,
      };
    });
    // Unindented glyph starts flush with column 0 (same x as a plain char).
    expect(Math.abs(unindented)).toBeLessThan(1);
    // Indented glyph starts exactly two spaces in — the indentation is
    // real, untouched whitespace.
    expect(Math.abs(indented - 2 * oneCh)).toBeLessThan(1.5);
  });
});
