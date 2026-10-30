import { describe, it, expect } from "vitest";
import {
  stateKindOf,
  sectionStateLines,
  applyStateAtLine,
  lineWithState,
  type LineKind,
  type PhoneState,
  type ApplyOutcome,
} from "./phoneInboxApply";

describe("stateKindOf", () => {
  it("identifies action state lines at start of line", () => {
    expect(stateKindOf("# open action")).toBe("action");
    expect(stateKindOf("v done action")).toBe("action");
    expect(stateKindOf("x wontdo action")).toBe("action");
  });

  it("identifies action state lines with leading indentation", () => {
    expect(stateKindOf("  # indented open")).toBe("action");
    expect(stateKindOf("    v indented done")).toBe("action");
    expect(stateKindOf("\tx indented wontdo")).toBe("action");
  });

  it("identifies consequence action lines (=> )", () => {
    expect(stateKindOf("=> # consequence open")).toBe("action");
    expect(stateKindOf("=> v consequence done")).toBe("action");
    expect(stateKindOf("=> x consequence wontdo")).toBe("action");
    expect(stateKindOf("  => # indented consequence action")).toBe("action");
  });

  it("identifies topic state lines at start of line", () => {
    expect(stateKindOf("o open topic")).toBe("topic");
    expect(stateKindOf(". discussed topic")).toBe("topic");
    expect(stateKindOf(", postponed topic")).toBe("topic");
  });

  it("identifies topic state lines with leading indentation", () => {
    expect(stateKindOf("  o indented open topic")).toBe("topic");
    expect(stateKindOf("    . indented discussed topic")).toBe("topic");
    expect(stateKindOf("  , indented postponed topic")).toBe("topic");
  });

  it("identifies consequence topic lines (=> )", () => {
    expect(stateKindOf("=> o consequence open topic")).toBe("topic");
    expect(stateKindOf("=> . consequence discussed topic")).toBe("topic");
    expect(stateKindOf("=> , consequence postponed topic")).toBe("topic");
    expect(stateKindOf("  => o indented consequence topic")).toBe("topic");
  });

  it("returns null for non-state lines (bullets, plain text, empty)", () => {
    expect(stateKindOf("- bullet item")).toBeNull();
    expect(stateKindOf("* star item")).toBeNull();
    expect(stateKindOf("plain text line")).toBeNull();
    expect(stateKindOf("")).toBeNull();
    expect(stateKindOf("   ")).toBeNull();
    expect(stateKindOf("1. numbered item")).toBeNull();
    expect(stateKindOf("Meeting Title")).toBeNull();
    expect(stateKindOf("=============")).toBeNull();
  });
});

