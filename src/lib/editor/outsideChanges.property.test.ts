// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { ChangeSet, EditorSelection, Transaction } from "@codemirror/state";
import { editorChanges } from "./editorChanges";
import { createTestEditor, type TestEditor } from "../testing/testEditor";

const editors: TestEditor[] = [];

function openTestEditor(doc: string, anchor: number): TestEditor {
  const ed = createTestEditor({ doc, anchor });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isHighSurrogate(c)) {
      if (i + 1 >= s.length || !isLowSurrogate(s.charCodeAt(i + 1))) return true;
      i++;
    } else if (isLowSurrogate(c)) {
      return true;
    }
  }
  return false;
}

function isInsideSurrogatePair(s: string, idx: number): boolean {
  return idx > 0 && idx < s.length && isHighSurrogate(s.charCodeAt(idx - 1)) && isLowSurrogate(s.charCodeAt(idx));
}

function validBoundaries(s: string): number[] {
  const out: number[] = [0];
  for (let i = 1; i <= s.length; i++) {
    if (!isInsideSurrogatePair(s, i)) out.push(i);
  }
  return out;
}

/** Applies `newText` through the exact minimal-diff outside path used by EditorPane.setContent(text, { outside: true }). */
function applyOutsideContent(ed: TestEditor, newText: string): void {
  const changes = editorChanges(ed.text(), newText);
  if (changes.length) {
    ed.view.dispatch({
      changes,
      annotations: Transaction.addToHistory.of(false),
    });
  }
}

const tokenPieceArb = fc.constantFrom(
  "alpha",
  "beta",
  "# task",
  "- item",
  "=> @dana",
  " ",
  "\t",
  "\uD83D\uDE00", // grinning face
  "\uD83D\uDE03", // smiling face (same high surrogate)
  "\uD83D\uDCC5", // calendar
  "\uD83D\uDCC6", // tear-off calendar (same high surrogate)
  "\uD83E\uDCC5", // another pair sharing low surrogate \uDCC5
  "\uD83E\uDD14", // thinking face
  "e\u0301",
);

const lineArb = fc
  .array(tokenPieceArb, { minLength: 0, maxLength: 5 })
  .map((parts) => parts.join(""));

const docArb = fc
  .array(lineArb, { minLength: 1, maxLength: 10 })
  .map((lines) => lines.join("\n"));

type OutsideEditOp =
  | { kind: "insertChars"; posSeed: number; text: string }
  | { kind: "deleteChars"; aSeed: number; bSeed: number }
  | { kind: "replaceChars"; aSeed: number; bSeed: number; text: string }
  | { kind: "insertLines"; lineSeed: number; lines: string[] }
  | { kind: "deleteLines"; aSeed: number; bSeed: number }
  | { kind: "replaceLines"; aSeed: number; bSeed: number; lines: string[] };

