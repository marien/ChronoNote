import { describe, it, expect } from "vitest";
import { countEscapes, compare } from "../../scripts/type-escapes.mjs";

describe("countEscapes (scripts/type-escapes.mjs)", () => {
  it.each([
    ["a.ts", "let a: any = 1;", 1],
    ["a.ts", "const b = x as any;", 1],
    ["a.ts", "let c: Array<any>; let d: any[];", 2],
    ["a.ts", "function f(e: any): any {}", 2],
    ["a.ts", "// @ts-ignore\nfoo();", 1],
    ["a.ts", "/* @ts-expect-error reason */ foo();", 1],
    ["a.ts", "// @ts-nocheck", 1],
    ["a.ts", 'const s = "any time"; // any old comment', 0],
    ["a.ts", "let anyThing: unknown; const many = 1;", 0],
    ["a.svelte", '<script lang="ts">let a: any;</script>\n<p>any</p>', 1],
    [
      "a.svelte",
      '<script context="module" lang="ts">let a: any;</script><script lang="ts">let b: any;</script>',
      2,
    ],
    ["a.svelte", "<script>let a = 1;</script><p>as any</p>", 0],
  ])("counts %s (%j) -> %i", (fileName, text, expected) => {
    expect(countEscapes(fileName, text)).toBe(expected);
  });
});

describe("compare (scripts/type-escapes.mjs)", () => {
  const baseline = {
    total: 3,
    files: { "src/a.ts": 2, "src/b.ts": 1 },
  };

  it("is ok when totals and files are equal", () => {
    expect(compare(baseline, { total: 3, files: { "src/a.ts": 2, "src/b.ts": 1 } })).toEqual({
      ok: true,
      total: 3,
      ceiling: 3,
      rose: [],
    });
  });

  it("is ok when total is lower", () => {
    expect(compare(baseline, { total: 2, files: { "src/a.ts": 1, "src/b.ts": 1 } })).toEqual({
      ok: true,
      total: 2,
      ceiling: 3,
      rose: [],
    });
  });

  it("is ok when one file is higher and another is lower so total is equal", () => {
    const res = compare(baseline, { total: 3, files: { "src/a.ts": 1, "src/b.ts": 2 } });
    expect(res).toEqual({
      ok: true,
      total: 3,
      ceiling: 3,
      rose: [{ file: "src/b.ts", before: 1, after: 2 }],
    });
  });

  it("is not ok when a new file adds 1 and lists it in rose", () => {
    const res = compare(baseline, {
      total: 4,
      files: { "src/a.ts": 2, "src/b.ts": 1, "src/new.ts": 1 },
    });
    expect(res).toEqual({
      ok: false,
      total: 4,
      ceiling: 3,
      rose: [{ file: "src/new.ts", before: 0, after: 1 }],
    });
  });
});
