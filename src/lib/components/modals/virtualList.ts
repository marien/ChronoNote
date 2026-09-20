/** Shared virtualized-list math for the modal pickers — the Date picker,
 * Action Drawer, Section History, and Cross-tab Search all render a long,
 * flat, keyboard-navigable list where only the rows scrolled into view
 * are mounted; everything past the fold is represented purely as a total
 * height plus each row's `top` offset, which is what makes the scrollbar
 * come out the right size and position without rendering the rest (§38).
 *
 * This was four near-identical copies of the same binary search + window
 * math + scroll-into-view + wrap-around selection. Pure functions here,
 * unit-tested in `virtualList.test.ts`; the components keep ownership of
 * the DOM refs and the `scrollTop` / `viewportHeight` reactive state. */

/** Overscan buffer (px) kept mounted on each side of the viewport so a
 * fast scroll doesn't flash blank rows before the next window lands. */
export const ROW_OVERSCAN_PX = 200;

/** Fixed row heights, dictated by the modal CSS (`.modal-item` /
 * `.modal-group-header` padding + font-size) rather than measured —
 * every row renders a single non-wrapping line, so the height is a known
 * constant. Kept here so the virtual math and the CSS can't drift apart
 * across the four modals. */
export const MODAL_ITEM_ROW_HEIGHT = 36;
export const MODAL_HEADER_ROW_HEIGHT = 29;
export const SEARCH_ITEM_ROW_HEIGHT = 68;

/** A row placed in the virtual stack: its top edge and its height, in
 * px. The modals build these from their own richer row models (group
 * headers + items, or uniform date rows) via `withTops`. */
export interface PlacedRow {
  top: number;
  height: number;
}

/** Assign each row a cumulative `top` from its `height`, in order. The
 * modal builds its rows carrying `height` (plus whatever payload it
 * needs), then hands them here. */
export function withTops<T extends { height: number }>(rows: readonly T[]): (T & PlacedRow)[] {
  let top = 0;
  return rows.map((row) => {
    const placed = { ...row, top };
    top += row.height;
    return placed;
  });
}

/** `top`/`height` rows for the uniform-height case (the Date picker):
 * `count` rows all `rowHeight` tall. */
export function uniformRows(count: number, rowHeight: number): PlacedRow[] {
  const out: PlacedRow[] = [];
  for (let i = 0; i < count; i++) out.push({ top: i * rowHeight, height: rowHeight });
  return out;
}

/** Total scroll height of the stack — the bottom edge of the last row,
 * or 0 when empty. */
export function stackHeight(rows: readonly PlacedRow[]): number {
  if (rows.length === 0) return 0;
  const last = rows[rows.length - 1];
  return last.top + last.height;
}

/** Index of the first row whose bottom edge is past `y`. Rows are laid
 * out in strictly increasing `top` order, so this is a binary search,
 * not a scan on every scroll/resize tick. Returns `rows.length` when `y`
 * is at or past the bottom of the stack. */
export function rowIndexAt(rows: readonly PlacedRow[], y: number): number {
  let lo = 0;
  let hi = rows.length - 1;
  let result = rows.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].top + rows[mid].height <= y) {
      lo = mid + 1;
    } else {
      result = mid;
      hi = mid - 1;
    }
  }
  return result;
}

/** The `[start, end)` slice of `rows` to mount for a given scroll
 * position and viewport height, padded by `overscan` px on each side. */
export function visibleWindow(
  rows: readonly PlacedRow[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number = ROW_OVERSCAN_PX,
): { start: number; end: number } {
  return {
    start: rowIndexAt(rows, Math.max(0, scrollTop - overscan)),
    end: rowIndexAt(rows, scrollTop + viewportHeight + overscan),
  };
}

/** The `scrollTop` that brings `row` fully into view — snapping its top
 * edge to the viewport top when it's above, or its bottom edge to the
 * viewport bottom when it's below. `null` when the row is already fully
 * visible, so the caller can skip a redundant scroll write (which would
 * otherwise fight a deliberate manual scroll).
 *
 * `topInset` is the height of anything pinned over the top of the viewport
 * (the Action Drawer's sticky date heading, #77): a row that would land
 * underneath it counts as not fully visible, and is snapped to just below it. */
export function scrollToShow(
  row: PlacedRow,
  scrollTop: number,
  viewportHeight: number,
  topInset: number = 0,
): number | null {
  if (row.top < scrollTop + topInset) return Math.max(0, row.top - topInset);
  if (row.top + row.height > scrollTop + viewportHeight) {
    return row.top + row.height - viewportHeight;
  }
  return null;
}

/** Move a list selection by `delta` (+1 / -1) with wrap-around at the
 * ends. Returns the index unchanged when the list is empty. */
export function wrapIndex(current: number, count: number, delta: 1 | -1): number {
  if (count === 0) return current;
  return (current + delta + count) % count;
}

/** Clamp a selection index into `[0, count - 1]` (or 0 when empty) — for
 * when the list shrinks out from under the selection. */
export function clampIndex(current: number, count: number): number {
  return current < count ? current : Math.max(0, count - 1);
}
