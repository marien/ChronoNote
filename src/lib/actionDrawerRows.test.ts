import { describe, expect, it } from "vitest";
import { actionTree, flattenActionTree, type ActionNode } from "./actionGroups";
import {
  buildDrawerRows,
  buildDueDrawerRows,
  collapseKey,
  drawerTreeGuides,
  nodeMatchesQuery,
  nodeState,
  nodeText,
  type DrawerFilter,
} from "./actionDrawerRows";
import { cycleActionSymbolAt } from "./tokens";
import { parseSearchQuery } from "./search";
import type { ActionSnapshotItem } from "./types";

/** Builds the snapshot items of one note the way `actions.ts` does. */
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

function filter(over: Partial<DrawerFilter> = {}): DrawerFilter {
  return { onlyOpen: false, showDelegated: false, text: "", collapsed: new Set(), ...over };
}

const texts = (rows: { item: ActionSnapshotItem }[]) => rows.map((r) => nodeText(r.item));

describe("nodeState / nodeText", () => {
  it("reads the node's own live symbol and text", () => {
    const items = itemsOf("n.txt", "# Call bank => # get quote => v send form");
    expect(items.map((i) => nodeState(i))).toEqual(["#", "#", "v"]);
    expect(texts(items.map((item) => ({ item })))).toEqual(["Call bank", "get quote", "send form"]);
    expect(items.map((i) => i.id)).toEqual(["n.txt-0", "n.txt-0-s1", "n.txt-0-s2"]);
  });

  it("follows the line when the symbol changes under a stale item", () => {
    const [item] = itemsOf("n.txt", "# a");
    expect(nodeState({ ...item, line: "v a" })).toBe("v");
  });

  it("gives a delegated node no state and keeps its @name", () => {
    const items = itemsOf("n.txt", "# Task\n=> @bob review it");
    expect(nodeState(items[1])).toBeNull();
    expect(nodeText(items[1])).toBe("@bob review it");
  });

  it("strips indentation and the leading symbol of a child line", () => {
    const items = itemsOf("n.txt", "# Plan\n  x skipped part");
    expect(nodeText(items[1])).toBe("skipped part");
    expect(nodeState(items[1])).toBe("x");
  });

  it("falls back to today's behaviour for an item without tree fields", () => {
    const item: ActionSnapshotItem = { id: "a", filename: "n.txt", lineIdx: 0, line: "Talked to Sam => # follow up", header: "" };
    expect(nodeState(item)).toBe("#");
    expect(nodeText(item)).toBe("Talked to Sam follow up");
  });
});

