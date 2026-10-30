import { describe, expect, it } from "vitest";
import {
  applyAddLine,
  applySetState,
  parseInbox,
  validateRequest,
  type AddLineRequest,
  type PhoneState,
  type SetStateRequest,
} from "./phoneInboxApply";

const NOTE = ["Day line", "", "Weekly", "======", "# a", "# b", "", "Other", "=====", "# a", ""].join("\n");

function setState(line: string, n: number, state: PhoneState, section?: string): SetStateRequest {
  return { id: "r1", type: "setState", date: "2026-10-30", ...(section !== undefined ? { section } : {}), line, n, state };
}

function addLine(text: string, section?: string): AddLineRequest {
  return { id: "r1", type: "addLine", date: "2026-10-30", ...(section !== undefined ? { section } : {}), text };
}

function appliedText(out: ReturnType<typeof applySetState>): string {
  if (out.result !== "applied") throw new Error(`not applied: ${JSON.stringify(out)}`);
  return out.text;
}

describe("parseInbox", () => {
  it("parses an object with a numeric format and a requests array", () => {
    expect(parseInbox('{"format":1,"writer":"x","requests":[{"id":"a"},3]}')).toEqual({
      format: 1,
      requests: [{ id: "a" }, 3],
    });
  });
  it("strips a leading BOM", () => {
    expect(parseInbox("\uFEFF" + '{"format":2,"requests":[]}')).toEqual({ format: 2, requests: [] });
  });
  it("gives null for null, broken JSON and values of the wrong shape", () => {
    expect(parseInbox(null)).toBeNull();
    expect(parseInbox("{nope")).toBeNull();
    expect(parseInbox("")).toBeNull();
    expect(parseInbox("[]")).toBeNull();
    expect(parseInbox("null")).toBeNull();
    expect(parseInbox('{"requests":[]}')).toBeNull();
    expect(parseInbox('{"format":"1","requests":[]}')).toBeNull();
    expect(parseInbox('{"format":1}')).toBeNull();
    expect(parseInbox('{"format":1,"requests":{}}')).toBeNull();
  });
});

describe("validateRequest", () => {
  const add = { id: "a1", type: "addLine", date: "2026-10-30", section: "Weekly", text: "o hiring plan" };
  const set = { id: "s1", type: "setState", date: "2026-10-22", line: "# x", n: 7, state: "done" };

  it("accepts a good addLine and setState, ignoring extra fields", () => {
    expect(validateRequest({ ...add, made: "2026-10-29T08:02:11+01:00", extra: 1 })).toEqual({
      ok: true,
      request: { ...add, made: "2026-10-29T08:02:11+01:00" },
    });
    expect(validateRequest({ ...set, writer: "x" })).toEqual({ ok: true, request: set });
  });
  it("accepts a request without section", () => {
    const { section: _s, ...noSection } = add;
    expect(validateRequest(noSection)).toEqual({ ok: true, request: noSection });
  });
  it("cannot report a request without a usable id", () => {
    expect(validateRequest({ ...add, id: "" })).toEqual({ ok: false, id: null });
    expect(validateRequest({ ...add, id: 5 })).toEqual({ ok: false, id: null });
    expect(validateRequest({ type: "addLine" })).toEqual({ ok: false, id: null });
    expect(validateRequest(null)).toEqual({ ok: false, id: null });
    expect(validateRequest("x")).toEqual({ ok: false, id: null });
    expect(validateRequest([])).toEqual({ ok: false, id: null });
  });
  it("rejects an unknown type", () => {
    expect(validateRequest({ ...add, type: "deleteLine" })).toEqual({ ok: false, id: "a1" });
    expect(validateRequest({ id: "z" })).toEqual({ ok: false, id: "z" });
  });
  it("rejects a date that is not a real calendar date YYYY-MM-DD", () => {
    for (const date of ["2026-02-30", "2026-13-01", "2026-1-5", "30-10-2026", "2026-10-30T00:00", "", 20261030, undefined]) {
      expect(validateRequest({ ...add, date })).toEqual({ ok: false, id: "a1" });
    }
    expect(validateRequest({ ...add, date: "2028-02-29" }).ok).toBe(true);
  });
  it("rejects a section that is present but not a string", () => {
    expect(validateRequest({ ...add, section: 3 })).toEqual({ ok: false, id: "a1" });
    expect(validateRequest({ ...add, section: null })).toEqual({ ok: false, id: "a1" });
  });
  it("rejects an addLine text that is not one non-empty line of at most 1000 characters", () => {
    for (const text of [undefined, 5, "", "   ", "two\nlines", "cr\rhere", "x".repeat(1001)]) {
      expect(validateRequest({ ...add, text })).toEqual({ ok: false, id: "a1" });
    }
    expect(validateRequest({ ...add, text: "x".repeat(1000) }).ok).toBe(true);
  });
  it("rejects a setState with a bad line, n or state", () => {
    expect(validateRequest({ ...set, line: 3 })).toEqual({ ok: false, id: "s1" });
    expect(validateRequest({ ...set, line: undefined })).toEqual({ ok: false, id: "s1" });
    for (const n of [0, -1, 1.5, "7", null, NaN]) expect(validateRequest({ ...set, n })).toEqual({ ok: false, id: "s1" });
    for (const state of ["deferred", "DONE", "", 1, undefined]) {
      expect(validateRequest({ ...set, state })).toEqual({ ok: false, id: "s1" });
    }
    for (const state of ["open", "done", "wontdo", "discussed", "postponed"]) {
      expect(validateRequest({ ...set, state }).ok).toBe(true);
    }
  });
});

