#!/usr/bin/env node
// Test guard (T3): fails when a branch or working tree removes or switches off existing tests
// without saying so (`--allow "<reason>"` or `Tests removed: <reason>` in TEST_GUARD_PR_BODY).
//
// Usage: node scripts/test-guard.mjs [--base <ref>] [--allow "<reason>"]
//   --base   base ref to compare against via merge-base with HEAD (default: origin/main)
//   --allow  reason allowing removed or switched-off tests

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "void",
  "delete",
  "await",
  "yield",
  "throw",
  "case",
  "in",
  "of",
  "instanceof",
  "new",
  "else",
  "do",
]);

const CHAIN_MODIFIERS = new Set(["only", "concurrent", "sequential", "serial", "parallel"]);
const OFF_MODIFIERS = new Set(["skip", "fixme", "todo"]);

/**
 * @param {number} code
 * @returns {boolean}
 */
function isIdentStart(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
}

/**
 * @param {number} code
 * @returns {boolean}
 */
function isIdentPart(code) {
  return isIdentStart(code) || (code >= 48 && code <= 57);
}

/**
 * @param {string} source
 * @param {number} pos
 * @returns {{ ch: string, next: number }}
 */
function decodeEscape(source, pos) {
  const next = pos + 1;
  if (next >= source.length) return { ch: "\\", next };
  const esc = source[next];
  switch (esc) {
    case "n":
      return { ch: "\n", next: next + 1 };
    case "r":
      return { ch: "\r", next: next + 1 };
    case "t":
      return { ch: "\t", next: next + 1 };
    case "b":
      return { ch: "\b", next: next + 1 };
    case "f":
      return { ch: "\f", next: next + 1 };
    case "v":
      return { ch: "\v", next: next + 1 };
    case "\n":
      return { ch: "", next: next + 1 };
    case "\r":
      return { ch: "", next: source[next + 1] === "\n" ? next + 2 : next + 1 };
    case "0": {
      const after = source.charCodeAt(next + 1);
      if (!(after >= 48 && after <= 57)) return { ch: "\0", next: next + 1 };
      return { ch: esc, next: next + 1 };
    }
    case "x": {
      const hex = source.slice(next + 1, next + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) return { ch: String.fromCharCode(parseInt(hex, 16)), next: next + 3 };
      return { ch: esc, next: next + 1 };
    }
    case "u": {
      if (source[next + 1] === "{") {
        const close = source.indexOf("}", next + 2);
        if (close !== -1) {
          const hex = source.slice(next + 2, close);
          if (/^[0-9a-fA-F]+$/.test(hex)) {
            const cp = parseInt(hex, 16);
            if (cp <= 0x10ffff) return { ch: String.fromCodePoint(cp), next: close + 1 };
          }
        }
      } else {
        const hex = source.slice(next + 1, next + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) return { ch: String.fromCharCode(parseInt(hex, 16)), next: next + 5 };
      }
      return { ch: esc, next: next + 1 };
    }
    default:
      return { ch: esc, next: next + 1 };
  }
}

/**
 * @param {string} source
 * @param {number} pos
 * @returns {{ value: string | null, end: number }}
 */
function readQuotedString(source, pos) {
  const quote = source[pos];
  let i = pos + 1;
  let out = "";
  while (i < source.length) {
    const ch = source[i];
    if (ch === quote) return { value: out, end: i + 1 };
    if (ch === "\\") {
      const dec = decodeEscape(source, i);
      out += dec.ch;
      i = dec.next;
    } else if (ch === "\n" || ch === "\r") {
      return { value: null, end: i };
    } else {
      out += ch;
      i++;
    }
  }
  return { value: null, end: i };
}

/**
 * Skips whitespace and JS comments starting at `pos`.
 * @param {string} source
 * @param {number} pos
 * @returns {number}
 */
function skipTrivia(source, pos) {
  let i = pos;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
      i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < len && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      i = close === -1 ? len : close + 2;
      continue;
    }
    break;
  }
  return i;
}

/**
 * Skips a regex literal starting at `pos` (where `source[pos] === "/"`).
 * @param {string} source
 * @param {number} pos
 * @returns {number}
 */
