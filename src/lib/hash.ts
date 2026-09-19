/** SHA-256 hex of a string — the same digest Rust's `sha2` produces for the
 * file's bytes, so an in-memory hash is directly comparable to a
 * `FileMetadata.contentHash` from disk. Its own module (rather than living in
 * `drift.ts`) so `persistence.ts` can use it without a circular import. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of the empty string. */
export const EMPTY_CONTENT_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** The §94 clean baseline for a note that was just loaded: the file's hash, or
 * - when the file doesn't exist yet - the hash of empty content. A tab for a
 * not-yet-existing note holds "", which *is* what the file holds (nothing), so
 * it needs a baseline like any other: without one the drift check never runs
 * for it and a save writes unconditionally, so a version that syncs in from
 * another device before the first edit is silently overwritten by "". */
export function loadBaseline(metadata: { exists: boolean; contentHash: string | null }): string | null {
  return metadata.exists ? metadata.contentHash : EMPTY_CONTENT_HASH;
}
