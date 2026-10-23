import { describe, it, expect } from "vitest";
import {
  countActions,
  lineSectionRole,
  countWords,
  innermostActionSymbol,
  innermostTopicSymbol,
  isTopicLikeLine,
  cycleActionSymbol,
  closeOpenAction,
  findActionSymbols,
  pickActionSymbol,
  referenceColumn,
  toggleOpenClosedAtIndex,
  symbolAfterClick,
  toggleOpenClosed,
  reopenDoneAction,
  reopenDeferredAction,
  openAgendaTopic,
  setActionSymbolOpen,
  setActionSymbolTo,
  setTopicSymbolTo,
  openActionLineIndices,
  adjacentOpenActionLine,
  actionLineEnter,
  topicLineEnter,
  topicContinuationIndent,
  leadingTopicTag,
  stripLeadingToken,
  isSetextUnderline,
  getSectionHeaderForLine,
  normalizeHeaderTitle,
  titleForMatching,
  stateFirst,
  listSections,
  dueItems,
  countOverdue,
  dueStatus,
  rewriteDueWords,
  withDueDate,
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

  it("cycles backwards with direction -1: # -> x -> > -> v -> # (§145)", () => {
    let line = "# Buy milk";
    line = cycleActionSymbol(line, -1)!;
    expect(line).toBe("x Buy milk");
    line = cycleActionSymbol(line, -1)!;
    expect(line).toBe("> Buy milk");
    line = cycleActionSymbol(line, -1)!;
    expect(line).toBe("v Buy milk");
    line = cycleActionSymbol(line, -1)!;
    expect(line).toBe("# Buy milk");
  });

  it("cycles a consequence-action's symbol backwards too (§145)", () => {
    expect(cycleActionSymbol("Talked to Sam => # follow up", -1)).toBe("Talked to Sam => x follow up");
  });
});

describe("setActionSymbolOpen (#65/#73/#257)", () => {
  it("forces v / > / x straight to # without cycling through the order", () => {
    expect(setActionSymbolOpen("v Buy milk")).toBe("# Buy milk");
    expect(setActionSymbolOpen("> Buy milk")).toBe("# Buy milk");
    expect(setActionSymbolOpen("x Buy milk")).toBe("# Buy milk");
  });

  it("is a no-op replacement (still returns the same text) for an already-open line", () => {
    expect(setActionSymbolOpen("# Buy milk")).toBe("# Buy milk");
  });

  it("#257: opens agenda topics (. / , -> o) without converting them to actions (#)", () => {
    expect(setActionSymbolOpen(". Discussed topic")).toBe("o Discussed topic");
    expect(setActionSymbolOpen(", Postponed topic")).toBe("o Postponed topic");
    expect(setActionSymbolOpen("o Already open topic")).toBe("o Already open topic");
    expect(setActionSymbolOpen("  . Indented discussed topic")).toBe("  o Indented discussed topic");
  });

  it("preserves indentation (§50)", () => {
    expect(setActionSymbolOpen("  v Nested")).toBe("  # Nested");
  });

  it("forces a consequence-action's symbol without touching the arrow or prefix text (§41)", () => {
    expect(setActionSymbolOpen("Talked to Sam => v follow up")).toBe("Talked to Sam => # follow up");
    expect(setActionSymbolOpen("Some prose first => > then this")).toBe("Some prose first => # then this");
  });

  it("#73: does NOT promote a plain follow-up or plain text — Ctrl+Shift+O drifted into sharing Ctrl+1's promotion and this un-shares it", () => {
    expect(setActionSymbolOpen("Talked to Sam => let's regroup")).toBeNull();
    expect(setActionSymbolOpen("just prose")).toBeNull();
    expect(setActionSymbolOpen("  indented prose")).toBeNull();
  });

  it("returns null for a delegated line, a bullet, emphasis, or a bare setext underline", () => {
    expect(setActionSymbolOpen("Talked to Sam => @alice")).toBeNull();
    expect(setActionSymbolOpen("- a bullet")).toBeNull();
    expect(setActionSymbolOpen("* a bullet")).toBeNull();
    expect(setActionSymbolOpen("! remember this")).toBeNull();
    expect(setActionSymbolOpen("=> ")).toBeNull();
    expect(setActionSymbolOpen("====")).toBeNull();
  });
});

describe("setActionSymbolTo (#70)", () => {
  it("sets straight to the given state, from any prior state", () => {
    expect(setActionSymbolTo("# Buy milk", "v")).toBe("v Buy milk");
    expect(setActionSymbolTo("v Buy milk", ">")).toBe("> Buy milk");
    expect(setActionSymbolTo("> Buy milk", "x")).toBe("x Buy milk");
    expect(setActionSymbolTo("x Buy milk", "#")).toBe("# Buy milk");
  });

  it("#69: promotes a plain line directly to the given state, not always to open", () => {
    expect(setActionSymbolTo("just prose", "v")).toBe("v just prose");
    expect(setActionSymbolTo("Talked to Sam => let's regroup", "x")).toBe("Talked to Sam => x let's regroup");
  });

  it("promotes bullet, numbered and emphasis lines with symbol in front", () => {
    expect(setActionSymbolTo("- item", "#")).toBe("# - item");
    expect(setActionSymbolTo("  * item", "#")).toBe("  # * item");
    expect(setActionSymbolTo("1. item", "#")).toBe("# 1. item");
    expect(setActionSymbolTo("! note", "#")).toBe("# ! note");
  });
});

