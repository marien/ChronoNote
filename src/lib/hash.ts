/** SHA-256 hex of a string — the same digest Rust's `sha2` produces for the
 * file's bytes, so an in-memory hash is directly comparable to a
 * `FileMetadata.contentHash` from disk. Its own module (rather than living in
 * `drift.ts`) so `persistence.ts` can use it without a circular import. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
