import { describe, expect, it } from "vitest";
import { renderResultLine } from "./resultRow";

describe("renderResultLine (§127, finding B)", () => {
  it("with no query, is exactly parseGlyphLine's output", () => {
    const parts = renderResultLine("# an open action");
    expect(parts).toEqual([{ text: "☐", cls: "glyph-open" }, { text: " " }, { text: "an open action" }]);
  });

  it("splits the matching part to mark the query, case-insensitively", () => {
    const parts = renderResultLine("# an OPEN action", "open");
    const hit = parts.find((p) => p.hit);
    expect(hit?.text).toBe("OPEN");
  });

  it("still glyph-renders the leading token while highlighting later text", () => {
    const parts = renderResultLine("# chase the vendor", "vendor");
    expect(parts[0]).toEqual({ text: "☐", cls: "glyph-open" });
    const hit = parts.find((p) => p.hit);
    expect(hit?.text).toBe("vendor");
  });

  it("a query with no match leaves every part un-hit", () => {
    const parts = renderResultLine("plain prose", "xyz");
    expect(parts.some((p) => p.hit)).toBe(false);
  });

  it("an empty query is a no-op", () => {
    expect(renderResultLine("plain prose", "  ")).toEqual(renderResultLine("plain prose"));
  });
});