describe("closeOpenAction (#73)", () => {
  it("closes an open line to done", () => {
    expect(closeOpenAction("# Buy milk")).toBe("v Buy milk");
  });

  it("preserves indentation and a consequence-action's prefix", () => {
    expect(closeOpenAction("  # Nested")).toBe("  v Nested");
    expect(closeOpenAction("Talked to Sam => # follow up")).toBe("Talked to Sam => v follow up");
  });

  it("is a no-op for anything not currently open: done, deferred, won't-do, or plain text", () => {
    expect(closeOpenAction("v Buy milk")).toBeNull();
    expect(closeOpenAction("> Buy milk")).toBeNull();
    expect(closeOpenAction("x Buy milk")).toBeNull();
    expect(closeOpenAction("just prose")).toBeNull();
    expect(closeOpenAction("Talked to Sam => let's regroup")).toBeNull();
  });
});

describe("reopenDoneAction (#73)", () => {
  it("reopens a done line to open", () => {
    expect(reopenDoneAction("v Buy milk")).toBe("# Buy milk");
  });

  it("preserves indentation and a consequence-action's prefix", () => {
    expect(reopenDoneAction("  v Nested")).toBe("  # Nested");
    expect(reopenDoneAction("Talked to Sam => v follow up")).toBe("Talked to Sam => # follow up");
  });

  it("is a no-op for anything not currently done: open, deferred, won't-do, or plain text", () => {
    expect(reopenDoneAction("# Buy milk")).toBeNull();
    expect(reopenDoneAction("> Buy milk")).toBeNull();
    expect(reopenDoneAction("x Buy milk")).toBeNull();
    expect(reopenDoneAction("just prose")).toBeNull();
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
    expect(actionLineEnter("=== ")).toBeNull();
    expect(actionLineEnter("")).toBeNull();
  });

  it("#34: a plain `=> ` follow-up continues as a bare `=> ` — no action symbol", () => {
    expect(actionLineEnter("=> chased the vendor")).toEqual({ insert: "\n=> " });
    expect(actionLineEnter("=> @sam owns the recap")).toEqual({ insert: "\n=> " });
    expect(actionLineEnter("  => indented follow-up")).toEqual({ insert: "\n  => " });
  });

  it("#34: a `=> <symbol>` consequence-action continues as a fresh open `=> # `", () => {
    expect(actionLineEnter("=> # already an open consequence")).toEqual({ insert: "\n=> # " });
    expect(actionLineEnter("=> v done consequence")).toEqual({ insert: "\n=> # " });
  });

  it("#34: exits an empty `=> ` / `=> # ` follow-up line", () => {
    expect(actionLineEnter("=> ")).toEqual({ removeSymbol: true });
    expect(actionLineEnter("=> #")).toEqual({ removeSymbol: true });
  });

  it("#34: a mid-line `=> ` is not a follow-up line — still null", () => {
    expect(actionLineEnter("Talked to Sam => # follow up")).toBeNull();
  });

  it("continues bulleted and numbered actions, and exits on empty", () => {
    expect(actionLineEnter("# - task")).toEqual({ insert: "\n# - " });
    expect(actionLineEnter("  v * task")).toEqual({ insert: "\n  # * " });
    expect(actionLineEnter("# - ")).toEqual({ removeSymbol: true });
    expect(actionLineEnter("# 1. task")).toEqual({ insert: "\n# 2. " });
    expect(actionLineEnter("# 1.1. task")).toEqual({ insert: "\n# 1.2. " });
    expect(actionLineEnter("v 2) task")).toEqual({ insert: "\n# 3) " });
    expect(actionLineEnter("# 3. ")).toEqual({ removeSymbol: true });
    expect(actionLineEnter("# 1. task", 2)).toEqual({ plain: true });
    expect(actionLineEnter("# 1. task", 5, "===")).toEqual({ plain: true });
  });

  it("handles consequence topic follow-ups", () => {
    expect(actionLineEnter("=> o raise it")).toEqual({ insert: "\n=> o " });
    expect(actionLineEnter("=> . raise it")).toEqual({ insert: "\n=> o " });
    expect(actionLineEnter("=> o")).toEqual({ removeSymbol: true });
    expect(actionLineEnter("=> .")).toEqual({ removeSymbol: true });
    expect(actionLineEnter("Notes => o raise it")).toBeNull();
  });
});

