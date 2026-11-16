/** The disk layer of "all notes": what the notes folder held when it was last read, kept in memory.
 *
 * Moved here from `persistence.ts` (R1 / S1). It keeps two maps, and the functions below are the only way to
 * change either:
 * - `raw`: exactly the old `diskNotesCacheRaw`. `null` means "must be read again"; every hook in
 *   `persistence.ts` checks it as before.
 * - `shown`: the disk texts the notes index uses. Every change of it bumps `diskVersion`.
 *
 * `raw` and `shown` differ in three places (the table in the S1 brief): a note closed or updated while `raw` is
 * null is still `shown`; `invalidateDiskLayer()` empties `raw` but leaves `shown` (the old texts stay until the
 * next read); a prefetched note goes into `shown` only. */
import { writable } from "svelte/store";
import * as api from "../tauriApi";

let raw: Record<string, string> | null = null;
let shown: Record<string, string> = {};
/** True from the first full read until a folder switch (`clearDiskLayer`); `invalidateDiskLayer` keeps it. */
let shownLoaded = false;
/** Goes up when `invalidateDiskLayer()`, `clearDiskLayer()` or `readAllIntoDiskLayer()` runs. A read that started
 * under an older epoch has been overtaken: what it brings is out of date (a folder switch, an invalidation, a
 * newer full read) and must not land. */
let epoch = 0;

/** The current epoch, for a reader that must tell whether the layer was invalidated, cleared or read in full
 * while it waited (`prefetchNotesForDates`). */
export function diskEpoch(): number {
  return epoch;
}

/** Goes up on every change of `shown` (and of `shownLoaded`). The notes index listens to it. */
export const diskVersion = writable<number>(0);

function bump() {
  diskVersion.update((n) => n + 1);
}

/** True when `raw` holds a read of the folder (it is not waiting for a fresh read). */
export function isDiskLoaded(): boolean {
  return raw !== null;
}

/** True when the index has a full read to show: from the first read until a folder switch. */
export function isShownLoaded(): boolean {
  return shownLoaded;
}

/** The disk texts the index uses. The live object, for reading only: change it through the functions below. */
export function shownNotes(): Readonly<Record<string, string>> {
  return shown;
}

/** A full read arrived: both maps are replaced by exactly these entries (a file gone from disk leaves `shown`). */
export function readAllIntoDiskLayer(entries: Iterable<readonly [string, string]>): void {
  const nextRaw: Record<string, string> = {};
  const nextShown: Record<string, string> = {};
  for (const [fn, content] of entries) {
    nextRaw[fn] = content;
    nextShown[fn] = content;
  }
  raw = nextRaw;
  shown = nextShown;
  shownLoaded = true;
  epoch++;
  bump();
}

/** A note's disk text is now `content`. `raw` takes it only when it holds a read; `shown` always does. */
export function setDiskNote(filename: string, content: string): void {
  if (raw !== null) raw[filename] = content;
  shown[filename] = content;
  bump();
}

/** A note is gone from disk. */
export function removeDiskNote(filename: string): void {
  if (raw !== null) delete raw[filename];
  delete shown[filename];
  bump();
}

/** A note the date picker read on its own: `shown` takes it only when it does not know that note yet. */
export function addPrefetched(filename: string, content: string): void {
  if (filename in shown) return;
  shown[filename] = content;
  bump();
}

/** The next `ensureLoaded()` reads the folder again. The old texts stay `shown` until then. */
export function invalidateDiskLayer(): void {
  raw = null;
  epoch++;
}

/** A folder switch: nothing is known about the new folder. */
export function clearDiskLayer(): void {
  raw = null;
  shown = {};
  shownLoaded = false;
  epoch++;
  bump();
}

/** A copy of `raw` (null = must be read again). */
export function diskSnapshot(): Record<string, string> | null {
  return raw === null ? null : { ...raw };
}

/** For tests only: "these files are on disk and have been read". */
export function seedDiskNotesForTest(notes: Record<string, string>): void {
  readAllIntoDiskLayer(Object.entries(notes));
}

/** #62: `boot.ts` fires a background `ensureLoaded()` right at startup, which can race a user opening
 * History/Actions/Search before it resolves. Without this guard both callers would see `raw` still null and each
 * start their own `api.readAllNotes()`: callers that ask at the same time join the read in flight. A read started
 * under an older `epoch` is not joined (see `ensureLoaded`). */
let diskReadInFlight: { epoch: number; promise: Promise<void> } | null = null;

/** Resolves when the disk layer has been read: at once when it holds a read, else after the read in flight.
 * A read that was overtaken (an invalidation, a folder switch or another full read came while it ran) is
 * dropped when it resolves, and this starts a new one, so a result of the old folder never lands. A failed read
 * rejects. */
export async function ensureLoaded(): Promise<void> {
  while (raw === null) {
    if (diskReadInFlight === null || diskReadInFlight.epoch !== epoch) {
      const startedAt = epoch;
      const read: { epoch: number; promise: Promise<void> } = { epoch: startedAt, promise: Promise.resolve() };
      read.promise = (async () => {
        const entries = await api.readAllNotes();
        if (epoch === startedAt) readAllIntoDiskLayer(entries);
      })().finally(() => {
        if (diskReadInFlight === read) diskReadInFlight = null;
      });
      diskReadInFlight = read;
    }
    await diskReadInFlight.promise;
  }
}

/** Resolves when the read in flight (if any) is over, whether it worked or not. */
export async function whenDiskReadSettled(): Promise<void> {
  if (diskReadInFlight) await diskReadInFlight.promise.catch(() => {});
}
