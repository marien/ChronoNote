/** Shared formatting for the group headers atop the Action Drawer,
 * Cross-Tab Search and Section History virtualized lists (§127, finding
 * C). Before this, the three drawers each built their own header text —
 * `2026-09-07.TXT (8)` (uppercased via the shared `.modal-group-header`
 * CSS, `.txt` kept), `2026-09-07.TXT (2 MATCHES)`, and `📅 2026-09-07 (1)`
 * — three different shapes for the same idea. One form now: the note's
 * date (or scratchpad name), a middle dot, a bare count. No emoji, no
 * uppercased extension, no per-drawer count noun to keep in sync. */
export function groupHeaderLabel(filenameOrDate: string, count: number): string {
  return `${filenameOrDate.replace(/\.txt$/, "")}  ·  ${count}`;
}
