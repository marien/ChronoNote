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

interface KeyCase {
  label: string;
  input: string;
  key: "Enter" | "Shift-Enter";
  expected: string;
}

function runKeyTable(cases: KeyCase[]): void {
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

describe("editing table: Enter & Shift-Enter", () => {
  // Rule: Enter continues leading markers (Spec 2.2, 2.4, §50, §51, §85, §124, §201, §244, §367, §454, bug: o ! -)
  const enterContinueCases: KeyCase[] = (() => {
    const kinds: Array<[string, string, string]> = [
      ["bullet -", "- ", "- "],
      ["bullet *", "* ", "* "],
      ["indented bullet", "  - ", "  - "],
      ["open action #", "# ", "# "],
      ["done action v", "v ", "# "],
      ["deferred action >", "> ", "# "],
      ["wont-do action x", "x ", "# "],
      ["indented action", "  # ", "  # "],
      ["tab-indented action", "\t# ", "\t# "],
      ["open topic o", "o ", "o "],
      ["discussed topic .", ". ", "o "],
      ["postponed topic ,", ", ", "o "],
      ["action+bullet # -", "# - ", "# - "],
      ["action+bullet v *", "v * ", "# * "],
      ["emphasis+bullet ! -", "! - ", "! - "],
      ["emphasis+bullet ! *", "! * ", "! * "],
      ["action+emphasis+bullet # ! -", "# ! - ", "# ! - "],
      ["topic+bullet o -", "o - ", "o - "],
      ["topic+emphasis+bullet o ! -", "o ! - ", "o ! - "],
      ["follow-up =>", "=> ", "=> "],
      ["delegated follow-up => @name", "=> @dana ", "=> "],
      ["consequence open => #", "=> # ", "=> # "],
      ["consequence done => v", "=> v ", "=> # "],
      ["consequence topic => o", "=> o ", "=> o "],
      ["consequence topic => .", "=> . ", "=> o "],
      ["numbered 1.", "1. ", "2. "],
      ["numbered 7.", "7. ", "8. "],
      ["numbered 9. digit boundary", "9. ", "10. "],
      ["numbered 99. digit boundary", "99. ", "100. "],
      ["numbered 1)", "1) ", "2) "],
      ["numbered 2)", "2) ", "3) "],
      ["top-level 1.1.", "1.1. ", "1.2. "],
      ["top-level 2.9. digit boundary", "2.9. ", "2.10. "],
      ["top-level 1.2.3) three levels", "1.2.3) ", "1.2.4) "],
      ["indented 4 spaces numbered", "    3. ", "    4. "],
      ["tab-indented numbered", "\t1. ", "\t2. "],
      ["dotted sub-item 1.1.", "   1.1. ", "   1.2. "],
      ["indented 1.1. under parent", "  1.1. ", "  1.2. "],
      ["action+numbered # 1.", "# 1. ", "# 2. "],
      ["done+numbered v 1.", "v 1. ", "# 2. "],
      ["topic+numbered o 1.", "o 1. ", "o 2. "],
    ];
    const rows: KeyCase[] = [];
    for (const [name, prefix, nextPrefix] of kinds) {
      rows.push(
        {
          label: `continue ${name} at end`,
          input: `${prefix}alpha|`,
          key: "Enter",
          expected: `${prefix}alpha\n${nextPrefix}|`,
        },
        {
          label: `continue ${name} mid-text`,
          input: `${prefix}al|pha`,
          key: "Enter",
          expected: `${prefix}al\n${nextPrefix}|pha`,
        },
        {
          label: `continue ${name} at text start`,
          input: `${prefix}|alpha`,
          key: "Enter",
          expected: `${prefix}\n${nextPrefix}|alpha`,
        },
      );
    }
    return rows;
  })();

  runKeyTable(enterContinueCases);

  // Rule: Enter on empty leading marker exits / clears the marker (Spec 2.4, §85, §124, §201, §244, §367, §454)
  const enterExitCases: KeyCase[] = [
    "- |",
    "  - |",
    "* |",
    "# |",
    "v |",
    "> |",
    "x |",
    "  # |",
    "\t# |",
    "o |",
    ". |",
    ", |",
    "# - |",
    "! - |",
    "# ! - |",
    "o - |",
    "o ! - |",
    "=> |",
    "=> # |",
    "=> o |",
    "1. |",
    "2) |",
    "# 1. |",
    "o 1. |",
  ].map((input) => ({
    label: "exit empty marker",
    input,
    key: "Enter" as const,
    expected: "|",
  }));

  runKeyTable(enterExitCases);

  // Rule: Enter on empty sub-item or mid-list numbered item (Spec 2.4, §264, §457, §464)
  runKeyTable([
    {
      label: "empty numbered sub-item promotes out under numbered parent",
      input: "1. a\n   1. |",
      key: "Enter",
      expected: "1. a\n2. |",
    },
    {
      label: "empty bullet sub-item promotes out under numbered parent",
      input: "1. a\n   - |",
      key: "Enter",
      expected: "1. a\n2. |",
    },
    {
      label: "empty numbered sub-item with following siblings makes them children from 1",
      input: "1. a\n   1. |\n   2. b",
      key: "Enter",
      expected: "1. a\n2. |\n   1. b",
    },
    {
      label: "empty numbered sub-item under bullet parent exits normally",
      input: "- a\n  1. |",
      key: "Enter",
      expected: "- a\n|",
    },
    {
      label: "exiting empty middle numbered item restarts rest from 1",
      input: "1. a\n2. |\n3. b",
      key: "Enter",
      expected: "1. a\n|\n1. b",
    },
    {
      label: "empty second numbered item exits list",
      input: "1. a\n2. |",
      key: "Enter",
      expected: "1. a\n|",
    },
    {
      label: "empty dotted sub-item promotes to parent marker and exits on next Enter",
      input: "1. a\n  1.1. b\n  1.2. |",
      key: "Enter",
      expected: "1. a\n  1.1. b\n2. |",
    },
    {
      label: "empty promoted parent marker exits sub-list",
      input: "1. a\n  1.1. b\n2. |",
      key: "Enter",
      expected: "1. a\n  1.1. b\n|",
    },
    {
      label: "empty sub-item promotes to parent marker when outer list continues",
      input: "1. a\n   1. b\n   2. |\n2. c",
      key: "Enter",
      expected: "1. a\n   1. b\n2. |\n3. c",
    },
    {
      label: "empty middle 1) item exits and restarts tail at 1)",
      input: "1) a\n2) |\n3) c",
      key: "Enter",
      expected: "1) a\n|\n1) c",
    },
    {
      label: "empty middle item in start-at-4 list exits and restarts tail at 1",
      input: "4. a\n5. |\n6. c",
      key: "Enter",
      expected: "4. a\n|\n1. c",
    },
    {
      label: "empty dotted sub-item under parent promotes to parent next item",
      input: "1. parent\n   1.1. child\n   1.2. |",
      key: "Enter",
      expected: "1. parent\n   1.1. child\n2. |",
    },
    {
      label: "empty dotted sub-item promotes and updates following dotted children to parent number",
      input: "1. a\n   1.1. b\n   1.2. |\n   1.3. c\n2. d",
      key: "Enter",
      expected: "1. a\n   1.1. b\n2. |\n   2.1. c\n3. d",
    },
    {
      label: "empty ) sub-item promotes and turns following sub-items into children from 1)",
      input: "1) a\n   1) b\n   2) |\n   3) c\n2) d",
      key: "Enter",
      expected: "1) a\n   1) b\n2) |\n   1) c\n3) d",
    },
    {
      label: "empty sub-item promotes in list starting at 4 and renumbers siblings",
      input: "4. a\n   1. b\n   2. |\n   3. c\n5. d",
      key: "Enter",
      expected: "4. a\n   1. b\n5. |\n   1. c\n6. d",
    },
    {
      label: "empty three-level sub-item promotes to second level and renumbers children",
      input: "1. a\n   1.1. b\n      1.1.1. c\n      1.1.2. |\n      1.1.3. d\n   1.2. e",
      key: "Enter",
      expected: "1. a\n   1.1. b\n      1.1.1. c\n   1.2. |\n      1.2.1. d\n   1.3. e",
    },
    {
      label: "sub-bullet inside numbered list does not break outer list numbering on Enter",
      input: "1. a\n   - x\n2. b|",
      key: "Enter",
      expected: "1. a\n   - x\n2. b\n3. |",
    },
    {
      label: "Enter on sub-item under parent continues sub-list",
      input: "1. parent\n   1. child|",
      key: "Enter",
      expected: "1. parent\n   1. child\n   2. |",
    },
    {
      label: "Enter on numbered item between two bullets continues numbers",
      input: "- a\n1. b|\n- c",
      key: "Enter",
      expected: "- a\n1. b\n2. |\n- c",
    },
    {
      label: "Enter on bullet between numbered items continues bullet",
      input: "1. a\n- b|\n2. c",
      key: "Enter",
      expected: "1. a\n- b\n- |\n2. c",
    },
    {
      label: "Enter on first bullet before numbered item continues bullet",
      input: "- x|\n1. y\n- z",
      key: "Enter",
      expected: "- x\n- |\n1. y\n- z",
    },
    {
      label: "Enter on bullet after numbered item continues bullet",
      input: "- x\n- \n1. y\n- z|",
      key: "Enter",
      expected: "- x\n- \n1. y\n- z\n- |",
    },
    {
      label: "Enter on numbered child under bullet keeps indent and continues numbers",
      input: "- parent\n  1. child|",
      key: "Enter",
      expected: "- parent\n  1. child\n  2. |",
    },
    {
      label: "Enter on bullet child under numbered item keeps indent and continues bullet",
      input: "1. parent\n  - child|",
      key: "Enter",
      expected: "1. parent\n  - child\n  - |",
    },
    {
      label: "Enter on bullet whose text starts with number continues bullet",
      input: "- 1. bullet|",
      key: "Enter",
      expected: "- 1. bullet\n- |",
    },
    {
      label: "Enter on numbered item whose text starts with bullet continues number",
      input: "1. - numbered|",
      key: "Enter",
      expected: "1. - numbered\n2. |",
    },
    {
      label: "Enter on empty bullet after numbered item exits bullet",
      input: "- a\n1. b\n- |",
      key: "Enter",
      expected: "- a\n1. b\n|",
    },
    {
      label: "Enter on empty numbered item after bullets exits numbered item",
      input: "- a\n- b\n1. |",
      key: "Enter",
      expected: "- a\n- b\n|",
    },
    {
      label: "Enter on numbered item below action line continues numbers",
      input: "# task\n1. item|",
      key: "Enter",
      expected: "# task\n1. item\n2. |",
    },
    {
      label: "Enter on action line above numbered list continues action",
      input: "# task|\n1. item\n2. ",
      key: "Enter",
      expected: "# task\n# |\n1. item\n2. ",
    },
    {
      label: "Enter after item 1 of 4 renumbers 2, 3, 4 down",
      input: "1. a|\n2. b\n3. c\n4. d",
      key: "Enter",
      expected: "1. a\n2. |\n3. b\n4. c\n5. d",
    },
    {
      label: "Enter splitting item mid-text keeps space on new line and renumbers following",
      input: "1. hello| world",
      key: "Enter",
      expected: "1. hello\n2. | world",
    },
    {
      label: "Enter splitting item after space keeps caret at text start and renumbers siblings",
      input: "1. one |two\n2. b\n3. c",
      key: "Enter",
      expected: "1. one \n2. |two\n3. b\n4. c",
    },
    {
      label: "Enter before blank line leaves second list untouched",
      input: "1. a|\n2. b\n\n2. other\n3. more",
      key: "Enter",
      expected: "1. a\n2. |\n3. b\n\n2. other\n3. more",
    },
    {
      label: "Enter moves following sibling's dotted sub-items when renumbered",
      input: "1. a|\n2. b\n  2.1. b one\n3. c",
      key: "Enter",
      expected: "1. a\n2. |\n3. b\n  3.1. b one\n4. c",
    },
    {
      label: "Enter with dotted sub-items renumbers 3 siblings and sub-item",
      input: "1. a|\n   1.1. sub\n2. b\n3. c",
      key: "Enter",
      expected: "1. a\n2. |\n   2.1. sub\n3. b\n4. c",
    },
    {
      label: "Enter with plain sub-items renumbers following siblings",
      input: "1. a|\n   1. sub\n2. b\n3. c",
      key: "Enter",
      expected: "1. a\n2. |\n   1. sub\n3. b\n4. c",
    },
    {
      label: "Enter with continuation line renumbers following siblings",
      input: "1. a|\n   cont\n2. b\n3. c",
      key: "Enter",
      expected: "1. a\n2. |\n   cont\n3. b\n4. c",
    },
    {
      label: "Enter with sub-bullet renumbers following siblings",
      input: "1. a|\n   - bullet\n2. b\n3. c",
      key: "Enter",
      expected: "1. a\n2. |\n   - bullet\n3. b\n4. c",
    },
    {
      label: "Enter with dotted sub-items starting at 4 renumbers prefix and sibling",
      input: "4. a|\n   4.1. sub\n5. b",
      key: "Enter",
      expected: "4. a\n5. |\n   5.1. sub\n6. b",
    },
    {
      label: "Enter with plain sub-items in ) list renumbers siblings",
      input: "1) a|\n   1) sub\n2) b",
      key: "Enter",
      expected: "1) a\n2) |\n   1) sub\n3) b",
    },
    {
      label: "Enter with three-level dotted sub-items renumbers third level",
      input: "1. a\n   1.1. b|\n      1.1.1. c\n   1.2. d\n2. e",
      key: "Enter",
      expected: "1. a\n   1.1. b\n   1.2. |\n      1.2.1. c\n   1.3. d\n2. e",
    },
    {
      label: "Enter growing 9 to 10 shifts continuation line and sub-item by +1 space",
      input: "1. x\n2. x\n3. x\n4. x\n5. x\n6. x\n7. x\n8. x|\n9. ninth\n   cont\n   1. sub",
      key: "Enter",
      expected: "1. x\n2. x\n3. x\n4. x\n5. x\n6. x\n7. x\n8. x\n9. |\n10. ninth\n    cont\n    1. sub",
    },
    {
      label: "Enter growing 9.9 to 9.10 shifts continuation and sub-item by +1 space",
      input: "9.8. prev|\n9.9. a\n     sub text\n     1. sub",
      key: "Enter",
      expected: "9.8. prev\n9.9. |\n9.10. a\n      sub text\n      1. sub",
    },
    {
      label: "Enter growing three-level 9 to 10 shifts nested subtrees",
      input: "8. x|\n9. a\n   9.1. b\n        9.1.1. c",
      key: "Enter",
      expected: "8. x\n9. |\n10. a\n    10.1. b\n          10.1.1. c",
    },
    {
      label: "Enter growing 9) to 10) shifts continuation and sub-item by +1 space",
      input: "8) pre|\n9) a\n   sub text\n   1) sub",
      key: "Enter",
      expected: "8) pre\n9) |\n10) a\n    sub text\n    1) sub",
    },
    {
      label: "Enter mid-list renumbers past tab-indented sub-item",
      input: "1. a|\n\t1.1. sub\n2. b\n3. c",
      key: "Enter",
      expected: "1. a\n2. |\n\t2.1. sub\n3. b\n4. c",
    },
    {
      label: "Enter mid-list on tab-indented list renumbers past space-indented sub-item",
      input: "\t1. a|\n    1.1. sub\n\t2. b",
      key: "Enter",
      expected: "\t1. a\n\t2. |\n    2.1. sub\n\t3. b",
    },
    {
      label: "Enter mid-list collides and renumbers siblings",
      input: "1. a|\n2. b",
      key: "Enter",
      expected: "1. a\n2. |\n3. b",
    },
    {
      label: "Enter mid-list without collision keeps non-colliding sibling",
      input: "1. a|\n3. b",
      key: "Enter",
      expected: "1. a\n2. |\n3. b",
    },
    {
      label: "Enter on item with dotted sub-items updates sub-items and renumbers siblings",
      input: "1. a|\n   1.1. sub\n2. b",
      key: "Enter",
      expected: "1. a\n2. |\n   2.1. sub\n3. b",
    },
    {
      label: "Enter mid-text splits item and renumbers following siblings",
      input: "1. al|pha\n2. beta",
      key: "Enter",
      expected: "1. al\n2. |pha\n3. beta",
    },
    // D4 Rule 3: Enter on numbered items behind a lead
    {
      label: "Enter on done action+numbered opens next as # (Rule 3.1)",
      input: "# 1. a\nv 2. x|",
      key: "Enter",
      expected: "# 1. a\nv 2. x\n# 3. |",
    },
    {
      label: "Enter on deferred action+numbered opens next as # (Rule 3.1)",
      input: "> 1. x|",
      key: "Enter",
      expected: "> 1. x\n# 2. |",
    },
    {
      label: "Enter on topic+numbered opens next as o (Rule 3.1)",
      input: ". 1. x|",
      key: "Enter",
      expected: ". 1. x\no 2. |",
    },
    {
      label: "Enter mid-list on lead item renumbers mixed following leads (Rule 3.2)",
      input: "# 1. a|\n# 2. b\nv 3. c",
      key: "Enter",
      expected: "# 1. a\n# 2. |\n# 3. b\nv 4. c",
    },
    {
      label: "Enter on empty top-level lead item exits list to empty line (Rule 3.3)",
      input: "# 1. a\n# 2. |",
      key: "Enter",
      expected: "# 1. a\n|",
    },
    {
      label: "Enter on empty lead sub-item promotes to parent numbered list (Rule 3.3)",
      input: "# 1. a\n     # 1. |",
      key: "Enter",
      expected: "# 1. a\n# 2. |",
    },
    {
      label: "Shift+Enter on lead numbered item creates indented continuation under text column (Rule 3.4)",
      input: "# 1. plan|",
      key: "Shift-Enter",
      expected: "# 1. plan\n     |",
    },
    {
      label: "Enter does not split unified list across a lead continuation line (Rule 1.3)",
      input: "1. a|\n#  book room\n2. b",
      key: "Enter",
      expected: "1. a\n2. |\n#  book room\n3. b",
    },
    {
      label: "a topic line between two lists keeps them apart (Rule 1.3)",
      input: "o Budget\n1. a|\n2. b\no Hiring\n1. c",
      key: "Enter",
      expected: "o Budget\n1. a\n2. |\n3. b\no Hiring\n1. c",
    },
  ]);

  // Rule: Enter at col 0, inside indent, or between symbol and space (§115, §201, §463, §465) is a plain line break
  runKeyTable([
    ...([
      "|- item",
      "|* item",
      "|# task",
      "|v task",
      "|> task",
      "|x task",
      "|o topic",
      "|. topic",
      "|, topic",
      "|=> follow",
      "|=> # act",
      "|1. item",
      "|# - task",
      "|# ! - item",
      "|o 1. topic",
      "|  - indented",
      "|\t# tab",
    ].map((input) => ({
      label: "Enter at col 0",
      input,
      key: "Enter" as const,
      expected: `\n${input}`,
    }))),
    {
      label: "Enter inside indent of bullet",
      input: " | - item",
      key: "Enter",
      expected: " \n| - item",
    },
    {
      label: "Enter inside indent of action",
      input: " | # task",
      key: "Enter",
      expected: " \n| # task",
    },
    {
      label: "Enter inside indent of numbered item",
      input: " | 1. item",
      key: "Enter",
      expected: " \n| 1. item",
    },
    {
      label: "Enter inside held symbol x|  (§465)",
      input: "x|  ",
      key: "Enter",
      expected: "x\n|  ",
    },
    {
      label: "Enter inside held symbol #| hello (§465)",
      input: "#| hello",
      key: "Enter",
      expected: "#\n| hello",
    },
    {
      label: "Enter inside held symbol =>| hello (§465)",
      input: "=>| hello",
      key: "Enter",
      expected: "=>\n| hello",
    },
    {
      label: "Enter inside held symbol -| item",
      input: "-| item",
      key: "Enter",
      expected: "-\n| item",
    },
    {
      label: "Enter inside held symbol o| topic",
      input: "o| topic",
      key: "Enter",
      expected: "o\n| topic",
    },
    {
      label: "Enter inside numbered marker 1.| item (§201)",
      input: "1.| item",
      key: "Enter",
      expected: "1.\n| item",
    },
    {
      label: "Enter inside multi-digit marker 1|2. twelve",
      input: "1|2. twelve",
      key: "Enter",
      expected: "1\n|2. twelve",
    },
    ...(["!", "v", ">", "x"] as const).map((sym) => ({
      label: `Enter after held symbol ${sym}|`,
      input: `${sym}| rest`,
      key: "Enter" as const,
      expected: `${sym}\n| rest`,
    })),
    ...(["#", "x", "o", "-", "v", ">", "=>", "!", "1."] as const).flatMap((sym) =>
      ([" ", "  ", "   "] as const).map((spaces) => ({
        label: `Enter after held symbol ${sym}| with ${spaces.length} trailing spaces`,
        input: `${sym}|${spaces}`,
        key: "Enter" as const,
        expected: `${sym}\n|${spaces}`,
      })),
    ),
  ]);

  // Rule: Enter on non-list/plain/title lines defers to smart-indent newline (§23), except title lines which are plain breaks (Known Bug)
  runKeyTable([
    { label: "empty line", input: "|", key: "Enter", expected: "\n|" },
    { label: "spaces only (§23 smart-indent)", input: "  |", key: "Enter", expected: "\n  |" },
    { label: "prose mid", input: "plain |text", key: "Enter", expected: "plain \n|text" },
    { label: "prose end", input: "plain text|", key: "Enter", expected: "plain text\n|" },
    { label: "indented prose (§23 smart-indent)", input: "  inde|nted", key: "Enter", expected: "  inde\n  |nted" },
    { label: "plain emphasis ! urgent", input: "! urgent|", key: "Enter", expected: "! urgent\n|" },
    { label: "action+emphasis # ! urgent", input: "# ! urgent|", key: "Enter", expected: "# ! urgent\n# |" },
    { label: "prose before arrow a => # b", input: "a => # b|", key: "Enter", expected: "a => # b\n|" },
    { label: "=== underline", input: "Title\n=====|", key: "Enter", expected: "Title\n=====\n|" },
    { label: "--- underline", input: "Sub\n---|", key: "Enter", expected: "Sub\n---\n|" },
    {
      label: "continuation line under bullet (§23 smart-indent)",
      input: "- item\n  conti|nued",
      key: "Enter",
      expected: "- item\n  conti\n  |nued",
    },
    ...([
      "3.5 hours",
      "1.5",
      "1.1 not a sublist",
      "12 monkeys",
      "0. zero",
      "01. leading zero",
      "a. letter",
      "1.x",
      "(1). x",
      "1: x",
      "1.",
      "see 1. here",
    ]).map((line) => ({
      label: `non-numbered line gets plain newline: ${line}`,
      input: `${line}|`,
      key: "Enter" as const,
      expected: `${line}\n|`,
    })),
    // Known Bug: Enter at end of title line above === or --- is a plain line break whatever it starts with
    { label: "plain title above ===", input: "Title|\n=====", key: "Enter", expected: "Title\n|\n=====" },
    {
      label: "action title above ===",
      input: "# Task title|\n============",
      key: "Enter",
      expected: "# Task title\n|\n============",
    },
    {
      label: "numbered title above ===",
      input: "1. Num title|\n============",
      key: "Enter",
      expected: "1. Num title\n|\n============",
    },
    {
      label: "bullet subtitle above ---",
      input: "- Bullet sub|\n------------",
      key: "Enter",
      expected: "- Bullet sub\n|\n------------",
    },
    {
      label: "topic subtitle above ---",
      input: "o Topic sub|\n-----------",
      key: "Enter",
      expected: "o Topic sub\n|\n-----------",
    },
  ]);

  // Rule: Enter and Shift-Enter with selection replace selection first, then act (Known Bug)
  runKeyTable([
    {
      label: "Enter with selection inside action",
      input: "# buy [milk]",
      key: "Enter",
      expected: "# buy \n# |",
    },
    {
      label: "Enter with selection across two bullets",
      input: "- [one\n- t]wo",
      key: "Enter",
      expected: "- \n- |wo",
    },
    {
      label: "Enter with selection inside action text",
      input: "# a[b]c",
      key: "Enter",
      expected: "# a\n# |c",
    },
    {
      label: "Enter deleting whole action line",
      input: "[# task]",
      key: "Enter",
      expected: "\n|",
    },
    {
      label: "Shift-Enter with selection inside action",
      input: "# buy [milk]",
      key: "Shift-Enter",
      expected: "# buy \n  |",
    },
    {
      label: "Shift-Enter with selection across two bullets",
      input: "- [one\n- t]wo",
      key: "Shift-Enter",
      expected: "- \n  |wo",
    },
    {
      label: "Shift-Enter deleting whole action line",
      input: "[# task]",
      key: "Shift-Enter",
      expected: "\n|",
    },
  ]);

  // Rule: Decision D3 — Shift-Enter starts continuation line at current line's text column on EVERY leading marker
  const shiftEnterCases: KeyCase[] = (() => {
    const markerCols: Array<[string, string, string]> = [
      ["bullet -", "- ", "  "],
      ["bullet *", "* ", "  "],
      ["indented bullet", "  - ", "    "],
      ["open action #", "# ", "  "],
      ["done action v", "v ", "  "],
      ["deferred action >", "> ", "  "],
      ["wont-do action x", "x ", "  "],
      ["indented action", "  # ", "    "],
      ["open topic o", "o ", "  "],
      ["discussed topic .", ". ", "  "],
      ["postponed topic ,", ", ", "  "],
      ["emphasis !", "! ", "  "],
      ["emphasis+bullet ! -", "! - ", "    "],
      ["action+bullet # -", "# - ", "    "],
      ["action+emphasis # !", "# ! ", "    "],
      ["action+emphasis+bullet # ! -", "# ! - ", "      "],
      ["topic+bullet o -", "o - ", "    "],
      ["follow-up =>", "=> ", "   "],
      ["consequence action => #", "=> # ", "     "],
      ["delegated follow-up => @dana", "=> @dana ", "   "],
      ["numbered 1.", "1. ", "   "],
      ["numbered 10.", "10. ", "    "],
      ["dotted sub-item 1.1.", "   1.1. ", "        "],
      ["action+numbered # 1.", "# 1. ", "     "],
      ["topic+numbered o 1.", "o 1. ", "     "],
    ];
    const rows: KeyCase[] = [];
    for (const [name, prefix, contIndent] of markerCols) {
      const sample = name.includes("=> @dana") ? "check" : "text";
      const realPrefix = name.includes("=> @dana") ? "=> " : prefix;
      const body = name.includes("=> @dana") ? "@dana check" : sample;
      rows.push(
        {
          label: `D3 Shift-Enter ${name} at end`,
          input: `${realPrefix}${body}|`,
          key: "Shift-Enter",
          expected: `${realPrefix}${body}\n${contIndent}|`,
        },
        {
          label: `D3 Shift-Enter ${name} at text start`,
          input: `${realPrefix}|${body}`,
          key: "Shift-Enter",
          expected: `${realPrefix}\n${contIndent}|${body}`,
        },
      );
      if (!name.includes("=> @dana")) {
        rows.push(
          {
            label: `D3 Shift-Enter ${name} mid-text`,
            input: `${realPrefix}te|xt`,
            key: "Shift-Enter",
            expected: `${realPrefix}te\n${contIndent}|xt`,
          },
          {
            label: `D3 Shift-Enter ${name} empty marker`,
            input: `${realPrefix}|`,
            key: "Shift-Enter",
            expected: `${realPrefix}\n${contIndent}|`,
          },
        );
      }
    }
    return rows;
  })();

  runKeyTable(shiftEnterCases);

  // Rule: Decision D3 & Known Bug — Shift-Enter at col 0, in indent, inside marker, or on non-marker lines is a plain line break
  runKeyTable([
    ...([
      "|- task",
      "|1. item",
      "|o topic",
      "|# task",
      "|=> follow",
      "|# - nested",
      "|  - indented",
      "|\t# tab",
    ].map((input) => ({
      label: "Shift-Enter at col 0 (D3 / bug)",
      input,
      key: "Shift-Enter" as const,
      expected: `\n${input}`,
    }))),
    { label: "Shift-Enter inside indent", input: " | - task", key: "Shift-Enter", expected: " \n| - task" },
    { label: "Shift-Enter inside #| task", input: "#| task", key: "Shift-Enter", expected: "#\n| task" },
    { label: "Shift-Enter inside 1.| item", input: "1.| item", key: "Shift-Enter", expected: "1.\n| item" },
    { label: "Shift-Enter on empty", input: "|", key: "Shift-Enter", expected: "\n|" },
    { label: "Shift-Enter on spaces", input: "  |", key: "Shift-Enter", expected: "  \n|" },
    { label: "Shift-Enter on prose", input: "plain |text", key: "Shift-Enter", expected: "plain \n|text" },
    { label: "Shift-Enter on indented prose", input: "  inde|nted", key: "Shift-Enter", expected: "  inde\n|nted" },
    { label: "Shift-Enter on a => # b", input: "a => # b|", key: "Shift-Enter", expected: "a => # b\n|" },
    { label: "Shift-Enter on === underline", input: "Title\n=====|", key: "Shift-Enter", expected: "Title\n=====\n|" },
    { label: "Shift-Enter on continuation line", input: "- item\n  cont|", key: "Shift-Enter", expected: "- item\n  cont\n|" },
    { label: "Shift-Enter on action title", input: "# Title|\n=======", key: "Shift-Enter", expected: "# Title\n|\n=======" },
    {
      label: "Shift-Enter on numbered item beside bullet aligns under its own text",
      input: "- a\n1. b|",
      key: "Shift-Enter",
      expected: "- a\n1. b\n   |",
    },
  ]);

  // Rule: Enter & Shift-Enter rewrite due-date words when leaving the line (§419, Known Bug)
  for (const key of ["Enter", "Shift-Enter"] as const) {
    it(`${key} leaving '# send by:tomorrow' rewrites by:tomorrow to an ISO date`, () => {
      const input = "# send by:tomorrow|";
      const ed = openEditor(input);
      ed.press(key);
      const after = ed.text();
      expect(after).not.toContain("by:tomorrow");
      const expectedLine2Prefix = key === "Enter" ? "# " : "  ";
      expect(after).toMatch(new RegExp(`^# send by:\\d{4}-\\d{2}-\\d{2}\\n${expectedLine2Prefix}$`));
      const savedCaret = ed.caret();
      expect(ed.undo()).toBe(true);
      expect(ed.caret()).toBe(input);
      expect(ed.redo()).toBe(true);
      expect(ed.text()).toBe(after);
    });
  }
});
