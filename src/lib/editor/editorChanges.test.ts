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

  it("never splits UTF-16 surrogate pairs on outside edits", () => {
    const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
    const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
    const hasLoneSurrogate = (s: string) => {
      if (s.includes("\uFFFD")) return true;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (isHigh(c)) {
          if (i + 1 >= s.length || !isLow(s.charCodeAt(i + 1))) return true;
          i++;
        } else if (isLow(c)) {
          return true;
        }
      }
      return false;
    };
    const isInsideSurrogatePair = (s: string, idx: number) =>
      idx > 0 && idx < s.length && isHigh(s.charCodeAt(idx - 1)) && isLow(s.charCodeAt(idx));

    const cases: [string, string][] = [
      ["\uD83D\uDCC5 meeting", "\uD83D\uDCC6 meeting"],
      ["\uD83D\uDCC5 meeting", "\uD83D\uDCC5! meeting"],
      ["\uD83D\uDCC5", "\uD83D\uDCC5!"],
      ["\uD83D\uDCC5", "\uD83D\uDCC6\uD83D\uDCC5"],
      ["\uD83D\uDE00\uD83D\uDE00", "\uD83D\uDE00\uD83D\uDE03\uD83D\uDE00"],
      ["\uD83D\uDCC5", "\uD83E\uDCC5"],
      ["\uD83D\uDCC5\uD83D\uDCC6", "\uD83D\uDCC5"],
      ["line 1\n\uD83D\uDCC5 sync @Dana\nline 3", "line 1\n\uD83D\uDCC6 sync @Dana\nline 3"],
    ];

    for (const [oldText, newText] of cases) {
      const changes = editorChanges(oldText, newText);
      expect(changes.length).toBeGreaterThan(0);
      for (const c of changes) {
        expect(isInsideSurrogatePair(oldText, c.from), `from inside surrogate for ${oldText} -> ${newText}`).toBe(false);
        expect(isInsideSurrogatePair(oldText, c.to), `to inside surrogate for ${oldText} -> ${newText}`).toBe(false);
        expect(hasLoneSurrogate(c.insert), `lone surrogate in insert for ${oldText} -> ${newText}`).toBe(false);
      }
      const after = apply(oldText, 0, newText);
      expect(after.doc).toBe(newText);
      expect(hasLoneSurrogate(after.doc)).toBe(false);
    }
  });

  it("keeps caret on same text on a 5,000-line note with a 1-line edit far away", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `item line ${i + 1}`);
    const oldText = lines.join("\n");
    const targetLine = "item line 4900";
    const caret = oldText.indexOf(targetLine) + 5;
    const edited = [...lines];
    edited[9] = "item line 10 edited from phone";
    const newText = edited.join("\n");

    const changes = editorChanges(oldText, newText);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.from).toBeLessThan(oldText.indexOf("item line 11"));

    const after = apply(oldText, caret, newText);
    expect(after.doc).toBe(newText);
    expect(after.doc.slice(after.caret - 5, after.caret + targetLine.length - 5)).toBe(targetLine);
  });
});
