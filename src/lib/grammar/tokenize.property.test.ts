import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { tokenizeLine, type Token } from "./tokenize";

const realisticLineArb = fc
  .record({
    indent: fc.constantFrom("", " ", "  ", "    ", "\t"),
    prefix: fc.constantFrom("# ", "v ", "> ", "x ", "o ", ". ", ", ", "- ", "* ", "! ", "1. ", "2) ", "1.1. ", "=== ", "--- ", ""),
    content: fc.constantFrom("task item", "meeting notes", "follow up", "caf\u00e9", "\u65e5\u672c\u8a9e", "☕ emoji", ""),
    inline: fc.constantFrom(
      "",
      " => @alice",
      " => # follow up",
      " => v done",
      " => > later",
      " => x won't do",
      " => plain step",
      " (@bob, @carol)",
      " @dana",
      " (topic)",
      " (parens)",
    ),
  })
  .map(({ indent, prefix, content, inline }) => `${indent}${prefix}${content}${inline}`);

function assertTokenInvariants(line: string, tokens: Token[]) {
  // Documented invariant: tokens represent matched semantic grammar elements (glyphs/decorations),
  // not an exhaustive partition of every character of the line (prose between tokens is not tokenized).
  const leadingIndent = line.match(/^\s*/)?.[0].length ?? 0;

  for (const token of tokens) {
    // Offsets are strictly within line bounds
    expect(token.from).toBeGreaterThanOrEqual(0);
    expect(token.to).toBeLessThanOrEqual(line.length);
    expect(token.from).toBeLessThanOrEqual(token.to);

    // Documented invariant: "Leading indentation is never part of a token."
    // Emphasis spans from column 0, but only triggers at column 0 without indentation (/^!\s/).
    if (token.kind !== "emphasis") {
      expect(token.from).toBeGreaterThanOrEqual(leadingIndent);
    }

    const slice = line.slice(token.from, token.to);

    switch (token.kind) {
      case "action":
        expect(token.replaced).toBe(true);
        expect(["#", "v", ">", "x"]).toContain(token.symbol);
        expect(slice.length).toBe(2);
        expect(slice[0]).toBe(token.symbol);
        expect(/\s/.test(slice[1])).toBe(true);
        break;
      case "topic":
        expect(token.replaced).toBe(true);
        expect(["o", ".", ","]).toContain(token.symbol);
        expect(slice.length).toBe(2);
        expect(slice[0]).toBe(token.symbol);
        expect(/\s/.test(slice[1])).toBe(true);
        break;
      case "bullet":
        expect(token.replaced).toBe(true);
        expect(["-", "*"]).toContain(token.symbol);
        expect(slice.length).toBe(2);
        expect(slice[0]).toBe(token.symbol);
        expect(/\s/.test(slice[1])).toBe(true);
        break;
      case "emphasis":
        expect(token.replaced).toBe(false);
        expect(token.symbol).toBe("!");
        expect(token.from).toBe(0);
        expect(token.to).toBe(line.length);
        expect(/^!\s/.test(line)).toBe(true);
        break;
      case "arrow":
        expect(token.replaced).toBe(true);
        expect(slice.startsWith("=>")).toBe(true);
        break;
      case "consequence":
        expect(token.replaced).toBe(true);
        expect(["#", "v", ">", "x"]).toContain(token.symbol);
        expect(slice.length).toBe(2);
        expect(slice[0]).toBe(token.symbol);
        expect(/\s/.test(slice[1])).toBe(true);
        break;
      case "assignee":
        expect(token.replaced).toBe(false);
        expect(slice.startsWith("@")).toBe(true);
        break;
      case "assigneeList":
        expect(token.replaced).toBe(false);
        expect(slice.startsWith("(@")).toBe(true);
        expect(slice.endsWith(")")).toBe(true);
        break;
      case "topicTag":
      case "paren":
        expect(token.replaced).toBe(false);
        expect(slice.startsWith("(")).toBe(true);
        expect(slice.endsWith(")")).toBe(true);
        break;
    }
  }

  // Documented invariant: replaced tokens represent atomic glyph widgets and must not overlap
  const replacedTokens = tokens.filter((t) => t.replaced);
  for (let i = 0; i < replacedTokens.length - 1; i++) {
    expect(replacedTokens[i].to).toBeLessThanOrEqual(replacedTokens[i + 1].from);
  }
}

describe("tokenizeLine properties (fast-check)", () => {
  it("never throws and preserves documented invariants for arbitrary unicode strings (500 runs)", () => {
    fc.assert(
      fc.property(fc.string(), (line: string) => {
        const tokens = tokenizeLine(line);
        assertTokenInvariants(line, tokens);
      }),
      { numRuns: 500 },
    );
  });

  it("never throws and preserves documented invariants for strings with tabs, \\r, control chars (500 runs)", () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(" ", "\t", "\r", "\n", "#", "v", ">", "x", "o", ".", ",", "-", "*", "!", "=", ">", "@", "(", ")", "a", "1", "☕", "\0", "z"),
        }),
        (line: string) => {
          const tokens = tokenizeLine(line);
          assertTokenInvariants(line, tokens);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("never throws and preserves documented invariants for very long lines (500 runs)", () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom("a", " ", "#", "=>", "@", "(", ")", "\t", "\r", "1"),
          minLength: 500,
          maxLength: 3000,
        }),
        (line: string) => {
          const tokens = tokenizeLine(line);
          assertTokenInvariants(line, tokens);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("never throws and preserves documented invariants for realistic note lines (500 runs)", () => {
    fc.assert(
      fc.property(realisticLineArb, (line: string) => {
        const tokens = tokenizeLine(line);
        assertTokenInvariants(line, tokens);
      }),
      { numRuns: 500 },
    );
  });
});
