import { describe, expect, it } from "vitest";
import {
  applyAddLine,
  applySetState,
  parseInbox,
  validateRequest,
  type AddLineRequest,
  type SetStateRequest,
} from "./phoneInboxApply";

function makeAddLine(overrides: Partial<AddLineRequest> = {}): AddLineRequest {
  return {
    id: "req-add-1",
    date: "2026-10-30",
    type: "addLine",
    text: "# new task",
    ...overrides,
  };
}

function makeSetState(overrides: Partial<SetStateRequest> = {}): SetStateRequest {
  return {
    id: "req-state-1",
    date: "2026-10-30",
    type: "setState",
    line: "# send numbers",
    n: 1,
    state: "done",
    ...overrides,
  };
}

describe("parseInbox", () => {
  it("returns null when text is null", () => {
    expect(parseInbox(null)).toBeNull();
  });

  it("returns null for empty string or malformed JSON syntax", () => {
    expect(parseInbox("")).toBeNull();
    expect(parseInbox("not json")).toBeNull();
    expect(parseInbox("{ format: 1 }")).toBeNull();
    expect(parseInbox('{"format": 1,')).toBeNull();
  });

  it("parses valid JSON with format and empty requests array", () => {
    expect(parseInbox('{"format":1,"requests":[]}')).toEqual({ format: 1, requests: [] });
  });

  it("parses valid JSON with populated requests array", () => {
    const raw = JSON.stringify({
      format: 1,
      requests: [{ id: "req-1", type: "addLine", date: "2026-10-30", text: "# task" }],
    });
    expect(parseInbox(raw)).toEqual({
      format: 1,
      requests: [{ id: "req-1", type: "addLine", date: "2026-10-30", text: "# task" }],
    });
  });

  it("ignores a leading UTF-8 BOM (\\uFEFF)", () => {
    const withBom = '\uFEFF{"format":1,"requests":[]}';
    expect(parseInbox(withBom)).toEqual({ format: 1, requests: [] });
  });

  it("returns null when format is missing or not a number", () => {
    expect(parseInbox('{"requests":[]}')).toBeNull();
    expect(parseInbox('{"format":"1","requests":[]}')).toBeNull();
    expect(parseInbox('{"format":null,"requests":[]}')).toBeNull();
    expect(parseInbox('{"format":true,"requests":[]}')).toBeNull();
    expect(parseInbox('{"format":{},"requests":[]}')).toBeNull();
  });

  it("returns null when requests is missing or not an array", () => {
    expect(parseInbox('{"format":1}')).toBeNull();
    expect(parseInbox('{"format":1,"requests":null}')).toBeNull();
    expect(parseInbox('{"format":1,"requests":"[]"}')).toBeNull();
    expect(parseInbox('{"format":1,"requests":{}}')).toBeNull();
    expect(parseInbox('{"format":1,"requests":123}')).toBeNull();
  });

  it("returns null when top-level JSON is not an object", () => {
    expect(parseInbox('"hello"')).toBeNull();
    expect(parseInbox("123")).toBeNull();
    expect(parseInbox("true")).toBeNull();
    expect(parseInbox("null")).toBeNull();
    expect(parseInbox('[{"format":1,"requests":[]}]')).toBeNull();
  });

  it("accepts additional root-level properties", () => {
    const raw = '{"format":1,"requests":[],"version":"2.0"}';
    expect(parseInbox(raw)).toMatchObject({ format: 1, requests: [] });
  });
});

