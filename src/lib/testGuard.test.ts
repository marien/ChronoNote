import { describe, it, expect } from "vitest";
import { scanTests } from "../../scripts/test-guard.mjs";

describe("scanTests (scripts/test-guard.mjs)", () => {
  it("extracts double-quoted it() titles", () => {
    expect(scanTests('it("adds", () => {})')).toEqual({ titles: ["adds"], off: 0 });
  });

  it("extracts single-quoted and plain backtick test() titles", () => {
    const src = [
      "test('a', async ({ page }) => {})",
      "test(`b`, async ({ page }) => {})",
    ].join("\n");
    expect(scanTests(src)).toEqual({ titles: ["a", "b"], off: 0 });
  });

  it("ignores interpolated template titles", () => {
    expect(scanTests("it(`row ${i}`, () => {})")).toEqual({ titles: [], off: 0 });
  });

  it("extracts it.each(...)(title) and test.each(...)(title)", () => {
    expect(scanTests('it.each([[1]])("case %i", () => {})')).toEqual({
      titles: ["case %i"],
      off: 0,
    });
    expect(scanTests('test.each([[1]])("row %i", () => {})')).toEqual({
      titles: ["row %i"],
      off: 0,
    });
  });

  it("extracts nested test.describe() and describe() titles", () => {
    expect(scanTests('test.describe("Rule 4", () => { test("4.1", () => {}) })')).toEqual({
      titles: ["Rule 4", "4.1"],
      off: 0,
    });
    expect(scanTests('describe("suite", () => { it("leaf", () => {}) })')).toEqual({
      titles: ["suite", "leaf"],
      off: 0,
    });
  });

  it("counts string-titled .fixme, .skip, and .todo in off and keeps their titles", () => {
    expect(scanTests('test.fixme("later", async () => {})')).toEqual({
      titles: ["later"],
      off: 1,
    });
    expect(scanTests('it.skip("skipped", () => {}); it.todo("planned")')).toEqual({
      titles: ["skipped", "planned"],
      off: 2,
    });
  });

  it("does not count conditional test.skip(!RUNNABLE, ...) as switched off", () => {
    expect(scanTests('test.skip(!RUNNABLE, "needs the build")')).toEqual({
      titles: [],
      off: 0,
    });
  });

  it("ignores calls inside line comments, block comments, strings, and regex .test()", () => {
    const src = [
      '// it("old", () => {})',
      '/* test("also old", () => {}) */',
      "const snippet = 'it(\"fake\", () => {})';",
      'const matched = /^foo/.test("foo");',
    ].join("\n");
    expect(scanTests(src)).toEqual({ titles: [], off: 0 });
  });

  it("handles multiline arguments with leading comments", () => {
    const src = [
      "test.fixme(",
      "  // pending mock hook",
      '  "4.2: multiline title",',
      "  async () => {},",
      ");",
    ].join("\n");
    expect(scanTests(src)).toEqual({
      titles: ["4.2: multiline title"],
      off: 1,
    });
  });
});
