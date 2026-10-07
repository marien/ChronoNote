/** Same rule as `normalize_note_text` in storage.rs: no byte-order mark, LF line endings. */
export function normalizeNoteText(s: string): string {
  const noBom = s.startsWith("\uFEFF") ? s.slice(1) : s;
  return noBom.includes("\r") ? noBom.replace(/\r\n?/g, "\n") : noBom;
}