describe("validateRequest", () => {
  it("rejects non-object inputs with id: null", () => {
    expect(validateRequest(null)).toEqual({ ok: false, id: null });
    expect(validateRequest(undefined)).toEqual({ ok: false, id: null });
    expect(validateRequest("request")).toEqual({ ok: false, id: null });
    expect(validateRequest(42)).toEqual({ ok: false, id: null });
    expect(validateRequest(true)).toEqual({ ok: false, id: null });
    expect(validateRequest([])).toEqual({ ok: false, id: null });
  });

  it("rejects missing or empty id with id: null", () => {
    expect(validateRequest({})).toEqual({ ok: false, id: null });
    expect(validateRequest({ id: "" })).toEqual({ ok: false, id: null });
    expect(validateRequest({ id: 123 })).toEqual({ ok: false, id: null });
    expect(validateRequest({ id: null })).toEqual({ ok: false, id: null });
  });

  it("rejects unknown or missing request type", () => {
    expect(validateRequest({ id: "req-1", type: "deleteLine", date: "2026-10-30" })).toEqual({
      ok: false,
      id: "req-1",
    });
    expect(validateRequest({ id: "req-2", date: "2026-10-30" })).toEqual({
      ok: false,
      id: "req-2",
    });
    expect(validateRequest({ id: "req-3", type: "", date: "2026-10-30" })).toEqual({
      ok: false,
      id: "req-3",
    });
  });

  it("rejects invalid calendar date 2026-02-30", () => {
    expect(
      validateRequest({
        id: "req-date-1",
        type: "addLine",
        date: "2026-02-30",
        text: "# buy milk",
      }),
    ).toEqual({ ok: false, id: "req-date-1" });
  });

  it("rejects unpadded date 2026-1-5", () => {
    expect(
      validateRequest({
        id: "req-date-2",
        type: "addLine",
        date: "2026-1-5",
        text: "# buy milk",
      }),
    ).toEqual({ ok: false, id: "req-date-2" });
  });

  it("rejects non-existent leap day in non-leap year (2026-02-29)", () => {
    expect(
      validateRequest({
        id: "req-date-3",
        type: "addLine",
        date: "2026-02-29",
        text: "# buy milk",
      }),
    ).toEqual({ ok: false, id: "req-date-3" });
  });

  it("rejects invalid month numbers (2026-13-01 or 2026-00-10)", () => {
    expect(
      validateRequest({
        id: "req-date-4",
        type: "addLine",
        date: "2026-13-01",
        text: "# buy milk",
      }),
    ).toEqual({ ok: false, id: "req-date-4" });
    expect(
      validateRequest({
        id: "req-date-5",
        type: "addLine",
        date: "2026-00-10",
        text: "# buy milk",
      }),
    ).toEqual({ ok: false, id: "req-date-5" });
  });

  it("rejects missing or non-string date", () => {
    expect(
      validateRequest({
        id: "req-date-6",
        type: "addLine",
        text: "# buy milk",
      }),
    ).toEqual({ ok: false, id: "req-date-6" });
    expect(
      validateRequest({
        id: "req-date-7",
        type: "addLine",
        date: 20261030,
        text: "# buy milk",
      }),
    ).toEqual({ ok: false, id: "req-date-7" });
  });

  it("rejects non-string section", () => {
    expect(
      validateRequest({
        id: "req-sec-1",
        type: "addLine",
        date: "2026-10-30",
        text: "# task",
        section: 123,
      }),
    ).toEqual({ ok: false, id: "req-sec-1" });
    expect(
      validateRequest({
        id: "req-sec-2",
        type: "addLine",
        date: "2026-10-30",
        text: "# task",
        section: true,
      }),
    ).toEqual({ ok: false, id: "req-sec-2" });
    expect(
      validateRequest({
        id: "req-sec-3",
        type: "addLine",
        date: "2026-10-30",
        text: "# task",
        section: {},
      }),
    ).toEqual({ ok: false, id: "req-sec-3" });
  });

  it("addLine: rejects empty text", () => {
    expect(
      validateRequest({
        id: "req-add-text-1",
        type: "addLine",
        date: "2026-10-30",
        text: "",
      }),
    ).toEqual({ ok: false, id: "req-add-text-1" });
  });

  it("addLine: rejects text with only spaces", () => {
    expect(
      validateRequest({
        id: "req-add-text-2",
        type: "addLine",
        date: "2026-10-30",
        text: "     ",
      }),
    ).toEqual({ ok: false, id: "req-add-text-2" });
  });

  it("addLine: rejects text containing newline (\\n) or carriage return (\\r)", () => {
    expect(
      validateRequest({
        id: "req-add-text-3",
        type: "addLine",
        date: "2026-10-30",
        text: "line one\nline two",
      }),
    ).toEqual({ ok: false, id: "req-add-text-3" });
    expect(
      validateRequest({
        id: "req-add-text-4",
        type: "addLine",
        date: "2026-10-30",
        text: "line one\rline two",
      }),
    ).toEqual({ ok: false, id: "req-add-text-4" });
  });

  it("addLine: rejects text with 1001 characters", () => {
    expect(
      validateRequest({
        id: "req-add-text-5",
        type: "addLine",
        date: "2026-10-30",
        text: "a".repeat(1001),
      }),
    ).toEqual({ ok: false, id: "req-add-text-5" });
  });

  it("addLine: accepts text with exactly 1000 characters", () => {
    const raw = {
      id: "req-add-text-6",
      type: "addLine",
      date: "2026-10-30",
      text: "a".repeat(1000),
    };
    expect(validateRequest(raw)).toEqual({ ok: true, request: raw });
  });

  it("addLine: rejects missing or non-string text", () => {
    expect(
      validateRequest({
        id: "req-add-text-7",
        type: "addLine",
        date: "2026-10-30",
      }),
    ).toEqual({ ok: false, id: "req-add-text-7" });
    expect(
      validateRequest({
        id: "req-add-text-8",
        type: "addLine",
        date: "2026-10-30",
        text: 12345,
      }),
    ).toEqual({ ok: false, id: "req-add-text-8" });
  });

  it("setState: rejects n of 0", () => {
    expect(
      validateRequest({
        id: "req-state-n-1",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 0,
        state: "done",
      }),
    ).toEqual({ ok: false, id: "req-state-n-1" });
  });

  it("setState: rejects non-integer n of 1.5", () => {
    expect(
      validateRequest({
        id: "req-state-n-2",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 1.5,
        state: "done",
      }),
    ).toEqual({ ok: false, id: "req-state-n-2" });
  });

  it("setState: rejects string n of '3'", () => {
    expect(
      validateRequest({
        id: "req-state-n-3",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: "3",
        state: "done",
      }),
    ).toEqual({ ok: false, id: "req-state-n-3" });
  });

  it("setState: rejects negative or non-finite n", () => {
    expect(
      validateRequest({
        id: "req-state-n-4",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: -1,
        state: "done",
      }),
    ).toEqual({ ok: false, id: "req-state-n-4" });
    expect(
      validateRequest({
        id: "req-state-n-5",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: NaN,
        state: "done",
      }),
    ).toEqual({ ok: false, id: "req-state-n-5" });
  });

  it("setState: rejects invalid state 'closed'", () => {
    expect(
      validateRequest({
        id: "req-state-s-1",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 1,
        state: "closed",
      }),
    ).toEqual({ ok: false, id: "req-state-s-1" });
  });

  it("setState: rejects unknown or empty state strings", () => {
    expect(
      validateRequest({
        id: "req-state-s-2",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 1,
        state: "todo",
      }),
    ).toEqual({ ok: false, id: "req-state-s-2" });
    expect(
      validateRequest({
        id: "req-state-s-3",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 1,
        state: "",
      }),
    ).toEqual({ ok: false, id: "req-state-s-3" });
  });

  it("setState: rejects missing or non-string state", () => {
    expect(
      validateRequest({
        id: "req-state-s-4",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 1,
      }),
    ).toEqual({ ok: false, id: "req-state-s-4" });
    expect(
      validateRequest({
        id: "req-state-s-5",
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 1,
        state: 1,
      }),
    ).toEqual({ ok: false, id: "req-state-s-5" });
  });

  it("setState: rejects missing or non-string line", () => {
    expect(
      validateRequest({
        id: "req-state-l-1",
        type: "setState",
        date: "2026-10-30",
        n: 1,
        state: "done",
      }),
    ).toEqual({ ok: false, id: "req-state-l-1" });
    expect(
      validateRequest({
        id: "req-state-l-2",
        type: "setState",
        date: "2026-10-30",
        line: 123,
        n: 1,
        state: "done",
      }),
    ).toEqual({ ok: false, id: "req-state-l-2" });
  });

  it("accepts all valid phone states", () => {
    for (const st of ["open", "done", "wontdo", "discussed", "postponed"] as const) {
      const raw = {
        id: `req-st-${st}`,
        type: "setState",
        date: "2026-10-30",
        line: "# task",
        n: 2,
        state: st,
      };
      expect(validateRequest(raw)).toEqual({ ok: true, request: raw });
    }
  });

  it("accepts valid addLine request with optional fields", () => {
    const raw = {
      id: "req-valid-add",
      type: "addLine",
      date: "2026-10-30",
      text: "# buy groceries",
      made: "2026-10-30T08:00:00Z",
      section: "Personal",
    };
    expect(validateRequest(raw)).toEqual({ ok: true, request: raw });
  });

  it("accepts valid setState request with optional fields", () => {
    const raw = {
      id: "req-valid-state",
      type: "setState",
      date: "2026-10-30",
      line: "# review pull request",
      n: 5,
      state: "done" as const,
      made: "2026-10-30T08:00:00Z",
      section: "Standup",
    };
    expect(validateRequest(raw)).toEqual({ ok: true, request: raw });
  });

  // Unknown fields are ignored (the format guide): whether they are kept on the request doesn't matter.
  it("accepts extra unknown fields on valid requests", () => {
    const rawAdd = {
      id: "req-extra-add",
      type: "addLine",
      date: "2026-10-30",
      text: "# task",
      clientVersion: "1.2.3",
      device: "Pixel 9",
    };
    expect(validateRequest(rawAdd)).toMatchObject({
      ok: true,
      request: { id: "req-extra-add", type: "addLine", date: "2026-10-30", text: "# task" },
    });

    const rawState = {
      id: "req-extra-state",
      type: "setState",
      date: "2026-10-30",
      line: "# task",
      n: 1,
      state: "done" as const,
      customMeta: { urgent: true },
    };
    expect(validateRequest(rawState)).toMatchObject({
      ok: true,
      request: { id: "req-extra-state", type: "setState", date: "2026-10-30", line: "# task", n: 1, state: "done" },
    });
  });
});

