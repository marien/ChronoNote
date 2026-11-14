// @vitest-environment jsdom
import { deleteLine, moveLineDown, moveLineUp } from "@codemirror/commands";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createTestEditor } from "./testing/testEditor";

// Independent spec-based parser for docs/spec.md section 2.4 ("Numbered Lists").
// Never imports helpers from numberedLists.ts or tokens.ts so assertions remain
// independent of the implementation under test.

interface SpecNumberedItem {
  kind: "numbered";
  lineIndex: number;
  indent: string;
  indentCols: number;
  lead: string;
  numbers: number[];
  delim: "." | ")";
  body: string;
}

interface SpecBulletItem {
  kind: "bullet";
  lineIndex: number;
  indent: string;
  indentCols: number;
  lead: string;
  body: string;
}

interface SpecOtherLine {
  kind: "blank" | "other";
  lineIndex: number;
  indent: string;
  indentCols: number;
  lead: string;
  raw: string;
}

type SpecLine = SpecNumberedItem | SpecBulletItem | SpecOtherLine;

function indentColumns(ws: string): number {
  let cols = 0;
  for (let i = 0; i < ws.length; i++) {
    cols += ws[i] === "\t" ? 2 : 1;
  }
  return cols;
}

function parseSpecLine(line: string, lineIndex: number): SpecLine {
  if (/^[ \t]*$/.test(line)) {
    const ws = line.match(/^[ \t]*/)?.[0] ?? "";
    return {
      kind: "blank",
      lineIndex,
      indent: ws,
      indentCols: indentColumns(ws),
      lead: "",
      raw: line,
    };
  }

  // "- 1. x" is a bullet per docs/spec.md section 2.4 ("a bullet and a numbered item are exclusive per line").
  // Under D4, an optional leading state/topic symbol ("# ", "o ", etc.) precedes either bullet or number.
  const bulletMatch = line.match(/^([ \t]*)([#vx>o.,] )?(?:! )?[-*](?: (.*))?$/);
  if (bulletMatch) {
    return {
      kind: "bullet",
      lineIndex,
      indent: bulletMatch[1],
      indentCols: indentColumns(bulletMatch[1]),
      lead: bulletMatch[2] ?? "",
      body: bulletMatch[3] ?? "",
    };
  }

  const numMatch = line.match(/^([ \t]*)([#vx>o.,] )?(\d+(?:\.\d+)*)([.)]) (.*)$/);
  if (numMatch) {
    const parts = numMatch[3].split(".").map((p) => Number(p));
    if (parts.every((n) => Number.isInteger(n) && n >= 1)) {
      return {
        kind: "numbered",
        lineIndex,
        indent: numMatch[1],
        indentCols: indentColumns(numMatch[1]),
        lead: numMatch[2] ?? "",
        numbers: parts,
        delim: numMatch[4] as "." | ")",
        body: numMatch[5],
      };
    }
  }

  const ws = line.match(/^[ \t]*/)?.[0] ?? "";
  const leadMatch = line.slice(ws.length).match(/^([#vx>o.,] )/);
  const lead = leadMatch ? leadMatch[1] : "";
  return {
    kind: "other",
    lineIndex,
    indent: ws,
    // Non-list lead lines count at their text column (indent + 2) so they don't split lists.
    indentCols: indentColumns(ws) + lead.length,
    lead,
    raw: line,
  };
}

/**
 * Checks docs/spec.md section 2.4 structural invariants on every list block in `doc`:
 *  1. Within each contiguous list block, every sibling group of numbered items
 *     has strictly consecutive numbers (n, n+1, n+2, ...) from its start.
 *  2. Deeper sub-items, continuation lines, and bullets inside a list block never
 *     break sibling numbering for items at shallower or equal indent.
 *  3. Any dotted sub-item's prefix numbers equal its nearest numbered parent's
 *     full numbers array.
 *  4. Every surviving `[TAG=...]` body after the marker matches its expected exact
 *     text byte for byte (no trailing spaces or special chars trimmed/lost), and
 *     every surviving tagged line keeps its exact lead symbol.
 */
function assertSpecInvariants(
  doc: string,
  expectedBodiesByTag?: Map<string, string>,
  expectedLeadsByTag?: Map<string, string>,
): void {
  const rawLines = doc.split("\n");
  const parsed = rawLines.map((line, i) => parseSpecLine(line, i));

  // Verify surviving tagged lines kept their trailing text byte for byte and kept their lead.
  if (expectedBodiesByTag || expectedLeadsByTag) {
    for (const entry of parsed) {
      const textToCheck =
        entry.kind === "numbered"
          ? entry.body
          : entry.kind === "bullet"
            ? entry.body
            : entry.kind === "other"
              ? entry.raw.replace(/^[ \t]+/, "")
              : "";
      const tagMatch = textToCheck.match(/\[T(\d+)\]/);
      if (tagMatch) {
        const tag = `T${tagMatch[1]}`;
        const expected = expectedBodiesByTag?.get(tag);
        if (expected !== undefined && entry.kind === "numbered") {
          expect(entry.body, `Byte-for-byte text mismatch on line ${entry.lineIndex}: ${JSON.stringify(rawLines[entry.lineIndex])}`).toBe(expected);
        }
        const expectedLead = expectedLeadsByTag?.get(tag);
        if (expectedLead !== undefined && entry.kind !== "blank") {
          expect(entry.lead, `Lead mismatch on line ${entry.lineIndex}: ${JSON.stringify(rawLines[entry.lineIndex])}`).toBe(expectedLead);
        }
      }
    }
  }

  // Split document into contiguous non-blank blocks first.
  const blankSplitBlocks: SpecLine[][] = [];
  let cur: SpecLine[] = [];
  for (const item of parsed) {
    if (item.kind === "blank") {
      if (cur.length > 0) {
        blankSplitBlocks.push(cur);
        cur = [];
      }
    } else {
      cur.push(item);
    }
  }
  if (cur.length > 0) blankSplitBlocks.push(cur);

  // Within each blank-separated block, further split on non-list "other" lines
  // sitting at or shallower than the active block minimum list indent.
  function splitProseBlocks(slice: SpecLine[]): SpecLine[][] {
    const listItems = slice.filter((x) => x.kind === "numbered" || x.kind === "bullet");
    if (listItems.length === 0) return [];
    const minIndent = Math.min(...listItems.map((x) => x.indentCols));
    const out: SpecLine[][] = [];
    let part: SpecLine[] = [];
    for (const line of slice) {
      if (line.kind === "other" && line.indentCols <= minIndent) {
        if (part.some((x) => x.kind === "numbered" || x.kind === "bullet")) {
          out.push(part);
        }
        part = [];
      } else {
        part.push(line);
      }
    }
    if (part.some((x) => x.kind === "numbered" || x.kind === "bullet")) {
      out.push(part);
    }
    // Recursively split sub-parts in case removing prose lowered minIndent? Wait:
    // minIndent can only stay the same or increase, wait - if prose was indented > global minIndent
    // but <= local sub-block minIndent, check recursively if any prose splits remain:
    const refined: SpecLine[][] = [];
    for (const block of out) {
      const bMin = Math.min(
        ...block.filter((x) => x.kind === "numbered" || x.kind === "bullet").map((x) => x.indentCols),
      );
      if (block.some((x) => x.kind === "other" && x.indentCols <= bMin)) {
        refined.push(...splitProseBlocks(block));
      } else {
        refined.push(block);
      }
    }
    return refined;
  }

  const blocks = blankSplitBlocks.flatMap(splitProseBlocks);

  for (const block of blocks) {
    // Track active parent chain and sibling groups by indent column.
    // A line at indent C closes all numbered groups/parents strictly deeper than C.
    // Bullets and deeper continuation lines never clear sibling groups at <= bullet.indentCols
    // (spec: "deeper sub-items, continuation lines, and bullets never stop sibling renumbering").
    const groupLastByIndent = new Map<number, SpecNumberedItem>();
    const parentStack: (SpecNumberedItem | SpecBulletItem)[] = [];

    for (const line of block) {
      if (line.kind === "bullet") {
        // Bullets never stop shallower or same-indent numbered sibling groups per spec 2.4;
        // clear only numbered groups strictly deeper than the bullet, and push bullet onto parentStack
        // so items nested under a bullet know their immediate parent is a bullet, not a shallower number.
        for (const ind of [...groupLastByIndent.keys()]) {
          if (ind > line.indentCols) groupLastByIndent.delete(ind);
        }
        while (parentStack.length > 0 && parentStack[parentStack.length - 1].indentCols >= line.indentCols) {
          parentStack.pop();
        }
        parentStack.push(line);
        continue;
      }

      if (line.kind !== "numbered") {
        // Deeper continuation line inside a block: close only strictly deeper groups.
        for (const ind of [...groupLastByIndent.keys()]) {
          if (ind > line.indentCols) groupLastByIndent.delete(ind);
        }
        continue;
      }

      // Numbered item: close any groups strictly deeper than this item's indent.
      for (const ind of [...groupLastByIndent.keys()]) {
        if (ind > line.indentCols) groupLastByIndent.delete(ind);
      }
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].indentCols >= line.indentCols) {
        parentStack.pop();
      }

      const prevSibling = groupLastByIndent.get(line.indentCols);
      const own = line.numbers[line.numbers.length - 1];

      if (prevSibling) {
        const prevOwn = prevSibling.numbers[prevSibling.numbers.length - 1];
        expect(
          own,
          `Non-consecutive sibling at line ${line.lineIndex} (expected ${prevOwn + 1}, got ${own}) in:\n${doc}`,
        ).toBe(prevOwn + 1);
      }

      // Check dotted prefix matches nearest parent when that parent is numbered.
      const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
      if (line.numbers.length > 1 && parent && parent.kind === "numbered") {
        const prefix = line.numbers.slice(0, -1);
        expect(
          prefix,
          `Dotted prefix mismatch on line ${line.lineIndex} in:\n${doc}`,
        ).toEqual(parent.numbers);
      }

      groupLastByIndent.set(line.indentCols, line);
      parentStack.push(line);
    }
  }
}

interface GeneratedDoc {
  doc: string;
  bodiesByTag: Map<string, string>;
  leadsByTag: Map<string, string>;
  lineKinds: ("numbered" | "bullet" | "cont" | "blank")[];
}

const LEAD_ARB = fc.constantFrom("", "# ", "v ", "> ", "x ", "o ", ". ", ", ");

// Generate well-formed multi-level numbered lists with:
// - '.' or ')' delimiters, plain or dotted markers
// - optional leading action/topic symbol ("# ", "v ", "> ", "x ", "o ", ". ", ", ")
// - start number 1, 4, or 8 for top-level lists
// - space or tab top-level / nested indentation
// - optional bullets, lead-only note lines, and continuation lines inside lists
// - optional blank lines splitting two lists
const generatedListDocArb: fc.Arbitrary<GeneratedDoc> = fc
  .record({
    useTabs: fc.boolean(),
    delim: fc.constantFrom<"." | ")">(".", ")"),
    dottedChildren: fc.boolean(),
    topStart: fc.constantFrom(1, 4, 8),
    hasSplitBlank: fc.boolean(),
    secondStart: fc.constantFrom(1, 3),
    blocks: fc.array(
      fc.record({
        topItems: fc.array(
          fc.record({
            lead: LEAD_ARB,
            tail: fc.constantFrom(
              "alpha",
              "beta  ",
              "gamma\t",
              "delta \uD83D\uDE00",
              "cafe\u0301!",
            ),
            hasCont: fc.boolean(),
            hasNonListLead: fc.boolean(),
            hasBulletChild: fc.boolean(),
            bulletLead: LEAD_ARB,
            subCount: fc.integer({ min: 0, max: 3 }),
            subLead: LEAD_ARB,
            hasGrandchild: fc.boolean(),
          }),
          { minLength: 2, maxLength: 5 },
        ),
      }),
      { minLength: 1, maxLength: 2 },
    ),
  })
  .map((cfg) => {
    const lines: string[] = [];
    const lineKinds: ("numbered" | "bullet" | "cont" | "blank")[] = [];
    const bodiesByTag = new Map<string, string>();
    const leadsByTag = new Map<string, string>();
    let tagSeq = 0;

    function nextBody(tail: string, lead: string): string {
      const tag = `T${tagSeq++}`;
      const body = `[${tag}] ${tail}`;
      bodiesByTag.set(tag, body);
      leadsByTag.set(tag, lead);
      return body;
    }

    const baseIndent = cfg.useTabs ? "\t" : "";
    const stepIndent = cfg.useTabs ? "\t" : "  ";

    cfg.blocks.forEach((block, blockIdx) => {
      if (blockIdx > 0) {
        lines.push("");
        lineKinds.push("blank");
      }
      const startN = blockIdx === 0 ? cfg.topStart : cfg.secondStart;
      block.topItems.forEach((item, itemIdx) => {
        const n = startN + itemIdx;
        const marker = `${n}${cfg.delim}`;
        const body = nextBody(item.tail, item.lead);
        lines.push(`${baseIndent}${item.lead}${marker} ${body}`);
        lineKinds.push("numbered");

        if (item.hasCont) {
          lines.push(`${baseIndent}${" ".repeat(item.lead.length + marker.length + 1)}cont ${n}`);
          lineKinds.push("cont");
        }
        if (item.hasNonListLead) {
          lines.push(`${baseIndent}# note ${n}`);
          lineKinds.push("cont");
        }
        if (item.hasBulletChild) {
          lines.push(`${baseIndent}${stepIndent}${item.bulletLead}- bullet ${n}`);
          lineKinds.push("bullet");
        }
        for (let s = 1; s <= item.subCount; s++) {
          const subMarker = cfg.dottedChildren ? `${n}.${s}${cfg.delim}` : `${s}${cfg.delim}`;
          const subBody = nextBody(item.tail, item.subLead);
          lines.push(`${baseIndent}${stepIndent}${item.subLead}${subMarker} ${subBody}`);
          lineKinds.push("numbered");

          if (item.hasGrandchild && s === 1) {
            const gMarker = cfg.dottedChildren ? `${n}.${s}.1${cfg.delim}` : `1${cfg.delim}`;
            const gBody = nextBody(item.tail, item.subLead);
            lines.push(`${baseIndent}${stepIndent}${stepIndent}${item.subLead}${gMarker} ${gBody}`);
            lineKinds.push("numbered");
          }
        }
      });
    });

    return { doc: lines.join("\n"), bodiesByTag, leadsByTag, lineKinds };
  });

function lineStartOffset(lines: string[], lineIdx: number): number {
  let offset = 0;
  for (let i = 0; i < lineIdx; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}

describe("Numbered list properties (docs/spec.md §2.4)", () => {
  it("keeps numbering consecutive, dotted prefixes matched, and text intact on Tab / Shift-Tab / Enter / Backspace / deleteLine / moveLine", () => {
    fc.assert(
      fc.property(
        generatedListDocArb,
        fc.constantFrom<
          "Tab" | "Shift-Tab" | "EnterEnd" | "EnterMid" | "BackspaceAtStart" | "DeleteLine" | "MoveUp" | "MoveDown"
        >("Tab", "Shift-Tab", "EnterEnd", "EnterMid", "BackspaceAtStart", "DeleteLine", "MoveUp", "MoveDown"),
        fc.nat(100),
        (gen, op, targetPick) => {
          const lines = gen.doc.split("\n");
          const numberedIndices = gen.lineKinds
            .map((k, idx) => (k === "numbered" ? idx : -1))
            .filter((idx) => idx >= 0);
          fc.pre(numberedIndices.length >= 2);

          const lineIdx = numberedIndices[targetPick % numberedIndices.length];
          const lineText = lines[lineIdx];
          const lineStart = lineStartOffset(lines, lineIdx);
          const markerMatch = lineText.match(/^[ \t]*(?:[#vx>o.,] )?\d+(?:\.\d+)*[.)] /);
          const markerEnd = lineStart + (markerMatch ? markerMatch[0].length : 0);

          // Place caret depending on operation:
          // - EnterEnd at end of line to insert next sibling
          // - EnterMid in the middle of the body text to split after marker
          // - BackspaceAtStart right at the start of body text after the marker space
          // - Other ops inside the text body
          let pos = markerEnd + 1;
          if (op === "EnterEnd") {
            pos = lineStart + lineText.length;
          } else if (op === "EnterMid") {
            pos = Math.min(lineStart + lineText.length, markerEnd + 4);
          } else if (op === "BackspaceAtStart") {
            pos = markerEnd;
          }

          const ed = createTestEditor({ doc: gen.doc, anchor: pos });
          try {
            const before = ed.text();
            if (op === "Tab") {
              ed.press("Tab");
            } else if (op === "Shift-Tab") {
              ed.press("Shift-Tab");
            } else if (op === "EnterEnd" || op === "EnterMid") {
              ed.press("Enter");
            } else if (op === "BackspaceAtStart") {
              ed.press("Backspace");
            } else if (op === "DeleteLine") {
              deleteLine(ed.view);
            } else if (op === "MoveUp") {
              moveLineUp(ed.view);
            } else if (op === "MoveDown") {
              moveLineDown(ed.view);
            }

            const after = ed.text();
            // For EnterMid, the split line's `[TAG]` body was intentionally split across two lines,
            // so pass expectedBodiesByTag only for operations that do not split a line's body.
            assertSpecInvariants(after, op === "EnterMid" ? undefined : gen.bodiesByTag, gen.leadsByTag);

            if (after !== before) {
              expect(ed.undo()).toBe(true);
              expect(ed.text()).toBe(before);
            }
          } finally {
            ed.destroy();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("regression: Shift-Tab on a non-first item of a parentless indented group outdents and renumbers the following outer list", () => {
    // Counterexample shrunk from property test:
    // After Tab on lines 0..1 of "1. [T0]\n2. [T1]\n3. [T2]", doc is:
    //   1. [T0] alpha
    //   2. [T1] alpha
    // 1. [T2] alpha
    // Pressing Shift-Tab on line 1 ("  2. [T1] alpha") outdents it to indent 0 and must
    // renumber it and line 2 consecutively instead of leaving "2. [T1] alpha\n1. [T2] alpha".
    const doc = "1. [T0] alpha\n2. [T1] alpha\n3. [T2] alpha";
    const lines = doc.split("\n");
    const ed = createTestEditor({
      doc,
      anchor: "1. ".length,
      head: lines[0].length + 1 + lines[1].length,
    });
    try {
      ed.press("Tab");
      expect(ed.text()).toBe("  1. [T0] alpha\n  2. [T1] alpha\n1. [T2] alpha");

      const midLines = ed.text().split("\n");
      ed.select(midLines[0].length + 1 + midLines[1].length);
      ed.press("Shift-Tab");
      expect(ed.text()).toBe("  1. [T0] alpha\n1. [T1] alpha\n2. [T2] alpha");
      assertSpecInvariants(ed.text());
    } finally {
      ed.destroy();
    }
  });

  it("handles two-step operation sequences (including selection Tab/Shift-Tab and same-indent bullets)", () => {
    fc.assert(
      fc.property(
        generatedListDocArb,
        fc.nat(100),
        fc.nat(100),
        fc.boolean(),
        fc.constantFrom<"Tab" | "Shift-Tab" | "DeleteLine" | "MoveUp" | "MoveDown">(
          "Tab",
          "Shift-Tab",
          "DeleteLine",
          "MoveUp",
          "MoveDown",
        ),
        (gen, pickA, pickB, insertSameIndentBullet, secondOp) => {
          let lines = gen.doc.split("\n");
          if (insertSameIndentBullet && lines.length >= 2) {
            // Insert a same-indent bullet right after line 0 to verify it does not stop sibling numbering.
            const firstMatch = lines[0].match(/^([ \t]*)/);
            const indent = firstMatch ? firstMatch[1] : "";
            lines = [lines[0], `${indent}- peer bullet`, ...lines.slice(1)];
          }
          const doc = lines.join("\n");
          const numberedIndices = lines
            .map((l, idx) => (parseSpecLine(l, idx).kind === "numbered" ? idx : -1))
            .filter((idx) => idx >= 0);
          fc.pre(numberedIndices.length >= 2);

          const i1 = numberedIndices[pickA % numberedIndices.length];
          const i2 = numberedIndices[pickB % numberedIndices.length];
          const lo = Math.min(i1, i2);
          const hi = Math.max(i1, i2);
          const loMatch = lines[lo].match(/^[ \t]*(?:[#vx>o.,] )?\d+(?:\.\d+)*[.)] /);
          const selFrom = lineStartOffset(lines, lo) + (loMatch ? loMatch[0].length : 0);
          const selTo = lineStartOffset(lines, hi) + lines[hi].length;

          const ed = createTestEditor({ doc, anchor: selFrom, head: selTo });
          try {
            // Multi-line selection Tab or Shift-Tab, then a second single-caret structural op.
            ed.press(lo === hi ? "Shift-Tab" : "Tab");
            assertSpecInvariants(ed.text(), gen.bodiesByTag, gen.leadsByTag);

            const curLines = ed.text().split("\n");
            const curNum = curLines
              .map((l, idx) => (parseSpecLine(l, idx).kind === "numbered" ? idx : -1))
              .filter((idx) => idx >= 0);
            if (curNum.length >= 1) {
              const target = curNum[pickB % curNum.length];
              const p = lineStartOffset(curLines, target) + curLines[target].length;
              ed.select(p);
              if (secondOp === "Tab") ed.press("Tab");
              else if (secondOp === "Shift-Tab") ed.press("Shift-Tab");
              else if (secondOp === "DeleteLine") deleteLine(ed.view);
              else if (secondOp === "MoveUp") moveLineUp(ed.view);
              else moveLineDown(ed.view);

              assertSpecInvariants(ed.text(), gen.bodiesByTag, gen.leadsByTag);
            }
          } finally {
            ed.destroy();
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
