import { describe, expect, it } from "vitest";
import { tokenizeLine, type Token } from "./tokenize";

describe("dueTokens: where a due date counts (design Syntax)", () => {
  it("recognises a due token on a leading open action line (#)", () => {
    const tokens = tokenizeLine("# send the report by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 18, to: 31, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token on a leading done action line (v)", () => {
    const tokens = tokenizeLine("v filed taxes by:2026-10-20");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "v", replaced: true },
      { kind: "due", from: 14, to: 27, date: "2026-10-20", replaced: false },
    ]);
  });

  it("recognises a due token on a leading deferred action line (>)", () => {
    const tokens = tokenizeLine("> move sprint retro by:2026-10-25");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: ">", replaced: true },
      { kind: "due", from: 20, to: 33, date: "2026-10-25", replaced: false },
    ]);
  });

  it("recognises a due token on a leading won't-do action line (x)", () => {
    const tokens = tokenizeLine("x drop old architecture by:2026-10-15");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "x", replaced: true },
      { kind: "due", from: 24, to: 37, date: "2026-10-15", replaced: false },
    ]);
  });

  it("recognises a due token in an open consequence action (=> #)", () => {
    const tokens = tokenizeLine("spoke to team => # write spec by:2026-10-28");
    expect(tokens).toEqual([
      { kind: "arrow", from: 14, to: 17, replaced: true },
      { kind: "consequence", from: 17, to: 19, symbol: "#", replaced: true },
      { kind: "due", from: 30, to: 43, date: "2026-10-28", replaced: false },
    ]);
  });

  it("recognises a due token in a done consequence action (=> v)", () => {
    const tokens = tokenizeLine(". budget => v pay invoice by:2026-10-28");
    expect(tokens).toEqual([
      { kind: "topic", from: 0, to: 2, symbol: ".", replaced: true },
      { kind: "arrow", from: 9, to: 12, replaced: true },
      { kind: "consequence", from: 12, to: 14, symbol: "v", replaced: true },
      { kind: "due", from: 26, to: 39, date: "2026-10-28", replaced: false },
    ]);
  });

  it("recognises a due token in a deferred consequence action (=> >)", () => {
    const tokens = tokenizeLine("# task => > postpone by:2026-11-01");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "arrow", from: 7, to: 10, replaced: true },
      { kind: "consequence", from: 10, to: 12, symbol: ">", replaced: true },
      { kind: "due", from: 21, to: 34, date: "2026-11-01", replaced: false },
    ]);
  });

  it("recognises a due token in a won't-do consequence action (=> x)", () => {
    const tokens = tokenizeLine("# task => x cancel by:2026-11-02");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "arrow", from: 7, to: 10, replaced: true },
      { kind: "consequence", from: 10, to: 12, symbol: "x", replaced: true },
      { kind: "due", from: 19, to: 32, date: "2026-11-02", replaced: false },
    ]);
  });

  it("recognises a due token in a leading delegated action (=> @name)", () => {
    const tokens = tokenizeLine("=> @dana send the slides by:2026-10-29");
    expect(tokens).toEqual([
      { kind: "arrow", from: 0, to: 3, replaced: true },
      { kind: "assignee", from: 3, to: 8, replaced: false },
      { kind: "due", from: 25, to: 38, date: "2026-10-29", replaced: false },
    ]);
  });

  it("recognises a due token in a follow-up delegated action after text", () => {
    const tokens = tokenizeLine("aligned on scope => @sam deliver prototype by:2026-11-10");
    expect(tokens).toEqual([
      { kind: "arrow", from: 17, to: 20, replaced: true },
      { kind: "assignee", from: 20, to: 24, replaced: false },
      { kind: "due", from: 43, to: 56, date: "2026-11-10", replaced: false },
    ]);
  });

  it("recognises a due token at the start of an action part", () => {
    const tokens = tokenizeLine("# by:2026-10-30 submit final draft");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 2, to: 15, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token in the middle of an action part", () => {
    const tokens = tokenizeLine("# deliver by:2026-10-30 to client");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 10, to: 23, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises only the first due token per action part", () => {
    const tokens = tokenizeLine("# draft by:2026-10-20 revise by:2026-10-25");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 8, to: 21, date: "2026-10-20", replaced: false },
    ]);
  });

  it("recognises one due token in each action part of a line", () => {
    const tokens = tokenizeLine("# prep by:2026-10-20 => # review by:2026-10-25 => @dana publish by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 7, to: 20, date: "2026-10-20", replaced: false },
      { kind: "arrow", from: 21, to: 24, replaced: true },
      { kind: "consequence", from: 24, to: 26, symbol: "#", replaced: true },
      { kind: "due", from: 33, to: 46, date: "2026-10-25", replaced: false },
      { kind: "arrow", from: 47, to: 50, replaced: true },
      { kind: "assignee", from: 50, to: 55, replaced: false },
      { kind: "due", from: 64, to: 77, date: "2026-10-30", replaced: false },
    ]);
  });

  it("allows a plain => text follow-up to inherit the action part and carry the due date", () => {
    const tokens = tokenizeLine("# write proposal => submit by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "arrow", from: 17, to: 20, replaced: true },
      { kind: "due", from: 27, to: 40, date: "2026-10-30", replaced: false },
    ]);
  });

  it("treats plain => text follow-up as the same part so a second by: does not count", () => {
    const tokens = tokenizeLine("# write proposal by:2026-10-20 => submit by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 17, to: 30, date: "2026-10-20", replaced: false },
      { kind: "arrow", from: 31, to: 34, replaced: true },
    ]);
  });

  it("ignores by: on topic lines (o, ., ,)", () => {
    for (const line of [
      "o team sync by:2026-10-30",
      ". budget meeting by:2026-10-30",
      ", deferred discussion by:2026-10-30",
    ]) {
      const tokens = tokenizeLine(line);
      expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    }
  });

  it("ignores by: on bullet lines (- and *)", () => {
    for (const line of ["- item detail by:2026-10-30", "* star item by:2026-10-30"]) {
      const tokens = tokenizeLine(line);
      expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    }
  });

  it("ignores by: on standalone emphasis lines", () => {
    const tokens = tokenizeLine("! urgent announcement by:2026-10-30");
    expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
  });

  it("ignores by: on plain prose lines", () => {
    const tokens = tokenizeLine("plain prose talking about something by:2026-10-30");
    expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
  });

  it("ignores by: in a topic follow-up (=> o, => ., => ,)", () => {
    for (const line of [
      "# action => o raise discussion by:2026-10-30",
      "# action => . discuss later by:2026-10-30",
      "# action => , skip topic by:2026-10-30",
    ]) {
      const tokens = tokenizeLine(line);
      expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    }
  });

  it("ignores by: inside brackets (by:...)", () => {
    const tokens = tokenizeLine("# task (by:2026-10-30) review notes");
    expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "paren", from: 7, to: 22, replaced: false },
    ]);
  });

  it("ignores by: glued to a preceding word", () => {
    for (const line of [
      "# nearby:2026-10-30 task",
      "# standby:2026-10-30 task",
      "# ruby:2026-10-30 task",
    ]) {
      const tokens = tokenizeLine(line);
      expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    }
  });

  it("recognises a due token on indented action lines", () => {
    const tokens = tokenizeLine("    # indented action by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 4, to: 6, symbol: "#", replaced: true },
      { kind: "due", from: 22, to: 35, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token on actions with a topic tag", () => {
    const tokens = tokenizeLine("# (budget) prepare Q4 forecast by:2026-11-03");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "topicTag", from: 2, to: 10, replaced: false },
      { kind: "due", from: 31, to: 44, date: "2026-11-03", replaced: false },
    ]);
  });

  it("recognises a due token on actions with a bullet", () => {
    const tokens = tokenizeLine("# - sub-item task by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "bullet", from: 2, to: 4, symbol: "-", replaced: true },
      { kind: "due", from: 18, to: 31, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token on actions with emphasis", () => {
    const tokens = tokenizeLine("# ! urgent task by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "emphasis", from: 2, to: 29, symbol: "!", replaced: false },
      { kind: "due", from: 16, to: 29, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token on lines with forward links", () => {
    const tokens = tokenizeLine("# sync (>2026-10-14#Weekly Sync) by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "forwardLink", from: 7, to: 32, dir: ">", date: "2026-10-14", section: "Weekly Sync", replaced: false },
      { kind: "due", from: 33, to: 46, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token on lines with bare @names", () => {
    const tokens = tokenizeLine("# check with @alice by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "assignee", from: 13, to: 19, replaced: false },
      { kind: "due", from: 20, to: 33, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token on lines with email addresses", () => {
    const tokens = tokenizeLine("# email contact@example.com by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 28, to: 41, date: "2026-10-30", replaced: false },
    ]);
  });

  it("recognises a due token on lines with URLs", () => {
    const tokens = tokenizeLine("# verify https://example.com/api by:2026-10-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 33, to: 46, date: "2026-10-30", replaced: false },
    ]);
  });

  it("strips trailing sentence-ending period from the token", () => {
    const tokens = tokenizeLine("# send report by:2026-10-30.");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 14, to: 27, date: "2026-10-30", replaced: false },
    ]);
  });

  it("strips trailing comma from the token", () => {
    const tokens = tokenizeLine("# send report by:2026-10-30, please");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 14, to: 27, date: "2026-10-30", replaced: false },
    ]);
  });

  it("strips trailing semicolon from the token", () => {
    const tokens = tokenizeLine("# send report by:2026-10-30; next step");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 14, to: 27, date: "2026-10-30", replaced: false },
    ]);
  });

  it("is case-insensitive for by: (BY:, By:, bY:)", () => {
    for (const prefix of ["BY:", "By:", "bY:"]) {
      const line = `# send report ${prefix}2026-10-30`;
      const tokens = tokenizeLine(line);
      expect(tokens).toEqual([
        { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
        { kind: "due", from: 14, to: 27, date: "2026-10-30", replaced: false },
      ]);
    }
  });

  it("produces dueWord token for non-date text after by:", () => {
    const tokens = tokenizeLine("# call client by:tomorrow");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "dueWord", from: 14, to: 25, word: "tomorrow", replaced: false },
    ]);
  });

  it("produces dueWord token for weekday shortcut by:fri", () => {
    const tokens = tokenizeLine("# send invoice by:fri");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "dueWord", from: 15, to: 21, word: "fri", replaced: false },
    ]);
  });

  it("produces dueWord token for relative offset by:+3", () => {
    const tokens = tokenizeLine("# review draft by:+3");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "dueWord", from: 15, to: 20, word: "+3", replaced: false },
    ]);
  });

  it("produces dueWord token for week shorthand by:wk44", () => {
    const tokens = tokenizeLine("# finish project by:wk44");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "dueWord", from: 17, to: 24, word: "wk44", replaced: false },
    ]);
  });

  it("produces dueWord token for calendar-invalid ISO date (2026-02-30)", () => {
    const tokens = tokenizeLine("# deadline by:2026-02-30");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "dueWord", from: 11, to: 24, word: "2026-02-30", replaced: false },
    ]);
  });
});

