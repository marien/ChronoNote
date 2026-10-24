import { describe, expect, it } from "vitest";
import {
  actionTree,
  flattenActionTree,
  groupProgress,
  type ActionNode,
  type ActionState,
} from "./actionGroups";

/**
 * Helper to inspect the tree shape concisely: [label, children]
 */
function treeOutline(nodes: ActionNode[], lines: string[]): any[] {
  return nodes.map((node) => {
    const text = lines[node.lineIdx]?.slice(node.from, node.to).trim() ?? "";
    return node.children.length > 0
      ? [text, treeOutline(node.children, lines)]
      : text;
  });
}

describe("actionTree - numbered examples from brief", () => {
  it("example 1: hierarchy with indented action lines", () => {
    // 1. `# a`, `··# b`, `··# c` → one root `a` with line children `b`, `c` (depth 1).
    const lines = ["# a", "  # b", "  # c"];
    const roots = actionTree(lines);

    expect(treeOutline(roots, lines)).toEqual([["# a", ["# b", "# c"]]]);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.lineIdx).toBe(0);
    expect(a.kind).toBe("line");
    expect(a.depth).toBe(0);
    expect(a.state).toBe("#");
    expect(a.whole).toBe(false);
    expect(a.delegated).toBe(false);
    expect(a.children).toHaveLength(2);

    const [b, c] = a.children;
    expect(b.lineIdx).toBe(1);
    expect(b.kind).toBe("line");
    expect(b.depth).toBe(1);
    expect(b.state).toBe("#");
    expect(b.whole).toBe(false);
    expect(b.children).toHaveLength(0);

    expect(c.lineIdx).toBe(2);
    expect(c.kind).toBe("line");
    expect(c.depth).toBe(1);
    expect(c.state).toBe("#");
    expect(c.whole).toBe(false);
    expect(c.children).toHaveLength(0);
  });

  it("example 2: empty line clears stack so subsequent line is a root", () => {
    // 2. `# a`, ``, `··# b` → two roots; `b` has depth 0 and no parent.
    const lines = ["# a", "", "  # b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(2);
    const [a, b] = roots;

    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(2);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("example 3: note bullet line clears stack so subsequent line is a root", () => {
    // 3. `# a`, `··- note`, `··# b` → roots `a` (no children) and `b`.
    const lines = ["# a", "  - note", "  # b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(2);
    const [a, b] = roots;

    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(2);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("example 4: plain text line clears stack so subsequent line is a root", () => {
    // 4. `# a`, `··plain text`, `··# b` → roots `a` and `b`.
    const lines = ["# a", "  plain text", "  # b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(2);
    const [a, b] = roots;

    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(2);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("example 5: consequence and delegated arrow lines at root indent become children", () => {
    // 5. `# a`, `=> # b`, `=> @dana c` → root `a` with children `b` (symbolCol 3, state "#")
    // and the delegated `c` (symbolCol null, state null, delegated true).
    const lines = ["# a", "=> # b", "=> @dana c"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(2);

    const [b, c] = a.children;
    expect(b.lineIdx).toBe(1);
    expect(b.kind).toBe("line");
    expect(b.depth).toBe(1);
    expect(b.symbolCol).toBe(3);
    expect(b.state).toBe("#");
    expect(b.delegated).toBe(false);

    expect(c.lineIdx).toBe(2);
    expect(c.kind).toBe("line");
    expect(c.depth).toBe(1);
    expect(c.symbolCol).toBeNull();
    expect(c.state).toBeNull();
    expect(c.delegated).toBe(true);
  });

  it("example 6: indented arrow lines become children", () => {
    // 6. `# a`, `··=> # b`, `··=> # c` → root `a` with children `b`, `c`.
    const lines = ["# a", "  => # b", "  => # c"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(2);

    const [b, c] = a.children;
    expect(b.lineIdx).toBe(1);
    expect(b.kind).toBe("line");
    expect(b.depth).toBe(1);
    expect(b.state).toBe("#");

    expect(c.lineIdx).toBe(2);
    expect(c.kind).toBe("line");
    expect(c.depth).toBe(1);
    expect(c.state).toBe("#");
  });

  it("example 7: multi-level nested lines", () => {
    // 7. `# a`, `··# b`, `····# b1`, `··# c` → `a` → [`b` → [`b1`], `c`]; `b1` depth 2.
    const lines = ["# a", "  # b", "    # b1", "  # c"];
    const roots = actionTree(lines);

    expect(treeOutline(roots, lines)).toEqual([
      ["# a", [["# b", ["# b1"]], "# c"]],
    ]);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(2);

    const [b, c] = a.children;
    expect(b.depth).toBe(1);
    expect(b.children).toHaveLength(1);

    const [b1] = b.children;
    expect(b1.lineIdx).toBe(2);
    expect(b1.depth).toBe(2);
    expect(b1.state).toBe("#");

    expect(c.lineIdx).toBe(3);
    expect(c.depth).toBe(1);
    expect(c.children).toHaveLength(0);
  });

  it("example 8: un-indenting pops stack back to matching indent level", () => {
    // 8. `# a`, `··# b`, `# c` → roots `a` (child `b`) and `c` (no children).
    const lines = ["# a", "  # b", "# c"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(2);
    const [a, c] = roots;

    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(1);
    expect(a.children[0].lineIdx).toBe(1);
    expect(a.children[0].depth).toBe(1);

    expect(c.depth).toBe(0);
    expect(c.children).toHaveLength(0);
  });

  it("example 9: multiple steps on one line with stepIndex and delegation", () => {
    // 9. `# a => # s1 => @lee s2 => # s3` → root `a` with three steps, stepIndex 1, 2, 3; `s2` delegated.
    const lines = ["# a => # s1 => @lee s2 => # s3"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.lineIdx).toBe(0);
    expect(a.kind).toBe("line");
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(3);

    const [s1, s2, s3] = a.children;

    expect(s1.lineIdx).toBe(0);
    expect(s1.kind).toBe("step");
    expect(s1.stepIndex).toBe(1);
    expect(s1.depth).toBe(1);
    expect(s1.state).toBe("#");
    expect(s1.delegated).toBe(false);

    expect(s2.lineIdx).toBe(0);
    expect(s2.kind).toBe("step");
    expect(s2.stepIndex).toBe(2);
    expect(s2.depth).toBe(1);
    expect(s2.state).toBeNull();
    expect(s2.delegated).toBe(true);

    expect(s3.lineIdx).toBe(0);
    expect(s3.kind).toBe("step");
    expect(s3.stepIndex).toBe(3);
    expect(s3.depth).toBe(1);
    expect(s3.state).toBe("#");
    expect(s3.delegated).toBe(false);
  });

  it("example 10: line node children ordering puts steps first, then child lines", () => {
    // 10. `# a => # s1`, `··# b` → `a` children in order: step `s1`, then line `b`.
    const lines = ["# a => # s1", "  # b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.children).toHaveLength(2);

    const [s1, b] = a.children;
    expect(s1.kind).toBe("step");
    expect(s1.stepIndex).toBe(1);
    expect(s1.depth).toBe(1);

    expect(b.kind).toBe("line");
    expect(b.stepIndex).toBeUndefined();
    expect(b.depth).toBe(1);
  });

  it("example 11: plain arrow text line without consequence is not a step", () => {
    // 11. `# a => it went fine` → root `a`, no steps (a plain `=> text` is not a step).
    const lines = ["# a => it went fine"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.kind).toBe("line");
    expect(a.children).toHaveLength(0);
  });

  it("example 12: topic with action part creates root whole node and breaks group", () => {
    // 12. `. budget => # send numbers` → one root `whole` node (state "#"), no children; it also breaks a group:
    // `# a`, `. budget => # x`, `··# b` → roots `a`, whole `. budget…`, `b`.
    const single = actionTree([". budget => # send numbers"]);
    expect(single).toHaveLength(1);
    expect(single[0].whole).toBe(true);
    expect(single[0].state).toBe("#");
    expect(single[0].depth).toBe(0);
    expect(single[0].symbolCol).toBeNull();
    expect(single[0].children).toHaveLength(0);
    expect(single[0].from).toBe(0);
    expect(single[0].to).toBe(". budget => # send numbers".length);

    const group = actionTree(["# a", ". budget => # x", "  # b"]);
    expect(group).toHaveLength(3);
    const [a, budget, b] = group;
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);
    expect(budget.whole).toBe(true);
    expect(budget.depth).toBe(0);
    expect(budget.state).toBe("#");
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("example 13: plain text line with action part creates root whole node", () => {
    // 13. `talked to Sam => # follow up` → one root whole node.
    const lines = ["talked to Sam => # follow up"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [node] = roots;
    expect(node.whole).toBe(true);
    expect(node.state).toBe("#");
    expect(node.depth).toBe(0);
    expect(node.symbolCol).toBeNull();
    expect(node.delegated).toBe(false);
    expect(node.children).toHaveLength(0);
    expect(node.from).toBe(0);
    expect(node.to).toBe(lines[0].length);
  });

  it("example 14: topic without action part clears stack and produces no node", () => {
    // 14. `o topic`, `··# b` → `b` is a root (a topic is never a parent; the topic line itself gives no node).
    const lines = ["o topic", "  # b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [b] = roots;
    expect(b.lineIdx).toBe(1);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("example 15: standalone arrow line at root cannot be a parent", () => {
    // 15. `=> # a`, `··# b` (no action line above) → `a` root without children, `b` root.
    const lines = ["=> # a", "  # b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(2);
    const [a, b] = roots;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(1);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("example 16: setext title and underline break group", () => {
    // 16. `Release`, `=======`, `# a` and `# a`, `Title`, `-----`, `··# b` → in the second, `b` is a root
    // (title and underline break the group; `Title` is no node).
    const group1 = actionTree(["Release", "=======", "# a"]);
    expect(group1).toHaveLength(1);
    expect(group1[0].lineIdx).toBe(2);
    expect(group1[0].depth).toBe(0);

    const group2 = actionTree(["# a", "Title", "-----", "  # b"]);
    expect(group2).toHaveLength(2);
    const [a, b] = group2;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(3);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("example 17: groupProgress counts resolved vs total across child lines", () => {
    // 17. `# a`, `··v b`, `··x c`, `··> d`, `··# e`: `groupProgress(a)` = `{ resolved: 3, total: 4 }`.
    const lines = ["# a", "  v b", "  x c", "  > d", "  # e"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const progress = groupProgress(roots[0]);
    expect(progress).toEqual({ resolved: 3, total: 4 });
  });

  it("example 18: groupProgress counts steps and ignores delegated parts", () => {
    // 18. `# a => v s1 => @dana s2 => # s3`, `··v b`: `groupProgress(a)` = `{ resolved: 2, total: 3 }`.
    const lines = ["# a => v s1 => @dana s2 => # s3", "  v b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const progress = groupProgress(roots[0]);
    expect(progress).toEqual({ resolved: 2, total: 3 });
  });

  it("example 19: tab indentation counts as 2 columns", () => {
    // 19. Tab indentation: `# a`, `\t# b` → `b` is `a`'s child.
    const lines = ["# a", "\t# b"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.children).toHaveLength(1);
    expect(a.children[0].lineIdx).toBe(1);
    expect(a.children[0].depth).toBe(1);
  });

  it("example 20: flattenActionTree visits nodes depth-first pre-order", () => {
    // 20. `flattenActionTree` on example 10 → `a`, `s1`, `b`.
    const lines = ["# a => # s1", "  # b"];
    const roots = actionTree(lines);
    const flattened = flattenActionTree(roots);

    expect(flattened).toHaveLength(3);
    const [first, second, third] = flattened;
    expect(first.lineIdx).toBe(0);
    expect(first.kind).toBe("line");

    expect(second.lineIdx).toBe(0);
    expect(second.kind).toBe("step");
    expect(second.stepIndex).toBe(1);

    expect(third.lineIdx).toBe(1);
    expect(third.kind).toBe("line");
  });
});

describe("actionTree - exact position fields for examples 5, 6 and 9", () => {
  it("exact position fields for example 5", () => {
    // 5. `# a`, `=> # b`, `=> @dana c`
    // "# a": length 3
    // "=> # b": length 6
    // "=> @dana c": length 10
    const lines = ["# a", "=> # b", "=> @dana c"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.lineIdx).toBe(0);
    expect(a.kind).toBe("line");
    expect(a.lineStart).toBe(0);
    expect(a.symbolCol).toBe(0);
    expect(a.from).toBe(0);
    expect(a.to).toBe(3);
    expect(a.depth).toBe(0);

    expect(a.children).toHaveLength(2);
    const [b, c] = a.children;

    // b: "=> # b" (symbolCol 3, state "#")
    expect(b.lineIdx).toBe(1);
    expect(b.kind).toBe("line");
    expect(b.lineStart).toBe(0);
    expect(b.symbolCol).toBe(3);
    expect(b.from).toBe(0);
    expect(b.to).toBe(6);
    expect(b.state).toBe("#");
    expect(b.delegated).toBe(false);
    expect(b.depth).toBe(1);

    // c: "=> @dana c" (symbolCol null, state null, delegated true)
    expect(c.lineIdx).toBe(2);
    expect(c.kind).toBe("line");
    expect(c.lineStart).toBe(0);
    expect(c.symbolCol).toBeNull();
    expect(c.from).toBe(0);
    expect(c.to).toBe(10);
    expect(c.state).toBeNull();
    expect(c.delegated).toBe(true);
    expect(c.depth).toBe(1);
  });

  it("exact position fields for example 6", () => {
    // 6. `# a`, `··=> # b`, `··=> # c`
    // "  => # b": lineStart 2, symbolCol 5 ('#' at index 5), length 8
    // "  => # c": lineStart 2, symbolCol 5 ('#' at index 5), length 8
    const lines = ["# a", "  => # b", "  => # c"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;
    expect(a.lineIdx).toBe(0);
    expect(a.kind).toBe("line");
    expect(a.lineStart).toBe(0);
    expect(a.symbolCol).toBe(0);
    expect(a.from).toBe(0);
    expect(a.to).toBe(3);
    expect(a.depth).toBe(0);

    expect(a.children).toHaveLength(2);
    const [b, c] = a.children;

    // b: "  => # b"
    expect(b.lineIdx).toBe(1);
    expect(b.kind).toBe("line");
    expect(b.lineStart).toBe(2);
    expect(b.symbolCol).toBe(5);
    expect([0, 2]).toContain(b.from);
    expect(b.to).toBe(8);
    expect(b.state).toBe("#");
    expect(b.delegated).toBe(false);
    expect(b.depth).toBe(1);

    // c: "  => # c"
    expect(c.lineIdx).toBe(2);
    expect(c.kind).toBe("line");
    expect(c.lineStart).toBe(2);
    expect(c.symbolCol).toBe(5);
    expect([0, 2]).toContain(c.from);
    expect(c.to).toBe(8);
    expect(c.state).toBe("#");
    expect(c.delegated).toBe(false);
    expect(c.depth).toBe(1);
  });

  it("exact position fields for example 9", () => {
    // 9. `# a => # s1 => @lee s2 => # s3`
    // Indices:
    // "# a": [0, 4) or [0, 3), symbolCol 0, lineStart 0
    // "=> # s1": [4, 12) or [4, 11), symbolCol 7, lineStart 0
    // "=> @lee s2": [12, 23) or [12, 22), symbolCol null, lineStart 0
    // "=> # s3": [23, 30), symbolCol 26, lineStart 0
    const lines = ["# a => # s1 => @lee s2 => # s3"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [a] = roots;

    expect(a.lineIdx).toBe(0);
    expect(a.kind).toBe("line");
    expect(a.lineStart).toBe(0);
    expect(a.symbolCol).toBe(0);
    expect(a.from).toBe(0);
    expect([3, 4]).toContain(a.to);
    expect(a.depth).toBe(0);
    expect(a.state).toBe("#");
    expect(a.delegated).toBe(false);

    expect(a.children).toHaveLength(3);
    const [s1, s2, s3] = a.children;

    // s1: "=> # s1"
    expect(s1.lineIdx).toBe(0);
    expect(s1.kind).toBe("step");
    expect(s1.stepIndex).toBe(1);
    expect(s1.lineStart).toBe(0);
    expect(s1.symbolCol).toBe(7);
    expect(s1.from).toBe(4);
    expect([11, 12]).toContain(s1.to);
    expect(s1.depth).toBe(1);
    expect(s1.state).toBe("#");
    expect(s1.delegated).toBe(false);

    // s2: "=> @lee s2"
    expect(s2.lineIdx).toBe(0);
    expect(s2.kind).toBe("step");
    expect(s2.stepIndex).toBe(2);
    expect(s2.lineStart).toBe(0);
    expect(s2.symbolCol).toBeNull();
    expect(s2.from).toBe(12);
    expect([22, 23]).toContain(s2.to);
    expect(s2.depth).toBe(1);
    expect(s2.state).toBeNull();
    expect(s2.delegated).toBe(true);

    // s3: "=> # s3"
    expect(s3.lineIdx).toBe(0);
    expect(s3.kind).toBe("step");
    expect(s3.stepIndex).toBe(3);
    expect(s3.lineStart).toBe(0);
    expect(s3.symbolCol).toBe(26);
    expect(s3.from).toBe(23);
    expect(s3.to).toBe(30);
    expect(s3.depth).toBe(1);
    expect(s3.state).toBe("#");
    expect(s3.delegated).toBe(false);
  });
});

describe("actionTree - edge cases and comprehensive rule coverage", () => {
  it("handles all action states on root lines: #, v, >, x", () => {
    const lines = ["# open", "v done", "> deferred", "x cancelled"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(4);
    const [open, done, deferred, cancelled] = roots;

    expect(open.state).toBe<ActionState>("#");
    expect(open.symbolCol).toBe(0);
    expect(done.state).toBe<ActionState>("v");
    expect(done.symbolCol).toBe(0);
    expect(deferred.state).toBe<ActionState>(">");
    expect(deferred.symbolCol).toBe(0);
    expect(cancelled.state).toBe<ActionState>("x");
    expect(cancelled.symbolCol).toBe(0);
  });

  it("handles all action states on child lines", () => {
    const lines = [
      "# root",
      "  # child_open",
      "  v child_done",
      "  > child_deferred",
      "  x child_cancelled",
    ];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.children).toHaveLength(4);

    expect(root.children[0].state).toBe("#");
    expect(root.children[0].symbolCol).toBe(2);
    expect(root.children[1].state).toBe("v");
    expect(root.children[1].symbolCol).toBe(2);
    expect(root.children[2].state).toBe(">");
    expect(root.children[2].symbolCol).toBe(2);
    expect(root.children[3].state).toBe("x");
    expect(root.children[3].symbolCol).toBe(2);
  });

  it("handles all action states on consequence arrow lines", () => {
    const lines = [
      "# root",
      "  => # open_arrow",
      "  => v done_arrow",
      "  => > deferred_arrow",
      "  => x cancelled_arrow",
    ];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.children).toHaveLength(4);

    expect(root.children[0].state).toBe("#");
    expect(root.children[0].symbolCol).toBe(5);
    expect(root.children[1].state).toBe("v");
    expect(root.children[1].symbolCol).toBe(5);
    expect(root.children[2].state).toBe(">");
    expect(root.children[2].symbolCol).toBe(5);
    expect(root.children[3].state).toBe("x");
    expect(root.children[3].symbolCol).toBe(5);
  });

  it("handles all action states on step children", () => {
    const lines = ["# root => # s_open => v s_done => > s_defer => x s_cancel"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.children).toHaveLength(4);

    expect(root.children[0].state).toBe("#");
    expect(root.children[0].stepIndex).toBe(1);
    expect(root.children[1].state).toBe("v");
    expect(root.children[1].stepIndex).toBe(2);
    expect(root.children[2].state).toBe(">");
    expect(root.children[2].stepIndex).toBe(3);
    expect(root.children[3].state).toBe("x");
    expect(root.children[3].stepIndex).toBe(4);
  });

  it("supports deeper nesting across 4 levels and popping multiple levels", () => {
    const lines = [
      "# level0",
      "  # level1",
      "    # level2",
      "      # level3",
      "  # level1_sibling",
      "# level0_sibling",
    ];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(2);
    const [l0, l0Sib] = roots;
    expect(l0.depth).toBe(0);
    expect(l0Sib.depth).toBe(0);

    expect(l0.children).toHaveLength(2);
    const [l1, l1Sib] = l0.children;
    expect(l1.depth).toBe(1);
    expect(l1Sib.depth).toBe(1);

    expect(l1.children).toHaveLength(1);
    const [l2] = l1.children;
    expect(l2.depth).toBe(2);

    expect(l2.children).toHaveLength(1);
    const [l3] = l2.children;
    expect(l3.depth).toBe(3);
  });

  it("arrow line under a child line becomes a child and can be a parent to deeper lines", () => {
    // An arrow line can only be a parent when it is itself a child
    const lines = [
      "# root",
      "  # child_action",
      "  => # arrow_child",
      "    # deep_child",
    ];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.children).toHaveLength(1);

    const [childAction] = root.children;
    expect(childAction.depth).toBe(1);
    expect(childAction.children).toHaveLength(1);

    const [arrowChild] = childAction.children;
    expect(arrowChild.kind).toBe("line");
    expect(arrowChild.depth).toBe(2);
    expect(arrowChild.children).toHaveLength(1);

    const [deepChild] = arrowChild.children;
    expect(deepChild.kind).toBe("line");
    expect(deepChild.depth).toBe(3);
  });

  it("handles mixed indentation widths with tabs counting as 2 columns", () => {
    // indent:
    // root: 0
    // \t child: 2
    //   child sibling: 2
    // \t\t grandchild: 4
    //     grandchild sibling: 4
    // \t  grandchild sibling 2: 4
    const lines = [
      "# root",
      "\t# tab_child",
      "  # spaces_child",
      "\t\t# tab_tab_grandchild",
      "    # four_spaces_grandchild",
      "\t  # tab_and_spaces_grandchild",
    ];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.children).toHaveLength(2);

    const [tabChild, spacesChild] = root.children;
    expect(tabChild.depth).toBe(1);
    expect(spacesChild.depth).toBe(1);
    expect(spacesChild.children).toHaveLength(3);

    const [gc1, gc2, gc3] = spacesChild.children;
    expect(gc1.depth).toBe(2);
    expect(gc2.depth).toBe(2);
    expect(gc3.depth).toBe(2);
  });

  it("handles uneven indentation popping when indent decreases but not to 0", () => {
    // 0 -> 4 -> 2:
    // root (0) -> l4 (4) -> l2 (2)
    // l2 pops l4 and becomes child of root (since 0 < 2)
    const lines = ["# root", "    # indent4", "  # indent2"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.children).toHaveLength(2);

    const [c1, c2] = root.children;
    expect(c1.depth).toBe(1);
    expect(c2.depth).toBe(1);
  });

  it("handles steps on a child line", () => {
    const lines = [
      "# root",
      "  # child => # s1 => @dana s2",
    ];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.children).toHaveLength(1);

    const [child] = root.children;
    expect(child.kind).toBe("line");
    expect(child.depth).toBe(1);
    expect(child.children).toHaveLength(2);

    const [s1, s2] = child.children;
    expect(s1.kind).toBe("step");
    expect(s1.stepIndex).toBe(1);
    expect(s1.depth).toBe(2);
    expect(s1.lineIdx).toBe(1);
    expect(s1.lineStart).toBe(2);

    expect(s2.kind).toBe("step");
    expect(s2.stepIndex).toBe(2);
    expect(s2.depth).toBe(2);
    expect(s2.lineIdx).toBe(1);
    expect(s2.lineStart).toBe(2);
    expect(s2.delegated).toBe(true);
  });

  it("creates whole node for delegated-only line outside a group", () => {
    // A line outside group with only delegated part: delegated=true, state=null
    const lines = ["talked to Sam => @dana"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [node] = roots;
    expect(node.whole).toBe(true);
    expect(node.depth).toBe(0);
    expect(node.state).toBeNull();
    expect(node.delegated).toBe(true);
    expect(node.symbolCol).toBeNull();
    expect(node.children).toHaveLength(0);
    expect(node.from).toBe(0);
    expect(node.to).toBe(lines[0].length);
  });

  it("whole node with multiple action parts uses innermostActionSymbol for state", () => {
    // For a whole node: first consequence symbol, else leading action symbol
    const lines = [". topic => # first => v second"];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(1);
    const [node] = roots;
    expect(node.whole).toBe(true);
    expect(node.state).toBe("#");
    expect(node.delegated).toBe(false);
  });

  it("breaks group on sub-section setext underline with dashes (---)", () => {
    const lines = [
      "# root",
      "Sub Section Title",
      "---",
      "  # indented_action",
    ];
    const roots = actionTree(lines);

    expect(roots).toHaveLength(2);
    const [root, item] = roots;
    expect(root.depth).toBe(0);
    expect(root.children).toHaveLength(0);
    expect(item.lineIdx).toBe(3);
    expect(item.depth).toBe(0);
    expect(item.children).toHaveLength(0);
  });

  it("action line followed by setext underline is a section title and clears stack", () => {
    // If next line is isSetextUnderline, the line is a section title (not a group line)
    const lines = [
      "# heading action",
      "===",
      "  # item",
    ];
    const roots = actionTree(lines);

    // "# heading action" has an action part, but is not a group line -> becomes root whole node
    // Then "===" underline clears stack.
    // "  # item" sees empty stack and becomes a root (depth 0).
    expect(roots.length).toBeGreaterThanOrEqual(1);
    const item = roots[roots.length - 1];
    expect(item.lineIdx).toBe(2);
    expect(item.depth).toBe(0);
  });

  it("returns empty forest for empty input or whitespace-only lines", () => {
    expect(actionTree([])).toEqual([]);
    expect(actionTree(["", "   ", "\t  \t"])).toEqual([]);
  });

  it("returns empty forest for plain text without action parts", () => {
    const lines = [
      "Plain paragraph text.",
      "Another line.",
      "- bullet list item",
      "o topic item",
    ];
    expect(actionTree(lines)).toEqual([]);
  });

  it("non-action arrow does not create an action node", () => {
    const lines = ["=> just a remark without action symbol or assignee"];
    expect(actionTree(lines)).toEqual([]);
  });
});

describe("flattenActionTree", () => {
  it("returns empty array for empty forest", () => {
    expect(flattenActionTree([])).toEqual([]);
  });

  it("flattens a single root without children", () => {
    const tree = actionTree(["# solo"]);
    const flattened = flattenActionTree(tree);
    expect(flattened).toHaveLength(1);
    expect(flattened[0].lineIdx).toBe(0);
  });

  it("flattens multiple roots without children", () => {
    const tree = actionTree(["# root1", "# root2", "# root3"]);
    const flattened = flattenActionTree(tree);
    expect(flattened).toHaveLength(3);
    expect(flattened.map((n) => n.lineIdx)).toEqual([0, 1, 2]);
  });

  it("flattens multi-level hierarchy with steps in depth-first pre-order", () => {
    const lines = [
      "# a => # a_step",
      "  # b => # b_step",
      "    # c",
      "  # d",
      "# e",
    ];
    const tree = actionTree(lines);
    const flattened = flattenActionTree(tree);

    // Pre-order traversal order:
    // a -> a_step -> b -> b_step -> c -> d -> e
    expect(flattened.map((n) => ({ lineIdx: n.lineIdx, kind: n.kind }))).toEqual([
      { lineIdx: 0, kind: "line" },
      { lineIdx: 0, kind: "step" },
      { lineIdx: 1, kind: "line" },
      { lineIdx: 1, kind: "step" },
      { lineIdx: 2, kind: "line" },
      { lineIdx: 3, kind: "line" },
      { lineIdx: 4, kind: "line" },
    ]);
  });
});

describe("groupProgress", () => {
  it("returns { resolved: 0, total: 0 } for a leaf node without descendants", () => {
    const tree = actionTree(["# solo"]);
    expect(groupProgress(tree[0])).toEqual({ resolved: 0, total: 0 });
  });

  it("does not count the node itself, only its descendants", () => {
    // Even if root is resolved ("v"), if its child is open ("#"), resolved is 0
    const tree = actionTree(["v root_done", "  # child_open"]);
    expect(groupProgress(tree[0])).toEqual({ resolved: 0, total: 1 });
  });

  it("counts all resolved states: v, x, >", () => {
    const lines = [
      "# root",
      "  v done",
      "  x won't_do",
      "  > deferred",
    ];
    const tree = actionTree(lines);
    expect(groupProgress(tree[0])).toEqual({ resolved: 3, total: 3 });
  });

  it("counts open state # as unresolved", () => {
    const lines = [
      "# root",
      "  # open1",
      "  # open2",
    ];
    const tree = actionTree(lines);
    expect(groupProgress(tree[0])).toEqual({ resolved: 0, total: 2 });
  });

  it("ignores delegated parts (state null) completely", () => {
    const lines = [
      "# root => @dana delegated_step",
      "  => @lee delegated_line",
    ];
    const tree = actionTree(lines);
    expect(groupProgress(tree[0])).toEqual({ resolved: 0, total: 0 });
  });

  it("counts deeply nested descendants across multiple levels and kinds", () => {
    const lines = [
      "# root => # s1 => v s2",
      "  # child1",
      "    v child1_sub1",
      "    x child1_sub2",
      "  > child2",
    ];
    const tree = actionTree(lines);
    // Descendants with state:
    // s1 (#): unresolved
    // s2 (v): resolved
    // child1 (#): unresolved
    // child1_sub1 (v): resolved
    // child1_sub2 (x): resolved
    // child2 (>): resolved
    // Total = 6, Resolved = 4 (s2, child1_sub1, child1_sub2, child2)
    expect(groupProgress(tree[0])).toEqual({ resolved: 4, total: 6 });
  });
});
