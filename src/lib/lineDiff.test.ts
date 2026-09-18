import { describe, expect, it } from "vitest";
import { diffLines } from "./lineDiff";

const changed = (rows: { text: string; changed: boolean }[]) => rows.filter((r) => r.changed).map((r) => r.text);

describe("diffLines", () => {
  it("marks nothing when both sides are identical", () => {
    const d = diffLines("a\nb\n", "a\nb\n");
    expect(changed(d.left)).toEqual([]);
    expect(changed(d.right)).toEqual([]);
  });

  it("marks only the line that was edited on each side", () => {
    const d = diffLines("one\nphone\nthree\n", "one\npc\nthree\n");
    expect(changed(d.left)).toEqual(["phone"]);
    expect(changed(d.right)).toEqual(["pc"]);
  });

  it("marks an added line only on the side that has it", () => {
    const d = diffLines("a\nb\n", "a\nb\nc\n");
    expect(changed(d.left)).toEqual([]);
    expect(changed(d.right)).toEqual(["c"]);
  });

  it("keeps every line of each side, in order, changed or not", () => {
    const d = diffLines("x\ny\n", "y\nz\n");
    expect(d.left.map((r) => r.text)).toEqual(["x", "y"]);
    expect(d.right.map((r) => r.text)).toEqual(["y", "z"]);
  });

  it("ignores the trailing newline and handles empty texts", () => {
    expect(diffLines("a", "a\n").left).toEqual([{ text: "a", changed: false }]);
    const d = diffLines("", "a\n");
    expect(d.left).toEqual([]);
    expect(changed(d.right)).toEqual(["a"]);
  });

  it("falls back to a set comparison for very long notes without blowing up", () => {
    const long = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join("\n");
    const d = diffLines(long, long.replace("line 7\n", "changed 7\n"));
    expect(changed(d.left)).toEqual(["line 7"]);
    expect(changed(d.right)).toEqual(["changed 7"]);
  });
});
