// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { buildListCopy, type CopyRow } from "./listCopy";

describe("buildListCopy (independent)", () => {
  const headerLine = "Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026";

  it("formats the reference example plain output exactly", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Design review",
        depth: 0,
        state: "#",
        text: "(budget) send draft by Fri 20 Nov",
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

    const { plain } = buildListCopy(rows, headerLine);

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

  it("appends progress when folded and omits it when unfolded", () => {
    const foldedRows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Design review",
        depth: 0,
        state: "#",
        text: "(budget) send draft by Fri 20 Nov",
        progress: { resolved: 1, total: 2 },
        folded: true,
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

    expect(buildListCopy(foldedRows, headerLine).plain).toBe(
      [
        "Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026",
        "",
        "Mon 9 Nov · Design review",
        "☐ (budget) send draft by Fri 20 Nov (1/2)",
        "Tue 10 Nov · 1:1 Dana",
        "☐ (budget) check forecast @dana",
      ].join("\n"),
    );

    const unfoldedWithProgress: CopyRow[] = [
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
    ];

    expect(buildListCopy(unfoldedWithProgress, headerLine).plain).toBe(
      [
        "Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026",
        "",
        "Mon 9 Nov · Design review",
        "☐ (budget) send draft by Fri 20 Nov",
      ].join("\n"),
    );
  });

  it("omits box and extra space when state is null", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Notes",
        depth: 0,
        state: null,
        text: "context line",
        folded: false,
      },
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "Notes",
        depth: 1,
        state: null,
        text: "nested context",
        folded: false,
      },
    ];

    const { plain, html } = buildListCopy(rows, "Actions · 15 Nov 2026");

    expect(plain).toBe(
      [
        "Actions · 15 Nov 2026",
        "",
        "Mon 9 Nov · Notes",
        "context line",
        "  nested context",
      ].join("\n"),
    );

    const doc = new DOMParser().parseFromString(html, "text/html");
    const items = Array.from(doc.querySelectorAll("li"));
    expect(items[0].textContent?.trim()).toBe("context line");
    expect(items[1].textContent?.trim()).toBe("nested context");
  });

  it("omits the separator when section is empty", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "",
        depth: 0,
        state: "#",
        text: "top-level action",
        folded: false,
      },
    ];

    const { plain, html } = buildListCopy(rows, "Actions · 15 Nov 2026");

    expect(plain).toBe(
      [
        "Actions · 15 Nov 2026",
        "",
        "Mon 9 Nov",
        "☐ top-level action",
      ].join("\n"),
    );

    const doc = new DOMParser().parseFromString(html, "text/html");
    const headingBold = doc.querySelector("p b");
    expect(headingBold?.textContent).toBe("Mon 9 Nov");
  });

  it("renders each action state with its box character", () => {
    const rows: CopyRow[] = [
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "States", depth: 0, state: "#", text: "open", folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "States", depth: 0, state: "v", text: "done", folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "States", depth: 0, state: "x", text: "wont do", folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "States", depth: 0, state: ">", text: "deferred", folded: false },
    ];

    const { plain, html } = buildListCopy(rows, "Actions · 15 Nov 2026");

    expect(plain).toBe(
      [
        "Actions · 15 Nov 2026",
        "",
        "Mon 9 Nov · States",
        "☐ open",
        "☑ done",
        "☒ wont do",
        "▷ deferred",
      ].join("\n"),
    );

    const doc = new DOMParser().parseFromString(html, "text/html");
    const liTexts = Array.from(doc.querySelectorAll("ul > li")).map((li) => li.textContent?.trim());
    expect(liTexts).toEqual(["☐ open", "☑ done", "☒ wont do", "▷ deferred"]);
  });

  it("starts a new heading whenever the (dateLabel, section) pair changes, with no blank lines between groups", () => {
    const rows: CopyRow[] = [
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "Alpha", depth: 0, state: "#", text: "first", folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "Alpha", depth: 0, state: "#", text: "second", folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "Beta", depth: 0, state: "#", text: "same date new section", folded: false },
      { dateISO: "2026-11-10", dateLabel: "Tue 10 Nov", section: "Beta", depth: 0, state: "#", text: "new date same section", folded: false },
    ];

    const { plain, html } = buildListCopy(rows, "Actions · 15 Nov 2026");

    expect(plain).toBe(
      [
        "Actions · 15 Nov 2026",
        "",
        "Mon 9 Nov · Alpha",
        "☐ first",
        "☐ second",
        "Mon 9 Nov · Beta",
        "☐ same date new section",
        "Tue 10 Nov · Beta",
        "☐ new date same section",
      ].join("\n"),
    );

    const doc = new DOMParser().parseFromString(html, "text/html");
    const headings = Array.from(doc.querySelectorAll("p b")).map((b) => b.textContent);
    expect(headings).toEqual(["Mon 9 Nov · Alpha", "Mon 9 Nov · Beta", "Tue 10 Nov · Beta"]);
  });

  it("nests HTML <ul> lists according to row depths 0-1-1-0", () => {
    const rows: CopyRow[] = [
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "Tree", depth: 0, state: "#", text: "parent", folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "Tree", depth: 1, state: "#", text: "child one", step: 1, folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "Tree", depth: 1, state: "v", text: "child two", step: 2, folded: false },
      { dateISO: "2026-11-09", dateLabel: "Mon 9 Nov", section: "Tree", depth: 0, state: "#", text: "sibling", folded: false },
    ];

    const { html } = buildListCopy(rows, "Actions · 15 Nov 2026");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const topChildren = Array.from(doc.body.children);
    expect(topChildren[0].tagName).toBe("P");
    expect(topChildren[0].textContent).toBe("Actions · 15 Nov 2026");
    expect(topChildren[1].tagName).toBe("P");
    expect(topChildren[1].querySelector("b")?.textContent).toBe("Mon 9 Nov · Tree");
    expect(topChildren[2].tagName).toBe("UL");

    const ownText = (li: Element) => {
      const clone = li.cloneNode(true) as Element;
      clone.querySelectorAll("ul").forEach((u) => u.remove());
      return clone.textContent?.trim() ?? "";
    };

    const topUl = topChildren[2];
    const topItems = Array.from(topUl.querySelectorAll(":scope > li"));
    expect(topItems).toHaveLength(2);
    expect(ownText(topItems[0])).toBe("☐ parent");
    expect(ownText(topItems[1])).toBe("☐ sibling");

    const nestedUl = topUl.querySelector("ul");
    expect(nestedUl).not.toBeNull();
    const nestedItems = Array.from(nestedUl!.querySelectorAll(":scope > li"));
    expect(nestedItems).toHaveLength(2);
    expect(nestedItems[0].textContent?.trim()).toBe("☐ 1. child one");
    expect(nestedItems[1].textContent?.trim()).toBe("☑ 2. child two");
    expect(nestedUl!.querySelector("ul")).toBeNull();
  });

  it("escapes < and & in HTML output across header, headings, and rows", () => {
    const rows: CopyRow[] = [
      {
        dateISO: "2026-11-09",
        dateLabel: "Mon 9 Nov",
        section: "R&D <alpha>",
        depth: 0,
        state: "#",
        text: "compare a < b & c",
        folded: false,
      },
    ];

    const { plain, html } = buildListCopy(rows, "Actions · q:<foo & bar>");

    expect(plain).toContain("Actions · q:<foo & bar>");
    expect(plain).toContain("Mon 9 Nov · R&D <alpha>");
    expect(plain).toContain("☐ compare a < b & c");

    expect(html).not.toContain("<foo");
    expect(html).not.toContain("<alpha>");
    expect(html).not.toContain("a < b");
    expect(html).toContain("&lt;foo &amp; bar&gt;");
    expect(html).toContain("R&amp;D &lt;alpha&gt;");
    expect(html).toContain("compare a &lt; b &amp; c");

    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("p")?.textContent).toBe("Actions · q:<foo & bar>");
    expect(doc.querySelector("p b")?.textContent).toBe("Mon 9 Nov · R&D <alpha>");
    expect(doc.querySelector("li")?.textContent?.trim()).toBe("☐ compare a < b & c");
  });
});
