export type MergeResult = 
  | { type: 'clean'; content: string }
  | { type: 'conflict' };

export interface Hunk {
  start: number;
  end: number;
  lines: string[];
}

function splitLines(s: string): string[] {
  let text = s;
  if (text.length > 0 && !text.endsWith('\n')) {
    text += '\n';
  }
  if (text === "") {
      return [];
  }
  // split inclusive of newline
  const lines = text.split(/(?<=\n)/);
  // remove the last empty string if it split exactly on newline at the end
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

const MAX_LCS_CELLS = 4_000_000;

function hunks(base: string[], newVal: string[]): Hunk[] | null {
  const n = base.length;
  const m = newVal.length;
  if (n * m > MAX_LCS_CELLS) {
    return null;
  }
  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = (base[i] === newVal[j]) 
        ? t[(i + 1) * w + j + 1] + 1 
        : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  const out: Hunk[] = [];
  let cur: Hunk | null = null;
  while (i < n || j < m) {
    if (i < n && j < m && base[i] === newVal[j]) {
      if (cur !== null) {
        out.push(cur);
        cur = null;
      }
      i++;
      j++;
    } else if (j < m && (i === n || t[i * w + j + 1] >= t[(i + 1) * w + j])) {
      if (cur === null) {
        cur = { start: i, end: i, lines: [] };
      }
      cur.lines.push(newVal[j]);
      j++;
    } else {
      if (cur === null) {
        cur = { start: i, end: i, lines: [] };
      }
      cur.end = i + 1;
      i++;
    }
  }
  if (cur !== null) {
    out.push(cur);
  }
  return out;
}

function emit(out: string[], base: string[], pos: { val: number }, h: Hunk): boolean {
  if (h.start < pos.val) {
    return false;
  }
  for (let idx = pos.val; idx < h.start; idx++) {
    out.push(base[idx]);
  }
  for (const line of h.lines) {
    out.push(line);
  }
  pos.val = h.end;
  return true;
}

export function merge3(base: string, local: string, remote: string): MergeResult {
  const b = splitLines(base);
  const hl = hunks(b, splitLines(local));
  const hr = hunks(b, splitLines(remote));
  
  if (!hl || !hr) {
    return { type: 'conflict' };
  }

  const out: string[] = [];
  const pos = { val: 0 };
  let li = 0;
  let ri = 0;

  while (true) {
    let stepOk = true;
    const x = hl[li];
    const y = hr[ri];

    if (!x && !y) {
      break;
    } else if (x && !y) {
      li++;
      stepOk = emit(out, b, pos, x);
    } else if (!x && y) {
      ri++;
      stepOk = emit(out, b, pos, y);
    } else {
      // Both exist
      if (
        x.start === y.start &&
        x.end === y.end &&
        x.lines.length === y.lines.length &&
        x.lines.every((val, index) => val === y.lines[index])
      ) {
        // Both sides made the identical change.
        li++;
        ri++;
        stepOk = emit(out, b, pos, x);
      } else if (x.start === x.end && y.start === y.end && x.start === y.start) {
        // Both added lines at the same spot: keep both (remote first).
        li++;
        ri++;
        stepOk = emit(out, b, pos, y);
        if (stepOk) {
          stepOk = emit(out, b, pos, x);
        }
      } else {
        const overlap = x.start < y.end && y.start < x.end;
        const insertInside = 
          (x.start === x.end && y.start < x.start && x.start < y.end) ||
          (y.start === y.end && x.start < y.start && y.start < x.end);
          
        if (overlap || insertInside) {
          return { type: 'conflict' };
        }
        
        if (x.start < y.start || (x.start === y.start && x.end <= y.end)) {
          li++;
          stepOk = emit(out, b, pos, x);
        } else {
          ri++;
          stepOk = emit(out, b, pos, y);
        }
      }
    }

    if (!stepOk) {
      return { type: 'conflict' };
    }
  }

  for (let idx = pos.val; idx < b.length; idx++) {
    out.push(b[idx]);
  }

  return { type: 'clean', content: out.join('') };
}
