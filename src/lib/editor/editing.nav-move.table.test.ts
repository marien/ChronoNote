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

interface NavCase {
  label: string;
  input: string;
  keys: string[];
  expected: string;
}

function runNavTable(cases: NavCase[]): void {
  for (const c of cases) {
    it(`${c.label}: ${JSON.stringify(c.input)} + ${c.keys.join(" -> ")}`, () => {
      const ed = openEditor(c.input);
      for (const k of c.keys) {
        ed.press(k);
      }
      expect(ed.caret()).toBe(c.expected);
      expect(ed.text()).toBe(stripMarkers(c.input));
    });
  }
}

interface MoveCase {
  label: string;
  input: string;
  key: "Alt-ArrowUp" | "Alt-ArrowDown";
  expected: string;
}

function runMoveTable(cases: MoveCase[]): void {
  for (const c of cases) {
    it(`${c.label}: ${JSON.stringify(c.input)} + ${c.key}`, () => {
      const ed = openEditor(c.input);
      ed.press(c.key);
      expect(ed.caret()).toBe(c.expected);

      if (stripMarkers(c.expected) !== stripMarkers(c.input)) {
        expect(ed.undo()).toBe(true);
        expect(ed.caret()).toBe(c.input);
        expect(ed.redo()).toBe(true);
        expect(ed.caret()).toBe(c.expected);
      }
    });
  }
}

