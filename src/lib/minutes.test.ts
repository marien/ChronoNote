import { describe, expect, it } from "vitest";
import { buildMinutes, type MinutesLabels } from "./minutes";

const EN_LABELS: MinutesLabels = {
  decisions: "Decisions",
  actions: "Actions",
  done: "Done",
  stillOpen: "Still open",
  remember: "Remember",
  notDiscussed: "not discussed",
  by: "by",
};

const NL_LABELS: MinutesLabels = {
  decisions: "Besluiten",
  actions: "Acties",
  done: "Gedaan",
  stillOpen: "Nog open",
  remember: "Onthouden",
  notDiscussed: "niet besproken",
  by: "uiterlijk",
};

const REFERENCE_NOTE = [
  "Design review",
  "=============",
  ". Vendor choice => we go with Acme => # (contract) send draft by:2026-11-20",
  "o Budget 2027",
  ", Hiring plan",
  "# ask Sam for numbers => @sam",
  "=> @dana prepares the demo by:2026-11-24",
  "! No meeting next week",
  "v book room",
  "> move the offsite (>2026-11-23#Design review)",
  "Sam was late, started 14:10",
].join("\n");

describe("buildMinutes", () => {
  it("formats the reference example exactly in plain text", () => {
    const res = buildMinutes({
      noteText: REFERENCE_NOTE,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: EN_LABELS,
    });

    const titleDate = "Monday 16 November 2026"; // the brief's reference: no comma after the weekday
    expect(res).not.toBeNull();
    expect(res!.empty).toBe(false);
    expect(res!.plain).toBe(
      [
        `Design review, ${titleDate}`,
        "",
        "Decisions",
        "- Vendor choice: we go with Acme",
        "",
        "Actions",
        "- Send draft (contract): Marien, by Fri 20 Nov",
        "- Ask Sam for numbers: Sam",
        "- Prepares the demo: Dana, by Tue 24 Nov",
        "",
        "Done",
        "- Book room",
        "",
        "Still open",
        "- Budget 2027",
        "- Hiring plan (not discussed)",
        "",
        "Remember",
        "- No meeting next week",
      ].join("\n"),
    );
  });

  it("omits owner on own actions when ownerName is empty", () => {
    const res = buildMinutes({
      noteText: REFERENCE_NOTE,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "",
      labels: EN_LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toContain("- Send draft (contract), by Fri 20 Nov");
    expect(res!.plain).toContain("- Ask Sam for numbers: Sam");
  });

  it("produces escaped HTML with bold title, headings, and lists", () => {
    const res = buildMinutes({
      noteText: REFERENCE_NOTE,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: EN_LABELS,
    });

    const titleDate = "Monday 16 November 2026"; // the brief's reference: no comma after the weekday
    expect(res!.html).toContain(`<p><b>Design review</b>, ${titleDate}</p>`);
    expect(res!.html).toContain("<li>Vendor choice: we go with Acme</li>");

    const escaped = buildMinutes({
      noteText: "Sync\n====\no a < b\n",
      lineIdx: 2,
      dateISO: null,
      locale: "en-GB",
      ownerName: "",
      labels: EN_LABELS,
    });
    expect(escaped!.html).toContain("<p><b>Sync</b></p>");
    expect(escaped!.html).toContain("<li>A &lt; b</li>");
  });

  it("returns empty: true for a section with only plain text", () => {
    const res = buildMinutes({
      noteText: "Notes\n=====\nJust plain text\n- a bullet\n1. a numbered line\n",
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: EN_LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(true);
  });

  it("handles chained action consequences '# a => # b => v c'", () => {
    const res = buildMinutes({
      noteText: "Standup\n=======\n# a => # b => v c\n",
      lineIdx: 2,
      dateISO: null,
      locale: "en-GB",
      ownerName: "",
      labels: EN_LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(false);
    expect(res!.plain).toBe(
      [
        "Standup",
        "",
        "Actions",
        "- A",
        "- B",
        "",
        "Done",
        "- C",
      ].join("\n"),
    );
  });

  it("returns null when lineIdx is above the first section", () => {
    const res = buildMinutes({
      noteText: "Preamble line\n\nMeeting\n=======\n# task\n",
      lineIdx: 0,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "",
      labels: EN_LABELS,
    });
    expect(res).toBeNull();
  });

  it("works when lineIdx is on the section title line itself", () => {
    const res = buildMinutes({
      noteText: "Preamble\n\nMeeting\n=======\n# task\n",
      lineIdx: 2,
      dateISO: null,
      locale: "en-GB",
      ownerName: "Marien",
      labels: EN_LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(false);
    expect(res!.plain).toBe("Meeting\n\nActions\n- Task: Marien");
  });

  it("formats due dates in nl-NL with Dutch labels", () => {
    const res = buildMinutes({
      noteText: "Ontwerp\n=======\n# stuur concept by:2026-11-20\n",
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "nl-NL",
      ownerName: "Marien",
      labels: NL_LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toContain("- Stuur concept: Marien, uiterlijk vr 20 nov");
  });

  it("handles sub-titles, standalone plain follow-ups, and delegated action with due date on preceding part", () => {
    const note = [
      "Review",
      "======",
      "Subtopic",
      "--------",
      "=> agreed on scope",
      "# prepare slides by:2026-11-20 => @sam",
      "x cancelled item",
      "\\# escaped line",
    ].join("\n");

    const res = buildMinutes({
      noteText: note,
      lineIdx: 1,
      dateISO: null,
      locale: "en-GB",
      ownerName: "Marien",
      labels: EN_LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe(
      [
        "Review",
        "",
        "Decisions",
        "- Agreed on scope",
        "",
        "Actions",
        "- Prepare slides: Sam, by Fri 20 Nov",
      ].join("\n"),
    );
  });
});
