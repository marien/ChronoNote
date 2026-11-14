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

interface InputCase {
  label: string;
  input: string;
  op: "type" | "paste";
  text: string;
  expected: string;
}

function runInputTable(cases: InputCase[]): void {
  for (const c of cases) {
    it(`${c.label}: ${JSON.stringify(c.input)} + ${c.op}(${JSON.stringify(c.text)})`, () => {
      const ed = openEditor(c.input);
      if (c.op === "type") {
        ed.type(c.text);
      } else {
        ed.paste(c.text);
      }
      expect(ed.caret()).toBe(c.expected);
      expect(ed.undo()).toBe(true);
      expect(ed.caret()).toBe(c.input);
      expect(ed.redo()).toBe(true);
      expect(ed.caret()).toBe(c.expected);
    });
  }
}

describe("editing table: typing & pasting (1-line and 2-line)", () => {
  // Rule: Typing a single character inserts plainly without altering surrounding structure (Spec 2.2, §457, §464)
  const plainTypeCases: InputCase[] = (
    [
      ["empty", "|", "a", "a|"],
      ["spaces only", "  |", "a", "  a|"],
      ["prose mid", "hel|lo", "x", "helx|lo"],
      ["indented prose", "  |text", "a", "  a|text"],
      ["bullet -", "- |item", "a", "- a|item"],
      ["bullet *", "* item|", "s", "* items|"],
      ["open action #", "# |task", "a", "# a|task"],
      ["done action v", "v ta|sk", "x", "v tax|sk"],
      ["deferred action >", "> task|", "!", "> task!|"],
      ["wont-do action x", "x |task", "a", "x a|task"],
      ["open topic o", "o |topic", "a", "o a|topic"],
      ["discussed topic .", ". top|ic", "x", ". topx|ic"],
      ["postponed topic ,", ", topic|", "!", ", topic!|"],
      ["emphasis !", "! |urgent", "a", "! a|urgent"],
      ["action+bullet # -", "# - |task", "a", "# - a|task"],
      ["action+emphasis # !", "# ! |urgent", "a", "# ! a|urgent"],
      ["action+emphasis+bullet # ! -", "# ! - |item", "a", "# ! - a|item"],
      ["follow-up =>", "=> |follow", "a", "=> a|follow"],
      ["consequence => #", "=> # |act", "a", "=> # a|act"],
      ["prose+consequence a => # b", "a => # |b", "x", "a => # x|b"],
      ["numbered 1.", "1. |item", "a", "1. a|item"],
      ["dotted sub-item 1.1.", "   1.1. |sub", "a", "   1.1. a|sub"],
      ["action+numbered # 1.", "# 1. |task", "a", "# 1. a|task"],
      ["topic+bullet o -", "o - |topic", "a", "o - a|topic"],
      ["topic+numbered o 1.", "o 1. |topic", "a", "o 1. a|topic"],
      ["title above ===", "Title|\n=====", "s", "Titles|\n====="],
      ["=== underline", "Title\n=====|", "=", "Title\n======|"],
      ["subtitle above ---", "Sub|\n---", "s", "Subs|\n---"],
      ["continuation line", "- item\n  |cont", "a", "- item\n  a|cont"],
      ["tab-indented action", "\t# |task", "a", "\t# a|task"],
    ] as Array<[string, string, string, string]>
  ).map(([name, input, text, expected]) => ({
    label: `type char on ${name}`,
    input,
    op: "type",
    text,
    expected,
  }));

  runInputTable(plainTypeCases);

  // Rule: Typing over selections, held-caret §463, and numbered-list renumbering on type (§457, §463, §464)
  runInputTable([
    {
      label: "type over single-line selection",
      input: "# he[ll]o",
      op: "type",
      text: "y",
      expected: "# hey|o",
    },
    {
      label: "type over multi-line selection in numbered list renumbers following items (§464)",
      input: "1. a\n2. [b\n3. c]\n4. d",
      op: "type",
      text: "x",
      expected: "1. a\n2. x|\n3. d",
    },
    {
      label: "typing a digit on blank line between two lists never renumbers (§464)",
      input: "1. a\n|\n1. b",
      op: "type",
      text: "2",
      expected: "1. a\n2|\n1. b",
    },
    {
      label: "typing a non-digit on continuation spaces between two lists joins and renumbers (§457)",
      input: "1) a\n   |\n1) b",
      op: "type",
      text: "x",
      expected: "1) a\n   x|\n2) b",
    },
    {
      label: "held caret §463: typing 'x' before existing spaces keeps caret before spaces",
      input: "|  ",
      op: "type",
      text: "x",
      expected: "x|  ",
    },
    {
      label: "held caret §463: typing 'v' after '=> ' before existing space stays text",
      input: "=> | ",
      op: "type",
      text: "v",
      expected: "=> v| ",
    },
    {
      label: "held caret §463: typing '#' before existing space keeps caret before space",
      input: "| ",
      op: "type",
      text: "#",
      expected: "#| ",
    },
  ]);

  // Rule: Typing 'by' before an existing ':2026-10-30' then one Backspace deletes one letter (Known Bug)
  it("typing 'by' before ':2026-10-30' then one Backspace leaves 'b|:2026-10-30' (bug)", () => {
    const ed = openEditor("# task |:2026-10-30");
    ed.type("by");
    expect(ed.caret()).toBe("# task by|:2026-10-30");
    ed.press("Backspace");
    expect(ed.caret()).toBe("# task b|:2026-10-30");
    expect(ed.undo()).toBe(true);
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("# task |:2026-10-30");
  });

  // Rule: Paste of 1 line and 2 lines — plain text, empty-symbol merge (§363, §464, Known Bugs), state-first (§367), numbered renumbering
  runInputTable([
    { label: "paste 1 plain line on prose", input: "hel|lo", op: "paste", text: "XYZ", expected: "helXYZ|lo" },
    { label: "paste 2 plain lines on prose", input: "hel|lo", op: "paste", text: "A\nB", expected: "helA\nB|lo" },
    { label: "paste 1 plain line over selection", input: "# he[ll]o", op: "paste", text: "y", expected: "# hey|o" },
    { label: "paste 2 plain lines over selection", input: "# a[b]c", op: "paste", text: "1\n2", expected: "# a1\n2|c" },
    { label: "paste plain text onto empty '# ' keeps '# '", input: "# |", op: "paste", text: "call Dana", expected: "# call Dana|" },
    // Pasting onto empty symbol (§363, Known Bugs)
    { label: "paste '# call Dana' onto empty '# ' merges (§363)", input: "# |", op: "paste", text: "# call Dana", expected: "# call Dana|" },
    { label: "paste 'v sent' onto empty '# ' adopts pasted symbol", input: "# |", op: "paste", text: "v sent", expected: "v sent|" },
    { label: "paste '- item' onto empty '# ' adopts bullet", input: "# |", op: "paste", text: "- item", expected: "- item|" },
    { label: "paste 'o budget' onto empty '# ' adopts topic", input: "# |", op: "paste", text: "o budget", expected: "o budget|" },
    { label: "paste 'v sent' onto empty '- ' adopts symbol", input: "- |", op: "paste", text: "v sent", expected: "v sent|" },
    { label: "paste '# task' onto indented empty '  # ' keeps indent", input: "  # |", op: "paste", text: "# task", expected: "  # task|" },
    { label: "paste '=> item' onto empty '  => ' gives '  => item' (bug)", input: "  => |", op: "paste", text: "=> item", expected: "  => item|" },
    { label: "paste '# - nested' onto empty '  # - ' gives '  # - nested' (bug)", input: "  # - |", op: "paste", text: "# - nested", expected: "  # - nested|" },
    {
      label: "paste 2 lines '# one\\n# two' onto empty '  # ' indents both (bug)",
      input: "  # |",
      op: "paste",
      text: "# one\n# two",
      expected: "  # one\n  # two|",
    },
    {
      label: "paste onto non-empty '# existing' does NOT replace symbol",
      input: "# existing|",
      op: "paste",
      text: "# call Dana",
      expected: "# existing# call Dana|",
    },
    {
      label: "paste numbered item onto empty numbered item replaces marker and follows list (§464)",
      input: "1. a\n2. |",
      op: "paste",
      text: "5. b",
      expected: "1. a\n2. b|",
    },
    // State-first on paste (§367)
    {
      label: "paste list-first '- # task' normalises to state-first (§367)",
      input: "|",
      op: "paste",
      text: "- # task",
      expected: "# - task|",
    },
    {
      label: "paste 2 list-first lines normalises both (§367)",
      input: "|",
      op: "paste",
      text: "- # first\n2) v second",
      expected: "# - first\nv 2) second|",
    },
    // Numbered list renumbering on paste (§457, §464)
    {
      label: "paste 2 numbered items over selection renumbers list",
      input: "1. a\n[2. old]\n3. d",
      op: "paste",
      text: "9. b\n9. c",
      expected: "1. a\n2. b\n3. c|\n4. d",
    },
    // Due word on prose stays untouched on paste (§419)
    {
      label: "paste plain prose with by:tomorrow does NOT rewrite",
      input: "|",
      op: "paste",
      text: "plain prose by:tomorrow",
      expected: "plain prose by:tomorrow|",
    },
  ]);

  // Rule: Paste rewrites due words on action lines (§419)
  it("paste of 1-line and 2-line actions with by:tomorrow rewrites due words", () => {
    const ed1 = openEditor("|");
    ed1.paste("# send by:tomorrow");
    expect(ed1.text()).not.toContain("by:tomorrow");
    expect(ed1.text()).toMatch(/^# send by:\d{4}-\d{2}-\d{2}$/);
    const after1 = ed1.caret();
    expect(ed1.undo()).toBe(true);
    expect(ed1.caret()).toBe("|");
    expect(ed1.redo()).toBe(true);
    expect(ed1.caret()).toBe(after1);

    const ed2 = openEditor("|");
    ed2.paste("# first by:tomorrow\n# second by:today");
    expect(ed2.text()).not.toContain("by:tomorrow");
    expect(ed2.text()).not.toContain("by:today");
    expect(ed2.text()).toMatch(/^# first by:\d{4}-\d{2}-\d{2}\n# second by:\d{4}-\d{2}-\d{2}$/);
    const after2 = ed2.caret();
    expect(ed2.undo()).toBe(true);
    expect(ed2.caret()).toBe("|");
    expect(ed2.redo()).toBe(true);
    expect(ed2.caret()).toBe(after2);
  });
});