describe("applySetState", () => {
  it("Rule 1: changes # send numbers in Weekly Sync to v send numbers with changed: true", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", n: 3, state: "done" });
    const expected = [
      "Weekly Sync",
      "===========",
      "v send numbers",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 1: changes action state from open (#) to wontdo (x)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", n: 3, state: "wontdo" });
    const expected = [
      "Weekly Sync",
      "===========",
      "x send numbers",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 1: changes action state from done (v) to open (#)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "v send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "v send numbers", n: 3, state: "open" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# send numbers",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 2: exact text found once in section updates that line regardless of n mismatch", () => {
    const note = [
      "# day note",
      "",
      "Weekly Sync",
      "===========",
      "# first line",
      "# unique target",
      "# third line",
    ].join("\n");
    // # unique target is line 6 in note, but request passes n: 999
    const req = makeSetState({ section: "Weekly Sync", line: "# unique target", n: 999, state: "done" });
    const expected = [
      "# day note",
      "",
      "Weekly Sync",
      "===========",
      "# first line",
      "v unique target",
      "# third line",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 3: duplicate text updates the occurrence whose 1-based note line equals n (first match)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# repeated item", // line 3
      "# middle item",   // line 4
      "# repeated item", // line 5
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# repeated item", n: 3, state: "done" });
    const expected = [
      "Weekly Sync",
      "===========",
      "v repeated item",
      "# middle item",
      "# repeated item",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 3: duplicate text updates the occurrence whose 1-based note line equals n (second match)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# repeated item", // line 3
      "# middle item",   // line 4
      "# repeated item", // line 5
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# repeated item", n: 5, state: "done" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# repeated item",
      "# middle item",
      "v repeated item",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 3: duplicate text returns conflict lineAmbiguous when n matches neither occurrence", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# repeated item", // line 3
      "# middle item",   // line 4
      "# repeated item", // line 5
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# repeated item", n: 4, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "conflict", reason: "lineAmbiguous" });
  });

  it("Rule 4: equal line in another section is ignored when target section lacks it (conflict lineChanged)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# task only here",
      "",
      "Planning",
      "========",
      "# planning item",
    ].join("\n");
    const req = makeSetState({ section: "Planning", line: "# task only here", n: 3, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("Rule 4: modifies line in target section without touching identical line in another section", () => {
    const note = [
      "Standup",
      "=======",
      "# sync status",
      "",
      "Planning",
      "========",
      "# sync status",
    ].join("\n");
    const req = makeSetState({ section: "Planning", line: "# sync status", n: 7, state: "done" });
    const expected = [
      "Standup",
      "=======",
      "# sync status",
      "",
      "Planning",
      "========",
      "v sync status",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 5: applies with changed: false when line is already in requested state (action: note has v a, req # a -> done)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "v send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", n: 3, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: false, text: note });
  });

  it("Rule 5: applies with changed: false when topic is already in requested state (topic: note has . a, req o a -> discussed)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      ". roadmap topic",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "o roadmap topic", n: 3, state: "discussed" });
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: false, text: note });
  });

  it("Rule 6: returns conflict lineChanged when symbol-variant is in a different state (note has x a, req done for # a)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "x send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", n: 3, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("Rule 6: returns conflict lineChanged when target line was reworded", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# send finalized numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", n: 3, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("Rule 6: returns conflict lineChanged when target line was deleted", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# other item",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", n: 3, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("Rule 7: returns conflict lineChanged when target section does not exist in note", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# send numbers",
    ].join("\n");
    const req = makeSetState({ section: "NonExistentSection", line: "# send numbers", n: 3, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("Rule 7: returns conflict lineChanged when note is completely empty", () => {
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", n: 1, state: "done" });
    expect(applySetState("", req)).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("Rule 8: targets the day part (before first section title) when section is omitted", () => {
    const note = [
      "# day task 1",
      "# day task 2",
      "",
      "Weekly Sync",
      "===========",
      "# meeting task",
    ].join("\n");
    const req = makeSetState({ section: undefined, line: "# day task 2", n: 2, state: "done" });
    const expected = [
      "# day task 1",
      "v day task 2",
      "",
      "Weekly Sync",
      "===========",
      "# meeting task",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 8: returns conflict lineChanged when section is omitted but target line is only inside a section", () => {
    const note = [
      "# day task 1",
      "",
      "Weekly Sync",
      "===========",
      "# meeting task",
    ].join("\n");
    const req = makeSetState({ section: undefined, line: "# meeting task", n: 5, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "conflict", reason: "lineChanged" });
  });

  it("Rule 8: works on a note consisting only of day part lines without any section titles", () => {
    const note = [
      "# day task 1",
      "# day task 2",
    ].join("\n");
    const req = makeSetState({ section: undefined, line: "# day task 1", n: 1, state: "done" });
    const expected = [
      "v day task 1",
      "# day task 2",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 9: rejects deferred action (> a) as invalid", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "> deferred action",
    ].join("\n");
    const reqDone = makeSetState({ section: "Weekly Sync", line: "> deferred action", state: "done" });
    const reqOpen = makeSetState({ section: "Weekly Sync", line: "> deferred action", state: "open" });
    expect(applySetState(note, reqDone)).toEqual({ result: "rejected", reason: "invalid" });
    expect(applySetState(note, reqOpen)).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("Rule 9: rejects bullet line (- a) as invalid", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "- bullet point",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "- bullet point", state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("Rule 9: rejects plain text line without state symbol as invalid", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "just plain text without marker",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "just plain text without marker", state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("Rule 9: rejects done state on a topic", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "o topic item",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "o topic item", state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("Rule 9: rejects wontdo state on a topic", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "o topic item",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "o topic item", state: "wontdo" });
    expect(applySetState(note, req)).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("Rule 9: rejects discussed state on an action", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# action item",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# action item", state: "discussed" });
    expect(applySetState(note, req)).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("Rule 9: rejects postponed state on an action", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# action item",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# action item", state: "postponed" });
    expect(applySetState(note, req)).toEqual({ result: "rejected", reason: "invalid" });
  });

  it("Rule 9: allows open state on an action (v -> #)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "v action item",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "v action item", state: "open" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# action item",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 9: allows open state on a topic (. -> o and , -> o)", () => {
    const noteDiscussed = [
      "Weekly Sync",
      "===========",
      ". discussed item",
    ].join("\n");
    const reqDiscussed = makeSetState({ section: "Weekly Sync", line: ". discussed item", state: "open" });
    const expectedOpen = [
      "Weekly Sync",
      "===========",
      "o discussed item",
    ].join("\n");
    expect(applySetState(noteDiscussed, reqDiscussed)).toEqual({ result: "applied", changed: true, text: expectedOpen });

    const notePostponed = [
      "Weekly Sync",
      "===========",
      ", postponed item",
    ].join("\n");
    const reqPostponed = makeSetState({ section: "Weekly Sync", line: ", postponed item", state: "open" });
    const expectedOpen2 = [
      "Weekly Sync",
      "===========",
      "o postponed item",
    ].join("\n");
    expect(applySetState(notePostponed, reqPostponed)).toEqual({ result: "applied", changed: true, text: expectedOpen2 });
  });

  it("Rule 10: applies with changed: false when line is already in requested state (line: 'v a', state: 'done')", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "v already finished",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "v already finished", n: 3, state: "done" });
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: false, text: note });
  });

  it("Rule 10: applies with changed: false when topic line is already in requested state (line: '. a', state: 'discussed')", () => {
    const note = [
      "Weekly Sync",
      "===========",
      ". already discussed",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: ". already discussed", n: 3, state: "discussed" });
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: false, text: note });
  });

  it("Rule 11: preserves delegation prefix (=> # call Sam -> => v call Sam)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "=> # call Sam",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "=> # call Sam", state: "done" });
    const expected = [
      "Weekly Sync",
      "===========",
      "=> v call Sam",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 11: preserves leading indentation and link (  # a (>2026-11-05#X))", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "  # a (>2026-11-05#X)",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "  # a (>2026-11-05#X)", state: "done" });
    const expected = [
      "Weekly Sync",
      "===========",
      "  v a (>2026-11-05#X)",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 11: preserves combined indentation and delegation", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "    => # indented delegation",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "    => # indented delegation", state: "wontdo" });
    const expected = [
      "Weekly Sync",
      "===========",
      "    => x indented delegation",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 12: transitions topic from open to discussed (o hiring -> . hiring)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "o hiring",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "o hiring", state: "discussed" });
    const expected = [
      "Weekly Sync",
      "===========",
      ". hiring",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 12: transitions topic from open to postponed (o hiring -> , hiring)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "o hiring",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "o hiring", state: "postponed" });
    const expected = [
      "Weekly Sync",
      "===========",
      ", hiring",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 12: transitions topic from discussed to open (. hiring -> o hiring)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      ". hiring",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: ". hiring", state: "open" });
    const expected = [
      "Weekly Sync",
      "===========",
      "o hiring",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 12: transitions topic from postponed to open (, hiring -> o hiring)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      ", hiring",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: ", hiring", state: "open" });
    const expected = [
      "Weekly Sync",
      "===========",
      "o hiring",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 12: transitions topic from postponed to discussed (, hiring -> . hiring)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      ", hiring",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: ", hiring", state: "discussed" });
    const expected = [
      "Weekly Sync",
      "===========",
      ". hiring",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 13: matches section title with leading time range decoration ([09:00 - 09:30] Weekly Sync)", () => {
    const note = [
      "[09:00 - 09:30] Weekly Sync",
      "===========================",
      "# send numbers",
    ].join("\n");
    const req = makeSetState({ section: "weekly sync", line: "# send numbers", state: "done" });
    const expected = [
      "[09:00 - 09:30] Weekly Sync",
      "===========================",
      "v send numbers",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 13: matches section title with leading [CANCELED] decoration", () => {
    const note = [
      "[CANCELED] Weekly Sync",
      "======================",
      "# send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", state: "done" });
    const expected = [
      "[CANCELED] Weekly Sync",
      "======================",
      "v send numbers",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 13: matches section title with trailing date (weekly sync 2026-10-29)", () => {
    const note = [
      "weekly sync 2026-10-29",
      "======================",
      "# send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", state: "done" });
    const expected = [
      "weekly sync 2026-10-29",
      "======================",
      "v send numbers",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 13: matches section title with leading date and separator (2026-10-29: Weekly Sync)", () => {
    const note = [
      "2026-10-29: Weekly Sync",
      "=======================",
      "# send numbers",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# send numbers", state: "done" });
    const expected = [
      "2026-10-29: Weekly Sync",
      "=======================",
      "v send numbers",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Section sub-headings: lines under a sub-heading (---) remain inside the section and can be updated", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "Subtopic Alpha",
      "--------------",
      "# subtopic task",
    ].join("\n");
    const req = makeSetState({ section: "Weekly Sync", line: "# subtopic task", state: "done" });
    const expected = [
      "Weekly Sync",
      "===========",
      "Subtopic Alpha",
      "--------------",
      "v subtopic task",
    ].join("\n");
    expect(applySetState(note, req)).toEqual({ result: "applied", changed: true, text: expected });
  });
});

describe("applyAddLine", () => {
  it("Rule 1: appends line after the last non-blank line of an existing section body", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# first item",
    ].join("\n");
    const req = makeAddLine({ section: "Weekly Sync", text: "# second item" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# first item",
      "# second item",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 1: preserves trailing blank lines of the section after the newly added line", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# first item",
      "",
      "",
      "Next Section",
      "============",
      "# other item",
    ].join("\n");
    const req = makeAddLine({ section: "Weekly Sync", text: "# second item" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# first item",
      "# second item",
      "",
      "",
      "Next Section",
      "============",
      "# other item",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 1: inserts directly after the underline when the section body is completely empty", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "Next Section",
      "============",
      "# other item",
    ].join("\n");
    const req = makeAddLine({ section: "Weekly Sync", text: "# first item" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# first item",
      "Next Section",
      "============",
      "# other item",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 1: inserts directly after underline before blank lines when section body has only blank lines", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "",
      "Next Section",
      "============",
      "# other item",
    ].join("\n");
    const req = makeAddLine({ section: "Weekly Sync", text: "# first item" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# first item",
      "",
      "Next Section",
      "============",
      "# other item",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 1: inserts after the last non-blank line inside a section containing a sub-heading (---)", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "Subtopic",
      "---",
      "# sub item 1",
    ].join("\n");
    const req = makeAddLine({ section: "Weekly Sync", text: "# sub item 2" });
    const expected = [
      "Weekly Sync",
      "===========",
      "Subtopic",
      "---",
      "# sub item 1",
      "# sub item 2",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 2: inserts after last non-blank line of day part before first section title, preserving spacer blank lines", () => {
    const note = [
      "# day task 1",
      "",
      "Weekly Sync",
      "===========",
      "# sync item",
    ].join("\n");
    const req = makeAddLine({ section: undefined, text: "# day task 2" });
    const expected = [
      "# day task 1",
      "# day task 2",
      "",
      "Weekly Sync",
      "===========",
      "# sync item",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 2: inserts as first line of note followed by a blank line before first title when day part is empty", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# sync item",
    ].join("\n");
    const req = makeAddLine({ section: undefined, text: "# day task 1" });
    const expected = [
      "# day task 1",
      "",
      "Weekly Sync",
      "===========",
      "# sync item",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 2: inserts as first line followed by blank line when day part contains only blank lines", () => {
    const note = [
      "",
      "Weekly Sync",
      "===========",
      "# sync item",
    ].join("\n");
    const req = makeAddLine({ section: undefined, text: "# day task 1" });
    const expected = [
      "# day task 1",
      "",
      "Weekly Sync",
      "===========",
      "# sync item",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 2: appends after last non-blank line on a note with only day part (no section titles)", () => {
    const note = [
      "# day task 1",
    ].join("\n");
    const req = makeAddLine({ section: undefined, text: "# day task 2" });
    const expected = [
      "# day task 1",
      "# day task 2",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 3: appends missing section not on agenda at end of note preceded by a blank line", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# sync item",
    ].join("\n");
    const req = makeAddLine({ section: "Project Review", text: "# review roadmap" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# sync item",
      "",
      "Project Review",
      "==============",
      "# review roadmap",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 3: a note ending with a newline gets one blank line before the new section and keeps its final newline", () => {
    const note = [
      "Weekly Sync",
      "===========",
      "# sync item",
      "",
    ].join("\n");
    const req = makeAddLine({ section: "Project Review", text: "# review roadmap" });
    const expected = [
      "Weekly Sync",
      "===========",
      "# sync item",
      "",
      "Project Review",
      "==============",
      "# review roadmap",
      "",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 3: generates underline of = matching title length (>= 3 chars)", () => {
    const note = [
      "Standup",
      "=======",
      "# item 1",
    ].join("\n");
    const req = makeAddLine({ section: "Architecture Sync", text: "# discuss RFC" });
    const expected = [
      "Standup",
      "=======",
      "# item 1",
      "",
      "Architecture Sync",
      "=================",
      "# discuss RFC",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 3: generates minimum 3 = underline for short section titles (< 3 chars)", () => {
    const note = [
      "Standup",
      "=======",
      "# item 1",
    ].join("\n");
    const req = makeAddLine({ section: "UX", text: "# review prototype" });
    const expected = [
      "Standup",
      "=======",
      "# item 1",
      "",
      "UX",
      "===",
      "# review prototype",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 4: inserts missing section on agenda before the first existing section of a later agenda meeting", () => {
    const agenda = ["Standup", "Planning", "Retro"];
    const note = [
      "Standup",
      "=======",
      "# standup 1",
      "",
      "Retro",
      "=====",
      "# retro 1",
    ].join("\n");
    const req = makeAddLine({ section: "Planning", text: "# plan sprint" });
    const expected = [
      "Standup",
      "=======",
      "# standup 1",
      "",
      "Planning",
      "========",
      "# plan sprint",
      "",
      "Retro",
      "=====",
      "# retro 1",
    ].join("\n");
    expect(applyAddLine(note, req, agenda)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 4: places inserted section before later section followed by a blank line", () => {
    const agenda = ["Standup", "Planning", "Retro"];
    const noteRetroOnly = [
      "Retro",
      "=====",
      "# retro 1",
    ].join("\n");
    const reqPlanning = makeAddLine({ section: "Planning", text: "# plan sprint" });
    const expected = [
      "Planning",
      "========",
      "# plan sprint",
      "",
      "Retro",
      "=====",
      "# retro 1",
    ].join("\n");
    expect(applyAddLine(noteRetroOnly, reqPlanning, agenda)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 4: places section at start before first section when it is earlier than all existing sections on agenda", () => {
    const agenda = ["Standup", "Planning", "Retro"];
    const noteRetroOnly = [
      "Retro",
      "=====",
      "# retro 1",
    ].join("\n");
    const reqStandup = makeAddLine({ section: "Standup", text: "# standup 1" });
    const expected = [
      "Standup",
      "=======",
      "# standup 1",
      "",
      "Retro",
      "=====",
      "# retro 1",
    ].join("\n");
    expect(applyAddLine(noteRetroOnly, reqStandup, agenda)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 4: respects title decorations when comparing existing sections against agenda", () => {
    const agenda = ["Standup", "Planning", "Retro"];
    const noteDecorated = [
      "[09:00 - 09:30] Retro",
      "=====================",
      "# retro 1",
    ].join("\n");
    const reqPlanning = makeAddLine({ section: "Planning", text: "# plan sprint" });
    const expected = [
      "Planning",
      "========",
      "# plan sprint",
      "",
      "[09:00 - 09:30] Retro",
      "=====================",
      "# retro 1",
    ].join("\n");
    expect(applyAddLine(noteDecorated, reqPlanning, agenda)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 5: appends at end when missing section is on agenda but no later agenda meeting exists in note", () => {
    const agenda = ["Standup", "Planning", "Retro"];
    const noteStandupOnly = [
      "Standup",
      "=======",
      "# standup 1",
    ].join("\n");
    const reqRetro = makeAddLine({ section: "Retro", text: "# retro item" });
    const expected = [
      "Standup",
      "=======",
      "# standup 1",
      "",
      "Retro",
      "=====",
      "# retro item",
    ].join("\n");
    expect(applyAddLine(noteStandupOnly, reqRetro, agenda)).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 6: empty note with section becomes Title\\n=====\\nline\\n", () => {
    const req = makeAddLine({ section: "Planning", text: "# sprint goals" });
    expect(applyAddLine("", req, [])).toEqual({
      result: "applied",
      changed: true,
      text: "Planning\n========\n# sprint goals\n",
    });
  });

  it("Rule 6: empty note with short section title becomes Title\\n===\\nline\\n", () => {
    const req = makeAddLine({ section: "1", text: "# item" });
    expect(applyAddLine("", req, [])).toEqual({
      result: "applied",
      changed: true,
      text: "1\n===\n# item\n",
    });
  });

  it("Rule 6: empty note without section (day part) becomes line\\n", () => {
    const req = makeAddLine({ section: undefined, text: "# buy milk" });
    expect(applyAddLine("", req, [])).toEqual({
      result: "applied",
      changed: true,
      text: "# buy milk\n",
    });
  });

  it("Rule 7: matches existing section title ignoring case and time range decoration ([10:00 - 11:00] Standup)", () => {
    const note = [
      "[10:00 - 11:00] Standup",
      "=======================",
      "# standup 1",
    ].join("\n");
    const req = makeAddLine({ section: "standup", text: "# standup 2" });
    const expected = [
      "[10:00 - 11:00] Standup",
      "=======================",
      "# standup 1",
      "# standup 2",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 7: matches existing section title ignoring case and trailing date (Standup - 2026-10-30)", () => {
    const note = [
      "Standup - 2026-10-30",
      "====================",
      "# standup 1",
    ].join("\n");
    const req = makeAddLine({ section: "Standup", text: "# standup 2" });
    const expected = [
      "Standup - 2026-10-30",
      "====================",
      "# standup 1",
      "# standup 2",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("Rule 7: matches existing section title ignoring case and [CANCELED] prefix", () => {
    const note = [
      "[CANCELED] Standup",
      "==================",
      "# standup 1",
    ].join("\n");
    const req = makeAddLine({ section: "Standup", text: "# standup 2" });
    const expected = [
      "[CANCELED] Standup",
      "==================",
      "# standup 1",
      "# standup 2",
    ].join("\n");
    expect(applyAddLine(note, req, [])).toEqual({ result: "applied", changed: true, text: expected });
  });

  it("always returns result: 'applied' and changed: true", () => {
    const note = [
      "Standup",
      "=======",
      "# item 1",
    ].join("\n");
    const outcome = applyAddLine(note, makeAddLine({ section: "Standup", text: "# item 2" }), []);
    expect(outcome.result).toBe("applied");
    if (outcome.result === "applied") {
      expect(outcome.changed).toBe(true);
    }
  });
});
