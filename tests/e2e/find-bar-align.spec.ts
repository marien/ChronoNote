import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

/** The find bar's controls are vertically centred on one line: measured on the drawn pixels (where the ink of each
 * symbol and text actually is), not on boxes, since a glyph's box says little about where its ink sits (Marien: the
 * input text sat a little high and "Aa" / "ab|" a little low). */

type Box = { x: number; y: number; width: number; height: number };

/** Rows of the screenshot of `area` that hold ink (pixels clearly different from the area's own background, sampled
 * at its top-left corner), within each of `boxes`; returns the vertical centre of the ink per box, in page pixels. */
async function inkCentres(page: Page, area: Box, boxes: Box[]): Promise<number[]> {
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
        return top < 0 ? NaN : area.y + (top + bottom + 1) / 2 / scale;
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
  await page.mouse.move(0, 0);
  const row = (await bar.locator(".find-row").first().boundingBox())!;
  const input = (await bar.locator(".find-input").first().boundingBox())!;
  // The input's text area: inside its border and padding.
  const inputText = { x: input.x + 6, y: input.y + 2, width: input.width - 12, height: input.height - 4 };
  const parts: Array<[string, Box]> = [["input text", inputText]];
  const buttons = bar.locator(".find-row").first().locator("button");
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = (await buttons.nth(i).boundingBox())!;
    parts.push([(await buttons.nth(i).getAttribute("aria-label")) ?? `button ${i}`, { x: b.x + 2, y: b.y + 2, width: b.width - 4, height: b.height - 4 }]);
  }
  const area = { x: Math.floor(row.x), y: Math.floor(row.y) - 2, width: Math.ceil(row.width), height: Math.ceil(row.height) + 4 };
  const centres = await inkCentres(page, area, parts.map(([, b]) => b));
  const rowCentre = row.y + row.height / 2;
  const report = parts.map(([name], i) => `${name}: ${(centres[i] - rowCentre).toFixed(2)}`).join("\n");
  console.log(`ink centre minus row centre (px):\n${report}`);
  for (const [i, [name]] of parts.entries()) {
    expect(Math.abs(centres[i] - rowCentre), `${name} off centre by ${(centres[i] - rowCentre).toFixed(2)} px`).toBeLessThanOrEqual(1);
  }
}

// Windows fonts only: the offsets depend on the font, and the app runs on Windows (CI's Windows layout job runs it).
for (const scale of [1, 1.25, 1.5]) {
  test.describe(`at ${scale * 100} %`, () => {
    test.skip(process.platform !== "win32", "measured with Windows fonts");
    test.use({ deviceScaleFactor: scale });
    test("the find bar's symbols, text and buttons share one vertical centre", async ({ page }) => {
      await measure(page);
    });
  });
}
