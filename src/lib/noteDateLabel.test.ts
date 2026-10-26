import { describe, it, expect } from "vitest";
import { formatNoteDate, noteISODate, type TabLabelWords } from "./noteDateLabel";

const enWords: TabLabelWords = {
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
};

const nlWords: TabLabelWords = {
  today: "Vandaag",
  yesterday: "Gisteren",
  tomorrow: "Morgen",
};

const dummyFormatter = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("noteDateLabel formatter (§433)", () => {
  const today = "2026-10-20";
  const yesterday = "2026-10-19";
  const tomorrow = "2026-10-21";
  const otherPast = "2026-10-14";
  const otherFuture = "2026-10-28";

  describe("ISO style", () => {
    it("returns ISO date for today, yesterday, tomorrow and other dates", () => {
      expect(formatNoteDate(today, "iso", today, enWords, dummyFormatter)).toBe("2026-10-20");
      expect(formatNoteDate(yesterday, "iso", today, enWords, dummyFormatter)).toBe("2026-10-19");
      expect(formatNoteDate(tomorrow, "iso", today, enWords, dummyFormatter)).toBe("2026-10-21");
      expect(formatNoteDate(otherPast, "iso", today, enWords, dummyFormatter)).toBe("2026-10-14");
      expect(formatNoteDate(otherFuture, "iso", today, enWords, dummyFormatter)).toBe("2026-10-28");
    });

    it("strips .txt extension from dated filename", () => {
      expect(formatNoteDate("2026-10-20.txt", "iso", today, enWords, dummyFormatter)).toBe("2026-10-20");
      expect(formatNoteDate("2026-10-14.txt", "iso", today, enWords, dummyFormatter)).toBe("2026-10-14");
    });

    it("returns scratchpad name unchanged", () => {
      expect(formatNoteDate("ideas.txt", "iso", today, enWords, dummyFormatter)).toBe("ideas.txt");
      expect(formatNoteDate("Scratchpad 1", "iso", today, enWords, dummyFormatter)).toBe("Scratchpad 1");
    });
  });

  describe("Friendly style", () => {
    it("formats today as Today / Vandaag", () => {
      expect(formatNoteDate(today, "friendly", today, enWords, "en-US")).toBe("Today");
      expect(formatNoteDate("2026-10-20.txt", "friendly", today, nlWords, "nl-NL")).toBe("Vandaag");
    });

    it("formats yesterday as Yesterday / Gisteren", () => {
      expect(formatNoteDate(yesterday, "friendly", today, enWords, "en-US")).toBe("Yesterday");
      expect(formatNoteDate("2026-10-19.txt", "friendly", today, nlWords, "nl-NL")).toBe("Gisteren");
    });

    it("formats tomorrow as Tomorrow / Morgen", () => {
      expect(formatNoteDate(tomorrow, "friendly", today, enWords, "en-US")).toBe("Tomorrow");
      expect(formatNoteDate("2026-10-21.txt", "friendly", today, nlWords, "nl-NL")).toBe("Morgen");
    });

    it("formats other dates with short weekday, day, short month", () => {
      const nlResult = formatNoteDate(otherPast, "friendly", today, nlWords, "nl-NL");
      // di or wo 14 okt depending on exact day of week
      expect(nlResult).toContain("14");
      expect(nlResult.toLowerCase()).toContain("okt");

      const enResult = formatNoteDate(otherPast, "friendly", today, enWords, "en-US");
      expect(enResult).toContain("14");
      expect(enResult).toContain("Oct");
    });

    it("supports custom DayFormatter", () => {
      const customFmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
      expect(formatNoteDate("2026-10-14", "friendly", today, enWords, customFmt)).toBe("14/10");
    });

    it("returns scratchpad and non-date names unchanged", () => {
      expect(formatNoteDate("ideas.txt", "friendly", today, enWords, "en-US")).toBe("ideas.txt");
      expect(formatNoteDate("Scratchpad 1", "friendly", today, enWords, "en-US")).toBe("Scratchpad 1");
      expect(formatNoteDate("2026-10-20 note", "friendly", today, enWords, "en-US")).toBe("2026-10-20 note");
    });
  });

  describe("noteISODate helper", () => {
    it("extracts ISO date from date strings and filenames", () => {
      expect(noteISODate("2026-10-20")).toBe("2026-10-20");
      expect(noteISODate("2026-10-20.txt")).toBe("2026-10-20");
    });

    it("returns null for non-dates", () => {
      expect(noteISODate("ideas.txt")).toBeNull();
      expect(noteISODate("scratchpad")).toBeNull();
      expect(noteISODate("2026-10-20 extra")).toBeNull();
    });
  });
});
