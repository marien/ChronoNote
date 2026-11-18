// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Suggestion, SuggestionKind } from "../suggestions";
import { createTestEditor, type TestEditor } from "../testing/testEditor";
import { formatSuggestionDate, suggestionContext, suggestionsExtension } from "./suggestions";

const editors: TestEditor[] = [];

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

function openEditor(doc: string, source: (kind: SuggestionKind, prefix: string) => Suggestion[]): TestEditor {
  const ed = createTestEditor({
    doc,
    ui: {
      afterFilters: [
        suggestionsExtension(source, {
          today: () => "2026-11-16",
          noteDate: () => "2026-11-16",
          locale: () => "en",
        }),
      ],
    },
  });
  editors.push(ed);
  return ed;
}

const FIXED_SOURCE = (kind: SuggestionKind, prefix: string): Suggestion[] => {
  const p = prefix.toLowerCase();
  if (kind === "name") {
    return [
      { insert: "@Ruth", label: "@Ruth", lastUsed: "2026-11-14" },
      { insert: "@Robin", label: "@Robin", lastUsed: "2026-11-03" },
      { insert: "@Rosa", label: "@Rosa", lastUsed: "2026-10-12" },
    ].filter((r) => r.insert.slice(1).toLowerCase().startsWith(p));
  }
  if (kind === "topic") {
    return [
      { insert: "(budget)", label: "(budget)", lastUsed: "2026-11-15" },
      { insert: "(building)", label: "(building)", lastUsed: "2026-11-02" },
    ].filter((r) => r.insert.slice(1, -1).toLowerCase().startsWith(p));
  }
  return [
    { insert: "[14:00 - 15:00] Board review", label: "[14:00 - 15:00] Board review", lastUsed: null, meetingToday: true },
    { insert: "Board meeting", label: "Board meeting", lastUsed: "2026-11-04" },
  ].filter((r) => r.insert.toLowerCase().includes(p));
};

describe("suggestionContext", () => {
  it("matches every row of step 3's table", () => {
    expect(suggestionContext("o coffee rota (@R", 17, null)).toEqual({
      kind: "name",
      prefix: "R",
      from: 15,
      to: 17,
    });
    expect(suggestionContext("# ask @", 7, null)).toBeNull();
    expect(suggestionContext("mail me at a@b", 14, null)).toBeNull();
    expect(suggestionContext("# (b", 4, null)).toEqual({
      kind: "topic",
      prefix: "b",
      from: 2,
      to: 4,
    });
    expect(suggestionContext("# => o (b", 9, null)).toEqual({
      kind: "topic",
      prefix: "b",
      from: 7,
      to: 9,
    });
    expect(suggestionContext("plain (b", 8, null)).toBeNull();
    expect(suggestionContext("# (budget) more (b", 18, null)).toBeNull();
    expect(suggestionContext("Board", 5, "=====")).toEqual({
      kind: "title",
      prefix: "Board",
      from: 0,
      to: 5,
    });
    expect(suggestionContext("Board", 5, "plain")).toBeNull();
    expect(suggestionContext("# call @Ruth ", 13, null)).toBeNull();
  });

  it("handles Unicode NAME_CHAR and non-empty selection cases", () => {
    expect(suggestionContext("# @René", 7, null)).toEqual({
      kind: "name",
      prefix: "René",
      from: 2,
      to: 7,
    });
    expect(suggestionContext("# @jean-luc", 11, null)).toEqual({
      kind: "name",
      prefix: "jean-luc",
      from: 2,
      to: 11,
    });
    expect(suggestionContext("# call @Ru", 10, null)).toEqual({
      kind: "name",
      prefix: "Ru",
      from: 7,
      to: 10,
    });
    // Mid-word caret should not trigger replacement
    expect(suggestionContext("# call @Ruth", 10, null)).toBeNull();
  });
});

