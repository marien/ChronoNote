import { indentLen, nextNumberedMarker, parseNumberedItem, shiftLineIndent, type NumberedItem } from "./tokens";

export { indentLen };

export interface LineEdit {
  line: number;
  text: string;
}

export interface ParsedBullet {
  kind: "bullet";
  indent: string;
  marker: string;
  text: string;
}

function leadingWidth(line: string): number {
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 32) w += 1;
    else if (c === 9) w += 2;
    else if (c > 126 && /\s/.test(line[i])) w += 1;
    else break;
  }
  return w;
}

export function parseBulletItem(line: string): ParsedBullet | null {
  let k = 0;
  while (k < line.length && (line[k] === " " || line[k] === "\t")) k++;
  const c = line.charCodeAt(k);
  if (Number.isNaN(c) || (c >= 33 && c <= 126 && c !== 45 && c !== 42 && c !== 33)) return null;
  const m = line.match(/^(\s*)((?:! )?[-*])(?:\s+(.*)|\s*$)/);
  if (!m) return null;
  return {
    kind: "bullet",
    indent: m[1],
    marker: m[2],
    text: m[3] !== undefined ? m[3].trim() : "",
  };
}

export type ParsedItem = ({ kind: "numbered" } & NumberedItem) | ParsedBullet;

export function parseListItem(line: string): ParsedItem | null {
  const num = parseNumberedItem(line);
  if (num) return { kind: "numbered", ...num };
  return parseBulletItem(line);
}

export interface ListBlock {
  start: number;
  end: number;
  minIndent: number;
}

function findBlocksInRange(
  lines: string[],
  start: number,
  end: number,
  parsedOffset?: number,
  parsedCache?: (ParsedItem | null)[],
): ListBlock[] {
  if (start > end) return [];
  let firstList = -1;
  let minIndent = Infinity;
  const off = parsedOffset ?? start;
  const parsed = parsedCache ?? new Array<ParsedItem | null>(end - start + 1);
  for (let i = start; i <= end; i++) {
    const item = parsedCache ? parsed[i - off] : (parsed[i - off] = parseListItem(lines[i]));
    if (item !== null) {
      if (firstList === -1) firstList = i;
      const ind = indentLen(item.indent);
      if (ind < minIndent) minIndent = ind;
    }
  }
  if (firstList === -1) return [];

  const splitters: number[] = [];
  for (let i = start; i <= end; i++) {
    if (parsed[i - off] === null) {
      const ind = indentLen(lines[i].match(/^\s*/)?.[0] ?? "");
      if (ind <= minIndent) {
        splitters.push(i);
      }
    }
  }

  if (splitters.length === 0) {
    return [{ start: firstList, end, minIndent }];
  }

  const blocks: ListBlock[] = [];
  let curStart = start;
  for (const s of splitters) {
    if (s - 1 >= curStart) {
      blocks.push(...findBlocksInRange(lines, curStart, s - 1, off, parsed));
    }
    curStart = s + 1;
  }
  if (curStart <= end) {
    blocks.push(...findBlocksInRange(lines, curStart, end, off, parsed));
  }
  return blocks;
}

export function getAllListBlocks(lines: string[]): ListBlock[] {
  const blocks: ListBlock[] = [];
  let runStart: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      if (runStart !== null) {
        blocks.push(...findBlocksInRange(lines, runStart, i - 1));
        runStart = null;
      }
    } else {
      if (runStart === null) runStart = i;
    }
  }
  if (runStart !== null) {
    blocks.push(...findBlocksInRange(lines, runStart, lines.length - 1));
  }
  return blocks;
}

/** The list blocks in the run of non-blank lines around `idx` only, so a list edit never scans the whole note. */
function blocksAround(lines: string[], idx: number): ListBlock[] {
  if (idx < 0 || idx >= lines.length || lines[idx].trim() === "") return [];
  let start = idx;
  let end = idx;
  while (start > 0 && lines[start - 1].trim() !== "") start--;
  while (end < lines.length - 1 && lines[end + 1].trim() !== "") end++;
  return findBlocksInRange(lines, start, end);
}

