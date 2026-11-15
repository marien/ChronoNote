import { describe, it, expect } from "vitest";
// @ts-expect-error node:buffer has no type definitions in browser tsconfig
import { Buffer } from "node:buffer";
import { headingsIn, newHeadings } from "../../scripts/changelog-headings.mjs";

type SplitPart = { filename: string; content: Buffer };
type SplitResult = {
  parts: SplitPart[];
  entries: Array<{ num: number; title: string; start: number; end: number }>;
  irregularities: string[];
};

const splitModulePath = "../../scripts/changelog-split.mjs";
const indexModulePath = "../../scripts/changelog-index.mjs";
const { splitChangelog } = (await import(/* @vite-ignore */ splitModulePath)) as {
  splitChangelog: (buf: Buffer) => SplitResult;
};
const { buildChangelogIndex } = (await import(/* @vite-ignore */ indexModulePath)) as {
  buildChangelogIndex: (parts: Array<{ filename: string; content: string | Buffer }>) => string;
};

const SAMPLE_LINES = [
  "# ChronoNote — Changelog",
  "",
  "Intro paragraph.",
  "",
  "---",
  "",
  "## 1. First change",
  "",
  "**Status: released in v0.1.0.**",
  "",
  "Reason for first change.",
  "",
  "## 2. Second change with `inline code`",
  "",
  "**Status: released in v0.1.0.**",
  "",
  "## Implementation notes: sections 1–2",
  "",
  "Extra notes that stay inside section 2.",
  "",
  "## 3. Third change",
  "",
  "**Status: released in v0.2.0.**",
  "",
  "## 4. Fourth change",
  "",
  "**Status: on main, not released yet.**",
  "",
  "## 5. Fifth change",
  "",
  "**Status: on main, not released yet.**",
  "",
];

function makeChangelog(eol: "\n" | "\r\n", lines = SAMPLE_LINES): Buffer {
  return Buffer.from(lines.join(eol), "utf8");
}

describe("changelog split and index scripts", () => {
  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"],
  ] as const)("splits and indexes %s input byte-for-byte without splitting un-numbered headings", (_name, eol) => {
    const input = makeChangelog(eol);
    const { parts, entries, irregularities } = splitChangelog(input);

    expect(irregularities).toEqual([]);
    expect(entries.map((e: { num: number }) => e.num)).toEqual([1, 2, 3, 4, 5]);
    expect(parts.map((p: { filename: string }) => p.filename)).toEqual([
      "0000-introduction.md",
      "0001-0100.md",
    ]);

    const rebuilt = Buffer.concat(parts.map((p: { content: Buffer }) => p.content));
    expect(Buffer.compare(rebuilt, input)).toBe(0);

    // The un-numbered heading remains inside entry 2 (in 0001-0100.md), not split off or indexed.
    const partText = parts[1].content.toString("utf8");
    expect(partText).toContain("## Implementation notes: sections 1–2");

    const indexText = buildChangelogIndex(parts);
    const expectedEolCheck = eol === "\r\n" ? indexText.includes("\r\n") : !indexText.includes("\r\n");
    expect(expectedEolCheck).toBe(true);
    expect(indexText).toContain("- [Introduction and early history](changelog/0000-introduction.md)");
    expect(indexText).toContain("## 1-100 · [changelog/0001-0100.md](changelog/0001-0100.md)");

    const expectedEntries = [
      "- §1 First change",
      "- §2 Second change with `inline code`",
      "- §3 Third change",
      "- §4 Fourth change",
      "- §5 Fifth change",
    ];
    for (const line of expectedEntries) {
      const matches = indexText.split(eol).filter((l: string) => l === line);
      expect(matches).toHaveLength(1);
    }
    expect(indexText).not.toContain("Implementation notes");
  });

  it("reports a gap in entry numbers while preserving exact bytes", () => {
    const linesWithGap = SAMPLE_LINES.map((l) =>
      l.replace("## 3. Third change", "## 4. Third change")
        .replace("## 4. Fourth change", "## 5. Fourth change")
        .replace("## 5. Fifth change", "## 6. Fifth change"),
    );
    const input = makeChangelog("\n", linesWithGap);
    const { parts, irregularities } = splitChangelog(input);

    expect(irregularities).toEqual(["gap between 2 and 4"]);
    expect(Buffer.compare(Buffer.concat(parts.map((p: { content: Buffer }) => p.content)), input)).toBe(0);
  });

  it("reports non-rising and duplicate entry numbers", () => {
    const lines = [
      "# Intro",
      "",
      "## 1. One",
      "",
      "## 3. Three",
      "",
      "## 2. Two",
      "",
      "## 2. Duplicate two",
      "",
    ];
    const input = makeChangelog("\n", lines);
    const { irregularities } = splitChangelog(input);

    expect(irregularities).toEqual([
      "gap between 1 and 3",
      "entry 2 follows 3 (not in rising order)",
      "duplicate entry number 2",
      "entry 2 follows 2 (not in rising order)",
    ]);
  });
});

describe("changelog-status: entries new since the previous release", () => {
  const oldSingleFile = "# Changelog\r\n\r\n## 1. One\r\n\r\n**Status: released in v0.1.0.**\r\n\r\n## 2. Two\r\n";

  it("treats entries that only moved into docs/changelog/ as old, and only a later heading as new", () => {
    const now = ["## 1. One\n\nmoved\n", "## 2. Two\n\n## 3. Three\n"];
    expect([...newHeadings(now, [oldSingleFile])]).toEqual(["## 3. Three"]);
  });

  it("compares against the docs/changelog/ files of an earlier split release too", () => {
    const index = "# Changelog\n\n## 1-100 · [changelog/0001-0100.md](changelog/0001-0100.md)\n\n- §1 One\n";
    const before = [index, "## 1. One\n\n## 2. Two\n"];
    expect([...newHeadings(["## 1. One\n\n## 2. Two\n\n## 4. Four\n"], before)]).toEqual(["## 4. Four"]);
  });

  it("finds nothing new when nothing was added, and ignores the index's range headings", () => {
    expect(newHeadings(["## 1. One\n## 2. Two\n"], [oldSingleFile]).size).toBe(0);
    expect(headingsIn("## 1-100 · [x](y)\n## 7. Seven \n")).toEqual(["## 7. Seven"]);
  });
});
