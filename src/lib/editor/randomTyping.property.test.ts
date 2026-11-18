// @vitest-environment jsdom
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { renumberLists } from "../numberedLists";
import { createTestEditor, type TestEditor } from "../testing/testEditor";

const SINGLE_LINES = [
  "# task",
  "v done",
  "> later",
  "x dropped",
  "o topic",
  ". talked",
  "- bullet",
  "  - sub bullet",
  "* star",
  "1. one",
  "2. two",
  "  1. sub one",
  "1.1. dotted",
  "2) paren",
  "# 1. numbered action",
  "=> @Dana",
  "=> # follow",
  "! - urgent",
  "# (budget) topic action",
  "Plain prose",
  "  continuation",
  "",
] as const;

const TWO_LINE_TITLE = "Board meeting\n=============";
const POOL: readonly string[] = [...SINGLE_LINES, TWO_LINE_TITLE];

const TYPE_CHARS = ["a", " ", "#", "v", "x", "o", ">", ".", "-", "1", "(", ")", "@", ":"] as const;

const PRESS_KEYS = [
  "Enter",
  "Shift-Enter",
  "Tab",
  "Shift-Tab",
  "Backspace",
  "Delete",
  "Mod-1",
  "Mod-2",
  "Mod-3",
  "Mod-4",
  "Mod-5",
  "Mod-6",
  "Mod-7",
  "Mod-Shift-o",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;

type RandomAction =
  | { kind: "type"; ch: string }
  | { kind: "press"; key: string }
  | { kind: "paste"; text: string }
  | { kind: "select"; anchorSeed: number; headSeed: number };

function pickLines(indices: number[], maxLines: number): string {
  const out: string[] = [];
  for (const idx of indices) {
    const entry = POOL[idx % POOL.length];
    const entryLines = entry.split("\n");
    if (out.length + entryLines.length <= maxLines) {
      out.push(...entryLines);
    } else if (out.length === 0) {
      out.push(SINGLE_LINES[idx % SINGLE_LINES.length]);
    }
    if (out.length >= maxLines) break;
  }
  return out.join("\n");
}

function applyAction(ed: TestEditor, action: RandomAction): void {
  if (action.kind === "type") {
    ed.type(action.ch);
  } else if (action.kind === "press") {
    ed.press(action.key);
  } else if (action.kind === "paste") {
    ed.paste(action.text);
  } else {
    const len = ed.text().length;
    const anchor = action.anchorSeed % (len + 1);
    const head = action.headSeed % (len + 1);
    ed.select(anchor, head);
  }
}

function checkAfterAction(ed: TestEditor): void {
  const text = ed.text();
  const { from, to } = ed.view.state.selection.main;
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThanOrEqual(from);
  expect(to).toBeLessThanOrEqual(text.length);
  expect(text).not.toContain("\r");
}

function checkAfterSequence(ed: TestEditor, startDoc: string): void {
  let undoSteps = 0;
  while (ed.undo()) {
    undoSteps++;
    if (undoSteps > 2000) {
      throw new Error("undo() did not terminate");
    }
  }
  expect(ed.text()).toBe(startDoc);
}

function checkRenumberStability(finalDoc: string): void {
  const lines = finalDoc.split("\n");
  const allIndices = lines.map((_, i) => i);
  const edits1 = renumberLists(lines, allIndices);
  const after1 = [...lines];
  for (const edit of edits1) {
    after1[edit.line] = edit.text;
  }
  const edits2 = renumberLists(after1, after1.map((_, i) => i));
  expect(edits2).toEqual([]);
}

const poolIndexArb = fc.integer({ min: 0, max: POOL.length - 1 });

const startDocArb = fc
  .array(poolIndexArb, { minLength: 1, maxLength: 8 })
  .map((indices) => pickLines(indices, 8));

const pasteTextArb = fc
  .array(poolIndexArb, { minLength: 1, maxLength: 3 })
  .map((indices) => pickLines(indices, 3));

const actionArb: fc.Arbitrary<RandomAction> = fc.oneof(
  fc.constantFrom(...TYPE_CHARS).map((ch) => ({ kind: "type" as const, ch })),
  fc.constantFrom(...PRESS_KEYS).map((key) => ({ kind: "press" as const, key })),
  pasteTextArb.map((text) => ({ kind: "paste" as const, text })),
  fc
    .tuple(fc.nat(10_000), fc.nat(10_000))
    .map(([anchorSeed, headSeed]) => ({ kind: "select" as const, anchorSeed, headSeed })),
);

describe("Random typing against the real editor", { timeout: 60_000 }, () => {
  it("preserves selection bounds, LF-only text, full undo, and renumber stability across random sequences", () => {
    fc.assert(
      fc.property(
        startDocArb,
        fc.nat(10_000),
        fc.array(actionArb, { minLength: 1, maxLength: 25 }),
        (startDoc, startCaretSeed, actions) => {
          const startAnchor = startCaretSeed % (startDoc.length + 1);
          const ed = createTestEditor({ doc: startDoc, anchor: startAnchor });
          try {
            for (const action of actions) {
              applyAction(ed, action);
              checkAfterAction(ed);
            }
            const finalDoc = ed.text();
            checkAfterSequence(ed, startDoc);
            checkRenumberStability(finalDoc);
          } finally {
            ed.destroy();
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