describe("leadingTopicTag (#36/#39)", () => {
  it("matches a (topic) right after a leading action symbol", () => {
    expect(leadingTopicTag("# (auth) fix the login")).toEqual({ from: 2, to: 8 });
    expect(leadingTopicTag("  x (v2) dropped")).toEqual({ from: 4, to: 8 });
  });
  it("matches a (topic) right after a `=> <symbol>` consequence-action", () => {
    const line = "Talked to Sam => # (q3) follow up";
    const t = leadingTopicTag(line)!;
    expect(line.slice(t.from, t.to)).toBe("(q3)");
  });
  it("does not match a (topic) elsewhere on the line, or in prose", () => {
    expect(leadingTopicTag("# fix the login (auth)")).toBeNull();
    expect(leadingTopicTag("# fix (auth) later")).toBeNull(); // not immediately after the symbol
    expect(leadingTopicTag("just prose (aside) here")).toBeNull();
    expect(leadingTopicTag("=> follow up (later)")).toBeNull(); // plain follow-up, no symbol
  });
  it("#126: `(@name)` right after the symbol is a delegate, not a topic", () => {
    expect(leadingTopicTag("# (@dana) chase it")).toBeNull();
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
    expect(stripLeadingToken("Talked to Sam => @jean-luc has it")).toBe("Talked to Sam @jean-luc has it"); // #125
    expect(stripLeadingToken("Talked to Sam => @René has it")).toBe("Talked to Sam @René has it");
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

describe("toggleOpenClosed (click on a glyph)", () => {
  it("closes an open action and reopens every closed one", () => {
    expect(toggleOpenClosed("# Buy milk")).toBe("v Buy milk");
    expect(toggleOpenClosed("v Buy milk")).toBe("# Buy milk");
    expect(toggleOpenClosed("> Buy milk")).toBe("# Buy milk");
    expect(toggleOpenClosed("x Buy milk")).toBe("# Buy milk");
  });

  it("is a true toggle: two clicks return to the start, from open and from closed", () => {
    for (const start of ["# a", "v a", "> a", "x a"]) {
      const once = toggleOpenClosed(start)!;
      const twice = toggleOpenClosed(once)!;
      // open -> done -> open, and any closed state -> open -> done (always one of two states)
      expect(["# a", "v a"]).toContain(once);
      expect(["# a", "v a"]).toContain(twice);
      expect(twice).not.toBe(once);
    }
  });

  it("keeps indentation, the rest of the line and the arrow of a consequence action", () => {
    expect(toggleOpenClosed("  # Nested")).toBe("  v Nested");
    expect(toggleOpenClosed("    x Deep")).toBe("    # Deep");
    expect(toggleOpenClosed("=> # follow up")).toBe("=> v follow up");
    expect(toggleOpenClosed("Talked to Sam => v follow up")).toBe("Talked to Sam => # follow up");
    // with two action symbols on a line, the innermost (the consequence action) is the one that toggles
    expect(toggleOpenClosed("# do X => > wait")).toBe("# do X => # wait");
    expect(toggleOpenClosed("a => o b")).toBe("a => . b");
  });

  it("does nothing to lines that are not actions", () => {
    for (const line of ["plain", "- bullet", "! important", "=> just a follow-up", "=> @sam do it", "Title", "====="]) {
      expect(toggleOpenClosed(line)).toBeNull();
    }
  });

  it("symbolAfterClick previews the same result", () => {
    expect(symbolAfterClick("#")).toBe("v");
    for (const s of ["v", ">", "x"]) expect(symbolAfterClick(s)).toBe("#");
  });
});

describe("findActionSymbols: every action symbol on a line, left to right", () => {
  const at = (line: string) => findActionSymbols(line).map((s) => [s.index, s.sym]);

  it("finds the leading symbol, with or without indentation", () => {
    expect(at("# a")).toEqual([[0, "#"]]);
    expect(at("  v a")).toEqual([[2, "v"]]);
    expect(at("    > a")).toEqual([[4, ">"]]);
    expect(at("x a")).toEqual([[0, "x"]]);
    expect(at("# ")).toEqual([[0, "#"]]);
  });

  it("finds consequence actions anywhere on the line", () => {
    expect(at("=> # a")).toEqual([[3, "#"]]);
    expect(at("=> > a")).toEqual([[3, ">"]]);
    expect(at("Talked to Sam => v follow up")).toEqual([[17, "v"]]);
    expect(at("# do X => # wait")).toEqual([[0, "#"], [10, "#"]]);
    expect(at("> => x y")).toEqual([[0, ">"], [5, "x"]]);
    expect(at("# a => v b => x c")).toEqual([[0, "#"], [7, "v"], [14, "x"]]);
    expect(findActionSymbols("a => o b")).toEqual([{ index: 5, sym: "o" }]);
  });

  it("finds nothing on lines that are not actions", () => {
    for (const line of ["", "plain", "- bullet", "* bullet", "! note", "=> @sam do it", "=> follow-up text", "#nospace", "#", "=> #", "Title", "====="]) {
      expect(at(line)).toEqual([]);
    }
  });

  it("a delegate or a plain follow-up does not hide a leading action", () => {
    expect(at("# ask => @sam")).toEqual([[0, "#"]]);
    expect(at("v done => a plain note")).toEqual([[0, "v"]]);
  });
});

describe("pickActionSymbol: left of the caret first, then right", () => {
  const line = "# do X => # wait";
  const syms = findActionSymbols(line); // indexes 0 and 10
  const pick = (col: number) => pickActionSymbol(syms, col)?.index;

  it("a caret at the very start, before the leading symbol, finds it on the right", () => {
    expect(pick(0)).toBe(0);
  });
  it("a caret anywhere after the leading symbol and up to the second one means the leading one", () => {
    for (const col of [1, 2, 5, 9, 10]) expect(pick(col)).toBe(0);
  });
  it("a caret after the second symbol (even before the space that follows it) means the second one", () => {
    for (const col of [11, 12, 14, line.length]) expect(pick(col)).toBe(10);
  });

  it("with only symbols to the right, the nearest one on the right is used", () => {
    const s = findActionSymbols("    text => # a"); // the leading part is prose, only one symbol
    expect(pickActionSymbol(s, 0)?.index).toBe(12);
    expect(pickActionSymbol(s, 12)?.index).toBe(12);
    expect(pickActionSymbol(s, 13)?.index).toBe(12);
  });

  it("with a caret in the indentation of an indented action, the symbol on the right is found", () => {
    const s = findActionSymbols("  # x");
    expect(pickActionSymbol(s, 0)?.index).toBe(2);
    expect(pickActionSymbol(s, 2)?.index).toBe(2);
    expect(pickActionSymbol(s, 3)?.index).toBe(2);
  });

  it("no symbols, no result, at every column", () => {
    for (let c = 0; c <= 6; c++) expect(pickActionSymbol([], c)).toBeNull();
  });

  it("property: the nearest symbol before the caret wins; only when none, the first at or after it", () => {
    const l = "# a => v b => x c";
    const ss = findActionSymbols(l);
    for (let col = 0; col <= l.length; col++) {
      const before = ss.filter((s) => s.index < col);
      const expected = before.length ? before[before.length - 1] : ss.find((s) => s.index >= col);
      expect(pickActionSymbol(ss, col)).toEqual(expected);
    }
  });
});

describe("caret-aware transforms", () => {
  const L = "# do X => # wait";

  it("close (# -> v) acts on the symbol at the caret only", () => {
    expect(closeOpenAction(L, 5)).toBe("v do X => # wait");
    expect(closeOpenAction(L, 16)).toBe("# do X => v wait");
    expect(closeOpenAction(L, 0)).toBe("v do X => # wait");
    expect(closeOpenAction("  # a => # b", 1)).toBe("  v a => # b");
  });

  it("close does nothing when the symbol at the caret is not open (it does not hunt for another)", () => {
    expect(closeOpenAction("v a => # b", 3)).toBeNull();
    expect(closeOpenAction("> a", 2)).toBeNull();
    expect(closeOpenAction("plain", 2)).toBeNull();
  });

  it("reopen (v -> #) acts on the symbol at the caret only", () => {
    expect(reopenDoneAction("v a => v b", 2)).toBe("# a => v b");
    expect(reopenDoneAction("v a => v b", 12)).toBe("v a => # b");
    expect(reopenDoneAction("# a => v b", 3)).toBeNull();
    expect(reopenDoneAction("x a", 1)).toBeNull();
  });

  it("set-to-state changes the symbol at the caret, keeping everything else", () => {
    expect(setActionSymbolTo(L, ">", 1)).toBe("> do X => # wait");
    expect(setActionSymbolTo(L, "x", 15)).toBe("# do X => x wait");
    expect(setActionSymbolTo("  v a => # b", "#", 4)).toBe("  # a => # b");
    expect(setActionSymbolTo("=> # follow up", "v", 0)).toBe("=> v follow up");
    // already that state: an unchanged line, not null (the caller counts changes)
    expect(setActionSymbolTo("# a", "#", 1)).toBe("# a");
  });

  it("set-to-state with no symbol on the line turns the whole line into that action, as before", () => {
    expect(setActionSymbolTo("plain text", "v", 3)).toBe("v plain text");
    expect(setActionSymbolTo("  indented text", "#", 5)).toBe("  # indented text");
    expect(setActionSymbolTo("=> a follow-up", "x", 6)).toBe("=> x a follow-up");
    expect(setActionSymbolTo("Talked to Sam => a follow-up", ">", 2)).toBe("Talked to Sam => > a follow-up");
    expect(setActionSymbolTo("- bullet", "#", 2)).toBe("# - bullet");
    expect(setActionSymbolTo("! remember", "#", 2)).toBe("# ! remember");
    expect(setActionSymbolTo("=> @sam do it", "#", 2)).toBeNull();
    expect(setActionSymbolTo("=====", "#", 2)).toBeNull();
  });

  it("Ctrl+Shift+O (open) acts on the caret's symbol and never promotes a plain line", () => {
    expect(setActionSymbolOpen("v a => x b", 1)).toBe("# a => x b");
    expect(setActionSymbolOpen("v a => x b", 12)).toBe("v a => # b");
    expect(setActionSymbolOpen(". topic => x b", 1)).toBe("o topic => x b");
    expect(setActionSymbolOpen(". topic => x b", 14)).toBe(". topic => # b");
    expect(setActionSymbolOpen("plain", 2)).toBeNull();
  });

  it("toggle (open <-> closed) at a caret column", () => {
    expect(toggleOpenClosed("# a => > b", 1)).toBe("v a => > b");
    expect(toggleOpenClosed("# a => > b", 12)).toBe("# a => # b");
    expect(toggleOpenClosed("plain", 1)).toBeNull();
  });

  it("without a column every transform still means the innermost symbol (the Action Drawer's rule)", () => {
    expect(closeOpenAction(L)).toBe("# do X => v wait");
    expect(setActionSymbolTo("# a => # b", "v")).toBe("# a => v b");
    expect(toggleOpenClosed("# a => # b")).toBe("# a => v b");
    expect(cycleActionSymbol("# a => # b")).toBe("# a => v b");
  });
});

describe("toggleOpenClosedAtIndex: a click affects exactly the glyph that was hit", () => {
  const L = "# do X => > wait";

  it("the leading glyph toggles the leading symbol, whatever else is on the line", () => {
    expect(toggleOpenClosedAtIndex(L, 0)).toBe("v do X => > wait");
  });
  it("the follow-up's glyph toggles the follow-up's symbol", () => {
    expect(toggleOpenClosedAtIndex(L, 10)).toBe("# do X => # wait");
  });
  it("an index that is not an action symbol does nothing", () => {
    for (const i of [1, 3, 7, 8, 9, 11, 99]) expect(toggleOpenClosedAtIndex(L, i)).toBeNull();
    expect(toggleOpenClosedAtIndex("plain", 0)).toBeNull();
  });
  it("indented lines and three symbols", () => {
    expect(toggleOpenClosedAtIndex("  x a", 2)).toBe("  # a");
    expect(toggleOpenClosedAtIndex("# a => v b => x c", 7)).toBe("# a => # b => x c");
    expect(toggleOpenClosedAtIndex("# a => v b => x c", 14)).toBe("# a => v b => # c");
  });
});

describe("referenceColumn: which column each selected line is judged by", () => {
  // three lines of 10 characters at [0,10], [11,21], [22,32]
  const A = { from: 0, to: 10 }, B = { from: 11, to: 21 }, C = { from: 22, to: 32 };

  it("a caret: its own column on its own line", () => {
    const sel = { from: 15, to: 15, head: 15 };
    expect(referenceColumn(sel, B)).toBe(4);
  });
  it("a selection inside one line uses the caret end (head)", () => {
    expect(referenceColumn({ from: 12, to: 18, head: 18 }, B)).toBe(7);
    expect(referenceColumn({ from: 12, to: 18, head: 12 }, B)).toBe(1);
  });
  it("a forward multi-line selection: the caret line uses the caret, the start line its start, the middle line column 0", () => {
    const sel = { from: 5, to: 25, head: 25 };
    expect(referenceColumn(sel, A)).toBe(5);
    expect(referenceColumn(sel, B)).toBe(0);
    expect(referenceColumn(sel, C)).toBe(3);
  });
  it("a backward multi-line selection gives the same columns", () => {
    const sel = { from: 5, to: 25, head: 5 };
    expect(referenceColumn(sel, A)).toBe(5);
    expect(referenceColumn(sel, B)).toBe(0);
    expect(referenceColumn(sel, C)).toBe(3);
  });
  it("a caret at the very end of a line belongs to that line", () => {
    expect(referenceColumn({ from: 10, to: 10, head: 10 }, A)).toBe(10);
  });
});

describe("Meeting Agenda Topics (o, ., ,)", () => {
  it("innermostTopicSymbol and isTopicLikeLine identify topic lines", () => {
    expect(innermostTopicSymbol("o Discuss budget")).toBe("o");
    expect(innermostTopicSymbol("  . Approved budget")).toBe(".");
    expect(innermostTopicSymbol(", Postponed topic")).toBe(",");
    expect(innermostTopicSymbol("# Action item")).toBeNull();
    expect(innermostTopicSymbol("plain prose")).toBeNull();
    expect(innermostTopicSymbol("a => o b")).toBe("o");
    expect(innermostTopicSymbol("a => . b")).toBe(".");
    expect(innermostTopicSymbol("o Discuss => . resolved")).toBe(".");

    expect(isTopicLikeLine("o Topic")).toBe(true);
    expect(isTopicLikeLine("  . Topic")).toBe(true);
    expect(isTopicLikeLine(", Topic")).toBe(true);
    expect(isTopicLikeLine("# Action")).toBe(false);
  });

  it("countActions explicitly ignores topic lines (invariant)", () => {
    const text = [
      "o Discuss Q3 budget",
      ". Review marketing slide deck",
      ", Follow up with auditor",
      "  o Nested discussion point",
      "# True action task",
      "v Done action task",
    ].join("\n");
    const counts = countActions(text);
    expect(counts.open).toBe(1);
    expect(counts.closed).toBe(1);
    expect(counts.forwarded).toBe(0);
    expect(countActions("a => o b").open).toBe(0);
  });

  it("closeOpenAction and reopenDoneAction toggle topic states (o <-> .)", () => {
    expect(closeOpenAction("o Review Q3 budget")).toBe(". Review Q3 budget");
    expect(closeOpenAction("  o Indented topic")).toBe("  . Indented topic");
    expect(reopenDoneAction(". Review Q3 budget")).toBe("o Review Q3 budget");
    expect(reopenDoneAction("  . Indented topic")).toBe("  o Indented topic");
    expect(reopenDoneAction(", Postponed topic")).toBe("o Postponed topic");
    expect(reopenDeferredAction(", Postponed topic")).toBe("o Postponed topic");
  });

  it("caret column awareness on mixed lines (o Topic => # Action)", () => {
    const mixed = "o Discuss budget => # Email finance team";
    // Caret inside topic segment (e.g. col 4)
    expect(closeOpenAction(mixed, 4)).toBe(". Discuss budget => # Email finance team");
    // Caret inside action segment (e.g. col 25)
    expect(closeOpenAction(mixed, 25)).toBe("o Discuss budget => v Email finance team");

    const mixedDone = ". Discuss budget => v Email finance team";
    expect(reopenDoneAction(mixedDone, 4)).toBe("o Discuss budget => v Email finance team");
    expect(reopenDoneAction(mixedDone, 25)).toBe(". Discuss budget => # Email finance team");
  });

  it("setTopicSymbolTo sets state and promotes plain lines / lists", () => {
    expect(setTopicSymbolTo("plain text", "o")).toBe("o plain text");
    expect(setTopicSymbolTo("  indented text", ".")).toBe("  . indented text");
    expect(setTopicSymbolTo("o Existing topic", ".")).toBe(". Existing topic");
    expect(setTopicSymbolTo(". Existing topic", ",")).toBe(", Existing topic");
    expect(setTopicSymbolTo("# Action item", "o")).toBe("o Action item");
    expect(setTopicSymbolTo("1. First numbered topic", "o")).toBe("o 1. First numbered topic");
    expect(setTopicSymbolTo("- Bulleted topic", "o")).toBe("o - Bulleted topic");
    expect(setTopicSymbolTo("text => follow", "o")).toBe("text => o follow");
    expect(setTopicSymbolTo("text => @name", "o")).toBeNull();
    expect(setTopicSymbolTo("text => ", "o")).toBeNull();
  });

  it("openAgendaTopic reopens only discussed/skipped topics and leaves every other line alone", () => {
    expect(openAgendaTopic(". Discussed topic")).toBe("o Discussed topic");
    expect(openAgendaTopic(", Skipped topic")).toBe("o Skipped topic");
    expect(openAgendaTopic("  . Nested discussed")).toBe("  o Nested discussed");
    expect(openAgendaTopic("o Already open")).toBe("o Already open");
    expect(openAgendaTopic("x => , y")).toBe("x => o y");
    // Actions keep their state, and prose / bullets / a dot that is not a symbol are untouched.
    for (const line of ["v Done", "> Deferred", "x Won't do", "# Open", "- bullet", "plain. text", ".hidden", "3.5 estimate", ""]) {
      expect(openAgendaTopic(line)).toBe(line);
    }
    // Only the leading symbol: a later ". " in the text stays.
    expect(openAgendaTopic(". first. second")).toBe("o first. second");
  });

  it("topicLineEnter handles continuation for plain, numbered, and bulleted topics", () => {
    // Plain topic
    expect(topicLineEnter("o Discuss roadmap")).toEqual({ insert: "\no " });
    expect(topicLineEnter("  . Discuss roadmap")).toEqual({ insert: "\n  o " });
    expect(topicLineEnter("o ")).toEqual({ removeSymbol: true });

    // Numbered topic: increments number and always starts fresh as 'o '
    expect(topicLineEnter("o 1. First item")).toEqual({ insert: "\no 2. " });
    expect(topicLineEnter(". 1. First item")).toEqual({ insert: "\no 2. " });
    expect(topicLineEnter("  , 2.3. Sub item")).toEqual({ insert: "\n  o 2.4. " });
    expect(topicLineEnter("o 2. ")).toEqual({ removeSymbol: true });

    // Bulleted topic: continues bullet
    expect(topicLineEnter("o - Key topic")).toEqual({ insert: "\no - " });
    expect(topicLineEnter("  . * Sub bullet")).toEqual({ insert: "\n  o * " });
    expect(topicLineEnter("o - ")).toEqual({ removeSymbol: true });
  });

  it("topicContinuationIndent returns soft indentation for Shift+Enter", () => {
    expect(topicContinuationIndent("o Discuss roadmap")).toBe("  ");
    expect(topicContinuationIndent("  o Discuss roadmap")).toBe("    ");
    expect(topicContinuationIndent("o 1. First item")).toBe("     ");
    expect(topicContinuationIndent("o - Bulleted item")).toBe("    ");
  });

  it("toggleOpenClosedAtIndex and symbolAfterClick handle topics", () => {
    expect(toggleOpenClosedAtIndex("o Discuss", 0)).toBe(". Discuss");
    expect(toggleOpenClosedAtIndex(". Discuss", 0)).toBe("o Discuss");
    expect(toggleOpenClosedAtIndex(", Discuss", 0)).toBe("o Discuss");
    expect(symbolAfterClick("o")).toBe(".");
    expect(symbolAfterClick(".")).toBe("o");
    expect(symbolAfterClick(",")).toBe("o");
  });
});

describe("lineSectionRole", () => {
  const lines = ["a note line", "", "Weekly Sync", "===========", "# task", "", "Other", "=====", "o topic"];
  it("a section's title and its underline are the title", () => {
    expect(lineSectionRole(lines, 2)).toBe("title");
    expect(lineSectionRole(lines, 3)).toBe("title");
    expect(lineSectionRole(lines, 7)).toBe("title");
  });
  it("lines under a title are inside the section", () => {
    expect(lineSectionRole(lines, 4)).toBe("body");
    expect(lineSectionRole(lines, 5)).toBe("body");
    expect(lineSectionRole(lines, 8)).toBe("body");
  });
  it("lines above the first section are outside", () => {
    expect(lineSectionRole(lines, 0)).toBe("outside");
    expect(lineSectionRole(lines, 1)).toBe("outside");
  });
});

describe("stateFirst", () => {
  it("rewrites list marker then state symbol to state first", () => {
    expect(stateFirst("- # task")).toBe("# - task");
    expect(stateFirst("  * o topic")).toBe("  o * topic");
    expect(stateFirst("1. # task")).toBe("# 1. task");
    expect(stateFirst("2) v done")).toBe("v 2) done");
    expect(stateFirst("1.2. , item")).toBe(", 1.2. item");
  });

  it("returns null for unchanged cases", () => {
    expect(stateFirst("- item")).toBeNull();
    expect(stateFirst("# - task")).toBeNull();
    expect(stateFirst("text - # x")).toBeNull();
    expect(stateFirst("- #hashtag")).toBeNull();
    expect(stateFirst("1. #hashtag")).toBeNull();
    expect(stateFirst("===")).toBeNull();
    expect(stateFirst("---")).toBeNull();
  });
});

describe("listSections", () => {
  it("extracts sections with title, lineIdx, and open action count", () => {
    const text = [
      "Header 1",
      "========",
      "Some notes",
      "# action 1",
      "v closed action",
      "# action 2",
      "",
      "Header 2",
      "===",
      "v done only",
      "",
      "Header 3",
      "======",
      "# action 3",
    ].join("\n");

    const sections = listSections(text);
    expect(sections).toEqual([
      { title: "Header 1", lineIdx: 0, open: 2 },
      { title: "Header 2", lineIdx: 7, open: 0 },
      { title: "Header 3", lineIdx: 11, open: 1 },
    ]);
  });

  it("treats a '---' sub-section line as body, NOT as a section title", () => {
    const text = [
      "Main Section",
      "============",
      "Some text",
      "# main open",
      "Sub section",
      "-----------",
      "# sub open",
    ].join("\n");

    const sections = listSections(text);
    expect(sections).toEqual([
      { title: "Main Section", lineIdx: 0, open: 2 },
    ]);
  });

  it("returns empty array for empty note or note without sections", () => {
    expect(listSections("")).toEqual([]);
    expect(listSections("Just some text\nwith # an action\nand no headings")).toEqual([]);
  });
});


describe("dueItems", () => {
  it("extracts state, delegated, and assignee correctly for various action lines", () => {
    // # send the report by:2026-10-30
    expect(dueItems("# send the report by:2026-10-30")).toEqual([
      {
        lineIdx: 0,
        from: 18,
        to: 31,
        date: "2026-10-30",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // # (budget) ask finance by:2026-11-03
    expect(dueItems("# (budget) ask finance by:2026-11-03")).toEqual([
      {
        lineIdx: 0,
        from: 23,
        to: 36,
        date: "2026-11-03",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // v sent by:2026-10-20 (done actions still carry it)
    expect(dueItems("v sent by:2026-10-20")).toEqual([
      {
        lineIdx: 0,
        from: 7,
        to: 20,
        date: "2026-10-20",
        word: undefined,
        state: "v",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // > deferred by:2026-10-20
    expect(dueItems("> deferred by:2026-10-20")).toEqual([
      {
        lineIdx: 0,
        from: 11,
        to: 24,
        date: "2026-10-20",
        word: undefined,
        state: ">",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // x won't do by:2026-10-20
    expect(dueItems("x won't do by:2026-10-20")).toEqual([
      {
        lineIdx: 0,
        from: 11,
        to: 24,
        date: "2026-10-20",
        word: undefined,
        state: "x",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // . budget => # send numbers by:2026-10-28
    expect(dueItems(". budget => # send numbers by:2026-10-28")).toEqual([
      {
        lineIdx: 0,
        from: 27,
        to: 40,
        date: "2026-10-28",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // # ask Sam => he agreed by:2026-10-28
    expect(dueItems("# ask Sam => he agreed by:2026-10-28")).toEqual([
      {
        lineIdx: 0,
        from: 23,
        to: 36,
        date: "2026-10-28",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // => @dana send the slides by:2026-10-29
    expect(dueItems("=> @dana send the slides by:2026-10-29")).toEqual([
      {
        lineIdx: 0,
        from: 25,
        to: 38,
        date: "2026-10-29",
        word: undefined,
        state: null,
        delegated: true,
        assignee: "dana",
      },
    ]);

    // # a by:2026-10-30 => # b by:2026-10-31
    expect(dueItems("# a by:2026-10-30 => # b by:2026-10-31")).toEqual([
      {
        lineIdx: 0,
        from: 4,
        to: 17,
        date: "2026-10-30",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
      {
        lineIdx: 0,
        from: 25,
        to: 38,
        date: "2026-10-31",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // # a by:2026-10-30 by:2026-10-31
    expect(dueItems("# a by:2026-10-30 by:2026-10-31")).toEqual([
      {
        lineIdx: 0,
        from: 4,
        to: 17,
        date: "2026-10-30",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // # call by:fri
    expect(dueItems("# call by:fri")).toEqual([
      {
        lineIdx: 0,
        from: 7,
        to: 13,
        date: undefined,
        word: "fri",
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);

    // # call by:2026-02-30
    expect(dueItems("# call by:2026-02-30")).toEqual([
      {
        lineIdx: 0,
        from: 7,
        to: 20,
        date: undefined,
        word: "2026-02-30",
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("yields empty array for non-action lines", () => {
    expect(dueItems("o budget by:2026-10-30\n- item by:2026-10-30\nplain by:2026-10-30\n! x by:2026-10-30")).toEqual([]);
  });

  it("preserves lineIdx across multiline text", () => {
    const text = [
      "# first by:2026-10-20",
      "prose line",
      "v second by:2026-10-21",
      "=> @dana third by:2026-10-22",
    ].join("\n");
    const items = dueItems(text);
    expect(items.map((i) => i.lineIdx)).toEqual([0, 2, 3]);
  });
});

describe("countOverdue", () => {
  it("counts open own actions strictly before today; excludes done, deferred, won't-do, delegated, dueWord, today, later", () => {
    const today = "2026-10-22";
    const text = [
      "# overdue open own 1 by:2026-10-20", // COUNTED (+1)
      "# overdue open own 2 by:2026-10-21", // COUNTED (+1)
      ". topic => # consequence open by:2026-10-21", // COUNTED (+1)
      "# due today by:2026-10-22", // today -> not counted
      "# due tomorrow by:2026-10-23", // later -> not counted
      "v overdue done by:2026-10-20", // done -> not counted
      "> overdue deferred by:2026-10-20", // deferred -> not counted
      "x overdue won't do by:2026-10-20", // won't do -> not counted
      "=> @dana overdue delegated by:2026-10-20", // delegated -> not counted
      "# open with word by:fri", // dueWord -> not counted
      "o agenda topic by:2026-10-20", // topic -> not counted
      "plain prose by:2026-10-20", // prose -> not counted
    ].join("\n");

    expect(countOverdue(text, today)).toBe(3);
  });

  it("returns 0 when text has no overdue open own actions", () => {
    expect(countOverdue("# future by:2026-10-25", "2026-10-22")).toBe(0);
    expect(countOverdue("# today by:2026-10-22", "2026-10-22")).toBe(0);
    expect(countOverdue("", "2026-10-22")).toBe(0);
  });
});

describe("dueStatus", () => {
  it("classifies strictly on the boundaries", () => {
    const today = "2026-10-22";
    expect(dueStatus("2026-10-21", today)).toBe("overdue");
    expect(dueStatus("2026-10-22", today)).toBe("today");
    expect(dueStatus("2026-10-23", today)).toBe("later");
  });
});

describe("rewriteDueWords", () => {
  const fixedToday = "2026-10-22"; // Thursday
  const locale = "en";
  const extra = { today: ["today", "t"], tomorrow: ["tomorrow", "tm"] };

  it("rewrites a known word to an ISO date with fixed today", () => {
    // fri after Thu 2026-10-22 is 2026-10-23
    expect(rewriteDueWords("# call by:fri", fixedToday, locale, extra)).toBe("# call by:2026-10-23");
    expect(rewriteDueWords("# call by:tomorrow", fixedToday, locale, extra)).toBe("# call by:2026-10-23");
    expect(rewriteDueWords("# call by:today", fixedToday, locale, extra)).toBe("# call by:2026-10-22");
  });

  it("leaves unknown words untouched and returns null when nothing changed", () => {
    expect(rewriteDueWords("# call by:unknown", fixedToday, locale, extra)).toBeNull();
    expect(rewriteDueWords("# plain text without due words", fixedToday, locale, extra)).toBeNull();
  });

  it("leaves already-valid ISO due tokens untouched and returns null", () => {
    expect(rewriteDueWords("# call by:2026-10-30", fixedToday, locale, extra)).toBeNull();
  });

  it("converts uppercase By:fri to lowercase by:", () => {
    expect(rewriteDueWords("# call By:fri", fixedToday, locale, extra)).toBe("# call by:2026-10-23");
    expect(rewriteDueWords("# call BY:tomorrow", fixedToday, locale, extra)).toBe("# call by:2026-10-23");
  });

  it("rewrites several parts on one line", () => {
    const line = "# first by:fri => # second by:tomorrow";
    expect(rewriteDueWords(line, fixedToday, locale, extra)).toBe(
      "# first by:2026-10-23 => # second by:2026-10-23",
    );
  });
});

describe("withDueDate", () => {
  it("adds due date at the end of an action part", () => {
    expect(withDueDate("# task", 0, "2026-10-30")).toBe("# task by:2026-10-30");
    expect(withDueDate("=> @dana send slides", 0, "2026-10-30")).toBe("=> @dana send slides by:2026-10-30");
  });

  it("replaces an existing due or dueWord token in place", () => {
    expect(withDueDate("# task by:2026-10-15", 0, "2026-10-30")).toBe("# task by:2026-10-30");
    expect(withDueDate("# task by:fri", 0, "2026-10-30")).toBe("# task by:2026-10-30");
  });

  it("removes due token and the one space before it with null", () => {
    expect(withDueDate("# task by:2026-10-30", 0, null)).toBe("# task");
    expect(withDueDate("# task by:fri", 0, null)).toBe("# task");
  });

  it("multi-part line changes only the right part", () => {
    const line = "# part one => # part two";
    // Target part one (index 0)
    expect(withDueDate(line, 0, "2026-10-30")).toBe("# part one by:2026-10-30 => # part two");
    // Target part two (index 14, where consequence is)
    expect(withDueDate(line, 14, "2026-10-30")).toBe("# part one => # part two by:2026-10-30");

    // Replace in multi-part line
    const lineWithDates = "# part one by:2026-10-15 => # part two by:2026-10-20";
    expect(withDueDate(lineWithDates, 0, "2026-10-30")).toBe(
      "# part one by:2026-10-30 => # part two by:2026-10-20",
    );
    expect(withDueDate(lineWithDates, 30, "2026-10-30")).toBe(
      "# part one by:2026-10-15 => # part two by:2026-10-30",
    );

    // Remove in multi-part line
    expect(withDueDate(lineWithDates, 0, null)).toBe(
      "# part one => # part two by:2026-10-20",
    );
    expect(withDueDate(lineWithDates, 30, null)).toBe(
      "# part one by:2026-10-15 => # part two",
    );
  });

  it("inserts before trailing forward links", () => {
    expect(withDueDate("# task (>2026-11-01)", 0, "2026-10-30")).toBe(
      "# task by:2026-10-30 (>2026-11-01)",
    );
    expect(withDueDate("# task (>2026-11-01) (<2026-10-01)", 0, "2026-10-30")).toBe(
      "# task by:2026-10-30 (>2026-11-01) (<2026-10-01)",
    );
    // Replace with trailing forward links
    expect(withDueDate("# task by:2026-10-15 (>2026-11-01)", 0, "2026-10-30")).toBe(
      "# task by:2026-10-30 (>2026-11-01)",
    );
    // Remove with trailing forward links
    expect(withDueDate("# task by:2026-10-15 (>2026-11-01)", 0, null)).toBe(
      "# task (>2026-11-01)",
    );
  });
});
