// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createTestEditor, type TestEditor } from "../testing/testEditor";

const editors: TestEditor[] = [];

function openEditor(doc: string): TestEditor {
  const ed = createTestEditor({ doc });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

function stripMarkers(s: string): string {
  return s.replace(/[|\[\]]/g, "");
}

interface StateCase {
  label: string;
  input: string;
  key: string;
  expected: string;
}

function runStateTable(cases: StateCase[]): void {
  for (const c of cases) {
    it(`${c.label}: ${JSON.stringify(c.input)} + ${c.key}`, () => {
      const ed = openEditor(c.input);
      ed.press(c.key);
      expect(ed.caret()).toBe(c.expected);

      if (stripMarkers(c.expected) !== stripMarkers(c.input)) {
        expect(ed.undo()).toBe(true);
        expect(ed.caret()).toBe(c.input);
        expect(ed.redo()).toBe(true);
        expect(ed.text()).toBe(stripMarkers(c.expected));
      }
    });
  }
}

describe("editing table: state shortcuts & section titles", () => {
  // Rule: Mod-1..4 set action state (#, v, >, x) and promote prose/lists/plain follow-ups (Spec 2.2, 4, §171, §172, §338, §367, §464)
  const mod1to4States: Array<[string, string]> = [
    ["Mod-1", "# "],
    ["Mod-2", "v "],
    ["Mod-3", "> "],
    ["Mod-4", "x "],
  ];

  const mod1to4Cases: StateCase[] = (() => {
    const rows: StateCase[] = [];
    for (const [key, sym] of mod1to4States) {
      // Promote plain / empty / indented / list / emphasis / numbered lines
      const promotable: Array<[string, string, string]> = [
        ["empty", "|", `${sym}|`],
        ["spaces only", "  |", `  ${sym}|`],
        ["prose end", "task|", `${sym}task|`],
        ["prose start", "|task", `${sym}|task`],
        ["prose mid", "ta|sk", `${sym}ta|sk`],
        ["indented prose end", "  task|", `  ${sym}task|`],
        ["indented prose caret inside indent", " | task", ` | ${sym}task`],
        ["bullet -", "- item|", `${sym}- item|`],
        ["bullet *", "* item|", `${sym}* item|`],
        ["emphasis !", "! urgent|", `${sym}! urgent|`],
        ["emphasis+bullet ! -", "! - item|", `${sym}! - item|`],
        ["numbered 1.", "1. item|", `${sym}1. item|`],
        ["dotted sub-item 1.1.", "   1.1. sub|", `   ${sym}1.1. sub|`],
        ["plain follow-up =>", "=> follow|", `=> ${sym}follow|`],
        ["prose+follow-up a => b", "a => b|", `a => ${sym}b|`],
      ];
      for (const [name, input, expected] of promotable) {
        rows.push({ label: `${key} promotes ${name}`, input, key, expected });
      }

      // Convert existing leading action / topic / combined symbols
      const existing: Array<[string, string, string]> = [
        ["# task", "# task|", `${sym}task|`],
        ["v task", "v task|", `${sym}task|`],
        ["> task", "> task|", `${sym}task|`],
        ["x task", "x task|", `${sym}task|`],
        ["o topic", "o topic|", `${sym}topic|`],
        [". topic", ". topic|", `${sym}topic|`],
        [", topic", ", topic|", `${sym}topic|`],
        ["# - task", "# - task|", `${sym}- task|`],
        ["# ! urgent", "# ! urgent|", `${sym}! urgent|`],
        ["# ! - item", "# ! - item|", `${sym}! - item|`],
        ["# 1. task", "# 1. task|", `${sym}1. task|`],
        ["o - topic", "o - topic|", `${sym}- topic|`],
        ["o 1. topic", "o 1. topic|", `${sym}1. topic|`],
        ["=> # action", "=> # action|", `=> ${sym}action|`],
        ["=> o topic", "=> o topic|", `=> ${sym}topic|`],
        ["tab-indented action", "\t# task|", `\t${sym}task|`],
        ["continuation line", "- item\n  cont|", `- item\n  ${sym}cont|`],
      ];
      for (const [name, input, expected] of existing) {
        rows.push({ label: `${key} sets ${name}`, input, key, expected });
      }

      // Excluded shapes stay unchanged (§171, §367)
      rows.push(
        { label: `${key} leaves => @name untouched`, input: "=> @dana|", key, expected: "=> @dana|" },
        { label: `${key} leaves title above === untouched`, input: "Title|\n=====", key, expected: "Title|\n=====" },
        { label: `${key} leaves === underline untouched`, input: "Title\n=====|", key, expected: "Title\n=====|" },
      );
    }
    return rows;
  })();

  runStateTable(mod1to4Cases);

  // Rule: Mod-5..7 set topic state (o, ., ,) and promote prose/lists/plain follow-ups (Spec 2.2, 4, §244, §338, §367)
  const mod5to7States: Array<[string, string]> = [
    ["Mod-5", "o "],
    ["Mod-6", ". "],
    ["Mod-7", ", "],
  ];

  const mod5to7Cases: StateCase[] = (() => {
    const rows: StateCase[] = [];
    for (const [key, sym] of mod5to7States) {
      const targets: Array<[string, string, string]> = [
        ["empty", "|", `${sym}|`],
        ["prose end", "agenda|", `${sym}agenda|`],
        ["prose start", "|agenda", `${sym}|agenda`],
        ["indented prose", "  agenda|", `  ${sym}agenda|`],
        ["bullet -", "- item|", `${sym}- item|`],
        ["emphasis !", "! note|", `${sym}! note|`],
        ["numbered 1.", "1. item|", `${sym}1. item|`],
        ["plain follow-up =>", "=> later|", `=> ${sym}later|`],
        ["prose+follow-up a => b", "a => later|", `a => ${sym}later|`],
        ["# task", "# task|", `${sym}task|`],
        ["v task", "v task|", `${sym}task|`],
        ["o topic", "o topic|", `${sym}topic|`],
        [". topic", ". topic|", `${sym}topic|`],
        [", topic", ", topic|", `${sym}topic|`],
        ["# - task", "# - task|", `${sym}- task|`],
        ["# 1. task", "# 1. task|", `${sym}1. task|`],
        ["=> # action", "=> # action|", `=> ${sym}action|`],
        ["=> o topic", "=> o topic|", `=> ${sym}topic|`],
      ];
      for (const [name, input, expected] of targets) {
        rows.push({ label: `${key} on ${name}`, input, key, expected });
      }
      rows.push(
        { label: `${key} leaves => @name untouched`, input: "=> @dana|", key, expected: "=> @dana|" },
        { label: `${key} leaves title above === untouched`, input: "Title|\n=====", key, expected: "Title|\n=====" },
        { label: `${key} leaves === underline untouched`, input: "Title\n=====|", key, expected: "Title\n=====|" },
      );
    }
    return rows;
  })();

  runStateTable(mod5to7Cases);

  // Rule: Caret targeting ("Which symbol"), selections, and numbered list renumbering (Spec 2.2, Known Bugs)
  runStateTable([
    {
      label: "caret before => # targets nearest symbol to the right",
      input: "|a => # b",
      key: "Mod-2",
      expected: "|a => v b",
    },
    {
      label: "caret on leading part targets leading symbol",
      input: "# first| => # second",
      key: "Mod-2",
      expected: "v first| => # second",
    },
    {
      label: "caret on follow-up part targets follow-up symbol",
      input: "# first => # sec|ond",
      key: "Mod-2",
      expected: "# first => v sec|ond",
    },
    {
      label: "caret at held symbol position keeps offset",
      input: "#| task",
      key: "Mod-2",
      expected: "v| task",
    },
    {
      label: "caret at col 0 of existing action stays at col 0",
      input: "|# task",
      key: "Mod-2",
      expected: "|v task",
    },
    {
      label: "multi-line selection updates all selected action lines",
      input: "[# a\n# b]",
      key: "Mod-2",
      expected: "[v a\nv b]",
    },
    // Known Bug: selection ending at col 0 of next line does not include that line
    {
      label: "Shift+Down selection ending at col 0 excludes next line (bug)",
      input: "[# first\n]second",
      key: "Mod-2",
      expected: "[v first\n]second",
    },
    {
      label: "Shift+Down selection ending at col 0 excludes next action line (bug)",
      input: "[# first\n]# second",
      key: "Mod-2",
      expected: "[v first\n]# second",
    },
    {
      label: "Mod-1 on first numbered item keeps remaining list numbering",
      input: "1. task|\n2. next",
      key: "Mod-1",
      expected: "# 1. task|\n2. next",
    },
    {
      label: "Mod-1 on middle numbered item keeps list numbering",
      input: "1. keep\n2. task|\n3. next",
      key: "Mod-1",
      expected: "1. keep\n# 2. task|\n3. next",
    },
    {
      label: "Mod-2 marks numbered item done without renumbering",
      input: "# 1. a\n2. b|\n# 3. c",
      key: "Mod-2",
      expected: "# 1. a\nv 2. b|\n# 3. c",
    },
    {
      label: "Mod-3 defers numbered item without renumbering",
      input: "# 1. a\nv 2. b|\n3. c",
      key: "Mod-3",
      expected: "# 1. a\n> 2. b|\n3. c",
    },
    {
      label: "Mod-4 cancels numbered item without renumbering",
      input: "1. a\n# 2. b|\n3. c",
      key: "Mod-4",
      expected: "1. a\nx 2. b|\n3. c",
    },
    {
      label: "Mod-1 sets action state on done numbered item without renumbering",
      input: "1. a\nv 2. b|\n3. c",
      key: "Mod-1",
      expected: "1. a\n# 2. b|\n3. c",
    },
    {
      label: "Mod-Shift-o reopens closed numbered action without renumbering",
      input: "1. a\nv 2. b|\n3. c",
      key: "Mod-Shift-o",
      expected: "1. a\n# 2. b|\n3. c",
    },
    {
      label: "Mod-Shift-o reopens closed numbered topic without renumbering",
      input: "1. a\n. 2. b|\n3. c",
      key: "Mod-Shift-o",
      expected: "1. a\no 2. b|\n3. c",
    },
    {
      label: "Mod-5 sets topic lead on numbered item without renumbering",
      input: "1. a\n2. b|\n3. c",
      key: "Mod-5",
      expected: "1. a\no 2. b|\n3. c",
    },
  ]);

  // Rule: Mod-Shift-o opens existing actions/topics without promoting plain lines (§175, §257)
  runStateTable([
    { label: "Mod-Shift-o reopens v -> #", input: "v task|", key: "Mod-Shift-o", expected: "# task|" },
    { label: "Mod-Shift-o reopens > -> #", input: "> task|", key: "Mod-Shift-o", expected: "# task|" },
    { label: "Mod-Shift-o reopens x -> #", input: "x task|", key: "Mod-Shift-o", expected: "# task|" },
    { label: "Mod-Shift-o keeps # unchanged", input: "# task|", key: "Mod-Shift-o", expected: "# task|" },
    { label: "Mod-Shift-o reopens . -> o", input: ". topic|", key: "Mod-Shift-o", expected: "o topic|" },
    { label: "Mod-Shift-o reopens , -> o", input: ", topic|", key: "Mod-Shift-o", expected: "o topic|" },
    { label: "Mod-Shift-o keeps o unchanged", input: "o topic|", key: "Mod-Shift-o", expected: "o topic|" },
    { label: "Mod-Shift-o reopens => v -> => #", input: "=> v act|", key: "Mod-Shift-o", expected: "=> # act|" },
    { label: "Mod-Shift-o reopens => , -> => o", input: "=> , top|", key: "Mod-Shift-o", expected: "=> o top|" },
    { label: "Mod-Shift-o does NOT promote prose", input: "prose|", key: "Mod-Shift-o", expected: "prose|" },
    { label: "Mod-Shift-o does NOT promote bullet", input: "- item|", key: "Mod-Shift-o", expected: "- item|" },
    { label: "Mod-Shift-o does NOT promote plain =>", input: "=> follow|", key: "Mod-Shift-o", expected: "=> follow|" },
    {
      label: "Mod-Shift-o multi-line opens actions and topics while leaving prose",
      input: "[v a\n. b\nprose]",
      key: "Mod-Shift-o",
      expected: "[# a\no b\nprose]",
    },
  ]);

  // Rule: Ctrl-Space / Mod-Enter closes open (# -> v, o -> .); Ctrl-Shift-Space / Mod-Shift-Enter reopens (v -> #, ./, -> o) (Spec 4, §175, §244)
  runStateTable([
    { label: "Ctrl-Space closes # -> v", input: "# task|", key: "Ctrl-Space", expected: "v task|" },
    { label: "Ctrl-Space closes o -> .", input: "o topic|", key: "Ctrl-Space", expected: ". topic|" },
    { label: "Ctrl-Space closes => # -> => v", input: "=> # act|", key: "Ctrl-Space", expected: "=> v act|" },
    { label: "Ctrl-Space closes => o -> => .", input: "=> o top|", key: "Ctrl-Space", expected: "=> . top|" },
    { label: "Ctrl-Space no-op on v", input: "v task|", key: "Ctrl-Space", expected: "v task|" },
    { label: "Ctrl-Space no-op on >", input: "> task|", key: "Ctrl-Space", expected: "> task|" },
    { label: "Ctrl-Space no-op on x", input: "x task|", key: "Ctrl-Space", expected: "x task|" },
    { label: "Ctrl-Space no-op on .", input: ". topic|", key: "Ctrl-Space", expected: ". topic|" },
    { label: "Ctrl-Space no-op on prose", input: "prose|", key: "Ctrl-Space", expected: "prose|" },
    { label: "Mod-Enter closes # -> v", input: "# task|", key: "Mod-Enter", expected: "v task|" },
    { label: "Mod-Enter closes o -> .", input: "o topic|", key: "Mod-Enter", expected: ". topic|" },
    { label: "Ctrl-Shift-Space reopens v -> #", input: "v task|", key: "Ctrl-Shift-Space", expected: "# task|" },
    { label: "Ctrl-Shift-Space reopens . -> o", input: ". topic|", key: "Ctrl-Shift-Space", expected: "o topic|" },
    { label: "Ctrl-Shift-Space reopens , -> o", input: ", topic|", key: "Ctrl-Shift-Space", expected: "o topic|" },
    { label: "Ctrl-Shift-Space no-op on #", input: "# task|", key: "Ctrl-Shift-Space", expected: "# task|" },
    { label: "Ctrl-Shift-Space no-op on >", input: "> task|", key: "Ctrl-Shift-Space", expected: "> task|" },
    { label: "Ctrl-Shift-Space no-op on x", input: "x task|", key: "Ctrl-Shift-Space", expected: "x task|" },
    { label: "Ctrl-Shift-Space no-op on prose", input: "prose|", key: "Ctrl-Shift-Space", expected: "prose|" },
    { label: "Mod-Shift-Enter reopens v -> #", input: "v task|", key: "Mod-Shift-Enter", expected: "# task|" },
    { label: "Mod-Shift-Enter reopens . -> o", input: ". topic|", key: "Mod-Shift-Enter", expected: "o topic|" },
  ]);

  // Rule: Mod-Shift-s turns current line into a Setext section title, and does nothing on title/underline/blank (§8, Known Bug)
  runStateTable([
    { label: "Mod-Shift-s on prose at end", input: "Title|", key: "Mod-Shift-s", expected: "Title\n=====\n|" },
    { label: "Mod-Shift-s on prose mid-line", input: "Ti|tle", key: "Mod-Shift-s", expected: "Title\n=====\n|" },
    { label: "Mod-Shift-s on prose at col 0", input: "|Title", key: "Mod-Shift-s", expected: "Title\n=====\n|" },
    { label: "Mod-Shift-s on short line", input: "Hi|", key: "Mod-Shift-s", expected: "Hi\n===\n|" },
    { label: "Mod-Shift-s on action line", input: "# Action|", key: "Mod-Shift-s", expected: "# Action\n========\n|" },
    { label: "Mod-Shift-s on empty line is no-op", input: "|", key: "Mod-Shift-s", expected: "|" },
    { label: "Mod-Shift-s on spaces-only line is no-op", input: "   |", key: "Mod-Shift-s", expected: "   |" },
    // Known Bug: Mod-Shift-s on a title line or its === underline does nothing
    { label: "Mod-Shift-s on existing title line is no-op (bug)", input: "Title|\n=====", key: "Mod-Shift-s", expected: "Title|\n=====" },
    { label: "Mod-Shift-s on === underline is no-op (bug)", input: "Title\n=====|", key: "Mod-Shift-s", expected: "Title\n=====|" },
  ]);
});
