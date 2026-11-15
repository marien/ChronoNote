#!/usr/bin/env node
// Agent report (P3): prints a single comparable end-of-run summary from git, scanTests, and verify.mjs.
//
// Usage: node scripts/agent-report.mjs [--base <ref>] [--no-verify]
//   --base <ref>  base ref to compare against via merge-base with HEAD (default: main)
//   --no-verify   skip running scripts/verify.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanTests } from "./test-guard.mjs";

const UNUSUAL_EXACT = new Set([
  "docs/CHANGELOG.md",
  "CLAUDE.local.md",
  "package-lock.json",
  "src-tauri/Cargo.lock",
]);

const UNUSUAL_PREFIXES = [
  "docs/changelog/",
  "website/webapp/",
  "website/demo-app/",
  ".github/",
];

/**
 * Returns true when `relPath` falls outside the usual coder directories/files.
 * @param {string} relPath
 * @returns {boolean}
 */
export function isOutsideUsualPlaces(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  if (UNUSUAL_EXACT.has(normalized)) return true;
  return UNUSUAL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * @typedef {{ hash: string, subject: string }} ReportCommit
 * @typedef {{ status: string, path: string, oldPath?: string, added: number, deleted: number }} ReportFileStat
 * @typedef {{ added: number, removed: string[], moreSwitchedOff: number }} ReportTestsDiff
 * @typedef {{
 *   branch: string,
 *   base: string,
 *   mergeBase: string,
 *   head: string,
 *   clean: boolean,
 *   uncommittedFiles?: string[],
 *   commits: ReportCommit[],
 *   files: ReportFileStat[],
 *   tests: ReportTestsDiff,
 *   verifyLines: string[],
 *   verifyPassed: boolean,
 *   verifySkipped?: boolean
 * }} ReportFacts
 */

/**
 * Formats collected repository, test, and verification facts into the standard agent report.
 * @param {ReportFacts} facts
 * @returns {{ text: string, passed: boolean, reasons: string[] }}
 */
export function formatAgentReport(facts) {
  const uncommitted = facts.uncommittedFiles ?? [];
  const cleanLabel = facts.clean
    ? "yes"
    : uncommitted.length > 0
      ? `no (${uncommitted.length} ${uncommitted.length === 1 ? "file" : "files"})`
      : "no";

  /** @type {string[]} */
  const lines = [
    "## Agent report",
    `branch: ${facts.branch}  base: ${facts.base} (merge base ${facts.mergeBase})  head: ${facts.head}  clean tree: ${cleanLabel}`,
  ];

  if (!facts.clean && uncommitted.length > 0) {
    lines.push("uncommitted:");
    for (const item of uncommitted) {
      lines.push(`  ${item}`);
    }
  }

  lines.push(`commits (${facts.commits.length}):`);
  for (const commit of facts.commits) {
    lines.push(`  ${commit.hash} ${commit.subject}`);
  }

  let totalAdded = 0;
  let totalDeleted = 0;
  for (const file of facts.files) {
    totalAdded += file.added;
    totalDeleted += file.deleted;
  }

  lines.push(`files changed (${facts.files.length}): +${totalAdded} -${totalDeleted}`);
  for (const file of facts.files) {
    const displayPath = file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path;
    lines.push(`  ${file.status} ${displayPath}  +${file.added} -${file.deleted}`);
  }

  /** @type {string[]} */
  const outside = [];
  /** @type {Set<string>} */
  const seenOutside = new Set();
  for (const file of facts.files) {
    const candidates = file.oldPath ? [file.oldPath, file.path] : [file.path];
    for (const candidate of candidates) {
      const normalized = candidate.replace(/\\/g, "/");
      if (isOutsideUsualPlaces(normalized) && !seenOutside.has(normalized)) {
        seenOutside.add(normalized);
        outside.push(normalized);
      }
    }
  }

  if (outside.length === 0) {
    lines.push("outside the usual places: none");
  } else {
    lines.push("outside the usual places:");
    for (const p of outside) {
      lines.push(`  ${p}`);
    }
  }

  lines.push(
    `tests: +${facts.tests.added} added, ${facts.tests.removed.length} removed, ${facts.tests.moreSwitchedOff} more switched off`,
  );
  for (const title of facts.tests.removed) {
    lines.push(`  ${title}`);
  }

  if (facts.verifySkipped) {
    lines.push("checks: skipped (--no-verify)");
  } else {
    lines.push("checks:");
    for (const line of facts.verifyLines) {
      lines.push(`  ${line}`);
    }
  }

  /** @type {string[]} */
  const reasons = [];
  if (!facts.verifySkipped && !facts.verifyPassed) {
    reasons.push("verify failed");
  }
  if (!facts.clean) {
    reasons.push("uncommitted changes");
  }
  if (facts.tests.removed.length > 0) {
    const n = facts.tests.removed.length;
    reasons.push(`${n} ${n === 1 ? "test" : "tests"} removed`);
  }
  if (facts.tests.moreSwitchedOff > 0) {
    const n = facts.tests.moreSwitchedOff;
    reasons.push(`${n} ${n === 1 ? "test" : "tests"} switched off`);
  }

  const passed = reasons.length === 0;
  lines.push(`result: ${passed ? "PASS" : `FAIL: ${reasons.join(", ")}`}`);

  return { text: lines.join("\n"), passed, reasons };
}

/**
 * @param {string} relPath
 * @returns {boolean}
 */
function isTestFile(relPath) {
  return /^src\/.*\.test\.ts$/.test(relPath) || /^tests\/.*\.spec\.ts$/.test(relPath);
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {{ status: number | null, stdout: string, stderr: string, error?: Error }}
 */
function runGit(root, args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Reads all listed paths at `ref` using a single `git cat-file --batch` call.
 * @param {string} root
 * @param {string} ref
 * @param {string[]} paths
 * @returns {Map<string, string>}
 */
function readBaseFiles(root, ref, paths) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (paths.length === 0) return out;
  const spec = paths.map((p) => `${ref}:${p}\n`).join("");
  const res = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: spec,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  const decoder = new TextDecoder();
  if (res.status !== 0) {
    const errText = res.stderr ? decoder.decode(res.stderr) : res.error?.message;
    throw new Error(`git cat-file --batch failed: ${errText}`);
  }
  const buf = /** @type {Uint8Array} */ (res.stdout);
  let offset = 0;
  for (const p of paths) {
    const nl = buf.indexOf(10, offset);
    if (nl === -1) break;
    const header = decoder.decode(buf.subarray(offset, nl));
    offset = nl + 1;
    if (header.endsWith(" missing")) continue;
    const parts = header.split(" ");
    const size = parseInt(parts[2], 10);
    if (!Number.isFinite(size)) {
      throw new Error(`Unexpected git cat-file header for ${p}: ${header}`);
    }
    out.set(p, decoder.decode(buf.subarray(offset, offset + size)));
    offset += size + 1;
  }
  return out;
}

/**
 * Parses `git diff --name-status -z` and `git diff --numstat -z` between `mergeBase` and `HEAD`.
 * @param {string} root
 * @param {string} mergeBase
 * @returns {ReportFileStat[]}
 */
function collectFileStats(root, mergeBase) {
  const nsRes = runGit(root, ["diff", "--name-status", "-z", mergeBase, "HEAD"]);
  if (nsRes.status !== 0) {
    throw new Error(`git diff --name-status failed: ${(nsRes.stderr || "").trim()}`);
  }
  const numRes = runGit(root, ["diff", "--numstat", "-z", mergeBase, "HEAD"]);
  if (numRes.status !== 0) {
    throw new Error(`git diff --numstat failed: ${(numRes.stderr || "").trim()}`);
  }

  /** @type {Map<string, { status: string, oldPath?: string }>} */
  const statusMap = new Map();
  const nsTokens = nsRes.stdout.split("\0");
  for (let i = 0; i < nsTokens.length; ) {
    const rawStatus = nsTokens[i++];
    if (!rawStatus) break;
    const status = rawStatus[0];
    if (status === "R" || status === "C") {
      const oldPath = (nsTokens[i++] ?? "").replace(/\\/g, "/");
      const newPath = (nsTokens[i++] ?? "").replace(/\\/g, "/");
      statusMap.set(newPath, { status, oldPath });
    } else {
      const filePath = (nsTokens[i++] ?? "").replace(/\\/g, "/");
      statusMap.set(filePath, { status });
    }
  }

  /** @type {ReportFileStat[]} */
  const files = [];
  const numTokens = numRes.stdout.split("\0");
  for (let i = 0; i < numTokens.length; ) {
    const entry = numTokens[i++];
    if (!entry) break;
    const firstTab = entry.indexOf("\t");
    const secondTab = entry.indexOf("\t", firstTab + 1);
    const addedStr = entry.slice(0, firstTab);
    const deletedStr = entry.slice(firstTab + 1, secondTab);
    const rest = entry.slice(secondTab + 1);

    let filePath;
    let oldPath;
    if (rest === "") {
      // Rename/copy in `-z --numstat` puts NUL before oldPath and newPath.
      oldPath = (numTokens[i++] ?? "").replace(/\\/g, "/");
      filePath = (numTokens[i++] ?? "").replace(/\\/g, "/");
    } else {
      filePath = rest.replace(/\\/g, "/");
    }

    const added = addedStr === "-" ? 0 : parseInt(addedStr, 10) || 0;
    const deleted = deletedStr === "-" ? 0 : parseInt(deletedStr, 10) || 0;
    const info = statusMap.get(filePath);
    files.push({
      status: info?.status ?? "M",
      path: filePath,
      ...(info?.oldPath ? { oldPath: info.oldPath } : oldPath ? { oldPath } : {}),
      added,
      deleted,
    });
  }

  return files;
}

/**
 * Compares test titles and switched-off counts at `mergeBase` vs working tree.
 * @param {string} root
 * @param {string} mergeBase
 * @returns {ReportTestsDiff}
 */
function collectTestsDiff(root, mergeBase) {
  const baseTree = runGit(root, ["ls-tree", "-r", "-z", "--name-only", mergeBase, "--", "src", "tests"]);
  if (baseTree.status !== 0) {
    throw new Error(`git ls-tree failed: ${(baseTree.stderr || "").trim()}`);
  }
  const basePaths = baseTree.stdout
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"))
    .filter(isTestFile);
  const baseContents = readBaseFiles(root, mergeBase, basePaths);

  const nowList = runGit(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "src", "tests"]);
  if (nowList.status !== 0) {
    throw new Error(`git ls-files failed: ${(nowList.stderr || "").trim()}`);
  }
  const nowPaths = nowList.stdout
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"))
    .filter(isTestFile);

  /** @type {Map<string, { titles: string[], off: number }>} */
  const nowScanned = new Map();
  /** @type {Set<string>} */
  const allNowTitles = new Set();
  for (const rel of nowPaths) {
    let source;
    try {
      source = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    const result = scanTests(source);
    nowScanned.set(rel, result);
    for (const title of result.titles) allNowTitles.add(title);
  }

  /** @type {Map<string, { titles: string[], off: number }>} */
  const baseScanned = new Map();
  /** @type {Set<string>} */
  const allBaseTitles = new Set();
  for (const rel of basePaths) {
    const baseSource = baseContents.get(rel);
    if (baseSource === undefined) continue;
    const result = scanTests(baseSource);
    baseScanned.set(rel, result);
    for (const title of result.titles) allBaseTitles.add(title);
  }

  let added = 0;
  for (const rel of nowPaths) {
    const result = nowScanned.get(rel);
    if (!result) continue;
    for (const title of result.titles) {
      if (!allBaseTitles.has(title)) added++;
    }
  }

  /** @type {string[]} */
  const removed = [];
  let moreSwitchedOff = 0;
  for (const rel of basePaths) {
    const baseResult = baseScanned.get(rel);
    if (!baseResult) continue;
    for (const title of baseResult.titles) {
      if (!allNowTitles.has(title)) {
        removed.push(`${rel} \u203a ${title}`);
      }
    }
    const nowResult = nowScanned.get(rel);
    if (nowResult && nowResult.off > baseResult.off) {
      moreSwitchedOff += nowResult.off - baseResult.off;
    }
  }

  return { added, removed, moreSwitchedOff };
}

/**
 * @param {string[]} argv
 * @returns {{ base: string, noVerify: boolean }}
 */
function parseCliArgs(argv) {
  let base = "main";
  let noVerify = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base" && i + 1 < argv.length) {
      base = argv[++i];
    } else if (arg.startsWith("--base=")) {
      base = arg.slice("--base=".length);
    } else if (arg === "--no-verify") {
      noVerify = true;
    }
  }
  return { base, noVerify };
}

