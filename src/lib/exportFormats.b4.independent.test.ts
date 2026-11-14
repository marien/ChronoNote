// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { noteToMarkdown, noteToHtml } from "./exportFormats";

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("exportFormats backslash escapes (batch 4, rule 2.4)", () => {
  it("Markdown keeps \\# config (Markdown's own escape) and does not turn it into a task", () => {
    const md = noteToMarkdown("\\# config");
    expect(md).toContain("\\# config");
    expect(md).not.toContain("- [ ]");
  });

  it("HTML export drops the backslash and renders '# config' as plain text", () => {
    const html = noteToHtml("\\# config");
    const doc = parseHtml(html);
    const bodyText = doc.body.textContent ?? "";
    expect(bodyText).toContain("# config");
    expect(bodyText).not.toContain("\\# config");
    expect(doc.querySelector(".glyph-open")).toBeNull();
  });

  it("HTML export drops the backslash for other escaped markers without rendering glyphs", () => {
    const html = noteToHtml(["\\- item", "\\! note", "\\=> not a follow-up", "a \\=> b"].join("\n"));
    const doc = parseHtml(html);
    const bodyText = doc.body.textContent ?? "";
    expect(bodyText).toContain("- item");
    expect(bodyText).toContain("! note");
    expect(bodyText).toContain("=> not a follow-up");
    expect(bodyText).toContain("a => b");
    expect(bodyText).not.toContain("\\-");
    expect(bodyText).not.toContain("\\!");
    expect(bodyText).not.toContain("\\=>");
    expect(doc.querySelector(".glyph-bullet")).toBeNull();
    expect(doc.querySelector(".glyph-emphasis-line")).toBeNull();
    expect(doc.querySelector(".glyph-followup")).toBeNull();
  });
});