export function getBlockForLine(lines: string[], idx: number): ListBlock | null {
  const blocks = blocksAround(lines, idx);
  for (const b of blocks) {
    if (idx >= b.start && idx <= b.end) return b;
  }
  return null;
}

export function findParentInBlock(
  lines: string[],
  block: ListBlock,
  idx: number,
): { index: number; item: ParsedItem } | null {
  const myIndent = indentLen(lines[idx].match(/^\s*/)?.[0] ?? "");
  for (let i = idx - 1; i >= block.start; i--) {
    const item = parseListItem(lines[i]);
    if (item && indentLen(item.indent) < myIndent) {
      return { index: i, item };
    }
  }
  return null;
}

/** The new indent string for Tab on line `idx`, or null for the default behaviour (rule 1). */
export function tabIndentTarget(lines: string[], idx: number): string | null {
  if (idx < 0 || idx >= lines.length) return null;
  const item = parseListItem(lines[idx]);
  if (!item) return null;

  const block = getBlockForLine(lines, idx);
  if (!block) return null;

  const myIndent = indentLen(item.indent);
  let P: ParsedItem | null = null;
  for (let i = idx - 1; i >= block.start; i--) {
    const prev = parseListItem(lines[i]);
    if (!prev) continue;
    const prevIndent = indentLen(prev.indent);
    // Stop at the parent: only look at preceding items within the same parent (rule 2).
    if (prevIndent < myIndent) break;
    if (prevIndent === myIndent) {
      if (item.kind === "bullet" || (prev.kind === "numbered" && prev.delimiter === item.delimiter)) {
        P = prev;
      }
      break;
    }
  }

  if (P && P.kind === "numbered") {
    const textCol = indentLen(P.indent) + P.marker.length + 1;
    return " ".repeat(textCol);
  }
  return null;
}

/** The new indent string for Shift+Tab on line `idx`, or null for the default behaviour (rule 1). */
export function shiftTabIndentTarget(lines: string[], idx: number): string | null {
  if (idx < 0 || idx >= lines.length) return null;
  const item = parseListItem(lines[idx]);
  if (!item) return null;

  const myIndent = indentLen(item.indent);
  if (myIndent === 0) return null;

  const block = getBlockForLine(lines, idx);
  if (!block) return null;

  const parent = findParentInBlock(lines, block, idx);
  if (parent) {
    return parent.item.indent;
  }
  return null;
}

export interface NumberedGroup {
  first: number;
  indent: number;
  delimiter: "." | ")";
  parent: number | null;
  start: number;
  items: { line: number; item: NumberedItem }[];
}

export function getGroupsInBlock(
  lines: string[],
  block: ListBlock,
  parsedOffset?: number,
  parsedCache?: (ParsedItem | null)[],
): NumberedGroup[] {
  const groups: NumberedGroup[] = [];
  const groupMap = new Map<string, NumberedGroup>();
  const parentStack: { index: number; indent: number }[] = [];

  for (let i = block.start; i <= block.end; i++) {
    const item = parsedCache && parsedOffset !== undefined ? parsedCache[i - parsedOffset] : parseListItem(lines[i]);
    if (!item) continue;

    const ind = indentLen(item.indent);
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].indent >= ind) {
      parentStack.pop();
    }
    const parentIdx = parentStack.length > 0 ? parentStack[parentStack.length - 1].index : null;
    parentStack.push({ index: i, indent: ind });

    if (item.kind !== "numbered") continue;

    const key = `${parentIdx}:${ind}:${item.delimiter}`;
    let g = groupMap.get(key);
    if (!g) {
      g = {
        first: i,
        indent: ind,
        delimiter: item.delimiter,
        parent: parentIdx,
        start: item.numbers[item.numbers.length - 1],
        items: [],
      };
      groupMap.set(key, g);
      groups.push(g);
    }
    g.items.push({ line: i, item });
  }

  return groups;
}

export interface TouchedRun {
  block: ListBlock;
  runStart: number;
  runEnd: number;
  parsed: (ParsedItem | null)[];
}

