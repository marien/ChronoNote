#!/usr/bin/env node
// CSS literals ceiling (U4): counts raw colour literals and literal font-size values across
// src/**/*.css and src/**/*.svelte (excluding src/styles/01-tokens.css), and fails if either
// total rises above scripts/css-literals.baseline.json.
//
// Usage: node scripts/css-literals.mjs [--update]
//   --update  writes the current counts to the baseline (refuses if either total > baseline)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STYLE_TAG_RE = /<!--[\s\S]*?-->|<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const PROP_NAME_RE = /^(?:--|[a-zA-Z])[a-zA-Z0-9_-]*$/;
const COLOR_RE =
  /(?<![a-zA-Z0-9_-])(?:#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F_-])|(?:rgba?|hsla?)\s*\(|(?:white|black|red|green|blue|gray|grey)(?![a-zA-Z0-9_-]))/gi;
const FONT_SIZE_UNIT_RE =
  /(?<![a-zA-Z0-9_.-])(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|pt)(?![a-zA-Z0-9_-])/i;

/**
 * Extracts CSS blocks from a source file.
 * For `.svelte` files, returns only `<style>` block bodies (ignoring HTML comments).
 * @param {string} fileName
 * @param {string} text
 * @returns {string[]}
 */
function extractStyleBlocks(fileName, text) {
  if (!fileName.endsWith(".svelte")) return [text];
  /** @type {string[]} */
  const blocks = [];
  STYLE_TAG_RE.lastIndex = 0;
  let match;
  while ((match = STYLE_TAG_RE.exec(text)) !== null) {
    if (match[1] !== undefined) {
      blocks.push(match[1]);
    }
  }
  return blocks;
}

/**
 * Strips CSS block comments while preserving string literals.
 * @param {string} css
 * @returns {string}
 */
function stripCssComments(css) {
  let out = "";
  let quote = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < css.length) {
        out += css[++i];
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      out += " ";
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Extracts `{ prop, value }` declarations from comment-free CSS text.
 * Selectors, at-rule preludes, and custom property names are separated from values.
 * @param {string} css
 * @returns {Array<{ prop: string, value: string }>}
 */
function extractDeclarations(css) {
  /** @type {Array<{ prop: string, value: string }>} */
  const decls = [];
  let quote = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let start = 0;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === "\\" && i + 1 < css.length) {
        i++;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      parenDepth++;
      continue;
    }
    if (ch === ")") {
      if (parenDepth > 0) parenDepth--;
      continue;
    }
    if (ch === "[") {
      bracketDepth++;
      continue;
    }
    if (ch === "]") {
      if (bracketDepth > 0) bracketDepth--;
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0) {
      if (ch === "{") {
        start = i + 1;
      } else if (ch === ";" || ch === "}") {
        const stmt = css.slice(start, i);
        const colon = stmt.indexOf(":");
        if (colon !== -1) {
          const prop = stmt.slice(0, colon).trim().toLowerCase();
          if (PROP_NAME_RE.test(prop)) {
            decls.push({ prop, value: stmt.slice(colon + 1) });
          }
        }
        start = i + 1;
      }
    }
  }
  return decls;
}

/**
 * Skips past a balanced parenthesized call starting right after `(`.
 * @param {string} str
 * @param {number} afterOpenIndex
 * @returns {number} index of the closing `)` or `str.length`
 */
