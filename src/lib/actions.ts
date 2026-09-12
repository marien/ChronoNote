/** The Action Drawer (Ctrl/Cmd+Shift+A): snapshot every action line across
 * open tabs or all files, toggle an action's state, or forward it to
 * today's top priorities. Split out of `controller.ts` in the v0.5.0
 * refactor. Depends on stores + persistence + tabs + tabSort + tokens. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { actionSnapshot, allNotesCache, modal, showToast, tabs } from "./stores";
import { refreshAllNotesCache, writeNoteAndInvalidateCache, writeTabContent } from "./persistence";
import { openOrCreateDatedFile } from "./tabs";
import { compareTabsByRecency, sortFilenamesByRecency } from "./tabSort";
import { cycleActionSymbol, getSectionHeaderForLine, normalizeHeaderTitle } from "./tokens";
import { todayISO } from "./date";
import type { ActionSnapshotItem } from "./types";

/** "Action lines" the drawer surfaces: all four action states (`# `/
 * `v `/`> `/`x `, standalone or indented, §50) and both `=> ` forms — a
 * consequence-action's own inner symbol (`=> <symbol>`, §41) and plain
 * delegated-to-a-person lines (`=> @name`). "Only Open" (§44/§67) is what
 * narrows this down to `#` alone; inclusion here covers every state so
 * turning that toggle off reveals `v `/`x ` lines too (previously
 * excluded from the drawer outright, regardless of the toggle). */
function isActionLine(line: string): boolean {
  return /^\s*[#>vx]\s/.test(line) || line.includes("=> @") || /=>\s[#>vx]\s/.test(line);
}

export function buildActionSnapshotOpenTabs(): ActionSnapshotItem[] {
  const snapshot: ActionSnapshotItem[] = [];
  for (const tab of [...get(tabs)].sort(compareTabsByRecency)) {
    const lines = tab.content.split("\n");
    lines.forEach((line, lineIdx) => {
      if (isActionLine(line)) {
        snapshot.push({
          id: `${tab.id}-${lineIdx}`,
          tabId: tab.id,
          filename: tab.filename,
          lineIdx,
          line,
          header: normalizeHeaderTitle(getSectionHeaderForLine(lines, lineIdx)),
        });
      }
    });
  }
  return snapshot;
}

export async function buildActionSnapshotAllFiles(): Promise<ActionSnapshotItem[]> {
  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
  const snapshot: ActionSnapshotItem[] = [];
  for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
    const lines = allSources[filename].split("\n");
    lines.forEach((line, lineIdx) => {
      if (isActionLine(line)) {
        snapshot.push({
          id: `${filename}-${lineIdx}`,
          tabId: openTabIdByFilename.get(filename),
          filename,
          lineIdx,
          line,
          header: normalizeHeaderTitle(getSectionHeaderForLine(lines, lineIdx)),
        });
      }
    });
  }
  return snapshot;
}

export function openActionDrawer() {
  actionSnapshot.set(buildActionSnapshotOpenTabs());
  modal.set("actions");
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

/** Ctrl+Space inside the action drawer — deliberately Ctrl-only, no Mac
 * alias (§143's `shortcuts.ts` design note on `ActionDrawerModal.svelte`
 * explains why: this modal's own `Enter` handler already claims that key
 * for a different action, so a `Cmd+Enter` alias here would collide with
 * it the way the editor's own cycle-state binding doesn't). Deliberately
 * does NOT rebuild
 * `actionSnapshot` afterward: the drawer's item list is captured once when
 * it opens, so a completed item keeps its row (shown with the "done"
 * style) for as long as the drawer stays open, and only drops out on the
 * next fresh `openActionDrawer()` call. */
export function toggleActionLine(tabId: string, lineIdx: number) {
  const list = get(tabs);
  const tab = list.find((t) => t.id === tabId);
  if (!tab) return;
  const lines = tab.content.split("\n");
  const updated = cycleActionSymbol(lines[lineIdx]);
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

  lines[lineIdx] = indent + ">" + rest;
  // The forwarded copy starts fresh at today's top level — the source's
  // indentation was relative to structure (a bullet, a section) that has
  // no meaning in today's note.
  const taskText = "#" + rest;
  const todayFilename = todayISO() + ".txt";

  let next = writeTabContent(tabId, lines.join("\n"), list);
  const todayTab = next.find((t) => t.filename === todayFilename);
  if (todayTab) {
    next = writeTabContent(todayTab.id, `${taskText}\n${todayTab.content}`, next);
  } else {
    api.readNote(todayFilename).then((existing) => {
      const base = existing ?? "";
      writeNoteAndInvalidateCache(todayFilename, `${taskText}\n${base}`).catch(() => {});
    });
  }
  tabs.set(next);
  showToast("Forwarded to today's top priorities!");
}

/** Toggle/forward for an Action Drawer item that may come from "All Files"
 * mode and not have an open tab yet — opens it first if needed. */
export async function toggleActionLineItem(item: { tabId?: string; filename: string; lineIdx: number }) {
  const tabId = item.tabId ?? (await ensureFileOpenAndGetTabId(item.filename));
  toggleActionLine(tabId, item.lineIdx);
}

export async function forwardActionToTodayItem(item: { tabId?: string; filename: string; lineIdx: number }) {
  const tabId = item.tabId ?? (await ensureFileOpenAndGetTabId(item.filename));
  forwardActionToToday(tabId, item.lineIdx);
}
