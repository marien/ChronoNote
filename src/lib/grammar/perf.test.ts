// Refactor R7: the editor's decorations now come from the tokenizer. This compares a full rebuild with the
// MatchDecorator regexes it replaced (kept here only for the comparison).
import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, MatchDecorator, WidgetType } from "@codemirror/view";
import { buildGlyphDecorations } from "../editor/glyphs";
import { REFERENCE_TODAY, SCENARIO_NAMES, scenario } from "../testing/scenarios";

class W extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  toDOM() {
    return document.createElement("span");
  }
}

const oldRender = new MatchDecorator({
  regexp:
    /(^!\s)|((?<=^\s*)#\s)|((?<=^\s*)v\s)|((?<=^\s*)>\s)|((?<=^\s*)x\s)|((?<=^\s*)o\s)|((?<=^\s*)\.\s)|((?<=^\s*),\s)|(=>\s@[\w-]+)|(=>\s[#vx>]\s)|(=>\s)|((?<=^\s*)[-*]\s)|(\(@[\w-]+(?:[\s,]+@[\w-]+)*\))|((?<![\w@/])@[\w-]+)|(\([^\s()]+\))/gm,
  decorate(add, from, to, match, view) {
    const text = match[0];
    if (text.startsWith("! ")) {
      add(from, view.state.doc.lineAt(from).to, Decoration.mark({ class: "glyph-emphasis-line" }));
    } else if (text.startsWith("=> @")) {
      add(from, from + 3, Decoration.replace({ widget: new W("a") }));
      add(from + 3, to, Decoration.mark({ class: "glyph-assignee" }));
    } else if (text.startsWith("=>")) {
      add(from, from + 3, Decoration.replace({ widget: new W("a") }));
      if (to > from + 3) add(from + 3, to, Decoration.replace({ widget: new W(text[3]) }));
    } else if (text.startsWith("-") || text.startsWith("*")) {
      add(from, to, Decoration.replace({ widget: new W("b") }));
    } else if (text.startsWith("(@")) {
      for (const n of text.matchAll(/@[\w-]+/g)) {
        add(from + n.index!, from + n.index! + n[0].length, Decoration.mark({ class: "glyph-assignee" }));
      }
    } else if (text.startsWith("@")) {
      add(from, to, Decoration.mark({ class: "glyph-assignee" }));
    } else if (!text.startsWith("(")) {
      add(from, to, Decoration.replace({ widget: new W(text[0]) }));
    }
  },
});
const oldAtomic = new MatchDecorator({
  regexp:
    /((?<=^\s*)#\s)|((?<=^\s*)v\s)|((?<=^\s*)>\s)|((?<=^\s*)x\s)|((?<=^\s*)o\s)|((?<=^\s*)\.\s)|((?<=^\s*),\s)|((?<==>\s)[#vx>]\s)|(=>\s)|((?<=^\s*)[-*]\s)/gm,
  decoration: () => Decoration.replace({}),
});

function bigDoc(): string {
  vi.stubGlobal("__DEMO_APP_VERSION__", undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${REFERENCE_TODAY}T12:00:00`));
  let largest = "";
  try {
    for (const name of SCENARIO_NAMES) {
      const seed = scenario(name);
      for (const notes of [seed.notes ?? {}, ...Object.values(seed.otherDirs ?? {})]) {
        for (const text of Object.values(notes)) if (text.length > largest.length) largest = text;
      }
    }
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
  const lines = largest.split("\n");
  const out: string[] = [];
  while (out.length < 2000) out.push(...lines);
  return out.join("\n");
}

function best(fn: () => void, rounds = 5, reps = 50): number {
  let min = Infinity;
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) fn();
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

describe("editor glyph decorations: tokenizer vs the old regexes (refactor R7)", () => {
  it("is not more than 1.5x slower over 50 rebuilds of a 2,000-line note", () => {
    const state = EditorState.create({ doc: bigDoc() });
    // jsdom has no layout, so its real viewport covers only a few lines: present the whole note as visible.
    const whole = { from: 0, to: state.doc.length };
    const view = { state, visibleRanges: [whole], viewport: whole } as unknown as EditorView;
    {
      expect(view.state.doc.lines).toBeGreaterThanOrEqual(2000);
      const count = (s: { size: number }) => s.size;
      const fresh = buildGlyphDecorations(view);
      expect(count(fresh.decorations)).toBeGreaterThan(100);
      // Same number of atomic ranges as the regex found.
      expect(count(fresh.atomic)).toBe(count(oldAtomic.createDeco(view)));
      const oldMs = best(() => {
        oldRender.createDeco(view);
        oldAtomic.createDeco(view);
      });
      const newMs = best(() => buildGlyphDecorations(view));
      console.log(`50 rebuilds, ${view.state.doc.lines} lines: old ${oldMs.toFixed(1)} ms, new ${newMs.toFixed(1)} ms`);
      expect(newMs).toBeLessThan(oldMs * 1.5);
    }
  }, 120_000);
});
