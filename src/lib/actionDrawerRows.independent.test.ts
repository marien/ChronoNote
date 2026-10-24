import { describe, it, expect } from "vitest";
import {
  nodeState,
  nodeText,
  collapseKey,
  buildDrawerRows,
  buildDueDrawerRows,
  type DrawerRow,
  type DrawerFilter,
} from "./actionDrawerRows";
import { actionTree, type ActionNode } from "./actionGroups";
import type { ActionSnapshotItem } from "./types";
import type { DueGroupKey } from "./dueOverview";

interface TreeActionSnapshotItem extends ActionSnapshotItem {
  kind?: "line" | "step";
  partFrom?: number;
  partTo?: number;
  symbolCol?: number | null;
  delegated?: boolean;
  depth?: number;
  whole?: boolean;
  stepIndex?: number;
  parentId?: string;
  dueDate?: string;
}

/** Helper to build TreeActionSnapshotItem list from text using actionTree. */
function makeSnapshotItems(
  text: string,
  filename = "2026-10-24.txt",
  header = "Notes",
): TreeActionSnapshotItem[] {
  const lines = text.split("\n");
  const roots = actionTree(lines);
  const items: TreeActionSnapshotItem[] = [];

  function nodeId(node: ActionNode): string {
    return node.kind === "step"
      ? `${filename}-${node.lineIdx}-s${node.stepIndex}`
      : `${filename}-${node.lineIdx}`;
  }

  function walk(node: ActionNode, parentId?: string) {
    const id = nodeId(node);
    const item: TreeActionSnapshotItem = {
      id,
      filename,
      lineIdx: node.lineIdx,
      line: lines[node.lineIdx],
      header,
      kind: node.kind,
      partFrom: node.from,
      partTo: node.to,
      symbolCol: node.symbolCol,
      delegated: node.delegated,
      depth: node.depth,
      whole: node.whole,
      stepIndex: node.stepIndex,
      ...(parentId !== undefined ? { parentId } : {}),
    };
    items.push(item);
    for (const child of node.children) {
      walk(child, id);
    }
  }

  for (const root of roots) {
    walk(root);
  }
  return items;
}

const emptyFilter: DrawerFilter = {
  onlyOpen: false,
  showDelegated: false,
  text: "",
  collapsed: new Set<string>(),
};

