// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { actionTree } from "./actionGroups";
import { jumpToAdjacentOpenAction } from "./editor/commands";
import { parseGlyphLine } from "./editor/glyphLine";
import { liveGlyphs } from "./editor/glyphs";
import { escapeHtml, noteToHtml, noteToMarkdown } from "./exportFormats";
import { glyphSpecForSymbol } from "./grammar/glyphs";
import {
  getLineActionParts,
  hasOpenAction,
  isTitleLine,
  tokenizeLine,
} from "./grammar/tokenize";
import { createTestEditor } from "./testing/testEditor";
import { countActions, lineMenuStateAt, openActionLineIndices } from "./tokens";

interface CaseSpec {
  line: string;
  nextLine?: string;
}

function generateLines(): CaseSpec[] {
  const indents = ["", "  ", "\t"];
  const leads = ["", "# ", "v ", "> ", "x ", "o ", ". ", ", ", "- ", "! ", "# - ", "# ! ", "# ! - ", "! - ", "o ! ", "o - "];
  const bodies = ["task", "item @alice", "work by:tomorrow", "sync (topic)"];
  const tails = ["", " => @bob", " => # next", " => v done", " => > later", " => x drop", " => o agenda", " => . ok"];
  const nextLines: (string | undefined)[] = [undefined, "===", "---", ""];

  // Deterministic stride over the Cartesian product (~150 representative combinations)
  // plus every edge case involving multi-part states and title underlines.
  const cases: CaseSpec[] = [
    { line: "# first => v resolved", nextLine: undefined },
    { line: "v done => # next", nextLine: undefined },
    { line: "Notes => # call Sam", nextLine: undefined },
    { line: "# ! - task @alice by:2026-10-15 => > later", nextLine: undefined },
    { line: "! urgent @bob => # follow up", nextLine: undefined },
    { line: "# Title", nextLine: "===" },
    { line: "# Subtitle", nextLine: "---" },
    { line: "  # Indented Title", nextLine: "---" },
    { line: "", nextLine: "---" },
    { line: "---", nextLine: "===" },
    { line: "===", nextLine: "---" },
    // Double spaces after markers (Rule 1 / D6)
    { line: "#  task", nextLine: undefined },
    { line: "=>  # call", nextLine: undefined },
    { line: "a =>  # call", nextLine: undefined },
    { line: "a =>  @alice", nextLine: undefined },
    { line: "=>  #  (topic) fix", nextLine: undefined },
    { line: "#  (topic) fix", nextLine: undefined },
    // Backslash escapes (Rule 2 / D7)
    { line: "\\# config", nextLine: undefined },
    { line: "  \\# indented", nextLine: undefined },
    { line: "\\v done", nextLine: undefined },
    { line: "\\> quote", nextLine: undefined },
    { line: "\\x drop", nextLine: undefined },
    { line: "\\o topic", nextLine: undefined },
    { line: "\\- item", nextLine: undefined },
    { line: "\\* item", nextLine: undefined },
    { line: "\\! note", nextLine: undefined },
    { line: "\\1. not a list", nextLine: undefined },
    { line: "\\=> not a follow-up", nextLine: undefined },
    { line: "a \\=> b", nextLine: undefined },
    { line: "a \\=> # literal", nextLine: undefined },
  ];

  let idx = 0;
  for (const indent of indents) {
    for (const lead of leads) {
      for (const body of bodies) {
        for (const tail of tails) {
          for (const nextLine of nextLines) {
            if (idx % 47 === 0) {
              cases.push({ line: `${indent}${lead}${body}${tail}`, nextLine });
            }
            idx++;
          }
        }
      }
    }
  }
  return cases;
}

function flattenGlyphParts(parts: ReturnType<typeof parseGlyphLine>): { cls: string; text: string }[] {
  return parts.map((p) => ({ cls: p.cls ?? "", text: p.text }));
}

