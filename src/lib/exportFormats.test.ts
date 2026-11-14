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

    it("converts emphasis (! x -> **x**) including indented and after action/topic", () => {
      expect(noteToMarkdown("! Important announcement")).toBe("**Important announcement**");
      expect(noteToMarkdown("  ! Indented announcement")).toBe("  **Indented announcement**");
      expect(noteToMarkdown("# ! Urgent task")).toBe("- [ ] **Urgent task**");
      expect(noteToMarkdown("v ! Done urgent")).toBe("- [x] **Done urgent**");
      expect(noteToMarkdown("o ! Must discuss")).toBe("- **Must discuss**");
      expect(noteToMarkdown(". ! Discussed urgent")).toBe("- **Discussed urgent** *(discussed)*");
    });

    it("converts arrows (=> -> →), consequence symbols, and preserves @name", () => {
      const input = "Talk to @alex => # new task => @bob";
      expect(noteToMarkdown(input)).toBe("Talk to @alex → ☐ new task → @bob");
      const topicConsequence = "Talk to @alex => o team sync => . done";
      expect(noteToMarkdown(topicConsequence)).toBe("Talk to @alex → ○ team sync → ◉ done");
      expect(noteToMarkdown("# first => v resolved")).toBe("- [ ] first → ☑ resolved");
      expect(noteToMarkdown("# first => > later")).toBe("- [ ] first → ☐ later *(deferred)*");
    });

    it("strips redundant bullet and handles emphasis combinations cleanly", () => {
      expect(noteToMarkdown("# - bulleted")).toBe("- [ ] bulleted");
      expect(noteToMarkdown("! - urgent")).toBe("- **urgent**");
      expect(noteToMarkdown("# ! - urgent")).toBe("- [ ] **urgent**");
      expect(noteToMarkdown("o ! - discuss")).toBe("- **discuss**");
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
        "Task => o next topic",
        "! announcement",
        "  ! indented announcement",
        "# ! urgent action",
        "o ! must discuss",
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
      expect(html).toContain("Task ➔ ○ next topic");
      expect(html).toContain("<strong>announcement</strong>");
      expect(html).toContain("  <strong>indented announcement</strong>");
      expect(html).toContain("☐ <strong>urgent action</strong>");
      expect(html).toContain("○ <strong>must discuss</strong>");
    });

    it("renders --- subsection titles, strips redundant bullets, renders consequences, and draws .glyph-progress SVG", () => {
      const input = [
        "# Subsection",
        "---",
        "# - bulleted",
        "! - urgent",
        "# ! - very urgent",
        "v done => # next => > later",
        "> deferred top",
        "",
        "---",
      ].join("\n");

      const md = noteToMarkdown(input);
      expect(md).toContain("## # Subsection");
      expect(md).toContain("- [ ] bulleted");
      expect(md).toContain("- **urgent**");
      expect(md).toContain("- [ ] **very urgent**");
      expect(md).toContain("- [x] done → ☐ next → ☐ later *(deferred)*");
      expect(md).toContain("\\---");

      const html = noteToHtml(input);
      expect(html).toContain("<h2># Subsection</h2>");
      expect(html).toContain("☐ • bulleted");
      expect(html).toContain("• <strong>urgent</strong>");
      expect(html).toContain("☐ • <strong>very urgent</strong>");
      expect(html).toContain("☑ done ➔ ☐ next ➔ <span class=\"glyph-progress\" role=\"img\" aria-label=\"deferred\">");
      expect(html).toContain('<path d="M5.6 2.8l5.2 5.2-5.2 5.2"/>');
      expect(html).toContain('<div class="note-line">---</div>');
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

    it("Rule 2.4: Markdown keeps backslash escapes while HTML/Print drops the escape backslash", () => {
      const note = ["\\# config", "  \\# indented", "\\v done", "\\- item", "\\1. not a list", "\\=> not follow-up", "a \\=> b"].join("\n");
      const md = noteToMarkdown(note);
      expect(md.split("\n")).toEqual([
        "\\# config",
        "  \\# indented",
        "\\v done",
        "\\- item",
        "\\1. not a list",
        "\\=> not follow-up",
        "a \\=> b",
      ]);

      const html = noteToHtml(note);
      expect(html).toContain('<div class="note-line"># config</div>');
      expect(html).toContain('<div class="note-line">  # indented</div>');
      expect(html).toContain('<div class="note-line">v done</div>');
      expect(html).toContain('<div class="note-line">- item</div>');
      expect(html).toContain('<div class="note-line">1. not a list</div>');
      expect(html).toContain('<div class="note-line">=&gt; not follow-up</div>');
      expect(html).toContain('<div class="note-line">a =&gt; b</div>');
      expect(html).not.toContain("\\#");
    });
  });
});
