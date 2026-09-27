import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, typeInEditor } from "./helpers";

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

  test("v0.12 topic pill: hidden parentheses are the padding, so the text after it never moves — idle or being edited", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    // Line 0 is the raw twin ("= " is as wide as the "# " glyph and is not an action, so no pill).
    await setEditorText(page, ["= (billing) chase it now", "# (billing) chase it now"].join("\n"));
    const measure = () =>
      page.evaluate(() => {
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
        const paren = lines[1].querySelector<HTMLElement>(".glyph-topic-paren");
        const pill = lines[1].querySelector<HTMLElement>(".glyph-topic");
        return {
          delta: xOf(lines[1], "chase") - xOf(lines[0], "chase"),
          parenColor: paren ? getComputedStyle(paren).color : "",
          italic: pill ? getComputedStyle(pill).fontStyle : "",
          border: pill ? getComputedStyle(pill).borderTopColor : "",
          radius: pill ? getComputedStyle(pill).borderTopLeftRadius : "",
          touched: lines[1].classList.contains("cm-line-touched"),
        };
      });

    // Caret on the raw line: the pill's line is idle.
    await page.keyboard.press("ControlOrMeta+Home");
    await expect.poll(async () => (await measure()).touched).toBe(false);
    const idle = await measure();
    expect(Math.abs(idle.delta)).toBeLessThan(1);
    expect(idle.parenColor).toBe("rgba(0, 0, 0, 0)"); // transparent
    expect(idle.italic).toBe("normal");
    expect(idle.radius).toBe("4px");

    // Caret on the pill's line: the parentheses show, and nothing moved.
    await page.keyboard.press("ControlOrMeta+End");
    await expect.poll(async () => (await measure()).touched).toBe(true);
    await page.waitForTimeout(250); // the colour transition
    const editing = await measure();
    expect(Math.abs(editing.delta)).toBeLessThan(1);
    expect(editing.parenColor).not.toBe("rgba(0, 0, 0, 0)");
    // No accent border on the focused line: the pill looks the same, apart from the parentheses.
    expect(editing.border).toBe(idle.border);
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

  test("#93: the caret after an open glyph with no following text sits past the trailing space, not against the shrunk checkbox", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    // A reference x for "end of a real 2-character cell": two plain
    // characters, measured independent of any glyph/transform. This is
    // where the caret *should* land after `# ` — comparing against the
    // glyph's own (possibly transformed) box would be circular, since
    // CodeMirror measures the caret off that same widget node.
    await setEditorText(page, "AA");
    const refRight = await page.evaluate(() => {
      const t = document.querySelector(".cm-line")!.firstChild!;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 2);
      return r.getBoundingClientRect().right;
    });

    await typeInEditor(page, "# ", { clear: true });
    // CodeMirror's cursor overlay can briefly report a stale position (still
    // at column 0) right after the last keystroke before it settles — a real
    // race caught in CI, not a rendering difference; poll instead of a
    // single read.
    await expect
      .poll(async () => {
        const cursorLeft = await page.evaluate(
          () => document.querySelector<HTMLElement>(".cm-cursor-primary")!.getBoundingClientRect().left,
        );
        return Math.abs(cursorLeft - refRight);
      })
      .toBeLessThan(1.5);
  });

  test("find exact pixel edges of action box vs topic circle", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "# Action Open",
        "v Action Done",
        "> Action Progress",
        "o Topic Open",
        ". Topic Done",
        ", Topic Skipped",
      ].join("\n"),
    );

    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    const line1 = page.locator(".cm-line").nth(0);
    const line2 = page.locator(".cm-line").nth(3); // Line 4 is 'o Topic Open'

    const line1Buf = await line1.screenshot();
    const line2Buf = await line2.screenshot();

    const scan = await page.evaluate(async ({ b1, b2 }) => {
      function getInkPixels(base64: string) {
        return new Promise<{ topY: number; bottomY: number; leftX: number; rightX: number; w: number; h: number }>((resolve) => {
          const img = new Image();
          img.src = "data:image/png;base64," + base64;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, img.width, img.height).data;
            let topY = 999, bottomY = -1, leftX = 999, rightX = -1;
            // Scan x: 0..30 (the glyph)
            for (let y = 0; y < img.height; y++) {
              for (let x = 0; x < 30; x++) {
                const idx = (y * img.width + x) * 4;
                const r = d[idx], g = d[idx+1], b = d[idx+2];
                // Cyan color: high blue and green, lower red
                if (b > 150 && r < 120) {
                  if (y < topY) topY = y;
                  if (y > bottomY) bottomY = y;
                  if (x < leftX) leftX = x;
                  if (x > rightX) rightX = x;
                }
              }
            }
            resolve({ topY, bottomY, leftX, rightX, w: rightX - leftX + 1, h: bottomY - topY + 1 });
          };
        });
      }

      const box1 = await getInkPixels(b1);
      const circle2 = await getInkPixels(b2);

      return {
        box1,
        circle2,
        topDiff: circle2.topY - box1.topY,
      };
    }, { b1: line1Buf.toString("base64"), b2: line2Buf.toString("base64") });

    // Assert top alignment within 1px (identical line height)
    expect(Math.abs(scan.topDiff)).toBeLessThanOrEqual(1);
    // Assert width within 1px
    expect(Math.abs(scan.circle2.w - scan.box1.w)).toBeLessThanOrEqual(1);
  });

  test("verify bottom of action and agenda topic glyphs touches the d baseline", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    // Switch to dark theme to match user's screenshot environment
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    await setEditorText(
      page,
      [
        "test",
        "====",
        "o d to be discussed => # jksas",
        ". d discussed",
        ", d did not discuss",
        "# d open action",
        "v d done action",
        "x d cancelled action",
        "> d deferred action",
      ].join("\n"),
    );
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(300);

    const content = page.locator(".cm-content");
    const buf = await content.screenshot();

    const contentBox = await content.boundingBox();

    const analysis = await page.evaluate(async ({ base64, cBox }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + base64;
      await new Promise((r) => (img.onload = r));
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;

      function getInkBottom(box: DOMRect) {
        const x0 = Math.max(0, Math.floor(box.left - cBox.x));
        const x1 = Math.min(img.width - 1, Math.ceil(box.right - cBox.x));
        const y0 = Math.max(0, Math.floor(box.top - cBox.y));
        const y1 = Math.min(img.height - 1, Math.ceil(box.bottom - cBox.y));

        let bottomY = -1;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const idx = (y * img.width + x) * 4;
            const r = d[idx], g = d[idx + 1], b = d[idx + 2], a = d[idx + 3];
            if (a > 50 && (r > 60 || g > 60 || b > 60)) {
              if (y > bottomY) bottomY = y;
            }
          }
        }
        return { x0, x1, y0, y1, bottomY };
      }

      const lines = document.querySelectorAll(".cm-line");
      const results: any[] = [];

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i];
        const text = (line as HTMLElement).innerText;

        const glyph = line.querySelector('[class*="glyph-"]');
        const glyphInk = glyph?.querySelector(".glyph-ink") || glyph;

        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let n: Node | null, dBox: DOMRect | null = null;
        while ((n = walker.nextNode())) {
          const idx = n.nodeValue!.indexOf("d");
          if (idx !== -1) {
            const r = document.createRange();
            r.setStart(n, idx);
            r.setEnd(n, idx + 1);
            dBox = r.getBoundingClientRect();
            break;
          }
        }

        let consequenceInk: Element | null = null;
        const allGlyphs = line.querySelectorAll('[class*="glyph-"]');
        if (allGlyphs.length > 1) {
          const last = allGlyphs[allGlyphs.length - 1];
          consequenceInk = last.querySelector(".glyph-ink") || last;
        }

        const glyphScan = glyphInk ? getInkBottom(glyphInk.getBoundingClientRect()) : null;
        const dScan = dBox ? getInkBottom(dBox) : null;
        const conseqScan = consequenceInk ? getInkBottom(consequenceInk.getBoundingClientRect()) : null;

        results.push({
          lineIndex: i,
          text,
          glyphBottom: glyphScan ? glyphScan.bottomY : -1,
          dBottom: dScan ? dScan.bottomY : -1,
          diff: glyphScan && dScan ? glyphScan.bottomY - dScan.bottomY : null,
          consequenceBottom: conseqScan ? conseqScan.bottomY : -1,
          consequenceDiff: conseqScan && dScan ? conseqScan.bottomY - dScan.bottomY : null,
        });
      }

      // Generate a 3x zoomed canvas with yellow guideline at dBottom
      const zoomCanvas = document.createElement("canvas");
      zoomCanvas.width = img.width * 3;
      zoomCanvas.height = img.height * 3;
      const zCtx = zoomCanvas.getContext("2d")!;
      zCtx.imageSmoothingEnabled = false;
      zCtx.drawImage(img, 0, 0, zoomCanvas.width, zoomCanvas.height);

      zCtx.strokeStyle = "rgba(255, 230, 0, 0.85)";
      zCtx.lineWidth = 1;
      for (const r of results) {
        if (r.dBottom !== -1) {
          zCtx.beginPath();
          zCtx.moveTo(0, (r.dBottom + 1) * 3);
          zCtx.lineTo(zoomCanvas.width, (r.dBottom + 1) * 3);
          zCtx.stroke();
        }
      }

      window["_baselineImg"] = zoomCanvas.toDataURL();

      return results;
    }, { base64: buf.toString("base64"), cBox: contentBox! });

    for (const r of analysis) {
      if (r.diff !== null) {
        // Must align with the baseline of 'd' within 1px (anti-aliasing tolerance)
        expect(Math.abs(r.diff)).toBeLessThanOrEqual(1);
      }
      if (r.consequenceDiff != null) {
        expect(Math.abs(r.consequenceDiff)).toBeLessThanOrEqual(1);
      }
    }

    const baselineDataUrl = await page.evaluate(() => window["_baselineImg"] as string);
    const fs = await import("fs");
    if (!fs.existsSync("test-results")) {
      fs.mkdirSync("test-results", { recursive: true });
    }
    fs.writeFileSync("test-results/our-render-with-baseline.png", Buffer.from(baselineDataUrl.split(",")[1], "base64"));
  });

  test("baseline alignment is preserved across all supported line heights", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    const testLines = [
      "o d to be discussed => # jksas",
      ". d discussed",
      ", d did not discuss",
      "# d open action",
      "v d done action",
    ].join("\n");

    const lineHeights = [1.3, 1.4, 1.5, 1.6, 1.7, 1.8];

    for (const lh of lineHeights) {
      await page.evaluate((val) => {
        document.documentElement.style.setProperty("--editor-line-height", val.toString());
      }, lh);
      await setEditorText(page, testLines);
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.waitForTimeout(150);

      const content = page.locator(".cm-content");
      const buf = await content.screenshot();
      const contentBox = await content.boundingBox();

      const diffs = await page.evaluate(async ({ base64, cBox }) => {
        const img = new Image();
        img.src = "data:image/png;base64," + base64;
        await new Promise((r) => (img.onload = r));
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, img.width, img.height).data;

        function getInkBottom(box: DOMRect) {
          const x0 = Math.max(0, Math.floor(box.left - cBox.x));
          const x1 = Math.min(img.width - 1, Math.ceil(box.right - cBox.x));
          const y0 = Math.max(0, Math.floor(box.top - cBox.y));
          const y1 = Math.min(img.height - 1, Math.ceil(box.bottom - cBox.y));

          let bottomY = -1;
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const idx = (y * img.width + x) * 4;
              const r = d[idx], g = d[idx + 1], b = d[idx + 2], a = d[idx + 3];
              if (a > 50 && (r > 60 || g > 60 || b > 60)) {
                if (y > bottomY) bottomY = y;
              }
            }
          }
          return bottomY;
        }

        const lines = document.querySelectorAll(".cm-line");
        const res: number[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const glyph = line.querySelector('[class*="glyph-"]');
          const glyphInk = glyph?.querySelector(".glyph-ink") || glyph;

          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          let n: Node | null, dBox: DOMRect | null = null;
          while ((n = walker.nextNode())) {
            const idx = n.nodeValue!.indexOf("d");
            if (idx !== -1) {
              const r = document.createRange();
              r.setStart(n, idx);
              r.setEnd(n, idx + 1);
              dBox = r.getBoundingClientRect();
              break;
            }
          }

          if (glyphInk && dBox) {
            const gBottom = getInkBottom(glyphInk.getBoundingClientRect());
            const dBottom = getInkBottom(dBox);
            if (gBottom !== -1 && dBottom !== -1) {
              res.push(gBottom - dBottom);
            }
          }
        }
        return res;
      }, { base64: buf.toString("base64"), cBox: contentBox! });

      for (const diff of diffs) {
        expect(Math.abs(diff)).toBeLessThanOrEqual(1);
      }
    }
  });
});

