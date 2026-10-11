import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseNumberedItem, renumberAfterInsert, type NumberedItem } from "./tokens";

const numberedItemArb = fc
  .record({
    indent: fc.constantFrom("", "  ", "    ", "\t"),
    number: fc.integer({ min: 1, max: 99 }),
    delimiter: fc.constantFrom("." as const, ")" as const),
    text: fc.string({ unit: fc.constantFrom("a", "b", "c", " ", "item"), minLength: 0, maxLength: 15 }),
  })
  .map(({ indent, number, delimiter, text }) => {
    const raw = `${indent}${number}${delimiter} ${text}`;
    return parseNumberedItem(raw)!;
  });

const arbitraryLineArb = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.constant("not a list item"),
  fc.constant("# open action"),
  fc.constant("v done action"),
  fc.constant("- bullet item"),
  fc.constant("=== section"),
  fc.string({ minLength: 1, maxLength: 20 }),
  fc
    .record({
      indent: fc.constantFrom("", "  ", "    "),
      number: fc.integer({ min: 1, max: 50 }),
      delimiter: fc.constantFrom(".", ")"),
      text: fc.string({ unit: fc.constantFrom("a", "b", "c", " "), minLength: 0, maxLength: 10 }),
    })
    .map(({ indent, number, delimiter, text }) => `${indent}${number}${delimiter} ${text}`),
);

describe("renumberAfterInsert properties (fast-check)", () => {
  it("never changes a line that is not a numbered list item (100 runs)", () => {
    fc.assert(
      fc.property(fc.array(arbitraryLineArb, { minLength: 0, maxLength: 25 }), numberedItemArb, (following, item) => {
        const rewrites = renumberAfterInsert(following, item);

        for (const { index, text } of rewrites) {
          // The line being rewritten must strictly be a numbered list item
          const original = following[index];
          const oldParsed = parseNumberedItem(original);
          expect(oldParsed).not.toBeNull();

          // The resulting rewritten line must also be a valid numbered list item
          const newParsed = parseNumberedItem(text);
          expect(newParsed).not.toBeNull();

          // Indent, delimiter, and line content after marker are preserved
          expect(newParsed!.indent).toBe(oldParsed!.indent);
          expect(newParsed!.delimiter).toBe(oldParsed!.delimiter);
          expect(text.slice(newParsed!.markerEnd)).toBe(original.slice(oldParsed!.markerEnd));
        }

        // Rewrites are in strictly increasing index order within bounds
        for (let i = 0; i < rewrites.length; i++) {
          expect(rewrites[i].index).toBeGreaterThanOrEqual(0);
          expect(rewrites[i].index).toBeLessThan(following.length);
          if (i > 0) {
            expect(rewrites[i].index).toBeGreaterThan(rewrites[i - 1].index);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("bumps contiguous colliding siblings by one and leaves non-colliding items untouched (100 runs)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // start number for inserted item
        fc.integer({ min: 1, max: 8 }), // number of colliding consecutive following items
        fc.constantFrom("." as const, ")" as const),
        fc.constantFrom("", "  "),
        (startNum, chainLen, delimiter, indent) => {
          const item = parseNumberedItem(`${indent}${startNum}${delimiter} inserted`)!;

          // Colliding chain starts at startNum + 1 (which would collide with the new item's next number)
          const collidingLines: string[] = [];
          for (let k = 1; k <= chainLen; k++) {
            collidingLines.push(`${indent}${startNum + k}${delimiter} item ${k}`);
          }

          // Append a non-colliding item (creates a gap)
          const nonCollidingNum = startNum + chainLen + 5;
          const trailingLine = `${indent}${nonCollidingNum}${delimiter} after gap`;
          const following = [...collidingLines, trailingLine];

          const rewrites = renumberAfterInsert(following, item);

          // All colliding items should be bumped by 1
          expect(rewrites.length).toBe(chainLen);
          for (let k = 0; k < chainLen; k++) {
            expect(rewrites[k].index).toBe(k);
            const expectedNumber = startNum + k + 1 + 1; // old number bumped by 1
            const parsed = parseNumberedItem(rewrites[k].text);
            expect(parsed?.numbers).toEqual([expectedNumber]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("stops walk at blank lines and shallower indentations (100 runs)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.constantFrom("." as const, ")" as const),
        (startNum, delimiter) => {
          const indent = "  ";
          const item = parseNumberedItem(`${indent}${startNum}${delimiter} inserted`)!;

          // Colliding item, followed by a stop condition, followed by another would-be colliding item
          const followingWithBlank = [
            `${indent}${startNum + 1}${delimiter} item 1`,
            "",
            `${indent}${startNum + 2}${delimiter} item 2 after blank`,
          ];
          const rewritesBlank = renumberAfterInsert(followingWithBlank, item);
          expect(rewritesBlank.length).toBe(1);
          expect(rewritesBlank[0].index).toBe(0);

          const followingWithShallower = [
            `${indent}${startNum + 1}${delimiter} item 1`,
            `1${delimiter} shallower item`,
            `${indent}${startNum + 2}${delimiter} item 2`,
          ];
          const rewritesShallower = renumberAfterInsert(followingWithShallower, item);
          expect(rewritesShallower.length).toBe(1);
          expect(rewritesShallower[0].index).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