export function getTouchedRuns(lines: string[], touched: number[]): TouchedRun[] {
  const result: TouchedRun[] = [];
  const seenBlocks = new Set<number>();
  const runCache: { start: number; end: number; blocks: ListBlock[]; parsed: (ParsedItem | null)[] }[] = [];
  for (const t of new Set(touched)) {
    if (t < 0 || t >= lines.length || lines[t].trim() === "") continue;
    let cached = runCache.find((r) => t >= r.start && t <= r.end);
    if (!cached) {
      let start = t;
      let end = t;
      while (start > 0 && lines[start - 1].trim() !== "") start--;
      while (end < lines.length - 1 && lines[end + 1].trim() !== "") end++;
      const parsed = new Array<ParsedItem | null>(end - start + 1);
      for (let i = start; i <= end; i++) parsed[i - start] = parseListItem(lines[i]);
      cached = { start, end, blocks: findBlocksInRange(lines, start, end, start, parsed), parsed };
      runCache.push(cached);
    }
    for (const b of cached.blocks) {
      if (t >= b.start && t <= b.end && !seenBlocks.has(b.start)) {
        seenBlocks.add(b.start);
        result.push({ block: b, runStart: cached.start, runEnd: cached.end, parsed: cached.parsed });
      }
    }
  }
  return result.sort((a, b) => a.block.start - b.block.start);
}

/** Recompute blocks inside an already-parsed run after `changedIdx` changed (rule 15). */
export function refreshRunsForLine(
  lines: string[],
  run: TouchedRun,
  changedIdx: number,
  idx: number,
): { run: TouchedRun; groups: NumberedGroup[] } | null {
  const parsed = [...run.parsed];
  parsed[changedIdx - run.runStart] = parseListItem(lines[changedIdx]);
  const blocks = findBlocksInRange(lines, run.runStart, run.runEnd, run.runStart, parsed);
  const block = blocks.find((b) => idx >= b.start && idx <= b.end);
  if (!block) return null;
  const updated: TouchedRun = { block, runStart: run.runStart, runEnd: run.runEnd, parsed };
  return { run: updated, groups: getGroupsInBlock(lines, block, run.runStart, parsed) };
}

/** Fast single-run indent target lookup using pre-parsed items (rule 2, rule 15). */
export function tabIndentTargetInRun(run: TouchedRun, idx: number): string | null {
  const item = run.parsed[idx - run.runStart];
  if (!item) return null;
  const myIndent = indentLen(item.indent);
  let P: ParsedItem | null = null;
  for (let i = idx - 1; i >= run.block.start; i--) {
    const prev = run.parsed[i - run.runStart];
    if (!prev) continue;
    const prevIndent = indentLen(prev.indent);
    if (prevIndent < myIndent) break;
    if (prevIndent === myIndent) {
      if (item.kind === "bullet" || (prev.kind === "numbered" && prev.delimiter === item.delimiter)) {
        P = prev;
      }
      break;
    }
  }
  if (P && P.kind === "numbered") {
    return " ".repeat(indentLen(P.indent) + P.marker.length + 1);
  }
  return null;
}

export function findParentInRun(run: TouchedRun, idx: number): { index: number; item: ParsedItem } | null {
  const myIndent = indentLen((run.parsed[idx - run.runStart]?.indent) ?? "");
  for (let i = idx - 1; i >= run.block.start; i--) {
    const item = run.parsed[i - run.runStart];
    if (item && indentLen(item.indent) < myIndent) return { index: i, item };
  }
  return null;
}

/** Each group in the blocks containing `touched`: its first item's line, indent length, delimiter, parent line
 *  (null at top level) and its first item's current number. Used to carry starts across an edit. */
