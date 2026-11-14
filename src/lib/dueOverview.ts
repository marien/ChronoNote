import { derived, type Readable } from "svelte/store";
import { allNotesCache, currentDateISO, tabs } from "./stores";
import * as tokens from "./tokens";
import { addDaysISO } from "./date";
import { getLineActionParts, tokenizeNoteLine } from "./grammar/tokenize";

/** Module-level memoisation map: key -> { text, today, count }
 * Preserved across keystrokes so only texts that change are recounted. */
export const overdueCountMemo = new Map<string, { text: string; today: string; count: number }>();

export interface DueSoonItem {
  date: string;
  text: string;
  section: string | null;
  filename: string;
  lineIdx: number;
}

export function extractActionText(line: string, from = 0, to = line.length): string {
  let partText = line.slice(from, to).trim();
  if (partText.startsWith("=>")) {
    partText = partText.replace(/^=>\s+(?:[#v>x](?:\s+|$))?/, "");
  } else {
    partText = partText.replace(/^[#v>x](?:\s+|$)/, "");
  }
  partText = partText.replace(/(?:^|\s)by:[^\s]+/gi, " ");
  partText = partText.trim().replace(/\s+/g, " ");
  if (partText.length > 60) {
    partText = partText.slice(0, 60) + "…";
  }
  return partText;
}

export function compareDueSoonItems(a: DueSoonItem, b: DueSoonItem): number {
  // 1. date ascending
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
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

export const dueSummaryMemo = new Map<
  string,
  {
    text: string;
    today: string;
    overdue: number;
    upcoming: number;
    dueToday: number;
    items: DueSoonItem[];
  }
>();

export function _resetMemoForTest() {
  overdueCountMemo.clear();
  dueSummaryMemo.clear();
}

/**
 * Derived store summarizing overdue and upcoming actions across all notes.
 */
export const dueSummary: Readable<{
  overdue: number;
  upcoming: number;
  dueToday: number;
  items: DueSoonItem[];
}> = derived(
  [allNotesCache, tabs, currentDateISO],
  ([$allNotesCache, $tabs, $currentDateISO]) => {
    const currentKeys = new Set<string>();
    const activeTexts = new Map<string, { text: string; filename: string }>();

    // 1. All notes in cache
    for (const [filename, content] of Object.entries($allNotesCache)) {
      activeTexts.set(filename, { text: content, filename });
      currentKeys.add(filename);
    }

    // 2. Open tabs (live content overlays cached content; scratchpads included)
    for (const tab of $tabs) {
      if (tab.isScratchpad) {
        const key = `scratchpad:${tab.id}`;
        activeTexts.set(key, { text: tab.content, filename: tab.filename });
        currentKeys.add(key);
      } else {
        activeTexts.set(tab.filename, { text: tab.content, filename: tab.filename });
        currentKeys.add(tab.filename);
      }
    }

    // Drop keys no longer present
    for (const key of dueSummaryMemo.keys()) {
      if (!currentKeys.has(key)) {
        dueSummaryMemo.delete(key);
      }
    }

    let totalOverdue = 0;
    let totalUpcoming = 0;
    let totalDueToday = 0;
    const allItems: DueSoonItem[] = [];

    const maxUpcoming = addDaysISO($currentDateISO, 6);

    for (const [key, { text, filename }] of activeTexts) {
      const remembered = dueSummaryMemo.get(key);
      if (remembered && remembered.text === text && remembered.today === $currentDateISO) {
        totalOverdue += remembered.overdue;
        totalUpcoming += remembered.upcoming;
        totalDueToday += remembered.dueToday;
        allItems.push(...remembered.items);
      } else {
        const lines = text.split("\n");
        const items: DueSoonItem[] = [];
        // One pass over the due items (the same rules as countOverdue and countUpcoming): this runs on every
        // keystroke for the note being typed in.
        let overdue = 0;
        let upcoming = 0;
        let dueToday = 0;

        for (const d of tokens.dueItems(text)) {
          if (d.state !== "#" || d.delegated || !d.date) continue;
          const isOverdue = d.date < $currentDateISO;
          const isUpcoming = d.date >= $currentDateISO && d.date <= maxUpcoming;
          if (!isOverdue && !isUpcoming) continue;
          if (isOverdue) overdue++;
          else upcoming++;
          if (d.date === $currentDateISO) dueToday++;

          const line = lines[d.lineIdx] ?? "";
          const lineTokens = tokenizeNoteLine(lines, d.lineIdx);
          const parts = getLineActionParts(line, lineTokens);
          const part = parts.find((p) => d.from >= p.from && d.from < p.to);
          const actionText = part
            ? extractActionText(line, part.from, part.to)
            : extractActionText(line, 0, line.length);
          const secHeader = tokens.getSectionHeaderForLine(lines, d.lineIdx);

          items.push({
            date: d.date,
            text: actionText,
            section: secHeader ? secHeader : null,
            filename,
            lineIdx: d.lineIdx,
          });
        }

        dueSummaryMemo.set(key, {
          text,
          today: $currentDateISO,
          overdue,
          upcoming,
          dueToday,
          items,
        });

        totalOverdue += overdue;
        totalUpcoming += upcoming;
        totalDueToday += dueToday;
        allItems.push(...items);
      }
    }

    allItems.sort(compareDueSoonItems);

    return {
      overdue: totalOverdue,
      upcoming: totalUpcoming,
      dueToday: totalDueToday,
      items: allItems,
    };
  },
);

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

export type DueGroupKey = "overdue" | "today" | "thisWeek" | "later" | `day:${string}`;

export interface DueGroup<T> {
  key: DueGroupKey;
  items: T[];
}

/** Determines which of the due groups an ISO due date falls into. */
export function dueGroupForDate(
  dueDate: string,
  todayISO: string,
  sundayOfThisWeek?: string,
  days?: number,
): DueGroupKey {
  if (dueDate < todayISO) return "overdue";
  if (dueDate === todayISO) return "today";
  if (days !== undefined) {
    const maxDay = addDaysISO(todayISO, days - 1);
    if (dueDate <= maxDay) {
      return `day:${dueDate}`;
    }
    return "later";
  }
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
 * Groups and sorts action items by due status into four groups (or daily groups when options.days is passed):
 * Overdue (< today), Today (=== today), This week (after today up to Sunday of today's ISO week) or one per day for next (days-1) days, Later.
 * Empty groups are omitted.
 * Inside each group, items are sorted by due date ascending, then note's date descending, then line index.
 */
export function groupByDue<T extends { filename: string; lineIdx: number; line?: string; dueDate?: string }>(
  items: T[],
  todayISO: string,
  options?: { showDelegated?: boolean; days?: number },
): DueGroup<T & { dueDate: string }>[] {
  const sunday = getSundayOfIsoWeek(todayISO);
  const showDelegated = options?.showDelegated ?? false;
  const days = options?.days;

  const buckets = new Map<DueGroupKey, (T & { dueDate: string })[]>();

  for (const item of items) {
    const dueDate = item.dueDate ?? (item.line !== undefined ? itemDueDate(item.line, showDelegated) : null);
    if (!dueDate) continue;

    const key = dueGroupForDate(dueDate, todayISO, sunday, days);
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push({ ...item, dueDate });
  }

  const groupKeys: DueGroupKey[] = [];
  if (days !== undefined) {
    groupKeys.push("overdue", "today");
    for (let i = 1; i < days; i++) {
      groupKeys.push(`day:${addDaysISO(todayISO, i)}`);
    }
    groupKeys.push("later");
  } else {
    groupKeys.push("overdue", "today", "thisWeek", "later");
  }

  const result: DueGroup<T & { dueDate: string }>[] = [];

  for (const key of groupKeys) {
    const groupItems = buckets.get(key);
    if (groupItems && groupItems.length > 0) {
      groupItems.sort(compareDueGroupItems);
      result.push({ key, items: groupItems });
    }
  }

  return result;
}
