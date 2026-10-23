import { describe, expect, it } from "vitest";
import { dueItems, countOverdue, dueStatus } from "./tokens";

describe("dueItems: line parsing, state tracking, and delegated lines", () => {
  it("returns empty array for text with no actions or no due dates", () => {
    expect(dueItems("")).toEqual([]);
    expect(dueItems("plain prose\no topic\n- bullet")).toEqual([]);
    expect(dueItems("# action without due date\nv done action")).toEqual([]);
  });

  it("extracts due item on an open action line (#)", () => {
    const text = "# submit report by:2026-10-30";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 16,
        to: 29,
        date: "2026-10-30",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a done action line (v)", () => {
    const text = "v completed audit by:2026-10-20";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 18,
        to: 31,
        date: "2026-10-20",
        word: undefined,
        state: "v",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a deferred action line (>)", () => {
    const text = "> postpone webinar by:2026-11-15";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 19,
        to: 32,
        date: "2026-11-15",
        word: undefined,
        state: ">",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a won't-do action line (x)", () => {
    const text = "x abandon feature by:2026-10-18";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 18,
        to: 31,
        date: "2026-10-18",
        word: undefined,
        state: "x",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a delegated action line with state null and assignee name", () => {
    const text = "=> @dana send slides by:2026-10-29";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 21,
        to: 34,
        date: "2026-10-29",
        word: undefined,
        state: null,
        delegated: true,
        assignee: "dana",
      },
    ]);
  });

  it("extracts due item on a consequence open action (=> #)", () => {
    const text = "meeting => # prepare summary by:2026-10-28";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 29,
        to: 42,
        date: "2026-10-28",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a consequence done action (=> v)", () => {
    const text = "meeting => v prepare summary by:2026-10-28";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 29,
        to: 42,
        date: "2026-10-28",
        word: undefined,
        state: "v",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a consequence deferred action (=> >)", () => {
    const text = "meeting => > push release by:2026-11-01";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 26,
        to: 39,
        date: "2026-11-01",
        word: undefined,
        state: ">",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a consequence won't-do action (=> x)", () => {
    const text = "meeting => x drop platform by:2026-11-02";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 27,
        to: 40,
        date: "2026-11-02",
        word: undefined,
        state: "x",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("extracts due item on a consequence delegated part (=> @name)", () => {
    const text = "# project kick-off => @priya write spec by:2026-11-05";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 40,
        to: 53,
        date: "2026-11-05",
        word: undefined,
        state: null,
        delegated: true,
        assignee: "priya",
      },
    ]);
  });

  it("extracts dueWord item with word populated and date undefined", () => {
    const text = "# review proposal by:tomorrow";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 18,
        to: 29,
        date: undefined,
        word: "tomorrow",
        state: "#",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("accurately tracks 0-based line indices across multiple lines", () => {
    const text = [
      "Header Title",
      "============",
      "# first task by:2026-10-01",
      "",
      "- bullet point",
      "v second task by:2026-10-02",
      "prose line",
      "=> @sam third task by:2026-10-03",
    ].join("\n");

    const items = dueItems(text);
    expect(items).toHaveLength(3);
    expect(items[0].lineIdx).toBe(2);
    expect(items[0].date).toBe("2026-10-01");
    expect(items[0].state).toBe("#");
    expect(items[1].lineIdx).toBe(5);
    expect(items[1].date).toBe("2026-10-02");
    expect(items[1].state).toBe("v");
    expect(items[2].lineIdx).toBe(7);
    expect(items[2].date).toBe("2026-10-03");
    expect(items[2].state).toBeNull();
    expect(items[2].delegated).toBe(true);
    expect(items[2].assignee).toBe("sam");
  });

  it("extracts multiple due items from multiple action parts on the same line", () => {
    const line = "# first by:2026-10-01 => v second by:2026-10-02 => @dana third by:2026-10-03";
    const items = dueItems(line);
    expect(items).toEqual([
      {
        lineIdx: 0,
        from: 8,
        to: 21,
        date: "2026-10-01",
        word: undefined,
        state: "#",
        delegated: false,
        assignee: undefined,
      },
      {
        lineIdx: 0,
        from: 34,
        to: 47,
        date: "2026-10-02",
        word: undefined,
        state: "v",
        delegated: false,
        assignee: undefined,
      },
      {
        lineIdx: 0,
        from: 63,
        to: 76,
        date: "2026-10-03",
        word: undefined,
        state: null,
        delegated: true,
        assignee: "dana",
      },
    ]);
  });

  it("assigns plain => text follow-up due date to the preceding part's state", () => {
    const text = "v design review => fix comments by:2026-10-25";
    expect(dueItems(text)).toEqual([
      {
        lineIdx: 0,
        from: 32,
        to: 45,
        date: "2026-10-25",
        word: undefined,
        state: "v",
        delegated: false,
        assignee: undefined,
      },
    ]);
  });

  it("handles Windows CRLF (\\r\\n) line endings seamlessly", () => {
    const text = "# task A by:2026-10-01\r\nv task B by:2026-10-02\r\n=> @bob task C by:2026-10-03\r\n";
    const items = dueItems(text);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ lineIdx: 0, date: "2026-10-01", state: "#", delegated: false });
    expect(items[1]).toMatchObject({ lineIdx: 1, date: "2026-10-02", state: "v", delegated: false });
    expect(items[2]).toMatchObject({ lineIdx: 2, date: "2026-10-03", state: null, delegated: true, assignee: "bob" });
  });
});

