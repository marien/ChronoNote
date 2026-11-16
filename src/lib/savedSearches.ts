import { get, writable } from "svelte/store";
import * as api from "./tauriApi";
import { logWarn } from "./appLog";
import { splitQuery } from "./search";

const MAX_SAVED_SEARCHES = 30;

export const savedSearches = writable<string[]>([]);

let readErrorLogged = false;

/** Trims and collapses runs of whitespace to a single space while preserving
 * spaces inside quoted `section:"..."` tokens. */
export function normalizeQuery(q: string): string {
  return splitQuery(q.trim())
    .map((t) => t.token)
    .join(" ");
}

/** Parses `.chrononote-searches.txt` content into normalised, unique queries
 * (preserving order of first appearance and dropping blank lines). */
export function parseSavedSearches(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const norm = normalizeQuery(line);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/** Serializes saved searches as one line per entry with a trailing newline. */
export function serializeSavedSearches(list: readonly string[]): string {
  if (list.length === 0) return "";
  return list.join("\n") + "\n";
}

/** Reads `.chrononote-searches.txt` into the `savedSearches` store.
 * Leaves the store unchanged and logs once on read errors. */
export async function loadSavedSearches(): Promise<string[]> {
  try {
    const text = await api.readSavedSearches();
    readErrorLogged = false;
    const parsed = parseSavedSearches(text);
    savedSearches.set(parsed);
    return parsed;
  } catch (err) {
    if (!readErrorLogged) {
      readErrorLogged = true;
      const msg = err instanceof Error ? err.message : String(err);
      logWarn(`Failed to read saved searches: ${msg}`);
    }
    return get(savedSearches);
  }
}

/** Adds the normalised query at the end (dropping the oldest entry past 30),
 * or removes it when already saved, persisting to `.chrononote-searches.txt`. */
export async function toggleSavedSearch(query: string): Promise<void> {
  const norm = normalizeQuery(query);
  if (!norm) return;
  const current = get(savedSearches);
  let next: string[];
  if (current.includes(norm)) {
    next = current.filter((item) => item !== norm);
  } else {
    next = [...current, norm];
    if (next.length > MAX_SAVED_SEARCHES) {
      next = next.slice(next.length - MAX_SAVED_SEARCHES);
    }
  }
  await api.writeSavedSearches(serializeSavedSearches(next));
  savedSearches.set(next);
}

/** Removes the normalised query from saved searches if present and persists. */
export async function removeSavedSearch(query: string): Promise<void> {
  const norm = normalizeQuery(query);
  if (!norm) return;
  const current = get(savedSearches);
  const next = current.filter((item) => item !== norm);
  if (next.length === current.length) return;
  await api.writeSavedSearches(serializeSavedSearches(next));
  savedSearches.set(next);
}
