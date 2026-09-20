/** Cross-tab search (Ctrl/Cmd+Shift+F). Split out of `controller.ts` in the
 * v0.5.0 refactor. "Open" scope scans the live tab contents; "all" scope
 * scans `allNotesCache` (populated by whichever drawer last refreshed it —
 * the Search modal refreshes it before switching scope).
 *
 * Supports search syntax operators (Area 8.2 / Decision 7):
 *   is:open       restricts results to open action lines (#)
 *   is:done       restricts results to completed action lines (v)
 *   tag:<topic>   matches lines containing (topic)
 *   has:@<name>   matches lines assigned to @name
 *   since:YYYY-MM-DD
 *   before:YYYY-MM-DD
 */
import { get } from "svelte/store";
import { allNotesCache, modal, searchResultsStore, tabs } from "./stores";
import { compareTabsByRecency, sortFilenamesByRecency } from "./tabSort";
import { innermostActionSymbol } from "./tokens";
import type { SearchResultItem } from "./types";

export interface SearchFilterChip {
  id: string;
  raw: string;
  label: string;
  kind: "is" | "tag" | "has" | "since" | "before";
  value: string;
}

export interface ParsedSearchQuery {
  term: string;
  operators: {
    isOpen?: boolean;
    isDone?: boolean;
    tag?: string;
    hasAssignee?: string;
    since?: string;
    before?: string;
  };
  chips: SearchFilterChip[];
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const chips: SearchFilterChip[] = [];
  const operators: ParsedSearchQuery["operators"] = {};
  const remainingTokens: string[] = [];

  const tokens = query.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "is:open") {
      operators.isOpen = true;
      chips.push({ id: "op-is-open", raw: token, label: "is:open", kind: "is", value: "open" });
    } else if (lower === "is:done") {
      operators.isDone = true;
      chips.push({ id: "op-is-done", raw: token, label: "is:done", kind: "is", value: "done" });
    } else if (lower.startsWith("tag:")) {
      const val = token.slice(4).trim();
      if (val) {
        operators.tag = val;
        chips.push({ id: `op-tag-${val}`, raw: token, label: `tag:${val}`, kind: "tag", value: val });
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("has:")) {
      let val = token.slice(4).trim();
      if (val.startsWith("@")) val = val.slice(1);
      if (val) {
        operators.hasAssignee = val;
        chips.push({ id: `op-has-${val}`, raw: token, label: `has:@${val}`, kind: "has", value: val });
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("since:")) {
      const val = token.slice(6).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        operators.since = val;
        chips.push({ id: `op-since-${val}`, raw: token, label: `since:${val}`, kind: "since", value: val });
      } else {
        remainingTokens.push(token);
      }
    } else if (lower.startsWith("before:")) {
      const val = token.slice(7).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        operators.before = val;
        chips.push({ id: `op-before-${val}`, raw: token, label: `before:${val}`, kind: "before", value: val });
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

export function openCrossTabSearch() {
  searchResultsStore.set([]);
  modal.set("search");
}

export function runSearch(query: string, scope: "open" | "all" = "open") {
  const q = query.trim();
  if (!q) {
    searchResultsStore.set([]);
    return;
  }

  const parsed = parseSearchQuery(query);
  if (parsed.chips.length === 0 && !parsed.term) {
    searchResultsStore.set([]);
    return;
  }

  const { term, operators } = parsed;
  const termLower = term.toLowerCase();
  const tagTarget = operators.tag ? `(${operators.tag.toLowerCase()})` : null;
  const assigneeRegex = operators.hasAssignee ? new RegExp(`@${operators.hasAssignee}\\b`, "i") : null;

  function matchesLine(filename: string, line: string): boolean {
    const iso = filename.replace(/\.txt$/, "");
    const isDated = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    if (operators.since) {
      if (!isDated || iso < operators.since) return false;
    }
    if (operators.before) {
      if (!isDated || iso > operators.before) return false;
    }
    if (operators.isOpen && innermostActionSymbol(line) !== "#") return false;
    if (operators.isDone && innermostActionSymbol(line) !== "v") return false;
    if (tagTarget && !line.toLowerCase().includes(tagTarget)) return false;
    if (assigneeRegex && !assigneeRegex.test(line)) return false;
    if (termLower && !line.toLowerCase().includes(termLower)) return false;
    return true;
  }

  const results: SearchResultItem[] = [];
  if (scope === "open") {
    for (const tab of [...get(tabs)].sort(compareTabsByRecency)) {
      const lines = tab.content.split("\n");
      lines.forEach((line, lineIdx) => {
        if (matchesLine(tab.filename, line)) {
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
    const allSources = get(allNotesCache);
    const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
    for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
      const lines = allSources[filename].split("\n");
      lines.forEach((line, lineIdx) => {
        if (matchesLine(filename, line)) {
          results.push({
            tabId: openTabIdByFilename.get(filename),
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