describe("formatSuggestionDate", () => {
  const labels = {
    today: "today",
    yesterday: "yesterday",
    meetingToday: "today's meeting",
    listLabel: "Suggestions",
  };

  it("formats today, yesterday, within 6 days, same year, other year, and meetingToday", () => {
    expect(
      formatSuggestionDate(
        { insert: "x", label: "x", lastUsed: null, meetingToday: true },
        { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
      ),
    ).toBe("today's meeting");
    expect(
      formatSuggestionDate(
        { insert: "x", label: "x", lastUsed: "2026-11-16" },
        { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
      ),
    ).toBe("today");
    expect(
      formatSuggestionDate(
        { insert: "x", label: "x", lastUsed: "2026-11-15" },
        { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
      ),
    ).toBe("yesterday");
    // 2026-11-12 is Thursday (4 days before Monday 2026-11-16)
    expect(
      formatSuggestionDate(
        { insert: "x", label: "x", lastUsed: "2026-11-12" },
        { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
      ),
    ).toBe("Thu");
    // 2026-11-03 is >6 days ago, same year
    const sameYear = formatSuggestionDate(
      { insert: "x", label: "x", lastUsed: "2026-11-03" },
      { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
    );
    expect(sameYear).toMatch(/3.*Nov|Nov.*3/);
    expect(sameYear).not.toContain("2026");

    // 2025-11-03 is a different year from noteDate 2026-11-16
    const otherYear = formatSuggestionDate(
      { insert: "x", label: "x", lastUsed: "2025-11-03" },
      { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
    );
    expect(otherYear).toContain("2025");
    expect(
      formatSuggestionDate(
        { insert: "@Dana", label: "@Dana", lastUsed: null, invited: true },
        { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
      ),
    ).toBe("invited");
    expect(
      formatSuggestionDate(
        { insert: "@Dana", label: "@Dana", lastUsed: "2026-11-12", invited: true },
        { today: "2026-11-16", noteDate: "2026-11-16", locale: "en", labels },
      ),
    ).toBe("Thu");
  });
});

describe("suggestionsExtension", () => {
  it("Tab takes the selected row and updates aria-activedescendant", () => {
    const ed = openEditor("# ask @|", FIXED_SOURCE);
    expect(ed.view.contentDOM.getAttribute("aria-activedescendant")).toBeNull();

    ed.type("R");
    const activeId = ed.view.contentDOM.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const listbox = ed.view.dom.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox?.querySelector(`#${activeId}`)?.getAttribute("aria-selected")).toBe("true");

    expect(ed.press("Tab")).toBe(true);
    expect(ed.caret()).toBe("# ask @Ruth|");
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();
    expect(ed.view.contentDOM.getAttribute("aria-activedescendant")).toBeNull();

    // Normal undo step reverts the accepted suggestion cleanly
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe("# ask @R");
  });

  it("Enter without an arrow makes a new line and leaves @R", () => {
    const ed = openEditor("# ask @|", FIXED_SOURCE);
    ed.type("R");
    expect(ed.view.dom.querySelector('[role="listbox"]')).not.toBeNull();

    ed.press("Enter");
    expect(ed.text()).toBe("# ask @R\n# ");
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();
  });

  it("leaves out a title suggestion equal to the title already on the line (#252)", () => {
    const complete = openEditor("Board meetin|\n=============", FIXED_SOURCE);
    complete.type("g");
    expect(complete.view.dom.querySelector('[role="listbox"]')).toBeNull();

    const middle = openEditor("Boar| meeting\n=============", FIXED_SOURCE);
    middle.type("d");
    const labels = [...middle.view.dom.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain("Board review");

    const partial = openEditor("Board meet|\n=============", FIXED_SOURCE);
    partial.type("i");
    expect(partial.view.dom.querySelectorAll('[role="option"]')).toHaveLength(1);
  });

  it("does not open a title's list when the caret only moves into the title (#252)", () => {
    const listbox = (e: TestEditor) => e.view.dom.querySelector('[role="listbox"]');

    // Clicking into the middle of a title already there: the text before the caret matches other titles
    const ed = openEditor("Board meeting\n=============\n# ask |", FIXED_SOURCE);
    ed.select(4);
    expect(listbox(ed)).toBeNull();
    ed.select(13);
    expect(listbox(ed)).toBeNull();

    // Typing in it opens the list; moving the caret within the title then keeps it open
    ed.select(4);
    ed.type("d");
    expect(listbox(ed)).not.toBeNull();
    ed.select(3);
    expect(listbox(ed)).not.toBeNull();

    // Leaving the title closes it, and coming back by caret alone does not reopen it
    ed.select(ed.text().length);
    expect(listbox(ed)).toBeNull();
    ed.select(4);
    expect(listbox(ed)).toBeNull();
  });

  it("ArrowDown then Enter takes the second row", () => {
    const ed = openEditor("# ask @|", FIXED_SOURCE);
    ed.type("R");
    expect(ed.press("ArrowDown")).toBe(true);
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("# ask @Robin|");
  });

  it("ArrowUp from first row wraps to the last row", () => {
    const ed = openEditor("# ask @|", FIXED_SOURCE);
    ed.type("R");
    expect(ed.press("ArrowUp")).toBe(true);
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("# ask @Rosa|");
  });

  it("Escape closes, and typing another letter does not reopen until a new word starts", () => {
    const ed = openEditor("# ask @|", FIXED_SOURCE);
    ed.type("R");
    expect(ed.view.dom.querySelector('[role="listbox"]')).not.toBeNull();

    expect(ed.press("Escape")).toBe(true);
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();

    ed.type("o");
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();

    ed.type(" @R");
    expect(ed.view.dom.querySelector('[role="listbox"]')).not.toBeNull();
    expect(ed.press("Tab")).toBe(true);
    expect(ed.text()).toBe("# ask @Ro @Ruth");
  });

  it("taking a topic before an existing ) gives (budget), never (budget))", () => {
    const ed = openEditor("# (|)", FIXED_SOURCE);
    ed.type("b");
    expect(ed.view.dom.querySelector('[role="listbox"]')).not.toBeNull();
    expect(ed.press("Tab")).toBe(true);
    expect(ed.caret()).toBe("# (budget)|");
  });

  it("does not open when selection is non-empty", () => {
    const ed = openEditor("# ask [@R]", FIXED_SOURCE);
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();
  });

  it("clicking a row takes it and blur closes the list", () => {
    const ed = openEditor("# ask @|", FIXED_SOURCE);
    ed.type("R");
    const options = ed.view.dom.querySelectorAll('[role="option"]');
    expect(options.length).toBe(3);
    (options[1] as HTMLElement).click();
    expect(ed.caret()).toBe("# ask @Robin|");

    ed.type(" @R");
    expect(ed.view.dom.querySelector('[role="listbox"]')).not.toBeNull();
    ed.view.contentDOM.dispatchEvent(new FocusEvent("blur"));
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();
  });

  it("with no list open, Tab on a numbered list line still does what it did", () => {
    const ed = openEditor("|1. a\n2. b\n3. c", FIXED_SOURCE);
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();
    ed.press("Tab");
    expect(ed.text()).toBe("  1. a\n  2. b\n  3. c");
  });
});
