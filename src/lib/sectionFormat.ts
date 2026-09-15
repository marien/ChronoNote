/** The one piece of Setext-header formatting shared by everything that
 * creates a section: "Convert current line to a section" (`EditorPane.svelte`)
 * and the calendar reconciliation engine (`calendarReconcile.ts`), both of
 * which need a `=`-underline matching a title's length. Used to also back
 * the manual "Import Sections" feature (`linesToSections`), removed when
 * "Sync from a list…" replaced it. */

export function underlineFor(header: string): string {
  return "=".repeat(Math.max(3, header.length));
}
