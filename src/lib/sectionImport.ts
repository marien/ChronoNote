/** Manual section import: paste freeform lines of text (e.g. copied from an
 * email or agenda) and each non-empty line becomes a new section header,
 * appended to the end of the note with the two-blank-line spacing required
 * by spec 2.3. Purely additive — it never touches existing sections. */

export function underlineFor(header: string): string {
  return "=".repeat(Math.max(3, header.length));
}

export function linesToSections(content: string, rawText: string): string {
  const titles = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (titles.length === 0) return content;

  const newBlocks = titles.map((title) => `${title}\n${underlineFor(title)}`);
  const trimmedContent = content.replace(/\s+$/, "");

  if (!trimmedContent) {
    return newBlocks.join("\n\n\n") + "\n";
  }
  return trimmedContent + "\n\n\n" + newBlocks.join("\n\n\n") + "\n";
}
