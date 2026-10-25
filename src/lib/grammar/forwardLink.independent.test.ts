import { describe, expect, it } from "vitest";
import { tokenizeLine, type Token } from "./tokenize";
import { parseGlyphLine, type GlyphPart } from "../editor/glyphLine";

/** Extended Token interface anticipating "forwardLink" kind */
interface ForwardLinkToken {
  kind: "forwardLink";
  from: number;
  to: number;
  dir: ">" | "<";
  date: string;
  section?: string;
  symbol?: string;
  replaced?: boolean;
}

type AnyToken = Token | ForwardLinkToken;

const tokenize = (line: string): AnyToken[] => tokenizeLine(line) as AnyToken[];

interface ExtendedGlyphPart extends GlyphPart {
  parts?: ExtendedGlyphPart[];
}

const parse = (line: string): ExtendedGlyphPart[] => parseGlyphLine(line) as ExtendedGlyphPart[];

describe("forwardLink tokenizer (Task S428-T / Section A)", () => {
  it("recognises forward link with section on an action line (> dir, section text)", () => {
    const line = "# task (>2026-10-26#Weekly Sync)";
    const tokens = tokenize(line);

    const fwdTokens = tokens.filter((t): t is ForwardLinkToken => t.kind === "forwardLink");
    expect(fwdTokens).toHaveLength(1);

    const fwd = fwdTokens[0];
    expect(fwd.from).toBe(7);
    expect(fwd.to).toBe(32);
    expect(fwd.dir).toBe(">");
    expect(fwd.date).toBe("2026-10-26");
    expect(fwd.section).toBe("Weekly Sync");
    expect(line.slice(fwd.from, fwd.to)).toBe("(>2026-10-26#Weekly Sync)");
  });

  it("recognises back link with section (< dir) and produces NO paren token over the same range", () => {
    const line = "# task (<2026-10-13#Standup)";
    const tokens = tokenize(line);

    const fwdTokens = tokens.filter((t): t is ForwardLinkToken => t.kind === "forwardLink");
    expect(fwdTokens).toHaveLength(1);

    const fwd = fwdTokens[0];
    expect(fwd.from).toBe(7);
    expect(fwd.to).toBe(28);
    expect(fwd.dir).toBe("<");
    expect(fwd.date).toBe("2026-10-13");
    expect(fwd.section).toBe("Standup");
    expect(line.slice(fwd.from, fwd.to)).toBe("(<2026-10-13#Standup)");

    // NO "paren" token over the forwardLink range
    const parenTokens = tokens.filter((t) => t.kind === "paren");
    const overlappingParen = parenTokens.find(
      (p) => Math.max(p.from, fwd.from) < Math.min(p.to, fwd.to),
    );
    expect(overlappingParen).toBeUndefined();
  });

  it("recognises forward link without section (section field absent)", () => {
    const line = "(>2026-10-26)";
    const tokens = tokenize(line);

    const fwdTokens = tokens.filter((t): t is ForwardLinkToken => t.kind === "forwardLink");
    expect(fwdTokens).toHaveLength(1);

    const fwd = fwdTokens[0];
    expect(fwd.from).toBe(0);
    expect(fwd.to).toBe(13);
    expect(fwd.dir).toBe(">");
    expect(fwd.date).toBe("2026-10-26");
    expect(fwd.section).toBeUndefined();
    expect(line.slice(fwd.from, fwd.to)).toBe("(>2026-10-26)");
  });

  it("recognises back link without section (< dir)", () => {
    const line = "(<2026-10-20)";
    const tokens = tokenize(line);

    const fwdTokens = tokens.filter((t): t is ForwardLinkToken => t.kind === "forwardLink");
    expect(fwdTokens).toHaveLength(1);

    const fwd = fwdTokens[0];
    expect(fwd.from).toBe(0);
    expect(fwd.to).toBe(13);
    expect(fwd.dir).toBe("<");
    expect(fwd.date).toBe("2026-10-20");
    expect(fwd.section).toBeUndefined();
    expect(line.slice(fwd.from, fwd.to)).toBe("(<2026-10-20)");
  });

  it("recognises two links on one line in order", () => {
    const line = "> task (<2026-10-20#Standup) (>2026-10-26#Weekly Sync)";
    const tokens = tokenize(line);

    const fwdTokens = tokens.filter((t): t is ForwardLinkToken => t.kind === "forwardLink");
    expect(fwdTokens).toHaveLength(2);

    expect(fwdTokens[0]).toMatchObject({
      kind: "forwardLink",
      from: 7,
      to: 28,
      dir: "<",
      date: "2026-10-20",
      section: "Standup",
    });
    expect(line.slice(fwdTokens[0].from, fwdTokens[0].to)).toBe("(<2026-10-20#Standup)");

    expect(fwdTokens[1]).toMatchObject({
      kind: "forwardLink",
      from: 29,
      to: 54,
      dir: ">",
      date: "2026-10-26",
      section: "Weekly Sync",
    });
    expect(line.slice(fwdTokens[1].from, fwdTokens[1].to)).toBe("(>2026-10-26#Weekly Sync)");
  });

  it("rejects invalid dates, missing arrows, and bare dates (no forwardLink token)", () => {
    // Invalid date (Feb 30)
    const invalidDateTokens = tokenize("(>2026-02-30#X)");
    expect(invalidDateTokens.filter((t) => t.kind === "forwardLink")).toHaveLength(0);

    // No arrow
    const noArrowTokens = tokenize("(2026-10-03)");
    expect(noArrowTokens.filter((t) => t.kind === "forwardLink")).toHaveLength(0);

    // Bare date
    const bareDateTokens = tokenize("2026-10-03");
    expect(bareDateTokens.filter((t) => t.kind === "forwardLink")).toHaveLength(0);

    // Non-leap year Feb 29
    const nonLeapTokens = tokenize("(>2025-02-29)");
    expect(nonLeapTokens.filter((t) => t.kind === "forwardLink")).toHaveLength(0);

    // Invalid month
    const invalidMonthTokens = tokenize("(<2026-13-01#X)");
    expect(invalidMonthTokens.filter((t) => t.kind === "forwardLink")).toHaveLength(0);
  });

  it("works on a plain text line too", () => {
    const line = "Notes (>2026-10-26#Sync)";
    const tokens = tokenize(line);

    const fwdTokens = tokens.filter((t): t is ForwardLinkToken => t.kind === "forwardLink");
    expect(fwdTokens).toHaveLength(1);

    expect(fwdTokens[0]).toMatchObject({
      kind: "forwardLink",
      from: 6,
      to: 24,
      dir: ">",
      date: "2026-10-26",
      section: "Sync",
    });
    expect(line.slice(fwdTokens[0].from, fwdTokens[0].to)).toBe("(>2026-10-26#Sync)");
  });
});