describe("editing table: Home, Shift-Home & Alt-ArrowUp/Down", () => {
  // Rule: Decision D2 — Home cycles between text start and column 0 across every line kind
  const homeMarkerKinds: Array<[string, string, string]> = [
    ["indented prose", "  ", "indented"],
    ["bullet -", "- ", "item"],
    ["bullet *", "* ", "item"],
    ["indented bullet", "  - ", "item"],
    ["open action #", "# ", "task"],
    ["done action v", "v ", "task"],
    ["deferred action >", "> ", "task"],
    ["wont-do action x", "x ", "task"],
    ["tab-indented action", "\t# ", "task"],
    ["open topic o", "o ", "topic"],
    ["discussed topic .", ". ", "topic"],
    ["postponed topic ,", ", ", "topic"],
    ["emphasis !", "! ", "urgent"],
    ["emphasis+bullet ! -", "! - ", "item"],
    ["action+bullet # -", "# - ", "task"],
    ["action+emphasis # !", "# ! ", "urgent"],
    ["action+emphasis+bullet # ! -", "# ! - ", "item"],
    ["topic+bullet o -", "o - ", "topic"],
    ["follow-up =>", "=> ", "follow"],
    ["consequence => #", "=> # ", "action"],
    ["delegated => @dana", "=> ", "@dana check"],
    ["numbered 1.", "1. ", "item"],
    ["dotted sub-item 1.1.", "   1.1. ", "sub"],
    ["action+numbered # 1.", "# 1. ", "task"],
    ["topic+numbered o 1.", "o 1. ", "topic"],
    ["action with topic tag", "# (api) ", "fix bug"],
    ["done with topic tag", "v (ops) ", "shipped"],
  ];

  const homeCases: NavCase[] = (() => {
    const rows: NavCase[] = [];
    for (const [name, prefix, body] of homeMarkerKinds) {
      const mid = body.slice(0, 2);
      const rest = body.slice(2);
      rows.push(
        {
          label: `D2 Home from end on ${name}`,
          input: `${prefix}${body}|`,
          keys: ["Home"],
          expected: `${prefix}|${body}`,
        },
        {
          label: `D2 Home from mid-text on ${name}`,
          input: `${prefix}${mid}|${rest}`,
          keys: ["Home"],
          expected: `${prefix}|${body}`,
        },
        {
          label: `D2 Home from text start goes to col 0 on ${name}`,
          input: `${prefix}|${body}`,
          keys: ["Home"],
          expected: `|${prefix}${body}`,
        },
        {
          label: `D2 Home from col 0 goes to text start on ${name}`,
          input: `|${prefix}${body}`,
          keys: ["Home"],
          expected: `${prefix}|${body}`,
        },
      );
    }
    return rows;
  })();

  runNavTable(homeCases);

  // Rule: Decision D2 — Home on zero-prefix / special lines, inside indent, held caret, and Shift-Home extension
  runNavTable([
    { label: "D2 Home on empty line", input: "|", keys: ["Home"], expected: "|" },
    { label: "D2 Home on spaces-only from end", input: "  |", keys: ["Home"], expected: "|  " },
    { label: "D2 Home on spaces-only from col 0", input: "|  ", keys: ["Home"], expected: "  |" },
    { label: "D2 Home on spaces-only from inside indent", input: " | ", keys: ["Home"], expected: "  |" },
    { label: "D2 Home on prose from end", input: "plain text|", keys: ["Home"], expected: "|plain text" },
    { label: "D2 Home on prose from col 0", input: "|plain text", keys: ["Home"], expected: "|plain text" },
    { label: "D2 Home on a => # b goes to col 0", input: "a => # b|", keys: ["Home"], expected: "|a => # b" },
    { label: "D2 Home inside indent goes to text start", input: " | # task", keys: ["Home"], expected: "  # |task" },
    { label: "D2 Home inside held symbol goes to text start", input: "#| task", keys: ["Home"], expected: "# |task" },
    { label: "D2 Home on section title", input: "Meeting|\n=======", keys: ["Home"], expected: "|Meeting\n=======" },
    { label: "D2 Home on === underline", input: "Meeting\n=======|", keys: ["Home"], expected: "Meeting\n|=======" },
    { label: "D2 Home on subtitle", input: "Sub|\n---", keys: ["Home"], expected: "|Sub\n---" },
    {
      label: "D2 Home on continuation line goes to after indent",
      input: "- item\n  continued|",
      keys: ["Home"],
      expected: "- item\n  |continued",
    },
    {
      label: "D2 Home twice on continuation line goes to col 0",
      input: "- item\n  continued|",
      keys: ["Home", "Home"],
      expected: "- item\n|  continued",
    },
    // Shift-Home
    { label: "D2 Shift-Home on prose", input: "pla|in", keys: ["Shift-Home"], expected: "]pla[in" },
    { label: "D2 Shift-Home from mid-text of # task", input: "# ta|sk", keys: ["Shift-Home"], expected: "# ]ta[sk" },
    {
      label: "D2 Shift-Home twice from mid-text extends to col 0",
      input: "# ta|sk",
      keys: ["Shift-Home", "Shift-Home"],
      expected: "]# ta[sk",
    },
    {
      label: "D2 Shift-Home three times toggles back to text start",
      input: "# ta|sk",
      keys: ["Shift-Home", "Shift-Home", "Shift-Home"],
      expected: "# ]ta[sk",
    },
    {
      label: "D2 Shift-Home from text start extends to col 0",
      input: "# |task",
      keys: ["Shift-Home"],
      expected: "]# [task",
    },
    {
      label: "D2 Shift-Home from col 0 extends forward to text start",
      input: "|# task",
      keys: ["Shift-Home"],
      expected: "[# ]task",
    },
    {
      label: "D2 Shift-Home on # (api) task goes to after tag",
      input: "# (api) fi|x",
      keys: ["Shift-Home"],
      expected: "# (api) ]fi[x",
    },
    {
      label: "D2 Shift-Home on indented prose",
      input: "  inde|nted",
      keys: ["Shift-Home"],
      expected: "  ]inde[nted",
    },
    {
      label: "D2 Shift-Home collapses forward selection starting at text start",
      input: "# [ta]sk",
      keys: ["Shift-Home"],
      expected: "# |task",
    },
    {
      label: "D2 Shift-Home adjusts forward selection starting mid-text",
      input: "# t[as]k",
      keys: ["Shift-Home"],
      expected: "# ]t[ask",
    },
  ]);

  // Rule: Alt-ArrowUp / Alt-ArrowDown move lines and renumber lists (§457, §464, Known Bugs)
  runMoveTable([
    { label: "Alt-ArrowDown moves first line down", input: "first|\nsecond", key: "Alt-ArrowDown", expected: "second\nfirst|" },
    { label: "Alt-ArrowUp moves second line up", input: "first\nsecond|", key: "Alt-ArrowUp", expected: "second|\nfirst" },
    { label: "Alt-ArrowUp at first line is no-op", input: "first|\nsecond", key: "Alt-ArrowUp", expected: "first|\nsecond" },
    { label: "Alt-ArrowDown at last line is no-op", input: "first\nsecond|", key: "Alt-ArrowDown", expected: "first\nsecond|" },
    { label: "Alt-ArrowDown on single line is no-op", input: "only|", key: "Alt-ArrowDown", expected: "only|" },
    { label: "Alt-ArrowUp swaps numbered items and renumbers", input: "1. a\n2. b|\n3. c", key: "Alt-ArrowUp", expected: "1. b|\n2. a\n3. c" },
    { label: "Alt-ArrowDown swaps numbered items and renumbers", input: "1. a|\n2. b\n3. c", key: "Alt-ArrowDown", expected: "1. b\n2. a|\n3. c" },
    {
      label: "Alt-ArrowUp moves prose into numbered list and splits numbering",
      input: "1. a\n2. b\nprose|",
      key: "Alt-ArrowUp",
      expected: "1. a\nprose|\n1. b",
    },
    {
      label: "Alt-ArrowDown moves two-line selection down",
      input: "[first\nsecond]\nthird",
      key: "Alt-ArrowDown",
      expected: "third\n[first\nsecond]",
    },
    // Known Bug: Alt-ArrowDown on |- # task\nsecond leaves it un-normalised; ArrowUp then normalises it
    {
      label: "Alt-ArrowDown on list-first line keeps it un-normalised while caret stays on it (bug)",
      input: "|- # task\nsecond",
      key: "Alt-ArrowDown",
      expected: "second\n|- # task",
    },
    {
      label: "Alt-ArrowDown past un-edited list-first line leaves the other line untouched (bug)",
      input: "|first\n- # second",
      key: "Alt-ArrowDown",
      expected: "- # second\n|first",
    },
  ]);

  it("Alt-ArrowDown on '|- # task\\nsecond' followed by ArrowUp normalises to 'second\\n# - task' (bug)", () => {
    const ed = openEditor("|- # task\nsecond");
    ed.press("Alt-ArrowDown");
    expect(ed.caret()).toBe("second\n|- # task");
    ed.press("ArrowUp");
    expect(ed.text()).toBe("second\n# - task");
    expect(ed.caret()).toBe("|second\n# - task");
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe("second\n- # task");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("|- # task\nsecond");
  });
});