const editOpArb: fc.Arbitrary<OutsideEditOp> = fc.oneof(
  fc.record({
    kind: fc.constant("insertChars" as const),
    posSeed: fc.nat(),
    text: fc.array(tokenPieceArb, { minLength: 1, maxLength: 3 }).map((p) => p.join("")),
  }),
  fc.record({
    kind: fc.constant("deleteChars" as const),
    aSeed: fc.nat(),
    bSeed: fc.nat(),
  }),
  fc.record({
    kind: fc.constant("replaceChars" as const),
    aSeed: fc.nat(),
    bSeed: fc.nat(),
    text: fc.array(tokenPieceArb, { minLength: 0, maxLength: 3 }).map((p) => p.join("")),
  }),
  fc.record({
    kind: fc.constant("insertLines" as const),
    lineSeed: fc.nat(),
    lines: fc.array(lineArb, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant("deleteLines" as const),
    aSeed: fc.nat(),
    bSeed: fc.nat(),
  }),
  fc.record({
    kind: fc.constant("replaceLines" as const),
    aSeed: fc.nat(),
    bSeed: fc.nat(),
    lines: fc.array(lineArb, { minLength: 1, maxLength: 3 }),
  }),
);

function applyEditOp(doc: string, op: OutsideEditOp): string {
  const bounds = validBoundaries(doc);
  switch (op.kind) {
    case "insertChars": {
      const pos = bounds[op.posSeed % bounds.length];
      return doc.slice(0, pos) + op.text + doc.slice(pos);
    }
    case "deleteChars": {
      const i1 = op.aSeed % bounds.length;
      const i2 = op.bSeed % bounds.length;
      const from = bounds[Math.min(i1, i2)];
      const to = bounds[Math.max(i1, i2)];
      return doc.slice(0, from) + doc.slice(to);
    }
    case "replaceChars": {
      const i1 = op.aSeed % bounds.length;
      const i2 = op.bSeed % bounds.length;
      const from = bounds[Math.min(i1, i2)];
      const to = bounds[Math.max(i1, i2)];
      return doc.slice(0, from) + op.text + doc.slice(to);
    }
    case "insertLines": {
      const lines = doc.split("\n");
      const idx = op.lineSeed % (lines.length + 1);
      lines.splice(idx, 0, ...op.lines);
      return lines.join("\n");
    }
    case "deleteLines": {
      const lines = doc.split("\n");
      const a = op.aSeed % lines.length;
      const b = op.bSeed % lines.length;
      const start = Math.min(a, b);
      const count = Math.max(a, b) - start + 1;
      lines.splice(start, count);
      return lines.join("\n");
    }
    case "replaceLines": {
      const lines = doc.split("\n");
      const a = op.aSeed % lines.length;
      const b = op.bSeed % lines.length;
      const start = Math.min(a, b);
      const count = Math.max(a, b) - start + 1;
      lines.splice(start, count, ...op.lines);
      return lines.join("\n");
    }
  }
}

describe("outside changes properties (fast-check)", () => {
  it("produces valid non-splitting changes, exact new text, valid mapped caret, and Ctrl+Z never undoes it (250 runs)", () => {
    fc.assert(
      fc.property(
        docArb,
        fc.nat(),
        fc.array(editOpArb, { minLength: 1, maxLength: 3 }),
        (oldDoc, caretSeed, ops) => {
          const newDoc = ops.reduce(applyEditOp, oldDoc);
          const bounds = validBoundaries(oldDoc);
          const caret = bounds[caretSeed % bounds.length];

          const changes = editorChanges(oldDoc, newDoc);
          let prevTo = 0;
          for (const c of changes) {
            expect(c.from).toBeGreaterThanOrEqual(prevTo);
            expect(c.to).toBeGreaterThanOrEqual(c.from);
            expect(c.to).toBeLessThanOrEqual(oldDoc.length);
            expect(isInsideSurrogatePair(oldDoc, c.from)).toBe(false);
            expect(isInsideSurrogatePair(oldDoc, c.to)).toBe(false);
            expect(hasLoneSurrogate(c.insert)).toBe(false);
            prevTo = c.to;
          }

          const ed = openTestEditor(oldDoc, caret);
          applyOutsideContent(ed, newDoc);

          expect(ed.text()).toBe(newDoc);
          expect(hasLoneSurrogate(ed.text())).toBe(false);

          const mappedCaret = ed.view.state.selection.main.head;
          expect(isInsideSurrogatePair(ed.text(), mappedCaret)).toBe(false);

          const expectedMapped = EditorSelection.single(caret)
            .map(ChangeSet.of(changes, oldDoc.length))
            .main.head;
          expect(mappedCaret).toBe(expectedMapped);

          // Ctrl+Z / Mod-z must not undo the outside edit
          ed.press("Mod-z");
          expect(ed.text()).toBe(newDoc);
          expect(ed.undo()).toBe(false);
          expect(ed.text()).toBe(newDoc);

          ed.destroy();
          editors.pop();
        },
      ),
      { numRuns: 250 },
    );
  });

  it("keeps the caret on the exact same text when edits occur on other lines or on one side of the target (200 runs)", () => {
    const targetWord = "ANCHOR\uD83D\uDCC5WORD";
    fc.assert(
      fc.property(
        fc.array(lineArb, { minLength: 1, maxLength: 4 }),
        fc.array(lineArb, { minLength: 1, maxLength: 4 }),
        lineArb,
        lineArb,
        fc.integer({ min: 1, max: targetWord.length - 1 }).filter((n) => !isInsideSurrogatePair(targetWord, n)),
        fc.array(editOpArb, { minLength: 1, maxLength: 2 }),
        fc.array(editOpArb, { minLength: 1, maxLength: 2 }),
        fc.boolean(),
        lineArb,
        (aboveLines, belowLines, sameBefore, sameAfter, offsetInWord, aboveOps, belowOps, editAnchorLeft, replacementSide) => {
          // Guard lines immediately above and below the anchor line stay unchanged so line-level LCS anchors the target line
          // even when one side of the target word also changes.
          const anchorLine = `${sameBefore} ${targetWord} ${sameAfter}`;
          const oldLines = [...aboveLines, "GUARD_ABOVE", anchorLine, "GUARD_BELOW", ...belowLines];
          const oldDoc = oldLines.join("\n");
          const wordStart = oldDoc.indexOf(targetWord);
          const caret = wordStart + offsetInWord;

          const editedAbove = aboveOps.reduce(applyEditOp, aboveLines.join("\n")).split("\n");
          const editedBelow = belowOps.reduce(applyEditOp, belowLines.join("\n")).split("\n");
          const editedAnchorLine = editAnchorLeft
            ? `${replacementSide} ${targetWord} ${sameAfter}`
            : `${sameBefore} ${targetWord} ${replacementSide}`;
          const newDoc = [...editedAbove, "GUARD_ABOVE", editedAnchorLine, "GUARD_BELOW", ...editedBelow].join("\n");

          const ed = openTestEditor(oldDoc, caret);
          applyOutsideContent(ed, newDoc);

          expect(ed.text()).toBe(newDoc);
          expect(hasLoneSurrogate(ed.text())).toBe(false);

          const newCaret = ed.view.state.selection.main.head;
          expect(isInsideSurrogatePair(ed.text(), newCaret)).toBe(false);
          const sliceStart = newCaret - offsetInWord;
          expect(ed.text().slice(sliceStart, sliceStart + targetWord.length)).toBe(targetWord);

          ed.destroy();
          editors.pop();
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Ctrl+Z undoes an earlier user edit while keeping a subsequent outside edit (150 runs)", () => {
    fc.assert(
      fc.property(
        fc.array(lineArb, { minLength: 2, maxLength: 6 }),
        fc.constantFrom("X", "hello", "\uD83D\uDE00"),
        fc.array(editOpArb, { minLength: 1, maxLength: 2 }),
        (lines, typed, tailOps) => {
          const tailLine = "TAIL_MARKER";
          const initialLines = [lines[0], ...lines.slice(1), tailLine];
          const initialDoc = initialLines.join("\n");

          const ed = openTestEditor(initialDoc, 0);
          ed.type(typed);
          const afterUserDoc = ed.text();
          expect(afterUserDoc.startsWith(typed)).toBe(true);

          // Apply an outside edit below line 0 so it is disjoint from the user's edit on line 0
          const userLines = afterUserDoc.split("\n");
          const tailOld = userLines.slice(1).join("\n");
          const tailNew = tailOps.reduce(applyEditOp, tailOld);
          const afterOutsideDoc = `${userLines[0]}\n${tailNew}`;

          applyOutsideContent(ed, afterOutsideDoc);
          expect(ed.text()).toBe(afterOutsideDoc);

          // Ctrl+Z undoes only the user's edit on line 0, keeping the outside edit on the tail
          const undone = ed.press("Mod-z");
          expect(undone).toBe(true);
          expect(ed.text()).toBe(`${initialLines[0]}\n${tailNew}`);

          ed.destroy();
          editors.pop();
        },
      ),
      { numRuns: 150 },
    );
  });
});
