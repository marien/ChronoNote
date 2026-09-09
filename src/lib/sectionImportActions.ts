/** Section import (Ctrl+Shift+I): paste a block of lines, each becomes a
 * new section in the active note. The pure text transform is in
 * `./sectionImport` (`linesToSections`); this is the controller side —
 * the modal trigger, the in-memory unsubmitted-draft (§33), and applying
 * the result to the active tab. Split out of `controller.ts` in the
 * v0.5.0 refactor. */
import { get } from "svelte/store";
import { activeTabId, modal, showToast, tabs } from "./stores";
import { writeTabContent } from "./persistence";
import { linesToSections } from "./sectionImport";

/** In-memory only (spec 1.1's "Zero Database" tenet) — text the drawer was
 * closed with before it was actually imported, so reopening the drawer can
 * offer it back up (§33). Never written to disk, and deliberately cleared
 * on a notes-directory switch by `directory.ts`, since a folder switch is
 * meant to feel like a clean slate. */
let importDraftText = "";

export function openSectionImport() {
  modal.set("sectionImport");
}

export function getImportDraftText(): string {
  return importDraftText;
}

/** Called when the drawer is dismissed without importing (Cancel, Escape,
 * or an outside click) — keeps unsubmitted text around for next time, or
 * clears a stale draft if the field was left empty. */
export function saveImportDraft(text: string) {
  importDraftText = text.trim() ? text : "";
}

export function clearImportDraft() {
  importDraftText = "";
}

export function importSectionsIntoActiveTab(rawText: string) {
  const tab = get(tabs).find((t) => t.id === get(activeTabId));
  if (!tab) return;
  const merged = linesToSections(tab.content, rawText);
  if (merged === tab.content) {
    showToast("Nothing to import.");
    return;
  }
  tabs.set(writeTabContent(tab.id, merged, get(tabs)));
  showToast("Sections imported.");
}
