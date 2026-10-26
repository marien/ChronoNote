
/** Pure model for Week Review (feature review A3 / §432).
 * From notes and an ISO week, builds the days of that week with their sections,
 * open items, done items, and counts. Pure and unit-tested. */
import {
  addDaysISO,
  isoWeek,
  isoWeekToMonday,
  isValidCalendarDate,
  parseISODateLocal,
  todayISO,
} from "./date";
import { isSetextUnderline, normalizeHeaderTitle, dueItems } from "./tokens";
import { tokenizeLine } from "./grammar/tokenize";
import { actionTree, flattenActionTree, type ActionNode } from "./actionGroups";
import { innermostActionSymbol } from "./tokens";
import { get } from "svelte/store";
import {
  modal,
  weekReviewShowDone,
  weekReviewWeek,
  weekReviewYear,
  actionDrawerScopeRequest,
  actionDrawerFilterRequest,
  actionDrawerShowOnlyOpen,
  actionDrawerDueView,
} from "./stores";
import { refreshAllNotesCache } from "./persistence";
import { openActionDrawer } from "./actions";

export type WeekReviewItemKind = "action" | "step" | "topic" | "decision";

export interface WeekReviewItem {
  id: string;
  filename: string;
  lineIdx: number;
  line: string;
  itemKind: WeekReviewItemKind;
  /** Action states: "#", "v", ">", "x"; topic states: "o", ".", ","; null for decision lines */
  state: "#" | "v" | ">" | "x" | "o" | "." | "," | null;
  depth: number;
  parentId?: string;
  hasChildren?: boolean;
  stepIndex?: number;
  partFrom?: number;
  partTo?: number;
  symbolCol?: number | null;
  delegated?: boolean;
  contextOnly?: boolean;
  dueDate?: string | null;
  overdue?: boolean;
  whole?: boolean;
}

export interface WeekReviewCounts {
  openActions: number;
  openTopics: number;
  overdue: number;
}

export interface WeekReviewSection {
  title: string; // "" for text before first header
  lineRange: { from: number; to: number };
  openItems: WeekReviewItem[];
  doneItems: WeekReviewItem[];
  counts: WeekReviewCounts;
}

export interface WeekReviewDay {
  date: string; // YYYY-MM-DD
  filename: string;
  sections: WeekReviewSection[];
  counts: WeekReviewCounts;
}

export interface WeekReviewModel {
  year: number;
  week: number;
  mondayISO: string;
  sundayISO: string;
  days: WeekReviewDay[];
  counts: WeekReviewCounts;
  earlierWeeksOpenActions: number;
  earlierWeeksOverdue: number;
}

/** ISO year and week number for a YYYY-MM-DD date.
 * In ISO 8601, the week's Thursday determines the ISO year. */
export function isoYearAndWeek(iso: string): { year: number; week: number } {
  const d = parseISODateLocal(iso);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = addDaysISO(iso, -(day - 1));
  const thursday = addDaysISO(monday, 3);
  const year = parseInt(thursday.slice(0, 4), 10);
  const week = isoWeek(iso);
  return { year, week };
}

/** Which week opens (decision 1b): the week that has just been worked. On Monday that is the previous ISO week; on
 * Saturday and Sunday it is the current one, which ends that Sunday (as on any other day). */
export function defaultWeekForDate(todayISO: string): { year: number; week: number } {
  const d = parseISODateLocal(todayISO);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const current = isoYearAndWeek(todayISO);
  if (day === 1) {
    const monday = isoWeekToMonday(current.year, current.week);
    const prevMonday = addDaysISO(monday, -7);
    return isoYearAndWeek(prevMonday);
  }
  return current;
}

/** Check if a filename is a valid dated note (YYYY-MM-DD.txt). */
export function isDatedNoteFilename(filename: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})\.txt$/.exec(filename);
  if (!m) return false;
  return isValidCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Extract ISO date string from YYYY-MM-DD.txt or return null. */
export function dateFromNoteFilename(filename: string): string | null {
  if (!isDatedNoteFilename(filename)) return null;
  return filename.slice(0, 10);
}

/** True if the line contains a forward link (>YYYY-MM-DD...), meaning it was moved elsewhere. */
export function isLineForwarded(line: string): boolean {
  if (!line.includes("(>")) return false;
  return tokenizeLine(line).some((t) => t.kind === "forwardLink" && t.dir === ">");
}

/** Earliest due date in [from, to) for an action node. */
function ownDueDateForPart(line: string, from: number, to: number): string | null {
  let best: string | null = null;
  for (const d of dueItems(line)) {
    if (d.date && d.from >= from && d.from < to) {
      if (best === null || d.date < best) best = d.date;
    }
  }
  return best;
}

