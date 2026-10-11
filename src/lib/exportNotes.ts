import { get, writable } from "svelte/store";
import { save } from "@tauri-apps/plugin-dialog";
import { activeTabId, allNotesCache, backendKind, showToast, tabs } from "./stores";
import { exportModalOpen } from "./overlays";
import { refreshAllNotesCache } from "./persistence";
import { writeExportFile } from "./tauriApi";
import { noteToHtml, noteToMarkdown, notesToHtml, notesToMarkdown } from "./exportFormats";
import { t } from "./i18n";
import type { NoteTab } from "./types";

export const exportTargetTab = writable<NoteTab | null>(null);

export function openExportModal(targetTab?: NoteTab): void {
  exportTargetTab.set(targetTab ?? null);
  exportModalOpen.set(true);
}

export function closeExportModal(): void {
  exportModalOpen.set(false);
  exportTargetTab.set(null);
}

function getActiveOrTargetTab(target?: NoteTab | null): NoteTab | undefined {
  if (target) return target;
  const currentTabs = get(tabs);
  const activeId = get(activeTabId);
  return currentTabs.find((t) => t.id === activeId) ?? currentTabs[0];
}

async function getRangeNotes(from: string, to: string): Promise<{ date: string; text: string }[]> {
  await refreshAllNotesCache();
  const cache = get(allNotesCache);
  const out: { date: string; text: string }[] = [];

  for (const [filename, content] of Object.entries(cache)) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.txt$/);
    if (match) {
      const date = match[1];
      if (date >= from && date <= to) {
        out.push({ date, text: content });
      }
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export async function saveExport(options: {
  scope: "note" | "range";
  format: "md" | "html";
  fromDate: string;
  toDate: string;
  targetTab?: NoteTab | null;
}): Promise<void> {
  const { scope, format, fromDate, toDate, targetTab } = options;
  let content = "";
  let defaultName = "";

  if (scope === "note") {
    const tab = getActiveOrTargetTab(targetTab);
    if (!tab) return;
    const title = tab.isScratchpad ? tab.filename : tab.filename.replace(/\.txt$/, "");
    content = format === "md" ? noteToMarkdown(tab.content, title) : noteToHtml(tab.content, title);
    defaultName = `chrononote-${title}.${format}`;
  } else {
    const rangeNotes = await getRangeNotes(fromDate, toDate);
    content = format === "md" ? notesToMarkdown(rangeNotes) : notesToHtml(rangeNotes);
    defaultName = `chrononote-${fromDate}-to-${toDate}.${format}`;
  }

  if (get(backendKind) === "desktop") {
    try {
      const chosen = await save({
        defaultPath: defaultName,
        filters: [{ name: format === "md" ? "Markdown" : "HTML", extensions: [format] }],
      });
      if (chosen) {
        await writeExportFile(chosen, content);
        const filename = chosen.split(/[/\\]/).pop() ?? chosen;
        showToast(get(t)("toast.export.saved", { filename }));
        closeExportModal();
      }
    } catch (e) {
      console.error("Export save failed:", e);
    }
  } else {
    // Web app: download via Blob
    const mime = format === "md" ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(get(t)("toast.export.saved", { filename: defaultName }));
    closeExportModal();
  }
}

export async function copyExportMarkdown(options: {
  scope: "note" | "range";
  fromDate: string;
  toDate: string;
  targetTab?: NoteTab | null;
}): Promise<void> {
  const { scope, fromDate, toDate, targetTab } = options;
  let content = "";

  if (scope === "note") {
    const tab = getActiveOrTargetTab(targetTab);
    if (!tab) return;
    const title = tab.isScratchpad ? tab.filename : tab.filename.replace(/\.txt$/, "");
    content = noteToMarkdown(tab.content, title);
  } else {
    const rangeNotes = await getRangeNotes(fromDate, toDate);
    content = notesToMarkdown(rangeNotes);
  }

  await navigator.clipboard.writeText(content);
  showToast(get(t)("toast.export.copied", undefined));
  closeExportModal();
}

/** Prints a note by rendering it as HTML into a hidden iframe and triggering window.print(). */
export function printNote(text: string): void {
  const html = noteToHtml(text);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  iframe.srcdoc = html;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const timer = setTimeout(cleanup, 60000);

  iframe.addEventListener("load", () => {
    try {
      iframe.contentWindow?.addEventListener(
        "afterprint",
        () => {
          clearTimeout(timer);
          cleanup();
        },
        { once: true },
      );
      iframe.contentWindow?.print();
    } catch {
      // In tests or blocked print dialogs, print() may be unavailable or throw
    }
  });

  document.body.appendChild(iframe);
}

export function printActiveNote(): void {
  const currentTabs = get(tabs);
  const activeId = get(activeTabId);
  const active = currentTabs.find((t) => t.id === activeId) ?? currentTabs[0];
  if (active) {
    printNote(active.content);
  }
}
