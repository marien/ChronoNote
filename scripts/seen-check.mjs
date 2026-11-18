#!/usr/bin/env node
// Checks that released changelog entries from §479 on are either seen by Marien or tracked in docs/open-checks.md,
// and that no open-checks row names only entries already seen.
//
// Usage: node scripts/seen-check.mjs [--list]
//   --list  print every released, unseen entry >= 479 with its title and the open-checks row(s) naming it

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entriesIn } from "./changelog-headings.mjs";

export const SEEN_START_SECTION = 479;

const SEEN_LINE_RE = /^\*\*Seen by Marien:\*\*\s+(?:\d{4}-\d{2}-\d{2}(?:\s*,\s*|\s+)\S.*|not needed\s+\S.*)$/;

/**
 * Returns true when `line` is a valid `**Seen by Marien:**` line (either `YYYY-MM-DD, <where>` or `not needed <reason>`).
 * @param {string} line
 * @returns {boolean}
 */
export function isSeenLine(line) {
  return SEEN_LINE_RE.test(line.trimEnd());
}

/**
 * Parses numbered changelog entries from one changelog file's text.
 * An entry is seen only when a valid `**Seen by Marien:**` line appears after its `**Status:` line.
 * @param {string} text
 * @returns {Array<{ num: number, title: string, status: string, released: boolean, seen: boolean }>}
 */
export function parseChangelogEntries(text) {
  return entriesIn(text).map(({ num, title, lines }) => {
    const statusIndex = lines.findIndex((l) => l.trim().startsWith("**Status:"));
    const status = statusIndex !== -1 ? lines[statusIndex].trim() : "";
    const released = status.startsWith("**Status: released");
    const seen =
      statusIndex !== -1 && lines.slice(statusIndex + 1).some((line) => isSeenLine(line));
    return { num, title, status, released, seen };
  });
}

/**
 * Expands a Section cell from docs/open-checks.md (e.g. "§481-§486", "§493, §495", "§485", "none")
 * into the list of section numbers it names.
 * @param {string} cell
 * @returns {number[]}
 */
export function sectionsInCell(cell) {
  /** @type {number[]} */
  const result = [];
  const re = /§(\d+)(?:\s*[-–]\s*§?(\d+))?/g;
  let match;
  while ((match = re.exec(cell)) !== null) {
    const start = Number(match[1]);
    const end = match[2] !== undefined ? Number(match[2]) : start;
    if (end >= start) {
      for (let n = start; n <= end; n++) {
        result.push(n);
      }
    } else {
      result.push(start);
    }
  }
  return result;
}

/**
 * Parses markdown table rows from docs/open-checks.md.
 * @param {string} text
 * @returns {Array<{ since: string, what: string, where: string, section: string, sections: number[] }>}
 */
export function parseOpenChecks(text) {
  /** @type {Array<{ since: string, what: string, where: string, section: string, sections: number[] }>} */
  const rows = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells.every((c) => /^:?-{1,}:?$/.test(c))) continue;
    if (cells[0].toLowerCase() === "since" && cells[3].toLowerCase() === "section") continue;
    const [since, what, where, section] = cells;
    rows.push({
      since,
      what,
      where,
      section,
      sections: sectionsInCell(section),
    });
  }
  return rows;
}

/**
 * Compares parsed changelog entries against open-checks rows from SEEN_START_SECTION onward.
 * @param {Array<{ num: number, title?: string, status?: string, released?: boolean, seen: boolean }>} entries
 * @param {Array<{ what: string, section: string, sections?: number[] }>} rows
 */
export function checkSeen(entries, rows) {
  /** @type {Map<number, { num: number, title?: string, status?: string, released?: boolean, seen: boolean }>} */
  const entryByNum = new Map();
  for (const entry of entries) {
    entryByNum.set(entry.num, entry);
  }

  /** @type {Set<number>} */
  const coveredSections = new Set();
  const rowList = rows.map((row) => {
    const sections = row.sections ?? sectionsInCell(row.section);
    for (const n of sections) {
      coveredSections.add(n);
    }
    return { row, sections };
  });

  const missing = [];
  for (const entry of entries) {
    if (entry.num < SEEN_START_SECTION) continue;
    const isReleased =
      entry.released !== undefined
        ? entry.released
        : typeof entry.status === "string" && entry.status.startsWith("**Status: released");
    if (!isReleased) continue;
    if (entry.seen) continue;
    if (!coveredSections.has(entry.num)) {
      missing.push(entry);
    }
  }

  const stale = [];
  for (const { row, sections } of rowList) {
    if (sections.length === 0) continue;
    if (sections.every((n) => entryByNum.get(n)?.seen === true)) {
      stale.push(row);
    }
  }

  return { missing, stale };
}

/**
 * @typedef {{ argv: string[], platform: string, exit: (code: number) => never }} NodeProcess
 */

/** @returns {NodeProcess | undefined} */
function getProcess() {
  return (/** @type {{ process?: NodeProcess }} */ (/** @type {unknown} */ (globalThis))).process;
}

function main() {
  const proc = getProcess();
  if (!proc) return;

  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const partsDir = path.join(ROOT, "docs", "changelog");
  const openChecksPath = path.join(ROOT, "docs", "open-checks.md");

  const filenames = fs.existsSync(partsDir)
    ? fs
        .readdirSync(partsDir)
        .filter((f) => /^[0-9].*\.md$/.test(f))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    : [];

  const entries = filenames.flatMap((filename) =>
    parseChangelogEntries(fs.readFileSync(path.join(partsDir, filename), "utf8")),
  );
  const openChecksText = fs.existsSync(openChecksPath) ? fs.readFileSync(openChecksPath, "utf8") : "";
  const rows = parseOpenChecks(openChecksText);

  if (proc.argv.slice(2).includes("--list")) {
    const unseen = entries.filter(
      (entry) => entry.num >= SEEN_START_SECTION && entry.released && !entry.seen,
    );
    for (const entry of unseen) {
      const matchingRows = rows.filter((r) => r.sections.includes(entry.num));
      console.log(`§${entry.num} ${entry.title}`);
      if (matchingRows.length === 0) {
        console.log("  row: (none)");
      } else {
        for (const row of matchingRows) {
          console.log(`  row [${row.section}]: ${row.what}`);
        }
      }
    }
    proc.exit(0);
  }

  const { missing, stale } = checkSeen(entries, rows);
  if (missing.length > 0 || stale.length > 0) {
    for (const entry of missing) {
      console.error(
        `§${entry.num} is released and not seen by Marien: add an open-checks row or a Seen line.`,
      );
    }
    for (const row of stale) {
      console.error(`the row '${row.what}' names only seen entries: remove it.`);
    }
    proc.exit(1);
  }

  console.log("seen-check: ok");
  proc.exit(0);
}

const proc = getProcess();
if (proc && proc.argv && proc.argv[1]) {
  const entry = path.resolve(proc.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  const same = proc.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
  if (same) main();
}