describe("sectionStateLines", () => {
  const note = [
    "# day action 1",
    "plain day note",
    "o day topic 1",
    "> day deferred action",
    "",
    "Planning",
    "========",
    "# call the venue",
    "Discuss logistics with the team",
    "v book the room",
    "- follow up later",
    "o catering options",
    "> send invites",
    ". choose menu",
    "",
    "[14:00 - 15:00] Review",
    "----------------------",
    "# prepare slides",
    ", next steps",
  ].join("\n");

  it("extracts state lines of a section in note order, excluding deferred (>), bullets, and plain lines", () => {
    const lines = sectionStateLines(note, "Planning");
    expect(lines).toEqual([
      { line: 7, text: "# call the venue", kind: "action" },
      { line: 9, text: "v book the room", kind: "action" },
      { line: 11, text: "o catering options", kind: "topic" },
      { line: 13, text: ". choose menu", kind: "topic" },
    ]);
  });

  it("preserves exact text including indentation and consequence arrows", () => {
    const nestedNote = [
      "Sprint",
      "======",
      "  # indented action",
      "  => o consequence topic",
      "  => v consequence action",
    ].join("\n");

    const lines = sectionStateLines(nestedNote, "Sprint");
    expect(lines).toEqual([
      { line: 2, text: "  # indented action", kind: "action" },
      { line: 3, text: "  => o consequence topic", kind: "topic" },
      { line: 4, text: "  => v consequence action", kind: "action" },
    ]);
  });

  it("matches section names ignoring case and leading time range", () => {
    // case insensitive match
    const lowerMatch = sectionStateLines(note, "planning");
    expect(lowerMatch).not.toBeNull();
    expect(lowerMatch?.length).toBe(4);

    // matching section with leading time range in note: "[14:00 - 15:00] Review"
    const reviewMatch = sectionStateLines(note, "Review");
    expect(reviewMatch).toEqual([
      { line: 17, text: "# prepare slides", kind: "action" },
      { line: 18, text: ", next steps", kind: "topic" },
    ]);

    const reviewMatchLower = sectionStateLines(note, "review");
    expect(reviewMatchLower).toEqual([
      { line: 17, text: "# prepare slides", kind: "action" },
      { line: 18, text: ", next steps", kind: "topic" },
    ]);
  });

  it("returns day part lines (before first title) when section is undefined or empty string", () => {
    const expectedDayLines = [
      { line: 0, text: "# day action 1", kind: "action" },
      { line: 2, text: "o day topic 1", kind: "topic" },
    ];

    expect(sectionStateLines(note, undefined)).toEqual(expectedDayLines);
    expect(sectionStateLines(note, "")).toEqual(expectedDayLines);
  });

  it("returns [] for day part when no state lines exist before first title", () => {
    const titleAtStart = [
      "Planning",
      "========",
      "# action",
    ].join("\n");
    expect(sectionStateLines(titleAtStart, undefined)).toEqual([]);
    expect(sectionStateLines(titleAtStart, "")).toEqual([]);
  });

  it("returns [] for an existing section with no state lines", () => {
    const emptySectionNote = [
      "Retro",
      "=====",
      "plain discussion only",
      "- bullet point",
      "> deferred item",
    ].join("\n");

    expect(sectionStateLines(emptySectionNote, "Retro")).toEqual([]);
  });

  it("returns null when section is not in the note", () => {
    expect(sectionStateLines(note, "Nonexistent Section")).toBeNull();
  });

  it("never includes lines belonging to another section", () => {
    const lines = sectionStateLines(note, "Planning");
    expect(lines?.some((l) => l.text.includes("prepare slides"))).toBe(false);
    expect(lines?.some((l) => l.text.includes("day action"))).toBe(false);
  });
});