interface RawSection {
  title: string;
  lineRange: { from: number; to: number };
  bodyStart: number;
  bodyEnd: number;
}

function parseSections(lines: string[]): RawSection[] {
  const headers: { title: string; lineIdx: number; bodyStart: number }[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (isSetextUnderline(lines[i + 1]) && !isSetextUnderline(lines[i]) && lines[i].trim() !== "") {
      headers.push({
        title: lines[i].trim(),
        lineIdx: i,
        bodyStart: i + 2,
      });
    }
  }

  const sections: RawSection[] = [];
  if (headers.length === 0) {
    if (lines.length > 0) {
      sections.push({
        title: "",
        lineRange: { from: 0, to: lines.length - 1 },
        bodyStart: 0,
        bodyEnd: lines.length - 1,
      });
    }
    return sections;
  }

  // Pre-header section if lines exist before first header
  if (headers[0].lineIdx > 0) {
    const preLines = lines.slice(0, headers[0].lineIdx);
    if (preLines.some((l) => l.trim() !== "")) {
      sections.push({
        title: "",
        lineRange: { from: 0, to: headers[0].lineIdx - 1 },
        bodyStart: 0,
        bodyEnd: headers[0].lineIdx - 1,
      });
    }
  }

  for (let h = 0; h < headers.length; h++) {
    const cur = headers[h];
    const next = h + 1 < headers.length ? headers[h + 1] : undefined;
    const end = next ? next.lineIdx - 1 : lines.length - 1;
    sections.push({
      title: normalizeHeaderTitle(cur.title),
      lineRange: { from: cur.lineIdx, to: end },
      bodyStart: cur.bodyStart,
      bodyEnd: end,
    });
  }

  return sections;
}

/** Count open own actions in a single dated note content. */
export interface EarlierWeeksActionsCount {
  openActions: number;
  overdue: number;
}

/** Count open own actions and overdue open own actions in a single dated note content (§433).
 * M = open own actions in earlier dated notes whose by: date is before today. */
export function countEarlierWeeksActionsInNote(
  content: string,
  todayISO: string,
): EarlierWeeksActionsCount {
  const lines = content.split("\n");
  const nodes = flattenActionTree(actionTree(lines));
  let openActions = 0;
  let overdue = 0;
  for (const node of nodes) {
    if (node.delegated) continue;
    if (node.state !== "#") continue;
    const line = lines[node.lineIdx];
    if (isLineForwarded(line)) continue;
    openActions++;
    const dueDate = ownDueDateForPart(line, node.from, node.to);
    if (dueDate !== null && dueDate < todayISO) {
      overdue++;
    }
  }
  return { openActions, overdue };
}

/** Count open own actions in a single dated note content. */
export function countOpenOwnActionsInNote(content: string): number {
  return countEarlierWeeksActionsInNote(content, "").openActions;
}

