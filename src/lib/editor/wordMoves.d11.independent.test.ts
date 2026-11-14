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
  return s.replace(/[|[\]]/g, "");
}

/** Runs a sequence of key presses and asserts each intermediate caret/selection state,
 *  and that navigation did not alter the document text. */
function assertStops(start: string, key: string, expectedStops: string[]): void {
  const ed = openEditor(start);
  const raw = stripMarkers(start);
  for (const expected of expectedStops) {
    ed.press(key);
    expect(ed.caret()).toBe(expected);
    expect(ed.text()).toBe(raw);
  }
}

/** Runs a deletion key (Mod-Backspace or Mod-Delete), checks the result,
 *  and verifies a single undo restores both text and caret/selection. */
function assertDeleteAndUndo(start: string, key: "Mod-Backspace" | "Mod-Delete", expectedAfter: string): void {
  const ed = openEditor(start);
  ed.press(key);
  expect(ed.caret()).toBe(expectedAfter);
  expect(ed.undo()).toBe(true);
  expect(ed.caret()).toBe(start);
}

describe("D11 independent tests: word moves around glyphs", () => {
  // =========================================================================
  // Rule 1: Leading markers with their one space
  // =========================================================================
  describe("Rule 1: leading markers with their one space", () => {
    const singleLeads: Array<[string, string, string]> = [
      ["open action #", "# ", "task"],
      ["done action v", "v ", "task"],
      ["deferred action >", "> ", "task"],
      ["wont-do action x", "x ", "task"],
      ["open topic o", "o ", "topic"],
      ["discussed topic .", ". ", "topic"],
      ["postponed topic ,", ", ", "topic"],
      ["dash bullet -", "- ", "item"],
      ["star bullet *", "* ", "item"],
      ["emphasis !", "! ", "urgent"],
      ["follow-up =>", "=> ", "follow"],
      ["numbered 1.", "1. ", "item"],
      ["numbered 12.", "12. ", "item"],
      ["numbered 2)", "2) ", "item"],
      ["numbered 1.1.", "1.1. ", "sub"],
    ];

    for (const [label, marker, body] of singleLeads) {
      it(`Mod-ArrowRight and Mod-ArrowLeft treat ${label} as one word`, () => {
        assertStops(`|${marker}${body}`, "Mod-ArrowRight", [
          `${marker}|${body}`,
          `${marker}${body}|`,
        ]);
        assertStops(`${marker}${body}|`, "Mod-ArrowLeft", [
          `${marker}|${body}`,
          `|${marker}${body}`,
        ]);
      });
    }

    it("combined leads: '# - task' is '# ', '- ', 'task' (spec example)", () => {
      assertStops("|# - task", "Mod-ArrowRight", [
        "# |- task",
        "# - |task",
        "# - task|",
      ]);
      assertStops("# - task|", "Mod-ArrowLeft", [
        "# - |task",
        "# |- task",
        "|# - task",
      ]);
    });

    it("combined leads: 'v 12. done' is 'v ', '12. ', 'done' (spec example)", () => {
      assertStops("|v 12. done", "Mod-ArrowRight", [
        "v |12. done",
        "v 12. |done",
        "v 12. done|",
      ]);
      assertStops("v 12. done|", "Mod-ArrowLeft", [
        "v 12. |done",
        "v |12. done",
        "|v 12. done",
      ]);
    });

    it("combined leads: '=> # call' is '=> ', '# ', 'call' (spec example)", () => {
      assertStops("|=> # call", "Mod-ArrowRight", [
        "=> |# call",
        "=> # |call",
        "=> # call|",
      ]);
      assertStops("=> # call|", "Mod-ArrowLeft", [
        "=> # |call",
        "=> |# call",
        "|=> # call",
      ]);
    });

    it("combined leads: 'o ! - topic' is 'o ', '! ', '- ', 'topic'", () => {
      assertStops("|o ! - topic", "Mod-ArrowRight", [
        "o |! - topic",
        "o ! |- topic",
        "o ! - |topic",
        "o ! - topic|",
      ]);
      assertStops("o ! - topic|", "Mod-ArrowLeft", [
        "o ! - |topic",
        "o ! |- topic",
        "o |! - topic",
        "|o ! - topic",
      ]);
    });

    it("consequence variants => v, => >, => x and mid-line 'Talked to Sam => # follow'", () => {
      assertStops("|=> v done", "Mod-ArrowRight", ["=> |v done", "=> v |done", "=> v done|"]);
      assertStops("|=> > later", "Mod-ArrowRight", ["=> |> later", "=> > |later", "=> > later|"]);
      assertStops("|=> x drop", "Mod-ArrowRight", ["=> |x drop", "=> x |drop", "=> x drop|"]);
      assertStops("Talked to Sam |=> # follow", "Mod-ArrowRight", [
        "Talked to Sam => |# follow",
        "Talked to Sam => # |follow",
        "Talked to Sam => # follow|",
      ]);
      assertStops("Talked to Sam => # follow|", "Mod-ArrowLeft", [
        "Talked to Sam => # |follow",
        "Talked to Sam => |# follow",
        "Talked to Sam |=> # follow",
      ]);
    });

    it("indented lines: '  ! urgent' (spec example) and indented markers", () => {
      assertStops("|  ! urgent", "Mod-ArrowRight", [
        "  ! |urgent",
        "  ! urgent|",
      ]);
      assertStops("  ! urgent|", "Mod-ArrowLeft", [
        "  ! |urgent",
        "  |! urgent",
        "|  ! urgent",
      ]);
      assertStops("|  # task", "Mod-ArrowRight", ["  # |task", "  # task|"]);
      assertStops("  # task|", "Mod-ArrowLeft", ["  # |task", "  |# task", "|  # task"]);
      assertStops("|   1.1. sub", "Mod-ArrowRight", ["   1.1. |sub", "   1.1. sub|"]);
      assertStops("   1.1. sub|", "Mod-ArrowLeft", ["   1.1. |sub", "   |1.1. sub", "|   1.1. sub"]);
      assertStops("|\t# - task", "Mod-ArrowRight", ["\t# |- task", "\t# - |task", "\t# - task|"]);
      assertStops("\t# - task|", "Mod-ArrowLeft", ["\t# - |task", "\t# |- task", "\t|# - task", "|\t# - task"]);
    });
  });

  // =========================================================================
  // Rule 2: Due dates with by:
  // =========================================================================
  describe("Rule 2: due dates with by:", () => {
    it("by:2026-11-20 at start (after # ), middle, end, and next to punctuation", () => {
      assertStops("|# by:2026-11-20 task", "Mod-ArrowRight", [
        "# |by:2026-11-20 task",
        "# by:2026-11-20| task",
        "# by:2026-11-20 task|",
      ]);
      assertStops("# by:2026-11-20 task|", "Mod-ArrowLeft", [
        "# by:2026-11-20 |task",
        "# |by:2026-11-20 task",
        "|# by:2026-11-20 task",
      ]);

      assertStops("# task |by:2026-11-20 urgent", "Mod-ArrowRight", [
        "# task by:2026-11-20| urgent",
        "# task by:2026-11-20 urgent|",
      ]);
      assertStops("# task by:2026-11-20 urgent|", "Mod-ArrowLeft", [
        "# task by:2026-11-20 |urgent",
        "# task |by:2026-11-20 urgent",
      ]);

      assertStops("# task |by:2026-11-20", "Mod-ArrowRight", ["# task by:2026-11-20|"]);
      assertStops("# task by:2026-11-20|", "Mod-ArrowLeft", ["# task |by:2026-11-20"]);

      assertStops("# task |by:2026-11-20, urgent", "Mod-ArrowRight", [
        "# task by:2026-11-20|, urgent",
        "# task by:2026-11-20,| urgent",
        "# task by:2026-11-20, urgent|",
      ]);
      assertStops("# task by:2026-11-20.|", "Mod-ArrowLeft", [
        "# task by:2026-11-20|.",
        "# task |by:2026-11-20.",
      ]);
    });

    it("by:fri, by:tomorrow, and impossible by:2026-02-30 count as one word", () => {
      for (const token of ["by:fri", "by:tomorrow", "by:2026-02-30"]) {
        assertStops(`# task |${token} next`, "Mod-ArrowRight", [
          `# task ${token}| next`,
          `# task ${token} next|`,
        ]);
        assertStops(`# task ${token} next|`, "Mod-ArrowLeft", [
          `# task ${token} |next`,
          `# task |${token} next`,
        ]);
        assertStops(`# task |${token}`, "Mod-ArrowRight", [`# task ${token}|`]);
        assertStops(`# task ${token}|`, "Mod-ArrowLeft", [`# task |${token}`]);
      }
    });
  });

  // =========================================================================
  // Rule 3: Topic tags (bug)
  // =========================================================================
  describe("Rule 3: topic tags with parentheses", () => {
    it("(bug) right after action or topic symbol, at end, and next to punctuation", () => {
      assertStops("|# (bug) fix", "Mod-ArrowRight", [
        "# |(bug) fix",
        "# (bug)| fix",
        "# (bug) fix|",
      ]);
      assertStops("# (bug) fix|", "Mod-ArrowLeft", [
        "# (bug) |fix",
        "# |(bug) fix",
        "|# (bug) fix",
      ]);

      assertStops("|v (bug) fixed", "Mod-ArrowRight", ["v |(bug) fixed", "v (bug)| fixed", "v (bug) fixed|"]);
      assertStops("|o (bug) discuss", "Mod-ArrowRight", ["o |(bug) discuss", "o (bug)| discuss", "o (bug) discuss|"]);

      assertStops("|# (bug)", "Mod-ArrowRight", ["# |(bug)", "# (bug)|"]);
      assertStops("# (bug)|", "Mod-ArrowLeft", ["# |(bug)", "|# (bug)"]);

      assertStops("|# (bug), fix", "Mod-ArrowRight", [
        "# |(bug), fix",
        "# (bug)|, fix",
        "# (bug),| fix",
        "# (bug), fix|",
      ]);
      assertStops("# (bug), fix|", "Mod-ArrowLeft", [
        "# (bug), |fix",
        "# (bug)|, fix",
        "# |(bug), fix",
        "|# (bug), fix",
      ]);
    });

    it("combined line example from spec: '# task by:2026-11-20 (bug) fix' and '# (bug) task by:2026-11-20 fix'", () => {
      assertStops("|# task by:2026-11-20 (bug) fix", "Mod-ArrowRight", [
        "# |task by:2026-11-20 (bug) fix",
        "# task| by:2026-11-20 (bug) fix",
        "# task by:2026-11-20| (bug) fix",
        "# task by:2026-11-20 (bug)| fix",
        "# task by:2026-11-20 (bug) fix|",
      ]);
      assertStops("# task by:2026-11-20 (bug) fix|", "Mod-ArrowLeft", [
        "# task by:2026-11-20 (bug) |fix",
        "# task by:2026-11-20 |(bug) fix",
        "# task |by:2026-11-20 (bug) fix",
        "# |task by:2026-11-20 (bug) fix",
        "|# task by:2026-11-20 (bug) fix",
      ]);

      assertStops("|# (bug) task by:2026-11-20 fix", "Mod-ArrowRight", [
        "# |(bug) task by:2026-11-20 fix",
        "# (bug)| task by:2026-11-20 fix",
        "# (bug) task| by:2026-11-20 fix",
        "# (bug) task by:2026-11-20| fix",
        "# (bug) task by:2026-11-20 fix|",
      ]);
    });
  });

  // =========================================================================
  // Rule 4: Plain dates 2026-11-20 (and inside forward links)
  // =========================================================================
  describe("Rule 4: plain dates and dates inside forward links", () => {
    it("plain date at start, middle, end, and next to punctuation", () => {
      assertStops("|2026-11-20 standup", "Mod-ArrowRight", [
        "2026-11-20| standup",
        "2026-11-20 standup|",
      ]);
      assertStops("2026-11-20 standup|", "Mod-ArrowLeft", [
        "2026-11-20 |standup",
        "|2026-11-20 standup",
      ]);

      assertStops("see |2026-11-20 notes", "Mod-ArrowRight", [
        "see 2026-11-20| notes",
        "see 2026-11-20 notes|",
      ]);
      assertStops("see 2026-11-20 notes|", "Mod-ArrowLeft", [
        "see 2026-11-20 |notes",
        "see |2026-11-20 notes",
      ]);

      assertStops("due |2026-11-20", "Mod-ArrowRight", ["due 2026-11-20|"]);
      assertStops("due 2026-11-20|", "Mod-ArrowLeft", ["due |2026-11-20"]);

      assertStops("see |2026-11-20, ok", "Mod-ArrowRight", [
        "see 2026-11-20|, ok",
        "see 2026-11-20,| ok",
        "see 2026-11-20, ok|",
      ]);
      assertStops("see 2026-11-20.|", "Mod-ArrowLeft", [
        "see 2026-11-20|.",
        "see |2026-11-20.",
      ]);
    });

    it("date inside forward link '(>2026-11-20)' counts the date part only as one word", () => {
      assertStops("# task |(>2026-11-20)", "Mod-ArrowRight", [
        "# task (>|2026-11-20)",
        "# task (>2026-11-20|)",
        "# task (>2026-11-20)|",
      ]);
      assertStops("# task (>2026-11-20)|", "Mod-ArrowLeft", [
        "# task (>2026-11-20|)",
        "# task (>|2026-11-20)",
        "# task |(>2026-11-20)",
      ]);

      assertStops("# task |(<2026-11-20#Sync)", "Mod-ArrowRight", [
        "# task (<|2026-11-20#Sync)",
        "# task (<2026-11-20|#Sync)",
        "# task (<2026-11-20#|Sync)",
        "# task (<2026-11-20#Sync|)",
        "# task (<2026-11-20#Sync)|",
      ]);
    });
  });

  // =========================================================================
  // Rule 5: Assignees @dana, @dana.k, @dana-k
  // =========================================================================
  describe("Rule 5: assignees @dana, @dana.k, @dana-k", () => {
    it("@dana at start, middle, end, and next to punctuation", () => {
      assertStops("|@dana check", "Mod-ArrowRight", ["@dana| check", "@dana check|"]);
      assertStops("@dana check|", "Mod-ArrowLeft", ["@dana |check", "|@dana check"]);

      assertStops("ask |@dana now", "Mod-ArrowRight", ["ask @dana| now", "ask @dana now|"]);
      assertStops("ask @dana now|", "Mod-ArrowLeft", ["ask @dana |now", "ask |@dana now"]);

      assertStops("cc |@dana", "Mod-ArrowRight", ["cc @dana|"]);
      assertStops("cc @dana|", "Mod-ArrowLeft", ["cc |@dana"]);

      assertStops("ask |@dana.", "Mod-ArrowRight", ["ask @dana|.", "ask @dana.|"]);
      assertStops("ask @dana.|", "Mod-ArrowLeft", ["ask @dana|.", "ask |@dana."]);

      assertStops("(|@dana)", "Mod-ArrowRight", ["(@dana|)", "(@dana)|"]);
      assertStops("(@dana)|", "Mod-ArrowLeft", ["(@dana|)", "(|@dana)", "|(@dana)"]);
    });

    it("@dana.k and @dana-k count as one word, while emails keep normal rules", () => {
      assertStops("ask |@dana.k now", "Mod-ArrowRight", ["ask @dana.k| now", "ask @dana.k now|"]);
      assertStops("ask @dana.k now|", "Mod-ArrowLeft", ["ask @dana.k |now", "ask |@dana.k now"]);

      assertStops("ask |@dana-k now", "Mod-ArrowRight", ["ask @dana-k| now", "ask @dana-k now|"]);
      assertStops("ask @dana-k now|", "Mod-ArrowLeft", ["ask @dana-k |now", "ask |@dana-k now"]);

      assertStops("|=> @jean-luc owns", "Mod-ArrowRight", [
        "=> |@jean-luc owns",
        "=> @jean-luc| owns",
        "=> @jean-luc owns|",
      ]);

      // Plain email is not an assignee
      assertStops("mail |dana@example.com", "Mod-ArrowRight", [
        "mail dana|@example.com",
        "mail dana@|example.com",
        "mail dana@example|.com",
        "mail dana@example.|com",
        "mail dana@example.com|",
      ]);
    });
  });

  // =========================================================================
  // Where 2: Shift+Ctrl+Arrow selection extension
  // =========================================================================
  describe("Where 2: Shift+Ctrl+Arrow selection", () => {
    it("extends and shrinks selection forward across markers and inline tokens", () => {
      assertStops("|# task by:2026-11-20", "Shift-Mod-ArrowRight", [
        "[# ]task by:2026-11-20",
        "[# task] by:2026-11-20",
        "[# task by:2026-11-20]",
      ]);

      assertStops("[# task by:2026-11-20]", "Shift-Mod-ArrowLeft", [
        "[# task ]by:2026-11-20",
        "[# ]task by:2026-11-20",
        "|# task by:2026-11-20",
      ]);

      assertStops("|# (bug) @dana 2026-11-20", "Shift-Mod-ArrowRight", [
        "[# ](bug) @dana 2026-11-20",
        "[# (bug)] @dana 2026-11-20",
        "[# (bug) @dana] 2026-11-20",
        "[# (bug) @dana 2026-11-20]",
      ]);
    });

    it("extends selection backward across markers and inline tokens", () => {
      assertStops("# (bug) by:fri @dana-k 2026-11-20|", "Shift-Mod-ArrowLeft", [
        "# (bug) by:fri @dana-k ]2026-11-20[",
        "# (bug) by:fri ]@dana-k 2026-11-20[",
        "# (bug) ]by:fri @dana-k 2026-11-20[",
        "# ](bug) by:fri @dana-k 2026-11-20[",
        "]# (bug) by:fri @dana-k 2026-11-20[",
      ]);

      assertStops("v 12. done|", "Shift-Mod-ArrowLeft", [
        "v 12. ]done[",
        "v ]12. done[",
        "]v 12. done[",
      ]);
    });
  });

  // =========================================================================
  // Where 3: Ctrl+Backspace and Ctrl+Delete with one undo step
  // =========================================================================
  describe("Where 3: Mod-Backspace and Mod-Delete with one undo step", () => {
    it("Mod-Backspace deletes due date, topic tag, plain date, forward-link date, assignee, and markers in one undo step", () => {
      // Exact spec example
      assertDeleteAndUndo("# task by:2026-11-20|", "Mod-Backspace", "# task |");
      assertDeleteAndUndo("# task by:fri|", "Mod-Backspace", "# task |");
      assertDeleteAndUndo("# task by:tomorrow|", "Mod-Backspace", "# task |");
      assertDeleteAndUndo("# task by:2026-02-30|", "Mod-Backspace", "# task |");

      // Leading markers
      assertDeleteAndUndo("# |task", "Mod-Backspace", "|task");
      assertDeleteAndUndo("v 12. |done", "Mod-Backspace", "v |done");
      assertDeleteAndUndo("=> # |call", "Mod-Backspace", "=> |call");
      assertDeleteAndUndo("  ! |urgent", "Mod-Backspace", "  |urgent");

      // Inline tokens
      assertDeleteAndUndo("# (bug)| fix", "Mod-Backspace", "# | fix");
      assertDeleteAndUndo("see 2026-11-20| notes", "Mod-Backspace", "see | notes");
      assertDeleteAndUndo("# task (>2026-11-20|)", "Mod-Backspace", "# task (>|)");
      assertDeleteAndUndo("ask @dana| now", "Mod-Backspace", "ask | now");
      assertDeleteAndUndo("ask @dana.k| now", "Mod-Backspace", "ask | now");
      assertDeleteAndUndo("ask @dana-k| now", "Mod-Backspace", "ask | now");
      assertDeleteAndUndo("ask @dana.|", "Mod-Backspace", "ask @dana|");
    });

    it("Mod-Delete deletes leading markers and inline tokens forward in one undo step", () => {
      assertDeleteAndUndo("|# task", "Mod-Delete", "|task");
      assertDeleteAndUndo("v |12. done", "Mod-Delete", "v |done");
      assertDeleteAndUndo("|# - task", "Mod-Delete", "|- task");
      assertDeleteAndUndo("|=> # call", "Mod-Delete", "|# call");
      assertDeleteAndUndo("|  ! urgent", "Mod-Delete", "|urgent");

      assertDeleteAndUndo("# task |by:2026-11-20", "Mod-Delete", "# task |");
      assertDeleteAndUndo("# task| by:2026-11-20", "Mod-Delete", "# task|");
      assertDeleteAndUndo("# task |by:fri urgent", "Mod-Delete", "# task | urgent");
      assertDeleteAndUndo("# task |by:2026-02-30", "Mod-Delete", "# task |");

      assertDeleteAndUndo("# |(bug) fix", "Mod-Delete", "# | fix");
      assertDeleteAndUndo("see |2026-11-20 notes", "Mod-Delete", "see | notes");
      assertDeleteAndUndo("# task (>|2026-11-20)", "Mod-Delete", "# task (>|)");
      assertDeleteAndUndo("ask |@dana now", "Mod-Delete", "ask | now");
      assertDeleteAndUndo("ask |@dana.k now", "Mod-Delete", "ask | now");
      assertDeleteAndUndo("ask |@dana-k now", "Mod-Delete", "ask | now");
      assertDeleteAndUndo("ask |@dana.", "Mod-Delete", "ask |.");
    });
  });

  // =========================================================================
  // Where 5 & Not changed: prose lines and plain Arrow keys
  // =========================================================================
  describe("Unchanged behaviour: prose lines and plain Arrow keys", () => {
    it("prose words (fix-it, don't, e.g., parenthesised aside, indented prose) keep CodeMirror normal rules", () => {
      assertStops("|fix-it", "Mod-ArrowRight", ["fix|-it", "fix-|it", "fix-it|"]);
      assertStops("fix-it|", "Mod-ArrowLeft", ["fix-|it", "fix|-it", "|fix-it"]);

      assertStops("|don't", "Mod-ArrowRight", ["don|'t", "don'|t", "don't|"]);
      assertStops("don't|", "Mod-ArrowLeft", ["don'|t", "don|'t", "|don't"]);

      assertStops("|e.g.", "Mod-ArrowRight", ["e|.g.", "e.|g.", "e.g|.", "e.g.|"]);
      assertStops("e.g.|", "Mod-ArrowLeft", ["e.g|.", "e.|g.", "e|.g.", "|e.g."]);

      assertStops("plain |(aside) text", "Mod-ArrowRight", [
        "plain (|aside) text",
        "plain (aside|) text",
        "plain (aside)| text",
        "plain (aside) text|",
      ]);

      assertStops("|  plain words", "Mod-ArrowRight", [
        "  plain| words",
        "  plain words|",
      ]);
      assertStops("  plain words|", "Mod-ArrowLeft", [
        "  plain |words",
        "  |plain words",
        "|  plain words",
      ]);
    });

    it("plain ArrowRight / ArrowLeft still step inside plain dates, topic tags, assignees, and numbered markers", () => {
      assertStops("see |2026-11-20", "ArrowRight", [
        "see 2|026-11-20",
        "see 20|26-11-20",
      ]);
      assertStops("# |(bug) fix", "ArrowRight", [
        "# (|bug) fix",
        "# (b|ug) fix",
      ]);
      assertStops("ask |@dana", "ArrowRight", [
        "ask @|dana",
        "ask @d|ana",
      ]);
      assertStops("|12. done", "ArrowRight", [
        "1|2. done",
        "12|. done",
        "12.| done",
      ]);
    });
  });
});