describe("cross-view line model agreement", () => {
  const cases = generateLines();

  it(`agrees across editor, read-only glyphLine, counters, navigation, export, and menu over ${cases.length} generated cases`, () => {
    for (const { line, nextLine } of cases) {
      const doc = nextLine === undefined ? line : `${line}\n${nextLine}`;
      const title = isTitleLine(line, nextLine);
      const tokens = tokenizeLine(line, { title });
      const actionParts = getLineActionParts(line, tokens);

      // 1. Editor liveGlyphs decorations on line 0
      const editorView = new EditorView({
        state: EditorState.create({ doc, extensions: [liveGlyphs] }),
      });
      const decos = editorView.plugin(liveGlyphs)!.decorations;
      const widgetClasses: string[] = [];
      const markClasses: string[] = [];
      decos.between(0, line.length, (_from, _to, d) => {
        if (d.spec.widget) {
          const dom = d.spec.widget.toDOM(editorView);
          widgetClasses.push(dom.className);
        } else if (d.spec.class) {
          markClasses.push(d.spec.class);
        }
      });
      editorView.destroy();

      if (title) {
        expect(widgetClasses, `title widgetClasses for ${JSON.stringify(doc)}`).toEqual([]);
        expect(markClasses, `title markClasses for ${JSON.stringify(doc)}`).toEqual([]);
      } else {
        const expectedReplacedClasses = tokens
          .filter((t) => t.replaced)
          .map((t) => {
            if (t.kind === "arrow") return "glyph-followup";
            if (t.kind === "bullet") {
              const em = tokens.find((x) => x.kind === "emphasis");
              return em && t.from === em.from + 2 ? "glyph-bullet glyph-bullet-emphasis" : "glyph-bullet";
            }
            return glyphSpecForSymbol(t.symbol!).cls;
          });
        expect(widgetClasses.length, `widget count mismatch for ${JSON.stringify(doc)}`).toBe(
          expectedReplacedClasses.length,
        );
        for (let k = 0; k < expectedReplacedClasses.length; k++) {
          for (const cls of expectedReplacedClasses[k].split(" ")) {
            expect(widgetClasses[k]).toContain(cls);
          }
        }
      }

      // 2. Read-only parseGlyphLine
      const roParts = flattenGlyphParts(parseGlyphLine(line, { title }));
      if (title) {
        expect(roParts).toEqual([{ cls: "", text: line }]);
      } else {
        const roGlyphs = roParts.filter((p) =>
          p.cls.split(" ").some(
            (c) =>
              c.startsWith("glyph-") &&
              c !== "glyph-emphasis-line" &&
              c !== "glyph-assignee" &&
              c !== "glyph-topic" &&
              c !== "glyph-escape",
          ),
        );
        expect(roGlyphs.length, `read-only glyph count for ${JSON.stringify(doc)}`).toBe(widgetClasses.length);
      }

      // 3. Counters & openActionLineIndices & Ctrl+J navigation (note nextLine is "", "---", "===" so holds no actions)
      const expectedOpen = tokens.filter((t) => (t.kind === "action" || t.kind === "consequence") && t.symbol === "#").length;
      const expectedForwarded = tokens.filter((t) => (t.kind === "action" || t.kind === "consequence") && t.symbol === ">").length;
      const expectedClosed = tokens.filter(
        (t) => (t.kind === "action" || t.kind === "consequence") && (t.symbol === "v" || t.symbol === "x"),
      ).length;
      expect(countActions(doc), `countActions for ${JSON.stringify(doc)}`).toEqual({
        open: expectedOpen,
        closed: expectedClosed,
        forwarded: expectedForwarded,
      });

      const expectedHasOpen = !title && hasOpenAction(line);
      expect(expectedHasOpen).toBe(expectedOpen > 0);
      expect(openActionLineIndices(doc)).toEqual(expectedHasOpen ? [0] : []);

      // Verify Ctrl+J navigation matches openActionLineIndices
      const te = createTestEditor({ doc });
      te.select(doc.length);
      let jumpedPos: number | null = null;
      let missed = false;
      jumpToAdjacentOpenAction(te.view, 1, {
        jumpTo: (_v, pos) => {
          jumpedPos = pos;
        },
        showToast: () => {
          missed = true;
        },
      });
      if (expectedHasOpen) {
        expect(jumpedPos, `Ctrl+J target for ${JSON.stringify(doc)}`).toBe(0);
        expect(missed).toBe(false);
      } else {
        expect(jumpedPos, `Ctrl+J should not jump for ${JSON.stringify(doc)}`).toBeNull();
        expect(missed).toBe(true);
      }
      te.destroy();

      // 4. Action drawer tree
      const tree = actionTree(doc.split("\n"));
      if (title) {
        expect(tree.some((n) => n.lineIdx === 0)).toBe(false);
      }

      // 5. Markdown & HTML export (and Print)
      const md = noteToMarkdown(doc);
      const html = noteToHtml(doc);
      if (title) {
        expect(md.split("\n")[0]).toBe(`## ${line.trim()}`);
        expect(html).toContain(`<h2>${escapeHtml(line.trim())}</h2>`);
      } else {
        expect(md).not.toMatch(/(?<!\\)=> [#vx>o.,]\s/);
        expect(md).not.toMatch(/- \[[ x]\] - /);
        expect(html).not.toMatch(/➔ [#vx>o.,]\s/);
        if (tokens.some((t) => (t.kind === "action" || t.kind === "consequence") && t.symbol === ">")) {
          expect(md).toContain("*(deferred)*");
          expect(html).toContain('class="glyph-progress"');
          expect(html).toContain("M5.6 2.8l5.2 5.2-5.2 5.2");
        }
      }

      // 6. Context menu lineMenuStateAt
      const menuEnd = lineMenuStateAt(line, line.length, { title });
      expect(menuEnd.hasActionPart).toBe(actionParts.length > 0);
      if (title) {
        expect(menuEnd).toEqual({ kind: "plain", symbol: null, hasActionPart: false });
      }
    }
  });
});