describe("dueTokens: grammar of existing lines does not change", () => {
  const scenarioLines: string[] = [
    "Top priorities",
    "==============",
    "# finish the delegation write-up",
    "Talked to Priya => # send the recap email",
    "=> @Priya draft the migration plan",
    "=> @Dana review the API shape",
    "v agreed on the rollout order",
    "=> keep the plain-text guarantee — no DB",
    "- today: chase the cert renewal",
    "# chase the signing cert renewal",
    "=> @Marco confirm the CI matrix",
    "x drop the Linux build for now",
    "> book the user-testing sessions",
    "# scope the Q3 roadmap doc",
    "- reviewed last quarter's metrics",
    "! Board update is due end of month — don't forget",
    "# (interviews) schedule two more candidate calls",
    "* good: shipped the sync retry fix ahead of schedule",
    "# (sync) decide on the conflict-resolution strategy",
  ];

  it("produces unchanged tokens for lines without by:", () => {
    expect(scenarioLines.length).toBeGreaterThanOrEqual(15);
    for (const line of scenarioLines) {
      const tokens = tokenizeLine(line);
      // None of the lines without by: should have due or dueWord tokens
      expect(tokens.some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    }
  });

  it("leaves all existing tokens and offsets unchanged when appending by: to action lines", () => {
    const actionLines = [
      "# finish the delegation write-up",
      "Talked to Priya => # send the recap email",
      "=> @Priya draft the migration plan",
      "=> @Dana review the API shape",
      "v agreed on the rollout order",
      "# chase the signing cert renewal",
      "=> @Marco confirm the CI matrix",
      "x drop the Linux build for now",
      "> book the user-testing sessions",
      "# scope the Q3 roadmap doc",
      "# (interviews) schedule two more candidate calls",
      "# (sync) decide on the conflict-resolution strategy",
      "    # indented task",
      "# - bullet item action",
      "# check with @alice about release",
    ];
    expect(actionLines.length).toBeGreaterThanOrEqual(15);

    for (const line of actionLines) {
      const originalTokens = tokenizeLine(line);
      const withDueLine = `${line} by:2026-10-30`;
      const withDueTokens = tokenizeLine(withDueLine);

      // Verify a due token was added
      const dueTokens = withDueTokens.filter((t) => t.kind === "due");
      expect(dueTokens.length).toBe(1);
      expect(dueTokens[0].date).toBe("2026-10-30");

      // Verify that all original tokens are identical in kind, offsets, symbol, replaced
      const nonDueTokens = withDueTokens.filter((t) => t.kind !== "due" && t.kind !== "dueWord");
      expect(nonDueTokens).toEqual(originalTokens);
    }
  });
});

describe("fixed suspected bugs", () => {
  // Documented behaviour: Brief line 39: "Punctuation after the date at a sentence end is not part of the token."
  // What the code does instead: src/lib/grammar/tokenize.ts line 224: rawWord.replace(/[).,;]+$/, "") only strips
  // ), ., ,, ;. An exclamation mark `!` is not stripped, so "2026-10-30!" fails isValidCalendarDate and produces
  // a dueWord token with word: "2026-10-30!" instead of a due token with date: "2026-10-30".
  it("sentence-ending exclamation mark is not part of the due token", () => {
    const tokens = tokenizeLine("# finish urgently by:2026-10-30!");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 18, to: 31, date: "2026-10-30", replaced: false },
    ]);
  });

  // Documented behaviour: Brief line 39: "Punctuation after the date at a sentence end is not part of the token."
  // What the code does instead: src/lib/grammar/tokenize.ts line 224: question mark `?` is not stripped by
  // rawWord.replace(/[).,;]+$/, ""). "2026-10-30?" becomes a dueWord token with word: "2026-10-30?"
  // instead of a due token with date: "2026-10-30".
  it("sentence-ending question mark is not part of the due token", () => {
    const tokens = tokenizeLine("# can you review by:2026-10-30?");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 17, to: 30, date: "2026-10-30", replaced: false },
    ]);
  });
});
