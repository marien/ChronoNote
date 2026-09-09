/** Everything that writes note content to disk and keeps the "all notes"
 * read-cache honest. Split out of `controller.ts` in the v0.5.0 refactor;
 * `controller.ts` re-exports it. Depends only on `./stores`, `./tauriApi`
 * and types — no cycle back to `controller.ts`. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { allNotesCache, editorApi, activeTabId, markTabClean, saveState, showToast, tabs } from "./stores";
import type { NoteTab } from "./types";

// --- Debounced autosave on typing, immediate on deliberate actions ---

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Every disk write currently in flight (`api.writeNote` promise not yet
 * settled). `flushAllPendingSaves` awaits these so the app-close barrier
 * (§93) can guarantee nothing typed is still on its way to disk when the
 * window is destroyed. */
const inFlightWrites = new Set<Promise<unknown>>();

/** Queue a disk write for `tab` 400ms out, replacing any pending write
 * for the same tab. Scratchpads never touch disk. */
export function scheduleSave(tab: NoteTab) {
  if (tab.isScratchpad) return;
  // §100: the moment a real note has unsaved keystrokes it reads as
  // "saving" (pending), settling to "saved" once the debounced write
  // below lands.
  saveState.set("saving");
  clearTimeout(saveTimers[tab.id]);
  saveTimers[tab.id] = setTimeout(() => {
    delete saveTimers[tab.id];
    writeNoteAndInvalidateCache(tab.filename, tab.content).catch(() => showToast("Failed to save note"));
  }, 400);
}

/** Cancel any pending debounced write for `tabId` and write its current
 * content now — called before switching away from or closing a tab so no
 * keystroke is lost. */
export function flushSave(tabId: string) {
  const timer = saveTimers[tabId];
  if (timer) {
    clearTimeout(timer);
    delete saveTimers[tabId];
  }
  const tab = get(tabs).find((t) => t.id === tabId);
  if (tab && !tab.isScratchpad) {
    writeNoteAndInvalidateCache(tab.filename, tab.content).catch(() => showToast("Failed to save note"));
  }
}

/** Drop a tab's pending debounced write *without* writing it — used while
 * a §94 conflict prompt is open for that tab, so a stale autosave can't
 * clobber the disk version out from under the user's decision. */
export function cancelScheduledSave(tabId: string) {
  const timer = saveTimers[tabId];
  if (timer) {
    clearTimeout(timer);
    delete saveTimers[tabId];
  }
}

/** App-close barrier (§93): fire every debounced write immediately, then
 * wait for those plus anything already mid-flight to finish. Resolves
 * once the disk is caught up with every open note's in-memory content —
 * the window can then be destroyed with no risk of losing the last few
 * keystrokes. Never rejects (individual write failures already surface a
 * toast); a quit shouldn't hang on a failing disk. */
export async function flushAllPendingSaves(): Promise<void> {
  for (const tabId of Object.keys(saveTimers)) flushSave(tabId);
  await Promise.allSettled([...inFlightWrites]);
}

// --- The "all notes" disk read-cache (§38) ---

/** The expensive part of "all notes" is the disk read — the merge with
 * currently-open tabs' live (possibly unsaved) content below is cheap and
 * always re-run, so a cached disk layer can't go stale with respect to
 * anything actually open right now. `null` means "needs a fresh read";
 * invalidated by `writeNoteAndInvalidateCache()` and on a directory
 * switch. (§38 — this used to unconditionally re-read every file on every
 * single Action Drawer / Search / Date-picker / History open.) */
let diskNotesCacheRaw: Record<string, string> | null = null;

/** Force the next `refreshAllNotesCache()` to re-read from disk — used on
 * a notes-directory switch, where the whole disk layer is a different
 * folder. */
export function invalidateDiskNotesCache() {
  diskNotesCacheRaw = null;
}

export async function refreshAllNotesCache() {
  if (diskNotesCacheRaw === null) {
    const entries = await api.readAllNotes();
    diskNotesCacheRaw = {};
    for (const [fn, content] of entries) diskNotesCacheRaw[fn] = content;
  }
  const map: Record<string, string> = { ...diskNotesCacheRaw };
  for (const t of get(tabs)) if (!t.isScratchpad) map[t.filename] = t.content;
  allNotesCache.set(map);
}

/** All disk writes should go through this rather than calling
 * `api.writeNote()` directly, so the disk-read cache above knows when it
 * might be stale. Skips invalidation when the written filename already
 * has an open, non-scratchpad tab — that case is always correctly
 * reflected by `refreshAllNotesCache()`'s live-tab overlay regardless of
 * the disk layer's staleness, so ordinary autosave (the overwhelming
 * majority of writes) doesn't pay for a refetch. Only a write for a
 * filename with *no* open tab — `promoteScratchpad`'s brand-new today
 * file, `forwardActionToToday`'s no-open-tab fallback — actually needs to
 * invalidate. */
export function writeNoteAndInvalidateCache(filename: string, content: string): Promise<void> {
  const hasOpenTab = get(tabs).some((t) => !t.isScratchpad && t.filename === filename);
  if (!hasOpenTab) diskNotesCacheRaw = null;
  const p = api.writeNote(filename, content);
  inFlightWrites.add(p);
  saveState.set("saving"); // §100: ambient status-bar indicator
  return p.then(
    (meta) => {
      inFlightWrites.delete(p);
      // Only settle to "saved" once nothing else is still writing — a
      // burst of debounced writes shouldn't flicker saving→saved→saving.
      if (inFlightWrites.size === 0) saveState.set("saved");
      // §94: the disk now matches this content — refresh the tab's clean
      // baseline so a later external edit is detected against what we
      // actually last wrote, not a stale hash.
      const tab = get(tabs).find((t) => !t.isScratchpad && t.filename === filename);
      if (tab) markTabClean(tab.id, meta?.contentHash);
    },
    (err) => {
      inFlightWrites.delete(p);
      saveState.set("error");
      throw err; // callers still see the failure (their `.catch` toasts it)
    },
  );
}

// --- Editing ---

export function updateActiveTabContent(newContent: string) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === get(activeTabId));
  if (idx === -1) return;
  const updated = { ...list[idx], content: newContent };
  const next = [...list];
  next[idx] = updated;
  tabs.set(next);
  scheduleSave(updated);
}

/** Set a tab's content, persist it, and — if it's the active tab — push
 * the new text into the live editor. Returns the new tab list (the
 * caller does the `tabs.set`). Used by every path that rewrites a note
 * from outside the editor: the Action Drawer, section import, the
 * copy/paste-forward defer. */
export function writeTabContent(tabId: string, newContent: string, list: NoteTab[]): NoteTab[] {
  const idx = list.findIndex((t) => t.id === tabId);
  if (idx === -1) return list;
  const next = [...list];
  next[idx] = { ...next[idx], content: newContent };
  if (!next[idx].isScratchpad) {
    writeNoteAndInvalidateCache(next[idx].filename, newContent).catch(() => showToast("Failed to save note"));
  }
  if (tabId === get(activeTabId) && editorApi) editorApi.setContent(newContent);
  return next;
}
