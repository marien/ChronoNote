// Refactor R1 (docs/design/line-tokenizer-design.md, step 1): freezes what the
// current token code does with a large corpus of note lines, so the later
// tokenizer rewrite can be compared line by line. Test-only: if one of these
// snapshots changes, the grammar's behaviour changed.
import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { liveGlyphs, glyphAtomicRanges } from "../editor/glyphs";
import { parseGlyphLine } from "../editor/glyphLine";
import {
  countActions,
  cycleActionSymbol,
  findActionSymbols,
  innermostActionSymbol,
  innermostTopicSymbol,
  isSetextUnderline,
  isTopicLikeLine,
  leadingTopicTag,
  parseNumberedItem,
  stripLeadingToken,
  toggleOpenClosed,
} from "../tokens";
import { REFERENCE_TODAY, SCENARIO_NAMES, scenario } from "../testing/scenarios";

interface DecoRecord {
  from: number;
  to: number;
  kind: "replace" | "mark";
  class?: string;
  label?: string;
}

function listDecorations(set: DecorationSet): DecoRecord[] {
  const out: DecoRecord[] = [];
  const cursor = set.iter();
  while (cursor.value) {
    const spec = cursor.value.spec as { class?: string; widget?: { label?: string; className?: string } };
    if (spec.widget) {
      // The widget's fields are `private` in TypeScript only; read them at runtime.
      out.push({
        from: cursor.from,
        to: cursor.to,
        kind: "replace",
        class: spec.widget.className,
        label: spec.widget.label,
      });
    } else if (spec.class !== undefined) {
      out.push({ from: cursor.from, to: cursor.to, kind: "mark", class: spec.class });
    } else {
      out.push({ from: cursor.from, to: cursor.to, kind: "replace" });
    }
    cursor.next();
  }
  return out;
}

function editorRecord(line: string) {
  const view = new EditorView({
    state: EditorState.create({ doc: line, extensions: [liveGlyphs, glyphAtomicRanges] }),
    parent: document.body,
  });
  try {
    const plugin = view.plugin(liveGlyphs)!;
    return {
      decorations: listDecorations(plugin.decorations),
      atomic: listDecorations(plugin.atomicDecorations).map((r) => ({ from: r.from, to: r.to })),
    };
  } finally {
    view.destroy();
  }
}

function record(line: string) {
  return {
    line,
    glyphLine: parseGlyphLine(line),
    innermostActionSymbol: innermostActionSymbol(line),
    innermostTopicSymbol: innermostTopicSymbol(line),
    leadingTopicTag: leadingTopicTag(line),
    findActionSymbols: findActionSymbols(line),
    stripLeadingToken: stripLeadingToken(line),
    isTopicLikeLine: isTopicLikeLine(line),
    isSetextUnderline: isSetextUnderline(line),
    parseNumberedItem: parseNumberedItem(line),
    cycleActionSymbol: cycleActionSymbol(line, 1),
    toggleOpenClosed: toggleOpenClosed(line),
    countActions: countActions(line),
    editor: editorRecord(line),
  };
}

/** Every distinct line of every note of every scenario, in first-seen order. */
function scenarioLines(): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  // scenarios.ts reads a build-time constant that only the demo bundle defines.
  vi.stubGlobal("__DEMO_APP_VERSION__", undefined);
  vi.useFakeTimers();
  // The "demo" scenario is built from the real clock; pin it.
  vi.setSystemTime(new Date(`${REFERENCE_TODAY}T12:00:00`));
  try {
    for (const name of SCENARIO_NAMES) {
      const seed = scenario(name);
      const dirs = [seed.notes ?? {}, ...Object.values(seed.otherDirs ?? {})];
      for (const notes of dirs) {
        for (const filename of Object.keys(notes).sort()) {
          for (const line of notes[filename].split("\n")) {
            if (!seen.has(line)) {
              seen.add(line);
              lines.push(line);
            }
          }
        }
      }
    }
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
  return lines;
}

const EDGE_CASES: string[] = [
  "# open action",
  "  # indented two",
  "    # indented four",
  "v done",
  "  v indented done",
  "> deferred",
  "    > indented deferred",
  "x won't do",
  "  x indented cancelled",
  "o agenda topic",
  "  o indented topic",
  ". discussed topic",
  ", skipped topic",
  "#",
  "v",
  ">",
  "x",
  "o",
  ".",
  ",",
  "#no space",
  "vnot an action",
  "- bullet",
  "* star bullet",
  "  - nested bullet",
  "    * nested star",
  "-no space",
  "! important line",
  "!no space",
  "  ! indented emphasis",
  "Talked to Sam => follow up",
  "Talked to Sam => # follow up",
  "Talked to Sam => v follow up",
  "Talked to Sam => > follow up",
  "Talked to Sam => x follow up",
  "=> starts the line",
  "=> # starts with consequence",
  "=> v consequence done",
  "=> @name assigned",
  "# task => @dana to do",
  "# task => # then this",
  "# do X => # do Y",
  "ask @sam about it",
  "@first-last needs to know",
  "@name",
  "mail dana@example.com about it",
  "see https://x.y/@user for details",
  "(@a) owns this",
  "(@a, @b, @c) own this",
  "(@a @b)",
  "# (topic) text",
  "  # (topic) indented text",
  "v (topic) done text",
  "# text (topic) not leading",
  "a sentence with (word) in prose",
  "(word) at the start",
  "=> # (topic) text",
  "o (topic) agenda",
  "# (two words) text",
  "# () empty parens",
  "=====",
  "====",
  "-----",
  "Section title",
  "1. first item",
  "1.1) sub item",
  "1.1. sub item dot",
  "o 1. numbered topic",
  "# 1. numbered action",
  "  2) indented numbered",
  "10. ten",
  "",
  "   ",
  "\t# tab indented",
  "# café ünïcode text ☕",
  "日本語のテキスト",
  "# 日本語 => @田中 確認",
  "x ❌ emoji and symbols ➔ ☐ ☑",
  "# trailing space ",
  "#  two spaces",
];

describe("token behaviour snapshot (refactor R1)", () => {
  it("scenario corpus", () => {
    const lines = scenarioLines();
    expect(lines.length).toBeGreaterThan(200);
    expect(lines.map(record)).toMatchSnapshot();
    // One EditorView per line: about 8 s on a busy machine, past Vitest's 5 s default.
  }, 60_000);

  it("edge cases", () => {
    expect(EDGE_CASES.length).toBeGreaterThanOrEqual(40);
    expect(EDGE_CASES.map(record)).toMatchSnapshot();
  }, 60_000);

  it("the snapshot is meaningful", () => {
    expect(parseGlyphLine("# a").some((p) => p.cls === "glyph-open")).toBe(true);
    expect(parseGlyphLine("mail dana@example.com").some((p) => p.cls === "glyph-assignee")).toBe(false);
    expect(parseGlyphLine("(@a, @b)").filter((p) => p.cls === "glyph-assignee")).toHaveLength(2);
    // The editor part really produced decorations.
    expect(editorRecord("# a").decorations).toEqual([
      { from: 0, to: 2, kind: "replace", class: "glyph-open", label: "☐" },
    ]);
  });
});
