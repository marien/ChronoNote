// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { noteToMarkdown, noteToHtml } from "./exportFormats";

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("Export formats (batch 3, rules 1 & 4)", () => {
  describe("Rule 4.1 & 4.2: leading markers are stripped / formatted without raw symbols", () => {
    it("Markdown: `# - bulleted` exports as `- [ ] bulleted` without the inner `- `", () => {
      const md = noteToMarkdown("# - bulleted");
      expect(md).toContain("- [ ] bulleted");
      expect(md).not.toContain("- [ ] - bulleted");
    });

    it("HTML: `# - bulleted` renders task without raw `# ` or `- ` marker", () => {
      const html = noteToHtml("# - bulleted");
      const doc = parseHtml(html);
      const bodyText = doc.body.textContent ?? "";
      expect(bodyText).toContain("bulleted");
      expect(bodyText).not.toContain("- bulleted");
      expect(bodyText).not.toContain("# - bulleted");
    });

    it("Markdown: `# ! urgent` exports as `- [ ] **urgent**`", () => {
      const md = noteToMarkdown("# ! urgent");
      expect(md).toContain("- [ ] **urgent**");
      expect(md).not.toContain("- [ ] ! urgent");
      expect(md).not.toContain("**! urgent**");
    });

    it("HTML: `# ! urgent` renders bold urgent task without raw `! ` or `# `", () => {
      const html = noteToHtml("# ! urgent");
      const doc = parseHtml(html);
      const bodyText = doc.body.textContent ?? "";
      expect(bodyText).toContain("urgent");
      expect(bodyText).not.toContain("! urgent");
      expect(bodyText).not.toContain("# ! urgent");
      const bold = doc.querySelector("strong, b, .glyph-emphasis-line");
      expect(bold?.textContent).toContain("urgent");
    });

    it("Markdown: `! - urgent` exports as `- **urgent**` (not `**- urgent**`)", () => {
      const md = noteToMarkdown("! - urgent");
      expect(md).toContain("- **urgent**");
      expect(md).not.toContain("**- urgent**");
      expect(md).not.toContain("! - urgent");
    });

    it("HTML: `! - urgent` renders bold urgent bullet without raw `! ` or `- ` inside bold", () => {
      const html = noteToHtml("! - urgent");
      const doc = parseHtml(html);
      const bodyText = doc.body.textContent ?? "";
      expect(bodyText).toContain("urgent");
      expect(bodyText).not.toContain("! - urgent");
      expect(bodyText).not.toContain("- urgent");
      const bold = doc.querySelector("strong, b, .glyph-emphasis-line");
      expect(bold?.textContent?.trim()).toBe("urgent");
    });
  });

  describe("Rule 4.3: consequences after `=> ` use glyph characters, never raw symbols", () => {
    it("Markdown: `=> # / v / x / >` export with arrow and glyph characters", () => {
      const md = noteToMarkdown(
        [
          "=> # standalone",
          "=> v sent",
          "=> x dropped",
          "=> > later",
          "Notes => # inline follow-up",
        ].join("\n"),
      );
      expect(md).toContain("→ ☐ standalone");
      expect(md).toContain("→ ☑ sent");
      expect(md).toContain("→ ☒ dropped");
      expect(md).toContain("→ ☐ later *(deferred)*");
      expect(md).toContain("Notes → ☐ inline follow-up");

      expect(md).not.toContain("=> #");
      expect(md).not.toContain("=> v");
      expect(md).not.toContain("=> x");
      expect(md).not.toContain("=> >");
    });

    it("HTML: `=> # / v / x / >` export with `➔` and glyph spans, never raw symbols", () => {
      const html = noteToHtml(
        [
          "=> # standalone",
          "=> v sent",
          "=> x dropped",
          "=> > later",
        ].join("\n"),
      );
      const doc = parseHtml(html);
      const bodyText = doc.body.textContent ?? "";

      expect(bodyText).not.toContain("=> #");
      expect(bodyText).not.toContain("=> v");
      expect(bodyText).not.toContain("=> x");
      expect(bodyText).not.toContain("=> >");

      expect(bodyText).toContain("➔");
      expect(bodyText).toContain("☐");
      expect(bodyText).toContain("standalone");
      expect(bodyText).toContain("☑");
      expect(bodyText).toContain("sent");
      expect(bodyText).toContain("☒");
      expect(bodyText).toContain("dropped");
      expect(bodyText).toContain("later");
      expect(bodyText).toContain("(deferred)");
      expect(doc.querySelector(".glyph-progress")).not.toBeNull();
    });
  });

  describe("Rule 4.4: HTML export renders deferred `> task` distinctly from open `# task` with ` (deferred)`", () => {
    it("HTML: `> task` has `.glyph-progress` (or inline SVG) styled distinctly from open box and followed by ` (deferred)`", () => {
      const html = noteToHtml("# open task\n> deferred task");
      const doc = parseHtml(html);

      const deferredGlyph = doc.querySelector(".glyph-progress");
      expect(deferredGlyph).not.toBeNull();

      // Must include inline SVG or CSS definition for .glyph-progress so it differs visually from open box
      const styleText = Array.from(doc.querySelectorAll("style"))
        .map((s) => s.textContent ?? "")
        .join("\n");
      const hasInlineSvg = deferredGlyph?.querySelector("svg") !== null;
      const hasDeferredStyle = styleText.includes("glyph-progress");
      expect(hasInlineSvg || hasDeferredStyle).toBe(true);

      const bodyText = doc.body.textContent ?? "";
      expect(bodyText).toMatch(/deferred task\s*\(deferred\)/);
      expect(bodyText).not.toMatch(/open task\s*\(deferred\)/);
    });
  });

  describe("Rule 1 & 4.5: title lines export as headings, not tasks", () => {
    it("Markdown: title lines with leading symbols export as headings", () => {
      const cases = [
        { raw: "# Title\n=====", headingText: "# Title", forbidden: ["- [ ]"] },
        { raw: "v Sub\n---", headingText: "v Sub", forbidden: ["- [x]"] },
        { raw: "- point\n---", headingText: "- point", forbidden: [] },
        { raw: "o agenda\n===", headingText: "o agenda", forbidden: [] },
      ];
      for (const c of cases) {
        const md = noteToMarkdown(c.raw);
        for (const bad of c.forbidden) {
          expect(md).not.toContain(bad);
        }
        const escaped = c.headingText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const headingPattern = new RegExp(`(^#{1,6}\\s+${escaped}\\s*$|^${escaped}\\r?\\n[=-]{3,}\\s*$)`, "m");
        expect(md).toMatch(headingPattern);
      }
    });

    it("HTML: title lines with leading symbols export as `<h1..h6>` headings, not task items", () => {
      const cases = [
        { raw: "# Title\n=====", headingText: "# Title" },
        { raw: "v Sub\n---", headingText: "v Sub" },
        { raw: "- point\n---", headingText: "- point" },
        { raw: "o agenda\n===", headingText: "o agenda" },
      ];
      for (const c of cases) {
        const doc = parseHtml(noteToHtml(c.raw));
        const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(
          (el) => el.textContent?.trim() ?? "",
        );
        expect(headings).toContain(c.headingText);
        expect(doc.querySelectorAll('li, input[type="checkbox"], .glyph-open, .glyph-done, .glyph-bullet, .glyph-topic-open')).toHaveLength(0);
      }
    });
  });
});