/**
 * @typedef {{ argv: string[], execPath: string, platform: string, exit: (code: number) => never }} NodeProcess
 */

/** @returns {NodeProcess | undefined} */
function getProcess() {
  return (/** @type {{ process?: NodeProcess }} */ (/** @type {unknown} */ (globalThis))).process;
}

function main() {
  const proc = getProcess();
  if (!proc) return;
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { base, noVerify } = parseCliArgs(proc.argv.slice(2));

  const mb = runGit(ROOT, ["merge-base", base, "HEAD"]);
  if (mb.status !== 0) {
    console.error(`agent-report: failed to find merge-base of ${base} and HEAD: ${(mb.stderr || "").trim()}`);
    proc.exit(1);
  }
  const mergeBaseFull = mb.stdout.trim();
  const mergeBaseShort = runGit(ROOT, ["rev-parse", "--short", mergeBaseFull]).stdout.trim() || mergeBaseFull.slice(0, 7);

  const branch = runGit(ROOT, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const head = runGit(ROOT, ["rev-parse", "--short", "HEAD"]).stdout.trim();

  const statusRes = runGit(ROOT, ["status", "--porcelain", "-uall"]);
  if (statusRes.status !== 0) {
    console.error(`agent-report: git status failed: ${(statusRes.stderr || "").trim()}`);
    proc.exit(1);
  }
  const uncommittedFiles = statusRes.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  const clean = uncommittedFiles.length === 0;

  const logRes = runGit(ROOT, ["log", "--format=%h%x00%s", `${mergeBaseFull}..HEAD`]);
  if (logRes.status !== 0) {
    console.error(`agent-report: git log failed: ${(logRes.stderr || "").trim()}`);
    proc.exit(1);
  }
  /** @type {ReportCommit[]} */
  const commits = logRes.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const sep = line.indexOf("\0");
      if (sep === -1) return { hash: line, subject: "" };
      return { hash: line.slice(0, sep), subject: line.slice(sep + 1) };
    });

  const files = collectFileStats(ROOT, mergeBaseFull);
  const tests = collectTestsDiff(ROOT, mergeBaseFull);

  /** @type {string[]} */
  let verifyLines = [];
  let verifyPassed = true;
  if (!noVerify) {
    const verifyRes = spawnSync(proc.execPath, [path.join(ROOT, "scripts", "verify.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const combined = `${verifyRes.stdout ?? ""}${verifyRes.stderr ?? ""}`;
    verifyLines = combined
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => /^verify:\s+(ok|FAIL)\b/.test(l));
    verifyPassed = verifyRes.status === 0 && !verifyRes.error;
  }

  const report = formatAgentReport({
    branch,
    base,
    mergeBase: mergeBaseShort,
    head,
    clean,
    uncommittedFiles,
    commits,
    files,
    tests,
    verifyLines,
    verifyPassed,
    verifySkipped: noVerify,
  });

  console.log(report.text);
  proc.exit(report.passed ? 0 : 1);
}

const proc = getProcess();
if (proc && proc.argv && proc.argv[1]) {
  const entry = path.resolve(proc.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  const same = proc.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
  if (same) main();
}
