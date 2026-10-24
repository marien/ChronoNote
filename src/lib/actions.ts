/** The Action Drawer (Ctrl/Cmd+Shift+A): snapshot every action line across
 * open tabs or all files, toggle an action's state, or forward it to
 * today's top priorities. Split out of `controller.ts` in the v0.5.0
 * refactor. Depends on stores + persistence + tabs + tabSort + tokens. */
import { get } from "svelte/store";
import {
  actionDrawerDueView,
  actionDrawerScopeRequest,
  actionSnapshot,
  allNotesCache,
  modal,
  showToast,
  tabs,
} from "./stores";
import { refreshAllNotesCache, updateNoteOnDisk, writeTabContent } from "./persistence";
import { openOrCreateDatedFile } from "./tabs";
import { compareTabsByRecency, sortFilenamesByRecency } from "./tabSort";
import {
  cycleActionSymbol,
  cycleActionSymbolAt,
  getSectionHeaderForLine,
  innermostActionSymbolCol,
  normalizeHeaderTitle,
} from "./tokens";
import { actionTree, flattenActionTree, type ActionNode } from "./actionGroups";
import { todayISO } from "./date";
import { forwardLink, withFromLink, withToLink } from "./paste";
import { t } from "./i18n";
import type { ActionSnapshotItem } from "./types";

/** The drawer's items for one note: every node of its action tree (§423), depth-first — a line's own part,
 * its `=> <symbol>` / `=> @name` steps and its indented child lines. Covers all four action states
 * (`# `/`v `/`>`/`x `, standalone or indented, §50), a consequence-action's own inner symbol (§41) and
 * delegated-to-a-person parts (`=> @name`). "Only Open" (§44/§67) is what narrows this down to `#` alone;
 * inclusion here covers every state so turning that toggle off reveals `v `/`x ` lines too. */
function snapshotItemsForNote(
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
    // A parent always precedes its children in the depth-first order, so its id is known by now.
    if (parent) item.parentId = idOf.get(parent);
    return item;
  });
}

export function buildActionSnapshotOpenTabs(): ActionSnapshotItem[] {
  const snapshot: ActionSnapshotItem[] = [];
  for (const tab of [...get(tabs)].sort(compareTabsByRecency)) {
    snapshot.push(...snapshotItemsForNote(tab.id, tab.id, tab.filename, tab.content.split("\n")));
  }
  return snapshot;
}

export async function buildActionSnapshotAllFiles(): Promise<ActionSnapshotItem[]> {
  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
  const snapshot: ActionSnapshotItem[] = [];
  for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
    snapshot.push(
      ...snapshotItemsForNote(filename, openTabIdByFilename.get(filename), filename, allSources[filename].split("\n")),
    );
  }
  return snapshot;
}

/** #96: everything "All Files" has, minus whatever's already visible in
 * "Open Tabs" — the notes you'd otherwise have to remember to reopen one by
 * one to check for leftover actions. Built by filtering the same snapshot
 * "All Files" already computes rather than a separate disk read, so the two
 * always agree on what counts as open. */
export async function buildActionSnapshotOtherNotes(): Promise<ActionSnapshotItem[]> {
  return (await buildActionSnapshotAllFiles()).filter((item) => item.tabId === undefined);
}

export function openActionDrawer() {
  actionSnapshot.set(buildActionSnapshotOpenTabs());
  modal.set("actions");
}

export function openActionDrawerDueView() {
  actionDrawerDueView.set(true);
  actionDrawerScopeRequest.set("all");
  const modalValue = get(modal);
  const pane = typeof document !== "undefined" ? document.querySelector(".actions-pane") : null;
  if (modalValue === "actions" && pane) {
    document.querySelector<HTMLElement>(".actions-pane .modal-input")?.focus();
  } else {
    openActionDrawer();
  }
}

/** Opens the file if it isn't already a tab (reusing the same open-or-
 * switch path the date picker uses), and returns the resulting tab id. */
async function ensureFileOpenAndGetTabId(filename: string): Promise<string> {
  const existing = get(tabs).find((t) => t.filename === filename);
  if (existing) return existing.id;
  await openOrCreateDatedFile(filename.replace(/\.txt$/, ""));
  const opened = get(tabs).find((t) => t.filename === filename);
  return opened!.id;
}

