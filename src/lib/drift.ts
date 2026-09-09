/** §94: external-modification detection. When a note file changes on disk
 * outside ChronoNote (another editor, a cloud-sync client), the tab
 * showing it is stale. On every tab-activate and every time the window
 * regains focus, the *active* tab's on-disk hash is compared to the
 * "clean" baseline recorded at its last load or save:
 *
 *   - hash unchanged           → nothing (Case A)
 *   - changed, no local edits  → silent reload + a toast (Case B)
 *   - changed, with local edits → the conflict prompt (Case C)
 *
 * The baseline hashes live in `stores.ts` (`markTabClean` / friends);
 * `boot.ts` wires the two triggers. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import {
  activeTabId,
  conflictInfo,
  editorApi,
  getTabCleanHash,
  markTabClean,
  clearTabCleanHash,
  modal,
  showToast,
  tabs,
} from "./stores";
import { cancelScheduledSave } from "./persistence";

/** SHA-256 hex of a string — same digest Rust's `sha2` produces, so an
 * in-memory hash is directly comparable to a `FileMetadata.contentHash`
 * from disk. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Replace a tab's content with what's on disk and re-baseline it. Pushes
 * into the live editor when it's the active tab. */
function applyContent(tabId: string, content: string, hash: string | null) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  const next = [...list];
  next[idx] = { ...next[idx], content };
  tabs.set(next);
  if (hash) markTabClean(tabId, hash);
  if (tabId === get(activeTabId) && editorApi) editorApi.setContent(content);
}

let checkInFlight = false;

/** The core of the drift check — run for the active tab on the triggers
 * `boot.ts` wires. Cheap no-op for scratchpads, tabs with no baseline
 * yet, and the common "nothing changed" case (one `get_file_metadata`
 * IPC). Guarded against re-entry and against the active tab changing
 * mid-check. */
export async function checkActiveTabForDrift(): Promise<void> {
  if (checkInFlight) return;
  const activeId = get(activeTabId);
  const tab = get(tabs).find((t) => t.id === activeId);
  if (!tab || tab.isScratchpad) return;
  // Don't stack a second prompt on top of an unresolved one.
  if (get(modal) === "conflict") return;
  const clean = getTabCleanHash(tab.id);
  if (!clean) return; // no baseline recorded — can't judge a change

  checkInFlight = true;
  try {
    let diskHash: string | null;
    try {
      diskHash = (await api.getFileMetadata(tab.filename)).contentHash;
    } catch {
      return; // metadata read failed — try again on the next trigger
    }
    if (diskHash === clean) return; // Case A — disk matches our baseline
    if (get(activeTabId) !== tab.id) return; // user moved on while we awaited

    if (diskHash === null) {
      // The file was deleted on disk. Whether or not there are local
      // edits, the safe move is the same: keep whatever's in the tab,
      // drop the baseline so it behaves like a fresh unsaved note, and
      // let the next save re-create the file.
      clearTabCleanHash(tab.id);
      showToast(`${tab.filename} was deleted on disk — save to re-create it`);
      return;
    }

    const mine = await sha256Hex(tab.content);
    if (get(activeTabId) !== tab.id || get(modal) === "conflict") return;

    if (mine === clean) {
      // Case B — no local edits, disk moved. Silent reload.
      const { content } = await api.readNoteWithMetadata(tab.filename);
      applyContent(tab.id, content ?? "", diskHash);
      showToast(`Reloaded ${tab.filename} — it changed on disk`);
      return;
    }

    // Case C — local edits AND an external change. Freeze this tab's
    // autosave so it can't overwrite the disk version while the user
    // decides, then ask.
    cancelScheduledSave(tab.id);
    const { content } = await api.readNoteWithMetadata(tab.filename);
    conflictInfo.set({
      tabId: tab.id,
      filename: tab.filename,
      diskContent: content ?? "",
      diskHash,
    });
    modal.set("conflict");
  } finally {
    checkInFlight = false;
  }
}

// --- Conflict-prompt resolvers (ConflictModal buttons) ----------------

function endConflict() {
  conflictInfo.set(null);
  modal.set("none");
}

export async function resolveConflictKeepDisk(): Promise<void> {
  const c = get(conflictInfo);
  endConflict();
  if (!c) return;
  applyContent(c.tabId, c.diskContent, c.diskHash);
  showToast(`Reloaded ${c.filename} from disk`);
}

export async function resolveConflictKeepMine(): Promise<void> {
  const c = get(conflictInfo);
  endConflict();
  if (!c) return;
  const tab = get(tabs).find((t) => t.id === c.tabId);
  if (!tab) return;
  try {
    // Compare-and-swap on the hash we showed the user, so a *third*
    // change since then re-opens the prompt instead of being clobbered.
    const meta = await api.writeNote(c.filename, tab.content, c.diskHash);
    markTabClean(c.tabId, meta.contentHash);
    showToast(`Kept your version of ${c.filename}`);
  } catch {
    showToast(`${c.filename} changed again on disk`);
    await checkActiveTabForDrift();
  }
}

export async function resolveConflictSaveCopy(): Promise<void> {
  const c = get(conflictInfo);
  endConflict();
  if (!c) return;
  const tab = get(tabs).find((t) => t.id === c.tabId);
  if (!tab) return;
  const stem = c.filename.replace(/\.txt$/, "");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `${stem}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.txt`;
  try {
    await api.writeConflictCopy(name, tab.content);
    showToast(`Saved your version as ${name}`);
  } catch {
    showToast("Couldn't save the copy — nothing changed");
    return;
  }
  applyContent(c.tabId, c.diskContent, c.diskHash);
}
