import { describe, it, expect } from "vitest";
import {
  countActions,
  countWords,
  innermostActionSymbol,
  cycleActionSymbol,
  openActionLineIndices,
  adjacentOpenActionLine,
  actionLineEnter,
  stripLeadingToken,
  isSetextUnderline,
  getSectionHeaderForLine,
  normalizeHeaderTitle,
  titleForMatching,
} from "./tokens";

describe("countActions", () => {
  it("counts a plain open action", () => {
    expect(countActions("# Buy milk")).toEqual({ open: 1, closed: 0, forwarded: 0 });
  });

  it("counts done and won't-do as closed (§40)", () => {
    expect(countActions("v Done thing\nx Won't do thing")).toEqual({ open: 0, closed: 2, forwarded: 0 });
  });

  it("counts deferred as forwarded", () => {
    expect(countActions("> Pushed to later")).toEqual({ open: 0, closed: 0, forwarded: 1 });
  });

  it("counts an indented action symbol (§50)", () => {
    expect(countActions("  # Nested open action")).toEqual({ open: 1, closed: 0, forwarded: 0 });
  });

  it("counts a consequence-action's inner symbol toward its own bucket (§41)", () => {
    expect(countActions("Talked to Sam => # follow up")).toEqual({ open: 1, closed: 0, forwarded: 0 });
    expect(countActions("Talked to Sam => v follow up")).toEqual({ open: 0, closed: 1, forwarded: 0 });
    expect(countActions("Talked to Sam => > follow up")).toEqual({ open: 0, closed: 0, forwarded: 1 });
  });

  it("does not count a plain follow-up or a delegated line as any action state", () => {
    expect(countActions("Talked to Sam => let's regroup")).toEqual({ open: 0, closed: 0, forwarded: 0 });
    expect(countActions("Talked to Sam => @alice")).toEqual({ open: 0, closed: 0, forwarded: 0 });
  });

  it("tallies a whole multi-line note", () => {
    const text = ["# open one", "  # open two (indented)", "v done", "x wontdo", "> deferred", "plain text"].join(
      "\n",
    );
    expect(countActions(text)).toEqual({ open: 2, closed: 2, forwarded: 1 });
  });

  it("does not miscount a bullet or emphasis line as an action", () => {
    expect(countActions("- a bullet\n* another bullet\n! bold line")).toEqual({ open: 0, closed: 0, forwarded: 0 });
  });
});

describe("countWords", () => {
  it("counts whitespace-delimited runs", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("  leading and trailing  ")).toBe(3);
    expect(countWords("across\nlines\tand tabs")).toBe(4);
    expect(countWords("# glyph tokens => count too")).toBe(6);
  });
});

describe("innermostActionSymbol", () => {
  it("reads a plain leading symbol", () => {
    expect(innermostActionSymbol("# open")).toBe("#");
    expect(innermostActionSymbol("v done")).toBe("v");
    expect(innermostActionSymbol("> deferred")).toBe(">");
    expect(innermostActionSymbol("x wontdo")).toBe("x");
  });

  it("reads an indented leading symbol (§50)", () => {
    expect(innermostActionSymbol("    # nested")).toBe("#");
  });

  it("prefers the consequence-action's inner symbol over any outer context (§41)", () => {
    expect(innermostActionSymbol("Talked to Sam => # follow up")).toBe("#");
    expect(innermostActionSymbol("Talked to Sam => x follow up")).toBe("x");
  });

  it("returns null for a plain follow-up or delegated line", () => {
    expect(innermostActionSymbol("Talked to Sam => let's regroup")).toBeNull();
    expect(innermostActionSymbol("Talked to Sam => @alice")).toBeNull();
  });

  it("returns null for ordinary text", () => {
    expect(innermostActionSymbol("just a normal line")).toBeNull();
  });
});

describe("openActionLineIndices", () => {
  it("returns the indices of `#` lines only — plain, indented, and consequence-actions (§41/§50)", () => {
    const text = [
      "# first open", // 0
      "plain prose", // 1
      "  # indented open", // 2
      "v a done one", // 3
      "Talked to Sam => # a consequence open", // 4
      "> deferred", // 5
      "=> @alice delegated", // 6
      "# last open", // 7
    ].join("\n");
    expect(openActionLineIndices(text)).toEqual([0, 2, 4, 7]);
  });

  it("is empty for a note with no open actions", () => {
    expect(openActionLineIndices("v done\n> deferred\nplain")).toEqual([]);
  });
});

