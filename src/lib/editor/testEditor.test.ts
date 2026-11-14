import { afterEach, describe, expect, it } from "vitest";
import { createTestEditor, type TestEditor } from "../testing/testEditor";

const editors: TestEditor[] = [];

function openEditor(doc: string, anchor?: number, head?: number): TestEditor {
  const ed = createTestEditor({ doc, anchor, head });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

describe("testEditor harness smoke tests", () => {
  it("Enter at the end of '- item' continues the bullet and undo restores text and caret", () => {
    const ed = openEditor("- item|");
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("- item\n- |");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("- item|");
  });

  it("Enter at the end of '# task' continues as open action and undo restores text and caret", () => {
    const ed = openEditor("# task|");
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("# task\n# |");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("# task|");
  });

  it("Enter at the end of 'o topic' continues as open topic and undo restores text and caret", () => {
    const ed = openEditor("o topic|");
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("o topic\no |");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("o topic|");
  });

  it("Enter at the end of '1. one' increments number and undo restores text and caret", () => {
    const ed = openEditor("1. one|");
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("1. one\n2. |");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("1. one|");
  });

  it("Enter at the end of '=> next' continues follow-up and undo restores text and caret", () => {
    const ed = openEditor("=> next|");
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("=> next\n=> |");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("=> next|");
  });

  it("Enter on an empty '- ' exits the bullet list and undo restores text and caret", () => {
    const ed = openEditor("- |");
    expect(ed.press("Enter")).toBe(true);
    expect(ed.caret()).toBe("|");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("- |");
  });

  it("Shift-Enter on '- item' inserts indented continuation line and undo restores text and caret", () => {
    const ed = openEditor("- item|");
    expect(ed.press("Shift-Enter")).toBe(true);
    expect(ed.caret()).toBe("- item\n  |");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("- item|");
  });

  it("Mod-1 and Mod-2 on prose promote to # / v and undo restores text and caret", () => {
    const ed1 = openEditor("write tests|");
    expect(ed1.press("Mod-1")).toBe(true);
    expect(ed1.caret()).toBe("# write tests|");
    expect(ed1.undo()).toBe(true);
    expect(ed1.caret()).toBe("write tests|");

    const ed2 = openEditor("write tests|");
    expect(ed2.press("Mod-2")).toBe(true);
    expect(ed2.caret()).toBe("v write tests|");
    expect(ed2.undo()).toBe(true);
    expect(ed2.caret()).toBe("write tests|");
  });

  it("Mod-1 on '# task' leaves it unchanged and Mod-2 marks it done with undo restoring text and caret", () => {
    const ed1 = openEditor("# task|");
    expect(ed1.press("Mod-1")).toBe(true);
    expect(ed1.caret()).toBe("# task|");

    const ed2 = openEditor("# task|");
    expect(ed2.press("Mod-2")).toBe(true);
    expect(ed2.caret()).toBe("v task|");
    expect(ed2.undo()).toBe(true);
    expect(ed2.caret()).toBe("# task|");
  });

  it("Mod-Shift-s turns a line into a setext section and undo restores text and caret", () => {
    const ed = openEditor("Title|");
    expect(ed.press("Mod-Shift-s")).toBe(true);
    expect(ed.caret()).toBe("Title\n=====\n|");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("Title|");
  });

  it("Alt-ArrowDown moves the line down and undo restores text and caret", () => {
    const ed = openEditor("first|\nsecond");
    expect(ed.press("Alt-ArrowDown")).toBe(true);
    expect(ed.caret()).toBe("second\nfirst|");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("first|\nsecond");
  });

  it("Tab on '1. a' / '2. b' indents the numbered item and undo restores text and caret", () => {
    const ed = openEditor("1. a\n2. b|");
    expect(ed.press("Tab")).toBe(true);
    expect(ed.caret()).toBe("1. a\n   1. b|");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("1. a\n2. b|");
  });

  it("typing '# ' at the start of an empty line keeps the glyph as plain text and undo restores", () => {
    const ed = openEditor("|");
    ed.type("# ");
    expect(ed.text()).toBe("# ");
    expect(ed.caret()).toBe("# |");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("|");
  });

  it("pasting '# call Dana' over an empty '# ' merges the marker and undo restores text and caret", () => {
    const ed = openEditor("# |");
    ed.paste("# call Dana");
    expect(ed.caret()).toBe("# call Dana|");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("# |");
  });

  it("supports selection markers, select(), and redo()", () => {
    const ed = openEditor("[# a\n# b]");
    expect(ed.caret()).toBe("[# a\n# b]");
    expect(ed.press("Mod-2")).toBe(true);
    expect(ed.text()).toBe("v a\nv b");
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe("# a\n# b");
    expect(ed.redo()).toBe(true);
    expect(ed.text()).toBe("v a\nv b");
    ed.select(0, 3);
    expect(ed.caret()).toBe("[v a]\nv b");
  });
});