describe("buildDrawerRows", () => {
  const plan = "# Plan trip\n  # book flights\n  v book hotel\n  # pack";

  it("lists every node depth-first with its depth when nothing filters", () => {
    const rows = buildDrawerRows(itemsOf("n.txt", plan), filter());
    expect(texts(rows)).toEqual(["Plan trip", "book flights", "book hotel", "pack"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 1]);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].expanded).toBe(true);
    expect(rows.every((r) => !r.contextOnly)).toBe(true);
  });

  it("onlyOpen hides resolved children but still counts them in the progress", () => {
    const rows = buildDrawerRows(itemsOf("n.txt", plan), filter({ onlyOpen: true }));
    expect(texts(rows)).toEqual(["Plan trip", "book flights", "pack"]);
    expect(rows[0].progress).toEqual({ resolved: 1, total: 3 });
    expect(rows[1].progress).toBeUndefined();
  });

  it("shows a resolved parent as context for an open child", () => {
    const rows = buildDrawerRows(itemsOf("n.txt", "v Plan trip\n  # book flights"), filter({ onlyOpen: true }));
    expect(texts(rows)).toEqual(["Plan trip", "book flights"]);
    expect(rows.map((r) => r.contextOnly)).toEqual([true, false]);
    expect(rows[0].hasChildren).toBe(true);
  });

  it("drops a fully resolved group when only open lines are wanted", () => {
    expect(buildDrawerRows(itemsOf("n.txt", "v Plan\n  v done"), filter({ onlyOpen: true }))).toEqual([]);
  });

  it("a text match on the parent shows the whole group", () => {
    const rows = buildDrawerRows(itemsOf("n.txt", plan), filter({ text: "PLAN" }));
    expect(texts(rows)).toEqual(["Plan trip", "book flights", "book hotel", "pack"]);
    expect(rows.every((r) => !r.contextOnly)).toBe(true);
  });

  it("a text match on a child shows the child and its parent as context", () => {
    const rows = buildDrawerRows(itemsOf("n.txt", plan), filter({ text: "pack" }));
    expect(texts(rows)).toEqual(["Plan trip", "pack"]);
    expect(rows.map((r) => r.contextOnly)).toEqual([true, false]);
  });

  it("a text match on a parent still obeys onlyOpen for the children", () => {
    const rows = buildDrawerRows(itemsOf("n.txt", plan), filter({ text: "plan", onlyOpen: true }));
    expect(texts(rows)).toEqual(["Plan trip", "book flights", "pack"]);
  });

  it("collapse hides the descendants, and a text filter ignores it", () => {
    const items = itemsOf("n.txt", plan);
    const collapsed = new Set([collapseKey(items[0])]);
    const rows = buildDrawerRows(items, filter({ collapsed }));
    expect(texts(rows)).toEqual(["Plan trip"]);
    expect(rows[0].expanded).toBe(false);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].progress).toEqual({ resolved: 1, total: 3 });

    const withText = buildDrawerRows(items, filter({ collapsed, text: "pack" }));
    expect(texts(withText)).toEqual(["Plan trip", "pack"]);
    expect(withText[0].expanded).toBe(true);
  });

  it("the collapse key is per note and parent text", () => {
    const a = itemsOf("a.txt", plan);
    const b = itemsOf("b.txt", plan);
    const rows = buildDrawerRows([...a, ...b], filter({ collapsed: new Set([collapseKey(a[0])]) }));
    expect(rows.map((r) => r.item.filename)).toEqual(["a.txt", "b.txt", "b.txt", "b.txt", "b.txt"]);
  });

  it("shows delegated children only with @ in the filter", () => {
    const items = itemsOf("n.txt", "# Task\n=> @bob review\n=> # sub");
    expect(texts(buildDrawerRows(items, filter()))).toEqual(["Task", "sub"]);
    expect(texts(buildDrawerRows(items, filter({ showDelegated: true })))).toEqual(["Task", "@bob review", "sub"]);
    // "Only open" does not hide a delegated part: it has no state to be resolved.
    expect(texts(buildDrawerRows(items, filter({ onlyOpen: true, showDelegated: true })))).toEqual([
      "Task",
      "@bob review",
      "sub",
    ]);
    expect(texts(buildDrawerRows(items, filter({ onlyOpen: true })))).toEqual(["Task", "sub"]);
    // The delegated part has no state: it is not counted in the progress.
    expect(buildDrawerRows(items, filter())[0].progress).toEqual({ resolved: 0, total: 1 });
  });

  it("lists steps in order and toggles each by its symbolCol", () => {
    const items = itemsOf("n.txt", "# Call bank => # get quote => v send form");
    const rows = buildDrawerRows(items, filter({ onlyOpen: true }));
    expect(texts(rows)).toEqual(["Call bank", "get quote"]);
    expect(rows[1].item.kind).toBe("step");
    expect(rows[1].item.stepIndex).toBe(1);
    expect(rows[0].progress).toEqual({ resolved: 1, total: 2 });
    const step = items[1];
    const toggled = cycleActionSymbolAt(step.line, step.symbolCol as number)!;
    expect(toggled).toBe("# Call bank => v get quote => v send form");
    // The item re-reads its line, so the row updates after the toggle.
    expect(nodeState({ ...step, line: toggled })).toBe("v");
  });

  it("items without tree fields behave as roots without children", () => {
    const base = { filename: "n.txt", header: "" };
    const items: ActionSnapshotItem[] = [
      { ...base, id: "1", lineIdx: 0, line: "# open one" },
      { ...base, id: "2", lineIdx: 1, line: "v done one" },
      { ...base, id: "3", lineIdx: 2, line: "Talked to Alice => @bob" },
    ];
    expect(buildDrawerRows(items, filter()).map((r) => r.item.id)).toEqual(["1", "2"]);
    expect(buildDrawerRows(items, filter({ onlyOpen: true })).map((r) => r.item.id)).toEqual(["1"]);
    expect(buildDrawerRows(items, filter({ showDelegated: true })).map((r) => r.item.id)).toEqual(["1", "2", "3"]);
    expect(buildDrawerRows(items, filter({ text: "DONE" })).map((r) => r.item.id)).toEqual(["2"]);
    const [first] = buildDrawerRows(items, filter());
    expect(first).toMatchObject({ depth: 0, hasChildren: false, expanded: true, contextOnly: false });
    expect(first.progress).toBeUndefined();
  });

  it("keeps several notes in snapshot order", () => {
    const rows = buildDrawerRows([...itemsOf("b.txt", "# one"), ...itemsOf("a.txt", "# two\n  # three")], filter());
    expect(rows.map((r) => r.item.filename)).toEqual(["b.txt", "a.txt", "a.txt"]);
  });
});