function findMatchingParen(str, afterOpenIndex) {
  let depth = 1;
  let quote = "";
  for (let i = afterOpenIndex; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (ch === "\\" && i + 1 < str.length) {
        i++;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return str.length;
}

/**
 * Checks whether `str` has an identifier character right before `index`.
 * @param {string} str
 * @param {number} index
 * @returns {boolean}
 */
function hasIdentBefore(str, index) {
  return index > 0 && /[a-zA-Z0-9_-]/.test(str[index - 1]);
}

/**
 * Replaces `url(...)` calls and quoted strings with spaces so their contents are never counted.
 * @param {string} value
 * @returns {string}
 */
function stripUrlsAndStrings(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < value.length) {
        if (value[i] === "\\" && i + 1 < value.length) {
          i += 2;
          continue;
        }
        if (value[i] === q) break;
        i++;
      }
      out += " ";
      continue;
    }
    if (!hasIdentBefore(value, i) && value.slice(i, i + 4).toLowerCase() === "url(") {
      i = findMatchingParen(value, i + 4);
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Replaces `var(...)` calls (including any fallback values) with spaces.
 * @param {string} value
 * @returns {string}
 */
function stripVarCalls(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (!hasIdentBefore(value, i) && value.slice(i, i + 4).toLowerCase() === "var(") {
      i = findMatchingParen(value, i + 4);
      out += " ";
      continue;
    }
    out += value[i];
  }
  return out;
}

/**
 * Removes the `/ <line-height>` part of a `font:` shorthand value so line-height units aren't
 * mistaken for font-size units.
 * @param {string} value
 * @returns {string}
 */
function stripFontLineHeight(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "/") {
      let j = i + 1;
      while (j < value.length && /\s/.test(value[j])) j++;
      while (j < value.length && !/[\s,;)]/.test(value[j])) {
        if (value[j] === "(") {
          j = findMatchingParen(value, j + 1) + 1;
        } else {
          j++;
        }
      }
      out += " ";
      i = j - 1;
      continue;
    }
    out += value[i];
  }
  return out;
}

/**
 * Counts raw colour literals and literal font-size values in a CSS or Svelte file.
 * @param {string} fileName
 * @param {string} text
 * @returns {{ colors: number, fontSizes: number }}
 */
export function countLiterals(fileName, text) {
  let colors = 0;
  let fontSizes = 0;

  for (const block of extractStyleBlocks(fileName, text)) {
    const cleanCss = stripCssComments(block);
    for (const { prop, value } of extractDeclarations(cleanCss)) {
      const sanitized = stripUrlsAndStrings(value);

      COLOR_RE.lastIndex = 0;
      while (COLOR_RE.exec(sanitized) !== null) {
        colors++;
      }

      if (prop === "font-size") {
        const withoutVars = stripVarCalls(sanitized);
        if (FONT_SIZE_UNIT_RE.test(withoutVars)) {
          fontSizes++;
        }
      } else if (prop === "font") {
        const withoutLh = stripFontLineHeight(sanitized);
        const withoutVars = stripVarCalls(withoutLh);
        if (FONT_SIZE_UNIT_RE.test(withoutVars)) {
          fontSizes++;
        }
      }
    }
  }

  return { colors, fontSizes };
}

/**
 * @typedef {{ colors: number, fontSizes: number }} LiteralCounts
 * @typedef {{ colors: number, fontSizes: number, files: Record<string, LiteralCounts> }} BaselineData
 * @typedef {{ file: string, colorsBefore: number, colorsAfter: number, fontSizesBefore: number, fontSizesAfter: number }} LiteralRise
 * @typedef {{ ok: boolean, colors: number, fontSizes: number, colorsCeiling: number, fontSizesCeiling: number, rose: LiteralRise[] }} CompareResult
 */

/**
 * Compares current literal counts against a baseline.
 * @param {BaselineData} baseline
 * @param {BaselineData} current
 * @returns {CompareResult}
 */
export function compare(baseline, current) {
  /** @type {LiteralRise[]} */
  const rose = [];
  const keys = Object.keys(current.files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const file of keys) {
    const after = current.files[file];
    const before = baseline.files[file] ?? { colors: 0, fontSizes: 0 };
    if (after.colors > before.colors || after.fontSizes > before.fontSizes) {
      rose.push({
        file,
        colorsBefore: before.colors,
        colorsAfter: after.colors,
        fontSizesBefore: before.fontSizes,
        fontSizesAfter: after.fontSizes,
      });
    }
  }
  return {
    ok: current.colors <= baseline.colors && current.fontSizes <= baseline.fontSizes,
    colors: current.colors,
    fontSizes: current.fontSizes,
    colorsCeiling: baseline.colors,
    fontSizesCeiling: baseline.fontSizes,
    rose,
  };
}

/**
 * Walks `dir` under `root`, collecting `.css` and `.svelte` paths (excluding `01-tokens.css`).
 * @param {string} root
 * @param {string} relDir
 * @param {string[]} out
 */
function walkDir(root, relDir, out) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir)) return;
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      if (rel === "src/lib/generated") continue;
      walkDir(root, rel, out);
    } else if (ent.isFile()) {
      if (rel === "src/styles/01-tokens.css") continue;
      if (ent.name.endsWith(".css") || ent.name.endsWith(".svelte")) {
        out.push(rel);
      }
    }
  }
}

