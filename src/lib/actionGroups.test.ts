import { describe, expect, it } from "vitest";
import { actionTree, flattenActionTree, groupProgress } from "./actionGroups";

describe("actionTree", () => {
  it("Example 1: # a,   # b,   # c -> one root a with line children b, c (depth 1)", () => {
    const tree = actionTree(["# a", "  # b", "  # c"]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(2);

    const [b, c] = a.children;
    expect(b.lineIdx).toBe(1);
    expect(b.depth).toBe(1);
    expect(b.kind).toBe("line");

    expect(c.lineIdx).toBe(2);
    expect(c.depth).toBe(1);
    expect(c.kind).toBe("line");
  });

  it("Example 2: # a, empty line,   # b -> two roots; b has depth 0 and no parent", () => {
    const tree = actionTree(["# a", "", "  # b"]);
    expect(tree).toHaveLength(2);
    const [a, b] = tree;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(2);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("Example 3: # a,   - note,   # b -> roots a (no children) and b", () => {
    const tree = actionTree(["# a", "  - note", "  # b"]);
    expect(tree).toHaveLength(2);
    const [a, b] = tree;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(2);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("Example 4: # a,   plain text,   # b -> roots a and b", () => {
    const tree = actionTree(["# a", "  plain text", "  # b"]);
    expect(tree).toHaveLength(2);
    const [a, b] = tree;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(2);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("Example 5: # a, => # b, => @dana c -> root a with children b and delegated c", () => {
    const tree = actionTree(["# a", "=> # b", "=> @dana c"]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.children).toHaveLength(2);

    const [b, c] = a.children;
    expect(b.symbolCol).toBe(3);
    expect(b.state).toBe("#");
    expect(b.delegated).toBe(false);

    expect(c.symbolCol).toBeNull();
    expect(c.state).toBeNull();
    expect(c.delegated).toBe(true);
  });

  it("Example 5: exact from/to/symbolCol/lineStart values", () => {
    const tree = actionTree(["# a", "=> # b", "=> @dana c"]);
    const [a] = tree;
    const [b, c] = a.children;

    expect(a).toMatchObject({
      lineIdx: 0,
      kind: "line",
      from: 0,
      to: 3,
      symbolCol: 0,
      lineStart: 0,
      depth: 0,
      state: "#",
      delegated: false,
      whole: false,
    });

    expect(b).toMatchObject({
      lineIdx: 1,
      kind: "line",
      from: 0,
      to: 6,
      symbolCol: 3,
      lineStart: 0,
      depth: 1,
      state: "#",
      delegated: false,
      whole: false,
    });

    expect(c).toMatchObject({
      lineIdx: 2,
      kind: "line",
      from: 0,
      to: 10,
      symbolCol: null,
      lineStart: 0,
      depth: 1,
      state: null,
      delegated: true,
      whole: false,
    });
  });

  it("Example 6: # a,   => # b,   => # c -> root a with children b, c", () => {
    const tree = actionTree(["# a", "  => # b", "  => # c"]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.children).toHaveLength(2);
    const [b, c] = a.children;
    expect(b.depth).toBe(1);
    expect(c.depth).toBe(1);
  });

  it("Example 6: exact from/to/symbolCol/lineStart values", () => {
    const tree = actionTree(["# a", "  => # b", "  => # c"]);
    const [a] = tree;
    const [b, c] = a.children;

    expect(a).toMatchObject({
      lineIdx: 0,
      kind: "line",
      from: 0,
      to: 3,
      symbolCol: 0,
      lineStart: 0,
      depth: 0,
      state: "#",
      delegated: false,
      whole: false,
    });

    expect(b).toMatchObject({
      lineIdx: 1,
      kind: "line",
      from: 2,
      to: 8,
      symbolCol: 5,
      lineStart: 2,
      depth: 1,
      state: "#",
      delegated: false,
      whole: false,
    });

    expect(c).toMatchObject({
      lineIdx: 2,
      kind: "line",
      from: 2,
      to: 8,
      symbolCol: 5,
      lineStart: 2,
      depth: 1,
      state: "#",
      delegated: false,
      whole: false,
    });
  });

  it("Example 7: # a,   # b,     # b1,   # c -> a -> [b -> [b1], c]; b1 depth 2", () => {
    const tree = actionTree(["# a", "  # b", "    # b1", "  # c"]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(2);

    const [b, c] = a.children;
    expect(b.depth).toBe(1);
    expect(b.children).toHaveLength(1);
    expect(c.depth).toBe(1);
    expect(c.children).toHaveLength(0);

    const [b1] = b.children;
    expect(b1.depth).toBe(2);
    expect(b1.lineIdx).toBe(2);
  });

  it("Example 8: # a,   # b, # c -> roots a (child b) and c (no children)", () => {
    const tree = actionTree(["# a", "  # b", "# c"]);
    expect(tree).toHaveLength(2);
    const [a, c] = tree;
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(1);
    expect(a.children[0].lineIdx).toBe(1);

    expect(c.depth).toBe(0);
    expect(c.children).toHaveLength(0);
  });

  it("Example 9: # a => # s1 => @lee s2 => # s3 -> root a with three steps, stepIndex 1, 2, 3; s2 delegated", () => {
    const line = "# a => # s1 => @lee s2 => # s3";
    const tree = actionTree([line]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.children).toHaveLength(3);

    const [s1, s2, s3] = a.children;
    expect(s1.kind).toBe("step");
    expect(s1.stepIndex).toBe(1);
    expect(s1.state).toBe("#");
    expect(s1.delegated).toBe(false);

    expect(s2.kind).toBe("step");
    expect(s2.stepIndex).toBe(2);
    expect(s2.state).toBeNull();
    expect(s2.delegated).toBe(true);

    expect(s3.kind).toBe("step");
    expect(s3.stepIndex).toBe(3);
    expect(s3.state).toBe("#");
    expect(s3.delegated).toBe(false);
  });

  it("Example 9: exact from/to/symbolCol/lineStart values", () => {
    const line = "# a => # s1 => @lee s2 => # s3";
    const tree = actionTree([line]);
    const [a] = tree;
    const [s1, s2, s3] = a.children;

    expect(a).toMatchObject({
      lineIdx: 0,
      kind: "line",
      from: 0,
      to: 4,
      symbolCol: 0,
      lineStart: 0,
      depth: 0,
      state: "#",
      delegated: false,
      whole: false,
    });

    expect(s1).toMatchObject({
      lineIdx: 0,
      kind: "step",
      from: 4,
      to: 12,
      symbolCol: 7,
      lineStart: 0,
      depth: 1,
      stepIndex: 1,
      state: "#",
      delegated: false,
      whole: false,
    });

    expect(s2).toMatchObject({
      lineIdx: 0,
      kind: "step",
      from: 12,
      to: 23,
      symbolCol: null,
      lineStart: 0,
      depth: 1,
      stepIndex: 2,
      state: null,
      delegated: true,
      whole: false,
    });

    expect(s3).toMatchObject({
      lineIdx: 0,
      kind: "step",
      from: 23,
      to: 30,
      symbolCol: 26,
      lineStart: 0,
      depth: 1,
      stepIndex: 3,
      state: "#",
      delegated: false,
      whole: false,
    });
  });

  it("Example 10: # a => # s1,   # b -> a children in order: step s1, then line b", () => {
    const tree = actionTree(["# a => # s1", "  # b"]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.children).toHaveLength(2);
    expect(a.children[0].kind).toBe("step");
    expect(a.children[0].stepIndex).toBe(1);
    expect(a.children[1].kind).toBe("line");
    expect(a.children[1].lineIdx).toBe(1);
  });

  it("Example 11: # a => it went fine -> root a, no steps (a plain => text is not a step)", () => {
    const tree = actionTree(["# a => it went fine"]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.children).toHaveLength(0);
    expect(a.from).toBe(0);
    expect(a.to).toBe("# a => it went fine".length);
  });

  it("Example 12: . budget => # send numbers -> one root whole node (state '#'), no children; breaks group", () => {
    const single = actionTree([". budget => # send numbers"]);
    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({
      lineIdx: 0,
      kind: "line",
      depth: 0,
      whole: true,
      state: "#",
      symbolCol: null,
      from: 0,
      to: ". budget => # send numbers".length,
      children: [],
    });

    const broken = actionTree(["# a", ". budget => # x", "  # b"]);
    expect(broken).toHaveLength(3);
    const [a, whole, b] = broken;
    expect(a.children).toHaveLength(0);
    expect(whole.whole).toBe(true);
    expect(whole.state).toBe("#");
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("Example 13: talked to Sam => # follow up -> one root whole node", () => {
    const tree = actionTree(["talked to Sam => # follow up"]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      lineIdx: 0,
      kind: "line",
      depth: 0,
      whole: true,
      state: "#",
      symbolCol: null,
      from: 0,
      to: "talked to Sam => # follow up".length,
      children: [],
    });
  });

  it("Example 14: o topic,   # b -> b is a root (topic line gives no node)", () => {
    const tree = actionTree(["o topic", "  # b"]);
    expect(tree).toHaveLength(1);
    const [b] = tree;
    expect(b.lineIdx).toBe(1);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("Example 15: => # a,   # b (no action line above) -> a root without children, b root", () => {
    const tree = actionTree(["=> # a", "  # b"]);
    expect(tree).toHaveLength(2);
    const [a, b] = tree;
    expect(a.lineIdx).toBe(0);
    expect(a.depth).toBe(0);
    expect(a.children).toHaveLength(0);

    expect(b.lineIdx).toBe(1);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("Example 16: Release, =======, # a and # a, Title, -----,   # b", () => {
    const tree1 = actionTree(["Release", "=======", "# a"]);
    expect(tree1).toHaveLength(1);
    expect(tree1[0].lineIdx).toBe(2);
    expect(tree1[0].depth).toBe(0);

    const tree2 = actionTree(["# a", "Title", "-----", "  # b"]);
    expect(tree2).toHaveLength(2);
    const [a, b] = tree2;
    expect(a.lineIdx).toBe(0);
    expect(a.children).toHaveLength(0);
    expect(b.lineIdx).toBe(3);
    expect(b.depth).toBe(0);
    expect(b.children).toHaveLength(0);
  });

  it("Example 17: # a,   v b,   x c,   > d,   # e: groupProgress(a) = { resolved: 3, total: 4 }", () => {
    const tree = actionTree(["# a", "  v b", "  x c", "  > d", "  # e"]);
    expect(tree).toHaveLength(1);
    const progress = groupProgress(tree[0]);
    expect(progress).toEqual({ resolved: 3, total: 4 });
  });

  it("Example 18: # a => v s1 => @dana s2 => # s3,   v b: groupProgress(a) = { resolved: 2, total: 3 }", () => {
    const tree = actionTree(["# a => v s1 => @dana s2 => # s3", "  v b"]);
    expect(tree).toHaveLength(1);
    const progress = groupProgress(tree[0]);
    expect(progress).toEqual({ resolved: 2, total: 3 });
  });

  it("Example 19: Tab indentation: # a, \\t# b -> b is a's child", () => {
    const tree = actionTree(["# a", "\t# b"]);
    expect(tree).toHaveLength(1);
    const [a] = tree;
    expect(a.children).toHaveLength(1);
    expect(a.children[0].lineIdx).toBe(1);
    expect(a.children[0].depth).toBe(1);
  });

  it("Example 20: flattenActionTree on example 10 -> a, s1, b", () => {
    const tree = actionTree(["# a => # s1", "  # b"]);
    const flat = flattenActionTree(tree);
    expect(flat).toHaveLength(3);
    expect(flat[0].kind).toBe("line");
    expect(flat[0].lineIdx).toBe(0);
    expect(flat[1].kind).toBe("step");
    expect(flat[1].stepIndex).toBe(1);
    expect(flat[2].kind).toBe("line");
    expect(flat[2].lineIdx).toBe(1);
  });
});
