import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { editorChanges } from "./editorChanges";

function apply(doc: string, caret: number, next: string): { doc: string; caret: number } {
  const state = EditorState.create({ doc, selection: { anchor: caret } });
  const tr = state.update({ changes: editorChanges(doc, next) });
  return { doc: tr.state.doc.toString(), caret: tr.state.selection.main.head };
}

describe("editorChanges", () => {
  it("is empty when the text is the same", () => {
    expect(editorChanges("a\nb", "a\nb")).toEqual([]);
  });

  it("replaces only the characters that differ", () => {
    expect(editorChanges("# one\n# two\n# three", "# one\nv two\n# three")).toEqual([{ from: 6, to: 7, insert: "v" }]);
  });

  it("gives every result the new text", () => {
    const cases: [string, string][] = [
      ["a\nb", "a\nb\nc"],
      ["a\nb", "z\na\nb"],
      ["a\nb\n", "a\nb\nc\n"],
      ["a\nb\nc", "a\nc"],
      ["a\nb\nc", "b\nc"],
      ["a\nb\nc", "a\nb"],
      ["a\nb\nc\n", "a\nb\n"],
      ["abc", "xyz"],
      ["", "x\ny"],
      ["x\ny", ""],
      ["aaa", "aa"],
      ["a\na\na", "a\na"],
      ["a\nb\nc\nd\ne", "x\nb\nd\ny\ne\nf"],
      ["one\ntwo\nthree\nfour", "four\nthree\ntwo\none"],
    ];
    for (const [a, b] of cases) {
      for (let caret = 0; caret <= a.length; caret++) expect(apply(a, caret, b).doc, `${a} -> ${b}`).toBe(b);
    }
  });

  it("keeps the caret on its line when lines above and below it change", () => {
    const doc = "Planning\n========\n# ask Dana\n- one\n- two\n# book room\n- three\n";
    const caret = doc.indexOf("book") + 2;
    const next = doc.replace("# ask Dana", "v ask Dana").replace("- three\n", "- three\n# from the phone\n");
    const after = apply(doc, caret, next);
    expect(after.doc).toBe(next);
    expect(after.caret).toBe(caret);
    const inserted = apply(doc, caret, doc.replace("- one\n", "- one\n# new line\n").replace("- three", "x three"));
    expect(inserted.doc.slice(inserted.caret - 2, inserted.caret + 2)).toBe("book");
  });
});
