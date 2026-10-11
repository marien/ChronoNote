import { describe, expect, it } from "vitest";
import { noteToHtml, noteToMarkdown, notesToHtml, notesToMarkdown } from "./exportFormats";

describe("exportFormats", () => {
  describe("noteToMarkdown", () => {
    it("converts action tokens (#, v, >, x)", () => {
      const input = [
        "# open action",
        "v completed action",
        "> deferred action",
        "x won't do action",
      ].join("\n");

      const expected = [
        "- [ ] open action",
        "- [x] completed action",
        "- [ ] deferred action *(deferred)*",
        "- [x] ~~won't do action~~ *(won't do)*",
      ].join("\n");

      expect(noteToMarkdown(input)).toBe(expected);
    });

    it("converts agenda topic tokens (o, ., ,)", () => {
      const input = [
        "o topic to discuss",
        ". discussed topic",
        ", not discussed topic",
      ].join("\n");

      const expected = [
        "- topic to discuss",
        "- discussed topic *(discussed)*",
        "- not discussed topic *(not discussed)*",
      ].join("\n");

      expect(noteToMarkdown(input)).toBe(expected);
    });

    it("converts emphasis (! x -> **x**)", () => {
      expect(noteToMarkdown("! Important announcement")).toBe("**Important announcement**");
    });

    it("converts arrows (=> -> →) and preserves @name", () => {
      const input = "Talk to @alex => # new task => @bob";
      expect(noteToMarkdown(input)).toBe("Talk to @alex → # new task → @bob");
    });

    it("keeps bullets and numbered lists", () => {
      const input = [
        "- plain bullet 1",
        "* star bullet 2",
        "1. First numbered item",
        "2) Second numbered item",
        "1.1. Sub item",
      ].join("\n");

      expect(noteToMarkdown(input)).toBe(input);
    });

    it("preserves indentation and nested structures", () => {
      const input = [
        "# Top level action",
        "  # Nested action",
        "    v Deeply nested done",
        "  - Nested bullet",
        "    1. Nested numbered",
        "  o Nested topic",
      ].join("\n");

      const expected = [
        "- [ ] Top level action",
        "  - [ ] Nested action",
        "    - [x] Deeply nested done",
        "  - Nested bullet",
        "    1. Nested numbered",
        "  - Nested topic",
      ].join("\n");

      expect(noteToMarkdown(input)).toBe(expected);
    });

    it("converts section headers (setext === -> ## Title, underline dropped)", () => {
      const input = [
        "First Section",
        "===",
        "# Action in section",
        "",
        "Second Section",
        "========",
        "v Done in section",
      ].join("\n");

      const expected = [
        "## First Section",
        "- [ ] Action in section",
        "",
        "## Second Section",
        "- [x] Done in section",
      ].join("\n");

      expect(noteToMarkdown(input)).toBe(expected);
    });

    it("escapes Markdown-special characters at the start of a plain line", () => {
      const input = [
        "## Heading",
        ">quote without space",
        "+ plus bullet",
        "``` code fence",
        "=== orphan underline",
        "Plain text with *no* need to escape mid-line formatting",
      ].join("\n");

      const result = noteToMarkdown(input);
      expect(result).toContain("\\## Heading");
      expect(result).toContain("\\>quote without space");
      expect(result).toContain("\\+ plus bullet");
      expect(result).toContain("\\``` code fence");
      expect(result).toContain("\\=== orphan underline");
      expect(result).toContain("Plain text with *no* need to escape mid-line formatting");
    });

    it("prepends # Title when title is provided", () => {
      const input = "# Task";
      expect(noteToMarkdown(input, "2026-10-11")).toBe("# 2026-10-11\n\n- [ ] Task");
    });
  });

  describe("notesToMarkdown", () => {
    it("formats a range with two notes with # YYYY-MM-DD headings", () => {
      const notes = [
        { date: "2026-10-10", text: "# Task for day 1" },
        { date: "2026-10-11", text: "v Task for day 2" },
      ];

      const expected = [
        "# 2026-10-10",
        "",
        "- [ ] Task for day 1",
        "",
        "# 2026-10-11",
        "",
        "- [x] Task for day 2",
        "",
      ].join("\n");

      expect(notesToMarkdown(notes)).toBe(expected);
    });
  });

  describe("noteToHtml and notesToHtml", () => {
    it("escapes HTML special characters", () => {
      const input = "# Action with <script>alert('xss')</script> & \"quotes\"";
      const html = noteToHtml(input, "2026-10-11 <safe>");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&amp;");
      expect(html).toContain("&quot;quotes&quot;");
      expect(html).toContain("2026-10-11 &lt;safe&gt;");
    });

    it("renders section titles as <h2> and glyphs with legend Unicode characters", () => {
      const input = [
        "Team Sync",
        "===",
        "# open item",
        "v done item",
        "> deferred item",
        "x won't do item",
        "o open topic",
        ". discussed topic",
        ", skipped topic",
        "- bullet item",
        "Task => @assignee",
        "! announcement",
      ].join("\n");

      const html = noteToHtml(input);
      expect(html).toContain("<h2>Team Sync</h2>");
      expect(html).toContain("☐ open item");
      expect(html).toContain("☑ done item");
      expect(html).toContain("☒ won&#39;t do item");
      expect(html).toContain("○ open topic");
      expect(html).toContain("◉ discussed topic");
      expect(html).toContain("◌ skipped topic");
      expect(html).toContain("• bullet item");
      expect(html).toContain("➔ @assignee");
      expect(html).toContain("<strong>announcement</strong>");
    });

    it("includes inline style, fonts, and print media rules for page breaks", () => {
      const html = notesToHtml([
        { date: "2026-10-10", text: "# Note 1" },
        { date: "2026-10-11", text: "# Note 2" },
      ]);

      expect(html).toContain("<!doctype html>");
      expect(html).toContain("@media print");
      expect(html).toContain("background: transparent !important;");
      expect(html).toContain(".date-heading:not(:first-of-type)");
      expect(html).toContain("page-break-before: always;");
      expect(html).toContain("font-family: var(--font-mono);");
      expect(html).toContain("2026-10-10");
      expect(html).toContain("2026-10-11");
    });
  });
});