describe("countOverdue: overdue calculation rules", () => {
  const today = "2026-10-22";

  it("counts an open own action with date strictly before today as overdue", () => {
    expect(countOverdue("# overdue task by:2026-10-21", today)).toBe(1);
    expect(countOverdue("# overdue task by:2026-09-01", today)).toBe(1);
  });

  it("does not count an open action with date equal to today as overdue", () => {
    expect(countOverdue("# due today by:2026-10-22", today)).toBe(0);
  });

  it("does not count an open action with date in the future as overdue", () => {
    expect(countOverdue("# due tomorrow by:2026-10-23", today)).toBe(0);
    expect(countOverdue("# due next month by:2026-11-15", today)).toBe(0);
  });

  it("does not count a done action (v) as overdue even if the date is in the past", () => {
    expect(countOverdue("v completed past task by:2026-10-15", today)).toBe(0);
  });

  it("does not count a deferred action (>) as overdue even if the date is in the past", () => {
    expect(countOverdue("> deferred past task by:2026-10-15", today)).toBe(0);
  });

  it("does not count a won't-do action (x) as overdue even if the date is in the past", () => {
    expect(countOverdue("x cancelled past task by:2026-10-15", today)).toBe(0);
  });

  it("does not count a delegated part (=> @name) in the own overdue count", () => {
    expect(countOverdue("=> @dana send slides by:2026-10-15", today)).toBe(0);
    expect(countOverdue("# sync => @priya deliver draft by:2026-10-15", today)).toBe(0);
  });

  it("never counts an unresolved date word (dueWord) as overdue", () => {
    expect(countOverdue("# open task by:fri", today)).toBe(0);
    expect(countOverdue("# open task by:tomorrow", today)).toBe(0);
    expect(countOverdue("# open task by:2026-02-30", today)).toBe(0);
    expect(countOverdue("# open task by:invalid", today)).toBe(0);
  });

  it("counts open overdue consequence actions (=> #) with date in the past", () => {
    expect(countOverdue("sync => # write notes by:2026-10-15", today)).toBe(1);
    expect(countOverdue("v done initial => # follow-up by:2026-10-15", today)).toBe(1);
  });

  it("does not count done consequence actions on an open line", () => {
    expect(countOverdue("# open initial => v done follow-up by:2026-10-15", today)).toBe(0);
  });

  it("sums overdue items across multiple lines correctly", () => {
    const text = [
      "# overdue 1 by:2026-10-01",
      "v done past by:2026-10-02",
      "# overdue 2 by:2026-10-10",
      "# today task by:2026-10-22",
      "=> @sam delegated past by:2026-10-05",
      "# later task by:2026-10-30",
      "# overdue 3 by:2026-10-15",
    ].join("\n");
    expect(countOverdue(text, today)).toBe(3);
  });

  it("sums overdue items across multiple parts on the same line", () => {
    const line = "# first overdue by:2026-10-01 => # second overdue by:2026-10-02";
    expect(countOverdue(line, today)).toBe(2);
  });

  it("counts overdue items correctly when text uses Windows CRLF (\\r\\n) line endings", () => {
    const text = "# task 1 by:2026-10-01\r\n# task 2 by:2026-10-05\r\nv done by:2026-10-01\r\n# today by:2026-10-22\r\n";
    expect(countOverdue(text, today)).toBe(2);
  });
});

describe("dueStatus: status classification", () => {
  const today = "2026-10-22";

  it("classifies dates strictly before today as overdue", () => {
    expect(dueStatus("2026-10-21", today)).toBe("overdue");
    expect(dueStatus("2026-09-30", today)).toBe("overdue");
    expect(dueStatus("2025-12-31", today)).toBe("overdue");
  });

  it("classifies dates equal to today as today", () => {
    expect(dueStatus("2026-10-22", today)).toBe("today");
  });

  it("classifies dates strictly after today as later", () => {
    expect(dueStatus("2026-10-23", today)).toBe("later");
    expect(dueStatus("2026-11-01", today)).toBe("later");
    expect(dueStatus("2027-01-01", today)).toBe("later");
  });

  it("handles year transition boundary comparisons correctly", () => {
    expect(dueStatus("2026-12-31", "2027-01-01")).toBe("overdue");
    expect(dueStatus("2027-01-01", "2027-01-01")).toBe("today");
    expect(dueStatus("2027-01-02", "2027-01-01")).toBe("later");
  });
});
