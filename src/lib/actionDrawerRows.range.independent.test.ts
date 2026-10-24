import { describe, it, expect } from "vitest";
import { actionTree, flattenActionTree, type ActionNode } from "./actionGroups";
// @ts-ignore nodeTextRange is the new export to test (§426-T)
import { nodeText, nodeTextRange } from "./actionDrawerRows";
import type { ActionSnapshotItem } from "./types";

/** Builds the snapshot items of one note the way `actionDrawerRows.test.ts` does. */
function itemsOf(filename: string, text: string): ActionSnapshotItem[] {
  const lines = text.split("\n");
  const nodes = flattenActionTree(actionTree(lines));
  const parentOf = new Map<ActionNode, ActionNode>();
  for (const node of nodes) for (const child of node.children) parentOf.set(child, node);
  const idOf = new Map<ActionNode, string>();
  return nodes.map((node) => {
    const id = node.kind === "step" ? `${filename}-${node.lineIdx}-s${node.stepIndex}` : `${filename}-${node.lineIdx}`;
    idOf.set(node, id);
    const item: ActionSnapshotItem = {
      id,
      filename,
      lineIdx: node.lineIdx,
      line: lines[node.lineIdx],
      header: "",
      kind: node.kind,
      partFrom: node.from,
      partTo: node.to,
      symbolCol: node.symbolCol,
      delegated: node.delegated,
      depth: node.depth,
      whole: node.whole,
    };
    if (node.stepIndex !== undefined) item.stepIndex = node.stepIndex;
    const parent = parentOf.get(node);
    if (parent) item.parentId = idOf.get(parent);
    return item;
  });
}

describe("nodeTextRange (§426-T)", () => {
  it("returns { from, to } matching nodeText for a plain action line", () => {
    const [item] = itemsOf("n.txt", "# buy milk");
    const range = nodeTextRange(item);
    expect(range).toBeDefined();
    expect(typeof range.from).toBe("number");
    expect(typeof range.to).toBe("number");
    expect(item.line.slice(range.from, range.to)).toBe(nodeText(item));
    expect(item.line.slice(range.from, range.to)).toBe("buy milk");
  });

  it("returns { from, to } matching nodeText for an indented action line", () => {
    const items = itemsOf("n.txt", "# Parent action\n    # indented child task");
    const child = items[1];
    const range = nodeTextRange(child);
    expect(range).toBeDefined();
    expect(child.line.slice(range.from, range.to)).toBe(nodeText(child));
    expect(child.line.slice(range.from, range.to)).toBe("indented child task");
  });

  it("returns { from, to } matching nodeText for a line with (topic) and a due date", () => {
    const [item] = itemsOf("n.txt", "# (budget) review the plan by:2026-10-30");
    const range = nodeTextRange(item);
    expect(range).toBeDefined();
    expect(item.line.slice(range.from, range.to)).toBe(nodeText(item));
    expect(item.line.slice(range.from, range.to)).toBe("(budget) review the plan by:2026-10-30");
  });

  it("returns { from, to } matching nodeText for a step item", () => {
    // kind: "step", partFrom / partTo around => # second
    const items = itemsOf("n.txt", "# first step => # second step => # third step");
    const step2 = items[1];
    expect(step2.kind).toBe("step");
    const range2 = nodeTextRange(step2);
    expect(range2).toBeDefined();
    expect(step2.line.slice(range2.from, range2.to)).toBe(nodeText(step2));
    expect(step2.line.slice(range2.from, range2.to)).toBe("second step");

    const step3 = items[2];
    expect(step3.kind).toBe("step");
    const range3 = nodeTextRange(step3);
    expect(step3.line.slice(range3.from, range3.to)).toBe(nodeText(step3));
    expect(step3.line.slice(range3.from, range3.to)).toBe("third step");
  });

  it("returns { from, to } matching nodeText for a delegated step (=> @priya send it)", () => {
    const items = itemsOf("n.txt", "# Send proposal\n=> @priya send it");
    const delegated = items[1];
    expect(delegated.delegated).toBe(true);
    const range = nodeTextRange(delegated);
    expect(range).toBeDefined();
    expect(delegated.line.slice(range.from, range.to)).toBe(nodeText(delegated));
    expect(delegated.line.slice(range.from, range.to)).toBe("@priya send it");
  });

  it("returns { from, to } matching nodeText for an item without tree fields (no kind)", () => {
    const itemWithoutKind: ActionSnapshotItem = {
      id: "legacy-1",
      filename: "n.txt",
      lineIdx: 0,
      line: "# legacy action line",
      header: "",
    };
    const range = nodeTextRange(itemWithoutKind);
    expect(range).toBeDefined();
    expect(itemWithoutKind.line.slice(range.from, range.to)).toBe(nodeText(itemWithoutKind));
    expect(itemWithoutKind.line.slice(range.from, range.to)).toBe("legacy action line");
  });

  it("returns { from, to } matching nodeText for a whole item", () => {
    const wholeItem: ActionSnapshotItem = {
      id: "whole-1",
      filename: "n.txt",
      lineIdx: 0,
      line: "  # whole item with indent",
      header: "",
      whole: true,
      kind: "line",
      depth: 0,
    };
    const range = nodeTextRange(wholeItem);
    expect(range).toBeDefined();
    expect(wholeItem.line.slice(range.from, range.to)).toBe(nodeText(wholeItem));
    expect(wholeItem.line.slice(range.from, range.to)).toBe("whole item with indent");
  });
});
