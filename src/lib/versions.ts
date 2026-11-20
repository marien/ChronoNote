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
  scheduleCloudPush,
} from "./persistence";
import { ensureLoaded } from "./notesIndex";
import { t } from "./i18n";
import type { TranslationKey, TranslationParams } from "./i18n/schema";

export type TranslateFn = <K extends TranslationKey>(key: K, params?: TranslationParams[K]) => string;

/** Format a version's saved timestamp as a compact relative age ("just now", "45 min ago", "1 h ago", "2 d ago"). */
export function formatVersionRelativeTime(
  ms: number,
  translate: TranslateFn = (key, params) => get(t)(key, params),
  now: number = Date.now(),
): string {
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000));
  if (diffSec < 60) return translate("versions.ago.justNow", undefined);
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return translate("versions.ago.minutes", { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return translate("versions.ago.hours", { count: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  return translate("versions.ago.days", { count: diffDay });
}

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
  void ensureLoaded();

  modal.set("none");
  showToast(get(t)("toast.versions.restored", { filename }));
}
