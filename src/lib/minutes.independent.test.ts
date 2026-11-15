import { describe, it, expect } from "vitest";
import { buildMinutes, type MinutesLabels } from "./minutes";

const LABELS: MinutesLabels = {
  decisions: "Decisions",
  actions: "Actions",
  done: "Done",
  stillOpen: "Still open",
  remember: "Remember",
  notDiscussed: "not discussed",
  by: "by",
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

const EXPECTED_REFERENCE_PLAIN = [
  "Design review, Monday 16 November 2026",
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
].join("\n");

function section(title: string, ...body: string[]): string {
  return [title, "=".repeat(title.length), ...body].join("\n");
}

describe("buildMinutes", () => {
  it("matches the reference example plain output and html entries with ownerName", () => {
    const res = buildMinutes({
      noteText: REFERENCE_NOTE,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(false);
    expect(res!.plain).toBe(EXPECTED_REFERENCE_PLAIN);

    expect(res!.html).toContain("<p><b>Design review</b>, Monday 16 November 2026</p>");
    for (const entry of [
      "Vendor choice: we go with Acme",
      "Send draft (contract): Marien, by Fri 20 Nov",
      "Ask Sam for numbers: Sam",
      "Prepares the demo: Dana, by Tue 24 Nov",
      "Book room",
      "Budget 2027",
      "Hiring plan (not discussed)",
      "No meeting next week",
    ]) {
      expect(res!.html).toContain(`<li>${entry}</li>`);
    }
  });

  it("omits the owner on non-delegated open actions when ownerName is empty", () => {
    const res = buildMinutes({
      noteText: REFERENCE_NOTE,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(false);
    const expectedWithoutOwner = EXPECTED_REFERENCE_PLAIN.replace(
      "- Send draft (contract): Marien, by Fri 20 Nov",
      "- Send draft (contract), by Fri 20 Nov",
    );
    expect(res!.plain).toBe(expectedWithoutOwner);
    expect(res!.html).toContain("<li>Send draft (contract), by Fri 20 Nov</li>");
  });

  it("row 1: open action (#), not delegated, goes to Actions with ownerName or no owner when empty", () => {
    const noteText = section("Standup", "# send the agenda");

    const withOwner = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });
    expect(withOwner).not.toBeNull();
    expect(withOwner!.plain).toBe("Standup, Monday 16 November 2026\n\nActions\n- Send the agenda: Marien");

    const withoutOwner = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "",
      labels: LABELS,
    });
    expect(withoutOwner).not.toBeNull();
    expect(withoutOwner!.plain).toBe("Standup, Monday 16 November 2026\n\nActions\n- Send the agenda");
  });

  it("row 2: delegated part (=> @name) goes to Actions with name as owner and does not duplicate open action before arrow", () => {
    const noteText = section(
      "Standup",
      "# ask Sam for numbers => @sam",
      "# review the contract => @alex check security clauses",
      "=> @dana prepares the demo",
    );

    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe(
      [
        "Standup, Monday 16 November 2026",
        "",
        "Actions",
        "- Ask Sam for numbers: Sam",
        "- Check security clauses: Alex",
        "- Prepares the demo: Dana",
      ].join("\n"),
    );
    expect(res!.plain).not.toContain("Marien");
    expect(res!.plain).not.toContain("Review the contract");
  });

  it("row 3: done action (v) goes to Done without an owner", () => {
    const noteText = section("Standup", "v publish release notes");
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe("Standup, Monday 16 November 2026\n\nDone\n- Publish release notes");
  });

  it("row 4: deferred (>) and won't do (x) actions go nowhere", () => {
    const noteText = section("Standup", "> move kickoff to next week", "x drop legacy export");
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(true);
    expect(res!.plain).not.toContain("Move kickoff");
    expect(res!.plain).not.toContain("Drop legacy");
    expect(res!.plain).not.toContain("Actions");
    expect(res!.plain).not.toContain("Done");
  });

  it("row 5: plain follow-up (=> text) goes to Decisions with subject or standalone text", () => {
    const noteText = section(
      "Standup",
      ". Hosting choice => we stay on EU servers",
      "=> freeze schema on Friday",
    );
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe(
      [
        "Standup, Monday 16 November 2026",
        "",
        "Decisions",
        "- Hosting choice: we stay on EU servers",
        "- Freeze schema on Friday",
      ].join("\n"),
    );
  });

  it("row 6: open topic (o) goes to Still open", () => {
    const noteText = section("Standup", "o Q4 roadmap");
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe("Standup, Monday 16 November 2026\n\nStill open\n- Q4 roadmap");
  });

  it("row 7: not-discussed topic (,) goes to Still open with notDiscussed label", () => {
    const noteText = section("Standup", ", Hiring plan");
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe(
      "Standup, Monday 16 November 2026\n\nStill open\n- Hiring plan (not discussed)",
    );
  });

  it("row 8: closed topic (.) goes nowhere itself while its follow-ups are still read", () => {
    const noteText = section(
      "Standup",
      ". Settled topic",
      ". Vendor choice => go with Acme",
    );
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe(
      "Standup, Monday 16 November 2026\n\nDecisions\n- Vendor choice: go with Acme",
    );
    expect(res!.plain).not.toContain("Settled topic");
    expect(res!.plain).not.toContain("Still open");
  });

  it("row 9: remember line (! ) goes to Remember", () => {
    const noteText = section("Standup", "! Office closed next Monday");
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe(
      "Standup, Monday 16 November 2026\n\nRemember\n- Office closed next Monday",
    );
  });

  it("row 10: plain text, bullets, numbered lines, sub-titles, and blanks go nowhere", () => {
    const noteText = section(
      "Standup",
      "Plain narrative line",
      "- bullet item",
      "* star bullet",
      "1. numbered item",
      "Sub-title:",
      "",
    );
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(true);
    for (const ignored of ["Plain narrative", "bullet item", "star bullet", "numbered item", "Sub-title"]) {
      expect(res!.plain).not.toContain(ignored);
    }
  });

  it("formats the title line with and without dateISO", () => {
    const noteText = section("Design review", "o Budget 2027");

    const dated = buildMinutes({
      noteText,
      lineIdx: 0,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "",
      labels: LABELS,
    });
    expect(dated).not.toBeNull();
    expect(dated!.plain.split("\n")[0]).toBe("Design review, Monday 16 November 2026");
    expect(dated!.html).toMatch(/^<p><b>Design review<\/b>, Monday 16 November 2026<\/p>/);

    const undated = buildMinutes({
      noteText,
      lineIdx: 1,
      dateISO: null,
      locale: "en-GB",
      ownerName: "",
      labels: LABELS,
    });
    expect(undated).not.toBeNull();
    expect(undated!.plain.split("\n")[0]).toBe("Design review");
    expect(undated!.html).toMatch(/^<p><b>Design review<\/b><\/p>/);
  });

  it("returns null when lineIdx is outside any section", () => {
    const noteText = [
      "loose line above first section",
      "",
      "Design review",
      "=============",
      "# send notes",
    ].join("\n");

    expect(
      buildMinutes({
        noteText,
        lineIdx: 0,
        dateISO: "2026-11-16",
        locale: "en-GB",
        ownerName: "Marien",
        labels: LABELS,
      }),
    ).toBeNull();

    expect(
      buildMinutes({
        noteText: "just plain lines\nno headings here",
        lineIdx: 0,
        dateISO: "2026-11-16",
        locale: "en-GB",
        ownerName: "Marien",
        labels: LABELS,
      }),
    ).toBeNull();
  });

  it("returns empty: true for a section with only plain text", () => {
    const noteText = section("Standup", "Everyone joined on time.", "Discussed Q4.");
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: "2026-11-16",
      locale: "en-GB",
      ownerName: "Marien",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.empty).toBe(true);
    expect(res!.plain).toContain("Standup");
    expect(res!.plain).not.toContain("Decisions");
    expect(res!.plain).not.toContain("Actions");
  });

  it("escapes < and & in HTML for both the title and entries", () => {
    const noteText = section("R&D <Phase 1", "# compare A & B < C");
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: null,
      locale: "en-GB",
      ownerName: "",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.html).toContain("<p><b>R&amp;D &lt;Phase 1</b></p>");
    expect(res!.html).toContain("<li>Compare A &amp; B &lt; C</li>");
    expect(res!.html).not.toContain("R&D <Phase");
    expect(res!.html).not.toContain("A & B < C");
  });

  it("cleans up forward links, list markers, and preserves @name inside entry text", () => {
    const noteText = section(
      "Sync",
      "- # ping @alex about rollout (>2026-11-23#Sync)",
      ". Scope (<2026-11-10#Sync) => keep v1",
    );
    const res = buildMinutes({
      noteText,
      lineIdx: 2,
      dateISO: null,
      locale: "en-GB",
      ownerName: "",
      labels: LABELS,
    });

    expect(res).not.toBeNull();
    expect(res!.plain).toBe(
      [
        "Sync",
        "",
        "Decisions",
        "- Scope: keep v1",
        "",
        "Actions",
        "- Ping @alex about rollout",
      ].join("\n"),
    );
  });
});