describe("buildDueDrawerRows", () => {
  // The notes below carry their dates in the text; the assertions are about the structure.
  const plain = (rows: { item: ActionSnapshotItem }[]) => texts(rows).map((t) => t.replace(/ by:\S+/, ""));
  const TODAY = "2026-10-24"; // a Saturday: this week ends on Sunday 2026-10-25
  const note = [
    "# Parent by:2026-12-01",
    "  # child one by:2026-10-20",
    "  v done child by:2026-09-01",
    "# Solo by:2026-10-24",
    "v Other",
    "  # kid by:2026-10-30",
    "# Undated",
  ].join("\n");

  it("places a group by the earliest own due date among its nodes, parent later than child", () => {
    const groups = buildDueDrawerRows(itemsOf("n.txt", note), TODAY, { showDelegated: false, text: "", collapsed: new Set() });
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "later"]);
    const [overdue, today, later] = groups;
    expect(plain(overdue.rows)).toEqual(["Parent", "child one"]);
    expect(overdue.rows.map((r) => r.item.dueDate)).toEqual(["2026-12-01", "2026-10-20"]);
    expect(plain(today.rows)).toEqual(["Solo"]);
    expect(plain(later.rows)).toEqual(["Other", "kid"]);
  });

  it("hides resolved descendants but counts them in the progress", () => {
    const [overdue] = buildDueDrawerRows(itemsOf("n.txt", note), TODAY, { showDelegated: false, text: "", collapsed: new Set() });
    expect(plain(overdue.rows)).not.toContain("done child");
    expect(overdue.rows[0].progress).toEqual({ resolved: 1, total: 2 });
  });

  it("a dated child brings an undated, resolved parent as context", () => {
    const groups = buildDueDrawerRows(itemsOf("n.txt", note), TODAY, { showDelegated: false, text: "", collapsed: new Set() });
    const later = groups.find((g) => g.key === "later")!;
    expect(later.rows.map((r) => r.contextOnly)).toEqual([true, false]);
    expect(later.rows[0].item.dueDate).toBeUndefined();
    expect(later.rows[1].item.dueDate).toBe("2026-10-30");
  });

  it("does not list a group without any own due date", () => {
    const groups = buildDueDrawerRows(itemsOf("n.txt", "# Undated\n  # also undated"), TODAY, {
      showDelegated: false,
      text: "",
      collapsed: new Set(),
    });
    expect(groups).toEqual([]);
  });

  it("a delegated date counts, and its row shows, only with @", () => {
    const items = itemsOf("n.txt", "# Job\n=> @bob chase by:2026-10-20");
    expect(buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "", collapsed: new Set() })).toEqual([]);
    const groups = buildDueDrawerRows(items, TODAY, { showDelegated: true, text: "", collapsed: new Set() });
    expect(groups.map((g) => g.key)).toEqual(["overdue"]);
    expect(plain(groups[0].rows)).toEqual(["Job", "@bob chase"]);
    // The undated parent is there for its dated child: context.
    expect(groups[0].rows[0].contextOnly).toBe(true);
  });

  it("a step's own date puts the group in its bucket", () => {
    const items = itemsOf("n.txt", "# Call bank => # get quote by:2026-10-25 => v send form by:2026-10-01");
    const groups = buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "", collapsed: new Set() });
    expect(groups.map((g) => g.key)).toEqual(["thisWeek"]);
    expect(plain(groups[0].rows)).toEqual(["Call bank", "get quote"]);
    expect(groups[0].rows[0].contextOnly).toBe(true);
  });

  it("a group listed for a dated child shows only the dated lines, not undated siblings (review finding)", () => {
    const items = itemsOf("n.txt", "# Release\n  # changelog\n  # build by:2026-10-20\n    # sign");
    const groups = buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "", collapsed: new Set() });
    expect(plain(groups[0].rows)).toEqual(["Release", "build"]);
    expect(groups[0].rows.map((r) => r.contextOnly)).toEqual([true, false]);
  });

  it("a dated parent still brings all its open descendants", () => {
    const items = itemsOf("n.txt", "# Release by:2026-10-20\n  # changelog\n  v build\n  # announce");
    const groups = buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "", collapsed: new Set() });
    expect(plain(groups[0].rows)).toEqual(["Release", "changelog", "announce"]);
  });

  it("sorts groups inside a bucket like today's list: date, note date descending, line", () => {
    const groups = buildDueDrawerRows(
      [
        ...itemsOf("2026-10-01.txt", "# older by:2026-10-20"),
        ...itemsOf("2026-10-02.txt", "# newer by:2026-10-20\n# earlier by:2026-10-10"),
      ],
      TODAY,
      { showDelegated: false, text: "", collapsed: new Set() },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.item.dueDate)).toEqual(["2026-10-10", "2026-10-20", "2026-10-20"]);
    expect(plain(groups[0].rows)).toEqual(["earlier", "newer", "older"]);
  });

  it("applies the text filter with ancestors as context and drops empty groups", () => {
    const items = itemsOf("n.txt", note);
    const groups = buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "child one", collapsed: new Set() });
    expect(groups.map((g) => g.key)).toEqual(["overdue"]);
    expect(plain(groups[0].rows)).toEqual(["Parent", "child one"]);
    expect(groups[0].rows.map((r) => r.contextOnly)).toEqual([true, false]);
  });

  it("collapse works as in the normal view", () => {
    const items = itemsOf("n.txt", note);
    const collapsed = new Set([collapseKey(items[0])]);
    const [overdue] = buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "", collapsed });
    expect(plain(overdue.rows)).toEqual(["Parent"]);
    expect(overdue.rows[0].expanded).toBe(false);
    const [filtered] = buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "child", collapsed });
    expect(plain(filtered.rows)).toEqual(["Parent", "child one"]);
  });

  it("items without tree fields use itemDueDate", () => {
    const items: ActionSnapshotItem[] = [
      { id: "1", filename: "n.txt", lineIdx: 0, line: "# t by:2026-10-24", header: "" },
      { id: "2", filename: "n.txt", lineIdx: 1, line: "v done by:2026-10-01", header: "" },
    ];
    const groups = buildDueDrawerRows(items, TODAY, { showDelegated: false, text: "", collapsed: new Set() });
    expect(groups.map((g) => g.key)).toEqual(["today"]);
    expect(groups[0].rows.map((r) => r.item.id)).toEqual(["1"]);
    expect(groups[0].rows[0].item.dueDate).toBe("2026-10-24");
  });
});

