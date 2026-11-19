import { describe, expect, it } from "vitest";
import { classifyTitle } from "./agendaTitles";
import {
  appendRemovedSectionTo,
  computeAutoSync,
  computeCalendarSync,
  flagRemovedSection,
  isAdhocSection,
  type AutoSyncResult,
  type CalendarSyncResult,
  type RemovedSection,
} from "./calendarReconcile";

const CLASSIFY_HEADER = "| Raw title | Classified |";
const ADHOC_HEADER = "| Header | Ad-hoc |";
const SYNC_HEADER = "| Note | Agenda | Removed | After | Changes |";
const AUTOSYNC_HEADER = "| Note | Agenda | Removed | Added before | Auto-sync |";
const SECTION_ACTION_HEADER = "| Action | Note | Section | After |";

// Vite reads the spec files at transform time: no Node types (and no type escapes) needed.
const SPEC_FILES = import.meta.glob("../../docs/spec/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

type TableKind =
  | { kind: "classify"; cols: 2 }
  | { kind: "adhoc"; cols: 2 }
  | { kind: "sync"; cols: 5 }
  | { kind: "autosync"; cols: 5 }
  | { kind: "sectionAction"; cols: 4 };

const HEADER_MAP: Record<string, TableKind> = {
  [CLASSIFY_HEADER]: { kind: "classify", cols: 2 },
  [ADHOC_HEADER]: { kind: "adhoc", cols: 2 },
  [SYNC_HEADER]: { kind: "sync", cols: 5 },
  [AUTOSYNC_HEADER]: { kind: "autosync", cols: 5 },
  [SECTION_ACTION_HEADER]: { kind: "sectionAction", cols: 4 },
};

function decodeSpecText(text: string): string {
  return text.replace(/↵/g, "\n").replace(/·/g, " ");
}

function unwrapBackticks(cell: string): string | null {
  const trimmed = cell.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")) {
    const inner = trimmed.slice(1, -1);
    if (!inner.includes("`")) return inner;
  }
  return null;
}

function parseCodeOrDash(cell: string): string | null {
  const trimmed = cell.trim();
  if (trimmed === "—") return "—";
  const inner = unwrapBackticks(trimmed);
  return inner === null ? null : decodeSpecText(inner);
}

function parseTitleList(
  cell: string,
  withStarts: boolean,
): { titles: string[]; starts: Record<string, string> } | string {
  const trimmed = cell.trim();
  if (trimmed === "—") return { titles: [], starts: {} };
  const inner = unwrapBackticks(trimmed);
  if (inner === null) return "Title list cell must be '—' or wrapped in single backticks";

  const titles: string[] = [];
  const starts: Record<string, string> = {};
  for (const part of inner.split(",")) {
    const item = part.trim();
    if (withStarts) {
      const atIdx = item.lastIndexOf(" @");
      if (atIdx >= 0) {
        const title = decodeSpecText(item.slice(0, atIdx));
        const start = decodeSpecText(item.slice(atIdx + 2));
        titles.push(title);
        starts[title] = start;
        continue;
      }
    }
    titles.push(decodeSpecText(item));
  }
  return { titles, starts };
}

function parseRemovedSection(cell: string): RemovedSection | null {
  const inner = unwrapBackticks(cell);
  if (inner === null) return null;
  const sep = inner.indexOf(" :: ");
  if (sep < 0) return { header: decodeSpecText(inner), lines: [] };
  const header = decodeSpecText(inner.slice(0, sep));
  const body = decodeSpecText(inner.slice(sep + 4));
  return { header, lines: body.split("\n") };
}