describe("adjacentOpenActionLine", () => {
  // Open actions on lines 1, 4, 6.
  const text = ["header", "# a", "notes", "notes", "# b", "notes", "# c", "trailing"].join("\n");

  it("moves forward to the next open action", () => {
    expect(adjacentOpenActionLine(text, 1, 1)).toBe(4);
    expect(adjacentOpenActionLine(text, 2, 1)).toBe(4);
    expect(adjacentOpenActionLine(text, 4, 1)).toBe(6);
  });

  it("wraps forward past the last one back to the first", () => {
    expect(adjacentOpenActionLine(text, 6, 1)).toBe(1);
    expect(adjacentOpenActionLine(text, 7, 1)).toBe(1);
  });

  it("moves backward to the previous open action", () => {
    expect(adjacentOpenActionLine(text, 6, -1)).toBe(4);
    expect(adjacentOpenActionLine(text, 5, -1)).toBe(4);
    expect(adjacentOpenActionLine(text, 4, -1)).toBe(1);
  });

  it("wraps backward past the first one to the last", () => {
    expect(adjacentOpenActionLine(text, 1, -1)).toBe(6);
    expect(adjacentOpenActionLine(text, 0, -1)).toBe(6);
  });

  it("returns null when there are no open actions", () => {
    expect(adjacentOpenActionLine("v done\nplain\n> deferred", 0, 1)).toBeNull();
    expect(adjacentOpenActionLine("v done\nplain\n> deferred", 0, -1)).toBeNull();
  });

  it("returns the same line when it's the only open action", () => {
    const one = "plain\n# only\nplain";
    expect(adjacentOpenActionLine(one, 1, 1)).toBe(1);
    expect(adjacentOpenActionLine(one, 1, -1)).toBe(1);
  });
});

describe("cycleActionSymbol", () => {
  it("cycles the full order: # -> v -> > -> x -> #", () => {
    let line = "# Buy milk";
    line = cycleActionSymbol(line)!;
    expect(line).toBe("v Buy milk");
    line = cycleActionSymbol(line)!;
    expect(line).toBe("> Buy milk");
    line = cycleActionSymbol(line)!;
    expect(line).toBe("x Buy milk");
    line = cycleActionSymbol(line)!;
    expect(line).toBe("# Buy milk");
  });

  it("preserves indentation while cycling (§50)", () => {
    expect(cycleActionSymbol("  # Nested")).toBe("  v Nested");
  });

  it("cycles a consequence-action's symbol without touching the arrow or prefix text (§41/§59)", () => {
    expect(cycleActionSymbol("Talked to Sam => # follow up")).toBe("Talked to Sam => v follow up");
    expect(cycleActionSymbol("Talked to Sam => x follow up")).toBe("Talked to Sam => # follow up");
  });

  it("cycles a consequence-action even when the arrow does not open the line (§59 regression)", () => {
    // §59: this used to only work when `=> ` was the very first thing on
    // the line — a real historical bug.
    expect(cycleActionSymbol("Some prose first => > then this")).toBe("Some prose first => x then this");
  });

  it("returns null for a plain follow-up, a delegated line, or plain text", () => {
    expect(cycleActionSymbol("Talked to Sam => let's regroup")).toBeNull();
    expect(cycleActionSymbol("Talked to Sam => @alice")).toBeNull();
    expect(cycleActionSymbol("just prose")).toBeNull();
  });
});

describe("actionLineEnter", () => {
  it("continues any action symbol as a fresh open action", () => {
    expect(actionLineEnter("# buy milk")).toEqual({ insert: "\n# " });
    expect(actionLineEnter("v shipped it")).toEqual({ insert: "\n# " });
    expect(actionLineEnter("> deferred this")).toEqual({ insert: "\n# " });
    expect(actionLineEnter("x won't do it")).toEqual({ insert: "\n# " });
  });

  it("preserves indentation (§50)", () => {
    expect(actionLineEnter("    v nested done")).toEqual({ insert: "\n    # " });
  });

  it("exits on an empty action line — symbol only, or with trailing space", () => {
    expect(actionLineEnter("# ")).toEqual({ removeSymbol: true });
    expect(actionLineEnter("  > ")).toEqual({ removeSymbol: true });
    expect(actionLineEnter("v   ")).toEqual({ removeSymbol: true });
  });

  it("returns null for non-action lines so the caller falls through", () => {
    expect(actionLineEnter("just prose")).toBeNull();
    expect(actionLineEnter("- a bullet")).toBeNull();
    expect(actionLineEnter("Talked to Sam => # follow up")).toBeNull();
    expect(actionLineEnter("=== ")).toBeNull();
    expect(actionLineEnter("")).toBeNull();
  });
});