describe("forwardLink parseGlyphLine (Task S428-T / Section B)", () => {
  it("forward link with section becomes ONE part with cls cm-fwd-link, title, and 5 sub-parts", () => {
    const line = "# task (>2026-10-26#Weekly Sync)";
    const parts = parse(line);

    const fwdPart = parts.find((p) => p.cls?.includes("cm-fwd-link"));
    expect(fwdPart).toBeDefined();
    expect(fwdPart!.text).toBe("(>2026-10-26#Weekly Sync)");
    expect(fwdPart!.cls).toBe("cm-fwd-link");
    expect(typeof fwdPart!.title).toBe("string");
    expect(fwdPart!.title!.length).toBeGreaterThan(0);

    expect(fwdPart!.parts).toEqual([
      { text: "(>", cls: "cm-fwd-dir cm-fwd-dir-to" },
      { text: "2026-10-26" },
      { text: "#", cls: "cm-fwd-sep" },
      { text: "Weekly Sync" },
      { text: ")", cls: "cm-fwd-paren" },
    ]);
  });

  it("back link with section uses cm-fwd-dir-from and (< text", () => {
    const line = "# task (<2026-10-13#Standup)";
    const parts = parse(line);

    const fwdPart = parts.find((p) => p.cls?.includes("cm-fwd-link"));
    expect(fwdPart).toBeDefined();
    expect(fwdPart!.text).toBe("(<2026-10-13#Standup)");
    expect(fwdPart!.cls).toBe("cm-fwd-link");
    expect(typeof fwdPart!.title).toBe("string");
    expect(fwdPart!.title!.length).toBeGreaterThan(0);

    expect(fwdPart!.parts).toEqual([
      { text: "(<", cls: "cm-fwd-dir cm-fwd-dir-from" },
      { text: "2026-10-13" },
      { text: "#", cls: "cm-fwd-sep" },
      { text: "Standup" },
      { text: ")", cls: "cm-fwd-paren" },
    ]);
  });

  it("link without section has no #/section parts (3 sub-parts total)", () => {
    const line = "# task (>2026-10-26)";
    const parts = parse(line);

    const fwdPart = parts.find((p) => p.cls?.includes("cm-fwd-link"));
    expect(fwdPart).toBeDefined();
    expect(fwdPart!.text).toBe("(>2026-10-26)");
    expect(fwdPart!.cls).toBe("cm-fwd-link");
    expect(typeof fwdPart!.title).toBe("string");
    expect(fwdPart!.title!.length).toBeGreaterThan(0);

    expect(fwdPart!.parts).toEqual([
      { text: "(>", cls: "cm-fwd-dir cm-fwd-dir-to" },
      { text: "2026-10-26" },
      { text: ")", cls: "cm-fwd-paren" },
    ]);

    // Back link without section
    const backLine = "plain (<2026-10-20)";
    const backParts = parse(backLine);
    const backFwdPart = backParts.find((p) => p.cls?.includes("cm-fwd-link"));
    expect(backFwdPart).toBeDefined();
    expect(backFwdPart!.parts).toEqual([
      { text: "(<", cls: "cm-fwd-dir cm-fwd-dir-from" },
      { text: "2026-10-20" },
      { text: ")", cls: "cm-fwd-paren" },
    ]);
  });

  it("concatenating all parts text gives back the line text (preserving glyph replacements)", () => {
    // Plain line: exactly identical
    const plainLine = "Notes (>2026-10-26#Sync)";
    const plainParts = parse(plainLine);
    expect(plainParts.map((p) => p.text).join("")).toBe(plainLine);

    // Sub-parts concatenation equals outer part text
    const fwdPart = plainParts.find((p) => p.cls?.includes("cm-fwd-link"));
    expect(fwdPart?.parts?.map((p) => p.text).join("")).toBe(fwdPart?.text);

    // Action line: action symbol replaced by glyph + space, rest verbatim
    const actionLine = "> task (<2026-10-20#Standup) (>2026-10-26#Weekly Sync)";
    const actionParts = parse(actionLine);
    expect(actionParts.map((p) => p.text).join("")).toBe(
      "☐ task (<2026-10-20#Standup) (>2026-10-26#Weekly Sync)",
    );

    // Multiple forward links on plain line
    const twoLinks = "both (<2026-10-20) and (>2026-10-26)";
    expect(parse(twoLinks).map((p) => p.text).join("")).toBe(twoLinks);
  });
});
