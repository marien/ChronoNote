import { derived, type Readable } from "svelte/store";
import { allNotesCache, currentDateISO, tabs } from "./stores";
import * as tokens from "./tokens";

/** Module-level memoisation map: key -> { text, today, count }
 * Preserved across keystrokes so only texts that change are recounted. */
export const overdueCountMemo = new Map<string, { text: string; today: string; count: number }>();

export function _resetMemoForTest() {
  overdueCountMemo.clear();
}

/**
 * Derived store counting open own actions past their due date across all notes.
 * The texts counted are: every note in allNotesCache, with each open non-scratchpad tab's
 * live content replacing its file's cached text (match on filename), plus every open
 * scratchpad tab's content.
 */
export const overdueCount: Readable<number> = derived(
  [allNotesCache, tabs, currentDateISO],
  ([$allNotesCache, $tabs, $currentDateISO]) => {
    const currentKeys = new Set<string>();
    const activeTexts = new Map<string, string>();

    // 1. All notes in cache
    for (const [filename, content] of Object.entries($allNotesCache)) {
      activeTexts.set(filename, content);
      currentKeys.add(filename);
    }

    // 2. Open tabs (live content overlays cached content; scratchpads included)
    for (const tab of $tabs) {
      if (tab.isScratchpad) {
        const key = `scratchpad:${tab.id}`;
        activeTexts.set(key, tab.content);
        currentKeys.add(key);
      } else {
        activeTexts.set(tab.filename, tab.content);
        currentKeys.add(tab.filename);
      }
    }

    // Drop keys no longer present
    for (const key of overdueCountMemo.keys()) {
      if (!currentKeys.has(key)) {
        overdueCountMemo.delete(key);
      }
    }

    let total = 0;
    for (const [key, text] of activeTexts) {
      const remembered = overdueCountMemo.get(key);
      if (remembered && remembered.text === text && remembered.today === $currentDateISO) {
        total += remembered.count;
      } else {
        const count = tokens.countOverdue(text, $currentDateISO);
        overdueCountMemo.set(key, { text, today: $currentDateISO, count });
        total += count;
      }
    }

    return total;
  },
);

/**
 * Returns the line's governing due date: earliest date among qualifying open own due parts
 * (or delegated due parts when showDelegated is true). Returns null if none match.
 */
export function itemDueDate(line: string, showDelegated: boolean = false): string | null {
  const items = tokens.dueItems(line);
  let earliest: string | null = null;
  for (const item of items) {
    if (!item.date) continue;
    const isQualifying =
      (!item.delegated && item.state === "#") ||
      (showDelegated && item.delegated);
    if (isQualifying) {
      if (earliest === null || item.date < earliest) {
        earliest = item.date;
      }
    }
  }
  return earliest;
}

/**
 * Returns the Sunday (YYYY-MM-DD) of the ISO 8601 week for `todayISO`.
 * In ISO 8601, a week runs Monday (1) through Sunday (7).
 */
export function getSundayOfIsoWeek(todayISO: string): string {
  const [y, m, d] = todayISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  dt.setUTCDate(dt.getUTCDate() + daysUntilSunday);
  const resY = dt.getUTCFullYear();
  const resM = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const resD = String(dt.getUTCDate()).padStart(2, "0");
  return `${resY}-${resM}-${resD}`;
}

export type DueGroupKey = "overdue" | "today" | "thisWeek" | "later";

export interface DueGroup<T> {
  key: DueGroupKey;
  items: T[];
}

/** Determines which of the four due groups an ISO due date falls into. */
export function dueGroupForDate(dueDate: string, todayISO: string, sundayOfThisWeek?: string): DueGroupKey {
  if (dueDate < todayISO) return "overdue";
  if (dueDate === todayISO) return "today";
  const sunday = sundayOfThisWeek ?? getSundayOfIsoWeek(todayISO);
  if (dueDate <= sunday) return "thisWeek";
  return "later";
}

function compareDueGroupItems<T extends { filename: string; lineIdx: number; dueDate: string }>(
  a: T,
  b: T,
): number {
  // 1. due date ascending
  if (a.dueDate !== b.dueDate) {
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  // 2. note's date descending (scratchpads sort last)
  if (a.filename !== b.filename) {
    const aIsScratch = !/^\d{4}-\d{2}-\d{2}/.test(a.filename);
    const bIsScratch = !/^\d{4}-\d{2}-\d{2}/.test(b.filename);
    if (aIsScratch && !bIsScratch) return 1;
    if (!aIsScratch && bIsScratch) return -1;
    return b.filename.localeCompare(a.filename);
  }
  // 3. line index ascending
  return a.lineIdx - b.lineIdx;
}

/**
 * Groups and sorts action items by due status into four groups:
 * Overdue (< today), Today (=== today), This week (after today up to Sunday of today's ISO week), Later.
 * Empty groups are omitted.
 * Inside each group, items are sorted by due date ascending, then note's date descending, then line index.
 */
export function groupByDue<T extends { filename: string; lineIdx: number; line?: string; dueDate?: string }>(
  items: T[],
  todayISO: string,
  options?: { showDelegated?: boolean },
): DueGroup<T & { dueDate: string }>[] {
  const sunday = getSundayOfIsoWeek(todayISO);
  const buckets: Record<DueGroupKey, (T & { dueDate: string })[]> = {
    overdue: [],
    today: [],
    thisWeek: [],
    later: [],
  };

  const showDelegated = options?.showDelegated ?? false;

  for (const item of items) {
    const dueDate = item.dueDate ?? (item.line !== undefined ? itemDueDate(item.line, showDelegated) : null);
    if (!dueDate) continue;

    const key = dueGroupForDate(dueDate, todayISO, sunday);
    buckets[key].push({ ...item, dueDate });
  }

  const groupKeys: DueGroupKey[] = ["overdue", "today", "thisWeek", "later"];
  const result: DueGroup<T & { dueDate: string }>[] = [];

  for (const key of groupKeys) {
    const groupItems = buckets[key];
    if (groupItems.length > 0) {
      groupItems.sort(compareDueGroupItems);
      result.push({ key, items: groupItems });
    }
  }

  return result;
}
