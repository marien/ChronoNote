/** Cross-tab search (Ctrl/Cmd+Shift+F). Split out of `controller.ts` in the
 * v0.5.0 refactor. "Open" scope scans the live tab contents; "all" scope
 * scans `notesIndex` (the Search modal refreshes the disk layer before
 * switching scope).
 *
 * Supports search syntax operators (Area 8.2 / Decision 7):
 *   is:open       restricts results to open action lines (#)
 *   is:done       restricts results to completed action lines (v)
 *   is:decision   lines with a decision arrow (=>) not starting an action, topic or delegate
 *   is:topic      lines with an agenda topic (o . , or => o/./,)
 *   is:emphasis   lines with an emphasis marker (!)
 *   section:<name> lines inside a section whose matching title contains <name>
 *   tag:<topic>   matches lines containing (topic)
 *   has:@<name>   matches lines assigned to @name
 *   since:YYYY-MM-DD
 *   before:YYYY-MM-DD
 */
import { get } from "svelte/store";
import { modal, searchResultsStore, tabs } from "./stores";
import { notesIndex } from "./notesIndex";
import { isScratchpadKey } from "./notesIndex/entries";
import { linesOf, sectionsOf, type SectionFacet } from "./notesIndex/facets";
import { compareTabsByRecency, sortFilenamesByRecency } from "./tabSort";
import {
  dueItems,
  innermostActionSymbol,
  innermostTopicSymbol,
  listSections,
  normalizeHeaderTitle,
  titleForMatching,
  type SectionItem,
} from "./tokens";
import { tokenAfterArrow, tokenizeLine } from "./grammar/tokenize";
import { isValidCalendarDate, parseDueWord } from "./date";
import type { SearchResultItem } from "./types";

export interface SearchContext {
  todayISO: string;
  locale: string;
  extra?: { today: string[]; tomorrow: string[] };
}

export interface SearchFilterChip {
  id: string;
  raw: string;
  label: string;
  kind: "is" | "section" | "tag" | "has" | "since" | "before" | "due";
  value: string;
  startIndex?: number;
  endIndex?: number;
}

export interface ParsedSearchQuery {
  term: string;
  operators: {
    isOpen?: boolean;
    isDone?: boolean;
    isDecision?: boolean;
    isTopic?: boolean;
    isEmphasis?: boolean;
    section?: string;
    tag?: string;
    tags?: string[];
    hasAssignee?: string;
    since?: string;
    before?: string;
    due?: string;
  };
  chips: SearchFilterChip[];
}

export interface QueryToken {
  token: string;
  start: number;
  end: number;
}

export function splitQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  const regex = /section:"[^"]*"?|\S+/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    tokens.push({
      token: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

const IS_OPERATORS = {
  "is:open": { key: "isOpen", value: "open" },
  "is:done": { key: "isDone", value: "done" },
  "is:decision": { key: "isDecision", value: "decision" },
  "is:topic": { key: "isTopic", value: "topic" },
  "is:emphasis": { key: "isEmphasis", value: "emphasis" },
} as const;

function upsertChip(
  chips: SearchFilterChip[],
  chip: SearchFilterChip,
  match: (c: SearchFilterChip) => boolean = (c) => c.kind === chip.kind,
): void {
  const existingIdx = chips.findIndex(match);
  if (existingIdx !== -1) {
    chips[existingIdx] = chip;
  } else {
    chips.push(chip);
  }
}