describe("src/lib/actionDrawerRows", () => {
  describe("nodeState", () => {
    it("returns the live state character at symbolCol for line nodes", () => {
      const items = makeSnapshotItems("# open\nv done\n> deferred\nx cancelled");
      expect(nodeState(items[0])).toBe("#");
      expect(nodeState(items[1])).toBe("v");
      expect(nodeState(items[2])).toBe(">");
      expect(nodeState(items[3])).toBe("x");
    });

    it("returns the live state character at symbolCol for step nodes", () => {
      const items = makeSnapshotItems("# start => v step1 => > step2 => x step3");
      // items[0] is line root, items[1..3] are steps
      expect(nodeState(items[0])).toBe("#");
      expect(nodeState(items[1])).toBe("v");
      expect(nodeState(items[2])).toBe(">");
      expect(nodeState(items[3])).toBe("x");
    });

    it("reads the live state dynamically when line[symbolCol] is modified", () => {
      const items = makeSnapshotItems("# mutable action");
      expect(nodeState(items[0])).toBe("#");
      // Simulate live toggling in the line
      items[0].line = "v mutable action";
      expect(nodeState(items[0])).toBe("v");
      items[0].line = "> mutable action";
      expect(nodeState(items[0])).toBe(">");
      items[0].line = "x mutable action";
      expect(nodeState(items[0])).toBe("x");
    });

    it("returns null if the character at symbolCol is not an action symbol", () => {
      const item: TreeActionSnapshotItem = {
        id: "test-0",
        filename: "test.txt",
        lineIdx: 0,
        line: "  regular text",
        header: "Notes",
        symbolCol: 2,
        delegated: false,
      };
      expect(nodeState(item)).toBeNull();
    });

    it("returns null for delegated nodes", () => {
      const stepItems = makeSnapshotItems("# start => @dana delegate step");
      expect(nodeState(stepItems[1])).toBeNull();

      const lineItems = makeSnapshotItems("# start\n=> @dana delegate child");
      expect(nodeState(lineItems[1])).toBeNull();
    });

    it("returns innermostActionSymbol for whole nodes", () => {
      const items = makeSnapshotItems("o meeting topic => # follow up");
      expect(items[0].whole).toBe(true);
      expect(nodeState(items[0])).toBe("#");

      const doneItems = makeSnapshotItems("o meeting topic => v follow up");
      expect(nodeState(doneItems[0])).toBe("v");
    });

    it("returns innermostActionSymbol for items without tree fields", () => {
      const legacyOpen: ActionSnapshotItem = {
        id: "legacy-1",
        filename: "note.txt",
        lineIdx: 0,
        line: "# legacy open task",
        header: "Notes",
      };
      expect(nodeState(legacyOpen)).toBe("#");

      const legacyDone: ActionSnapshotItem = {
        id: "legacy-2",
        filename: "note.txt",
        lineIdx: 1,
        line: "v legacy completed task",
        header: "Notes",
      };
      expect(nodeState(legacyDone)).toBe("v");
    });
  });

  describe("nodeText", () => {
    it("strips leading action token and leading/trailing whitespace for line nodes", () => {
      const items = makeSnapshotItems("# release 0.34\n  # changelog   \n  v build");
      expect(nodeText(items[0])).toBe("release 0.34");
      expect(nodeText(items[1])).toBe("changelog");
      expect(nodeText(items[2])).toBe("build");
    });

    it("strips leading arrow and action token for consequence/step nodes", () => {
      const unindented = makeSnapshotItems("# parent\n=> # laptop");
      expect(nodeText(unindented[1])).toBe("laptop");

      const steps = makeSnapshotItems("# onboard Lee => # laptop => v accounts");
      expect(nodeText(steps[0])).toBe("onboard Lee");
      expect(nodeText(steps[1])).toBe("laptop");
      expect(nodeText(steps[2])).toBe("accounts");
    });

    it("keeps @name for delegated nodes", () => {
      const unindented = makeSnapshotItems("# parent\n=> @dana accounts");
      expect(nodeText(unindented[1])).toBe("@dana accounts");

      const step = makeSnapshotItems("# onboard Lee => @dana accounts");
      expect(nodeText(step[1])).toBe("@dana accounts");
    });

    it("uses stripLeadingToken for whole nodes and items without tree fields", () => {
      const whole = makeSnapshotItems("o topic => # action part");
      // stripLeadingToken drops the `=> # ` and keeps the topic symbol, as the drawer always showed it
      expect(nodeText(whole[0])).toBe("o topic action part");

      const legacy: ActionSnapshotItem = {
        id: "leg-1",
        filename: "note.txt",
        lineIdx: 0,
        line: "  # simple legacy action  ",
        header: "Notes",
      };
      expect(nodeText(legacy)).toBe("simple legacy action");
    });
  });

  describe("collapseKey", () => {
    it("formats as filename + NUL + nodeText", () => {
      const items = makeSnapshotItems("# release 0.34", "2026-10-24.txt");
      expect(collapseKey(items[0])).toBe("2026-10-24.txt\u0000release 0.34");
    });

    it("differentiates two notes with the same parent text", () => {
      const itemA = makeSnapshotItems("# Release", "2026-10-24.txt")[0];
      const itemB = makeSnapshotItems("# Release", "2026-10-25.txt")[0];
      expect(collapseKey(itemA)).not.toBe(collapseKey(itemB));
      expect(collapseKey(itemA)).toBe("2026-10-24.txt\u0000Release");
      expect(collapseKey(itemB)).toBe("2026-10-25.txt\u0000Release");
    });

    it("produces identical keys for duplicate parent texts within the same note", () => {
      const items = makeSnapshotItems("# Release\n# Release", "2026-10-24.txt");
      expect(collapseKey(items[0])).toBe(collapseKey(items[1]));
    });
  });

  describe("buildDrawerRows: visibility and filtering", () => {
    it("preserves snapshot order and sets depth on rows", () => {
      const items = makeSnapshotItems("# parent\n  # child 1\n    # grandchild\n  # child 2");
      const rows = buildDrawerRows(items, emptyFilter);
      expect(rows.map((r) => r.item.id)).toEqual(items.map((i) => i.id));
      expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1]);
    });

    it("with onlyOpen: true, shows open actions and hides resolved actions", () => {
      const items = makeSnapshotItems("# parent\n  # open child\n  v done child\n  > deferred child");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      const texts = rows.map((r) => nodeText(r.item));
      expect(texts).toEqual(["parent", "open child"]);
      expect(rows[0].contextOnly).toBe(false);
      expect(rows[1].contextOnly).toBe(false);
    });

    it("with onlyOpen: true, shows a resolved parent as contextOnly when it has an open child", () => {
      const items = makeSnapshotItems("v resolved parent\n  # open child");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      expect(rows).toHaveLength(2);
      expect(nodeText(rows[0].item)).toBe("resolved parent");
      expect(rows[0].contextOnly).toBe(true);
      expect(nodeText(rows[1].item)).toBe("open child");
      expect(rows[1].contextOnly).toBe(false);
    });

    it("with onlyOpen: true, shows a resolved parent as contextOnly when it has an open step", () => {
      const items = makeSnapshotItems("v done root => # open step");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      expect(rows).toHaveLength(2);
      expect(rows[0].contextOnly).toBe(true);
      expect(rows[1].contextOnly).toBe(false);
    });

    it("with onlyOpen: true, hides the entire group when parent and all descendants are resolved", () => {
      const items = makeSnapshotItems("v resolved parent\n  v child 1\n  x child 2");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      expect(rows).toHaveLength(0);
    });

    it("with onlyOpen: false, shows resolved nodes with contextOnly: false", () => {
      const items = makeSnapshotItems("v resolved parent\n  v done child");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: false });
      expect(rows).toHaveLength(2);
      expect(rows[0].contextOnly).toBe(false);
      expect(rows[1].contextOnly).toBe(false);
    });

    it("delegated nodes require showDelegated: true under onlyOpen: true and onlyOpen: false", () => {
      const items = makeSnapshotItems("# parent\n  => @dana delegated child");

      // Without showDelegated: delegated node is hidden
      const withoutDelegated = buildDrawerRows(items, {
        ...emptyFilter,
        onlyOpen: true,
        showDelegated: false,
      });
      expect(withoutDelegated).toHaveLength(1);
      expect(nodeText(withoutDelegated[0].item)).toBe("parent");

      // With showDelegated: delegated node passes
      const withDelegated = buildDrawerRows(items, {
        ...emptyFilter,
        onlyOpen: true,
        showDelegated: true,
      });
      expect(withDelegated).toHaveLength(2);
      expect(nodeText(withDelegated[1].item)).toBe("@dana delegated child");
    });

    it("shows resolved parent as contextOnly when child is delegated and showDelegated: true", () => {
      const items = makeSnapshotItems("v resolved parent\n  => @dana review");
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        onlyOpen: true,
        showDelegated: true,
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].contextOnly).toBe(true);
      expect(rows[1].contextOnly).toBe(false);
    });

    it("keeps intermediate resolved parent as contextOnly in deeply nested groups", () => {
      const items = makeSnapshotItems("v grand\n  v parent\n    # leaf child");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      expect(rows).toHaveLength(3);
      expect(rows[0].contextOnly).toBe(true);
      expect(rows[1].contextOnly).toBe(true);
      expect(rows[2].contextOnly).toBe(false);
    });
  });

  describe("buildDrawerRows: text filter", () => {
    it("filters nodes by case-insensitive substring match", () => {
      const items = makeSnapshotItems("# Alpha\n# Beta\n# Charlie");
      const rows = buildDrawerRows(items, { ...emptyFilter, text: "bet" });
      expect(rows).toHaveLength(1);
      expect(nodeText(rows[0].item)).toBe("Beta");
    });

    it("matching a parent passes the parent and all its descendants (shows whole group)", () => {
      const items = makeSnapshotItems(
        "# release 0.34\n  # changelog\n  v build\n  # announce\n# other group\n  # other child",
      );
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        onlyOpen: true,
        text: "release",
      });
      const texts = rows.map((r) => nodeText(r.item));
      expect(texts).toEqual(["release 0.34", "changelog", "announce"]);
      expect(rows.every((r) => !r.contextOnly)).toBe(true);
    });

    it("matching a child shows that child with its ancestor as contextOnly", () => {
      const items = makeSnapshotItems(
        "# release 0.34\n  # changelog\n  # announce\n# other group",
      );
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        onlyOpen: true,
        text: "changelog",
      });
      expect(rows).toHaveLength(2);
      expect(nodeText(rows[0].item)).toBe("release 0.34");
      expect(rows[0].contextOnly).toBe(true);
      expect(nodeText(rows[1].item)).toBe("changelog");
      expect(rows[1].contextOnly).toBe(false);
    });

    it("matching a grandchild shows grandchild with parent and grandparent as contextOnly", () => {
      const items = makeSnapshotItems(
        "# grand\n  # intermediate\n    # target grandchild\n    # other grandchild",
      );
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        onlyOpen: true,
        text: "target",
      });
      expect(rows).toHaveLength(3);
      expect(nodeText(rows[0].item)).toBe("grand");
      expect(rows[0].contextOnly).toBe(true);
      expect(nodeText(rows[1].item)).toBe("intermediate");
      expect(rows[1].contextOnly).toBe(true);
      expect(nodeText(rows[2].item)).toBe("target grandchild");
      expect(rows[2].contextOnly).toBe(false);
    });

    it("matches whole nodes against the full line text", () => {
      const items = makeSnapshotItems("o team sync => # action item");
      const rows = buildDrawerRows(items, { ...emptyFilter, text: "team sync" });
      expect(rows).toHaveLength(1);
      expect(nodeText(rows[0].item)).toBe("o team sync action item");
    });
  });

  describe("buildDrawerRows: collapse and hasChildren", () => {
    it("hasChildren is true when at least one descendant would be shown expanded", () => {
      const items = makeSnapshotItems("# parent\n  # child");
      const rows = buildDrawerRows(items, emptyFilter);
      expect(rows[0].hasChildren).toBe(true);
      expect(rows[1].hasChildren).toBe(false);
    });

    it("hasChildren is false when all descendants are filtered out by current filter", () => {
      const items = makeSnapshotItems("# parent\n  v resolved child");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      expect(rows).toHaveLength(1);
      expect(rows[0].hasChildren).toBe(false);
    });

    it("hasChildren remains true on a collapsed parent if descendants would be shown expanded", () => {
      const items = makeSnapshotItems("# parent\n  # child");
      const key = collapseKey(items[0]);
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        collapsed: new Set([key]),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].hasChildren).toBe(true);
      expect(rows[0].expanded).toBe(false);
    });

    it("collapsing a parent omits its descendants from the row list and sets expanded to false", () => {
      const items = makeSnapshotItems("# parent\n  # child 1\n  # child 2");
      const key = collapseKey(items[0]);
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        collapsed: new Set([key]),
      });
      expect(rows).toHaveLength(1);
      expect(nodeText(rows[0].item)).toBe("parent");
      expect(rows[0].expanded).toBe(false);
    });

    it("text filter overrides collapse (collapse is ignored and expanded is true)", () => {
      const items = makeSnapshotItems("# release 0.34\n  # changelog");
      const key = collapseKey(items[0]);
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        collapsed: new Set([key]),
        text: "change",
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].expanded).toBe(true);
      expect(nodeText(rows[1].item)).toBe("changelog");
    });

    it("collapsed nested parent hides only its own subtree while keeping outer parent visible", () => {
      const items = makeSnapshotItems(
        "# grand\n  # intermediate parent\n    # deep child\n  # sibling intermediate",
      );
      const intermediateKey = collapseKey(items[1]);
      const rows = buildDrawerRows(items, {
        ...emptyFilter,
        collapsed: new Set([intermediateKey]),
      });
      const texts = rows.map((r) => nodeText(r.item));
      expect(texts).toEqual(["grand", "intermediate parent", "sibling intermediate"]);
      expect(rows[0].expanded).toBe(true);
      expect(rows[1].expanded).toBe(false);
      expect(rows[1].hasChildren).toBe(true);
      expect(rows[2].expanded).toBe(true);
    });
  });

  describe("buildDrawerRows: progress", () => {
    it("counts live nodeState of ALL descendants (resolved: v, x, >; total: non-null state)", () => {
      const items = makeSnapshotItems("# parent\n  # open\n  v done\n  > deferred\n  x cancelled");
      const rows = buildDrawerRows(items, emptyFilter);
      expect(rows[0].progress).toEqual({ resolved: 3, total: 4 });
    });

    it("includes resolved descendants hidden by onlyOpen: true in progress count", () => {
      const items = makeSnapshotItems("# release 0.34\n  # changelog\n  v build\n  # announce");
      const rows = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      // Only release, changelog, announce are shown
      expect(rows.map((r) => nodeText(r.item))).toEqual(["release 0.34", "changelog", "announce"]);
      expect(rows[0].progress).toEqual({ resolved: 1, total: 3 });
    });

    it("includes step descendants in progress count", () => {
      const items = makeSnapshotItems("# onboard Lee => v laptop => # accounts => > intro");
      const rows = buildDrawerRows(items, emptyFilter);
      expect(rows[0].progress).toEqual({ resolved: 2, total: 3 });
    });

    it("omits progress when total is 0 (leaf nodes or no stateful descendants)", () => {
      const leaf = makeSnapshotItems("# single action");
      const rows = buildDrawerRows(leaf, emptyFilter);
      expect(rows[0].progress).toBeUndefined();

      const delegatedOnly = makeSnapshotItems("# parent\n  => @dana delegate");
      const delRows = buildDrawerRows(delegatedOnly, { ...emptyFilter, showDelegated: true });
      expect(delRows[0].progress).toBeUndefined();
    });

    it("grandparent progress aggregates all descendants across its entire subtree", () => {
      const items = makeSnapshotItems(
        "# grand\n  v child 1\n  # child 2\n    v grandchild 1\n    # grandchild 2",
      );
      const rows = buildDrawerRows(items, emptyFilter);
      // Grandparent has descendants: child 1 (v), child 2 (#), grandchild 1 (v), grandchild 2 (#) -> 4 total, 2 resolved
      expect(rows[0].progress).toEqual({ resolved: 2, total: 4 });
      // Child 2 has descendants: grandchild 1 (v), grandchild 2 (#) -> 2 total, 1 resolved
      expect(rows[2].progress).toEqual({ resolved: 1, total: 2 });
    });
  });

  describe("buildDrawerRows: items without tree fields and edge cases", () => {
    it("item without tree fields behaves as root without children", () => {
      const legacy: ActionSnapshotItem = {
        id: "leg-item",
        filename: "note.txt",
        lineIdx: 5,
        line: "# standalone legacy",
        header: "Notes",
      };
      const rows = buildDrawerRows([legacy], emptyFilter);
      expect(rows).toHaveLength(1);
      expect(rows[0].depth).toBe(0);
      expect(rows[0].hasChildren).toBe(false);
      expect(rows[0].expanded).toBe(true);
      expect(rows[0].progress).toBeUndefined();
      expect(rows[0].contextOnly).toBe(false);
    });

    it("two notes with the same parent text only collapse the targeted note", () => {
      const noteA = makeSnapshotItems("# Release\n  # noteA child", "2026-10-24.txt");
      const noteB = makeSnapshotItems("# Release\n  # noteB child", "2026-10-25.txt");
      const allItems = [...noteA, ...noteB];

      const keyA = collapseKey(noteA[0]);
      const rows = buildDrawerRows(allItems, {
        ...emptyFilter,
        collapsed: new Set([keyA]),
      });

      // Note A is collapsed -> noteA child omitted
      // Note B is expanded -> noteB child shown
      const texts = rows.map((r) => nodeText(r.item));
      expect(texts).toEqual(["Release", "Release", "noteB child"]);
      expect(rows[0].expanded).toBe(false);
      expect(rows[1].expanded).toBe(true);
    });

    it("handles a step that is itself resolved", () => {
      const items = makeSnapshotItems("# onboard => v laptop => # accounts");
      const rowsOnlyOpen = buildDrawerRows(items, { ...emptyFilter, onlyOpen: true });
      expect(rowsOnlyOpen.map((r) => nodeText(r.item))).toEqual(["onboard", "accounts"]);
      expect(rowsOnlyOpen[0].progress).toEqual({ resolved: 1, total: 2 });

      const rowsAll = buildDrawerRows(items, { ...emptyFilter, onlyOpen: false });
      expect(rowsAll.map((r) => nodeText(r.item))).toEqual(["onboard", "laptop", "accounts"]);
    });
  });

  describe("buildDueDrawerRows", () => {
    const today = "2026-10-24"; // Saturday; ISO week Sunday is 2026-10-25

    it("extracts own due date from [partFrom, partTo)", () => {
      const items = makeSnapshotItems(
        "# release 0.34 by:2026-10-25\n  # changelog by:2026-10-24",
      );
      const groups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      // Earliest due date is 2026-10-24 -> today bucket
      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe("today");
      const rows = groups[0].rows;
      expect(rows).toHaveLength(2);
      expect(rows[0].item.dueDate).toBe("2026-10-25");
      expect(rows[1].item.dueDate).toBe("2026-10-24");
    });

    it("resolved node has no own due date and does not contribute to group due date", () => {
      const items = makeSnapshotItems("v resolved by:2026-10-20\n  # open child by:2026-10-25");
      const groups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      // The resolved root has no own due date; earliest date is open child's 2026-10-25 -> thisWeek
      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe("thisWeek");
      expect(groups[0].rows[0].item.dueDate).toBeUndefined();
      expect(groups[0].rows[1].item.dueDate).toBe("2026-10-25");
    });

    it("places group in the bucket of its EARLIEST own due date", () => {
      // Parent due later (2026-10-30), child overdue (2026-10-20) -> overdue bucket
      const items = makeSnapshotItems("# parent by:2026-10-30\n  # child by:2026-10-20");
      const groups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe("overdue");
    });

    it("distinguishes due-view bucket of a group whose earliest date is today vs overdue", () => {
      const overdueItems = makeSnapshotItems("# taskA by:2026-10-22", "2026-10-24.txt");
      // Another note: two items from the same note and line would share one id.
      const todayItems = makeSnapshotItems("# taskB by:2026-10-24", "2026-10-23.txt");
      const allItems = [...overdueItems, ...todayItems];

      const groups = buildDueDrawerRows(allItems, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      const keys = groups.map((g) => g.key);
      expect(keys).toContain("overdue");
      expect(keys).toContain("today");

      const overdueGroup = groups.find((g) => g.key === "overdue");
      expect(overdueGroup?.rows.some((r) => nodeText(r.item).includes("taskA"))).toBe(true);

      const todayGroup = groups.find((g) => g.key === "today");
      expect(todayGroup?.rows.some((r) => nodeText(r.item).includes("taskB"))).toBe(true);
    });

    it("does NOT list a group with an overdue resolved child only", () => {
      const items = makeSnapshotItems("# parent\n  v resolved child by:2026-10-20");
      const groups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      expect(groups).toHaveLength(0);
    });

    it("does NOT list a group without any own due dates", () => {
      const items = makeSnapshotItems("# parent\n  # child");
      const groups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      expect(groups).toHaveLength(0);
    });

    it("rows of listed group: root (contextOnly when no own due date and not open) + open descendants", () => {
      const items = makeSnapshotItems(
        "v resolved parent\n  # child 1 by:2026-10-24\n  v child 2\n  # child 3",
      );
      const groups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      expect(groups).toHaveLength(1);
      const rows = groups[0].rows;
      // Root is shown as contextOnly
      expect(rows[0].contextOnly).toBe(true);
      expect(nodeText(rows[0].item)).toBe("resolved parent");
      expect(rows[0].progress).toEqual({ resolved: 1, total: 3 });

      // Open child 1 (with date) and open child 3 (without date) are shown; resolved child 2 is hidden
      const descendantTexts = rows.slice(1).map((r) => nodeText(r.item));
      // The row text keeps the `by:` date, as the drawer always showed it.
      expect(descendantTexts).toEqual(["child 1 by:2026-10-24", "child 3"]);
      expect(rows[1].item.dueDate).toBe("2026-10-24");
      expect(rows[2].item.dueDate).toBeUndefined();
    });

    it("sorts groups inside buckets by key date, note date desc, scratchpads last, root line asc", () => {
      const item1 = makeSnapshotItems("# Task A by:2026-10-24", "2026-10-23.txt")[0];
      const item2 = makeSnapshotItems("# Task B by:2026-10-24", "2026-10-24.txt")[0];
      // Both are due today; item2 is from 2026-10-24 (newer note) so sorts before item1 (2026-10-23)
      const groups = buildDueDrawerRows([item1, item2], today, {
        showDelegated: false,
        text: "",
        collapsed: new Set(),
      });
      expect(groups[0].rows.map((r) => nodeText(r.item))).toEqual(["Task B by:2026-10-24", "Task A by:2026-10-24"]);
    });

    it("text filter in due view preserves ancestors as context and drops groups with no rows left", () => {
      const items = makeSnapshotItems(
        "# release by:2026-10-24\n  # changelog\n# other by:2026-10-24",
      );
      const groups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "changelog",
        collapsed: new Set(),
      });
      expect(groups).toHaveLength(1);
      const texts = groups[0].rows.map((r) => nodeText(r.item));
      expect(texts).toEqual(["release by:2026-10-24", "changelog"]);
      expect(groups[0].rows[0].contextOnly).toBe(true);
      expect(groups[0].rows[1].contextOnly).toBe(false);
    });

    it("collapse works in due view and is overridden by text filter", () => {
      const items = makeSnapshotItems("# release by:2026-10-24\n  # child");
      const key = collapseKey(items[0]);

      // Collapsed without text filter: child hidden
      const collapsedGroups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "",
        collapsed: new Set([key]),
      });
      expect(collapsedGroups[0].rows).toHaveLength(1);
      expect(collapsedGroups[0].rows[0].expanded).toBe(false);

      // Collapsed with text filter: collapse ignored, child shown
      const filteredGroups = buildDueDrawerRows(items, today, {
        showDelegated: false,
        text: "child",
        collapsed: new Set([key]),
      });
      expect(filteredGroups[0].rows).toHaveLength(2);
      expect(filteredGroups[0].rows[0].expanded).toBe(true);
    });
  });
});
