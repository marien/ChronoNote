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
        expect(ed.text()).toBe(stripMarkers(c.expected));
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
    { label: "Alt-ArrowDown from col 0 of numbered item renumbers consecutively", input: "|1. a\n2. b\n3. c", key: "Alt-ArrowDown", expected: "1. b\n|2. a\n3. c" },
    {
      label: "Alt-ArrowDown moves text into numbered list and splits numbering",
      input: "|text\n1. a\n2. b\n3. c",
      key: "Alt-ArrowDown",
      expected: "1. a\n|text\n1. b\n2. c",
    },
    {
      label: "Alt-ArrowUp moves separating text out and joins lists keeping start at 4",
      input: "4. a\n|text\n1. b\n2. c",
      key: "Alt-ArrowUp",
      expected: "|text\n4. a\n5. b\n6. c",
    },
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
    {
      label: "Moving an action line up between two items splits the list there (D4 rule 1.3)",
      input: "o Budget\n1. a\n2. b\n# call Sam|\n1. c\n2. d",
      key: "Alt-ArrowUp",
      expected: "o Budget\n1. a\n# call Sam|\n1. b\n2. c\n3. d",
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

interface DeleteCase {
  label: string;
  input: string;
  keys: string[];
  expected: string;
  /** Expected caret+text after a single undo step (defaults to `input` for single-key cases). */
  afterUndo?: string;
}

function runDeleteTable(cases: DeleteCase[]): void {
  for (const c of cases) {
    it(`${c.label}: ${JSON.stringify(c.input)} + ${c.keys.join(" -> ")}`, () => {
      const ed = openEditor(c.input);
      for (const k of c.keys) {
        ed.press(k);
      }
      expect(ed.caret()).toBe(c.expected);
      if (c.keys.length === 1 || c.afterUndo !== undefined) {
        expect(ed.undo()).toBe(true);
        expect(ed.caret()).toBe(c.afterUndo ?? c.input);
        expect(ed.redo()).toBe(true);
        expect(ed.caret()).toBe(c.expected);
      }
    });
  }
}

describe("editing table: word moves and word deletes (D11)", () => {
  runNavTable([
    // Leading markers + combined leads
    { label: "D11 action+tag+due forward 1", input: "|# (bug) task by:2026-11-20 fix", keys: ["Ctrl-ArrowRight"], expected: "# |(bug) task by:2026-11-20 fix" },
    { label: "D11 action+tag+due forward 2", input: "|# (bug) task by:2026-11-20 fix", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# (bug)| task by:2026-11-20 fix" },
    { label: "D11 action+tag+due forward 3", input: "|# (bug) task by:2026-11-20 fix", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# (bug) task| by:2026-11-20 fix" },
    { label: "D11 action+tag+due forward 4", input: "|# (bug) task by:2026-11-20 fix", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# (bug) task by:2026-11-20| fix" },
    { label: "D11 action+tag+due forward 5", input: "|# (bug) task by:2026-11-20 fix", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# (bug) task by:2026-11-20 fix|" },

    { label: "D11 action+tag+due backward 1", input: "# (bug) task by:2026-11-20 fix|", keys: ["Ctrl-ArrowLeft"], expected: "# (bug) task by:2026-11-20 |fix" },
    { label: "D11 action+tag+due backward 2", input: "# (bug) task by:2026-11-20 fix|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "# (bug) task |by:2026-11-20 fix" },
    { label: "D11 action+tag+due backward 3", input: "# (bug) task by:2026-11-20 fix|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "# (bug) |task by:2026-11-20 fix" },
    { label: "D11 action+tag+due backward 4", input: "# (bug) task by:2026-11-20 fix|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "# |(bug) task by:2026-11-20 fix" },
    { label: "D11 action+tag+due backward 5", input: "# (bug) task by:2026-11-20 fix|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "|# (bug) task by:2026-11-20 fix" },

    { label: "D11 indented emphasis forward 1", input: "|  ! urgent", keys: ["Ctrl-ArrowRight"], expected: "  ! |urgent" },
    { label: "D11 indented emphasis forward 2", input: "|  ! urgent", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "  ! urgent|" },
    { label: "D11 indented emphasis backward 1", input: "  ! urgent|", keys: ["Ctrl-ArrowLeft"], expected: "  ! |urgent" },
    { label: "D11 indented emphasis backward 2", input: "  ! urgent|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "  |! urgent" },
    { label: "D11 indented emphasis backward 3", input: "  ! urgent|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "|  ! urgent" },

    { label: "D11 v 12. done forward 1", input: "|v 12. done", keys: ["Ctrl-ArrowRight"], expected: "v |12. done" },
    { label: "D11 v 12. done forward 2", input: "|v 12. done", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "v 12. |done" },
    { label: "D11 v 12. done forward 3", input: "|v 12. done", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "v 12. done|" },
    { label: "D11 v 12. done backward 1", input: "v 12. done|", keys: ["Ctrl-ArrowLeft"], expected: "v 12. |done" },
    { label: "D11 v 12. done backward 2", input: "v 12. done|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "v |12. done" },
    { label: "D11 v 12. done backward 3", input: "v 12. done|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "|v 12. done" },

    { label: "D11 # - task forward", input: "|# - task", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# - |task" },
    { label: "D11 => # call forward", input: "|=> # call", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "=> # |call" },
    { label: "D11 1.1. sub forward", input: "|1.1. sub", keys: ["Ctrl-ArrowRight"], expected: "1.1. |sub" },
    { label: "D11 2) second backward", input: "2) second|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "|2) second" },

    // Due variants, plain dates, forward links, assignees
    { label: "D11 due weekday", input: "# |a by:fri", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# a by:fri|" },
    { label: "D11 due tomorrow", input: "# |a by:tomorrow", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# a by:tomorrow|" },
    { label: "D11 impossible by:2026-02-30", input: "# |a by:2026-02-30", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "# a by:2026-02-30|" },
    { label: "D11 plain date forward", input: "on |2026-11-20 met", keys: ["Ctrl-ArrowRight"], expected: "on 2026-11-20| met" },
    { label: "D11 forward link stops around date only", input: "see |(>2026-11-20#Sync) end", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "see (>2026-11-20|#Sync) end" },
    { label: "D11 @dana-k one word, @dana.k splits at dot", input: "ask |@dana-k and @dana.k", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "ask @dana-k and @dana|.k" },
    { label: "D11 adjacent parens do not merge into @dana", input: "|(@dana)", keys: ["Ctrl-ArrowRight", "Ctrl-ArrowRight"], expected: "(@dana|)" },
    { label: "D11 backward over (@dana) stops after paren", input: "(@dana)|", keys: ["Ctrl-ArrowLeft", "Ctrl-ArrowLeft"], expected: "(|@dana)" },

    // Cross-line moves
    { label: "D11 cross blank line into marker", input: "first|\n\n# second", keys: ["Ctrl-ArrowRight"], expected: "first\n\n# |second" },
    { label: "D11 cross line backward stops before marker", input: "first\n|second", keys: ["Ctrl-ArrowLeft"], expected: "|first\nsecond" },
    { label: "D11 cross line backward into trailing marker", input: "#  \n|next", keys: ["Ctrl-ArrowLeft"], expected: "|#  \nnext" },

    // Shift+Ctrl+Arrow selection extensions
    { label: "D11 Shift+Ctrl+ArrowRight over # and (bug)", input: "|# (bug) task", keys: ["Shift-Ctrl-ArrowRight", "Shift-Ctrl-ArrowRight"], expected: "[# (bug)] task" },
    { label: "D11 Shift+Ctrl+ArrowLeft over by:2026-11-20", input: "# task by:2026-11-20|", keys: ["Shift-Ctrl-ArrowLeft"], expected: "# task ]by:2026-11-20[" },

    // Plain prose & plain Arrow keys stay standard CodeMirror
    { label: "D11 prose hyphen and apostrophe unchanged", input: "|fix-it don't", keys: ["Ctrl-ArrowRight"], expected: "fix|-it don't" },
    { label: "D11 plain ArrowRight still steps inside by:date", input: "# by:2026-11-20|", keys: ["ArrowLeft"], expected: "# by:2026-11-2|0" },
  ]);

  runDeleteTable([
    { label: "D11 Ctrl+Backspace removes by:2026-11-20 in 1 undo", input: "# task by:2026-11-20|", keys: ["Ctrl-Backspace"], expected: "# task |" },
    { label: "D11 Ctrl+Backspace removes (bug)", input: "# (bug)| task", keys: ["Ctrl-Backspace"], expected: "# | task" },
    { label: "D11 Ctrl+Backspace removes leading # ", input: "# |task", keys: ["Ctrl-Backspace"], expected: "|task" },
    { label: "D11 Ctrl+Backspace keeps #  when deleting extra space", input: "#  |task", keys: ["Ctrl-Backspace"], expected: "# |task" },
    { label: "D11 Ctrl+Backspace removes @dana-k after single space", input: "ping @dana-k |now", keys: ["Ctrl-Backspace"], expected: "ping |now" },
    { label: "D11 Ctrl+Backspace removes v 12. step by step", input: "v 12. |done", keys: ["Ctrl-Backspace"], expected: "v |done" },
    { label: "D11 Ctrl+Delete forward deletes by:2026-11-20", input: "# task| by:2026-11-20 fix", keys: ["Ctrl-Delete"], expected: "# task| fix" },
    { label: "D11 Ctrl+Delete forward deletes # ", input: "|# task", keys: ["Ctrl-Delete"], expected: "|task" },
    { label: "D11 Ctrl+Delete forward deletes 12. in v 12. done", input: "v |12. done", keys: ["Ctrl-Delete"], expected: "v |done" },
    { label: "D11 Ctrl+Delete stops before @dana from (", input: "|(@dana)", keys: ["Ctrl-Delete"], expected: "|@dana)" },
    { label: "D11 Ctrl+Backspace stops after ( in (@dana)", input: "(@dana)|", keys: ["Ctrl-Backspace"], expected: "(@dana|" },
    { label: "D11 Ctrl+Backspace at col 0 deletes newline only", input: "first\n|# second", keys: ["Ctrl-Backspace"], expected: "first|# second" },
    { label: "D11 Ctrl+Delete at eol deletes newline only", input: "# first|\nsecond", keys: ["Ctrl-Delete"], expected: "# first|second" },
  ]);

  it("D11 Ctrl+Backspace preserves numbered-list renumbering filter", () => {
    const ed = openEditor("1. first\n2. second|\n3. third");
    ed.press("Ctrl-Backspace");
    expect(ed.caret()).toBe("1. first\n2. |\n3. third");
    ed.press("Ctrl-Backspace");
    // Blank line splits item 3 into a new list starting at 1.
    expect(ed.text()).toBe("1. first\n\n1. third");
  });
});
