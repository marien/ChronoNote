import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cleanUrlMatch, clickableLinksPlugin } from "./clickableLinks";

describe("cleanUrlMatch", () => {
  it("recognizes standard https and http URLs", () => {
    expect(cleanUrlMatch("https://github.com/marien/ChronoNote")).toEqual({
      url: "https://github.com/marien/ChronoNote",
      length: 36,
    });
    expect(cleanUrlMatch("http://localhost:5173/app?tab=daily")).toEqual({
      url: "http://localhost:5173/app?tab=daily",
      length: 35,
    });
  });

  it("strips trailing sentence punctuation", () => {
    expect(cleanUrlMatch("https://example.com.")?.url).toBe("https://example.com");
    expect(cleanUrlMatch("https://example.com,")?.url).toBe("https://example.com");
    expect(cleanUrlMatch("https://example.com;")?.url).toBe("https://example.com");
    expect(cleanUrlMatch("https://example.com:")?.url).toBe("https://example.com");
    expect(cleanUrlMatch("https://example.com!")?.url).toBe("https://example.com");
    expect(cleanUrlMatch("https://example.com?")?.url).toBe("https://example.com");
  });

  it("handles parenthesized URLs correctly", () => {
    // Closing paren in sentence: (https://example.com)
    expect(cleanUrlMatch("https://example.com)")?.url).toBe("https://example.com");
    // URL with internal balanced parentheses (e.g. Wikipedia):
    expect(cleanUrlMatch("https://en.wikipedia.org/wiki/Rust_(programming_language)")?.url).toBe(
      "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    );
    // URL with balanced internal paren plus trailing sentence paren:
    expect(cleanUrlMatch("https://en.wikipedia.org/wiki/Rust_(programming_language))")?.url).toBe(
      "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    );
  });

  it("rejects non-http/https protocols", () => {
    expect(cleanUrlMatch("ftp://example.com")).toBeNull();
    expect(cleanUrlMatch("file:///c:/test")).toBeNull();
    expect(cleanUrlMatch("not a url")).toBeNull();
  });
});

describe("clickableLinksPlugin", () => {
  it("decorates URLs with cm-link and data-url attribute without altering document text", () => {
    const doc = "# Review PR at https://github.com/marien/ChronoNote for details";
    const state = EditorState.create({
      doc,
      extensions: [clickableLinksPlugin],
    });
    const view = new EditorView({ state });

    const plugin = view.plugin(clickableLinksPlugin);
    expect(plugin).toBeDefined();

    let matchedCount = 0;
    let decoratedFrom = -1;
    let decoratedTo = -1;
    let dataUrl = "";

    plugin!.decorations.between(0, doc.length, (from, to, value) => {
      matchedCount++;
      decoratedFrom = from;
      decoratedTo = to;
      dataUrl = (value.spec.attributes as Record<string, string>)?.["data-url"];
    });

    expect(matchedCount).toBe(1);
    expect(doc.slice(decoratedFrom, decoratedTo)).toBe("https://github.com/marien/ChronoNote");
    expect(dataUrl).toBe("https://github.com/marien/ChronoNote");

    // Document length and character offsets remain 100% exact (zero column drift)
    expect(view.state.doc.toString()).toBe(doc);
    expect(decoratedFrom).toBe(15);
    expect(decoratedTo).toBe(51);
  });
});