/**
 * Scans `src/` in `root` and returns sorted counts for files with non-zero literals.
 * @param {string} root
 * @returns {BaselineData}
 */
export function scanRepo(root) {
  /** @type {string[]} */
  const paths = [];
  walkDir(root, "src", paths);
  paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  /** @type {Record<string, LiteralCounts>} */
  const files = {};
  let colors = 0;
  let fontSizes = 0;
  for (const rel of paths) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const counts = countLiterals(rel, text);
    if (counts.colors > 0 || counts.fontSizes > 0) {
      files[rel] = counts;
      colors += counts.colors;
      fontSizes += counts.fontSizes;
    }
  }
  return { colors, fontSizes, files };
}

/**
 * @typedef {{ argv: string[], platform: string, exit: (code: number) => never }} NodeProcess
 */

/** @returns {NodeProcess | undefined} */
function getProcess() {
  return (/** @type {{ process?: NodeProcess }} */ (/** @type {unknown} */ (globalThis))).process;
}

/**
 * Formats per-file increases for error output.
 * @param {LiteralRise[]} rose
 * @returns {string[]}
 */
function formatRises(rose) {
  return rose.map((r) => {
    /** @type {string[]} */
    const parts = [];
    if (r.colorsAfter > r.colorsBefore) parts.push(`colors: ${r.colorsBefore} -> ${r.colorsAfter}`);
    if (r.fontSizesAfter > r.fontSizesBefore) parts.push(`fontSizes: ${r.fontSizesBefore} -> ${r.fontSizesAfter}`);
    return `  ${r.file}: ${parts.join(", ")}`;
  });
}

function main() {
  const proc = getProcess();
  if (!proc) return;
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baselinePath = path.join(ROOT, "scripts", "css-literals.baseline.json");
  const update = proc.argv.slice(2).includes("--update");
  const current = scanRepo(ROOT);

  if (update) {
    if (fs.existsSync(baselinePath)) {
      const baseline = /** @type {BaselineData} */ (JSON.parse(fs.readFileSync(baselinePath, "utf8")));
      const result = compare(baseline, current);
      if (!result.ok) {
        console.error(
          `css literals: colors ${result.colors}/${result.colorsCeiling}, fontSizes ${result.fontSizes}/${result.fontSizesCeiling}; refusing to raise ceiling with --update (edit scripts/css-literals.baseline.json by hand)`,
        );
        for (const line of formatRises(result.rose)) {
          console.error(line);
        }
        proc.exit(1);
      }
    }
    fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n", "utf8");
    console.log(`css literals: colors ${current.colors}, fontSizes ${current.fontSizes}`);
    proc.exit(0);
  }

  if (!fs.existsSync(baselinePath)) {
    console.error("css literals: missing scripts/css-literals.baseline.json (run npm run css-literals -- --update)");
    proc.exit(1);
  }

  const baseline = /** @type {BaselineData} */ (JSON.parse(fs.readFileSync(baselinePath, "utf8")));
  const result = compare(baseline, current);

  if (!result.ok) {
    console.log(
      `css literals: colors ${result.colors} (ceiling ${result.colorsCeiling}), fontSizes ${result.fontSizes} (ceiling ${result.fontSizesCeiling})`,
    );
    for (const line of formatRises(result.rose)) {
      console.log(line);
    }
    proc.exit(1);
  }

  if (result.colors < result.colorsCeiling || result.fontSizes < result.fontSizesCeiling) {
    console.log(
      `css literals: colors ${result.colors} (ceiling ${result.colorsCeiling}), fontSizes ${result.fontSizes} (ceiling ${result.fontSizesCeiling}); run npm run css-literals -- --update to lower the ceiling`,
    );
    proc.exit(0);
  }

  console.log(`css literals: colors ${result.colors} (ceiling ${result.colorsCeiling}), fontSizes ${result.fontSizes} (ceiling ${result.fontSizesCeiling})`);
  proc.exit(0);
}

const proc = getProcess();
if (proc && proc.argv && proc.argv[1]) {
  const entry = path.resolve(proc.argv[1]);
  const self = path.resolve(fileURLToPath(import.meta.url));
  const same = proc.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self;
  if (same) main();
}
