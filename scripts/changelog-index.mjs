#!/usr/bin/env node
// Generates docs/CHANGELOG.md as an index over the part files in docs/changelog/.
//
// Usage: node scripts/changelog-index.mjs [--check]
//   --check  write nothing; exit 1 if docs/CHANGELOG.md differs from what would be written
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG_PATH = path.join(ROOT, "docs", "CHANGELOG.md");
const PARTS_DIR = path.join(ROOT, "docs", "changelog");
const HEADING_RE = /^## (\d+)\. (.*)$/;

/**
 * Build the index markdown text from sorted part files `{ filename, content }`.
 * Uses CRLF if any part file contains CRLF, otherwise LF.
 *
 * @param {Array<{ filename: string, content: string | Buffer }>} partFiles
 * @returns {string}
 */
export function buildChangelogIndex(partFiles) {
  const sorted = [...partFiles].sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0));
  const texts = sorted.map((part) => ({
    filename: part.filename,
    text: typeof part.content === "string" ? part.content : part.content.toString("utf8"),
  }));

  const eol = texts.some((p) => p.text.includes("\r\n")) ? "\r\n" : "\n";

  const lines = [
    "# ChronoNote — Changelog",
    "",
    "The decision log: every change, numbered, with the reason behind it. The entries live in `docs/changelog/`, one",
    "file per hundred. A new entry goes at the end of the last file, with a `**Status: on main, not released yet.**`",
    "line, and this index is regenerated with `node scripts/changelog-index.mjs`.",
    "",
    "- [Introduction and early history](changelog/0000-introduction.md)",
  ];

  for (const part of texts) {
    if (part.filename === "0000-introduction.md") continue;
    /** @type {Array<{ num: number, title: string }>} */
    const entries = [];
    for (const rawLine of part.text.split(/\r?\n/)) {
      const match = HEADING_RE.exec(rawLine);
      if (match) entries.push({ num: Number(match[1]), title: match[2] });
    }
    if (entries.length === 0) continue;

    const rangeMatch = /^(\d+)-(\d+)\.md$/.exec(part.filename);
    const rangeLabel = rangeMatch
      ? `${Number(rangeMatch[1])}-${Number(rangeMatch[2])}`
      : `${entries[0].num}-${entries[entries.length - 1].num}`;

    lines.push("");
    lines.push(`## ${rangeLabel} · [changelog/${part.filename}](changelog/${part.filename})`);
    lines.push("");
    for (const entry of entries) {
      lines.push(`- §${entry.num} ${entry.title}`);
    }
  }

  return lines.join(eol) + eol;
}

function main() {
  const check = process.argv.includes("--check");
  const filenames = fs.existsSync(PARTS_DIR)
    ? fs
        .readdirSync(PARTS_DIR)
        .filter((f) => /^[0-9].*\.md$/.test(f))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    : [];

  const partFiles = filenames.map((filename) => ({
    filename,
    content: fs.readFileSync(path.join(PARTS_DIR, filename), "utf8"),
  }));

  const indexText = buildChangelogIndex(partFiles);

  if (check) {
    const existing = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, "utf8") : "";
    if (existing !== indexText) {
      console.error("changelog-index: docs/CHANGELOG.md is out of date; run `node scripts/changelog-index.mjs`");
      process.exit(1);
    }
    console.log("changelog-index: ok");
    return;
  }

  fs.writeFileSync(CHANGELOG_PATH, indexText, "utf8");
  console.log(`changelog-index: wrote docs/CHANGELOG.md (${indexText.split(/\r?\n/).length - 1} lines)`);
}

const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain =
  process.platform === "win32"
    ? entryFile.toLowerCase() === thisFile.toLowerCase()
    : entryFile === thisFile;
if (isMain) main();
