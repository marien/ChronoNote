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

const [version, ...flags] = process.argv.slice(2);
const beta = flags.includes("--beta");
const check = flags.includes("--check");
if (!version) {
  console.error("usage: changelog-status.mjs <version> [--beta] [--check]");
  process.exit(2);
}
const FILE = "docs/CHANGELOG.md";
const git = (...a) => spawnSync("git", a, { encoding: "utf8" }).stdout.trim();

// The previous release: any tag for a beta, the previous stable tag (no "-N") for a stable release.
const tags = git("tag", "--list", "v*", "--sort=-v:refname").split("\n").filter(Boolean);
const previous = tags.find((t) => t !== `v${version}` && (beta || !t.includes("-")));
const added = new Set(
  (previous ? git("diff", previous, "--", FILE) : "")
    .split("\n")
    .filter((l) => /^\+## \d+\./.test(l))
    .map((l) => l.slice(1).trim()),
);

const lines = fs.readFileSync(FILE, "utf8").split("\n");
const missing = [];
const changes = [];
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
  }
}

console.log(`changelog-status: ${added.size} section(s) since ${previous ?? "(no earlier release)"}`);
for (const c of changes) console.log(`  ${c}`);
if (missing.length) {
  console.error(`changelog-status: no **Status:** line in:\n${missing.map((m) => `  ${m}`).join("\n")}`);
  process.exit(1);
}
if (!check && changes.length) fs.writeFileSync(FILE, lines.join("\n"));