/** Parse items in one section. */
function parseSectionItems(
  filename: string,
  lines: string[],
  section: RawSection,
  treeNodes: ActionNode[],
  todayISO: string,
): { openItems: WeekReviewItem[]; doneItems: WeekReviewItem[]; counts: WeekReviewCounts } {
  const openItems: WeekReviewItem[] = [];
  const doneItems: WeekReviewItem[] = [];
  const counts: WeekReviewCounts = {
    openActions: 0,
    openTopics: 0,
    overdue: 0,
  };

  // Collect action items in this section
  const sectionActionNodes = treeNodes.filter(
    (n) => n.lineIdx >= section.bodyStart && n.lineIdx <= section.bodyEnd && !n.delegated,
  );

  const parentOf = new Map<ActionNode, ActionNode>();
  for (const node of sectionActionNodes) {
    for (const child of node.children) {
      parentOf.set(child, node);
    }
  }

  const idOf = new Map<ActionNode, string>();
  for (const node of sectionActionNodes) {
    const id = node.kind === "step" ? `${filename}-${node.lineIdx}-s${node.stepIndex}` : `${filename}-${node.lineIdx}`;
    idOf.set(node, id);
  }

  // Check which action nodes are open (state === "#" and not forwarded)
  const openNodeSet = new Set<ActionNode>();
  for (const node of sectionActionNodes) {
    if (node.state === "#" && !isLineForwarded(lines[node.lineIdx])) {
      openNodeSet.add(node);
    }
  }

  // A parent node is kept as context in openItems if any descendant is in openNodeSet
  const hasOpenDescendant = (node: ActionNode): boolean => {
    for (const child of node.children) {
      if (openNodeSet.has(child) || hasOpenDescendant(child)) return true;
    }
    return false;
  };

  const actionItemsByLine = new Map<number, WeekReviewItem[]>();

  for (const node of sectionActionNodes) {
    const line = lines[node.lineIdx];
    const forwarded = isLineForwarded(line);
    const id = idOf.get(node)!;
    const parent = parentOf.get(node);
    const parentId = parent ? idOf.get(parent) : undefined;
    const from = node.from;
    const to = node.to;
    const dueDate = ownDueDateForPart(line, from, to);
    const isOverdue = node.state === "#" && !forwarded && dueDate !== null && dueDate < todayISO;

    const baseItem: WeekReviewItem = {
      id,
      filename,
      lineIdx: node.lineIdx,
      line,
      itemKind: node.kind === "step" ? "step" : "action",
      state: node.state,
      depth: node.depth,
      parentId,
      stepIndex: node.stepIndex,
      partFrom: from,
      partTo: to,
      symbolCol: node.symbolCol,
      delegated: false,
      dueDate,
      overdue: isOverdue,
      whole: node.whole,
    };

    if (node.state === "#" && !forwarded) {
      counts.openActions++;
      if (isOverdue) counts.overdue++;
      openItems.push(baseItem);
    } else if (hasOpenDescendant(node)) {
      // Context-only parent row for open descendants
      openItems.push({
        ...baseItem,
        contextOnly: true,
      });
    }

    if (!forwarded && (node.state === "v" || node.state === "x")) {
      doneItems.push(baseItem);
    }
  }

  // Mark hasChildren on openItems and doneItems
  const openIds = new Set(openItems.map((i) => i.id));
  for (const item of openItems) {
    item.hasChildren = openItems.some((other) => other.parentId === item.id);
  }
  for (const item of doneItems) {
    item.hasChildren = doneItems.some((other) => other.parentId === item.id);
  }

  // Parse topics and decisions on lines in the section
  for (let lineIdx = section.bodyStart; lineIdx <= section.bodyEnd; lineIdx++) {
    const line = lines[lineIdx];
    if (line.trim() === "") continue;
    const tokens = tokenizeLine(line);
    const forwarded = isLineForwarded(line);

    // Topic line (o, ., ,)
    if (tokens[0]?.kind === "topic") {
      const sym = tokens[0].symbol as "o" | "." | ",";
      const topicItem: WeekReviewItem = {
        id: `${filename}-${lineIdx}`,
        filename,
        lineIdx,
        line,
        itemKind: "topic",
        state: sym,
        depth: 0,
      };

      if (!forwarded && (sym === "o" || sym === ",")) {
        counts.openTopics++;
        openItems.push(topicItem);
      } else if (sym === ".") {
        doneItems.push(topicItem);
      }
      continue;
    }

    // Decision line: starts with `=> ` without consequence action or assignee
    if (tokens[0]?.kind === "arrow" && line.slice(0, tokens[0].from).trim() === "") {
      const nextTok = tokens.find((t) => t.from === tokens[0].to);
      const isConsequence = nextTok?.kind === "consequence" || nextTok?.kind === "consequenceTopic";
      const isAssignee = nextTok?.kind === "assignee";
      if (!isConsequence && !isAssignee) {
        const textAfter = line.slice(tokens[0].to).trim();
        if (textAfter !== "") {
          const decisionItem: WeekReviewItem = {
            id: `${filename}-${lineIdx}`,
            filename,
            lineIdx,
            line,
            itemKind: "decision",
            state: null,
            depth: 0,
          };
          doneItems.push(decisionItem);
        }
      }
    }
  }

  // Sort items in note order (lineIdx, then stepIndex)
  const sortFn = (a: WeekReviewItem, b: WeekReviewItem) => {
    if (a.lineIdx !== b.lineIdx) return a.lineIdx - b.lineIdx;
    return (a.stepIndex ?? 0) - (b.stepIndex ?? 0);
  };
  openItems.sort(sortFn);
  doneItems.sort(sortFn);

  return { openItems, doneItems, counts };
}