function skipRegex(source, pos) {
  let i = pos + 1;
  let inClass = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
    } else if (ch === "[") {
      inClass = true;
      i++;
    } else if (ch === "]") {
      inClass = false;
      i++;
    } else if (ch === "/" && !inClass) {
      i++;
      while (i < source.length && isIdentPart(source.charCodeAt(i))) i++;
      return i;
    } else if (ch === "\n" || ch === "\r") {
      return i;
    } else {
      i++;
    }
  }
  return i;
}

/**
 * Reads a template literal starting at `pos` (where `source[pos] === "\`"`).
 * Returns `{ value: string | null, end: number }`; `value` is `null` if `${` appears.
 * @param {string} source
 * @param {number} pos
 * @returns {{ value: string | null, end: number }}
 */
function readTemplate(source, pos) {
  let i = pos + 1;
  let out = "";
  let hasInterpolation = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "`") {
      return { value: hasInterpolation ? null : out, end: i + 1 };
    }
    if (ch === "\\") {
      const dec = decodeEscape(source, i);
      if (!hasInterpolation) out += dec.ch;
      i = dec.next;
    } else if (ch === "$" && source[i + 1] === "{") {
      hasInterpolation = true;
      i = skipBraced(source, i + 2);
    } else {
      if (!hasInterpolation) out += ch;
      i++;
    }
  }
  return { value: null, end: i };
}

/**
 * Skips tokens until the matching `}` (starting right after `{`).
 * @param {string} source
 * @param {number} pos
 * @returns {number}
 */
function skipBraced(source, pos) {
  let i = pos;
  let depth = 1;
  let canStartRegex = true;
  while (i < source.length && depth > 0) {
    i = skipTrivia(source, i);
    if (i >= source.length) break;
    const ch = source[i];
    if (ch === "{") {
      depth++;
      i++;
      canStartRegex = true;
    } else if (ch === "}") {
      depth--;
      i++;
      canStartRegex = false;
    } else {
      const tok = nextToken(source, i, canStartRegex);
      i = tok.end;
      canStartRegex = tok.canStartRegex;
    }
  }
  return i;
}

/**
 * @typedef {{
 *   kind: "id" | "string" | "punct" | "other" | "eof",
 *   value: string | null,
 *   start: number,
 *   end: number,
 *   canStartRegex: boolean
 * }} Token
 */

/**
 * Reads the next lexical token at or after `pos`, skipping whitespace and comments.
 * @param {string} source
 * @param {number} pos
 * @param {boolean} canStartRegex
 * @returns {Token}
 */
function nextToken(source, pos, canStartRegex) {
  const start = skipTrivia(source, pos);
  if (start >= source.length) {
    return { kind: "eof", value: null, start, end: start, canStartRegex: false };
  }
  const ch = source[start];
  const code = source.charCodeAt(start);

  if (ch === '"' || ch === "'") {
    const str = readQuotedString(source, start);
    return { kind: "string", value: str.value, start, end: str.end, canStartRegex: false };
  }
  if (ch === "`") {
    const tpl = readTemplate(source, start);
    return { kind: "string", value: tpl.value, start, end: tpl.end, canStartRegex: false };
  }
  if (ch === "/" && canStartRegex) {
    const end = skipRegex(source, start);
    return { kind: "other", value: null, start, end, canStartRegex: false };
  }
  if (isIdentStart(code)) {
    let end = start + 1;
    while (end < source.length && isIdentPart(source.charCodeAt(end))) end++;
    const word = source.slice(start, end);
    return { kind: "id", value: word, start, end, canStartRegex: REGEX_PRECEDING_KEYWORDS.has(word) };
  }
  if (code >= 48 && code <= 57) {
    let end = start + 1;
    while (end < source.length && (isIdentPart(source.charCodeAt(end)) || source[end] === ".")) end++;
    return { kind: "other", value: null, start, end, canStartRegex: false };
  }
  if (ch === "?" && source[start + 1] === ".") {
    return { kind: "punct", value: "?.", start, end: start + 2, canStartRegex: true };
  }
  if ((ch === "+" && source[start + 1] === "+") || (ch === "-" && source[start + 1] === "-")) {
    return { kind: "punct", value: source.slice(start, start + 2), start, end: start + 2, canStartRegex: false };
  }
  if (ch === ")" || ch === "]" || ch === "}") {
    return { kind: "punct", value: ch, start, end: start + 1, canStartRegex: false };
  }
  return { kind: "punct", value: ch, start, end: start + 1, canStartRegex: true };
}

