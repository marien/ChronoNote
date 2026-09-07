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

  test("the glyph stays vertically centered in the line box", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# open action");

    const delta = await page.evaluate(() => {
      const g = document.querySelector<HTMLElement>(".glyph-open")!;
      const line = g.closest(".cm-line")!;
      const lr = line.getBoundingClientRect();
      const gr = g.getBoundingClientRect();
      return gr.y + gr.height / 2 - (lr.y + lr.height / 2);
    });
    expect(Math.abs(delta)).toBeLessThan(1);
  });
});