describe("applySetState", () => {
  it("rule 1: one equal line in the section is the target; only its symbol changes", () => {
    const out = applySetState(NOTE, setState("# b", 6, "done", "Weekly"));
    expect(out).toEqual({ result: "applied", changed: true, text: NOTE.replace("# b", "v b") });
  });

  it("looks only in the named section: an equal line in another section is left alone", () => {
    const text = appliedText(applySetState(NOTE, setState("# a", 5, "wontdo", "Weekly")));
    expect(text).toBe(NOTE.replace("# a\n# b", "x a\n# b"));
    expect(text.split("\n")[9]).toBe("# a"); // Other's line
    const other = appliedText(applySetState(NOTE, setState("# a", 10, "done", "Other")));
    expect(other.split("\n")[4]).toBe("# a");
    expect(other.split("\n")[9]).toBe("v a");
  });

  it("rule 1: with several equal lines the one at line number n is the target", () => {
    const note = "Weekly\n======\n# a\n# a\n# a\n";
    expect(appliedText(applySetState(note, setState("# a", 4, "done", "Weekly")))).toBe("Weekly\n======\n# a\nv a\n# a\n");
    expect(appliedText(applySetState(note, setState("# a", 3, "done", "Weekly")))).toBe("Weekly\n======\nv a\n# a\n# a\n");
  });

  it("rule 1: several equal lines, none at n, is a lineAmbiguous conflict", () => {
    const note = "Weekly\n======\n# a\n# a\n";
    expect(applySetState(note, setState("# a", 9, "done", "Weekly"))).toEqual({ result: "conflict", reason: "lineAmbiguous" });
    // n pointing at an equal line of another section does not count
    const two = "Weekly\n======\n# a\n# a\nOther\n=====\n# a\n";
    expect(applySetState(two, setState("# a", 7, "done", "Weekly"))).toEqual({ result: "conflict", reason: "lineAmbiguous" });
  });

  it("rule 2: no equal line, one differing only in its symbol and already in the state: applied unchanged", () => {
    const note = "Weekly\n======\nv b\n";
    expect(applySetState(note, setState("# b", 3, "done", "Weekly"))).toEqual({ result: "applied", text: note, changed: false });
    const topics = "Weekly\n======\n  . item (>2026-11-05#X)\n";
    expect(applySetState(topics, setState("  o item (>2026-11-05#X)", 3, "discussed", "Weekly"))).toEqual({
      result: "applied",
      text: topics,
      changed: false,
    });
  });

  it("rule 2: an action request never matches a topic with the same text, or the reverse", () => {
    const changed = { result: "conflict", reason: "lineChanged" };
    expect(applySetState("Weekly\n======\no b\n", setState("# b", 3, "open", "Weekly"))).toEqual(changed);
    expect(applySetState("Weekly\n======\n# b\n", setState("o b", 3, "open", "Weekly"))).toEqual(changed);
    // A topic with the same text beside the action doesn't hide that the action is done already.
    const both = "Weekly\n======\nv b\no b\n";
    expect(applySetState(both, setState("# b", 3, "done", "Weekly"))).toEqual({ result: "applied", text: both, changed: false });
  });

  it("rule 2: the line is in another state, absent, or one of several: lineChanged", () => {
    const changed = { result: "conflict", reason: "lineChanged" };
    expect(applySetState("Weekly\n======\nx b\n", setState("# b", 3, "done", "Weekly"))).toEqual(changed);
    expect(applySetState("Weekly\n======\n> b\n", setState("# b", 3, "done", "Weekly"))).toEqual(changed);
    expect(applySetState("Weekly\n======\n# c\n", setState("# b", 3, "done", "Weekly"))).toEqual(changed);
    expect(applySetState("Weekly\n======\nv b\nv b\n", setState("# b", 3, "done", "Weekly"))).toEqual(changed);
    // the text, indentation or prefix differs, not only the symbol
    expect(applySetState("Weekly\n======\nv b!\n", setState("# b", 3, "done", "Weekly"))).toEqual(changed);
    expect(applySetState("Weekly\n======\n  v b\n", setState("# b", 3, "done", "Weekly"))).toEqual(changed);
    expect(applySetState("Weekly\n======\n=> v b\n", setState("# b", 3, "done", "Weekly"))).toEqual(changed);
    // a line without any state symbol has nothing to compare
    expect(applySetState("Weekly\n======\nplain two\n", setState("plain", 3, "done", "Weekly"))).toEqual(changed);
  });

  it("rule 3: a missing section, a missing day part content or an empty note is a lineChanged conflict", () => {
    const changed = { result: "conflict", reason: "lineChanged" };
    expect(applySetState(NOTE, setState("# a", 5, "done", "Nope"))).toEqual(changed);
    expect(applySetState("", setState("# a", 1, "done", "Weekly"))).toEqual(changed);
    expect(applySetState("", setState("# a", 1, "done"))).toEqual(changed);
    expect(applySetState(NOTE, setState("# a", 5, "done"))).toEqual(changed); // "# a" is not in the day part
  });

  it("never matches the title or underline lines", () => {
    expect(applySetState(NOTE, setState("Weekly", 3, "open", "Weekly"))).toEqual({ result: "conflict", reason: "lineChanged" });
    expect(applySetState(NOTE, setState("======", 4, "open", "Weekly"))).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("targets the day part when the request has no section: the lines before the first title", () => {
    const note = "# top\n\nWeekly\n======\n# top\n";
    expect(appliedText(applySetState(note, setState("# top", 1, "done")))).toBe("v top\n\nWeekly\n======\n# top\n");
    expect(appliedText(applySetState(note, setState("# top", 5, "done", "Weekly")))).toBe("# top\n\nWeekly\n======\nv top\n");
  });

  it("matches section titles as Section History does (time range, [CANCELED], dates, case)", () => {
    const note = "[09:00 - 09:30] Weekly Sync\n===========================\n# a\n";
    expect(appliedText(applySetState(note, setState("# a", 3, "done", "weekly sync 2026-10-30")))).toBe(
      "[09:00 - 09:30] Weekly Sync\n===========================\nv a\n",
    );
    expect(appliedText(applySetState(note, setState("# a", 3, "done", "  [CANCELED] WEEKLY SYNC ")))).toContain("v a");
  });

  it("uses the first matching section", () => {
    const note = "Weekly\n======\n# a\n\nweekly\n======\n# a\n";
    expect(appliedText(applySetState(note, setState("# a", 7, "done", "Weekly")))).toBe("Weekly\n======\nv a\n\nweekly\n======\n# a\n");
  });

  it("rule 4: only an action or topic that is not deferred, and a state that fits its kind", () => {
    const rejected = { result: "rejected", reason: "invalid" };
    const note = (line: string) => `Weekly\n======\n${line}\n`;
    expect(applySetState(note("just text"), setState("just text", 3, "done", "Weekly"))).toEqual(rejected);
    expect(applySetState(note("- bullet"), setState("- bullet", 3, "open", "Weekly"))).toEqual(rejected);
    expect(applySetState(note("> forwarded"), setState("> forwarded", 3, "open", "Weekly"))).toEqual(rejected);
    expect(applySetState(note("# a"), setState("# a", 3, "discussed", "Weekly"))).toEqual(rejected);
    expect(applySetState(note("# a"), setState("# a", 3, "postponed", "Weekly"))).toEqual(rejected);
    expect(applySetState(note("o t"), setState("o t", 3, "done", "Weekly"))).toEqual(rejected);
    expect(applySetState(note("o t"), setState("o t", 3, "wontdo", "Weekly"))).toEqual(rejected);
    expect(applySetState(note("=> @bob call"), setState("=> @bob call", 3, "done", "Weekly"))).toEqual(rejected);
  });

  it("maps every state to its symbol, for actions and topics", () => {
    const cases: [string, PhoneState, string][] = [
      ["# a", "done", "v a"],
      ["v a", "open", "# a"],
      ["# a", "wontdo", "x a"],
      ["x a", "open", "# a"],
      ["x a", "done", "v a"],
      ["o t", "discussed", ". t"],
      [". t", "postponed", ", t"],
      [", t", "open", "o t"],
      [". t", "open", "o t"],
    ];
    for (const [line, state, expected] of cases) {
      const out = applySetState(`Weekly\n======\n${line}\n`, setState(line, 3, state, "Weekly"));
      expect(appliedText(out)).toBe(`Weekly\n======\n${expected}\n`);
    }
  });

  it("rule 5: a target already in the state is applied without change", () => {
    const note = "Weekly\n======\nv a\n";
    expect(applySetState(note, setState("v a", 3, "done", "Weekly"))).toEqual({ result: "applied", text: note, changed: false });
    expect(applySetState("Weekly\n======\n# a\n", setState("# a", 3, "open", "Weekly"))).toMatchObject({ changed: false });
  });

  it("changes a leading `=> ` consequence action: `=> # call` becomes `=> v call`", () => {
    const note = "Weekly\n======\n=> # call\n";
    expect(appliedText(applySetState(note, setState("=> # call", 3, "done", "Weekly")))).toBe("Weekly\n======\n=> v call\n");
    const topic = "Weekly\n======\n=> o plan\n";
    expect(appliedText(applySetState(topic, setState("=> o plan", 3, "discussed", "Weekly")))).toBe("Weekly\n======\n=> . plan\n");
    expect(applySetState("Weekly\n======\n  => # call\n", setState("  => # call", 3, "done", "Weekly"))).toMatchObject({
      text: "Weekly\n======\n  => v call\n",
    });
  });

  it("keeps indentation and links, and changes only the first symbol", () => {
    const line = "  # a (>2026-11-05#X)";
    const out = applySetState(`Weekly\n======\n${line}\n`, setState(line, 3, "done", "Weekly"));
    expect(appliedText(out)).toBe("Weekly\n======\n  v a (>2026-11-05#X)\n");
    const two = "# a => # b";
    expect(appliedText(applySetState(`Weekly\n======\n${two}\n`, setState(two, 3, "done", "Weekly")))).toBe("Weekly\n======\nv a => # b\n");
  });

  it("changes nothing but the one line, and keeps a missing final newline", () => {
    const note = "Day\n\nWeekly\n======\n# a\n\nOther\n=====\n# a";
    const text = appliedText(applySetState(note, setState("# a", 5, "done", "Weekly")));
    const before = note.split("\n");
    const after = text.split("\n");
    expect(after).toHaveLength(before.length);
    after.forEach((l, i) => expect(l).toBe(i === 4 ? "v a" : before[i]));
    expect(text.endsWith("\n")).toBe(false);
  });
});

describe("applyAddLine", () => {
  const text = (o: ReturnType<typeof applyAddLine>): string => {
    if (o.result !== "applied") throw new Error("not applied");
    expect(o.changed).toBe(true);
    return o.text;
  };

  it("inserts after the last non-blank line of the section", () => {
    expect(text(applyAddLine(NOTE, addLine("o new", "Weekly"), []))).toBe(
      ["Day line", "", "Weekly", "======", "# a", "# b", "o new", "", "Other", "=====", "# a", ""].join("\n"),
    );
    expect(text(applyAddLine(NOTE, addLine("o new", "Other"), []))).toBe(NOTE + "o new\n");
  });

  it("inserts directly after the underline when the body is empty or blank", () => {
    expect(text(applyAddLine("A\n===\nB\n===\n# x\n", addLine("new", "A"), []))).toBe("A\n===\nnew\nB\n===\n# x\n");
    expect(text(applyAddLine("A\n===\n\n\nB\n===\n# x\n", addLine("new", "A"), []))).toBe("A\n===\nnew\n\n\nB\n===\n# x\n");
    expect(text(applyAddLine("A\n===\n", addLine("new", "A"), []))).toBe("A\n===\nnew\n");
  });

  it("finds the section with Section History's matching and uses the first match", () => {
    const note = "[09:00 - 09:30] Weekly Sync\n===========================\n# a\n\nWeekly Sync\n===========\n# b\n";
    expect(text(applyAddLine(note, addLine("new", "weekly sync 2026-10-30"), []))).toBe(
      "[09:00 - 09:30] Weekly Sync\n===========================\n# a\nnew\n\nWeekly Sync\n===========\n# b\n",
    );
  });

  it("without section: after the last non-blank line before the first title", () => {
    expect(text(applyAddLine(NOTE, addLine("note to self"), []))).toBe(
      ["Day line", "note to self", "", "Weekly", "======", "# a", "# b", "", "Other", "=====", "# a", ""].join("\n"),
    );
    expect(text(applyAddLine("one\ntwo\n", addLine("three"), []))).toBe("one\ntwo\nthree\n");
    expect(text(applyAddLine("one\n\n\n", addLine("two"), []))).toBe("one\ntwo\n\n\n");
  });

  it("without section and an empty day part: first line of the note, then a blank line when a title follows", () => {
    expect(text(applyAddLine("Weekly\n======\n# a\n", addLine("first"), []))).toBe("first\n\nWeekly\n======\n# a\n");
    expect(text(applyAddLine("\nWeekly\n======\n# a\n", addLine("first"), []))).toBe("first\n\nWeekly\n======\n# a\n");
    expect(text(applyAddLine("\n\n", addLine("first"), []))).toBe("first\n\n\n");
  });

  it("a missing section is created at the end: blank line, title, underline, line", () => {
    expect(text(applyAddLine("Day\n", addLine("o x", "Standup"), []))).toBe("Day\n\nStandup\n=======\no x\n");
    expect(text(applyAddLine("Day\n\n", addLine("o x", "Standup"), []))).toBe("Day\n\nStandup\n=======\no x\n");
    expect(text(applyAddLine("Day\n\n\n", addLine("o x", "Standup"), []))).toBe("Day\n\n\nStandup\n=======\no x\n");
    expect(text(applyAddLine("Day\n", addLine("o x", "  A  "), []))).toBe("Day\n\nA\n===\no x\n"); // trimmed, underline of 3 at least
  });

  it("an empty note becomes the section, or just the line, ending with a newline", () => {
    expect(text(applyAddLine("", addLine("o x", "Standup"), []))).toBe("Standup\n=======\no x\n");
    expect(text(applyAddLine("", addLine("o x"), []))).toBe("o x\n");
  });

  it("places a new section in agenda order: before the first existing section of a later agenda meeting", () => {
    const note = "A\n===\n# a\n\nC\n===\n# c\n\nD\n===\n# d\n";
    expect(text(applyAddLine(note, addLine("new", "B"), ["A", "B", "C", "D"]))).toBe(
      "A\n===\n# a\n\nB\n===\nnew\n\nC\n===\n# c\n\nD\n===\n# d\n",
    );
    // the first one in the note whose agenda position is later wins, whatever its place in the agenda
    const reordered = "A\n===\n# a\n\nD\n===\n# d\n\nC\n===\n# c\n";
    expect(text(applyAddLine(reordered, addLine("new", "B"), ["A", "B", "C", "D"]))).toBe(
      "A\n===\n# a\n\nB\n===\nnew\n\nD\n===\n# d\n\nC\n===\n# c\n",
    );
  });

  it("agenda placement adds a blank line before only when the line above is not blank, and works at the top", () => {
    expect(text(applyAddLine("C\n===\n# c\n", addLine("new", "B"), ["B", "C"]))).toBe("B\n===\nnew\n\nC\n===\n# c\n");
    expect(text(applyAddLine("A\n===\n# a\nC\n===\n# c\n", addLine("new", "B"), ["A", "B", "C"]))).toBe(
      "A\n===\n# a\n\nB\n===\nnew\n\nC\n===\n# c\n",
    );
  });

  it("goes to the end when the meeting is not in the agenda, or no later agenda meeting has a section", () => {
    const note = "A\n===\n# a\n\nC\n===\n# c\n";
    expect(text(applyAddLine(note, addLine("new", "B"), ["A", "C"]))).toBe(note + "\nB\n===\nnew\n");
    expect(text(applyAddLine(note, addLine("new", "B"), []))).toBe(note + "\nB\n===\nnew\n");
    expect(text(applyAddLine(note, addLine("new", "B"), ["C", "B"]))).toBe(note + "\nB\n===\nnew\n"); // only C is earlier
  });

  it("compares agenda titles with the same matching as sections", () => {
    const note = "[10:00 - 11:00] Planning 2026-10-30\n===================================\n# p\n";
    expect(text(applyAddLine(note, addLine("new", "[09:00 - 09:30] standup"), ["Standup", "planning"]))).toBe(
      "[09:00 - 09:30] standup\n=======================\nnew\n\n" + note,
    );
  });

  it("never changes any other line", () => {
    const note = "Day\n\nA\n===\n# a\n\nC\n===\n# c\n";
    for (const [req, agenda] of [
      [addLine("new", "A"), []],
      [addLine("new"), []],
      [addLine("new", "B"), ["B", "C"]],
      [addLine("new", "Z"), []],
    ] as const) {
      const out = text(applyAddLine(note, req, [...agenda]));
      const kept = out.split("\n").filter((l) => !["new", "B", "Z", "==="].includes(l) || note.split("\n").includes(l));
      // every original line is still there, in order
      let at = 0;
      for (const l of note.split("\n")) {
        at = kept.indexOf(l, at);
        expect(at).toBeGreaterThanOrEqual(0);
        at++;
      }
      expect(out.split("\n").length).toBeGreaterThan(note.split("\n").length);
    }
  });
});