describe("drawerTreeGuides", () => {
  it("joins children like the editor: the last child ends, a sub-group passes its parent's line through", () => {
    // root / child a / grandchild / child b / step of b / next root
    const rows = [{ depth: 0 }, { depth: 1 }, { depth: 2 }, { depth: 1 }, { depth: 2 }, { depth: 0 }];
    expect(drawerTreeGuides(rows)).toEqual([
      { guides: [], stub: true },
      { guides: [{ level: 0, kind: "tee" }], stub: true },
      { guides: [{ level: 0, kind: "through" }, { level: 1, kind: "end" }], stub: false },
      { guides: [{ level: 0, kind: "end" }], stub: true },
      { guides: [{ level: 1, kind: "end" }], stub: false },
      { guides: [], stub: false },
    ]);
  });

  it("steps are joined like line children (§427)", () => {
    // `# onboard Lee => # laptop => # accounts` with an indented `# intro` after it
    const rows = [{ depth: 0 }, { depth: 1 }, { depth: 1 }, { depth: 1 }];
    expect(drawerTreeGuides(rows).map((g) => g.guides)).toEqual([
      [],
      [{ level: 0, kind: "tee" }],
      [{ level: 0, kind: "tee" }],
      [{ level: 0, kind: "end" }],
    ]);
  });
});

