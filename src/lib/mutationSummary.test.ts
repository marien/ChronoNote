import { describe, it, expect } from "vitest";
import {
  formatMutationSummary,
  parseMutationReport,
  type RawMutationReport,
} from "../../scripts/mutation-summary.mjs";

describe("parseMutationReport (scripts/mutation-summary.mjs)", () => {
  it("computes Stryker scores per file and sorts survivors by line", () => {
    const report: RawMutationReport = {
      files: {
        "src/lib/alpha.ts": {
          source: [
            "export function cmp(a: number, b: number) {",
            "  if (a < b) {",
            "    return true;",
            "  }",
            "  return false;",
            "}",
          ].join("\n"),
          mutants: [
            {
              id: "1",
              mutatorName: "BooleanLiteral",
              replacement: "false",
              status: "Survived",
              location: { start: { line: 3, column: 12 }, end: { line: 3, column: 16 } },
            },
            {
              id: "2",
              mutatorName: "ConditionalExpression",
              replacement: "a <= b",
              status: "Killed",
              location: { start: { line: 2, column: 7 }, end: { line: 2, column: 12 } },
            },
            {
              id: "3",
              mutatorName: "BooleanLiteral",
              replacement: "true",
              status: "Timeout",
              location: { start: { line: 5, column: 10 }, end: { line: 5, column: 15 } },
            },
          ],
        },
        "src/lib/beta.ts": {
          source: [
            "export function check(x: number, y: number) {",
            "  if (x > 0 && y > 0) return 1;",
            "  return 0;",
            "}",
          ].join("\n"),
          mutants: [
            {
              id: "4",
              mutatorName: "ArithmeticOperator",
              replacement: "0",
              status: "NoCoverage",
              location: { start: { line: 3, column: 10 }, end: { line: 3, column: 11 } },
            },
            {
              id: "5",
              mutatorName: "LogicalOperator",
              replacement: "x > 0 || y > 0",
              status: "Survived",
              location: { start: { line: 2, column: 7 }, end: { line: 2, column: 21 } },
            },
            {
              id: "6",
              mutatorName: "IgnoredExample",
              replacement: "{}",
              status: "Ignored",
              location: { start: { line: 1, column: 45 }, end: { line: 1, column: 45 } },
            },
          ],
        },
      },
    };

    const summary = parseMutationReport(report);

    expect(summary.files).toHaveLength(2);

    const alpha = summary.files[0];
    expect(alpha.file).toBe("src/lib/alpha.ts");
    expect(alpha.killed).toBe(1);
    expect(alpha.timeout).toBe(1);
    expect(alpha.survived).toBe(1);
    expect(alpha.noCoverage).toBe(0);
    expect(alpha.valid).toBe(3);
    expect(alpha.score).toBeCloseTo((2 / 3) * 100, 6);
    expect(alpha.survivors).toEqual([
      {
        line: 3,
        column: 12,
        mutatorName: "BooleanLiteral",
        original: "true",
        replacement: "false",
      },
    ]);

    const beta = summary.files[1];
    expect(beta.file).toBe("src/lib/beta.ts");
    expect(beta.killed).toBe(0);
    expect(beta.timeout).toBe(0);
    expect(beta.survived).toBe(1);
    expect(beta.noCoverage).toBe(1);
    expect(beta.valid).toBe(2);
    expect(beta.score).toBe(0);
    expect(beta.survivors).toEqual([
      {
        line: 2,
        column: 7,
        mutatorName: "LogicalOperator",
        original: "x > 0 && y > 0",
        replacement: "x > 0 || y > 0",
      },
    ]);

    expect(summary.total).toEqual({
      killed: 1,
      timeout: 1,
      survived: 2,
      noCoverage: 1,
      valid: 5,
      score: 40,
    });
  });

  it("sorts multiple survivors within a file by line then column", () => {
    const report: RawMutationReport = {
      files: {
        "src/lib/tokens.ts": {
          source: "line1\nline2\nline3 a < b && c < d\n",
          mutants: [
            {
              mutatorName: "ConditionalExpression",
              replacement: "c <= d",
              status: "Survived",
              location: { start: { line: 3, column: 16 }, end: { line: 3, column: 21 } },
            },
            {
              mutatorName: "BlockStatement",
              replacement: "{}",
              status: "Survived",
              location: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } },
            },
            {
              mutatorName: "ConditionalExpression",
              replacement: "a <= b",
              status: "Survived",
              location: { start: { line: 3, column: 7 }, end: { line: 3, column: 12 } },
            },
          ],
        },
      },
    };

    const summary = parseMutationReport(report);
    expect(summary.files[0].survivors.map((s) => [s.line, s.column, s.original])).toEqual([
      [1, 1, "line1"],
      [3, 7, "a < b"],
      [3, 16, "c < d"],
    ]);
  });
});

describe("formatMutationSummary (scripts/mutation-summary.mjs)", () => {
  it("formats line entries and caps output at 20 survivors per file", () => {
    const lines = Array.from({ length: 25 }, () => "const v = a < b;").join("\n");
    const mutants = Array.from({ length: 25 }, (_, i) => ({
      mutatorName: "ConditionalExpression",
      replacement: "a <= b",
      status: "Survived",
      location: { start: { line: i + 1, column: 11 }, end: { line: i + 1, column: 16 } },
    }));

    const summary = parseMutationReport({
      files: {
        "src/lib/tokens.ts": { source: lines, mutants },
      },
    });

    const output = formatMutationSummary(summary);
    const outputLines = output.split("\n");

    expect(outputLines[0]).toContain("src/lib/tokens.ts: 0.00%");
    expect(outputLines[1]).toBe('  src/lib/tokens.ts:1  ConditionalExpression "a < b" -> "a <= b"');
    expect(outputLines[20]).toBe('  src/lib/tokens.ts:20  ConditionalExpression "a < b" -> "a <= b"');
    expect(outputLines[21]).toBe("  ... and 5 more surviving mutants");
    expect(outputLines).toHaveLength(22);
  });
});
