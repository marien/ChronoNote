#!/usr/bin/env node
// One-time tool that splits docs/CHANGELOG.md into docs/changelog/0000-introduction.md and
// 100-entry part files without altering any byte.
//
// Usage: node scripts/changelog-split.mjs [--allow-irregularities]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG_PATH = path.join(ROOT, "docs", "CHANGELOG.md");
const OUT_DIR = path.join(ROOT, "docs", "changelog");
const HEADING_RE = /^## (\d+)\. (.*)$/;

/**
 * Split a raw CHANGELOG Buffer into `0000-introduction.md` and 100-entry part Buffers
 * without altering any byte.
 *
 * @param {Buffer} buf
 * @returns {{
 *   parts: Array<{ filename: string, content: Buffer }>,
 *   entries: Array<{ num: number, title: string, start: number, end: number }>,
 *   irregularities: string[]
 * }}
 */
export function splitChangelog(buf) {
  /** @type {Array<{ num: number, title: string, start: number, end: number }>} */
  const entries = [];
  let pos = 0;

  while (pos < buf.length) {
    const nl = buf.indexOf(0x0a, pos);
    const lineEnd = nl === -1 ? buf.length : nl + 1;
    const textEnd = nl === -1 ? buf.length : nl > pos && buf[nl - 1] === 0x0d ? nl - 1 : nl;
    const line = buf.subarray(pos, textEnd).toString("utf8");
    const match = HEADING_RE.exec(line);
    if (match) {
      if (entries.length > 0) entries[entries.length - 1].end = pos;
      entries.push({
        num: Number(match[1]),
        title: match[2],
        start: pos,
        end: buf.length,
      });
    }
    pos = lineEnd;
  }

  /** @type {string[]} */
  const irregularities = [];
  const seen = new Set();
  for (let i = 0; i < entries.length; i++) {
    const { num } = entries[i];
    if (seen.has(num)) irregularities.push(`duplicate entry number ${num}`);
    seen.add(num);
    if (i === 0) {
      if (num !== 1) irregularities.push(`first entry is ${num}, expected 1`);
    } else {
      const prev = entries[i - 1].num;
      if (num <= prev) {
        irregularities.push(`entry ${num} follows ${prev} (not in rising order)`);
      } else if (num !== prev + 1) {
        irregularities.push(`gap between ${prev} and ${num}`);
      }
    }
  }

  const introEnd = entries.length > 0 ? entries[0].start : buf.length;
  /** @type {Array<{ filename: string, content: Buffer }>} */
  const parts = [{ filename: "0000-introduction.md", content: buf.subarray(0, introEnd) }];

  for (let bucket = 0; bucket * 100 < entries.length; bucket++) {
    const startIdx = bucket * 100;
    const endIdx = Math.min((bucket + 1) * 100, entries.length) - 1;
    const from = String(startIdx + 1).padStart(4, "0");
    const to = String((bucket + 1) * 100).padStart(4, "0");
    parts.push({
      filename: `${from}-${to}.md`,
      content: buf.subarray(entries[startIdx].start, entries[endIdx].end),
    });
  }

  const joined = Buffer.concat(parts.map((p) => p.content));
  if (Buffer.compare(joined, buf) !== 0) {
    throw new Error("splitChangelog: concatenated parts do not match input buffer");
  }

  return { parts, entries, irregularities };
}

function main() {
  const allowIrregularities = process.argv.includes("--allow-irregularities");
  const original = fs.readFileSync(CHANGELOG_PATH);
  const { parts, entries, irregularities } = splitChangelog(original);

  if (irregularities.length > 0) {
    console.error(`changelog-split: ${irregularities.length} numbering irregularity(ies):`);
    for (const msg of irregularities) console.error(`  - ${msg}`);
    if (!allowIrregularities) {
      console.error("changelog-split: stopping (pass --allow-irregularities to split in sequence anyway)");
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const part of parts) {
    fs.writeFileSync(path.join(OUT_DIR, part.filename), part.content);
  }

  const writtenFiles = fs
    .readdirSync(OUT_DIR)
    .filter((f) => /^[0-9].*\.md$/.test(f))
    .sort();
  const rebuilt = Buffer.concat(writtenFiles.map((f) => fs.readFileSync(path.join(OUT_DIR, f))));
  if (Buffer.compare(rebuilt, original) !== 0) {
    console.error("changelog-split: concatenated files on disk do not match original docs/CHANGELOG.md");
    process.exit(1);
  }

  console.log(
    `changelog-split: wrote ${parts.length} files (${entries.length} entries, ${original.length} bytes) to docs/changelog/`,
  );
}

const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain =
  process.platform === "win32"
    ? entryFile.toLowerCase() === thisFile.toLowerCase()
    : entryFile === thisFile;
if (isMain) main();