describe("nodeMatchesQuery", () => {
  const plan = "# Plan (work) => # step one @dana => v step two";
  const items = itemsOf("2026-10-24.txt", plan);
  const scratchpadItems = itemsOf("scratchpad.txt", "# note action (work)");

  it("matches plain term substring case-insensitively", () => {
    expect(nodeMatchesQuery(items[0], parseSearchQuery("plan"))).toBe(true);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("PLAN"))).toBe(true);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("missing"))).toBe(false);
  });

  it("matches tag:x in node's own part case-insensitively", () => {
    expect(nodeMatchesQuery(items[0], parseSearchQuery("tag:work"))).toBe(true);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("tag:WORK"))).toBe(true);
    expect(nodeMatchesQuery(items[1], parseSearchQuery("tag:work"))).toBe(false);
  });

  it("matches tag:x on a whole-line item", () => {
    const wholeItem: ActionSnapshotItem = {
      id: "w1",
      filename: "2026-10-24.txt",
      lineIdx: 0,
      line: "# review budget (finance)",
      header: "",
      whole: true,
    };
    expect(nodeMatchesQuery(wholeItem, parseSearchQuery("tag:finance"))).toBe(true);
    expect(nodeMatchesQuery(wholeItem, parseSearchQuery("tag:other"))).toBe(false);
  });

  it("matches has:@name as a word case-insensitively", () => {
    expect(nodeMatchesQuery(items[1], parseSearchQuery("has:@dana"))).toBe(true);
    expect(nodeMatchesQuery(items[1], parseSearchQuery("has:@DANA"))).toBe(true);
    expect(nodeMatchesQuery(items[1], parseSearchQuery("has:@dan"))).toBe(false);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("has:@dana"))).toBe(false);
  });

  it("matches since and before date operators inclusive", () => {
    expect(nodeMatchesQuery(items[0], parseSearchQuery("since:2026-10-24"))).toBe(true);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("since:2026-10-25"))).toBe(false);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("before:2026-10-24"))).toBe(true);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("before:2026-10-23"))).toBe(false);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("since:2026-10-20 before:2026-10-25"))).toBe(true);
  });

  it("scratchpad items never match a date operator", () => {
    expect(nodeMatchesQuery(scratchpadItems[0], parseSearchQuery("since:2020-01-01"))).toBe(false);
    expect(nodeMatchesQuery(scratchpadItems[0], parseSearchQuery("before:2030-01-01"))).toBe(false);
    // But scratchpad matches non-date operators
    expect(nodeMatchesQuery(scratchpadItems[0], parseSearchQuery("tag:work"))).toBe(true);
  });

  it("matches is:open for # and is:done for v", () => {
    expect(nodeMatchesQuery(items[0], parseSearchQuery("is:open"))).toBe(true);
    expect(nodeMatchesQuery(items[0], parseSearchQuery("is:done"))).toBe(false);
    expect(nodeMatchesQuery(items[2], parseSearchQuery("is:done"))).toBe(true);
    expect(nodeMatchesQuery(items[2], parseSearchQuery("is:open"))).toBe(false);
  });
});

