/** Shared formatting for the group headers atop the Action Drawer,
 * Cross-Tab Search and Section History virtualized lists (§127, finding
 * C, §433). One form: the note's date (or scratchpad name), a middle dot,
 * a bare count. When a formatter function is provided, the date follows
 * the user's date format setting. */
export function groupHeaderLabel(
  filenameOrDate: string,
  count: number,
  formatter?: (name: string) => string,
): string {
  const label = formatter ? formatter(filenameOrDate) : filenameOrDate.replace(/\.txt$/, "");
  return `${label}  ·  ${count}`;
}
