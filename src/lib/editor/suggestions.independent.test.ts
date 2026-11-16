// @vitest-environment jsdom
import { StateEffect } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";
import type { Suggestion, SuggestionKind } from "../suggestions";
import { createTestEditor, type TestEditor } from "../testing/testEditor";
import { suggestionContext, suggestionsExtension } from "./suggestions";

function contextAt(lineWithCaret: string, nextLineText: string | null) {
  const caretCol = lineWithCaret.indexOf("|");
  if (caretCol === -1) throw new Error(`Missing | caret marker in: ${lineWithCaret}`);
  const lineText = lineWithCaret.slice(0, caretCol) + lineWithCaret.slice(caretCol + 1);
  return suggestionContext(lineText, caretCol, nextLineText);
}

describe("suggestionContext", () => {
  it("recognizes a name prefix inside parentheses", () => {
    expect(contextAt("o coffee rota (@R|", "x")).toMatchObject({
      kind: "name",
      prefix: "R",
    });
  });

  it("returns null for @ without a letter yet", () => {
    expect(contextAt("# ask @|", "x")).toBeNull();
  });

  it("returns null when @ is glued to a word", () => {
    expect(contextAt("mail me at a@b|", "x")).toBeNull();
  });

  it("recognizes a topic prefix after an action symbol", () => {
    expect(contextAt("# (b|", "x")).toMatchObject({
      kind: "topic",
      prefix: "b",
    });
  });

  it("recognizes a topic prefix after a consequence-topic symbol", () => {
    expect(contextAt("# => o (b|", "x")).toMatchObject({
      kind: "topic",
      prefix: "b",
    });
  });

  it("returns null for a parenthesized prefix on a plain line", () => {
    expect(contextAt("plain (b|", "x")).toBeNull();
  });

  it("returns null for a second parenthesized group after the topic tag", () => {
    expect(contextAt("# (budget) more (b|", "x")).toBeNull();
  });

  it("recognizes a section title when the next line is a setext underline", () => {
    expect(contextAt("Board|", "=====")).toMatchObject({
      kind: "title",
      prefix: "Board",
    });
  });

  it("returns null for a plain line not followed by a setext underline", () => {
    expect(contextAt("Board|", "plain")).toBeNull();
  });

  it("returns null after a space ends the name", () => {
    expect(contextAt("# call @Ruth |", "x")).toBeNull();
  });
});

const editors: TestEditor[] = [];

const fixedSource = (kind: SuggestionKind, _prefix: string): Suggestion[] => {
  if (kind === "name") {
    return [
      { insert: "@Ruth", label: "@Ruth", lastUsed: "2026-11-12" },
      { insert: "@Robin", label: "@Robin", lastUsed: "2026-11-03" },
    ];
  }
  if (kind === "topic") {
    return [{ insert: "(budget)", label: "(budget)", lastUsed: "2026-11-15" }];
  }
  return [];
};

function openWithSuggestions(docWithCaret: string, typed: string): TestEditor {
  const ed = createTestEditor({ doc: docWithCaret });
  editors.push(ed);
  ed.view.dispatch({
    effects: StateEffect.appendConfig.of(suggestionsExtension(fixedSource)),
  });
  if (typed) {
    ed.type(typed);
  }
  return ed;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

describe("suggestionsExtension", () => {
  it("Tab inserts the first suggestion", () => {
    const ed = openWithSuggestions("# ask @|", "R");
    expect(ed.press("Tab")).toBe(true);
    expect(ed.text()).toBe("# ask @Ruth");
  });

  it("Enter without an arrow inserts a new line instead of taking a suggestion", () => {
    const ed = openWithSuggestions("# ask @|", "R");
    ed.press("Enter");
    const lines = ed.text().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("# ask @R");
  });

  it("ArrowDown then Enter inserts the second suggestion", () => {
    const ed = openWithSuggestions("# ask @|", "R");
    expect(ed.press("ArrowDown")).toBe(true);
    expect(ed.press("Enter")).toBe(true);
    expect(ed.text()).toBe("# ask @Robin");
  });

  it("Escape closes the list and typing another letter keeps it closed", () => {
    const ed = openWithSuggestions("# ask @|", "R");
    expect(ed.press("Escape")).toBe(true);
    ed.type("u");
    expect(ed.text()).toBe("# ask @Ru");
    expect(ed.view.dom.querySelector('[role="listbox"]')).toBeNull();
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    ed.press("Tab");
    expect(ed.text()).not.toContain("@Ruth");
  });

  it("Tab on a topic with a closing parenthesis after the caret does not double ))", () => {
    const ed = openWithSuggestions("# (|)", "b");
    expect(ed.press("Tab")).toBe(true);
    expect(ed.text()).toBe("# (budget)");
  });
});
