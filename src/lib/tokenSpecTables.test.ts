import { describe, expect, it } from "vitest";
import { tokenizeNoteLine } from "./tokens";
import type { Token } from "./grammar/tokenize";

const TABLE_HEADER = "| Line | Tokens |";

// Vite reads the spec files at transform time: no Node types (and no type escapes) needed.
const SPEC_FILES = import.meta.glob("../../docs/spec/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

function decodeLineSpecText(text: string): string {
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

function parseTokensCell(cell: string): string | null {
  const trimmed = cell.trim();
  if (trimmed === "—") return "—";
  return unwrapBackticks(trimmed);
}

function isSeparatorRow(trimmedLine: string): boolean {
  if (!trimmedLine.startsWith("|") || !trimmedLine.endsWith("|")) return false;
  const cells = trimmedLine.slice(1, -1).split("|").map((c) => c.trim());
  return cells.length === 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function formatToken(tok: Token): string {
  const span = `${tok.from}-${tok.to}`;
  switch (tok.kind) {
    case "action":
    case "topic":
    case "bullet":
    case "emphasis":
    case "consequence":
    case "consequenceTopic":
      return `${tok.kind}:${tok.symbol ?? ""} ${span}`;
    case "due":
      return `due:${tok.date ?? ""} ${span}`;
    case "dueWord":
      return `dueWord:${tok.word ?? ""} ${span}`;
    case "forwardLink": {
      const sec = tok.section !== undefined ? `#${tok.section}` : "";
      return `forwardLink:${tok.dir ?? ""}${tok.date ?? ""}${sec} ${span}`;
    }
    case "arrow":
    case "assignee":
    case "topicTag":
    case "paren":
    case "escape":
      return `${tok.kind} ${span}`;
  }
}

function formatTokens(tokens: readonly Token[]): string {
  return tokens.length === 0 ? "—" : tokens.map(formatToken).join(" · ");
}

type ParsedRow =
  | {
      kind: "valid";
      file: string;
      ruleId: string;
      rowNumber: number;
      input: string;
      expected: string;
    }
  | {
      kind: "invalid";
      file: string;
      ruleId: string;
      rowNumber: number;
      lineNumber: number;
      reason: string;
    };

function parseTokenSpecFile(file: string, content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = content.split(/\r?\n/);

  let inFence = false;
  let currentHeading: string | null = null;
  let currentRuleId: string | null = null;
  let tableState: "none" | "expectSeparator" | "inBody" = "none";
  let rowNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const trimmed = lines[i].trim();

    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      tableState = "none";
      continue;
    }
    if (inFence) continue;

    const h3Match = /^###\s+(.+)$/.exec(trimmed);
    if (h3Match) {
      currentHeading = h3Match[1].trim();
      const idMatch = /^([A-Za-z]+\d+)\b/.exec(currentHeading);
      currentRuleId = idMatch ? idMatch[1] : null;
      tableState = "none";
      rowNumber = 0;
      continue;
    }
    if (/^#{1,2}\s+/.test(trimmed)) {
      currentHeading = null;
      currentRuleId = null;
      tableState = "none";
      rowNumber = 0;
      continue;
    }

    if (currentHeading === null) continue;

    if (tableState === "none") {
      if (trimmed === TABLE_HEADER) {
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
          reason: `Expected 2-column markdown table separator row after '${TABLE_HEADER}'`,
        });
        tableState = "none";
      }
      continue;
    }

    if (!trimmed.startsWith("|")) {
      tableState = "none";
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
        reason: `Heading '${currentHeading}' must start with a rule ID like N1 or N2`,
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

    const inputInner = unwrapBackticks(cells[0]);
    if (inputInner === null) {
      rows.push({
        kind: "invalid",
        file,
        ruleId,
        rowNumber,
        lineNumber,
        reason: "Line cell must be wrapped in single backticks",
      });
      continue;
    }

    const expected = parseTokensCell(cells[1]);
    if (expected === null) {
      rows.push({
        kind: "invalid",
        file,
        ruleId,
        rowNumber,
        lineNumber,
        reason: "Tokens cell must be '—' or wrapped in single backticks",
      });
      continue;
    }

    rows.push({
      kind: "valid",
      file,
      ruleId,
      rowNumber,
      input: decodeLineSpecText(inputInner),
      expected,
    });
  }

  return rows;
}

function loadTokenSpecRows(): ParsedRow[] {
  const allRows: ParsedRow[] = [];
  for (const key of Object.keys(SPEC_FILES).sort()) {
    const file = key.slice(key.lastIndexOf("/") + 1);
    allRows.push(...parseTokenSpecFile(file, SPEC_FILES[key]));
  }
  return allRows;
}

const tokenRows = loadTokenSpecRows();

describe("docs/spec token tables", () => {
  it("docs/spec/ contains at least 80 token spec rows", () => {
    expect(tokenRows.filter((r) => r.kind === "valid").length).toBeGreaterThanOrEqual(80);
  });

  for (const row of tokenRows) {
    if (row.kind === "invalid") {
      it(`${row.ruleId} row ${row.rowNumber} (line ${row.lineNumber}): invalid table row`, () => {
        throw new Error(`${row.file}:${row.lineNumber} (${row.ruleId}): ${row.reason}`);
      });
      continue;
    }

    it(`${row.ruleId} row ${row.rowNumber}`, () => {
      const actual = formatTokens(tokenizeNoteLine(row.input.split("\n"), 0));
      expect(actual).toBe(row.expected);
    });
  }
});
