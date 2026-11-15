import { describe, expect, it } from "vitest";
import { buildListCopy, cleanCopyText, type CopyRow } from "./listCopy";

describe("buildListCopy", () => {
  const referenceRows: CopyRow[] = [
    {
      dateISO: "2026-11-09",
      dateLabel: "Mon 9 Nov",
      section: "Design review",
      depth: 0,
      state: "#",
      text: "(budget) send draft by Fri 20 Nov",
      progress: { resolved: 1, total: 2 },
      folded: false,
    },
    {
      dateISO: "2026-11-09",
      dateLabel: "Mon 9 Nov",
      section: "Design review",
      depth: 1,
      state: "#",
      text: "numbers from Sam",
      step: 1,
      folded: false,
    },
    {
      dateISO: "2026-11-09",
      dateLabel: "Mon 9 Nov",
      section: "Design review",
      depth: 1,
      state: "v",
      text: "template",
      step: 2,
      folded: false,
    },
    {
      dateISO: "2026-11-10",
      dateLabel: "Tue 10 Nov",
      section: "1:1 Dana",
      depth: 0,
      state: "#",
      text: "(budget) check forecast @dana",
      folded: false,
    },
  ];
  const referenceHeader = "Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026";

  it("produces the exact reference example in plain text", () => {
    const { plain } = buildListCopy(referenceRows, referenceHeader);
    expect(plain).toBe(
      [
        "Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026",
        "",
        "Mon 9 Nov · Design review",
        "☐ (budget) send draft by Fri 20 Nov",
        "  ☐ 1. numbers from Sam",
        "  ☑ 2. template",
        "Tue 10 Nov · 1:1 Dana",
        "☐ (budget) check forecast @dana",
      ].join("\n"),
    );
  });

  it("renders the folded variant with progress and without children", () => {
    const foldedRows: CopyRow[] = [
      {
        ...referenceRows[0],
        folded: true,
        progress: { resolved: 1, total: 2 },
      },
      referenceRows[3],
    ];
    const { plain } = buildListCopy(foldedRows, referenceHeader);
    expect(plain).toBe(
      [
        "Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026",
        "",
        "Mon 9 Nov · Design review",
        "☐ (budget) send draft by Fri 20 Nov (1/2)",
        "Tue 10 Nov · 1:1 Dana",
        "☐ (budget) check forecast @dana",
      ].join("\n"),
    );
  });

  it("omits box and extra space when state is null, and uses ☒ / ▷ for x / >", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Standup",
        depth: 0,
        state: null,
        text: "@Dana review API",
        folded: false,
      },
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Standup",
        depth: 0,
        state: ">",
        text: "forwarded item",
        folded: false,
      },
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Standup",
        depth: 0,
        state: "x",
        text: "dropped item",
        folded: false,
      },
    ];
    const { plain, html } = buildListCopy(rows, "Actions · 15 Nov 2026");
    expect(plain).toBe(
      [
        "Actions · 15 Nov 2026",
        "",
        "Mon 9 Nov · Standup",
        "@Dana review API",
        "▷ forwarded item",
        "☒ dropped item",
      ].join("\n"),
    );
    expect(html).toContain("<li>@Dana review API</li><li>▷ forwarded item</li><li>☒ dropped item</li>");
  });

  it("uses dateLabel only as heading when section is empty", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "",
        depth: 0,
        state: "#",
        text: "loose task",
        folded: false,
      },
    ];
    const { plain, html } = buildListCopy(rows, "Actions · 15 Nov 2026");
    expect(plain).toBe(["Actions · 15 Nov 2026", "", "Mon 9 Nov", "☐ loose task"].join("\n"));
    expect(html).toBe("<p>Actions · 15 Nov 2026</p><p><b>Mon 9 Nov</b></p><ul><li>☐ loose task</li></ul>");
  });

  it("nests HTML <ul><li> elements for depth sequence 0-1-1-0", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Design review",
        depth: 0,
        state: "#",
        text: "parent",
        folded: false,
      },
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Design review",
        depth: 1,
        state: "#",
        text: "child 1",
        step: 1,
        folded: false,
      },
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Design review",
        depth: 1,
        state: "v",
        text: "child 2",
        step: 2,
        folded: false,
      },
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Design review",
        depth: 0,
        state: "#",
        text: "sibling",
        folded: false,
      },
    ];
    const { html } = buildListCopy(rows, "Actions · 15 Nov 2026");
    expect(html).toBe(
      "<p>Actions · 15 Nov 2026</p>" +
        "<p><b>Mon 9 Nov · Design review</b></p>" +
        "<ul>" +
        "<li>☐ parent" +
        "<ul>" +
        "<li>☐ 1. child 1</li>" +
        "<li>☑ 2. child 2</li>" +
        "</ul>" +
        "</li>" +
        "<li>☐ sibling</li>" +
        "</ul>",
    );
  });

  it("escapes < and HTML special characters in header, headings, and row text", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "A < B",
        depth: 0,
        state: "#",
        text: "check x < y & z",
        folded: false,
      },
    ];
    const { html } = buildListCopy(rows, "Actions · <tag> · 15 Nov 2026");
    expect(html).toBe(
      "<p>Actions · &lt;tag&gt; · 15 Nov 2026</p>" +
        "<p><b>Mon 9 Nov · A &lt; B</b></p>" +
        "<ul><li>☐ check x &lt; y &amp; z</li></ul>",
    );
  });
});

describe("cleanCopyText", () => {
  it("strips forward links and rewrites by:YYYY-MM-DD while preserving topic tags and @names", () => {
    const line = "# (budget) send draft by:2026-11-20 @dana (>2026-11-21#Next)";
    const cleaned = cleanCopyText(
      {
        line,
        kind: "line",
        whole: false,
        partFrom: 0,
        partTo: line.length,
      },
      "en-GB",
    );
    expect(cleaned).toBe("(budget) send draft by Fri 20 Nov @dana");
  });

  it("strips leading (<...) links and middle forward links without leaving double spaces", () => {
    const line = "# (<2026-11-08) send (<2026-11-09#Plan) draft (>2026-11-12)";
    const cleaned = cleanCopyText(
      {
        line,
        kind: "line",
        whole: false,
        partFrom: 0,
        partTo: line.length,
      },
      "en-GB",
    );
    expect(cleaned).toBe("send draft");
  });

  it("works for step items and WeekReviewItem shapes", () => {
    const line = "# parent by:2026-11-20 => # step one (>2026-11-21)";
    const cleaned = cleanCopyText(
      {
        line,
        itemKind: "step",
        whole: false,
        partFrom: 25,
        partTo: line.length,
      },
      "en-GB",
    );
    expect(cleaned).toBe("step one");
  });
});
