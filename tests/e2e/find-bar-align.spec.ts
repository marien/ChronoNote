import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

/** The find bar's text stands on one baseline and its icons are centred, measured on the drawn pixels (where the ink
 * actually is), not on boxes. Marien (§409): the query, "No results", "Aa" and "ab|" should be bottom-aligned on the
 * text; centring each of them on the row (the first attempt) looked messy, since they differ in font and size. */

// The e2e tsconfig has no Node types; Playwright runs specs in Node, where `process` exists.
declare const process: { platform: string };

type Box = { x: number; y: number; width: number; height: number };
type Ink = { top: number; bottom: number };

/** The ink rows of the screenshot of `area` within each of `boxes` (pixels clearly different from the box's own
 * background, sampled at its top-left corner), in page pixels: bottom = the lowest inked row's lower edge. */
async function ink(page: Page, area: Box, boxes: Box[]): Promise<Ink[]> {
  const png = await page.screenshot({ clip: area });
  return page.evaluate(
    async ({ data, area, boxes }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const scale = img.width / area.width;
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const at = (x: number, y: number) => {
        const i = (y * c.width + x) * 4;
        return [px[i], px[i + 1], px[i + 2]];
      };
      return boxes.map((b) => {
        const x0 = Math.round((b.x - area.x) * scale);
        const x1 = Math.round((b.x + b.width - area.x) * scale);
        const y0 = Math.round((b.y - area.y) * scale);
        const y1 = Math.round((b.y + b.height - area.y) * scale);
        const bg = at(x0, y0);
        let top = -1;
        let bottom = -1;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const p = at(x, y);
            if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 90) {
              if (top < 0) top = y;
              bottom = y;
              break;
            }
          }
        }
        return { top: area.y + top / scale, bottom: area.y + (bottom + 1) / scale };
      });
    },
    { data: png.toString("base64"), area, boxes },
  );
}

async function measure(page: Page) {
  await seedApp(page, { seed: { notes: { [todayFilename()]: "alpha beta" } } });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+f");
  const bar = page.locator(".find-bar");
  await expect(bar).toBeVisible();
  // No descenders, so the ink's bottom is the baseline: "wert" (no matches: "No results"), "Aa", and "ab" of "ab|".
  await bar.locator(".find-input").first().fill("wert");
  await expect(bar.locator(".find-count")).toHaveText("No results");
  // Sometimes the query is selected; its highlight would count as ink.
  await bar.locator(".find-input").first().press("End");
  // The blinking text cursor in the query box reaches below the letters: caught by a screenshot, it moved the
  // measured baseline (a flaky failure).
  await page.addStyleTag({ content: ".find-input { caret-color: transparent !important; }" });
  await page.mouse.move(0, 0);
  const row = (await bar.locator(".find-row").first().boundingBox())!;
  const box = async (sel: string) => (await bar.locator(sel).first().boundingBox())!;
  const input = await box(".find-input");
  const count = await box(".find-count");
  const aa = await box('.find-opt-glyph[data-glyph="Aa"]');
  const ab = await box('.find-opt-glyph[data-glyph="ab|"]');
  const rowBand = (b: Box) => ({ x: b.x, y: row.y, width: b.width, height: row.height });
  const text: Array<[string, Box]> = [
    ["query text", { x: input.x + 6, y: input.y + 2, width: input.width - 12, height: input.height - 4 }],
    ["No results", rowBand(count)],
    ["Aa", rowBand(aa)],
    ["ab of ab|", rowBand({ ...ab, width: ab.width * 0.6 })],
  ];
  const icons: Array<[string, Box]> = [];
  const buttons = bar.locator(".find-row").first().locator("button:not(.find-opt-btn)");
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = (await buttons.nth(i).boundingBox())!;
    icons.push([(await buttons.nth(i).getAttribute("aria-label")) ?? `button ${i}`, { x: b.x + 2, y: b.y + 2, width: b.width - 4, height: b.height - 4 }]);
  }
  const area = { x: Math.floor(row.x), y: Math.floor(row.y) - 2, width: Math.ceil(row.width), height: Math.ceil(row.height) + 4 };
  const found = await ink(page, area, [...text, ...icons].map(([, b]) => b));
  const baselines = found.slice(0, text.length).map((f) => f.bottom);
  const base = baselines[0];
  const rowCentre = row.y + row.height / 2;
  console.log(
    [
      ...text.map(([name], i) => `${name}: baseline ${(baselines[i] - base).toFixed(2)} from the query's`),
      ...icons.map(([name], i) => {
        const f = found[text.length + i];
        return `${name}: centre ${((f.top + f.bottom) / 2 - rowCentre).toFixed(2)} from the row's`;
      }),
    ].join("\n"),
  );
  // One device pixel of rounding either way.
  const slack = 1;
  for (const [i, [name]] of text.entries()) {
    expect(Math.abs(baselines[i] - base), `${name}: baseline ${(baselines[i] - base).toFixed(2)} px from the query's`).toBeLessThanOrEqual(slack);
  }
  for (const [i, [name]] of icons.entries()) {
    const f = found[text.length + i];
    const off = (f.top + f.bottom) / 2 - rowCentre;
    expect(Math.abs(off), `${name}: ${off.toFixed(2)} px off the row's centre`).toBeLessThanOrEqual(slack);
  }
}

// Windows fonts only: where the ink falls depends on the font, and the app runs on Windows (CI's Windows layout job
// runs it).
for (const scale of [1, 1.25, 1.5]) {
  test.describe(`at ${scale * 100} %`, () => {
    test.skip(process.platform !== "win32", "measured with Windows fonts");
    test.use({ deviceScaleFactor: scale });
    test("the find bar's text stands on one baseline and its icons are centred", async ({ page }) => {
      await measure(page);
    });
  });
}
