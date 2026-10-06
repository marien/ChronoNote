/** Moving between the occurrences of the section the cursor is in (Alt+Left / Alt+Right), and the optional
 * `< (X/Y) >` hint after the section title.
 *
 * "Occurrences" are the dated notes that contain a section with the same date-insensitive title (the matching
 * Section History uses). The shortcut works anywhere in a section, on the title line included, and is not
 * not a setting; only the hint in the editor is (`occurrenceHint`, off by default, `AppConfig.occurrenceHint`).
 * Peek (`peek.ts`) steps with the same functions. */
import { get, writable } from "svelte/store";
import { extractSectionBody } from "./history";
import { refreshAllNotesCache } from "./persistence";
import { jumpToFileLine } from "./tabs";
import * as api from "./tauriApi";
import { activeTabId, allNotesCache, editorApi, showToast, tabs } from "./stores";
import { t } from "./i18n";
import { getSectionHeaderForLine, normalizeHeaderTitle, titleForMatching } from "./tokens";
import type { NoteTab } from "./types";

/** Setting: show `< (X/Y) >` after a section's title. */
export const occurrenceHint = writable(false);

export async function setOccurrenceHint(enabled: boolean): Promise<void> {
  occurrenceHint.set(enabled);
  try {
    await api.setOccurrenceHint(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.occurrenceHint", undefined));
  }
}

/** The matching form of the title of the section that contains `lineIdx`, or null outside any section. */
export function sectionTargetAt(content: string, lineIdx: number): string | null {
  const header = getSectionHeaderForLine(content.split("\n"), lineIdx);
  const target = titleForMatching(normalizeHeaderTitle(header));
  return target || null;
}

function sources(): Record<string, string> {
  const all: Record<string, string> = { ...get(allNotesCache) };
  for (const tab of get(tabs)) if (!tab.isScratchpad) all[tab.filename] = tab.content;
  return all;
}

function filesWithSection(all: Record<string, string>, target: string): string[] {
  return Object.keys(all)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
    .sort()
    .filter((f) => extractSectionBody(all[f].split("\n"), target) !== null);
}

/** Dated notes that contain the section, oldest first: disk notes overlaid with what the open tabs hold. */
export async function occurrenceFiles(target: string): Promise<string[]> {
  await refreshAllNotesCache();
  return filesWithSection(sources(), target);
}

/** Where `tab` sits among the occurrences of `target` (1-based), from what is loaded now. */
export async function occurrencePositionOf(
  target: string,
  tab: NoteTab,
): Promise<{ index: number; total: number; files: string[] } | null> {
  const files = await occurrenceFiles(target);
  const index = files.indexOf(tab.filename);
  return index >= 0 ? { index: index + 1, total: files.length, files } : null;
}

/** Shows the previous / next occurrence of `target` in the editor (opening its note when needed). Returns the tab
 * now showing and whether this call had to open it, or null when there is no such occurrence. */
export async function stepToOccurrence(
  target: string,
  direction: -1 | 1,
): Promise<{ tabId: string; filename: string; opened: boolean } | null> {
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!tab) return null;
  const pos = await occurrencePositionOf(target, tab);
  if (!pos) return null;
  const next = pos.files[pos.index - 1 + direction];
  if (!next) return null;
  const openTab = get(tabs).find((x) => x.filename === next && !x.isScratchpad);
  const sourceLines = openTab?.content.split("\n") ?? (get(allNotesCache)[next] ?? "").split("\n");
  const body = extractSectionBody(sourceLines, target);
  await jumpToFileLine({ tabId: openTab?.id, filename: next, lineIdx: body ? body.startLineIdx : 0 });
  const shown = get(tabs).find((x) => x.filename === next && !x.isScratchpad);
  return shown ? { tabId: shown.id, filename: next, opened: !openTab } : null;
}

/** Whether Alt+Left / Alt+Right should be taken by us right now: the cursor is in a section that has (or may have,
 * while the notes are still loading) other occurrences. Otherwise the key is left alone. Synchronous, because a
 * key handler has to decide on the spot whether to keep the key from the browser/editor. */
export function occurrenceKeyApplies(): boolean {
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!tab || !editorApi) return false;
  const target = sectionTargetAt(tab.content, editorApi.getCursorLineIdx());
  if (!target) return false;
  if (Object.keys(get(allNotesCache)).length === 0) return true; // not loaded yet: assume yes, the step decides
  return filesWithSection(sources(), target).length > 1;
}

/** Alt+Left (-1) / Alt+Right (+1) in the main window. Peek registers its own stepper (it also tidies tabs). */
export async function stepSectionOccurrence(direction: -1 | 1): Promise<void> {
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!tab || !editorApi) return;
  const target = sectionTargetAt(tab.content, editorApi.getCursorLineIdx());
  if (target) await stepToOccurrence(target, direction);
}

/** The section the caret is in (matching form), reported by the editor; null outside any section. */
export const cursorSection = writable<string | null>(null);
/** What the hint shows: the section the caret is in and where the shown note sits among its occurrences. Null when
 * the hint is off, the section occurs only here, or nothing is known yet. */
export const occurrenceInfo = writable<{ target: string; index: number; total: number } | null>(null);

/** Keeps `occurrenceInfo` up to date while the hint is on. Call once at startup; returns a cleanup. Recomputing reads
 * every note's section, so it waits for typing to pause. */
export function wireOccurrenceHint(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0;
  const recompute = async () => {
    const mine = ++run;
    const target = get(cursorSection);
    const tab = get(tabs).find((x) => x.id === get(activeTabId));
    if (!get(occurrenceHint) || !target || !tab || tab.isScratchpad) {
      occurrenceInfo.set(null);
      return;
    }
    const pos = await occurrencePositionOf(target, tab);
    if (mine !== run) return; // a newer request superseded this one
    occurrenceInfo.set(pos && pos.total > 1 ? { target, index: pos.index, total: pos.total } : null);
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void recompute(), 150);
  };
  const unsubs = [occurrenceHint.subscribe(schedule), cursorSection.subscribe(schedule), activeTabId.subscribe(schedule)];
  // Typing changes the open note (a new title, a section that now exists elsewhere): only matters while the hint is on.
  unsubs.push(tabs.subscribe(() => get(occurrenceHint) && schedule()));
  return () => {
    clearTimeout(timer);
    unsubs.forEach((u) => u());
  };
}
