import { describe, it, expect } from "vitest";
import { computeAutoSync } from "./calendarReconcile";

const sec = (title: string, body?: string) =>
  [title, "=".repeat(title.length), ...(body ? [body] : [])].join("\n");
const note = (...blocks: string[]) => blocks.join("\n\n\n") + "\n";

const FULL_AGENDA = ["Standup", "Design review", "1:1 Dana"];
const FULL_STARTS: Record<string, string> = {
  Standup: "09:00",
  "Design review": "14:00",
  "1:1 Dana": "15:00",
};

describe("computeAutoSync", () => {
  it("applies when a new meeting is in the agenda and preserves existing text and order", () => {
    const content = note(sec("Standup", "standup notes"), sec("1:1 Dana"));
    const result = computeAutoSync(content, FULL_AGENDA, [], FULL_STARTS, []);

    expect(result.apply).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.added).toEqual(["Design review"]);
    expect(result.removed).toEqual([]);
    expect(result.offer).toEqual([]);
    expect(result.content).toBe(
      note(sec("Standup", "standup notes"), sec("Design review"), sec("1:1 Dana")),
    );
  });

  it("applies and removes an empty section that is no longer in the agenda", () => {
    const content = note(sec("Standup", "standup notes"), sec("Design review", "design notes"), sec("1:1 Dana"));
    const result = computeAutoSync(
      content,
      ["Standup", "Design review"],
      [],
      { Standup: "09:00", "Design review": "14:00" },
      [],
    );

    expect(result.apply).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(["1:1 Dana"]);
    expect(result.offer).toEqual([]);
    expect(result.content).toBe(
      note(sec("Standup", "standup notes"), sec("Design review", "design notes")),
    );
  });

  it("does not apply and flags needsReview when a removed section has text", () => {
    const content = note(
      sec("Standup", "standup notes"),
      sec("Design review", "design notes"),
      sec("1:1 Dana", "dana notes"),
    );
    const result = computeAutoSync(
      content,
      ["Standup", "Design review"],
      [],
      { Standup: "09:00", "Design review": "14:00" },
      [],
    );

    expect(result.apply).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.content).toBe(content);
  });

  it("does not apply and flags needsReview when section order differs from the agenda", () => {
    const content = note(sec("1:1 Dana", "dana notes"), sec("Standup", "standup notes"));
    const result = computeAutoSync(
      content,
      ["Standup", "1:1 Dana"],
      [],
      { Standup: "09:00", "1:1 Dana": "15:00" },
      [],
    );

    expect(result.apply).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.content).toBe(content);
  });

  it("does not apply and flags needsReview when order differs and a new meeting is in the agenda", () => {
    const content = note(sec("1:1 Dana", "dana notes"), sec("Standup", "standup notes"));
    const result = computeAutoSync(content, FULL_AGENDA, [], FULL_STARTS, []);

    expect(result.apply).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.content).toBe(content);
  });

  it("offers an alreadyAdded meeting without applying or flagging needsReview when its section was deleted", () => {
    const content = note(sec("Standup", "standup notes"), sec("1:1 Dana", "dana notes"));
    const result = computeAutoSync(content, FULL_AGENDA, [], FULL_STARTS, ["Design review"]);

    expect(result.apply).toBe(false);
    expect(result.needsReview).toBe(false);
    expect(result.offer).toEqual(["Design review"]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("preserves an ad-hoc call in time order when adding a new meeting", () => {
    const content = note(
      sec("Standup", "standup notes"),
      sec("'Call 13:50", "call notes"),
      sec("1:1 Dana", "dana notes"),
    );
    const result = computeAutoSync(content, FULL_AGENDA, [], FULL_STARTS, []);

    expect(result.apply).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.added).toEqual(["Design review"]);
    expect(result.removed).toEqual([]);
    expect(result.offer).toEqual([]);
    expect(result.content).toBe(
      note(
        sec("Standup", "standup notes"),
        sec("'Call 13:50", "call notes"),
        sec("Design review"),
        sec("1:1 Dana", "dana notes"),
      ),
    );
  });

  it("does not apply and adds nothing when the note already matches the agenda", () => {
    const content = note(
      sec("Standup", "standup notes"),
      sec("Design review", "design notes"),
      sec("1:1 Dana", "dana notes"),
    );
    const result = computeAutoSync(content, FULL_AGENDA, [], FULL_STARTS, []);

    expect(result.apply).toBe(false);
    expect(result.needsReview).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.offer).toEqual([]);
    expect(result.content).toBe(content);
  });
});
