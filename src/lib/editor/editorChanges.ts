/** The changes that turn `oldText` into `newText` while touching as little as possible: lines both texts share stay,
 * and each run of changed lines becomes its own change, trimmed to the characters that differ. Replacing the whole
 * document instead makes CodeMirror put the caret at the start and scroll to the top; with these the caret and the
 * scroll position stay where they were (outside rewrites of the open note: the phone companion, merges, drift). One
 * change spanning everything that differs is not enough either: a caret between two edits would land on the first.
 * Empty when nothing changed. Positions are in `oldText`, sorted and not overlapping (a CodeMirror change set). */

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/** Above this many table cells (changed old lines x changed new lines) one change covers the changed middle. */
const MAX_CELLS = 4_000_000;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** One change for `oldText.slice(from, to)` -> `insert`, minus what both share at the start and end. */
export function trimmed(oldText: string, from: number, to: number, insert: string): TextChange | null {
  let s = 0;
  const max = Math.min(to - from, insert.length);
  while (s < max && oldText.charCodeAt(from + s) === insert.charCodeAt(s)) s++;
  // Never split a UTF-16 surrogate pair at the end of the shared prefix.
  if (
    s > 0 &&
    isHighSurrogate(insert.charCodeAt(s - 1)) &&
    ((from + s < to && isLowSurrogate(oldText.charCodeAt(from + s))) ||
      (s < insert.length && isLowSurrogate(insert.charCodeAt(s))))
  ) {
    s--;
  }
  let e = 0;
  while (e < max - s && oldText.charCodeAt(to - 1 - e) === insert.charCodeAt(insert.length - 1 - e)) e++;
  // Never split a UTF-16 surrogate pair at the start of the shared suffix.
  if (
    e > 0 &&
    isLowSurrogate(insert.charCodeAt(insert.length - e)) &&
    ((to - e - 1 >= from + s && isHighSurrogate(oldText.charCodeAt(to - e - 1))) ||
      (insert.length - e - 1 >= s && isHighSurrogate(insert.charCodeAt(insert.length - e - 1))))
  ) {
    e--;
  }
  if (from + s === to - e && s === insert.length - e) return null;
  return { from: from + s, to: to - e, insert: insert.slice(s, insert.length - e) };
}

export function editorChanges(oldText: string, newText: string): TextChange[] {
  if (oldText === newText) return [];
  const x = oldText.split("\n");
  const y = newText.split("\n");
  // starts[i]: offset of old line i in oldText; starts[x.length] is one past the end (as if a newline followed).
  const starts = new Array<number>(x.length + 1);
  starts[0] = 0;
  for (let i = 0; i < x.length; i++) starts[i + 1] = starts[i] + x[i].length + 1;

  // Old lines [i0, i1) become new lines [j0, j1): the same text, cut at line boundaries.
  const run = (i0: number, i1: number, j0: number, j1: number): TextChange | null => {
    const ins = y.slice(j0, j1).join("\n");
    if (i0 < i1) {
      const from = starts[i0];
      const to = starts[i1] - 1;
      if (j0 < j1) return trimmed(oldText, from, to, ins);
      // Lines removed: take the newline after them, or the one before at the end of the text.
      return i1 < x.length ? trimmed(oldText, from, to + 1, "") : trimmed(oldText, Math.max(0, from - 1), to, "");
    }
    if (j0 === j1) return null;
    // Lines added before old line i0, or after the last line.
    return i0 < x.length
      ? trimmed(oldText, starts[i0], starts[i0], ins + "\n")
      : trimmed(oldText, oldText.length, oldText.length, "\n" + ins);
  };

  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let q = 0;
  while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
  const n = x.length - p - q;
  const m = y.length - p - q;
  const out: TextChange[] = [];
  const push = (c: TextChange | null) => {
    if (c) out.push(c);
  };

  if (n === 0 || m === 0 || n * m > MAX_CELLS) {
    push(run(p, p + n, p, p + m));
    return out;
  }

  // LCS over the changed middle (the same table as `lineDiff.ts`), then one change per run of unmatched lines.
  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = x[p + i] === y[p + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  let ri = 0;
  let rj = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[p + i] === y[p + j]) {
      push(run(p + ri, p + i, p + rj, p + j));
      i++;
      j++;
      ri = i;
      rj = j;
    } else if (j < m && (i === n || t[i * w + j + 1] >= t[(i + 1) * w + j])) {
      j++;
    } else {
      i++;
    }
  }
  push(run(p + ri, p + n, p + rj, p + m));
  return out;
}