describe("buildDrawerRows with operators", () => {
  const tree = "# Project (budget)\n  # subtask 1\n  v subtask 2";

  it("tag on a parent shows its group", () => {
    const items = itemsOf("2026-10-24.txt", tree);
    const rows = buildDrawerRows(items, filter({ text: "tag:budget" }));
    expect(texts(rows)).toEqual(["Project (budget)", "subtask 1", "subtask 2"]);
    expect(rows.every((r) => !r.contextOnly)).toBe(true);
  });

  it("tag on a child shows it with its parent as context", () => {
    const childTagTree = "# Project\n  # subtask 1 (urgent)\n  # subtask 2";
    const items = itemsOf("2026-10-24.txt", childTagTree);
    const rows = buildDrawerRows(items, filter({ text: "tag:urgent" }));
    expect(texts(rows)).toEqual(["Project", "subtask 1 (urgent)"]);
    expect(rows.map((r) => r.contextOnly)).toEqual([true, false]);
  });

  it("since and before filter items by note date", () => {
    const early = itemsOf("2026-10-10.txt", "# early action");
    const late = itemsOf("2026-10-25.txt", "# late action");
    const all = [...early, ...late];

    const sinceRows = buildDrawerRows(all, filter({ text: "since:2026-10-20" }));
    expect(texts(sinceRows)).toEqual(["late action"]);

    const beforeRows = buildDrawerRows(all, filter({ text: "before:2026-10-20" }));
    expect(texts(beforeRows)).toEqual(["early action"]);
  });

  it("scratchpad items never match a date operator in buildDrawerRows", () => {
    const scratch = itemsOf("scratchpad.txt", "# scratch action");
    const dated = itemsOf("2026-10-24.txt", "# dated action");
    const all = [...scratch, ...dated];

    const rows = buildDrawerRows(all, filter({ text: "since:2026-01-01" }));
    expect(texts(rows)).toEqual(["dated action"]);
  });

  it("is:done lists done actions although Only open is on", () => {
    const items = itemsOf("2026-10-24.txt", tree);
    const rows = buildDrawerRows(items, filter({ onlyOpen: true, text: "is:done" }));
    expect(texts(rows)).toEqual(["Project (budget)", "subtask 2"]);
    expect(rows.map((r) => r.contextOnly)).toEqual([true, false]);
  });

  it("has:@name shows delegated parts", () => {
    const delegatedTree = "# Onboarding\n=> @dana send invite\n# other task";
    const items = itemsOf("2026-10-24.txt", delegatedTree);
    const rows = buildDrawerRows(items, filter({ text: "has:@dana" }));
    expect(texts(rows)).toEqual(["Onboarding", "@dana send invite"]);
    expect(rows.map((r) => r.contextOnly)).toEqual([true, false]);
  });

  it("an active operator unfolds folded groups", () => {
    const items = itemsOf("2026-10-24.txt", tree);
    const collapsed = new Set([collapseKey(items[0])]);

    // Collapsed when no filter
    const rowsCollapsed = buildDrawerRows(items, filter({ collapsed }));
    expect(rowsCollapsed).toHaveLength(1);
    expect(rowsCollapsed[0].expanded).toBe(false);

    // Unfolded when tag operator is used
    const rowsTag = buildDrawerRows(items, filter({ collapsed, text: "tag:budget" }));
    expect(rowsTag).toHaveLength(3);
    expect(rowsTag[0].expanded).toBe(true);
  });
});

describe("buildDueDrawerRows with operators", () => {
  const TODAY = "2026-10-24";
  const dueTree = [
    "# Release (launch) by:2026-10-24",
    "  # build by:2026-10-24",
    "  # test (qa) by:2026-10-24",
    "# Other by:2026-10-24",
    "  # task by:2026-10-24",
  ].join("\n");

  it("tag on a child shows it with its parent as context and drops unmatched groups", () => {
    const items = itemsOf("2026-10-24.txt", dueTree);
    const groups = buildDueDrawerRows(items, TODAY, {
      showDelegated: false,
      text: "tag:qa",
      collapsed: new Set(),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => nodeText(r.item).replace(/ by:\S+/, ""))).toEqual(["Release (launch)", "test (qa)"]);
    expect(groups[0].rows.map((r) => r.contextOnly)).toEqual([true, false]);
  });

  it("tag on a parent shows its group in due view", () => {
    const items = itemsOf("2026-10-24.txt", dueTree);
    const groups = buildDueDrawerRows(items, TODAY, {
      showDelegated: false,
      text: "tag:launch",
      collapsed: new Set(),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => nodeText(r.item).replace(/ by:\S+/, ""))).toEqual(["Release (launch)", "build", "test (qa)"]);
    expect(groups[0].rows.every((r) => !r.contextOnly)).toBe(true);
  });

  it("since and before filter groups in due view", () => {
    const earlyItems = itemsOf("2026-10-10.txt", "# early by:2026-10-24");
    const lateItems = itemsOf("2026-10-25.txt", "# late by:2026-10-24");
    const all = [...earlyItems, ...lateItems];

    const sinceGroups = buildDueDrawerRows(all, TODAY, {
      showDelegated: false,
      text: "since:2026-10-20",
      collapsed: new Set(),
    });
    expect(sinceGroups).toHaveLength(1);
    expect(sinceGroups[0].rows[0].item.filename).toBe("2026-10-25.txt");
  });

  it("scratchpad items never match a date operator in due view", () => {
    const scratchItems = itemsOf("scratchpad.txt", "# scratch by:2026-10-24");
    const groups = buildDueDrawerRows(scratchItems, TODAY, {
      showDelegated: false,
      text: "since:2020-01-01",
      collapsed: new Set(),
    });
    expect(groups).toEqual([]);
  });
});
