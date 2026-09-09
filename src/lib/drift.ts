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
let recheckQueued = false;

/** The current active *non-scratchpad* tab plus its recorded clean-hash
 * baseline, or `null` when there's nothing to check (no active tab, a
 * scratchpad, a conflict prompt already open, or no baseline yet). Read
 * fresh — never held across an `await`, since the store can change under
 * us while an IPC is in flight. */
function driftTarget(): { id: string; filename: string; content: string; clean: string } | null {
  if (get(modal) === "conflict") return null;
  const id = get(activeTabId);
  const tab = get(tabs).find((t) => t.id === id);
  if (!tab || tab.isScratchpad) return null;
  const clean = getTabCleanHash(id);
  if (!clean) return null;
  return { id, filename: tab.filename, content: tab.content, clean };
}

/** The core of the drift check — run for the active tab on the triggers
 * `boot.ts` wires. Cheap no-op for scratchpads, tabs with no baseline
 * yet, and the common "nothing changed" case (one `get_file_metadata`
 * IPC). Re-entrant calls are coalesced into one follow-up run so a burst
 * of tab switches still checks whatever tab you land on; every store read
 * is re-taken after each `await` so a mid-check edit or tab switch can't
 * cause a stale decision. */
export async function checkActiveTabForDrift(): Promise<void> {
  if (checkInFlight) {
    recheckQueued = true;
    return;
  }
  const start = driftTarget();
  if (!start) return;

  checkInFlight = true;
  try {
    let diskHash: string | null;
    try {
      diskHash = (await api.getFileMetadata(start.filename)).contentHash;
    } catch {
      return; // transient read failure — the next trigger retries
    }

    // Re-validate against the *current* store state, not the snapshot we
    // took before the IPC.
    const now = driftTarget();
    if (!now || now.id !== start.id || now.clean !== start.clean) return;

    if (diskHash === now.clean) return; // Case A — disk matches our baseline

    if (diskHash === null) {
      // File deleted on disk. Either way — local edits or not — keep the
      // tab's content, drop the baseline so it acts like a fresh unsaved
      // note, and let the next save re-create the file.
      clearTabCleanHash(now.id);
      showToast(`${now.filename} was deleted on disk — save to re-create it`);
      return;
    }

    const mine = await sha256Hex(now.content);
    const after = driftTarget();
    // Bail if anything moved while we hashed: a different tab, a landed
    // save (new baseline), or an edit since we read `now.content`.
    if (!after || after.id !== now.id || after.clean !== now.clean || after.content !== now.content) return;

    if (mine === now.clean) {
      // Case B — no local edits, disk moved. Silent reload.
      const { content } = await api.readNoteWithMetadata(now.filename);
      if (driftTarget()?.id !== now.id) return;
      applyContent(now.id, content ?? "", diskHash);
      showToast(`Reloaded ${now.filename} — it changed on disk`);
      return;
    }

    // Case C — local edits AND an external change. Freeze this tab's
    // autosave so it can't overwrite the disk version while the user
    // decides, then ask.
    cancelScheduledSave(now.id);
    const { content } = await api.readNoteWithMetadata(now.filename);
    if (driftTarget()?.id !== now.id) return;
    conflictInfo.set({ tabId: now.id, filename: now.filename, diskContent: content ?? "", diskHash });
    modal.set("conflict");
  } finally {
    checkInFlight = false;
    if (recheckQueued) {
      recheckQueued = false;
      void checkActiveTabForDrift();
    }
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
