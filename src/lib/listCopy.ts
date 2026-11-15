import { nodeTextRange } from "./actionDrawerRows";
import { escapeHtml } from "./exportFormats";
import { tokenAfterArrow, tokenizeLine } from "./grammar/tokenize";
import type { ActionSnapshotItem } from "./types";

export interface CopyRow {
  dateISO: string | null;
  dateLabel: string;
  section: string;
  depth: number;
  state: "#" | "v" | ">" | "x" | null;
  text: string;
  step?: number;
  progress?: { resolved: number; total: number };
  folded: boolean;
}

const STATE_BOX: Record<"#" | "v" | ">" | "x", string> = {
  "#": "☐",
  "v": "☑",
  "x": "☒",
  ">": "▷",
};

/** Formats a `YYYY-MM-DD` date as `<weekday short> <day> <month short>` in `locale`. */
export function formatShortDueDate(dateISO: string, locale: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(y, m - 1, d, 12));
}

/** Formats `YYYY-MM-DD` as `<day> <month short> <year>` in `locale` for the copy header line. */
export function formatListCopyToday(todayISO: string, locale: string): string {
  const [y, m, d] = todayISO.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d, 12));
}

export type CopyableItem = Pick<ActionSnapshotItem, "line" | "kind" | "whole" | "partFrom" | "partTo"> & {
  itemKind?: "action" | "step";
};

/** Cleans an item's own display text: removes forward links `(>…)`/`(<…)` and rewrites `by:YYYY-MM-DD`
 *  to `by <weekday short> <day> <month short>` in `locale`, keeping topic tags and `@names` as typed. */
export function cleanCopyText(item: CopyableItem, locale: string): string {
  const kind = item.kind ?? (item.itemKind === "step" ? "step" : item.itemKind === "action" ? "line" : undefined);
  const whole = kind === undefined || item.whole === true;
  const line = item.line;
  const tokens = tokenizeLine(line);

  interface Edit {
    from: number;
    to: number;
    replacement: string;
    collapseSpace: boolean;
  }
  const edits: Edit[] = [];

  let rangeFrom = 0;
  let rangeTo = line.length;

  if (whole) {
    // Match `stripLeadingToken`: strip the leading action token (if any) and the last `=> [<sym>]` arrow.
    if (tokens[0]?.kind === "action") {
      edits.push({ from: tokens[0].from, to: tokens[0].to, replacement: "", collapseSpace: false });
    }
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.kind !== "arrow") continue;
      const next = tokenAfterArrow(line, tokens, i);
      const stripEnd = next?.kind === "consequence" ? next.to : t.to;
      edits.push({ from: t.from, to: stripEnd, replacement: "", collapseSpace: false });
      break;
    }
  } else {
    const r = nodeTextRange({ id: "", filename: "", lineIdx: 0, header: "", ...item, kind });
    rangeFrom = r.from;
    rangeTo = r.to;
  }

  for (const t of tokens) {
    if (t.to <= rangeFrom || t.from >= rangeTo) continue;
    if (t.from < rangeFrom || t.to > rangeTo) continue;
    if (t.kind === "forwardLink") {
      edits.push({ from: t.from, to: t.to, replacement: "", collapseSpace: true });
    } else if (t.kind === "due" && t.date) {
      edits.push({
        from: t.from,
        to: t.to,
        replacement: `by ${formatShortDueDate(t.date, locale)}`,
        collapseSpace: false,
      });
    }
  }

  edits.sort((a, b) => a.from - b.from || a.to - b.to);

  let out = "";
  let pos = rangeFrom;
  let pendingSpaceCollapse = false;

  for (const e of edits) {
    if (e.from < pos) continue;
    let before = line.slice(pos, e.from);
    if (pendingSpaceCollapse) {
      if (out === "" || /\s$/.test(out)) {
        before = before.replace(/^\s+/, "");
      }
      pendingSpaceCollapse = false;
    }
    out += before;
    if (e.replacement) {
      out += e.replacement;
    } else if (e.collapseSpace) {
      pendingSpaceCollapse = true;
    }
    pos = e.to;
  }

  let tail = line.slice(pos, rangeTo);
  if (pendingSpaceCollapse && (out === "" || /\s$/.test(out))) {
    tail = tail.replace(/^\s+/, "");
  }
  out += tail;
  return out.trim();
}

function formatRowContent(row: CopyRow): string {
  const box = row.state !== null ? `${STATE_BOX[row.state]} ` : "";
  const step = row.step !== undefined ? `${row.step}. ` : "";
  const progress = row.folded && row.progress ? ` (${row.progress.resolved}/${row.progress.total})` : "";
  return `${box}${step}${row.text}${progress}`;
}

interface RowGroup {
  heading: string;
  rows: CopyRow[];
}

function groupCopyRows(rows: CopyRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  let prevDateLabel: string | undefined;
  let prevSection: string | undefined;

  for (const row of rows) {
    if (groups.length === 0 || row.dateLabel !== prevDateLabel || row.section !== prevSection) {
      const heading = row.section ? `${row.dateLabel} · ${row.section}` : row.dateLabel;
      groups.push({ heading, rows: [row] });
      prevDateLabel = row.dateLabel;
      prevSection = row.section;
    } else {
      groups[groups.length - 1].rows.push(row);
    }
  }

  return groups;
}

function renderGroupHtml(rows: CopyRow[]): string {
  let html = "";
  let currentDepth = -1;
  let liOpen = false;

  for (const row of rows) {
    const targetDepth = Math.max(0, row.depth);

    if (currentDepth === -1) {
      html += "<ul>";
      currentDepth = 0;
      liOpen = false;
    }

    while (currentDepth < targetDepth) {
      if (!liOpen) html += "<li>";
      html += "<ul>";
      currentDepth++;
      liOpen = false;
    }

    while (currentDepth > targetDepth) {
      if (liOpen) html += "</li>";
      html += "</ul>";
      currentDepth--;
      liOpen = true;
    }

    if (liOpen) {
      html += "</li>";
    }

    html += `<li>${escapeHtml(formatRowContent(row))}`;
    liOpen = true;
  }

  while (currentDepth >= 0) {
    if (liOpen) html += "</li>";
    html += "</ul>";
    currentDepth--;
    liOpen = true;
  }

  return html;
}

/** Builds rich (`text/html`) and plain (`text/plain`) clipboard strings from displayed action rows. */
export function buildListCopy(rows: CopyRow[], headerLine: string): { html: string; plain: string } {
  const groups = groupCopyRows(rows);
  const plainLines: string[] = [headerLine];
  const htmlParts: string[] = [`<p>${escapeHtml(headerLine)}</p>`];

  if (groups.length > 0) {
    plainLines.push("");
    for (const group of groups) {
      plainLines.push(group.heading);
      for (const row of group.rows) {
        const indent = "  ".repeat(Math.max(0, row.depth));
        plainLines.push(`${indent}${formatRowContent(row)}`);
      }
      htmlParts.push(`<p><b>${escapeHtml(group.heading)}</b></p>`);
      htmlParts.push(renderGroupHtml(group.rows));
    }
  }

  return {
    html: htmlParts.join(""),
    plain: plainLines.join("\n"),
  };
}
