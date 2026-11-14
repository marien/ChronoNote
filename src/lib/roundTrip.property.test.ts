// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { sha256Hex } from "./hash";
import { normalizeNoteText } from "./noteText";
import { installIdbStub } from "./testing/idbStub";
import { MockBackend } from "./testing/mockBackend";
import { createTestEditor, type TestEditor } from "./testing/testEditor";
import { WebBackend } from "./webapp/webBackend";

const FILENAME = "2026-01-05.txt";
const editors: TestEditor[] = [];

function openTestEditor(doc: string): TestEditor {
  const ed = createTestEditor({ doc });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Valid UTF-16 caret offsets in `s` (never splitting a surrogate pair). */
function validCaretPositions(s: string): number[] {
  const out: number[] = [0];
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && isHighSurrogate(s.charCodeAt(i - 1)) && isLowSurrogate(s.charCodeAt(i))) {
      continue;
    }
    out.push(i);
  }
  return out;
}

/** Reference normalization from docs/spec.md & storage.rs: strip at most one leading BOM, convert CRLF and CR to LF. */
function expectedNormalized(raw: string): string {
  const noBom = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  return noBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const chunkArb = fc.constantFrom(
  "task",
  "meeting notes",
  "alpha",
  "\t",
  "   ",
  "caf\u0065\u0301",
  "na\u0069\u0308ve",
  "e\u0301\u0327",
  "\uD83D\uDE00",
  "\uD83D\uDCC5",
  "\uD83C\uDF89",
  "\uD83E\uDD14",
  "a\uFEFFb",
  "@dana",
  "=> follow up",
  "3.5 hours",
);

const noteLineArb = (includeNumbered: boolean) =>
  fc
    .record({
      indent: fc.constantFrom("", " ", "  ", "\t", "\t  "),
      prefix: includeNumbered
        ? fc.constantFrom("", "# ", "v ", "> ", "x ", "o ", "- ", "* ", "! ", "=> ", "1. ", "2) ")
        : fc.constantFrom("", "# ", "v ", "> ", "x ", "o ", "- ", "* ", "! ", "=> "),
      chunks: fc.array(chunkArb, { minLength: 0, maxLength: 5 }),
      trailingWs: fc.constantFrom("", " ", "  ", "\t", " \t "),
    })
    .map(({ indent, prefix, chunks, trailingWs }) => `${indent}${prefix}${chunks.join(" ")}${trailingWs}`);

const rawNoteFileArb = (includeNumbered: boolean) =>
  fc
    .record({
      bom: fc.boolean(),
      lines: fc.array(noteLineArb(includeNumbered), { minLength: 1, maxLength: 10 }),
      seps: fc.array(fc.constantFrom("\n", "\r\n", "\r"), { minLength: 9, maxLength: 9 }),
      finalNewline: fc.constantFrom("", "\n", "\r\n", "\r"),
    })
    .map(({ bom, lines, seps, finalNewline }) => {
      let body = lines[0];
      for (let i = 1; i < lines.length; i++) {
        body += seps[(i - 1) % seps.length] + lines[i];
      }
      body += finalNewline;
      return bom ? `\uFEFF${body}` : body;
    });

const typedCharArb = fc.constantFrom("a", "Z", "5", " ", "\t", "!", "\u0301", "\uD83D\uDE00", "\uD83D\uDCC5");

describe("round trip of file bytes properties (fast-check)", () => {
  it("normalisation matches storage.rs rules across MockBackend (150 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(rawNoteFileArb(true), async (raw) => {
        const expected = expectedNormalized(raw);
        expect(normalizeNoteText(raw)).toBe(expected);

        sessionStorage.clear();
        const mock = new MockBackend({ notes: { [FILENAME]: raw } });
        const mockRead = await mock.invoke("read_note", { filename: FILENAME });
        expect(mockRead).toBe(expected);

        const mockWithMeta = (await mock.invoke("read_note_with_metadata", { filename: FILENAME })) as {
          content: string | null;
          metadata: { exists: boolean; contentHash: string | null };
        };
        expect(mockWithMeta.content).toBe(expected);
        expect(mockWithMeta.metadata.exists).toBe(true);
        expect(mockWithMeta.metadata.contentHash).toBe(await sha256Hex(expected));
      }),
      { numRuns: 150 },
    );
  });

  it("WebBackend write_note / read_note agrees with MockBackend and storage.rs normalisation (20 runs)", async () => {
    installIdbStub();
    const web = new WebBackend("0.0.0");
    await fc.assert(
      fc.asyncProperty(rawNoteFileArb(true), async (raw) => {
        const expected = expectedNormalized(raw);
        sessionStorage.clear();
        const mock = new MockBackend({ notes: { [FILENAME]: raw } });
        const mockMeta = (await mock.invoke("read_note_with_metadata", { filename: FILENAME })) as {
          metadata: { contentHash: string | null };
        };

        const webMeta = (await web.invoke("write_note", {
          filename: FILENAME,
          content: raw,
          expectedHash: null,
        })) as { contentHash: string | null };
        expect(webMeta.contentHash).toBe(mockMeta.metadata.contentHash);
        expect(await web.invoke("read_note", { filename: FILENAME })).toBe(expected);
      }),
      { numRuns: 20 },
    );
  });

  it("open -> editor (type nothing) -> save -> reload preserves normalised bytes and leaves clean LF files byte-identical (150 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(rawNoteFileArb(true), async (raw) => {
        const expected = expectedNormalized(raw);
        sessionStorage.clear();
        const mock = new MockBackend({ notes: { [FILENAME]: raw } });

        const opened = (await mock.invoke("read_note_with_metadata", { filename: FILENAME })) as {
          content: string | null;
          metadata: { contentHash: string | null };
        };
        const ed = openTestEditor(opened.content ?? "");
        expect(ed.text()).toBe(expected);

        await mock.invoke("write_note", {
          filename: FILENAME,
          content: ed.text(),
          expectedHash: opened.metadata.contentHash,
        });

        const reloaded = await mock.invoke("read_note", { filename: FILENAME });
        expect(reloaded).toBe(expected);
        if (!raw.startsWith("\uFEFF") && !raw.includes("\r")) {
          expect(reloaded).toBe(raw);
        }
        ed.destroy();
        editors.pop();
      }),
      { numRuns: 150 },
    );
  });

  it("open -> type one character at a random code-point boundary -> save -> reload adds only that character (150 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(rawNoteFileArb(false), fc.nat(), typedCharArb, async (raw, posSeed, ch) => {
        const expectedBefore = expectedNormalized(raw);
        sessionStorage.clear();
        const mock = new MockBackend({ notes: { [FILENAME]: raw } });

        const opened = (await mock.invoke("read_note_with_metadata", { filename: FILENAME })) as {
          content: string | null;
          metadata: { contentHash: string | null };
        };
        const content = opened.content ?? "";
        const positions = validCaretPositions(content);
        const pos = positions[posSeed % positions.length];

        const ed = openTestEditor(content);
        ed.select(pos);
        ed.type(ch);

        const expectedAfter = expectedBefore.slice(0, pos) + ch + expectedBefore.slice(pos);
        expect(ed.text()).toBe(expectedAfter);

        await mock.invoke("write_note", {
          filename: FILENAME,
          content: ed.text(),
          expectedHash: opened.metadata.contentHash,
        });

        const reloaded = await mock.invoke("read_note", { filename: FILENAME });
        expect(reloaded).toBe(expectedAfter);

        ed.destroy();
        editors.pop();
      }),
      { numRuns: 150 },
    );
  });
});