describe("stripLeadingToken", () => {
  it("strips a plain leading symbol, keeping indentation", () => {
    expect(stripLeadingToken("# Buy milk")).toBe("Buy milk");
    expect(stripLeadingToken("  v Done thing")).toBe("  Done thing");
  });

  it("strips a consequence-action's arrow and inner symbol, keeping everything before it (§70)", () => {
    expect(stripLeadingToken("Talked to Sam => # follow up")).toBe("Talked to Sam follow up");
  });

  it("keeps a delegated @name intact, stripping only the arrow", () => {
    expect(stripLeadingToken("Talked to Sam => @alice")).toBe("Talked to Sam @alice");
  });

  it("strips a plain follow-up arrow, keeping its text", () => {
    expect(stripLeadingToken("Talked to Sam => let's regroup")).toBe("Talked to Sam let's regroup");
  });

  it("handles a mid-line arrow, not just one that opens the line (§70 regression)", () => {
    // §70: the History Drawer showed raw `=> #` text for lines where the
    // arrow wasn't the very first thing on the line — the fix generalized
    // every `=> `-based branch to capture (and keep) whatever precedes it.
    expect(stripLeadingToken("Meeting notes: Talked to Sam => # follow up with him")).toBe(
      "Meeting notes: Talked to Sam follow up with him",
    );
  });

  it("strips BOTH a leading action symbol and a mid-line arrow on the same line (#28)", () => {
    // #28: a line with a leading `# ` *and* a `=> ` follow-up kept its
    // raw `#` next to the row glyph — the `=> ` branch matched and
    // returned before the leading symbol was ever stripped.
    expect(stripLeadingToken("# Call vendor => get quote")).toBe("Call vendor get quote");
    expect(stripLeadingToken("  v Reviewed the PR => # ship it")).toBe("  Reviewed the PR ship it");
    expect(stripLeadingToken("> defer audit => @sam next week")).toBe("defer audit @sam next week");
  });

  it("leaves an ordinary line with no token untouched", () => {
    expect(stripLeadingToken("just a normal line")).toBe("just a normal line");
  });
});

describe("isSetextUnderline", () => {
  it("recognizes three or more equals signs as an underline", () => {
    expect(isSetextUnderline("===")).toBe(true);
    expect(isSetextUnderline("========")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isSetextUnderline("  ===  ")).toBe(true);
  });

  it("rejects fewer than three equals signs", () => {
    expect(isSetextUnderline("==")).toBe(false);
  });

  it("rejects anything mixed in with the equals signs", () => {
    expect(isSetextUnderline("=== notes")).toBe(false);
    expect(isSetextUnderline("")).toBe(false);
  });
});

describe("getSectionHeaderForLine", () => {
  const lines = [
    "Weekly Sync",
    "====",
    "# discuss roadmap",
    "some notes",
    "",
    "Follow-ups",
    "==========",
    "# call back Bob",
  ];

  it("finds the header when the cursor is on the title line itself", () => {
    expect(getSectionHeaderForLine(lines, 0)).toBe("Weekly Sync");
  });

  it("finds the header when the cursor is on the underline itself", () => {
    expect(getSectionHeaderForLine(lines, 1)).toBe("Weekly Sync");
  });

  it("finds the header for lines within the section body", () => {
    expect(getSectionHeaderForLine(lines, 2)).toBe("Weekly Sync");
    expect(getSectionHeaderForLine(lines, 4)).toBe("Weekly Sync");
  });

  it("finds the nearest preceding header once past a later section", () => {
    expect(getSectionHeaderForLine(lines, 7)).toBe("Follow-ups");
  });

  it("returns empty string above the first section header", () => {
    expect(getSectionHeaderForLine(["no header yet", "# open action"], 1)).toBe("");
  });

  it("returns empty string for an out-of-range index", () => {
    expect(getSectionHeaderForLine(lines, -1)).toBe("");
    expect(getSectionHeaderForLine(lines, 999)).toBe("");
  });
});

describe("normalizeHeaderTitle", () => {
  it("strips a leading time range", () => {
    expect(normalizeHeaderTitle("[09:00 - 09:30] Standup")).toBe("Standup");
  });

  it("strips a leading [CANCELED] tag", () => {
    expect(normalizeHeaderTitle("[CANCELED] Weekly Sync")).toBe("Weekly Sync");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHeaderTitle("  Weekly Sync  ")).toBe("Weekly Sync");
  });

  it("leaves an already-plain title untouched", () => {
    expect(normalizeHeaderTitle("Weekly Sync")).toBe("Weekly Sync");
  });
});

describe("titleForMatching", () => {
  it("strips a leading date so recurring sections match across dates (§37)", () => {
    expect(titleForMatching("2026-08-08 - Weekly Sync")).toBe("Weekly Sync");
    expect(titleForMatching("2026-08-08 Weekly Sync")).toBe("Weekly Sync");
  });

  it("strips a trailing date", () => {
    expect(titleForMatching("Weekly Sync - 2026-08-08")).toBe("Weekly Sync");
  });

  it("treats two dated instances of the same section as equal once normalized", () => {
    const a = titleForMatching("Weekly Sync - 2026-08-08");
    const b = titleForMatching("Weekly Sync - 2026-08-15");
    expect(a).toBe(b);
  });

  it("leaves a title with no date untouched", () => {
    expect(titleForMatching("Weekly Sync")).toBe("Weekly Sync");
  });

  it("does not touch a date-shaped word that isn't actually YYYY-MM-DD", () => {
    expect(titleForMatching("Q3-2026 Planning")).toBe("Q3-2026 Planning");
  });
});
