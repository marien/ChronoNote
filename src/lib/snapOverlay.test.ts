import { describe, expect, it } from "vitest";
import { overlayRect } from "./snapOverlay";

describe("overlayRect (§B1)", () => {
  it("converts CSS pixels to physical pixels at 150%", () => {
    expect(overlayRect({ left: 900, top: 0, width: 46, height: 40 }, 1.5, false)).toEqual({ x: 1350, y: 0, width: 69, height: 60 });
  });

  it("rounds fractional positions", () => {
    expect(overlayRect({ left: 10.4, top: 0.6, width: 46.2, height: 39.7 }, 1, false)).toEqual({ x: 10, y: 1, width: 46, height: 40 });
  });

  it("is a zero rect when hidden (Zen/Peek) or when the button has no size", () => {
    const zero = { x: 0, y: 0, width: 0, height: 0 };
    expect(overlayRect({ left: 900, top: 0, width: 46, height: 40 }, 1.5, true)).toEqual(zero);
    expect(overlayRect({ left: 900, top: 0, width: 0, height: 40 }, 1.5, false)).toEqual(zero);
  });
});
