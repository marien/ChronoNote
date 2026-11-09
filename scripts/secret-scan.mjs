#!/usr/bin/env node
// Secret scan (§453): fails when a file that git would commit, or a line added by a commit not yet on origin/main,
// holds a secret. Run by `npm run verify` (and so by the pre-push hook) and by CI.
//
// Two kinds of check:
// - The real secrets of this project, by their content: the updater signing key and its password, read from
//   src-tauri/updater-signing-key*.local when those files exist (only on the release machine; CI has neither).
//   GitHub's push protection does not know a Tauri/minisign key, so this is the one check that would catch it.
// - Patterns of common secrets: private keys (PEM, minisign/rsign secret keys, also base64-wrapped as Tauri writes
//   them), GitHub, Anthropic, Google, AWS, Slack and Microsoft tokens, JWTs.
//
// Never prints a secret: a hit names the file, the line and the kind of secret only.
// A line that is a known false positive can carry the comment `secret-scan: allow`.
//
// Usage: node scripts/secret-scan.mjs [--no-history] [--key-dir <dir>] [--files <file> ...]
//   --no-history  only the working tree (CI, whose checkout has no history to compare with)
//   --key-dir     where the .local key files are (default the main checkout's src-tauri/, also from a worktree;
//                 tests point it elsewhere)
//   --files       scan these files instead of the working tree and the history
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
// In a worktree the key files are only in the main checkout: look there (the parent of the shared .git folder).
const commonGitDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" });
const mainCheckout = commonGitDir.status === 0 ? path.dirname(commonGitDir.stdout.trim()) : ROOT;
const keyDir = opt("--key-dir") ? path.resolve(opt("--key-dir")) : path.join(mainCheckout, "src-tauri");
const files = args.includes("--files") ? args.slice(args.indexOf("--files") + 1).filter((a) => !a.startsWith("--")) : null;

const ALLOW = "secret-scan: allow";
const TAURI_KEY_PREFIX = "dW50cnVzdGVkIGNvbW1lbnQ6"; // base64 of "untrusted comment:"; Tauri's public key starts so too

const PATTERNS = [
  ["private key (PEM)", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["minisign secret key", /untrusted comment: (?:minisign|rsign) (?:encrypted )?secret key/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["Microsoft refresh token", /\bM\.C\d_[A-Za-z0-9!*$.-]{50,}/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

// The project's own secrets, as strings to look for: the password, and 40-character pieces of the key file's text
// and of what it decodes to (so a part, a re-wrapped or a decoded copy is found too).
function ownSecrets() {
  const needles = [];
  const read = (name) => {
    const p = path.join(keyDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8").replace(/^﻿/, "").trim() : "";
  };
  const password = read("updater-signing-key-password.local");
  if (password.length >= 8) needles.push(["updater signing key password", password]);
  const key = read("updater-signing-key.local");
  if (key.length >= 40) {
    const pieces = (s) => {
      const out = [];
      // Overlapping, so any 50 characters of the key in a row contain a whole piece.
      for (let i = 0; i + 40 <= s.length; i += 10) out.push(s.slice(i, i + 40));
      return out;
    };
    const decoded = Buffer.from(key.replace(/\s+/g, ""), "base64").toString("utf8");
    const decodedLines = decoded.split(/\r?\n/).filter((l) => l.length >= 40 && !l.startsWith("untrusted comment"));
    for (const p of [...pieces(key.replace(/\s+/g, "")), ...decodedLines.flatMap(pieces)]) {
      needles.push(["updater signing key", p]);
    }
  }
  return needles;
}

function scanText(text, where, needles, hits) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.includes(ALLOW)) return;
    const found = new Set();
    for (const [kind, needle] of needles) if (line.includes(needle)) found.add(kind);
    for (const [kind, re] of PATTERNS) if (re.test(line)) found.add(kind);
    for (const m of line.matchAll(new RegExp(`${TAURI_KEY_PREFIX}[A-Za-z0-9+/=]{20,}`, "g"))) {
      const decoded = Buffer.from(m[0], "base64").toString("utf8");
      if (/secret key/i.test(decoded)) found.add("Tauri updater secret key");
    }
    for (const kind of found) hits.push(`${where(i)}: ${kind}`);
  });
}

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
const needles = ownSecrets();
const hits = [];

const scanFile = (rel) => {
  const abs = path.resolve(ROOT, rel);
  let buf;
  try {
    if (!fs.statSync(abs).isFile()) return;
    buf = fs.readFileSync(abs);
  } catch {
    return; // deleted in the working tree
  }
  if (buf.subarray(0, 8000).includes(0)) return; // binary
  scanText(buf.toString("utf8"), (i) => `${rel.replace(/\\/g, "/")}:${i + 1}`, needles, hits);
};

if (files) {
  files.forEach(scanFile);
} else {
  // Everything git would commit: tracked files and untracked ones that are not ignored.
  const list = git("ls-files", "-z", "--cached", "--others", "--exclude-standard").stdout.split("\0").filter(Boolean);
  for (const rel of list) if (rel !== "scripts/secret-scan.mjs") scanFile(rel);

  // Lines added by commits that origin/main does not have yet (a secret added and then removed again is still in
  // the history that a push would publish).
  if (!args.includes("--no-history") && git("rev-parse", "--verify", "-q", "origin/main").status === 0) {
    const log = git("log", "-p", "--no-color", "--no-ext-diff", "--format=commit %h", "origin/main..HEAD").stdout;
    let commit = "";
    let file = "";
    const added = [];
    for (const line of log.split("\n")) {
      if (line.startsWith("commit ")) commit = line.slice(7);
      else if (line.startsWith("+++ ")) file = line.slice(4).replace(/^b\//, "");
      else if (line.startsWith("+") && file !== "scripts/secret-scan.mjs") added.push([`${commit} ${file}`, line.slice(1)]);
    }
    for (const [where, text] of added) scanText(text, () => `commit ${where}`, needles, hits);
  }
}

if (hits.length > 0) {
  console.log(`secret-scan: FOUND ${hits.length} possible secret(s):`);
  for (const h of [...new Set(hits)]) console.log(`  ${h}`);
  console.log(`secret-scan: remove it (and from the commits, before pushing), or mark a false positive with "${ALLOW}".`);
  process.exit(1);
}
console.log(`secret-scan: clean${needles.length > 0 ? " (including the updater signing key and its password)" : ""}`);
