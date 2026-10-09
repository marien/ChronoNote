import { describe, it, expect } from "vitest";
import { datedTabLabel } from "./tabLabel";

const words = { today: "Today", yesterday: "Yesterday", tomorrow: "Tomorrow" };
const format = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}@${d.getHours()}`;

describe("datedTabLabel", () => {
  it("ISO style returns the date unchanged, today or not", () => {
    expect(datedTabLabel("2026-10-09", "iso", "2026-10-09", words, format)).toBe("2026-10-09");
    expect(datedTabLabel("2026-10-04", "iso", "2026-10-09", words, format)).toBe("2026-10-04");
  });

  it("friendly style names today, yesterday and tomorrow", () => {
    expect(datedTabLabel("2026-10-09", "friendly", "2026-10-09", words, format)).toBe("Today");
    expect(datedTabLabel("2026-10-08", "friendly", "2026-10-09", words, format)).toBe("Yesterday");
    expect(datedTabLabel("2026-10-10", "friendly", "2026-10-09", words, format)).toBe("Tomorrow");
  });

  it("yesterday and tomorrow cross month, year and leap-day boundaries", () => {
    expect(datedTabLabel("2026-02-28", "friendly", "2026-03-01", words, format)).toBe("Yesterday");
    expect(datedTabLabel("2027-01-01", "friendly", "2026-12-31", words, format)).toBe("Tomorrow");
    expect(datedTabLabel("2028-02-29", "friendly", "2028-03-01", words, format)).toBe("Yesterday");
  });

  it("any other day goes through the formatter, handed a local-noon date for that day", () => {
    expect(datedTabLabel("2026-10-04", "friendly", "2026-10-09", words, format)).toBe("4/10/2026@12");
    expect(datedTabLabel("2026-10-11", "friendly", "2026-10-09", words, format)).toBe("11/10/2026@12");
  });

  it("uses whichever words it is given", () => {
    const nl = { today: "Vandaag", yesterday: "Gisteren", tomorrow: "Morgen" };
    expect(datedTabLabel("2026-10-09", "friendly", "2026-10-09", nl, format)).toBe("Vandaag");
  });

  it("leaves a name that is not a plain date alone", () => {
    expect(datedTabLabel("2026-10-09 standup", "friendly", "2026-10-09", words, format)).toBe("2026-10-09 standup");
    expect(datedTabLabel("Scratchpad 1", "friendly", "2026-10-09", words, format)).toBe("Scratchpad 1");
  });
});
