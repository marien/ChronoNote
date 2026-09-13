/** Notes-directory switching (§39). Treated as project/scope switching:
 * everything currently loaded (open tabs, the search / action / history
 * caches) is scoped to the old directory and goes stale the moment
 * `notesDir` changes, so a confirmed switch does a full workspace reset
 * rather than just repointing config. The one thing the gate protects is
 * unpromoted scratchpad content — the only state that would actually be
 * destroyed, since everything else is already saved to the old folder.
 * Split out of `controller.ts` in the v0.5.0 refactor. */
import { get } from "svelte/store";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import * as api from "./tauriApi";
import {
  actionSnapshot,
  activeTabId,
  allNotesCache,
  clearAllEditorViewState,
  clearAllTabCleanHashes,
  conflictInfo,
  historyItems,
  historyOccurrences,
  historyPreviousOccurrence,
  historyTargetHeader,
  modal,
  notesDir,
  pendingNotesDirSwitch,
  recentNotesDirs,
  scratchpadGateContext,
  searchResultsStore,
  showToast,
  tabs,
  unsavedScratchpadNames,
} from "./stores";
import { flushSave, invalidateDiskNotesCache } from "./persistence";
import { restoreOrBootstrapTabs } from "./boot";
import { clearImportDraft } from "./sectionImportActions";

/** Shared by the Browse dialog and by picking a recent folder directly
 * (§39) — both need the same unsaved-scratchpad safety gate before a
 * full workspace reset. */
async function switchNotesDirectoryWithSafetyCheck(path: string) {
  const unresolved = get(tabs).filter((t) => t.isScratchpad && t.content.trim() !== "");
  if (unresolved.length > 0) {
    pendingNotesDirSwitch.set(path);
    unsavedScratchpadNames.set(unresolved.map((t) => t.filename));
    scratchpadGateContext.set("switch");
    modal.set("unsavedScratchpads");
    return;
  }
  await performDirectorySwitch(path);
}

export async function pickAndSwitchNotesDirectory() {
  const current = get(notesDir);
  const picked = await openFolderDialog({ directory: true, defaultPath: current || undefined });
  if (!picked || Array.isArray(picked)) return;
  await switchNotesDirectoryWithSafetyCheck(picked);
}

/** Settings' recent-folders list (§39) — same safety flow as Browse, just
 * skipping the native dialog since the path is already known. */
export async function switchToRecentDirectory(path: string) {
  await switchNotesDirectoryWithSafetyCheck(path);
}

export function cancelDirectorySwitch() {
  pendingNotesDirSwitch.set(null);
  unsavedScratchpadNames.set([]);
  scratchpadGateContext.set(null);
  modal.set("settings");
}

export async function confirmDiscardAndSwitch() {
  const path = get(pendingNotesDirSwitch);
  pendingNotesDirSwitch.set(null);
  unsavedScratchpadNames.set([]);
  scratchpadGateContext.set(null);
  if (path) await performDirectorySwitch(path);
}

async function performDirectorySwitch(path: string) {
  for (const t of get(tabs)) {
    if (!t.isScratchpad) flushSave(t.id);
  }
  const cfg = await api.setNotesDir(path);
  notesDir.set(cfg.notesDir);
  recentNotesDirs.set(cfg.recentNotesDirs);

  clearImportDraft();
  invalidateDiskNotesCache();
  allNotesCache.set({});
  actionSnapshot.set([]);
  historyItems.set([]);
  historyOccurrences.set([]);
  historyPreviousOccurrence.set(null);
  historyTargetHeader.set("");
  searchResultsStore.set([]);
  conflictInfo.set(null);
  tabs.set([]);
  activeTabId.set("");
  clearAllEditorViewState();
  clearAllTabCleanHashes();

  await restoreOrBootstrapTabs();
  modal.set("none");
  showToast(`Switched notes directory to ${path}`);
}
