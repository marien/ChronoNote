import { describe, expect, it } from "vitest";
import { appIconInner, appIconSvg, appIconPlateSvg } from "./appIconGeometry";

const FITTED = [16, 20, 24, 30, 32, 36, 40, 48, 64];

/** The white outline's rect attributes and stroke width for size N. */
function page(N: number) {
  const white = appIconInner(N).split('stroke="#fafafa"')[1];
  const width = +/stroke-width="([\d.]+)"/.exec(white)![1];
  const [x, y, w, h] = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/
    .exec(white)!
    .slice(1)
    .map(Number);
  return { width, x, y, w, h };
}

describe("app icon geometry (§416)", () => {
  it.each(FITTED)("draws %i px with whole-pixel strokes whose edges land on pixel boundaries", (N) => {
    const { width, x, y, w, h } = page(N);
    expect(Number.isInteger(width)).toBe(true);
    for (const edge of [x - width / 2, x + width / 2, y - width / 2, y + width / 2, x + w + width / 2, y + h + width / 2]) {
      expect(Number.isInteger(edge)).toBe(true);
    }
  });

  it.each(FITTED)("keeps the %i px drawing inside its frame, symmetric, with the check clear of the bottom edge", (N) => {
    const { width, x, y, w, h } = page(N);
    expect(x - width / 2 - 1).toBeGreaterThanOrEqual(0); // room for the keyline
    expect(y + h + width / 2 + 1).toBeLessThanOrEqual(N);
    expect(x + w / 2).toBeCloseTo(N / 2);
    const check = /<path d="M([\d. L]+)" fill="none" stroke="#fafafa"/.exec(appIconInner(N))![1];
    const lowest = Math.max(...check.split("L").map((p) => +p.trim().split(" ")[1]));
    // The mitred point sits 0.71 x width below the vertex; one clear pixel above the page's bottom line.
    expect(lowest + 0.71 * width + 1).toBeLessThanOrEqual(y + h - width / 2);
  });

  it("wraps standalone and plated SVGs at the requested size", () => {
    expect(appIconSvg(256)).toMatch(/^<svg [^>]*width="256" height="256" viewBox="0 0 256 256"/);
    const plate = appIconPlateSvg(512, 0.6);
    expect(plate).toContain('<rect width="512" height="512" fill="#18181b"/>');
  });
});