function isSeparatorRow(trimmedLine: string, cols: number): boolean {
  if (!trimmedLine.startsWith("|") || !trimmedLine.endsWith("|")) return false;
  const cells = trimmedLine.slice(1, -1).split("|").map((c) => c.trim());
  return cells.length === cols && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function formatChanges(result: CalendarSyncResult): string {
  const parts: string[] = [];
  if (result.newTitles.length > 0) parts.push(`new: ${result.newTitles.join(", ")}`);
  if (result.reorderedTitles.length > 0) parts.push(`reordered: ${result.reorderedTitles.join(", ")}`);
  if (result.removedEmpty.length > 0) parts.push(`dropped: ${result.removedEmpty.join(", ")}`);
  for (const s of result.removedWithContent) {
    parts.push(`review: ${s.header} :: ${s.lines.join("\n")}`);
  }
  return parts.length === 0 ? "—" : parts.join("; ");
}

function formatAutoSync(result: AutoSyncResult): string {
  const parts: string[] = [];
  if (result.apply) parts.push("apply");
  if (result.needsReview) parts.push("review");
  if (result.added.length > 0) parts.push(`added: ${result.added.join(", ")}`);
  if (result.removed.length > 0) parts.push(`removed: ${result.removed.join(", ")}`);
  if (result.offer.length > 0) parts.push(`offer: ${result.offer.join(", ")}`);
  if (result.apply) parts.push(`after: ${result.content}`);
  return parts.length === 0 ? "—" : parts.join("; ");
}

type ValidRow =
  | {
      kind: "valid";
      file: string;
      ruleId: string;
      rowNumber: number;
      table: "classify";
      rawTitle: string;
      expected: string;
    }
  | {
      kind: "valid";
      file: string;
      ruleId: string;
      rowNumber: number;
      table: "adhoc";
      header: string;
      expected: "yes" | "no";
    }
  | {
      kind: "valid";
      file: string;
      ruleId: string;
      rowNumber: number;
      table: "sync";
      note: string;
      agenda: string[];
      starts: Record<string, string>;
      removed: string[];
      expectedAfter: string;
      expectedChanges: string;
    }
  | {
      kind: "valid";
      file: string;
      ruleId: string;
      rowNumber: number;
      table: "autosync";
      note: string;
      agenda: string[];
      starts: Record<string, string>;
      removed: string[];
      addedBefore: string[];
      expected: string;
    }
  | {
      kind: "valid";
      file: string;
      ruleId: string;
      rowNumber: number;
      table: "sectionAction";
      action: "flag" | "move";
      note: string;
      section: RemovedSection;
      expectedAfter: string;
    };

type InvalidRow = {
  kind: "invalid";
  file: string;
  ruleId: string;
  rowNumber: number;
  lineNumber: number;
  reason: string;
};

type ParsedRow = ValidRow | InvalidRow;

function parseCalendarSpecFile(file: string, content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = content.split(/\r?\n/);

  let inFence = false;
  let currentHeading: string | null = null;
  let currentRuleId: string | null = null;
  let tableKind: TableKind | null = null;
  let tableState: "none" | "expectSeparator" | "inBody" = "none";
  let rowNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const trimmed = lines[i].trim();

    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      tableState = "none";
      tableKind = null;
      continue;
    }
    if (inFence) continue;

    const h3Match = /^###\s+(.+)$/.exec(trimmed);
    if (h3Match) {
      currentHeading = h3Match[1].trim();
      const idMatch = /^([A-Za-z]+\d+)\b/.exec(currentHeading);
      currentRuleId = idMatch ? idMatch[1] : null;
      tableState = "none";
      tableKind = null;
      rowNumber = 0;
      continue;
    }
    if (/^#{1,2}\s+/.test(trimmed)) {
      currentHeading = null;
      currentRuleId = null;
      tableState = "none";
      tableKind = null;
      rowNumber = 0;
      continue;
    }

    if (currentHeading === null) continue;

    if (tableState === "none") {
      const matched = HEADER_MAP[trimmed];
      if (matched) {
        tableKind = matched;
        tableState = "expectSeparator";
      }
      continue;
    }

    if (tableState === "expectSeparator") {
      if (tableKind && isSeparatorRow(trimmed, tableKind.cols)) {
        tableState = "inBody";
      } else {
        rows.push({
          kind: "invalid",
          file,
          ruleId: currentRuleId ?? currentHeading,
          rowNumber: 0,
          lineNumber,
          reason: `Expected ${tableKind?.cols ?? "?"}-column markdown table separator row`,
        });
        tableState = "none";
        tableKind = null;
      }
      continue;
    }

    if (!trimmed.startsWith("|")) {
      tableState = "none";
      tableKind = null;
      continue;
    }

    rowNumber++;
    const ruleId = currentRuleId ?? currentHeading;
    const invalid = (reason: string): InvalidRow => ({
      kind: "invalid",
      file,
      ruleId,
      rowNumber,
      lineNumber,
      reason,
    });

    if (!currentRuleId) {
      rows.push(invalid(`Heading '${currentHeading}' must start with a rule ID like C1 or C2`));
      continue;
    }
    if (!trimmed.endsWith("|")) {
      rows.push(invalid("Table row does not end with '|'"));
      continue;
    }

    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (!tableKind || cells.length !== tableKind.cols) {
      rows.push(invalid(`Expected ${tableKind?.cols ?? "?"} cells, found ${cells.length}`));
      continue;
    }

    if (tableKind.kind === "classify") {
      const rawInner = unwrapBackticks(cells[0]);
      const expected = parseCodeOrDash(cells[1]);
      if (rawInner === null) {
        rows.push(invalid("Raw title cell must be wrapped in single backticks"));
      } else if (expected === null) {
        rows.push(invalid("Classified cell must be '—' or wrapped in single backticks"));
      } else {
        rows.push({
          kind: "valid",
          file,
          ruleId,
          rowNumber,
          table: "classify",
          rawTitle: decodeSpecText(rawInner),
          expected,
        });
      }
      continue;
    }

    if (tableKind.kind === "adhoc") {
      const headerInner = unwrapBackticks(cells[0]);
      if (headerInner === null) {
        rows.push(invalid("Header cell must be wrapped in single backticks"));
      } else if (cells[1] !== "yes" && cells[1] !== "no") {
        rows.push(invalid("Ad-hoc cell must be 'yes' or 'no'"));
      } else {
        rows.push({
          kind: "valid",
          file,
          ruleId,
          rowNumber,
          table: "adhoc",
          header: decodeSpecText(headerInner),
          expected: cells[1],
        });
      }
      continue;
    }

    if (tableKind.kind === "sync") {
      const noteInner = unwrapBackticks(cells[0]);
      const agendaParsed = parseTitleList(cells[1], true);
      const removedParsed = parseTitleList(cells[2], false);
      const afterInner = unwrapBackticks(cells[3]);
      const expectedChanges = parseCodeOrDash(cells[4]);
      if (noteInner === null || afterInner === null) {
        rows.push(invalid("Note and After cells must be wrapped in single backticks"));
      } else if (typeof agendaParsed === "string") {
        rows.push(invalid(`Agenda: ${agendaParsed}`));
      } else if (typeof removedParsed === "string") {
        rows.push(invalid(`Removed: ${removedParsed}`));
      } else if (expectedChanges === null) {
        rows.push(invalid("Changes cell must be '—' or wrapped in single backticks"));
      } else {
        rows.push({
          kind: "valid",
          file,
          ruleId,
          rowNumber,
          table: "sync",
          note: decodeSpecText(noteInner),
          agenda: agendaParsed.titles,
          starts: agendaParsed.starts,
          removed: removedParsed.titles,
          expectedAfter: decodeSpecText(afterInner),
          expectedChanges,
        });
      }
      continue;
    }

    if (tableKind.kind === "autosync") {
      const noteInner = unwrapBackticks(cells[0]);
      const agendaParsed = parseTitleList(cells[1], true);
      const removedParsed = parseTitleList(cells[2], false);
      const addedParsed = parseTitleList(cells[3], false);
      const expected = parseCodeOrDash(cells[4]);
      if (noteInner === null) {
        rows.push(invalid("Note cell must be wrapped in single backticks"));
      } else if (typeof agendaParsed === "string") {
        rows.push(invalid(`Agenda: ${agendaParsed}`));
      } else if (typeof removedParsed === "string") {
        rows.push(invalid(`Removed: ${removedParsed}`));
      } else if (typeof addedParsed === "string") {
        rows.push(invalid(`Added before: ${addedParsed}`));
      } else if (expected === null) {
        rows.push(invalid("Auto-sync cell must be '—' or wrapped in single backticks"));
      } else {
        rows.push({
          kind: "valid",
          file,
          ruleId,
          rowNumber,
          table: "autosync",
          note: decodeSpecText(noteInner),
          agenda: agendaParsed.titles,
          starts: agendaParsed.starts,
          removed: removedParsed.titles,
          addedBefore: addedParsed.titles,
          expected,
        });
      }
      continue;
    }

    // sectionAction
    const action = cells[0];
    const noteInner = unwrapBackticks(cells[1]);
    const section = parseRemovedSection(cells[2]);
    const afterInner = unwrapBackticks(cells[3]);
    if (action !== "flag" && action !== "move") {
      rows.push(invalid("Action cell must be 'flag' or 'move'"));
    } else if (noteInner === null || afterInner === null) {
      rows.push(invalid("Note and After cells must be wrapped in single backticks"));
    } else if (section === null) {
      rows.push(invalid("Section cell must be wrapped in single backticks"));
    } else {
      rows.push({
        kind: "valid",
        file,
        ruleId,
        rowNumber,
        table: "sectionAction",
        action,
        note: decodeSpecText(noteInner),
        section,
        expectedAfter: decodeSpecText(afterInner),
      });
    }
  }

  return rows;
}