export function listGroups(
  lines: string[],
  touched: number[],
): { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[] {
  const out: { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[] = [];
  for (const { block, runStart, parsed } of getTouchedRuns(lines, touched)) {
    for (const g of getGroupsInBlock(lines, block, runStart, parsed)) {
      out.push({
        first: g.first,
        indent: g.indent,
        delimiter: g.delimiter,
        parent: g.parent,
        start: g.start,
      });
    }
  }
  return out;
}

/** Pairs each new group with the old group of the same indent and delimiter whose mapped first line is closest
 *  at or before it, and returns the starts map for `renumberLists`. When one old group splits into several new ones,
 *  only the first keeps the old start and every split-off part starts again at 1 (rule 4). */
export function matchGroupStarts(
  oldGroups: { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[],
  newGroups: { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[],
  mappedFirstLine: (oldFirst: number) => number,
): Map<number, number> {
  const starts = new Map<number, number>();
  const claimed = new Set<(typeof oldGroups)[0]>();
  for (const ng of newGroups) {
    let bestOld: (typeof oldGroups)[0] | null = null;
    let bestDist = Infinity;
    for (const og of oldGroups) {
      if (og.indent === ng.indent && og.delimiter === ng.delimiter) {
        const mappedLine = mappedFirstLine(og.first);
        if (mappedLine <= ng.first) {
          const dist = ng.first - mappedLine;
          if (dist < bestDist) {
            bestDist = dist;
            bestOld = og;
          }
        }
      }
    }
    if (bestOld) {
      if (claimed.has(bestOld)) {
        starts.set(ng.first, 1);
      } else {
        claimed.add(bestOld);
        starts.set(ng.first, bestOld.start);
      }
    }
  }
  return starts;
}

function renumberRuns(
  lines: string[],
  runs: { block: ListBlock; groups: NumberedGroup[] }[],
  starts?: Map<number, number>,
  skipWidthShift?: Set<number>,
): LineEdit[] {
  const edits: LineEdit[] = [];
  const newNumbers = new Map<number, number[]>();

  for (const { block: b, groups } of runs) {
    const rewritten = new Map<number, string>();
    const markerDeltaByLine = new Map<number, number>();

    for (const g of groups) {
      const start = starts?.get(g.first) ?? g.start;
      const isDotted = g.items[0].item.numbers.length > 1;

      let prefix: number[] = [];
      if (isDotted && g.parent !== null) {
        prefix = newNumbers.get(g.parent) ?? parseNumberedItem(lines[g.parent])?.numbers ?? [];
      }
      // A dotted group with no numbered parent (`1.1.` at the top, or under a bullet) keeps its own prefix.
      if (isDotted && prefix.length === 0) prefix = g.items[0].item.numbers.slice(0, -1);

      for (let j = 0; j < g.items.length; j++) {
        const lineIdx = g.items[j].line;
        const seq = start + j;
        const hasPrefix = isDotted && prefix.length > 0;
        const itemNumbers = hasPrefix ? [...prefix, seq] : [seq];
        newNumbers.set(lineIdx, itemNumbers);

        const newMarker = hasPrefix ? itemNumbers.join(".") + g.delimiter : `${seq}${g.delimiter}`;
        const oldItem = g.items[j].item;
        const newLine = oldItem.indent + newMarker + lines[lineIdx].slice(oldItem.markerEnd);
        if (newLine !== lines[lineIdx]) {
          rewritten.set(lineIdx, newLine);
        }
        if (!skipWidthShift?.has(lineIdx)) {
          const delta = newMarker.length - oldItem.marker.length;
          if (delta !== 0) {
            markerDeltaByLine.set(lineIdx, delta);
          }
        }
      }
    }

    // Rule 10: if any marker changed width (`9.` <-> `10.`, `9.9.` <-> `9.10.`), shift its subtree by the same columns.
    if (markerDeltaByLine.size > 0) {
      const stack: { origIndent: number; newIndent: number; shift: number }[] = [];
      for (let i = b.start; i <= b.end; i++) {
        const baseLine = rewritten.get(i) ?? lines[i];
        const origIndent = leadingWidth(baseLine);
        while (stack.length > 0 && stack[stack.length - 1].origIndent >= origIndent) stack.pop();
        const parent = stack[stack.length - 1];
        const parentShift = parent ? parent.shift : 0;
        let finalLine = baseLine;
        let newIndent = origIndent;
        if (parentShift !== 0) {
          const minInd = parent ? parent.newIndent + 1 : 0;
          finalLine = shiftLineIndent(baseLine, parentShift, minInd);
          newIndent = Math.max(minInd, origIndent + parentShift);
        }
        if (finalLine !== lines[i]) {
          rewritten.set(i, finalLine);
        } else {
          rewritten.delete(i);
        }
        const markerDelta = markerDeltaByLine.get(i) ?? 0;
        if (parentShift !== 0 || markerDelta !== 0) {
          stack.push({ origIndent, newIndent, shift: parentShift + markerDelta });
        }
      }
    }

    for (const [lineIdx, text] of rewritten) {
      edits.push({ line: lineIdx, text });
    }
  }

  return edits.sort((a, b) => a.line - b.line);
}

/** Rule 5 on plain lines: renumber the groups of the list blocks containing the `touched` line indices. `starts`
 *  maps a group's first-item line index (in `lines`) to the start it must have; a group not in it starts at its
 *  first item's current number. */
export function renumberLists(
  lines: string[],
  touched: number[],
  starts?: Map<number, number>,
  skipWidthShift?: Set<number>,
): LineEdit[] {
  const runs = getTouchedRuns(lines, touched).map(({ block, runStart, parsed }) => ({
    block,
    groups: getGroupsInBlock(lines, block, runStart, parsed),
  }));
  return renumberRuns(lines, runs, starts, skipWidthShift);
}

/** Renumber `working` carrying group starts from `before` in one pass per side (rule 15). */
export function renumberEdited(
  before: string[],
  working: string[],
  touched: number[],
  extraStarts?: Map<number, number>,
  skipWidthShift?: Set<number>,
): LineEdit[] {
  const oldGroups: NumberedGroup[] = [];
  for (const { block, runStart, parsed } of getTouchedRuns(before, touched)) {
    oldGroups.push(...getGroupsInBlock(before, block, runStart, parsed));
  }
  const workingTouched = oldGroups.length > 0 ? [...touched, ...oldGroups.map((g) => g.first)] : touched;
  const newRuns = getTouchedRuns(working, workingTouched).map(({ block, runStart, parsed }) => ({
    block,
    groups: getGroupsInBlock(working, block, runStart, parsed),
  }));
  return renumberFromGroups(working, oldGroups, newRuns, extraStarts, skipWidthShift);
}

/** Renumber pre-analyzed `working` runs carrying group starts from `before` without re-parsing (rule 15). */
export function renumberPrepared(
  before: string[],
  beforeRun: TouchedRun,
  working: string[],
  workingRun: TouchedRun,
  workingGroups: NumberedGroup[],
  extraStarts?: Map<number, number>,
  skipWidthShift?: Set<number>,
): LineEdit[] {
  const oldGroups = getGroupsInBlock(before, beforeRun.block, beforeRun.runStart, beforeRun.parsed);
  return renumberFromGroups(working, oldGroups, [{ block: workingRun.block, groups: workingGroups }], extraStarts, skipWidthShift);
}

function renumberFromGroups(
  working: string[],
  oldGroups: NumberedGroup[],
  newRuns: { block: ListBlock; groups: NumberedGroup[] }[],
  extraStarts?: Map<number, number>,
  skipWidthShift?: Set<number>,
): LineEdit[] {
  const newGroups: NumberedGroup[] = [];
  for (const r of newRuns) newGroups.push(...r.groups);
  const starts = matchGroupStarts(oldGroups, newGroups, (first) => first);
  for (const [k, v] of extraStarts ?? []) starts.set(k, v);
  return renumberRuns(working, newRuns, starts, skipWidthShift);
}

/** Tab stops for a line that is not a list item but sits under one (a continuation, a line whose number was removed,
 * or text right below the list): the indent and text column of the nearest item above and of each of its parents,
 * ascending. Empty when the line is not under a list (a blank line or unindented text comes first). */
export function continuationStops(lines: string[], idx: number): number[] {
  if (idx <= 0 || idx >= lines.length || parseListItem(lines[idx]) !== null) return [];
  const stops = new Set<number>();
  let limit = Infinity;
  for (let i = idx - 1; i >= 0 && limit > 0; i--) {
    if (lines[i].trim() === "") break;
    const ind = indentLen(lines[i].match(/^\s*/)![0]);
    const item = parseListItem(lines[i]);
    if (!item) {
      if (ind === 0) break;
      continue;
    }
    if (ind >= limit) continue;
    stops.add(ind);
    stops.add(ind + item.marker.length + 1);
    limit = ind;
  }
  return [...stops].sort((a, b) => a - b);
}

/** Rule 4, first Backspace: the line's new text, or null when it does not apply. `col` = caret column. */
export function backspaceMarker(lines: string[], idx: number, col: number): string | null {
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx];
  const num = parseNumberedItem(line);
  if (!num) return null;

  const m = line.match(/^(\s*)([0-9]+(?:\.[0-9]+)*[.)])(\s*)/);
  if (!m) return null;
  const textStartCol = m[1].length + m[2].length + m[3].length;
  if (col !== textStartCol) return null;

  const block = getBlockForLine(lines, idx);
  if (!block) return null;

  const myIndent = indentLen(num.indent);
  let P: ParsedItem | null = null;
  for (let i = idx - 1; i >= block.start; i--) {
    const prev = parseListItem(lines[i]);
    if (prev && indentLen(prev.indent) <= myIndent) {
      P = prev;
      break;
    }
  }

  let targetIndent: string;
  if (P) {
    // Keep P's own indent verbatim (so a leading tab stays a tab, rule 11), plus spaces past its marker.
    targetIndent = P.indent + " ".repeat(P.marker.length + 1);
  } else {
    targetIndent = num.indent;
  }

  return targetIndent + line.slice(textStartCol);
}

/** Rule 4, second Backspace: the line's new text, or null. */
export function backspaceContinuation(lines: string[], idx: number, col: number): string | null {
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx];
  if (parseListItem(line) !== null) return null;

  const leading = line.match(/^[ \t]*/)![0];
  const leadingSpaces = leading.length;
  if (leadingSpaces === 0 || col !== leadingSpaces) return null;

  const block = getBlockForLine(lines, idx);
  if (!block) return null;

  const leadingWidth = indentLen(leading);
  let minIndent = leadingWidth;
  let P: NumberedItem | null = null;
  for (let i = idx - 1; i >= block.start; i--) {
    const item = parseListItem(lines[i]);
    if (!item) continue;
    const ind = indentLen(item.indent);
    // Skip deeper sub-items or bullets between the continuation line and the item it continues (rule 6).
    if (ind < minIndent) {
      if (item.kind === "numbered" && ind + item.marker.length + 1 === leadingWidth) {
        P = item;
        break;
      }
      minIndent = ind;
    }
  }
  if (!P) return null;

  // Back to the indent of the item it continued, so an indented list keeps its place.
  return P.indent + line.slice(leadingSpaces);
}

/** Rule 7: the replacement text for an empty sub-item's line on Enter, or null when unchanged behaviour applies. */
export function emptySubItemEnter(lines: string[], idx: number): string | null {
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx];
  const num = parseNumberedItem(line);
  const bullet = parseBulletItem(line);

  let isEmpty = false;
  if (num && num.text === "") isEmpty = true;
  else if (bullet && bullet.text === "") isEmpty = true;

  if (!isEmpty) return null;

  const block = getBlockForLine(lines, idx);
  if (!block) return null;

  const parent = findParentInBlock(lines, block, idx);
  if (!parent || parent.item.kind !== "numbered") return null;

  const parentItem = parent.item;
  const parentIndentLen = indentLen(parentItem.indent);

  const grandparent = findParentInBlock(lines, block, parent.index);
  const grandparentIdx = grandparent ? grandparent.index : null;

  let prevSibling: NumberedItem = parentItem;
  for (let i = idx - 1; i > parent.index; i--) {
    const prevNum = parseNumberedItem(lines[i]);
    if (prevNum && indentLen(prevNum.indent) === parentIndentLen && prevNum.delimiter === parentItem.delimiter) {
      const prevParent = findParentInBlock(lines, block, i);
      const prevParentIdx = prevParent ? prevParent.index : null;
      if (prevParentIdx === grandparentIdx) {
        prevSibling = prevNum;
        break;
      }
    }
  }

  const nextMarker = nextNumberedMarker(prevSibling);
  return `${parentItem.indent}${nextMarker} `;
}