describe("applyStateAtLine", () => {
  it("sets action state from open to done, keeping indentation and rest of note byte-identical", () => {
    const note = "Intro\n  # call the venue\nEnd\n";
    const result = applyStateAtLine(note, 1, "done");
    expect(result).toEqual({
      result: "applied",
      text: "Intro\n  v call the venue\nEnd\n",
      changed: true,
    });
  });

  it("sets action state from done to wontdo", () => {
    const note = "v book the room\n";
    const result = applyStateAtLine(note, 0, "wontdo");
    expect(result).toEqual({
      result: "applied",
      text: "x book the room\n",
      changed: true,
    });
  });

  it("sets action state from wontdo to open", () => {
    const note = "x cancel booking\n";
    const result = applyStateAtLine(note, 0, "open");
    expect(result).toEqual({
      result: "applied",
      text: "# cancel booking\n",
      changed: true,
    });
  });

  it("updates consequence action lines correctly", () => {
    const note = "=> # next action\n";
    const result = applyStateAtLine(note, 0, "done");
    expect(result).toEqual({
      result: "applied",
      text: "=> v next action\n",
      changed: true,
    });
  });

  it("sets topic state from open to postponed", () => {
    const note = "o catering options\n";
    const result = applyStateAtLine(note, 0, "postponed");
    expect(result).toEqual({
      result: "applied",
      text: ", catering options\n",
      changed: true,
    });
  });

  it("sets topic state from open to discussed", () => {
    const note = "  o budget discussion\n";
    const result = applyStateAtLine(note, 0, "discussed");
    expect(result).toEqual({
      result: "applied",
      text: "  . budget discussion\n",
      changed: true,
    });
  });

  it("sets topic state from postponed or discussed back to open", () => {
    const note = ", postponed topic\n. discussed topic\n";
    const r1 = applyStateAtLine(note, 0, "open");
    expect(r1).toEqual({
      result: "applied",
      text: "o postponed topic\n. discussed topic\n",
      changed: true,
    });

    const r2 = applyStateAtLine(note, 1, "open");
    expect(r2).toEqual({
      result: "applied",
      text: ", postponed topic\no discussed topic\n",
      changed: true,
    });
  });

  it("returns applied with changed: false and same text when already in that state", () => {
    const note = "v already done\n";
    const result = applyStateAtLine(note, 0, "done");
    expect(result).toEqual({
      result: "applied",
      text: "v already done\n",
      changed: false,
    });

    const topicNote = ". already discussed\n";
    const topicResult = applyStateAtLine(topicNote, 0, "discussed");
    expect(topicResult).toEqual({
      result: "applied",
      text: ". already discussed\n",
      changed: false,
    });
  });

  it("rejects when the line has no state symbol", () => {
    const note = "plain line\n- bullet item\n\n";
    expect(applyStateAtLine(note, 0, "done")).toEqual({ result: "rejected", reason: "invalid" });
    expect(applyStateAtLine(note, 1, "done")).toEqual({ result: "rejected", reason: "invalid" });
    expect(applyStateAtLine(note, 2, "open")).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("rejects when the line is deferred (>)", () => {
    const note = "> deferred action\n=> > deferred consequence\n";
    expect(applyStateAtLine(note, 0, "done")).toEqual({ result: "rejected", reason: "invalid" });
    expect(applyStateAtLine(note, 0, "open")).toEqual({ result: "rejected", reason: "invalid" });
    expect(applyStateAtLine(note, 1, "done")).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("rejects when the state does not fit the line's kind", () => {
    // done / wontdo on a topic
    expect(applyStateAtLine("o topic\n", 0, "done")).toEqual({ result: "rejected", reason: "invalid" });
    expect(applyStateAtLine("o topic\n", 0, "wontdo")).toEqual({ result: "rejected", reason: "invalid" });

    // discussed / postponed on an action
    expect(applyStateAtLine("# action\n", 0, "discussed")).toEqual({ result: "rejected", reason: "invalid" });
    expect(applyStateAtLine("# action\n", 0, "postponed")).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("rejects when line index is out of bounds", () => {
    const note = "# action\n";
    expect(applyStateAtLine(note, -1, "done")).toEqual({ result: "rejected", reason: "invalid" });
    expect(applyStateAtLine(note, 5, "done")).toEqual({ result: "rejected", reason: "invalid" });
  });
});

describe("lineWithState", () => {
  it("changes action state symbols correctly", () => {
    expect(lineWithState("# a", "done")).toBe("v a");
    expect(lineWithState("  # a", "done")).toBe("  v a");
    expect(lineWithState("v a", "open")).toBe("# a");
    expect(lineWithState("v a", "wontdo")).toBe("x a");
    expect(lineWithState("x a", "open")).toBe("# a");
    expect(lineWithState("=> # c", "wontdo")).toBe("=> x c");
    expect(lineWithState("  => # c", "done")).toBe("  => v c");
  });

  it("changes topic state symbols correctly", () => {
    expect(lineWithState("  o b", "discussed")).toBe("  . b");
    expect(lineWithState("o b", "postponed")).toBe(", b");
    expect(lineWithState(". b", "open")).toBe("o b");
    expect(lineWithState(", b", "discussed")).toBe(". b");
    expect(lineWithState("=> o c", "postponed")).toBe("=> , c");
  });

  it("returns identical line when already in requested state", () => {
    expect(lineWithState("v a", "done")).toBe("v a");
    expect(lineWithState("# a", "open")).toBe("# a");
    expect(lineWithState("o b", "open")).toBe("o b");
    expect(lineWithState(". b", "discussed")).toBe(". b");
  });

  it("returns null when state does not match line kind", () => {
    expect(lineWithState("# a", "discussed")).toBeNull();
    expect(lineWithState("# a", "postponed")).toBeNull();
    expect(lineWithState("o b", "done")).toBeNull();
    expect(lineWithState("o b", "wontdo")).toBeNull();
  });

  it("returns null for non-state lines and deferred lines", () => {
    expect(lineWithState("- a", "done")).toBeNull();
    expect(lineWithState("plain text", "done")).toBeNull();
    expect(lineWithState("", "open")).toBeNull();
    expect(lineWithState("> deferred", "done")).toBeNull();
    expect(lineWithState("=> > deferred", "done")).toBeNull();
  });
});
