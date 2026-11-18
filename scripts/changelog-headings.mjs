// Which changelog entries are new since a release, for changelog-status.mjs. Pure functions: the caller reads the files.
//
// An entry is new when its heading ("## N. title") is in the changelog now and was in none of the changelog files at
// the previous release. Comparing the sets of headings (and not reading `git diff` for added lines) keeps this right
// when entries move between files, as they all did when the one CHANGELOG.md was split into docs/changelog/ (P2).

const HEADING = /^## (\d+)\.\s*(.*)$/;

/** The entry headings in one changelog file's text, trimmed. */
export function headingsIn(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => HEADING.test(l))
    .map((l) => l.trim());
}

/** The headings in `currentTexts` that appear in none of `previousTexts`. */
export function newHeadings(currentTexts, previousTexts) {
  const before = new Set(previousTexts.flatMap(headingsIn));
  return new Set(currentTexts.flatMap(headingsIn).filter((h) => !before.has(h)));
}

/**
 * The numbered entries (`## N. Title`) in one changelog file's text, each with its body lines.
 * Un-numbered `## ...` headings stay inside the current entry's lines.
 */
export function entriesIn(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const match = HEADING.exec(line);
    if (match) {
      current = {
        num: Number(match[1]),
        title: match[2].trim(),
        lines: [],
      };
      entries.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return entries;
}
