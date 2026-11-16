/** Facets: what is derived from one note entry, computed on first use and remembered per entry. An entry never
 * changes (a changed text gives a new entry), so a remembered value is always right, and it goes away with the
 * entry. Each facet only calls the existing function for it; nothing here decides what a line or section is.
 * Results are shared between views: nothing may change them. */
import { actionTree, flattenActionTree, type ActionNode } from "../actionGroups";
import { dueItems, listSections, normalizeHeaderTitle, type DueItem, type SectionItem } from "../tokens";
import type { NoteEntry } from "./index";

export type SectionFacet = Readonly<SectionItem & { normalized: string }>;
export interface ActionsFacet {
  readonly roots: readonly ActionNode[];
  readonly flat: readonly ActionNode[];
}

/** How often each facet computed (not returned a remembered value). For tests only. */
export const _facetRuns = { lines: 0, sections: 0, actions: 0, due: 0 };

const linesMemo = new WeakMap<NoteEntry, readonly string[]>();
const sectionsMemo = new WeakMap<NoteEntry, readonly SectionFacet[]>();
const actionsMemo = new WeakMap<NoteEntry, ActionsFacet>();
const dueMemo = new WeakMap<NoteEntry, readonly Readonly<DueItem>[]>();

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
