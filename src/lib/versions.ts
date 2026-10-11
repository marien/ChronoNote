import { writable, get } from "svelte/store";
import type { NoteVersion } from "./generated/tauri-types";
import * as api from "./tauriApi";
import {
  tabs,
  activeTabId,
  editorApi,
  markTabClean,
  modal,
  showToast,
} from "./stores";
import {
  cancelScheduledSave,
  invalidateDiskNotesCache,
  refreshAllNotesCache,
  scheduleCloudPush,
} from "./persistence";
import { t } from "./i18n";

export const versionsTargetFilename = writable<string | null>(null);
export const versionsList = writable<NoteVersion[]>([]);
export const versionsCurrentText = writable<string>("");

export async function openVersions(filename: string): Promise<void> {
  versionsTargetFilename.set(filename);

  // Read current note text: from open tab if present, else via api.readNote
  const openTab = get(tabs).find((t) => !t.isScratchpad && t.filename === filename);
  let currentText = "";
  if (openTab) {
    currentText = openTab.content;
  } else {
    currentText = (await api.readNote(filename)) ?? "";
  }
  versionsCurrentText.set(currentText);

  // Fetch versions
  const list = await api.listVersions(filename);
  versionsList.set(list);

  // Open modal
  modal.set("versions");
}

export async function restoreVersion(filename: string, name: string): Promise<void> {
  const meta = await api.restoreVersion(filename, name);
  const versionText = await api.readNote(filename);
  const restoredContent = versionText ?? "";

  const list = get(tabs);
  const openTab = list.find((t) => !t.isScratchpad && t.filename === filename);
  if (openTab) {
    cancelScheduledSave(openTab.id);
    const idx = list.findIndex((t) => t.id === openTab.id);
    if (idx !== -1) {
      const next = [...list];
      next[idx] = { ...next[idx], content: restoredContent };
      tabs.set(next);
    }
    if (meta.contentHash) {
      markTabClean(openTab.id, meta.contentHash);
    }
    if (openTab.id === get(activeTabId) && editorApi) {
      editorApi.setContent(restoredContent);
    }
  }

  invalidateDiskNotesCache();
  scheduleCloudPush();
  void refreshAllNotesCache();

  modal.set("none");
  showToast(get(t)("toast.versions.restored", { filename }));
}