/**
 * Skips balanced `(...)` starting at `pos` (where `source[pos] === "("`).
 * @param {string} source
 * @param {number} pos
 * @returns {number}
 */
function skipBalancedParens(source, pos) {
  let i = pos + 1;
  let depth = 1;
  let canStartRegex = true;
  while (i < source.length && depth > 0) {
    const tok = nextToken(source, i, canStartRegex);
    if (tok.kind === "eof") return tok.end;
    if (tok.kind === "punct" && tok.value === "(") depth++;
    else if (tok.kind === "punct" && tok.value === ")") depth--;
    i = tok.end;
    canStartRegex = tok.canStartRegex;
  }
  return i;
}

/**
 * Scans test source text for test/suite titles and switched-off test calls.
 * @param {string} source
 * @returns {{ titles: string[], off: number }}
 */
export function scanTests(source) {
  /** @type {string[]} */
  const titles = [];
  let off = 0;

  let i = 0;
  let canStartRegex = true;
  let prevPunct = "";
  let prevWord = "";

  while (i < source.length) {
    const tok = nextToken(source, i, canStartRegex);
    if (tok.kind === "eof") break;

    if (
      tok.kind === "id" &&
      (tok.value === "it" || tok.value === "test" || tok.value === "describe") &&
      prevPunct !== "." &&
      prevPunct !== "?." &&
      prevWord !== "function"
    ) {
      let cursor = tok.end;
      let isOff = false;
      let step = 0;
      let callOpen = null;

      while (true) {
        const next = nextToken(source, cursor, false);
        if (next.kind === "punct" && next.value === "(") {
          callOpen = next;
          break;
        }
        if (next.kind === "punct" && next.value === ".") {
          const member = nextToken(source, next.end, false);
          if (member.kind !== "id" || !member.value) break;
          if (step === 0 && tok.value === "test" && member.value === "describe") {
            cursor = member.end;
            step++;
            continue;
          }
          if (OFF_MODIFIERS.has(member.value)) {
            isOff = true;
            cursor = member.end;
            step++;
            continue;
          }
          if (CHAIN_MODIFIERS.has(member.value)) {
            cursor = member.end;
            step++;
            continue;
          }
          if (member.value === "each") {
            const eachOpen = nextToken(source, member.end, false);
            if (eachOpen.kind !== "punct" || eachOpen.value !== "(") break;
            cursor = skipBalancedParens(source, eachOpen.start);
            step++;
            continue;
          }
          break;
        }
        break;
      }

      if (callOpen) {
        const arg1 = nextToken(source, callOpen.end, true);
        if (arg1.kind === "string" && arg1.value !== null) {
          const afterArg1 = nextToken(source, arg1.end, false);
          if (afterArg1.kind === "punct" && (afterArg1.value === "," || afterArg1.value === ")")) {
            titles.push(arg1.value);
            if (isOff) off++;
            i = arg1.end;
            canStartRegex = false;
            prevPunct = "";
            prevWord = "";
            continue;
          }
        }
        i = callOpen.end;
        canStartRegex = true;
        prevPunct = "(";
        prevWord = "";
        continue;
      }
    }

    i = tok.end;
    canStartRegex = tok.canStartRegex;
    prevPunct = tok.kind === "punct" && tok.value ? tok.value : "";
    prevWord = tok.kind === "id" && tok.value ? tok.value : "";
  }

  return { titles, off };
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
 * @param {string | undefined} [input]
 * @returns {{ status: number | null, stdout: string, stderr: string, error?: Error }}
 */
function runGit(root, args, input) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 512 * 1024 * 1024,
  });
}

/**
 * Reads all listed paths at `baseRef` using a single `git cat-file --batch` call.
 * @param {string} root
 * @param {string} baseRef
 * @param {string[]} paths
 * @returns {Map<string, string>}
 */
