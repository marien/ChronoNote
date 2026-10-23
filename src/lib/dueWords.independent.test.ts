import { describe, expect, it } from "vitest";
import { parseDueWord, addDaysISO } from "./date";

describe("dueWords: fixed today = Thursday (2026-10-22)", () => {
  const today = "2026-10-22";

  it("resolves today and t to the current date", () => {
    expect(parseDueWord("today", today, "en")).toBe("2026-10-22");
    expect(parseDueWord("t", today, "en")).toBe("2026-10-22");
  });

  it("resolves tomorrow and tm to the next day", () => {
    expect(parseDueWord("tomorrow", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("tm", today, "en")).toBe("2026-10-23");
  });

  it("resolves thu and thursday on a Thursday to the next Thursday (7 days later)", () => {
    expect(parseDueWord("thu", today, "en")).toBe("2026-10-29");
    expect(parseDueWord("thursday", today, "en")).toBe("2026-10-29");
  });

  it("resolves fri and friday to tomorrow (Friday 2026-10-23)", () => {
    expect(parseDueWord("fri", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("friday", today, "en")).toBe("2026-10-23");
  });

  it("resolves all other English weekdays to the next occurrence strictly after today", () => {
    expect(parseDueWord("sat", today, "en")).toBe("2026-10-24");
    expect(parseDueWord("saturday", today, "en")).toBe("2026-10-24");
    expect(parseDueWord("sun", today, "en")).toBe("2026-10-25");
    expect(parseDueWord("sunday", today, "en")).toBe("2026-10-25");
    expect(parseDueWord("mon", today, "en")).toBe("2026-10-26");
    expect(parseDueWord("monday", today, "en")).toBe("2026-10-26");
    expect(parseDueWord("tue", today, "en")).toBe("2026-10-27");
    expect(parseDueWord("tuesday", today, "en")).toBe("2026-10-27");
    expect(parseDueWord("wed", today, "en")).toBe("2026-10-28");
    expect(parseDueWord("wednesday", today, "en")).toBe("2026-10-28");
  });
});

describe("dueWords: fixed today = Friday (2026-10-23)", () => {
  const today = "2026-10-23";

  it("resolves fri and friday on a Friday to next week's Friday (not today)", () => {
    expect(parseDueWord("fri", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("friday", today, "en")).toBe("2026-10-30");
  });

  it("resolves today on Friday to Friday 2026-10-23", () => {
    expect(parseDueWord("today", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("t", today, "en")).toBe("2026-10-23");
  });

  it("resolves tomorrow on Friday to Saturday 2026-10-24", () => {
    expect(parseDueWord("tomorrow", today, "en")).toBe("2026-10-24");
    expect(parseDueWord("tm", today, "en")).toBe("2026-10-24");
  });

  it("resolves sat on Friday to tomorrow Saturday 2026-10-24", () => {
    expect(parseDueWord("sat", today, "en")).toBe("2026-10-24");
    expect(parseDueWord("saturday", today, "en")).toBe("2026-10-24");
  });
});

describe("dueWords: fixed today = Sunday (2026-10-25)", () => {
  const today = "2026-10-25";

  it("resolves sun and sunday on a Sunday to next Sunday (7 days later)", () => {
    expect(parseDueWord("sun", today, "en")).toBe("2026-11-01");
    expect(parseDueWord("sunday", today, "en")).toBe("2026-11-01");
  });

  it("resolves mon on Sunday to tomorrow Monday 2026-10-26", () => {
    expect(parseDueWord("mon", today, "en")).toBe("2026-10-26");
    expect(parseDueWord("monday", today, "en")).toBe("2026-10-26");
  });

  it("resolves fri on Sunday to coming Friday 2026-10-30", () => {
    expect(parseDueWord("fri", today, "en")).toBe("2026-10-30");
  });
});

describe("dueWords: year-end rollover (MM-DD and wkN)", () => {
  const today = "2026-12-30"; // Wednesday in ISO week 53 of 2026

  it("rolls MM-DD that is already past over to next year", () => {
    expect(parseDueWord("01-05", today, "en")).toBe("2027-01-05");
    expect(parseDueWord("10-30", today, "en")).toBe("2027-10-30");
    expect(parseDueWord("12-25", today, "en")).toBe("2027-12-25");
  });

  it("keeps MM-DD that is today or in the future in the current year", () => {
    expect(parseDueWord("12-30", today, "en")).toBe("2026-12-30");
    expect(parseDueWord("12-31", today, "en")).toBe("2026-12-31");
  });

  it("rolls wkN to next year when this year's Friday is already past", () => {
    // Friday of week 1 in 2026 was 2026-01-09, which is past on 2026-12-30 -> rolls to 2027-01-08
    expect(parseDueWord("wk1", today, "en")).toBe("2027-01-08");
    // Friday of week 52 in 2026 was 2026-12-25, which is past on 2026-12-30 -> rolls to 2027-12-31
    expect(parseDueWord("wk52", today, "en")).toBe("2027-12-31");
  });

  it("keeps wkN in the current year when this year's Friday is still ahead", () => {
    // Friday of week 53 in 2026 is 2027-01-01, which is in the future on 2026-12-30
    expect(parseDueWord("wk53", today, "en")).toBe("2027-01-01");
  });
});

describe("dueWords: leap year handling", () => {
  it("returns null for 02-29 in non-leap year 2027", () => {
    expect(parseDueWord("02-29", "2027-01-15", "en")).toBeNull();
  });

  it("resolves 02-29 to 2028-02-29 in leap year 2028", () => {
    expect(parseDueWord("02-29", "2028-01-15", "en")).toBe("2028-02-29");
  });

  it("returns null for impossible calendar dates like 02-30 and 04-31", () => {
    expect(parseDueWord("02-30", "2026-10-22", "en")).toBeNull();
    expect(parseDueWord("04-31", "2026-10-22", "en")).toBeNull();
    expect(parseDueWord("13-01", "2026-10-22", "en")).toBeNull();
  });
});

describe("dueWords: +N limits and formats", () => {
  const today = "2026-10-22";

  it("resolves +1 to tomorrow", () => {
    expect(parseDueWord("+1", today, "en")).toBe("2026-10-23");
  });

  it("resolves +3 to 3 days from today", () => {
    expect(parseDueWord("+3", today, "en")).toBe("2026-10-25");
  });

  it("resolves maximum limit +999 to 999 days from today", () => {
    expect(parseDueWord("+999", today, "en")).toBe(addDaysISO(today, 999));
  });

  it("returns null for +0", () => {
    expect(parseDueWord("+0", today, "en")).toBeNull();
  });

  it("returns null for +1000 exceeding the 3-digit limit", () => {
    expect(parseDueWord("+1000", today, "en")).toBeNull();
  });

  it("returns null for +01 with leading zero", () => {
    expect(parseDueWord("+01", today, "en")).toBeNull();
  });

  it("returns null for negative offsets or bare plus", () => {
    expect(parseDueWord("-1", today, "en")).toBeNull();
    expect(parseDueWord("-7", today, "en")).toBeNull();
    expect(parseDueWord("+", today, "en")).toBeNull();
  });
});

describe("dueWords: wkN Friday of ISO week", () => {
  const today = "2026-10-22";

  it("resolves various prefixes for week numbers (wkN, wk N, wN, w N, weekN, week N)", () => {
    // Friday of ISO week 44 in 2026 is 2026-10-30
    expect(parseDueWord("wk44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("wk 44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("w44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("w 44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("week44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("week 44", today, "en")).toBe("2026-10-30");
  });

  it("returns Friday of week 53 when the year has 53 weeks (2026)", () => {
    // 2026 has 53 ISO weeks; week 53 Friday is 2027-01-01
    expect(parseDueWord("wk53", today, "en")).toBe("2027-01-01");
  });

  it("returns null for week 53 when the year has only 52 weeks (2025)", () => {
    // 2025 has only 52 ISO weeks
    expect(parseDueWord("wk53", "2025-10-22", "en")).toBeNull();
  });

  it("returns null for out-of-range week numbers (wk0 and wk54)", () => {
    expect(parseDueWord("wk0", today, "en")).toBeNull();
    expect(parseDueWord("wk54", today, "en")).toBeNull();
  });
});

describe("dueWords: locale weekdays (Dutch, German, French)", () => {
  const today = "2026-10-22"; // Thursday

  it("resolves Dutch weekday words (vr, do, ma, di, wo, za, zo)", () => {
    expect(parseDueWord("vr", today, "nl")).toBe("2026-10-23");
    expect(parseDueWord("vrijdag", today, "nl")).toBe("2026-10-23");
    expect(parseDueWord("do", today, "nl")).toBe("2026-10-29");
    expect(parseDueWord("donderdag", today, "nl")).toBe("2026-10-29");
    expect(parseDueWord("ma", today, "nl")).toBe("2026-10-26");
    expect(parseDueWord("maandag", today, "nl")).toBe("2026-10-26");
    expect(parseDueWord("di", today, "nl")).toBe("2026-10-27");
    expect(parseDueWord("wo", today, "nl")).toBe("2026-10-28");
    expect(parseDueWord("za", today, "nl")).toBe("2026-10-24");
    expect(parseDueWord("zo", today, "nl")).toBe("2026-10-25");
  });

  it("resolves German weekday words (fr, freitag, mo, di, mi, do, sa, so)", () => {
    expect(parseDueWord("fr", today, "de")).toBe("2026-10-23");
    expect(parseDueWord("freitag", today, "de")).toBe("2026-10-23");
    expect(parseDueWord("mo", today, "de")).toBe("2026-10-26");
    expect(parseDueWord("montag", today, "de")).toBe("2026-10-26");
    expect(parseDueWord("di", today, "de")).toBe("2026-10-27");
    expect(parseDueWord("mi", today, "de")).toBe("2026-10-28");
    expect(parseDueWord("do", today, "de")).toBe("2026-10-29");
    expect(parseDueWord("sa", today, "de")).toBe("2026-10-24");
    expect(parseDueWord("so", today, "de")).toBe("2026-10-25");
  });

  it("resolves French weekday words without dot (ven, vendredi, lun, mar, mer, jeu, sam, dim)", () => {
    expect(parseDueWord("ven", today, "fr")).toBe("2026-10-23");
    expect(parseDueWord("vendredi", today, "fr")).toBe("2026-10-23");
    expect(parseDueWord("lun", today, "fr")).toBe("2026-10-26");
    expect(parseDueWord("lundi", today, "fr")).toBe("2026-10-26");
    expect(parseDueWord("mar", today, "fr")).toBe("2026-10-27");
    expect(parseDueWord("mer", today, "fr")).toBe("2026-10-28");
    expect(parseDueWord("jeu", today, "fr")).toBe("2026-10-29");
    expect(parseDueWord("sam", today, "fr")).toBe("2026-10-24");
    expect(parseDueWord("dim", today, "fr")).toBe("2026-10-25");
  });
});

describe("dueWords: extra words parameter", () => {
  const today = "2026-10-22";

  it("resolves words supplied in extra.today to today", () => {
    const extra = { today: ["vandaag", "heute"], tomorrow: ["morgen"] };
    expect(parseDueWord("vandaag", today, "nl", extra)).toBe("2026-10-22");
    expect(parseDueWord("heute", today, "de", extra)).toBe("2026-10-22");
  });

  it("resolves words supplied in extra.tomorrow to tomorrow", () => {
    const extra = { today: ["vandaag"], tomorrow: ["morgen", "demain"] };
    expect(parseDueWord("morgen", today, "nl", extra)).toBe("2026-10-23");
    expect(parseDueWord("demain", today, "fr", extra)).toBe("2026-10-23");
  });

  it("handles whitespace and case inside extra words definitions", () => {
    const extra = { today: ["  Vandaag  "], tomorrow: ["  Morgen  "] };
    expect(parseDueWord("vandaag", today, "nl", extra)).toBe("2026-10-22");
    expect(parseDueWord("MORGEN", today, "nl", extra)).toBe("2026-10-23");
  });
});

describe("dueWords: English priority over locale words", () => {
  const today = "2026-10-22";

  it("prioritizes English t and today in Dutch locale", () => {
    expect(parseDueWord("t", today, "nl")).toBe("2026-10-22");
    expect(parseDueWord("today", today, "nl")).toBe("2026-10-22");
  });

  it("prioritizes English mon over French word mon in French locale", () => {
    // In French, "mon" is a possessive pronoun, but in English it is Monday
    expect(parseDueWord("mon", today, "fr")).toBe("2026-10-26");
  });

  it("prioritizes English tm over an extra.today entry with same name", () => {
    // English tm means tomorrow, so it must not be hijacked by extra.today
    const extra = { today: ["tm"], tomorrow: ["morgen"] };
    expect(parseDueWord("tm", today, "en", extra)).toBe("2026-10-23");
  });
});

describe("dueWords: case-insensitivity and surrounding space tolerance", () => {
  const today = "2026-10-22";

  it("ignores surrounding whitespace on input words", () => {
    expect(parseDueWord("  today  ", today, "en")).toBe("2026-10-22");
    expect(parseDueWord("  fri  ", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("  +3  ", today, "en")).toBe("2026-10-25");
    expect(parseDueWord("  wk44  ", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("  10-30  ", today, "en")).toBe("2026-10-30");
  });

  it("ignores casing on input words", () => {
    expect(parseDueWord("TODAY", today, "en")).toBe("2026-10-22");
    expect(parseDueWord("Friday", today, "en")).toBe("2026-10-23");
    expect(parseDueWord("WK44", today, "en")).toBe("2026-10-30");
    expect(parseDueWord("Week 44", today, "en")).toBe("2026-10-30");
  });
});

describe("dueWords: junk gives null, never a guess", () => {
  const today = "2026-10-22";

  it("returns null for empty strings and whitespace", () => {
    expect(parseDueWord("", today, "en")).toBeNull();
    expect(parseDueWord("   ", today, "en")).toBeNull();
  });

  it("returns null for unknown words or approximate phrases", () => {
    expect(parseDueWord("someday", today, "en")).toBeNull();
    expect(parseDueWord("friday-ish", today, "en")).toBeNull();
    expect(parseDueWord("next week", today, "en")).toBeNull();
    expect(parseDueWord("later", today, "en")).toBeNull();
  });

  it("returns null for full ISO strings with invalid calendar dates", () => {
    expect(parseDueWord("2026-02-30", today, "en")).toBeNull();
    expect(parseDueWord("2026-13-01", today, "en")).toBeNull();
  });

  it("returns null when the by: prefix was included in the argument", () => {
    expect(parseDueWord("by:2026-10-30", today, "en")).toBeNull();
    expect(parseDueWord("by:fri", today, "en")).toBeNull();
  });
});

describe.skip("suspected bugs", () => {
  const today = "2026-10-22"; // Thursday

  // Documented behaviour: Brief line 51-52: "Words in Dutch, German, French (abbreviation with a trailing dot) via the locale"
  // What the code does instead: In src/lib/date.ts line 133, shortFmt formats French weekday as "ven." and strips the dot
  // to produce s = "ven". But trimmed is "ven." (not stripped). The equality check `trimmed === s` ("ven." === "ven") fails,
  // and parseDueWord returns null instead of "2026-10-23".
  it("resolves French weekday abbreviation with a trailing dot (ven.) to Friday", () => {
    expect(parseDueWord("ven.", today, "fr")).toBe("2026-10-23");
    expect(parseDueWord("lun.", today, "fr")).toBe("2026-10-26");
    expect(parseDueWord("mar.", today, "fr")).toBe("2026-10-27");
  });

  // Documented behaviour: Brief line 51-52: "Words in Dutch, German, French (abbreviation with a trailing dot) via the locale"
  // What the code does instead: In German, Intl formats short weekday as "Fr." which src/lib/date.ts line 133 strips to "fr".
  // Passing "fr." compares "fr." === "fr" which fails, returning null instead of "2026-10-23".
  it("resolves German weekday abbreviation with a trailing dot (fr.) to Friday", () => {
    expect(parseDueWord("fr.", today, "de")).toBe("2026-10-23");
    expect(parseDueWord("mo.", today, "de")).toBe("2026-10-26");
  });
});
