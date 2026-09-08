import { describe, it, expect } from "vitest";
import {
  ROW_OVERSCAN_PX,
  withTops,
  uniformRows,
  stackHeight,
  rowIndexAt,
  visibleWindow,
  scrollToShow,
  wrapIndex,
  clampIndex,
  type PlacedRow,
} from "./virtualList";

describe("withTops", () => {
  it("assigns cumulative tops from heights, preserving payload", () => {
    const placed = withTops([
      { height: 29, kind: "header" },
      { height: 36, kind: "item" },
      { height: 36, kind: "item" },
    ]);
    expect(placed).toEqual([
      { height: 29, kind: "header", top: 0 },
      { height: 36, kind: "item", top: 29 },
      { height: 36, kind: "item", top: 65 },
    ]);
  });

  it("is empty for no rows", () => {
    expect(withTops([])).toEqual([]);
  });
});

describe("uniformRows", () => {
  it("lays count rows of equal height", () => {
    expect(uniformRows(3, 36)).toEqual([
      { top: 0, height: 36 },
      { top: 36, height: 36 },
      { top: 72, height: 36 },
    ]);
  });
  it("is empty for count 0", () => {
    expect(uniformRows(0, 36)).toEqual([]);
  });
});

describe("stackHeight", () => {
  it("is the bottom edge of the last row", () => {
    expect(stackHeight([{ top: 0, height: 29 }, { top: 29, height: 36 }])).toBe(65);
  });
  it("is 0 when empty", () => {
    expect(stackHeight([])).toBe(0);
  });
});

describe("rowIndexAt", () => {
  // headers 29, items 36: tops 0, 29, 65, 101, 137
  const rows: PlacedRow[] = withTops([
    { height: 29 },
    { height: 36 },
    { height: 36 },
    { height: 36 },
    { height: 36 },
  ]);

  it("returns the first row whose bottom edge is past y", () => {
    expect(rowIndexAt(rows, 0)).toBe(0);
    expect(rowIndexAt(rows, 28)).toBe(0);
    expect(rowIndexAt(rows, 29)).toBe(1); // row 0 ends exactly at 29
    expect(rowIndexAt(rows, 64)).toBe(1);
    expect(rowIndexAt(rows, 65)).toBe(2);
    expect(rowIndexAt(rows, 130)).toBe(3);
  });

  it("returns rows.length when y is at or past the bottom", () => {
    expect(rowIndexAt(rows, 173)).toBe(5); // total height
    expect(rowIndexAt(rows, 5000)).toBe(5);
  });

  it("returns 0 for an empty stack (0 >= 0)", () => {
    expect(rowIndexAt([], 0)).toBe(0);
  });
});

describe("visibleWindow", () => {
  const rows = uniformRows(1000, 36); // 36000px tall

  it("mounts only the rows around the viewport, plus overscan", () => {
    const { start, end } = visibleWindow(rows, 3600, 380); // scrolled to row 100
    // top edge: (3600 - 200) / 36 -> row 94; bottom: (3600 + 380 + 200) / 36 -> row 106
    expect(start).toBe(rowIndexAt(rows, 3400));
    expect(end).toBe(rowIndexAt(rows, 4180));
    expect(start).toBeLessThan(100);
    expect(end).toBeGreaterThan(100);
    expect(end - start).toBeLessThan(40); // a small window, not the whole list
  });

  it("clamps the top of the window at 0", () => {
    const { start } = visibleWindow(rows, 0, 380);
    expect(start).toBe(0);
  });

  it("uses ROW_OVERSCAN_PX by default", () => {
    const a = visibleWindow(rows, 3600, 380);
    const b = visibleWindow(rows, 3600, 380, ROW_OVERSCAN_PX);
    expect(a).toEqual(b);
  });
});

describe("scrollToShow", () => {
  it("snaps a row above the viewport to the top", () => {
    expect(scrollToShow({ top: 40, height: 36 }, 100, 380)).toBe(40);
  });
  it("snaps a row below the viewport so its bottom edge meets the fold", () => {
    // row bottom 536, viewport bottom 100 + 380 = 480 -> new scrollTop 536 - 380
    expect(scrollToShow({ top: 500, height: 36 }, 100, 380)).toBe(156);
  });
  it("returns null when the row is already fully visible", () => {
    expect(scrollToShow({ top: 200, height: 36 }, 100, 380)).toBeNull();
  });
});

describe("wrapIndex", () => {
  it("moves within range", () => {
    expect(wrapIndex(2, 5, 1)).toBe(3);
    expect(wrapIndex(2, 5, -1)).toBe(1);
  });
  it("wraps at both ends", () => {
    expect(wrapIndex(4, 5, 1)).toBe(0);
    expect(wrapIndex(0, 5, -1)).toBe(4);
  });
  it("leaves the index alone for an empty list", () => {
    expect(wrapIndex(0, 0, 1)).toBe(0);
  });
});

describe("clampIndex", () => {
  it("passes an in-range index through", () => {
    expect(clampIndex(3, 10)).toBe(3);
  });
  it("pulls an out-of-range index back to the last row", () => {
    expect(clampIndex(9, 4)).toBe(3);
  });
  it("is 0 for an empty list", () => {
    expect(clampIndex(5, 0)).toBe(0);
  });
});
