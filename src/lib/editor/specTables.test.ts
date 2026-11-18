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

type ParsedRow =
  | {
      kind: "valid";
      file: string;
      heading: string;
      lineNumber: number;
      rawBefore: string;
      rawKeys: string;
      before: string;
      keys: string[];
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
    const keys = rawKeys.split(",").map((k) => k.trim());
    if (keys.length === 0 || keys.some((k) => k.length === 0)) {
      rows.push({
        kind: "invalid",
        file,
        heading: currentHeading,
        lineNumber,
        reason: "Keys cell must list one or more key names separated by ', '",
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
      keys,
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
      for (const key of row.keys) {
        ed.press(key);
      }
      expect(ed.caret()).toBe(row.after);

      const beforeText = stripMarkers(row.before);
      if (stripMarkers(row.after) !== beforeText) {
        let restored = false;
        for (let i = 0; i < row.keys.length; i++) {
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