/** Ctrl+Space / Ctrl+Shift+Space (§145 adds the reverse direction) inside
 * the action drawer — deliberately Ctrl-only, no Mac alias (§143's
 * `shortcuts.ts` design note on `ActionDrawerModal.svelte` explains why:
 * this modal's own `Enter` handler already claims that key for a
 * different action, so a `Cmd+Enter` alias here would collide with it
 * the way the editor's own cycle-state binding doesn't). Deliberately
 * does NOT rebuild
 * `actionSnapshot` afterward: the drawer's item list is captured once when
 * it opens, so a completed item keeps its row (shown with the "done"
 * style) for as long as the drawer stays open, and only drops out on the
 * next fresh `openActionDrawer()` call. */
export function toggleActionLine(tabId: string, lineIdx: number, direction: 1 | -1 = 1, symbolCol?: number | null) {
  const list = get(tabs);
  const tab = list.find((t) => t.id === tabId);
  if (!tab) return;
  const lines = tab.content.split("\n");
  // A node of a line that holds several (a step, a parent) cycles its own symbol, not the line's first one.
  const updated =
    typeof symbolCol === "number"
      ? cycleActionSymbolAt(lines[lineIdx], symbolCol, direction)
      : cycleActionSymbol(lines[lineIdx], direction);
  if (updated === null) return;
  lines[lineIdx] = updated;
  tabs.set(writeTabContent(tabId, lines.join("\n"), list));
}

export function forwardActionToToday(tabId: string, lineIdx: number) {
  const list = get(tabs);
  const src = list.find((t) => t.id === tabId);
  if (!src) return;
  const lines = src.content.split("\n");
  const target = lines[lineIdx];
  // Indented (§50), same as everywhere else an action symbol is
  // recognized. Deliberately not extended to the `=> <symbol>` form
  // (§41) — forwarding a delegated consequence-action raises questions
  // (keep or drop the "=> " context?) outside this request's scope.
  const match = target.match(/^(\s*)([#>])(\s.*)$/);
  if (!match) return;
  const [, indent, , rest] = match;

  const todayDate = todayISO();
  const todayFilename = todayDate + ".txt";
  const srcDate = src.filename.replace(/\.txt$/, "");
  const srcSection = getSectionHeaderForLine(lines, lineIdx).trim();

  lines[lineIdx] = withToLink(indent + ">" + rest, forwardLink(">", todayDate, ""));
  // The forwarded copy starts fresh at today's top level — the source's
  // indentation was relative to structure (a bullet, a section) that has
  // no meaning in today's note.
  const taskText = withFromLink("#" + rest, forwardLink("<", srcDate, srcSection));

  let next = writeTabContent(tabId, lines.join("\n"), list);
  const todayTab = next.find((t) => t.filename === todayFilename);
  if (todayTab) {
    next = writeTabContent(todayTab.id, `${taskText}\n${todayTab.content}`, next);
  } else {
    updateNoteOnDisk(todayFilename, (base) => `${taskText}\n${base}`).catch(() => {
      // The source line was already marked as moved: put it back so the task isn't lost.
      tabs.set(writeTabContent(tabId, src.content, get(tabs)));
      showToast(get(t)("toast.actions.forwardFailed", undefined));
    });
  }
  tabs.set(next);
  showToast(get(t)("toast.actions.forwardedToToday", undefined));
}

/** Toggle/forward for an Action Drawer item that may come from "All Files"
 * mode and not have an open tab yet — opens it first if needed. */
export async function toggleActionLineItem(
  item: {
    tabId?: string;
    filename: string;
    lineIdx: number;
    symbolCol?: number | null;
    delegated?: boolean;
    whole?: boolean;
    line?: string;
  },
  direction: 1 | -1 = 1,
) {
  // A delegated part has no state of its own: cycling "the line" would change its parent's symbol instead.
  if (item.delegated && !item.whole) return;
  // A line not split into rows shows its innermost symbol, so that is the one that cycles.
  const symbolCol = item.symbolCol ?? (item.whole && item.line !== undefined ? innermostActionSymbolCol(item.line) : null);
  const tabId = item.tabId ?? (await ensureFileOpenAndGetTabId(item.filename));
  toggleActionLine(tabId, item.lineIdx, direction, symbolCol);
}

export async function forwardActionToTodayItem(item: {
  tabId?: string;
  filename: string;
  lineIdx: number;
  kind?: "line" | "step";
}) {
  // Forwarding a step is not supported: it would forward the parent's whole line.
  if (item.kind === "step") return;
  const tabId = item.tabId ?? (await ensureFileOpenAndGetTabId(item.filename));
  forwardActionToToday(tabId, item.lineIdx);
}
