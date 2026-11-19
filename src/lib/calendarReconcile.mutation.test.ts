import { describe, expect, it } from "vitest";
import {
  appendRemovedSectionTo,
  computeAutoSync,
  computeCalendarSync,
  flagRemovedSection,
  isAdhocSection,
  meetingMatchKey,
} from "./calendarReconcile";

const sec = (title: string, body?: string) =>
  [title, "=".repeat(title.length), ...(body ? [body] : [])].join("\n");
const note = (...blocks: string[]) => blocks.join("\n\n\n") + "\n";

describe("calendarReconcile mutation rules", () => {
  describe("title matching and [CANCELED] prefix", () => {
    it("meetingMatchKey trims surrounding spaces before stripping time and [CANCELED] prefixes", () => {
      expect(meetingMatchKey("  [09:00 - 10:00] Standup  ")).toBe(meetingMatchKey("Standup"));
      expect(meetingMatchKey("  [CANCELED] Standup  ")).toBe(meetingMatchKey("standup"));
    });

    it("trims surrounding spaces from new agenda titles and ignores blank agenda entries", () => {
      const result = computeCalendarSync("", ["  Standup  ", "   ", ""]);
      expect(result.content).toBe("Standup\n=======\n");
      expect(result.newTitles).toEqual(["Standup"]);
    });

    it("does not match a title that only starts like another", () => {
      const content = note(sec("Standup", "daily"), sec("Standup Prep", "prep"));
      const result = computeCalendarSync(content, ["Standup"]);
      expect(result.content).toBe(note(sec("Standup", "daily")));
      expect(result.removedWithContent).toEqual([{ header: "Standup Prep", lines: ["prep"] }]);
    });

    it("treats [CANCELED] as a prefix regardless of spacing after ] and strips it cleanly on restore", () => {
      const noSpace = note(sec("[CANCELED]Standup", "notes"));
      const r1 = computeCalendarSync(noSpace, ["Standup"]);
      expect(r1.content).toBe(note(sec("Standup", "notes")));

      const withSpace = note(sec("[CANCELED] Standup", "notes"));
      const r2 = computeCalendarSync(withSpace, ["Standup"]);
      expect(r2.content).toBe(note(sec("Standup", "notes")));
    });

    it("only recognizes [CANCELED] at the start of a title, not in the middle", () => {
      const content = note(sec("Discuss [CANCELED] meetings", "agenda notes"));
      const result = computeCalendarSync(content, [], ["Discuss [CANCELED] meetings"]);
      expect(result.removedWithContent).toEqual([
        { header: "Discuss [CANCELED] meetings", lines: ["agenda notes"] },
      ]);
      expect(result.content).toBe("");
    });

    it("preserves original underline on kept non-cancelled sections", () => {
      const content = "Standup\n===\nnotes\n";
      const result = computeCalendarSync(content, ["Standup"]);
      expect(result.content).toBe("Standup\n===\nnotes\n");
    });

    it("trims surrounding spaces on existing section headers when reporting removed sections", () => {
      const content = "  Old sync  \n========\nkept note\n";
      const result = computeCalendarSync(content, [], ["Old sync"]);
      expect(result.removedWithContent).toEqual([{ header: "Old sync", lines: ["kept note"] }]);
    });
  });

  describe("section parsing, preamble, and inter-section spacing", () => {
    it("does not treat a blank or whitespace-only line before === as a section header", () => {
      const content = "Intro\n\n===\n   \n===\nStandup\n=======\nnotes\n";
      const result = computeCalendarSync(content, ["Standup"]);
      expect(result.content).toBe("Intro\n\n===\n   \n===\n\n\nStandup\n=======\nnotes\n");
    });

    it("trims trailing whitespace-only lines from section bodies", () => {
      const content = "Standup\n=======\nnotes\n   \n";
      const result = computeCalendarSync(content, ["Standup"]);
      expect(result.content).toBe("Standup\n=======\nnotes\n");
    });

    it("preserves multi-line preamble and trims trailing whitespace before sections", () => {
      const content = "Line 1\nLine 2  \n\n\n\nStandup\n=======\nnotes\n";
      const result = computeCalendarSync(content, ["Standup", "Review"]);
      expect(result.content).toBe(
        "Line 1\nLine 2\n\n\nStandup\n=======\nnotes\n\n\nReview\n======\n",
      );
    });

    it("returns trimmed preamble when all sections are removed and returns empty string on empty note", () => {
      const withPreamble = "Morning thoughts\n\nOld\n===\n";
      expect(computeCalendarSync(withPreamble, [], ["Old"]).content).toBe("Morning thoughts\n");
      expect(computeCalendarSync("", []).content).toBe("");
    });

    it("collapses trailing blank lines when appending a flagged or moved section", () => {
      const content = "Standup\n=======\nnotes\n\n\n";
      expect(flagRemovedSection(content, { header: "Old", lines: ["x"] })).toBe(
        "Standup\n=======\nnotes\n\n\n[CANCELED] Old\n==============\nx\n",
      );
    });
  });

  describe("ad-hoc calls and start-time placement edges", () => {
    it("isAdhocSection only matches a leading quote, not an apostrophe inside a title", () => {
      expect(isAdhocSection("Team's Standup")).toBe(false);
      expect(isAdhocSection("Dana’s 1:1")).toBe(false);
    });

    it("does not treat a regular meeting with a time in its title as an ad-hoc call", () => {
      const content = note(sec("Sync 10:00", "notes"), sec("Standup", "s"));
      const result = computeCalendarSync(content, ["Standup", "Sync 10:00"], [], {
        Standup: "09:00",
        "Sync 10:00": "10:00",
      });
      expect(result.content).toBe(note(sec("Standup", "s"), sec("Sync 10:00", "notes")));
      expect(result.reorderedTitles.sort()).toEqual(["Standup", "Sync 10:00"]);
    });

    it("ignores malformed start times, trims valid ones, and keeps first duplicate start", () => {
      // Without valid starts, a timed ad-hoc call stays attached to the meeting above it
      const middle = note(sec("Standup", "s"), sec("'Call 11:00", "c"), sec("Review", "r"));
      expect(computeCalendarSync(middle, ["Standup", "Review"], [], {}).content).toBe(middle);
      expect(computeCalendarSync(middle, ["Standup", "Review"], [], { Standup: "about 14:00" }).content).toBe(middle);

      // Leading/trailing garbage on a start time must not match as HH:MM
      const tail = note(sec("Standup", "s"), sec("Review", "r"), sec("'Call 11:00", "c"));
      expect(computeCalendarSync(tail, ["Standup", "Review"], [], { Review: "about 14:00" }).content).toBe(tail);
      expect(computeCalendarSync(tail, ["Standup", "Review"], [], { Review: "14:00pm" }).content).toBe(tail);

      const spacedStarts = { Standup: " 09:00 ", "standup ": "15:00", Review: " 10:00 " };
      const res = computeCalendarSync(tail, ["Standup", "Review"], [], spacedStarts);
      expect(res.content).toBe(note(sec("Standup", "s"), sec("Review", "r"), sec("'Call 11:00", "c")));
    });

    it("places ad-hoc calls accurately using minutes, before the first, at the same minute, and after the last", () => {
      const starts = { Standup: "09:00", Design: "13:30", Retro: "16:00" };
      const content = note(
        sec("Standup", "s"),
        sec("'Call 13:45", "after design"),
        sec("'Call 08:30", "before first"),
        sec("'Call 13:15", "before design"),
        sec("'Call 09:00", "same as standup"),
        sec("'Call 17:30", "after last"),
        sec("Design", "d"),
        sec("Retro", "r"),
      );
      const result = computeCalendarSync(content, ["Standup", "Design", "Retro"], [], starts);
      expect(result.content).toBe(
        note(
          sec("'Call 08:30", "before first"),
          sec("Standup", "s"),
          sec("'Call 09:00", "same as standup"),
          sec("'Call 13:15", "before design"),
          sec("Design", "d"),
          sec("'Call 13:45", "after design"),
          sec("Retro", "r"),
          sec("'Call 17:30", "after last"),
        ),
      );
    });
  });

  describe("computeAutoSync alreadyAdded retention", () => {
    it("keeps an alreadyAdded meeting on the agenda when its section still exists alongside an ad-hoc call", () => {
      const content = note(sec("'Call 08:30", "c"), sec("Standup", "s"), sec("Design review", "d"));
      const r = computeAutoSync(
        content,
        ["Standup", "Design review"],
        [],
        { Standup: "09:00", "Design review": "14:00" },
        ["Design review"],
      );
      expect(r.apply).toBe(false);
      expect(r.offer).toEqual([]);
      expect(r.needsReview).toBe(false);
    });

    it("trims surrounding spaces from offered titles", () => {
      const content = note(sec("Standup", "s"));
      const r = computeAutoSync(
        content,
        ["Standup", "  Design review  "],
        [],
        { Standup: "09:00", "Design review": "14:00" },
        ["Design review"],
      );
      expect(r.offer).toEqual(["Design review"]);
    });

    it("does not count an ad-hoc section as an existing calendar meeting when checking alreadyAdded", () => {
      const content = note(sec("'Roundtable", "adhoc notes"));
      const r = computeAutoSync(content, ["'Roundtable"], [], {}, ["'Roundtable"]);
      expect(r.offer).toEqual(["'Roundtable"]);
      expect(r.apply).toBe(false);
    });
  });

  describe("mergeIntoExistingSection via appendRemovedSectionTo (§509)", () => {
    it("never merges into a [CANCELED] section even with leading spaces, and merges into a live match after it", () => {
      const target = note(sec("  [CANCELED] Weekly sync", "old"), sec("Weekly sync", "- live"));
      const result = appendRemovedSectionTo(target, { header: "Weekly sync", lines: ["- moved"] });
      expect(result).toBe(
        note(sec("  [CANCELED] Weekly sync", "old"), sec("Weekly sync", "- live\n\n- moved")),
      );
    });

    it("strips blank and whitespace-only lines at the edges of the moved body", () => {
      const target = note(sec("Weekly sync", "- existing"));
      const result = appendRemovedSectionTo(target, {
        header: "Weekly sync",
        lines: ["", "   ", "- first", "", "- second", "   ", ""],
      });
      expect(result).toBe(note(sec("Weekly sync", "- existing\n\n- first\n\n- second")));
    });

    it("returns content unchanged when moved body has only blank or whitespace-only lines", () => {
      const withText = note(sec("Weekly sync", "- existing"));
      expect(appendRemovedSectionTo(withText, { header: "Weekly sync", lines: [] })).toBe(withText);
      expect(appendRemovedSectionTo(withText, { header: "Weekly sync", lines: ["", "   "] })).toBe(withText);

      const withoutText = note(sec("Weekly sync"));
      expect(appendRemovedSectionTo(withoutText, { header: "Weekly sync", lines: ["  ", ""] })).toBe(withoutText);
    });

    it("merges directly under the underline when the target section has no text or only whitespace lines", () => {
      const target = "Weekly sync\n===========\n   \n\n\nLunch\n=====\n";
      const result = appendRemovedSectionTo(target, { header: "Weekly sync", lines: ["- moved"] });
      expect(result).toBe("Weekly sync\n===========\n- moved\n   \n\n\nLunch\n=====\n");
    });

    it("adds a trailing newline only when merging into the last section without one", () => {
      const lastNoNewline = "Weekly sync\n===========";
      expect(appendRemovedSectionTo(lastNoNewline, { header: "Weekly sync", lines: ["- moved"] })).toBe(
        "Weekly sync\n===========\n- moved\n",
      );

      const middleNoNewline = "Weekly sync\n===========\n\n\nLunch\n=====";
      expect(appendRemovedSectionTo(middleNoNewline, { header: "Weekly sync", lines: ["- moved"] })).toBe(
        "Weekly sync\n===========\n- moved\n\n\nLunch\n=====",
      );
    });

    it("ignores blank and whitespace-only lines before === inside the target section body", () => {
      const target = "Weekly sync\n===========\n- existing\n\n===\n   \n===\n";
      const result = appendRemovedSectionTo(target, { header: "Weekly sync", lines: ["- moved"] });
      expect(result).toBe("Weekly sync\n===========\n- existing\n\n===\n   \n===\n\n- moved\n");
    });
  });
});
