#!/usr/bin/env node
// Type escapes ceiling (R4): counts `any` type nodes and @ts-ignore / @ts-expect-error / @ts-nocheck
// directives across src/ and tests/, and fails if the total rises above scripts/type-escapes.baseline.json.
//
// Usage: node scripts/type-escapes.mjs [--update]
//   --update  writes the current counts to the baseline (refuses if total > baseline)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DIRECTIVE_LINE_RE = /^(?:\/\/+\s*|\/\*\*?\s*|\*\s*|\s*)@ts-(?:ignore|expect-error|nocheck)(?![\w-])/;
const SCRIPT_TAG_RE = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const LANG_TS_RE = /\blang\s*=\s*(?:"ts"|'ts')(?=[\s>]|$)/i;

/**
 * Extracts TypeScript code blocks to scan from a source file.
 * For `.svelte` files, returns only `<script lang="ts">` block bodies.
 * @param {string} fileName
 * @param {string} text
 * @returns {string[]}
 */
function extractTypeScriptBlocks(fileName, text) {
  if (!fileName.endsWith(".svelte")) return [text];
  /** @type {string[]} */
  const blocks = [];
  SCRIPT_TAG_RE.lastIndex = 0;
  let match;
  while ((match = SCRIPT_TAG_RE.exec(text)) !== null) {
    if (match[1] === undefined) continue; // HTML comment
    if (LANG_TS_RE.test(match[1])) {
      blocks.push(match[2]);
    }
  }
  return blocks;
}

/**
 * Counts `AnyKeyword` AST nodes and TS suppression comment directives in one TypeScript block.
 * @param {string} text
 * @returns {number}
 */
function countEscapesInTs(text) {
  const sf = ts.createSourceFile("file.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let count = 0;

  /** @param {ts.Node} node */
  function visitAst(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) count++;
    ts.forEachChild(node, visitAst);
  }
  visitAst(sf);

  /** @type {Set<number>} */
  const seenComments = new Set();

  /** @param {readonly ts.CommentRange[] | undefined} ranges */
  function countCommentRanges(ranges) {
    if (!ranges) return;
    for (const r of ranges) {
      if (seenComments.has(r.pos)) continue;
      seenComments.add(r.pos);
      const body = text.slice(r.pos, r.end);
      for (const line of body.split(/\r?\n/)) {
        if (DIRECTIVE_LINE_RE.test(line)) count++;
      }
    }
  }

  /** @param {ts.Node} node */
  function visitCst(node) {
    countCommentRanges(ts.getLeadingCommentRanges(text, node.pos));
    countCommentRanges(ts.getTrailingCommentRanges(text, node.pos));
    for (const child of node.getChildren(sf)) {
      visitCst(child);
    }
  }
  visitCst(sf);

  return count;
}

/**
 * Counts type escapes (`any` keywords and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` directives)
 * in a `.ts` or `.svelte` file.
 * @param {string} fileName
 * @param {string} text
 * @returns {number}
 */
export function countEscapes(fileName, text) {
  let total = 0;
  for (const block of extractTypeScriptBlocks(fileName, text)) {
    total += countEscapesInTs(block);
  }
  return total;
}

/**
 * @typedef {{ total: number, files: Record<string, number> }} EscapeCounts
 * @typedef {{ file: string, before: number, after: number }} EscapeRise
 * @typedef {{ ok: boolean, total: number, ceiling: number, rose: EscapeRise[] }} CompareResult
 */

/**
 * Compares current escape counts against a baseline.
 * @param {EscapeCounts} baseline
 * @param {EscapeCounts} current
 * @returns {CompareResult}
 */
export function compare(baseline, current) {
  const ceiling = baseline.total;
  const total = current.total;
  /** @type {EscapeRise[]} */
  const rose = [];
  const keys = Object.keys(current.files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const file of keys) {
    const after = current.files[file];
    const before = baseline.files[file] ?? 0;
    if (after > before) {
      rose.push({ file, before, after });
    }
  }
  return {
    ok: total <= ceiling,
    total,
    ceiling,
    rose,
  };
}

/**
 * Walks `dir` under `root`, collecting matching relative paths with forward slashes.
 * @param {string} root
 * @param {string} relDir
 * @param {boolean} allowSvelte
 * @param {string[]} out
 */
function walkDir(root, relDir, allowSvelte, out) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir)) return;
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      if (rel === "src/lib/generated") continue;
      walkDir(root, rel, allowSvelte, out);
    } else if (ent.isFile()) {
      if (ent.name.endsWith(".d.ts")) continue;
      if (ent.name.endsWith(".ts") || (allowSvelte && ent.name.endsWith(".svelte"))) {
        out.push(rel);
      }
    }
  }
}

/**
 * Scans `src/` and `tests/` in `root` and returns sorted counts for files with count > 0.
 * @param {string} root
 * @returns {EscapeCounts}
 */
function scanRepo(root) {
  /** @type {string[]} */
  const paths = [];
  walkDir(root, "src", true, paths);
  walkDir(root, "tests", false, paths);
  paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  /** @type {Record<string, number>} */
  const files = {};
  let total = 0;
  for (const rel of paths) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const count = countEscapes(rel, text);
    if (count > 0) {
      files[rel] = count;
      total += count;
    }
  }
  return { total, files };
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
  const baselinePath = path.join(ROOT, "scripts", "type-escapes.baseline.json");
  const update = proc.argv.slice(2).includes("--update");
  const current = scanRepo(ROOT);

  if (update) {
    if (fs.existsSync(baselinePath)) {
      const baseline = /** @type {EscapeCounts} */ (JSON.parse(fs.readFileSync(baselinePath, "utf8")));
      const result = compare(baseline, current);
      if (!result.ok) {
        console.error(
          `type escapes: ${result.total} is above baseline ${result.ceiling}; refusing to raise ceiling with --update (edit scripts/type-escapes.baseline.json by hand)`,
        );
        for (const r of result.rose) {
          console.error(`  ${r.file}: ${r.before} -> ${r.after}`);
        }
        proc.exit(1);
      }
    }
    fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n", "utf8");
    console.log(`type escapes: ${current.total} (ceiling ${current.total})`);
    proc.exit(0);
  }

  if (!fs.existsSync(baselinePath)) {
    console.error("type escapes: missing scripts/type-escapes.baseline.json (run npm run type-escapes -- --update)");
    proc.exit(1);
  }

  const baseline = /** @type {EscapeCounts} */ (JSON.parse(fs.readFileSync(baselinePath, "utf8")));
  const result = compare(baseline, current);

  if (!result.ok) {
    console.log(`type escapes: ${result.total} (ceiling ${result.ceiling})`);
    for (const r of result.rose) {
      console.log(`  ${r.file}: ${r.before} -> ${r.after}`);
    }
    proc.exit(1);
  }

  if (result.total < result.ceiling) {
    console.log(
      `type escapes: ${result.total} (ceiling ${result.ceiling}); run npm run type-escapes -- --update to lower the ceiling`,
    );
    proc.exit(0);
  }

  console.log(`type escapes: ${result.total} (ceiling ${result.ceiling})`);
  proc.exit(0);
}

const proc = getProcess();
if (proc && proc.argv && proc.argv[1]) {
  const entry = path.resolve(proc.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  const same = proc.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
  if (same) main();
}
