import { describe, it, expect, beforeEach } from "vitest";
import { rewriteDueWords, withDueDate } from "./tokens";
import { rewritePasted } from "./editor/pasteOverEmptyMarker";
import { currentDateISO, languageMode } from "./stores";

describe("rewriteDueWords: relative and shortcut words to ISO dates", () => {
  const fixedThursday = "2026-10-22"; // Thursday
  const localeEn = "en";
  const extraEn = { today: ["today", "t"], tomorrow: ["tomorrow", "tm"] };

  it("rewrites today, t, tomorrow, and tm", () => {
    expect(rewriteDueWords("# task by:today", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-22");
    expect(rewriteDueWords("# task by:t", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-22");
    expect(rewriteDueWords("# task by:tomorrow", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-23");
    expect(rewriteDueWords("# task by:tm", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-23");
  });

  it("rewrites weekdays to next occurrence after today (Decision 3)", () => {
    // Next day after Thursday 2026-10-22 is Friday 2026-10-23
    expect(rewriteDueWords("# task by:fri", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-23");
    expect(rewriteDueWords("# task by:friday", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-23");
    // by:thu on Thursday means NEXT week's Thursday (2026-10-29), not today
    expect(rewriteDueWords("# task by:thu", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-29");
    expect(rewriteDueWords("# task by:thursday", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-29");
    // Wednesday is next week 2026-10-28
    expect(rewriteDueWords("# task by:wed", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-28");
  });

  it("rewrites relative +N days", () => {
    expect(rewriteDueWords("# task by:+1", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-23");
    expect(rewriteDueWords("# task by:+3", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-25");
    expect(rewriteDueWords("# task by:+7", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-29");
  });

  it("rewrites ISO week (wkN) to the Friday of that week", () => {
    // ISO week 44 in 2026: Friday is 2026-10-30
    expect(rewriteDueWords("# task by:wk44", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-30");
  });

  it("rewrites MM-DD with year rollover if past", () => {
    // 10-30 is future in 2026
    expect(rewriteDueWords("# task by:10-30", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-30");
    // 01-05 is past in 2026, rolls over to 2027
    expect(rewriteDueWords("# task by:01-05", fixedThursday, localeEn, extraEn)).toBe("# task by:2027-01-05");
  });

  it("normalizes uppercase By: and BY: to lowercase by:", () => {
    expect(rewriteDueWords("# task By:fri", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-23");
    expect(rewriteDueWords("# task BY:tomorrow", fixedThursday, localeEn, extraEn)).toBe("# task by:2026-10-23");
  });

  it("preserves punctuation after the due word", () => {
    expect(rewriteDueWords("# finish by:fri.", fixedThursday, localeEn, extraEn)).toBe("# finish by:2026-10-23.");
    expect(rewriteDueWords("# finish by:fri!", fixedThursday, localeEn, extraEn)).toBe("# finish by:2026-10-23!");
    expect(rewriteDueWords("# finish by:fri?", fixedThursday, localeEn, extraEn)).toBe("# finish by:2026-10-23?");
    expect(rewriteDueWords("# finish by:fri)", fixedThursday, localeEn, extraEn)).toBe("# finish by:2026-10-23)");
    expect(rewriteDueWords("# finish by:fri; then regroup", fixedThursday, localeEn, extraEn)).toBe(
      "# finish by:2026-10-23; then regroup",
    );
    expect(rewriteDueWords("# finish by:fri, next task", fixedThursday, localeEn, extraEn)).toBe(
      "# finish by:2026-10-23, next task",
    );
  });

  it("leaves already-valid ISO dates untouched and returns null", () => {
    expect(rewriteDueWords("# task by:2026-10-30", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("# task by:2026-10-22", fixedThursday, localeEn, extraEn)).toBeNull();
  });

  it("leaves unknown words untouched and returns null", () => {
    expect(rewriteDueWords("# task by:someword", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("# task by:2026-02-30", fixedThursday, localeEn, extraEn)).toBeNull();
  });

  it("works across different action kinds (v, >, x, delegated => @name)", () => {
    expect(rewriteDueWords("v done by:fri", fixedThursday, localeEn, extraEn)).toBe("v done by:2026-10-23");
    expect(rewriteDueWords("> deferred by:fri", fixedThursday, localeEn, extraEn)).toBe("> deferred by:2026-10-23");
    expect(rewriteDueWords("x wontdo by:fri", fixedThursday, localeEn, extraEn)).toBe("x wontdo by:2026-10-23");
    expect(rewriteDueWords("=> @dana send slides by:fri", fixedThursday, localeEn, extraEn)).toBe(
      "=> @dana send slides by:2026-10-23",
    );
  });

  it("works on consequence actions (=> #, => v, => >, => x)", () => {
    expect(rewriteDueWords("standup => # act by:fri", fixedThursday, localeEn, extraEn)).toBe(
      "standup => # act by:2026-10-23",
    );
    expect(rewriteDueWords("standup => v done by:fri", fixedThursday, localeEn, extraEn)).toBe(
      "standup => v done by:2026-10-23",
    );
    expect(rewriteDueWords("standup => > later by:fri", fixedThursday, localeEn, extraEn)).toBe(
      "standup => > later by:2026-10-23",
    );
    expect(rewriteDueWords("standup => x drop by:fri", fixedThursday, localeEn, extraEn)).toBe(
      "standup => x drop by:2026-10-23",
    );
  });

  it("rewrites several action parts on one line", () => {
    const line = "# first by:fri => # second by:tomorrow";
    expect(rewriteDueWords(line, fixedThursday, localeEn, extraEn)).toBe(
      "# first by:2026-10-23 => # second by:2026-10-23",
    );
  });

  it("rewrites only the parts that contain due words", () => {
    const line1 = "# first by:fri => # second";
    expect(rewriteDueWords(line1, fixedThursday, localeEn, extraEn)).toBe("# first by:2026-10-23 => # second");

    const line2 = "# first => # second by:tomorrow";
    expect(rewriteDueWords(line2, fixedThursday, localeEn, extraEn)).toBe("# first => # second by:2026-10-23");
  });

  it("treats a second by: in the same action part as plain text (only first rewrites)", () => {
    const line = "# task by:fri and later by:tomorrow";
    expect(rewriteDueWords(line, fixedThursday, localeEn, extraEn)).toBe(
      "# task by:2026-10-23 and later by:tomorrow",
    );
  });

  it("leaves non-action lines untouched (topic, bullet, prose, emphasis)", () => {
    expect(rewriteDueWords("o agenda topic by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords(". discussed topic by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("- bullet list item by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("* star bullet by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("just plain prose by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("! urgent announcement by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
  });

  it("does not match by: inside a word, URL, or email", () => {
    expect(rewriteDueWords("# standby:fri", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("# visit https://example.com/by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
    expect(rewriteDueWords("# contact user@by:fri", fixedThursday, localeEn, extraEn)).toBeNull();
  });

  describe("Dutch locale words", () => {
    const localeNl = "nl";
    const extraNl = { today: ["vandaag"], tomorrow: ["morgen"] };

    it("understands Dutch weekday abbreviations and names", () => {
      // vr / vrijdag = Friday 2026-10-23
      expect(rewriteDueWords("# taak by:vr", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-23");
      expect(rewriteDueWords("# taak by:vrijdag", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-23");
      // do / donderdag = next week Thursday 2026-10-29
      expect(rewriteDueWords("# taak by:do", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-29");
      expect(rewriteDueWords("# taak by:donderdag", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-29");
    });

    it("understands Dutch relative words (vandaag, morgen)", () => {
      expect(rewriteDueWords("# taak by:vandaag", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-22");
      expect(rewriteDueWords("# taak by:morgen", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-23");
    });

    it("still understands English words even when UI language is Dutch", () => {
      expect(rewriteDueWords("# taak by:fri", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-23");
      expect(rewriteDueWords("# taak by:tomorrow", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-23");
      expect(rewriteDueWords("# taak by:today", fixedThursday, localeNl, extraNl)).toBe("# taak by:2026-10-22");
    });
  });
});

describe("withDueDate: adding, replacing, and removing due dates", () => {
  it("appends due date at the end of an action line", () => {
    expect(withDueDate("# task", 0, "2026-10-30")).toBe("# task by:2026-10-30");
    expect(withDueDate("  # indented task", 2, "2026-10-30")).toBe("  # indented task by:2026-10-30");
    expect(withDueDate("=> @dana send slides", 0, "2026-10-30")).toBe("=> @dana send slides by:2026-10-30");
  });

  it("replaces existing due or dueWord token in place", () => {
    expect(withDueDate("# task by:2026-10-15", 0, "2026-10-30")).toBe("# task by:2026-10-30");
    expect(withDueDate("# task by:fri", 0, "2026-10-30")).toBe("# task by:2026-10-30");
    expect(withDueDate("# task by:tomorrow", 0, "2026-10-30")).toBe("# task by:2026-10-30");
  });

  it("removes due date and preceding space when iso is null", () => {
    expect(withDueDate("# task by:2026-10-30", 0, null)).toBe("# task");
    expect(withDueDate("# task by:fri", 0, null)).toBe("# task");
  });

  it("is a no-op when removing from an action that has no due date", () => {
    expect(withDueDate("# task without date", 0, null)).toBe("# task without date");
  });

  it("targets the correct part on a multi-part line", () => {
    const multi = "# first action => # second consequence";
    // Target part 0
    expect(withDueDate(multi, 0, "2026-10-30")).toBe("# first action by:2026-10-30 => # second consequence");
    // Target part 1
    expect(withDueDate(multi, 18, "2026-10-30")).toBe("# first action => # second consequence by:2026-10-30");

    // Replace in multi-part line
    const withDates = "# part one by:2026-10-10 => # part two by:2026-10-20";
    expect(withDueDate(withDates, 0, "2026-11-01")).toBe(
      "# part one by:2026-11-01 => # part two by:2026-10-20",
    );
    expect(withDueDate(withDates, 27, "2026-11-01")).toBe(
      "# part one by:2026-10-10 => # part two by:2026-11-01",
    );

    // Remove in multi-part line
    expect(withDueDate(withDates, 0, null)).toBe("# part one => # part two by:2026-10-20");
    expect(withDueDate(withDates, 27, null)).toBe("# part one by:2026-10-10 => # part two");
  });

  it("places due date BEFORE trailing forward links", () => {
    // Add date before forward link
    expect(withDueDate("# task (>2026-11-01#Sync)", 0, "2026-10-30")).toBe(
      "# task by:2026-10-30 (>2026-11-01#Sync)",
    );
    // Add date before multiple forward links
    expect(withDueDate("# task (<2026-10-01) (>2026-11-01#Sync)", 0, "2026-10-30")).toBe(
      "# task by:2026-10-30 (<2026-10-01) (>2026-11-01#Sync)",
    );
    // Replace date before forward link
    expect(withDueDate("# task by:2026-10-15 (>2026-11-01#Sync)", 0, "2026-10-30")).toBe(
      "# task by:2026-10-30 (>2026-11-01#Sync)",
    );
    // Remove date before forward link
    expect(withDueDate("# task by:2026-10-15 (>2026-11-01#Sync)", 0, null)).toBe(
      "# task (>2026-11-01#Sync)",
    );
  });

  it("leaves non-action lines untouched", () => {
    expect(withDueDate("plain line", 0, "2026-10-30")).toBe("plain line");
    expect(withDueDate("o topic", 0, "2026-10-30")).toBe("o topic");
    expect(withDueDate("- bullet", 0, "2026-10-30")).toBe("- bullet");
    expect(withDueDate("! emphasis", 0, "2026-10-30")).toBe("! emphasis");
  });
});

describe("rewritePasted: pasted text rewriting and forward links", () => {
  beforeEach(() => {
    currentDateISO.set("2026-10-22");
    languageMode.set("en");
  });

  it("rewrites a single pasted action with relative due word", () => {
    expect(rewritePasted("# task by:tomorrow")).toBe("# task by:2026-10-23");
    expect(rewritePasted("# task by:today")).toBe("# task by:2026-10-22");
    expect(rewritePasted("# task by:fri")).toBe("# task by:2026-10-23");
  });

  it("rewrites each line in a multi-line pasted block independently", () => {
    const pasted = [
      "# first by:today",
      "# second by:tomorrow",
      "- bullet by:tomorrow",
      "# third by:2026-10-30",
      "prose by:tomorrow",
    ].join("\n");

    const expected = [
      "# first by:2026-10-22",
      "# second by:2026-10-23",
      "- bullet by:tomorrow",
      "# third by:2026-10-30",
      "prose by:tomorrow",
    ].join("\n");

    expect(rewritePasted(pasted)).toBe(expected);
  });

  it("leaves pasted ISO dates untouched", () => {
    expect(rewritePasted("# task by:2026-10-30")).toBe("# task by:2026-10-30");
  });

  it("applies state-first rewrite on pasted line together with due word", () => {
    expect(rewritePasted("- # task by:tomorrow")).toBe("# - task by:2026-10-23");
  });

  it("preserves due date when paste-forwarding with fromSuffixes", () => {
    const fromSuffixes = ["(<2026-10-20#Standup)"];
    // Existing ISO date is kept and (<...) suffix is appended
    expect(rewritePasted("# task by:2026-10-30", fromSuffixes)).toBe(
      "# task by:2026-10-30 (<2026-10-20#Standup)",
    );
    // Relative date word is rewritten to ISO date and (<...) suffix is appended
    expect(rewritePasted("# task by:tomorrow", fromSuffixes)).toBe(
      "# task by:2026-10-23 (<2026-10-20#Standup)",
    );
  });

  it("replaces existing forward links on paste-forward while keeping the due date", () => {
    const fromSuffixes = ["(<2026-10-20#Standup)"];
    const pastedWithOldLinks = "# task by:2026-10-30 (<2026-10-15#Older) (>2026-10-18#Next)";
    expect(rewritePasted(pastedWithOldLinks, fromSuffixes)).toBe(
      "# task by:2026-10-30 (<2026-10-20#Standup)",
    );
  });
});
