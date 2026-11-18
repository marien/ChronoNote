// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createTestEditor, type TestEditor } from "../testing/testEditor";

const SPEC_HEADER = "| Before | Keys | After |";
// Vite reads the spec files at transform time: no Node types (and no type escapes) needed.
const SPEC_FILES = import.meta.glob("../../../docs/spec/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const editors: TestEditor[] = [];

function openEditor(doc: string): TestEditor {
  const ed = createTestEditor({ doc });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

function stripMarkers(s: string): string {
  return s.replace(/[|\[\]]/g, "");
}

function decodeSpecText(text: string): string {
  return text
    .replace(/‸/g, "|")
    .replace(/«/g, "[")
    .replace(/»/g, "]")
    .replace(/↵/g, "\n")
    .replace(/⇥/g, "\t");
}

function unwrapBackticks(cell: string): string | null {
  const trimmed = cell.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")) {
    const inner = trimmed.slice(1, -1);
    if (!inner.includes("`")) return inner;
  }
  return null;
}

function isSeparatorRow(trimmedLine: string): boolean {
  if (!trimmedLine.startsWith("|") || !trimmedLine.endsWith("|")) return false;
  const cells = trimmedLine.slice(1, -1).split("|").map((c) => c.trim());
  return cells.length === 3 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

type KeyStep =
  | { kind: "press"; key: string }
  | { kind: "type"; text: string }
  | { kind: "paste"; text: string };

function parseKeySteps(rawKeys: string): KeyStep[] | string {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < rawKeys.length; i++) {
    const ch = rawKeys[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (inQuotes) {
    return "Unterminated quote in Keys cell";
  }
  parts.push(current.trim());

  if (parts.length === 0 || parts.some((p) => p.length === 0)) {
    return "Keys cell must list one or more key names separated by ', '";
  }

  const steps: KeyStep[] = [];
  for (const part of parts) {
    if (/^(type|paste)\b/.test(part)) {
      const match = /^(type|paste)\s+"([^"]*)"$/.exec(part);
      if (!match) {
        return `Invalid ${part.startsWith("type") ? "type" : "paste"} step '${part}'; expected 'type "..."' or 'paste "..."'`;
      }
      const kind = match[1] as "type" | "paste";
      steps.push({ kind, text: decodeSpecText(match[2]) });
    } else if (part.includes('"')) {
      return `Unexpected quote in key step '${part}'`;
    } else {
      steps.push({ kind: "press", key: part });
    }
  }
  return steps;
}

type ParsedRow =
  | {
      kind: "valid";
      file: string;
      heading: string;
      lineNumber: number;
      rawBefore: string;
      rawKeys: string;
      before: string;
      steps: KeyStep[];
      after: string;
    }
  | {
      kind: "invalid";
      file: string;
      heading: string;
      lineNumber: number;
      reason: string;
    };

function parseSpecFile(file: string, content: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = content.split(/\r?\n/);

  let inFence = false;
  let currentHeading: string | null = null;
  let tableState: "none" | "expectSeparator" | "inBody" = "none";

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
      tableState = "none";
      continue;
    }
    if (/^#{1,2}\s+/.test(trimmed)) {
      currentHeading = null;
      tableState = "none";
      continue;
    }

    if (currentHeading === null) continue;

    if (tableState === "none") {
      if (trimmed === SPEC_HEADER) {
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
          heading: currentHeading,
          lineNumber,
          reason: `Expected markdown table separator row after '${SPEC_HEADER}'`,
        });
        tableState = "none";
      }
      continue;
    }

    // tableState === "inBody"
    if (!trimmed.startsWith("|")) {
      tableState = "none";
      continue;
    }

    if (!trimmed.endsWith("|")) {
      rows.push({
        kind: "invalid",
        file,
        heading: currentHeading,
        lineNumber,
        reason: "Table row does not end with '|'",
      });
      continue;
    }

    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length !== 3) {
      rows.push({
        kind: "invalid",
        file,
        heading: currentHeading,
        lineNumber,
        reason: `Expected 3 cells, found ${cells.length}`,
      });
      continue;
    }

    const beforeInner = unwrapBackticks(cells[0]);
    const afterInner = unwrapBackticks(cells[2]);
    if (beforeInner === null || afterInner === null) {
      rows.push({
        kind: "invalid",
        file,
        heading: currentHeading,
        lineNumber,
        reason: "Before and After cells must be wrapped in single backticks",
      });
      continue;
    }

    const rawKeys = cells[1];
    const stepsOrError = parseKeySteps(rawKeys);
    if (typeof stepsOrError === "string") {
      rows.push({
        kind: "invalid",
        file,
        heading: currentHeading,
        lineNumber,
        reason: stepsOrError,
      });
      continue;
    }

    rows.push({
      kind: "valid",
      file,
      heading: currentHeading,
      lineNumber,
      rawBefore: cells[0],
      rawKeys,
      before: decodeSpecText(beforeInner),
      steps: stepsOrError,
      after: decodeSpecText(afterInner),
    });
  }

  return rows;
}

function loadSpecRows(): ParsedRow[] {
  const allRows: ParsedRow[] = [];
  for (const key of Object.keys(SPEC_FILES).sort()) {
    const file = key.slice(key.lastIndexOf("/") + 1);
    allRows.push(...parseSpecFile(file, SPEC_FILES[key]));
  }
  return allRows;
}

const specRows = loadSpecRows();

describe("spec table key parsing", () => {
  it('parses type "..." as a single step even when quoted text contains ", "', () => {
    const md = [
      "### T1. Type parsing",
      "| Before | Keys | After |",
      "| :--- | :--- | :--- |",
      '| `‸` | type "a, b", Backspace | `a, ‸` |',
    ].join("\n");
    const rows = parseSpecFile("test.md", md);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "valid",
      steps: [
        { kind: "type", text: "a, b" },
        { kind: "press", key: "Backspace" },
      ],
    });
  });

  it('parses paste "..." as a single step, decoding notation inside quotes and keeping ", " together', () => {
    const md = [
      "### P1. Paste parsing",
      "| Before | Keys | After |",
      "| :--- | :--- | :--- |",
      '| `‸` | paste "a, b↵⇥c" | `a, b↵⇥c‸` |',
    ].join("\n");
    const rows = parseSpecFile("test.md", md);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "valid",
      steps: [{ kind: "paste", text: "a, b\n\tc" }],
    });
  });
});

describe("docs/spec tables", () => {
  it("docs/spec/ contains at least one spec table row", () => {
    expect(specRows.filter((r) => r.kind === "valid").length).toBeGreaterThan(0);
  });

  for (const row of specRows) {
    if (row.kind === "invalid") {
      it(`${row.file} ${row.heading} (line ${row.lineNumber}): invalid table row`, () => {
        throw new Error(`${row.file}:${row.lineNumber} (${row.heading}): ${row.reason}`);
      });
      continue;
    }

    it(`${row.file} ${row.heading}: ${row.rawBefore} + ${row.rawKeys}`, () => {
      const ed = openEditor(row.before);
      for (const step of row.steps) {
        if (step.kind === "type") ed.type(step.text);
        else if (step.kind === "paste") ed.paste(step.text);
        else ed.press(step.key);
      }
      expect(ed.caret()).toBe(row.after);

      const beforeText = stripMarkers(row.before);
      if (stripMarkers(row.after) !== beforeText) {
        let restored = false;
        for (let i = 0; i < row.steps.length; i++) {
          if (!ed.undo()) break;
          if (ed.text() === beforeText) {
            restored = true;
            break;
          }
        }
        expect(restored).toBe(true);
      }
    });
  }
});
