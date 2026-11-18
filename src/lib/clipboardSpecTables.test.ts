// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToNoteText, noteTextToHtml } from "./richClipboard";

const PASTE_HEADER = "| HTML | Text |";
const COPY_HEADER = "| Text | HTML |";

// Vite reads the spec files at transform time: no Node types (and no type escapes) needed.
const SPEC_FILES = import.meta.glob("../../docs/spec/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

type TableKind = "paste" | "copy";

function decodeHtmlSpecText(text: string): string {
  return text.replace(/↵/g, "\n").replace(/⇥/g, "\t");
}

function decodeNoteSpecText(text: string): string {
  return text.replace(/↵/g, "\n").replace(/⇥/g, "\t").replace(/·/g, " ");
}

function unwrapBackticks(cell: string): string | null {
  const trimmed = cell.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")) {
    const inner = trimmed.slice(1, -1);
    if (!inner.includes("`")) return inner;
  }
  return null;
}

function parseOutputCell(cell: string, decode: (s: string) => string): string | null | undefined {
  const trimmed = cell.trim();
  if (trimmed === "—") return null;
  const inner = unwrapBackticks(trimmed);
  if (inner === null) return undefined;
  return decode(inner);
}

function isSeparatorRow(trimmedLine: string): boolean {
  if (!trimmedLine.startsWith("|") || !trimmedLine.endsWith("|")) return false;
  const cells = trimmedLine.slice(1, -1).split("|").map((c) => c.trim());
  return cells.length === 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

type ParsedRow =
  | {
      kind: "valid";
      file: string;
      ruleId: string;
      rowNumber: number;
      tableKind: TableKind;
      input: string;
      expected: string | null;
    }
  | {
      kind: "invalid";
      file: string;
      ruleId: string;
      rowNumber: number;
      lineNumber: number;
      reason: string;
    };

function parseClipboardSpecFile(file: string, content: string): ParsedRow[] {
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
      if (trimmed === PASTE_HEADER) {
        tableKind = "paste";
        tableState = "expectSeparator";
      } else if (trimmed === COPY_HEADER) {
        tableKind = "copy";
        tableState = "expectSeparator";
      }
      continue;
    }

    if (tableState === "expectSeparator") {
      if (isSeparatorRow(trimmed)) {
        tableState = "inBody";
      } else {
        rows.push({
          kind: "invalid",
          file,
          ruleId: currentRuleId ?? currentHeading,
          rowNumber: 0,
          lineNumber,
          reason: `Expected 2-column markdown table separator row after '${tableKind === "paste" ? PASTE_HEADER : COPY_HEADER}'`,
        });
        tableState = "none";
        tableKind = null;
      }
      continue;
    }

    // tableState === "inBody"
    if (!trimmed.startsWith("|")) {
      tableState = "none";
      tableKind = null;
      continue;
    }

    rowNumber++;
    const ruleId = currentRuleId ?? currentHeading;

    if (!currentRuleId) {
      rows.push({
        kind: "invalid",
        file,
        ruleId,
        rowNumber,
        lineNumber,
        reason: `Heading '${currentHeading}' must start with a rule ID like P1 or K1`,
      });
      continue;
    }

    if (!trimmed.endsWith("|")) {
      rows.push({
        kind: "invalid",
        file,
        ruleId,
        rowNumber,
        lineNumber,
        reason: "Table row does not end with '|'",
      });
      continue;
    }

    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length !== 2) {
      rows.push({
        kind: "invalid",
        file,
        ruleId,
        rowNumber,
        lineNumber,
        reason: `Expected 2 cells, found ${cells.length}`,
      });
      continue;
    }

    const decodeInput = tableKind === "paste" ? decodeHtmlSpecText : decodeNoteSpecText;
    const decodeOutput = tableKind === "paste" ? decodeNoteSpecText : decodeHtmlSpecText;

    const inputInner = unwrapBackticks(cells[0]);
    if (inputInner === null) {
      rows.push({
        kind: "invalid",
        file,
        ruleId,
        rowNumber,
        lineNumber,
        reason: "Input cell must be wrapped in single backticks",
      });
      continue;
    }

    const expected = parseOutputCell(cells[1], decodeOutput);
    if (expected === undefined) {
      rows.push({
        kind: "invalid",
        file,
        ruleId,
        rowNumber,
        lineNumber,
        reason: "Output cell must be '—' or wrapped in single backticks",
      });
      continue;
    }

    rows.push({
      kind: "valid",
      file,
      ruleId,
      rowNumber,
      tableKind: tableKind!,
      input: decodeInput(inputInner),
      expected,
    });
  }

  return rows;
}

function loadClipboardSpecRows(): ParsedRow[] {
  const allRows: ParsedRow[] = [];
  for (const key of Object.keys(SPEC_FILES).sort()) {
    const file = key.slice(key.lastIndexOf("/") + 1);
    allRows.push(...parseClipboardSpecFile(file, SPEC_FILES[key]));
  }
  return allRows;
}

const clipboardRows = loadClipboardSpecRows();

describe("docs/spec clipboard tables", () => {
  it("docs/spec/ contains at least 60 clipboard spec rows", () => {
    expect(clipboardRows.filter((r) => r.kind === "valid").length).toBeGreaterThanOrEqual(60);
  });

  for (const row of clipboardRows) {
    if (row.kind === "invalid") {
      it(`${row.ruleId} row ${row.rowNumber} (line ${row.lineNumber}): invalid table row`, () => {
        throw new Error(`${row.file}:${row.lineNumber} (${row.ruleId}): ${row.reason}`);
      });
      continue;
    }

    it(`${row.ruleId} row ${row.rowNumber}`, () => {
      const actual = row.tableKind === "paste" ? htmlToNoteText(row.input) : noteTextToHtml(row.input);
      expect(actual).toBe(row.expected);
    });
  }
});
