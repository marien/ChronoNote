// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { actionTree, flattenActionTree, type ActionNode } from "./actionGroups";
import { buildActionSnapshotAllFiles, buildActionSnapshotOtherNotes } from "./actions";
import { ensureLoaded, notesIndex, noteTexts } from "./notesIndex";
import { clearDiskLayer, seedDiskNotesForTest } from "./notesIndex/diskLayer";
import { _facetRuns } from "./notesIndex/facets";
import { tabs } from "./stores";
import { sortFilenamesByRecency } from "./tabSort";
import { getSectionHeaderForLine, normalizeHeaderTitle } from "./tokens";
import type { ActionSnapshotItem } from "./types";

function oldSnapshotItemsForNote(
  base: string,
  tabId: string | undefined,
  filename: string,
  lines: string[],
): ActionSnapshotItem[] {
  const nodes = flattenActionTree(actionTree(lines));
  const parentOf = new Map<ActionNode, ActionNode>();
  for (const node of nodes) for (const child of node.children) parentOf.set(child, node);
  const idOf = new Map<ActionNode, string>();
  return nodes.map((node) => {
    const id = node.kind === "step" ? `${base}-${node.lineIdx}-s${node.stepIndex}` : `${base}-${node.lineIdx}`;
    idOf.set(node, id);
    const parent = parentOf.get(node);
    const item: ActionSnapshotItem = {
      id,
      tabId,
      filename,
      lineIdx: node.lineIdx,
      line: lines[node.lineIdx],
      header: normalizeHeaderTitle(getSectionHeaderForLine(lines, node.lineIdx)),
      kind: node.kind,
      partFrom: node.from,
      partTo: node.to,
      symbolCol: node.symbolCol,
      delegated: node.delegated,
      depth: node.depth,
      whole: node.whole,
    };
    if (node.stepIndex !== undefined) item.stepIndex = node.stepIndex;
    if (parent) item.parentId = idOf.get(parent);
    return item;
  });
}

async function oldBuildActionSnapshotAllFiles(): Promise<ActionSnapshotItem[]> {
  await ensureLoaded();
  const allSources = noteTexts(get(notesIndex));
  const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
  const snapshot: ActionSnapshotItem[] = [];
  for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
    snapshot.push(
      ...oldSnapshotItemsForNote(filename, openTabIdByFilename.get(filename), filename, allSources[filename].split("\n")),
    );
  }
  return snapshot;
}

describe("actions view reading notesIndex (S3)", () => {
  beforeEach(() => {
    clearDiskLayer();
    tabs.set([]);
    get(notesIndex);
  });

  it("matches the old All and Other notes snapshots item by item and recomputes actionsOf only for a typed tab", async () => {
    seedDiskNotesForTest({
      "2026-11-10.txt": "Standup\n=======\n# call Alice\nv sent notes",
      "2026-11-11.txt": "Planning\n========\n# stale disk task",
      "2026-11-12.txt": "Review\n======\n# check PR => @bob ask\n  # nested step",
    });
    tabs.set([
      {
        id: "tab-open",
        filename: "2026-11-11.txt",
        isScratchpad: false,
        content: "Planning\n========\n# live tab task => # follow up\n> deferred item",
      },
    ]);

    const actualAll = await buildActionSnapshotAllFiles();
    const expectedAll = await oldBuildActionSnapshotAllFiles();
    expect(actualAll.length).toBeGreaterThan(0);
    expect(actualAll).toEqual(expectedAll);

    const actualOther = await buildActionSnapshotOtherNotes();
    expect(actualOther.every((item) => item.filename !== "2026-11-11.txt")).toBe(true);
    expect(actualOther).toEqual(expectedAll.filter((item) => item.tabId === undefined));

    const runsBeforeTyping = _facetRuns.actions;
    tabs.update((list) =>
      list.map((t) =>
        t.id === "tab-open" ? { ...t, content: `${t.content}\n# newly typed task` } : t,
      ),
    );

    const afterTypingAll = await buildActionSnapshotAllFiles();
    expect(_facetRuns.actions - runsBeforeTyping).toBe(1);
    const expectedAfterTyping = await oldBuildActionSnapshotAllFiles();
    expect(afterTypingAll).toEqual(expectedAfterTyping);
  });
});
