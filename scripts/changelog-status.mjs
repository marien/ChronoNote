#!/usr/bin/env node
// Fills in the CHANGELOG statuses for a release (§411), instead of editing them by hand at every release:
//   - every section added since the previous release must have a "**Status: ...**" line (otherwise: exit 1);
//   - "on main, not released yet" becomes "released in beta X (early channel only)" or "released in vX";
//   - for a stable release, "released in beta X (early channel only)" of the sections since the previous stable
//     release becomes "released in vX (beta X first)".
// Other statuses ("on main (tooling only ...)") are left as they are.
//
// Usage: node scripts/changelog-status.mjs <version> [--beta] [--check]
//   --check  only report what would change and whether a status is missing; write nothing
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { newHeadings } from "./changelog-headings.mjs";

const [version, ...flags] = process.argv.slice(2);
const beta = flags.includes("--beta");
const check = flags.includes("--check");
if (!version) {
  console.error("usage: changelog-status.mjs <version> [--beta] [--check]");
  process.exit(2);
}
const CHANGELOG_DIR = "docs/changelog";
const git = (...a) => spawnSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout.trim();

// The previous release: any tag for a beta, the previous stable tag (no "-N") for a stable release.
const tags = git("tag", "--list", "v*", "--sort=-v:refname").split("\n").filter(Boolean);
const previous = tags.find((t) => t !== `v${version}` && (beta || !t.includes("-")));
const files = fs.existsSync(CHANGELOG_DIR)
  ? fs
      .readdirSync(CHANGELOG_DIR)
      .filter((f) => /^[0-9].*\.md$/.test(f))
      .sort()
      .map((f) => path.posix.join(CHANGELOG_DIR, f))
  : [];

// New since the previous release: a heading in docs/changelog/ now that was in neither the old single
// docs/CHANGELOG.md nor any docs/changelog/ file at that tag (changelog-headings.mjs).
const previousTexts = previous
  ? ["docs/CHANGELOG.md", ...git("ls-tree", "--name-only", previous, `${CHANGELOG_DIR}/`).split("\n").filter(Boolean)].map(
      (p) => git("show", `${previous}:${p}`),
    )
  : [];
const added = previous ? newHeadings(files.map((f) => fs.readFileSync(f, "utf8")), previousTexts) : new Set();

const missing = [];
const changes = [];
const pendingWrites = [];
for (const file of files) {
  // A Windows checkout has CRLF line endings: split on either, write back the one the file had (a trailing "\r" made
  // every status pattern miss: the first real use, 0.32.5-7).
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  let fileChanged = false;
  for (let i = 0; i < lines.length; i++) {
    if (!added.has(lines[i].trim())) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith("## ") && !lines[j].startsWith("**Status:")) j++;
    if (j >= lines.length || !lines[j].startsWith("**Status:")) {
      missing.push(lines[i]);
      continue;
    }
    const before = lines[j];
    let after = before;
    if (/^\*\*Status: on main, not released yet\.\*\*$/.test(before)) {
      after = beta ? `**Status: released in beta ${version} (early channel only).**` : `**Status: released in v${version}.**`;
    } else if (!beta) {
      // Also with words after it ("..., also in 0.32.5-2.").
      after = before.replace(/^\*\*Status: released in beta (\S+) \(early channel only\)[^*]*\*\*$/, `**Status: released in v${version} (beta $1 first).**`);
    }
    if (after !== before) {
      changes.push(`${lines[i]}: ${after}`);
      lines[j] = after;
      fileChanged = true;
    }
  }
  if (fileChanged) pendingWrites.push([file, lines.join(eol)]);
}

console.log(`changelog-status: ${added.size} section(s) since ${previous ?? "(no earlier release)"}`);
for (const c of changes) console.log(`  ${c}`);
if (missing.length) {
  console.error(`changelog-status: no **Status:** line in:\n${missing.map((m) => `  ${m}`).join("\n")}`);
  process.exit(1);
}
if (!check) {
  for (const [file, content] of pendingWrites) fs.writeFileSync(file, content);
}