/** Pure model: from note sources and an ISO week, builds the week review model. */
export function buildWeekReview(
  notes: { filename: string; content: string }[],
  year: number,
  week: number,
  todayISO: string,
): WeekReviewModel {
  const mondayISO = isoWeekToMonday(year, week);
  const sundayISO = addDaysISO(mondayISO, 6);

  // Set of 7 days in this week
  const daysInWeekSet = new Set<string>();
  for (let i = 0; i < 7; i++) {
    daysInWeekSet.add(addDaysISO(mondayISO, i));
  }

  // Map notes by date
  const noteByDate = new Map<string, { filename: string; content: string }>();
  let earlierWeeksOpenActions = 0;
  let earlierWeeksOverdue = 0;

  for (const n of notes) {
    const d = dateFromNoteFilename(n.filename);
    if (!d) continue; // ignore scratchpads and undated files
    if (d < mondayISO) {
      const earlierCounts = countEarlierWeeksActionsInNote(n.content, todayISO);
      earlierWeeksOpenActions += earlierCounts.openActions;
      earlierWeeksOverdue += earlierCounts.overdue;
    } else if (daysInWeekSet.has(d)) {
      noteByDate.set(d, n);
    }
  }

  const days: WeekReviewDay[] = [];
  const totalCounts: WeekReviewCounts = {
    openActions: 0,
    openTopics: 0,
    overdue: 0,
  };

  // Days in ascending date order (Monday to Sunday)
  const sortedDates = Array.from(daysInWeekSet).sort();

  for (const dateISO of sortedDates) {
    const note = noteByDate.get(dateISO);
    if (!note) continue; // only days that have a note

    const lines = note.content.split("\n");
    const rawSections = parseSections(lines);
    const treeNodes = flattenActionTree(actionTree(lines));

    const dayCounts: WeekReviewCounts = {
      openActions: 0,
      openTopics: 0,
      overdue: 0,
    };

    const sections: WeekReviewSection[] = [];

    for (const rawSec of rawSections) {
      const { openItems, doneItems, counts } = parseSectionItems(
        note.filename,
        lines,
        rawSec,
        treeNodes,
        todayISO,
      );

      dayCounts.openActions += counts.openActions;
      dayCounts.openTopics += counts.openTopics;
      dayCounts.overdue += counts.overdue;

      sections.push({
        title: rawSec.title,
        lineRange: rawSec.lineRange,
        openItems,
        doneItems,
        counts,
      });
    }

    totalCounts.openActions += dayCounts.openActions;
    totalCounts.openTopics += dayCounts.openTopics;
    totalCounts.overdue += dayCounts.overdue;

    days.push({
      date: dateISO,
      filename: note.filename,
      sections,
      counts: dayCounts,
    });
  }

  return {
    year,
    week,
    mondayISO,
    sundayISO,
    days,
    counts: totalCounts,
    earlierWeeksOpenActions,
    earlierWeeksOverdue,
  };
}

/** Format week range "d Mon - d Mon yyyy" localized. */
export function formatWeekRange(locale: string, mondayISO: string, sundayISO: string): string {
  const mon = parseISODateLocal(mondayISO);
  const sun = parseISODateLocal(sundayISO);
  const monYear = mon.getFullYear();
  const sunYear = sun.getFullYear();

  const monFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(mon);
  if (monYear === sunYear) {
    const sunFmt = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(sun);
    return `${monFmt} - ${sunFmt}`;
  } else {
    const monFull = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(mon);
    const sunFull = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(sun);
    return `${monFull} - ${sunFull}`;
  }
}

/** Open Week review. If target week is omitted, opens default week (decision 1b). */
export async function openWeekReview(target?: { year: number; week: number }) {
  await refreshAllNotesCache();
  if (target) {
    weekReviewYear.set(target.year);
    weekReviewWeek.set(target.week);
  } else {
    const def = defaultWeekForDate(todayISO());
    weekReviewYear.set(def.year);
    weekReviewWeek.set(def.week);
  }
  modal.set("weekReview");
}

/** Open the Action Drawer on All Files, showing only open items (decision 3b). */
export function openActionDrawerAllFiles() {
  actionDrawerScopeRequest.set("all");
  actionDrawerShowOnlyOpen.set(true);
  actionDrawerDueView.set(false);
  openActionDrawer();
}


/** Open the Action Drawer on All Files, showing only open items before the specified date (§433). */
export function openActionDrawerEarlierWeeks(sundayBeforeISO: string) {
  actionDrawerScopeRequest.set("all");
  actionDrawerShowOnlyOpen.set(true);
  actionDrawerDueView.set(false);
  actionDrawerFilterRequest.set(`before:${sundayBeforeISO} is:open`);
  openActionDrawer();
}

/** Open the Action Drawer in Due View, with the filter before the specified date (§433). */
export function openActionDrawerEarlierOverdue(sundayBeforeISO: string) {
  actionDrawerScopeRequest.set("all");
  actionDrawerShowOnlyOpen.set(true);
  actionDrawerDueView.set(true);
  actionDrawerFilterRequest.set(`before:${sundayBeforeISO} is:open`);
  openActionDrawer();
}