import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { countOpenActionsInText, deferOpenActionsInText } from "./paste";

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
          text: fc.string({ unit: fc.constantFrom("a", "b", "c", " ", "task", "meeting"), minLength: 0, maxLength: 20 }),
          inline: fc.constantFrom("", " => # follow up", " => o next agenda", " => v done", " => > deferred", " => @alice"),
        })
        .map(({ indent, prefix, text, inline }) => `${indent}${prefix}${text}${inline}`),
      fc.string({ minLength: 1, maxLength: 25 }),
    ),
    { minLength: 0, maxLength: 20 },
  )
  .map((lines) => lines.join("\n"));

const generalTextArb = fc.oneof(fc.string(), realisticNoteTextArb);

describe("deferOpenActionsInText properties (fast-check)", () => {
  it("is idempotent after one application (100 runs)", () => {
    fc.assert(
      fc.property(generalTextArb, (text) => {
        const once = deferOpenActionsInText(text);
        const twice = deferOpenActionsInText(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  it("the number of lines is unchanged (100 runs)", () => {
    fc.assert(
      fc.property(generalTextArb, (text) => {
        const deferred = deferOpenActionsInText(text);
        expect(deferred.split("\n").length).toBe(text.split("\n").length);
      }),
      { numRuns: 100 },
    );
  });

  it("a text without open actions is unchanged (100 runs)", () => {
    fc.assert(
      fc.property(generalTextArb, (text) => {
        if (countOpenActionsInText(text) === 0) {
          expect(deferOpenActionsInText(text)).toBe(text);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("only documented forms (# to > and o to ,) change (100 runs)", () => {
    fc.assert(
      fc.property(generalTextArb, (text) => {
        const deferred = deferOpenActionsInText(text);

        // Deferral replaces single characters in place (# -> >, o -> ,) so length is unchanged
        expect(deferred.length).toBe(text.length);

        let diffCount = 0;
        for (let i = 0; i < text.length; i++) {
          if (text[i] !== deferred[i]) {
            diffCount++;
            const validActionDefer = text[i] === "#" && deferred[i] === ">";
            const validTopicDefer = text[i] === "o" && deferred[i] === ",";
            expect(validActionDefer || validTopicDefer).toBe(true);
          }
        }

        // The number of character modifications matches the count of open action/topic items
        const openCount = countOpenActionsInText(text);
        expect(diffCount).toBe(openCount);

        // After deferral, the text has 0 open actions/topics left
        expect(countOpenActionsInText(deferred)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
