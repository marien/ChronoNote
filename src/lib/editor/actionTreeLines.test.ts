import { describe, expect, it } from "vitest";
import { actionTree } from "../actionGroups";
import { treeConnectors } from "./actionTreeLines";

describe("treeConnectors", () => {
  it("connects a parent with three indented children", () => {
    const lines = ["# parent", "  # child 1", "  # child 2", "  # child 3"];
    const connectors = treeConnectors(actionTree(lines));
    expect(connectors).toEqual([
      {
        parentLineIdx: 0,
        parentCol: 0,
        children: [
          { lineIdx: 1, col: 2 },
          { lineIdx: 2, col: 2 },
          { lineIdx: 3, col: 2 },
        ],
        resolved: false,
      },
    ]);
  });

  it("handles nested children producing two connectors in parent line order", () => {
    const lines = ["# a", "  # b", "    # c"];
    const connectors = treeConnectors(actionTree(lines));
    expect(connectors).toEqual([
      {
        parentLineIdx: 0,
        parentCol: 0,
        children: [{ lineIdx: 1, col: 2 }],
        resolved: false,
      },
      {
        parentLineIdx: 1,
        parentCol: 2,
        children: [{ lineIdx: 2, col: 4 }],
        resolved: false,
      },
    ]);
  });

  it("connects unindented => # children where col equals parent's col", () => {
    const lines = ["# onboard Lee", "=> # laptop", "=> # accounts"];
    const connectors = treeConnectors(actionTree(lines));
    expect(connectors).toEqual([
      {
        parentLineIdx: 0,
        parentCol: 0,
        children: [
          { lineIdx: 1, col: 0 },
          { lineIdx: 2, col: 0 },
        ],
        resolved: false,
      },
    ]);
  });

  it("produces no connector for steps only on the same line", () => {
    const lines = ["# a => # b => # c"];
    const connectors = treeConnectors(actionTree(lines));
    expect(connectors).toEqual([]);
  });

  it("produces no connector when an empty line breaks the group", () => {
    const lines = ["# a", "", "  # b"];
    const connectors = treeConnectors(actionTree(lines));
    expect(connectors).toEqual([]);
  });

  it("marks resolved true when all are v/x/>, and false with one #", () => {
    const allResolved = ["v a", "  v b", "  x c", "  > d"];
    expect(treeConnectors(actionTree(allResolved))[0].resolved).toBe(true);

    const withOneOpenChild = ["v a", "  v b", "  # c", "  > d"];
    expect(treeConnectors(actionTree(withOneOpenChild))[0].resolved).toBe(false);

    const withOpenParent = ["# a", "  v b", "  x c"];
    expect(treeConnectors(actionTree(withOpenParent))[0].resolved).toBe(false);
  });

  it("ignores delegated parts when evaluating resolved", () => {
    const withDelegatedChild = ["v a", "  v b", "  => @dana"];
    expect(treeConnectors(actionTree(withDelegatedChild))[0].resolved).toBe(true);

    const withDelegatedStep = ["v a => @dana", "  v b"];
    expect(treeConnectors(actionTree(withDelegatedStep))[0].resolved).toBe(true);

    const withOpenStep = ["v a => # step", "  v b"];
    expect(treeConnectors(actionTree(withOpenStep))[0].resolved).toBe(false);
  });
});