function loadCalendarSpecRows(): ParsedRow[] {
  const allRows: ParsedRow[] = [];
  for (const key of Object.keys(SPEC_FILES).sort()) {
    const file = key.slice(key.lastIndexOf("/") + 1);
    allRows.push(...parseCalendarSpecFile(file, SPEC_FILES[key]));
  }
  return allRows;
}

const calendarRows = loadCalendarSpecRows();

describe("docs/spec calendar tables", () => {
  it("docs/spec/ contains at least 50 calendar spec rows", () => {
    expect(calendarRows.filter((r) => r.kind === "valid").length).toBeGreaterThanOrEqual(50);
  });

  for (const row of calendarRows) {
    if (row.kind === "invalid") {
      it(`${row.ruleId} row ${row.rowNumber} (line ${row.lineNumber}): invalid table row`, () => {
        throw new Error(`${row.file}:${row.lineNumber} (${row.ruleId}): ${row.reason}`);
      });
      continue;
    }

    it(`${row.ruleId} row ${row.rowNumber}`, () => {
      switch (row.table) {
        case "classify": {
          const res = classifyTitle(row.rawTitle);
          const actual = res === null ? "—" : res.removed ? `removed: ${res.title}` : res.title;
          expect(actual).toBe(row.expected);
          break;
        }
        case "adhoc": {
          expect(isAdhocSection(row.header) ? "yes" : "no").toBe(row.expected);
          break;
        }
        case "sync": {
          const res = computeCalendarSync(row.note, row.agenda, row.removed, row.starts);
          expect(res.content).toBe(row.expectedAfter);
          expect(formatChanges(res)).toBe(row.expectedChanges);
          break;
        }
        case "autosync": {
          const res = computeAutoSync(row.note, row.agenda, row.removed, row.starts, row.addedBefore);
          if (!res.apply) expect(res.content).toBe(row.note);
          expect(formatAutoSync(res)).toBe(row.expected);
          break;
        }
        case "sectionAction": {
          const actual =
            row.action === "flag"
              ? flagRemovedSection(row.note, row.section)
              : appendRemovedSectionTo(row.note, row.section);
          expect(actual).toBe(row.expectedAfter);
          break;
        }
      }
    });
  }
});