export function parseSearchQuery(query: string, ctx?: SearchContext): ParsedSearchQuery {
  const chips: SearchFilterChip[] = [];
  const operators: ParsedSearchQuery["operators"] = {};
  const remainingTokens: string[] = [];

  for (const { token, start: startIndex, end: endIndex } of splitQuery(query)) {
    const lower = token.toLowerCase();
    const isOp = IS_OPERATORS[lower as keyof typeof IS_OPERATORS];

    if (isOp) {
      delete operators.isOpen;
      delete operators.isDone;
      delete operators.isDecision;
      delete operators.isTopic;
      delete operators.isEmphasis;
      operators[isOp.key] = true;
      upsertChip(chips, {
        id: `op-is-${isOp.value}`,
        raw: token,
        label: `is:${isOp.value}`,
        kind: "is",
        value: isOp.value,
        startIndex,
        endIndex,
      });
    } else if (lower.startsWith("section:")) {
      let val = token.slice(8);
      if (val.startsWith('"')) {
        val = val.slice(1);
        if (val.endsWith('"')) val = val.slice(0, -1);
      }
      val = val.trim();
      if (val) {
        operators.section = val;
        const label = /\s/.test(val) ? `section:"${val}"` : `section:${val}`;
        upsertChip(chips, {
          id: `op-section-${val}`,
          raw: token,
          label,
          kind: "section",
          value: val,
          startIndex,
          endIndex,
        });
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("tag:")) {
      const val = token.slice(4).trim();
      if (val) {
        if (!operators.tags) operators.tags = [];
        if (!operators.tags.includes(val)) {
          operators.tags.push(val);
        }
        operators.tag = val;

        upsertChip(
          chips,
          {
            id: `op-tag-${val}`,
            raw: token,
            label: `tag:${val}`,
            kind: "tag",
            value: val,
            startIndex,
            endIndex,
          },
          (c) => c.kind === "tag" && c.value === val,
        );
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("has:")) {
      let val = token.slice(4).trim();
      if (val.startsWith("@")) val = val.slice(1);
      if (val) {
        operators.hasAssignee = val;
        upsertChip(chips, {
          id: `op-has-${val}`,
          raw: token,
          label: `has:@${val}`,
          kind: "has",
          value: val,
          startIndex,
          endIndex,
        });
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("since:")) {
      const val = token.slice(6).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        operators.since = val;
        upsertChip(chips, {
          id: `op-since-${val}`,
          raw: token,
          label: `since:${val}`,
          kind: "since",
          value: val,
          startIndex,
          endIndex,
        });
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("before:")) {
      const val = token.slice(7).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        operators.before = val;
        upsertChip(chips, {
          id: `op-before-${val}`,
          raw: token,
          label: `before:${val}`,
          kind: "before",
          value: val,
          startIndex,
          endIndex,
        });
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("due:")) {
      const val = token.slice(4).trim();
      let resolved: string | null = null;
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
      if (isoMatch && isValidCalendarDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))) {
        resolved = val;
      }
      if (!resolved && ctx) {
        resolved = parseDueWord(val, ctx.todayISO, ctx.locale, ctx.extra);
      }
      if (resolved) {
        operators.due = resolved;
        upsertChip(chips, {
          id: `op-due-${resolved}`,
          raw: token,
          label: `due:${resolved}`,
          kind: "due",
          value: resolved,
          startIndex,
          endIndex,
        });
      } else {
        remainingTokens.push(token);
      }
    } else {
      remainingTokens.push(token);
    }
  }

  return {
    term: remainingTokens.join(" "),
    operators,
    chips,
  };
}

/** True when `line` has a decision arrow (`=> `) not immediately starting an action, topic or delegate, with text after it. */
export function isDecisionLine(line: string): boolean {
  const tokens = tokenizeLine(line);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== "arrow") continue;
    const next = tokenAfterArrow(line, tokens, i);
    if (
      next &&
      (next.kind === "consequence" || next.kind === "consequenceTopic" || next.kind === "assignee")
    ) {
      continue;
    }
    if (line.slice(t.to).trim() !== "") return true;
  }
  return false;
}

/** True when `line` is a topic line or carries a consequence topic. */
export function isTopicLine(line: string): boolean {
  return innermostTopicSymbol(line) !== null;
}

/** True when `line` contains an emphasis marker (`! `). */
export function isEmphasisLine(line: string): boolean {
  return tokenizeLine(line).some((t) => t.kind === "emphasis");
}

/** True when a section title matches `sectionTargetLower` after normalizing and stripping leading/trailing dates. */
export function matchesSectionTitle(
  title: string,
  sectionTargetLower: string,
  alreadyNormalized = false,
): boolean {
  const normalized = alreadyNormalized ? title : normalizeHeaderTitle(title);
  return titleForMatching(normalized).toLowerCase().includes(sectionTargetLower);
}

function sectionAtLine<T extends { lineIdx: number }>(sections: readonly T[], lineIdx: number): T | null {
  let lo = 0;
  let hi = sections.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sections[mid].lineIdx <= lineIdx) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found === -1) return null;
  const s = sections[found];
  return lineIdx >= s.lineIdx + 2 ? s : null;
}

/** Escapes regex metacharacters so a user-typed operator value (e.g. `has:@a(b`) is matched
 * literally and can never make `new RegExp` throw. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Removes a filter chip's operator from the raw query. Every token that parses to the same
 * operator is removed: a repeated or superseded operator would otherwise leave the chip behind. */
export function removeChipFromQuery(query: string, chip: SearchFilterChip, ctx?: SearchContext): string {
  const kept: string[] = [];
  for (const { token } of splitQuery(query)) {
    const c = parseSearchQuery(token, ctx).chips[0];
    const same =
      (c && c.kind === chip.kind && (chip.kind !== "tag" || c.value === chip.value)) ||
      (chip.kind === "due" && token.toLowerCase().startsWith("due:"));
    if (!same) kept.push(token);
  }
  return kept.join(" ");
}

