/** Line-level diff for the sync-conflict screen: which lines of each side
 * are not part of what the two versions share, so only those get
 * highlighted. (The Rust merge in `onedrive/merge.rs` works on the same idea
 * but needs a common ancestor; this just compares the two visible texts.) */

export interface DiffRow {
  text: string;
  /** True when this line has no counterpart in the other version. */
  changed: boolean;
}

/** Splits into lines, ignoring the empty piece a trailing newline leaves. */
function toLines(s: string): string[] {
  if (s === "") return [];
  const lines = s.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Above this many table cells fall back to a cheap set comparison rather
 * than allocating a huge LCS table for a very long note. */
const MAX_CELLS = 4_000_000;

export function diffLines(a: string, b: string): { left: DiffRow[]; right: DiffRow[] } {
  const x = toLines(a);
  const y = toLines(b);
  const n = x.length;
  const m = y.length;

  if (n * m > MAX_CELLS) {
    const inY = new Set(y);
    const inX = new Set(x);
    return {
      left: x.map((text) => ({ text, changed: !inY.has(text) })),
      right: y.map((text) => ({ text, changed: !inX.has(text) })),
    };
  }

  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = x[i] === y[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }

  const left: DiffRow[] = [];
  const right: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      left.push({ text: x[i], changed: false });
      right.push({ text: y[j], changed: false });
      i++;
      j++;
    } else if (j < m && (i === n || t[i * w + j + 1] >= t[(i + 1) * w + j])) {
      right.push({ text: y[j], changed: true });
      j++;
    } else {
      left.push({ text: x[i], changed: true });
      i++;
    }
  }
  return { left, right };
}
