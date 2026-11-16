/** Facets: what is derived from one note entry, computed on first use and remembered per entry. An entry never
 * changes (a changed text gives a new entry), so a remembered value is always right, and it goes away with the
 * entry. Each facet only calls the existing function for it; nothing here decides what a line or section is.
 * Results are shared between views: nothing may change them. */
import { actionTree, flattenActionTree, type ActionNode } from "../actionGroups";
import { tokenizeNoteLine } from "../grammar/tokenize";
import { dueItems, listSections, normalizeHeaderTitle, type DueItem, type SectionItem } from "../tokens";
import type { NoteEntry } from "./index";

export type SectionFacet = Readonly<SectionItem & { normalized: string }>;
export interface ActionsFacet {
  readonly roots: readonly ActionNode[];
  readonly flat: readonly ActionNode[];
}
export type SpellingCounts = ReadonlyMap<string, number>;
export type NameCountsFacet = ReadonlyMap<string, SpellingCounts>;

/** How often each facet computed (not returned a remembered value). For tests only. */
export const _facetRuns = { lines: 0, sections: 0, actions: 0, due: 0, names: 0, topicTags: 0 };

const linesMemo = new WeakMap<NoteEntry, readonly string[]>();
const sectionsMemo = new WeakMap<NoteEntry, readonly SectionFacet[]>();
const actionsMemo = new WeakMap<NoteEntry, ActionsFacet>();
const dueMemo = new WeakMap<NoteEntry, readonly Readonly<DueItem>[]>();
const namesMemo = new WeakMap<NoteEntry, NameCountsFacet>();
const topicTagsMemo = new WeakMap<NoteEntry, NameCountsFacet>();

export function linesOf(e: NoteEntry): readonly string[] {
  let v = linesMemo.get(e);
  if (v === undefined) {
    _facetRuns.lines++;
    v = e.text.split("\n");
    linesMemo.set(e, v);
  }
  return v;
}

export function sectionsOf(e: NoteEntry): readonly SectionFacet[] {
  let v = sectionsMemo.get(e);
  if (v === undefined) {
    _facetRuns.sections++;
    v = listSections(e.text).map((s) => ({ ...s, normalized: normalizeHeaderTitle(s.title) }));
    sectionsMemo.set(e, v);
  }
  return v;
}

export function actionsOf(e: NoteEntry): ActionsFacet {
  let v = actionsMemo.get(e);
  if (v === undefined) {
    _facetRuns.actions++;
    const roots = actionTree(linesOf(e) as string[]);
    v = { roots, flat: flattenActionTree(roots) };
    actionsMemo.set(e, v);
  }
  return v;
}

export function dueOf(e: NoteEntry): readonly Readonly<DueItem>[] {
  let v = dueMemo.get(e);
  if (v === undefined) {
    _facetRuns.due++;
    v = dueItems(e.text);
    dueMemo.set(e, v);
  }
  return v;
}

function collectTokenCounts(
  e: NoteEntry,
  kind: "assignee" | "topicTag",
  quickChar: string,
  extract: (line: string, from: number, to: number) => string,
): NameCountsFacet {
  const lines = linesOf(e);
  const byLower = new Map<string, Map<string, number>>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(quickChar)) continue;
    for (const tok of tokenizeNoteLine(lines, i)) {
      if (tok.kind !== kind) continue;
      const raw = extract(line, tok.from, tok.to);
      if (!raw) continue;
      const lower = raw.toLowerCase();
      let counts = byLower.get(lower);
      if (!counts) {
        counts = new Map<string, number>();
        byLower.set(lower, counts);
      }
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return byLower;
}

/** Map from lower-cased `@name` (without `@`) to spelling occurrence counts for one note entry. */
export function namesOf(e: NoteEntry): NameCountsFacet {
  let v = namesMemo.get(e);
  if (v === undefined) {
    _facetRuns.names++;
    v = collectTokenCounts(e, "assignee", "@", (line, from, to) => line.slice(from + 1, to));
    namesMemo.set(e, v);
  }
  return v;
}

/** Map from lower-cased `(topic)` (without parentheses) to spelling occurrence counts for one note entry. */
export function topicTagsOf(e: NoteEntry): NameCountsFacet {
  let v = topicTagsMemo.get(e);
  if (v === undefined) {
    _facetRuns.topicTags++;
    v = collectTokenCounts(e, "topicTag", "(", (line, from, to) => line.slice(from + 1, to - 1));
    topicTagsMemo.set(e, v);
  }
  return v;
}