export interface InitialSearchParams {
  query: string;
  scope: "open" | "all";
}

let pendingInitialSearch: InitialSearchParams | null = null;

export function consumeInitialSearch(): InitialSearchParams | null {
  const initial = pendingInitialSearch;
  pendingInitialSearch = null;
  return initial;
}

export function openCrossTabSearch(initial?: InitialSearchParams) {
  pendingInitialSearch = initial ?? null;
  searchResultsStore.set([]);
  modal.set("search");
}

export function runSearch(query: string, scope: "open" | "all" = "open", ctx?: SearchContext) {
  const q = query.trim();
  if (!q) {
    searchResultsStore.set([]);
    return;
  }

  const parsed = parseSearchQuery(query, ctx);
  if (parsed.chips.length === 0 && !parsed.term) {
    searchResultsStore.set([]);
    return;
  }

  const { term, operators } = parsed;
  const termLower = term.trim().toLowerCase();
  const sectionTarget = operators.section?.toLowerCase();
  const tagsTarget = (operators.tags ?? (operators.tag ? [operators.tag] : [])).map(
    (t) => `(${t.toLowerCase()})`,
  );
  const assigneeRegex = operators.hasAssignee
    ? new RegExp(`@${escapeRegExp(operators.hasAssignee)}\\b`, "i")
    : null;

  function matchesLine(
    filename: string,
    line: string,
    lineIdx: number,
    sections?: readonly (SectionItem | SectionFacet)[],
  ): boolean {
    if (!line.trim()) return false;
    const iso = filename.replace(/\.txt$/, "");
    const isDated = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    if (operators.since) {
      if (!isDated || iso < operators.since) return false;
    }
    if (operators.before) {
      if (!isDated || iso > operators.before) return false;
    }
    if (sectionTarget !== undefined) {
      const sec = sections ? sectionAtLine(sections, lineIdx) : null;
      if (!sec) return false;
      const matched =
        "normalized" in sec
          ? matchesSectionTitle(sec.normalized, sectionTarget, true)
          : matchesSectionTitle(sec.title, sectionTarget, false);
      if (!matched) return false;
    }
    if (operators.isOpen && innermostActionSymbol(line) !== "#") return false;
    if (operators.isDone && innermostActionSymbol(line) !== "v") return false;
    if (operators.isDecision && !isDecisionLine(line)) return false;
    if (operators.isTopic && !isTopicLine(line)) return false;
    if (operators.isEmphasis && !isEmphasisLine(line)) return false;
    if (operators.due) {
      const hasDue = dueItems(line).some((d) => d.date === operators.due && !d.delegated && d.state === "#");
      if (!hasDue) return false;
    }
    for (const target of tagsTarget) {
      if (!line.toLowerCase().includes(target)) return false;
    }
    if (assigneeRegex && !assigneeRegex.test(line)) return false;
    if (termLower && !line.toLowerCase().includes(termLower)) return false;
    return true;
  }

  const results: SearchResultItem[] = [];
  if (scope === "open") {
    for (const tab of [...get(tabs)].sort(compareTabsByRecency)) {
      const lines = tab.content.split("\n");
      const sections = sectionTarget !== undefined ? listSections(tab.content) : undefined;
      lines.forEach((line, lineIdx) => {
        if (matchesLine(tab.filename, line, lineIdx, sections)) {
          results.push({
            tabId: tab.id,
            tabFilename: tab.filename,
            lineIdx,
            line,
            contextBefore: lineIdx > 0 ? lines[lineIdx - 1] : undefined,
            contextAfter: lineIdx < lines.length - 1 ? lines[lineIdx + 1] : undefined,
          });
        }
      });
    }
  } else {
    const { entries } = get(notesIndex);
    const filenames: string[] = [];
    for (const key of entries.keys()) {
      if (!isScratchpadKey(key)) filenames.push(key);
    }
    for (const filename of sortFilenamesByRecency(filenames)) {
      const entry = entries.get(filename)!;
      const lines = linesOf(entry);
      const sections = sectionTarget !== undefined ? sectionsOf(entry) : undefined;
      const tabId = entry.source === "tab" ? entry.tabId : undefined;
      lines.forEach((line, lineIdx) => {
        if (matchesLine(filename, line, lineIdx, sections)) {
          results.push({
            tabId,
            tabFilename: filename,
            lineIdx,
            line,
            contextBefore: lineIdx > 0 ? lines[lineIdx - 1] : undefined,
            contextAfter: lineIdx < lines.length - 1 ? lines[lineIdx + 1] : undefined,
          });
        }
      });
    }
  }
  searchResultsStore.set(results);
}