function readBaseFiles(root, baseRef, paths) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (paths.length === 0) return out;
  const spec = paths.map((p) => `${baseRef}:${p}\n`).join("");
  const res = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: spec,
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
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
    offset += size + 1; // trailing LF after blob content
  }
  return out;
}

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
function parseCliArgs(argv, env) {
  let base = "origin/main";
  let allow = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base" && i + 1 < argv.length) {
      base = argv[++i];
    } else if (argv[i] === "--allow" && i + 1 < argv.length) {
      allow = argv[++i].trim();
    }
  }
  if (!allow && env.TEST_GUARD_PR_BODY) {
    for (const line of env.TEST_GUARD_PR_BODY.split(/\r?\n/)) {
      if (line.startsWith("Tests removed:")) {
        const reason = line.slice("Tests removed:".length).trim();
        if (reason.length >= 10) {
          allow = reason;
          break;
        }
      }
    }
  }
  return { base, allow };
}

/**
 * @typedef {{ argv: string[], env: Record<string, string | undefined>, platform: string, exit: (code: number) => never }} NodeProcess
 */

/** @returns {NodeProcess | undefined} */
function getProcess() {
  return (/** @type {{ process?: NodeProcess }} */ (/** @type {unknown} */ (globalThis))).process;
}

function main() {
  const proc = getProcess();
  if (!proc) return;
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { base, allow } = parseCliArgs(proc.argv.slice(2), proc.env);

  const mb = runGit(ROOT, ["merge-base", base, "HEAD"]);
  if (mb.status !== 0) {
    console.error(`test-guard: failed to find merge-base of ${base} and HEAD: ${(mb.stderr || "").trim()}`);
    proc.exit(1);
  }
  const mergeBase = mb.stdout.trim();

  const baseTree = runGit(ROOT, ["ls-tree", "-r", "-z", "--name-only", mergeBase, "--", "src", "tests"]);
  if (baseTree.status !== 0) {
    console.error(`test-guard: git ls-tree failed: ${(baseTree.stderr || "").trim()}`);
    proc.exit(1);
  }
  const basePaths = baseTree.stdout
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"))
    .filter(isTestFile);
  const baseContents = readBaseFiles(ROOT, mergeBase, basePaths);

  const nowList = runGit(ROOT, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "src", "tests"]);
  if (nowList.status !== 0) {
    console.error(`test-guard: git ls-files failed: ${(nowList.stderr || "").trim()}`);
    proc.exit(1);
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
  let totalNowTitles = 0;

  for (const rel of nowPaths) {
    let source;
    try {
      source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      continue; // deleted in working tree
    }
    const result = scanTests(source);
    nowScanned.set(rel, result);
    totalNowTitles += result.titles.length;
    for (const t of result.titles) allNowTitles.add(t);
  }

  /** @type {string[]} */
  const issues = [];

  for (const rel of basePaths) {
    const baseSource = baseContents.get(rel);
    if (baseSource === undefined) continue;
    const baseResult = scanTests(baseSource);
    for (const title of baseResult.titles) {
      if (!allNowTitles.has(title)) {
        issues.push(`removed: ${rel} \u203a ${title}`);
      }
    }
    const nowResult = nowScanned.get(rel);
    if (nowResult && nowResult.off > baseResult.off) {
      const more = nowResult.off - baseResult.off;
      issues.push(`${more} more switched off in ${rel}`);
    }
  }

  if (issues.length === 0) {
    console.log(`test-guard: ok (${nowScanned.size} test files, ${totalNowTitles} titles)`);
    proc.exit(0);
  }

  for (const line of issues) console.log(line);
  if (allow) {
    console.log(`test-guard: allowed: ${allow}`);
    proc.exit(0);
  }
  console.log(
    `test-guard: blocked (pass --allow "<reason>" or add "Tests removed: <reason>" with >= 10 chars in the PR description)`,
  );
  proc.exit(1);
}

const proc = getProcess();
if (proc && proc.argv && proc.argv[1]) {
  const entry = path.resolve(proc.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  const same = proc.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
  if (same) main();
}
