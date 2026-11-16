import { describe, expect, it, vi } from "vitest";
import * as date from "./date";
import { dayHeatOf } from "./dayHeat";
import type { NoteEntry } from "./notesIndex";

function entry(text: string, key = "2026-11-05.txt"): NoteEntry {
  return {
    key,
    filename: key,
    dateISO: "2026-11-05",
    text,
    source: "disk",
  };
}

describe("dayHeatOf", () => {
  it("equals computeDayHeat on the same text", () => {
    for (const text of ["", "   \n", "just notes\n", "# pending task\n", "v done task\n"]) {
      expect(dayHeatOf(entry(text))).toBe(date.computeDayHeat(text));
    }
  });

  it("computes once when asked twice for the same entry, and computes again for a new entry", () => {
    const spy = vi.spyOn(date, "computeDayHeat");
    try {
      const first = entry("# a");
      expect(dayHeatOf(first)).toBe("pending");
      expect(dayHeatOf(first)).toBe("pending");
      expect(spy).toHaveBeenCalledTimes(1);

      // Even a null result (blank text) is remembered and does not recompute.
      const blank = entry("   ");
      expect(dayHeatOf(blank)).toBeNull();
      expect(dayHeatOf(blank)).toBeNull();
      expect(spy).toHaveBeenCalledTimes(2);

      const second = entry("v a");
      expect(dayHeatOf(second)).toBe("done");
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  });
});
