import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { merge3 } from "./lineMerge";

const realisticLineArb = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.constant("===\n"),
  fc.constant("-----\n"),
  fc
    .record({
      indent: fc.constantFrom("", "  ", "    "),
      prefix: fc.constantFrom("# ", "v ", "> ", "x ", "o ", ". ", ", ", "- ", "* ", "1. ", "2) ", "=> "),
      text: fc.string({
        unit: fc.constantFrom("a", "b", "c", " ", "d", "e", "f"),
        minLength: 1,
        maxLength: 25,
      }),
    })
    .map(({ indent, prefix, text }) => `${indent}${prefix}${text}`),
  fc.string({ unit: fc.constantFrom("x", "y", "z", " "), minLength: 1, maxLength: 25 }),
);

// Formats an array of raw line contents into a standard newline-terminated note text (or empty string).
const noteTextArb = fc
  .array(realisticLineArb, { minLength: 0, maxLength: 20 })
  .map((lines) => (lines.length === 0 ? "" : lines.map((l) => (l.endsWith("\n") ? l : `${l}\n`)).join("")));

describe("merge3 properties (fast-check)", () => {
  it("merge3(a, a, b) gives b without conflict (100 runs)", () => {
    fc.assert(
      fc.property(noteTextArb, noteTextArb, (a, b) => {
        const result = merge3(a, a, b);
        expect(result).toEqual({ type: "clean", content: b });
      }),
      { numRuns: 100 },
    );
  });

  it("merge3(a, b, a) gives b without conflict (100 runs)", () => {
    fc.assert(
      fc.property(noteTextArb, noteTextArb, (a, b) => {
        const result = merge3(a, b, a);
        expect(result).toEqual({ type: "clean", content: b });
      }),
      { numRuns: 100 },
    );
  });

  it("merge3(a, b, b) gives b without conflict (100 runs)", () => {
    fc.assert(
      fc.property(noteTextArb, noteTextArb, (a, b) => {
        const result = merge3(a, b, b);
        expect(result).toEqual({ type: "clean", content: b });
      }),
      { numRuns: 100 },
    );
  });

  it("merges different, far apart lines without conflict, keeping both changes (100 runs)", () => {
    fc.assert(
      fc.property(
        fc.array(realisticLineArb, { minLength: 6, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 15 }),
        fc.string({ minLength: 1, maxLength: 15 }),
        fc.integer({ min: 0, max: 2 }), // local edit index
        fc.integer({ min: 2, max: 4 }), // remote edit index offset (ensures at least 1 line separation)
        (rawLines, localEdit, remoteEdit, localIdx, remoteOffset) => {
          // Construct base of distinct lines
          const baseLines = rawLines.map((line, idx) => `[line-${idx}] ${line.replace(/\n/g, "")}\n`);
          const i = localIdx; // e.g. 0..2
          const j = i + remoteOffset; // e.g. i+2..i+4, guarantees j >= i + 2 < baseLines.length

          const localModified = `[LOCAL] ${localEdit.replace(/\n/g, "")}\n`;
          const remoteModified = `[REMOTE] ${remoteEdit.replace(/\n/g, "")}\n`;

          const localLines = [...baseLines];
          localLines[i] = localModified;

          const remoteLines = [...baseLines];
          remoteLines[j] = remoteModified;

          const base = baseLines.join("");
          const local = localLines.join("");
          const remote = remoteLines.join("");

          const result = merge3(base, local, remote);

          expect(result.type).toBe("clean");
          if (result.type === "clean") {
            expect(result.content).toContain(localModified);
            expect(result.content).toContain(remoteModified);
            // Verify untouched line between i and j is preserved
            const betweenIdx = i + 1;
            expect(result.content).toContain(baseLines[betweenIdx]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
