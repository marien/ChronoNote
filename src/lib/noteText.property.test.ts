import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { normalizeNoteText } from "./noteText";

const realisticNoteTextArb = fc
  .array(
    fc.oneof(
      fc.constant(""),
      fc.constant("   "),
      fc.constant("==="),
      fc
        .record({
          indent: fc.constantFrom("", "  ", "    "),
          prefix: fc.constantFrom("# ", "v ", "> ", "x ", "o ", ". ", ", ", "- ", "* ", "1. ", "2) ", "=> "),
          text: fc.string({
            unit: fc.constantFrom("a", "b", "c", " ", "caf\u00e9", "\u65e5\u672c\u8a9e", "☕"),
            minLength: 1,
            maxLength: 20,
          }),
        })
        .map(({ indent, prefix, text }) => `${indent}${prefix}${text}`),
    ),
    { minLength: 0, maxLength: 20 },
  )
  .map((lines) => lines.join("\n"));

const textWithBomAndCrArb = fc
  .record({
    bom: fc.boolean(),
    text: fc.oneof(fc.string(), realisticNoteTextArb),
    lineEndings: fc.constantFrom("\n", "\r\n", "\r"),
  })
  .map(({ bom, text, lineEndings }) => {
    const raw = text.replace(/\r?\n/g, lineEndings);
    return bom ? `\uFEFF${raw}` : raw;
  });

describe("normalizeNoteText properties (fast-check)", () => {
  it("is idempotent (100 runs)", () => {
    fc.assert(
      fc.property(textWithBomAndCrArb, (text) => {
        const once = normalizeNoteText(text);
        const twice = normalizeNoteText(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  it("output has no \\r (100 runs)", () => {
    fc.assert(
      fc.property(textWithBomAndCrArb, (text) => {
        const normalized = normalizeNoteText(text);
        expect(normalized.includes("\r")).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("output has no leading BOM (100 runs)", () => {
    fc.assert(
      fc.property(textWithBomAndCrArb, (text) => {
        const normalized = normalizeNoteText(text);
        expect(normalized.startsWith("\uFEFF")).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("normalising a text with CRLF equals normalising it with LF (100 runs)", () => {
    fc.assert(
      fc.property(textWithBomAndCrArb, (text) => {
        const withCrlf = text.replace(/\r?\n/g, "\r\n");
        const withLf = text.replace(/\r?\n/g, "\n");
        expect(normalizeNoteText(withCrlf)).toBe(normalizeNoteText(withLf));
      }),
      { numRuns: 100 },
    );
  });
});
