import { parseNumberedItem, nextNumberedMarker, type NumberedItem } from "./tokens";

export interface LineEdit {
  line: number;
  text: string;
}

export function indentLen(str: string): number {
  return str.replace(/\t/g, "  ").length;
}

export interface ParsedBullet {
  kind: "bullet";
  indent: string;
  marker: string;
  text: string;
}

export function parseBulletItem(line: string): ParsedBullet | null {
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

function findBlocksInRange(lines: string[], start: number, end: number): ListBlock[] {
  if (start > end) return [];
  const listIndices: number[] = [];
  for (let i = start; i <= end; i++) {
    if (parseListItem(lines[i]) !== null) {
      listIndices.push(i);
    }
  }
  if (listIndices.length === 0) return [];

  const minIndent = Math.min(...listIndices.map((i) => indentLen(lines[i].match(/^\s*/)?.[0] ?? "")));

  const splitters: number[] = [];
  for (let i = start; i <= end; i++) {
    if (parseListItem(lines[i]) === null) {
      const ind = indentLen(lines[i].match(/^\s*/)?.[0] ?? "");
      if (ind <= minIndent) {
        splitters.push(i);
      }
    }
  }

  if (splitters.length === 0) {
    const firstList = listIndices[0];
    return [{ start: firstList, end, minIndent }];
  }

  const blocks: ListBlock[] = [];
  let curStart = start;
  for (const s of splitters) {
    if (s - 1 >= curStart) {
      blocks.push(...findBlocksInRange(lines, curStart, s - 1));
    }
    curStart = s + 1;
  }
  if (curStart <= end) {
    blocks.push(...findBlocksInRange(lines, curStart, end));
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

export function getBlockForLine(lines: string[], idx: number): ListBlock | null {
  const blocks = getAllListBlocks(lines);
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
    if (prev && indentLen(prev.indent) === myIndent) {
      P = prev;
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

export function getGroupsInBlock(lines: string[], block: ListBlock): NumberedGroup[] {
  const groups: NumberedGroup[] = [];
  const groupMap = new Map<string, NumberedGroup>();

  for (let i = block.start; i <= block.end; i++) {
    const num = parseNumberedItem(lines[i]);
    if (!num) continue;

    const parent = findParentInBlock(lines, block, i);
    const parentIdx = parent ? parent.index : null;
    const ind = indentLen(num.indent);
    const key = `${parentIdx}:${ind}:${num.delimiter}`;

    let g = groupMap.get(key);
    if (!g) {
      g = {
        first: i,
        indent: ind,
        delimiter: num.delimiter,
        parent: parentIdx,
        start: num.numbers[num.numbers.length - 1],
        items: [],
      };
      groupMap.set(key, g);
      groups.push(g);
    }
    g.items.push({ line: i, item: num });
  }

  return groups;
}

function getTouchedBlocks(lines: string[], touched: number[]): ListBlock[] {
  const allBlocks = getAllListBlocks(lines);
  const result: ListBlock[] = [];
  for (const b of allBlocks) {
    if (touched.some((t) => t >= b.start && t <= b.end)) {
      result.push(b);
    }
  }
  return result;
}

/** Each group in the blocks containing `touched`: its first item's line, indent length, delimiter, parent line
 *  (null at top level) and its first item's current number. Used to carry starts across an edit. */
export function listGroups(
  lines: string[],
  touched: number[],
): { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[] {
  const touchedBlocks = getTouchedBlocks(lines, touched);
  const out: { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[] = [];
  for (const b of touchedBlocks) {
    const groups = getGroupsInBlock(lines, b);
    for (const g of groups) {
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
 *  at or before it, and returns the starts map for `renumberLists`. */
export function matchGroupStarts(
  oldGroups: { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[],
  newGroups: { first: number; indent: number; delimiter: "." | ")"; parent: number | null; start: number }[],
  mappedFirstLine: (oldFirst: number) => number,
): Map<number, number> {
  const starts = new Map<number, number>();
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
      starts.set(ng.first, bestOld.start);
    }
  }
  return starts;
}

/** Rule 5 on plain lines: renumber the groups of the list blocks containing the `touched` line indices. `starts`
 *  maps a group's first-item line index (in `lines`) to the start it must have; a group not in it starts at its
 *  first item's current number. */
export function renumberLists(lines: string[], touched: number[], starts?: Map<number, number>): LineEdit[] {
  const touchedBlocks = getTouchedBlocks(lines, touched);
  const edits: LineEdit[] = [];
  const newNumbers = new Map<number, number[]>();

  for (const b of touchedBlocks) {
    const groups = getGroupsInBlock(lines, b);
    for (const g of groups) {
      const start = starts?.get(g.first) ?? g.start;
      const isDotted = g.items[0].item.numbers.length > 1;

      let prefix: number[] = [];
      if (isDotted && g.parent !== null) {
        prefix = newNumbers.get(g.parent) ?? parseNumberedItem(lines[g.parent])?.numbers ?? [];
      }

      for (let j = 0; j < g.items.length; j++) {
        const lineIdx = g.items[j].line;
        const seq = start + j;
        const itemNumbers = isDotted && prefix.length > 0 ? [...prefix, seq] : [seq];
        newNumbers.set(lineIdx, itemNumbers);

        const newMarker = itemNumbers.join(".") + g.delimiter;
        const oldItem = g.items[j].item;
        const newLine = oldItem.indent + newMarker + lines[lineIdx].slice(oldItem.markerEnd);
        if (newLine !== lines[lineIdx]) {
          edits.push({ line: lineIdx, text: newLine });
        }
      }
    }
  }

  return edits.sort((a, b) => a.line - b.line);
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
    const textCol = indentLen(P.indent) + P.marker.length + 1;
    targetIndent = " ".repeat(textCol);
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

  const leadingSpaces = line.match(/^ */)?.[0].length ?? 0;
  if (leadingSpaces === 0 || col !== leadingSpaces) return null;

  const block = getBlockForLine(lines, idx);
  if (!block) return null;

  let P: NumberedItem | null = null;
  for (let i = idx - 1; i >= block.start; i--) {
    const item = parseListItem(lines[i]);
    if (item) {
      if (item.kind === "numbered") {
        P = item;
      }
      break;
    }
  }
  if (!P) return null;

  const textCol = indentLen(P.indent) + P.marker.length + 1;
  if (leadingSpaces !== textCol) return null;

  return line.slice(leadingSpaces);
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
