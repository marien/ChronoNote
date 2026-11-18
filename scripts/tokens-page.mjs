#!/usr/bin/env node
// Design token reference generator (U4): reads src/styles/01-tokens.css and writes a
// self-contained docs/design/tokens.html reference page.
//
// Usage: node scripts/tokens-page.mjs [--check]
//   --check  write nothing; exit 1 if docs/design/tokens.html is out of date

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COLOR_VALUE_RE =
  /^(?:#(?:[0-9a-fA-F]{3,8})|(?:rgba?|hsla?|color-mix|oklch|oklab|lab|lch)\s*\(|(?:white|black|red|green|blue|gray|grey|transparent)\b)/i;

/**
 * @typedef {"dark" | "light" | "pureBlack" | "colorDark" | "colorLight"} TokenMode
 * @typedef {{
 *   name: string,
 *   family: string,
 *   dark?: string,
 *   light?: string,
 *   pureBlack?: string,
 *   colorDark?: string,
 *   colorLight?: string,
 *   comments: string[]
 * }} TokenEntry
 */

/**
 * Escapes HTML special characters.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strips CSS block comments from a selector or at-rule header.
 * @param {string} text
 * @returns {string}
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Classifies a CSS rule's `(selector, mediaQuery)` into a token mode.
 * @param {string} selector
 * @param {string} media
 * @returns {TokenMode | null}
 */
function classifyMode(selector, media) {
  const sel = selector.trim();
  const med = media.trim();
  const isColorMode = /\[data-color-mode\s*=\s*["']?color["']?\]/i.test(sel);
  const isPureBlack = /\[data-pure-black\]/i.test(sel);
  const isExplicitLight = /\[data-theme\s*=\s*["']?light["']?\]/i.test(sel);
  const isMediaLight = /prefers-color-scheme\s*:\s*light/i.test(med);
  const isLight = isExplicitLight || isMediaLight;

  if (isColorMode) {
    return isLight ? "colorLight" : "colorDark";
  }
  if (isPureBlack) {
    return "pureBlack";
  }
  if (isLight && (/:root\b/i.test(sel) || isExplicitLight)) {
    return "light";
  }
  if (/:root\b/i.test(sel) && !/\[data-theme\s*=/i.test(sel)) {
    return "dark";
  }
  return null;
}

/**
 * Finds the matching closing `}` for the `{` at `openIndex`, respecting strings and comments.
 * @param {string} css
 * @param {number} openIndex
 * @returns {number}
 */
function findMatchingBrace(css, openIndex) {
  let depth = 1;
  let quote = "";
  for (let i = openIndex + 1; i < css.length; i++) {
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
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) return css.length - 1;
      i = end + 1;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return css.length - 1;
}

/**
 * Extracts `--token: value; /* comment * /` declarations from a CSS rule body.
 * @param {string} body
 * @returns {Array<{ name: string, value: string, comment: string }>}
 */
function parseDeclarations(body) {
  /** @type {Array<{ name: string, value: string, comment: string }>} */
  const out = [];
  let i = 0;

  while (i < body.length) {
    // Skip whitespace and standalone block comments before a declaration.
    while (i < body.length) {
      if (/\s/.test(body[i])) {
        i++;
      } else if (body[i] === "/" && body[i + 1] === "*") {
        const end = body.indexOf("*/", i + 2);
        if (end === -1) {
          i = body.length;
        } else {
          i = end + 2;
        }
      } else {
        break;
      }
    }
    if (i >= body.length) break;

    const stmtStart = i;
    let quote = "";
    let parenDepth = 0;
    let foundEnd = -1;
    let terminatedBySemicolon = false;

    while (i < body.length) {
      const ch = body[i];
      if (quote) {
        if (ch === "\\" && i + 1 < body.length) {
          i += 2;
          continue;
        }
        if (ch === quote) quote = "";
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === "/" && body[i + 1] === "*") {
        const end = body.indexOf("*/", i + 2);
        if (end === -1) {
          i = body.length;
          break;
        }
        i = end + 2;
        continue;
      }
      if (ch === "(") parenDepth++;
      else if (ch === ")" && parenDepth > 0) parenDepth--;
      else if (parenDepth === 0 && ch === ";") {
        foundEnd = i;
        terminatedBySemicolon = true;
        i++;
        break;
      }
      i++;
    }

    const rawStmt = body.slice(stmtStart, foundEnd === -1 ? body.length : foundEnd);
    let comment = "";

    // Capture an inline comment on the same line immediately after `;`.
    if (terminatedBySemicolon) {
      let j = i;
      while (j < body.length && (body[j] === " " || body[j] === "\t")) j++;
      if (body[j] === "/" && body[j + 1] === "*") {
        const end = body.indexOf("*/", j + 2);
        if (end !== -1) {
          comment = body
            .slice(j + 2, end)
            .replace(/\s+/g, " ")
            .trim();
          i = end + 2;
        }
      }
    }

    const cleanStmt = rawStmt.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const colon = cleanStmt.indexOf(":");
    if (colon !== -1) {
      const name = cleanStmt.slice(0, colon).trim();
      const value = cleanStmt.slice(colon + 1).replace(/\s+/g, " ").trim();
      if (name.startsWith("--") && value) {
        out.push({ name, value, comment });
      }
    }
  }

  return out;
}

/**
 * Walks top-level and `@media`-nested rule blocks and invokes `onBlock(selector, media, body)`.
 * @param {string} css
 * @param {string} media
 * @param {(selector: string, media: string, body: string) => void} onBlock
 */
function walkRuleBlocks(css, media, onBlock) {
  let i = 0;
  let preludeStart = 0;
  let quote = "";
  let parenDepth = 0;

  while (i < css.length) {
    const ch = css[i];
    if (quote) {
      if (ch === "\\" && i + 1 < css.length) i += 2;
      else {
        if (ch === quote) quote = "";
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (ch === "(") {
      parenDepth++;
      i++;
      continue;
    }
    if (ch === ")" && parenDepth > 0) {
      parenDepth--;
      i++;
      continue;
    }
    if (parenDepth === 0 && ch === "{") {
      const prelude = stripComments(css.slice(preludeStart, i));
      const closeIdx = findMatchingBrace(css, i);
      const body = css.slice(i + 1, closeIdx);
      if (prelude.startsWith("@")) {
        walkRuleBlocks(body, media ? `${media} && ${prelude}` : prelude, onBlock);
      } else {
        onBlock(prelude, media, body);
      }
      i = closeIdx + 1;
      preludeStart = i;
      continue;
    }
    if (parenDepth === 0 && ch === ";") {
      preludeStart = i + 1;
    }
    i++;
  }
}

/**
 * Returns the family name for a token (the first hyphen-separated prefix after `--`).
 * @param {string} tokenName
 * @returns {string}
 */
export function tokenFamily(tokenName) {
  const bare = tokenName.startsWith("--") ? tokenName.slice(2) : tokenName;
  const dash = bare.indexOf("-");
  return dash === -1 ? bare : bare.slice(0, dash);
}

/**
 * Parses token CSS into an ordered list of tokens and family groups.
 * @param {string} cssText
 * @returns {{ tokens: TokenEntry[], families: Array<{ name: string, tokens: TokenEntry[] }> }}
 */
export function parseTokensCss(cssText) {
  /** @type {Map<string, TokenEntry>} */
  const tokenMap = new Map();

  walkRuleBlocks(cssText, "", (selector, media, body) => {
    const mode = classifyMode(selector, media);
    if (!mode) return;
    for (const decl of parseDeclarations(body)) {
      let entry = tokenMap.get(decl.name);
      if (!entry) {
        entry = {
          name: decl.name,
          family: tokenFamily(decl.name),
          comments: [],
        };
        tokenMap.set(decl.name, entry);
      }
      entry[mode] = decl.value;
      if (decl.comment && !entry.comments.includes(decl.comment)) {
        entry.comments.push(decl.comment);
      }
    }
  });

  const tokens = [...tokenMap.values()];
  /** @type {Map<string, TokenEntry[]>} */
  const familyMap = new Map();
  for (const token of tokens) {
    let list = familyMap.get(token.family);
    if (!list) {
      list = [];
      familyMap.set(token.family, list);
    }
    list.push(token);
  }

  const families = [...familyMap.entries()].map(([name, group]) => ({ name, tokens: group }));
  return { tokens, families };
}

/**
 * Resolves `var(--other)` references for visual previews in a given mode.
 * @param {string | undefined} rawValue
 * @param {TokenMode} mode
 * @param {Map<string, TokenEntry>} tokenMap
 * @param {Set<string>} [seen]
 * @returns {string | undefined}
 */
function resolveValue(rawValue, mode, tokenMap, seen = new Set()) {
  if (!rawValue) return undefined;
  const varMatch = /^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)$/.exec(rawValue.trim());
  if (!varMatch) return rawValue;
  const targetName = varMatch[1];
  const fallback = varMatch[2]?.trim();
  if (seen.has(targetName)) return fallback ?? rawValue;
  const target = tokenMap.get(targetName);
  if (!target) return fallback ?? rawValue;

  const nextSeen = new Set(seen);
  nextSeen.add(targetName);

  const candidate = pickModeValue(target, mode);
  if (!candidate) return fallback ?? rawValue;
  return resolveValue(candidate, mode, tokenMap, nextSeen);
}

/**
 * Picks the raw value of `token` for `mode`, falling back through CSS cascade inheritance.
 * @param {TokenEntry} token
 * @param {TokenMode} mode
 * @returns {string | undefined}
 */
function pickModeValue(token, mode) {
  if (mode === "dark") return token.dark;
  if (mode === "light") return token.light ?? token.dark;
  if (mode === "pureBlack") return token.pureBlack ?? token.dark;
  if (mode === "colorDark") return token.colorDark ?? token.dark;
  return token.colorLight ?? token.colorDark ?? token.light ?? token.dark;
}

/**
 * Determines whether a token represents a colour value.
 * @param {TokenEntry} token
 * @param {Map<string, TokenEntry>} tokenMap
 * @returns {boolean}
 */
function isColorToken(token, tokenMap) {
  if (token.name.startsWith("--shadow-") || token.name.startsWith("--radius-")) return false;
  if (token.name.startsWith("--motion-") || token.name.startsWith("--ease-")) return false;
  if (token.name.startsWith("--type-") || token.name.startsWith("--font")) return false;
  if (token.name.endsWith("-weight") || token.name.endsWith("-opacity")) return false;
  const resolved = resolveValue(token.dark ?? token.light ?? token.colorDark, "dark", tokenMap);
  return resolved ? COLOR_VALUE_RE.test(resolved) : false;
}

/**
 * Renders a swatch cell for a colour token in a specific theme mode.
 * @param {string} label
 * @param {string} canvasBg
 * @param {string} canvasFg
 * @param {string} rawVal
 * @param {string} resolvedVal
 * @returns {string}
 */
function renderSwatch(label, canvasBg, canvasFg, rawVal, resolvedVal) {
  const showResolved = rawVal !== resolvedVal;
  const sub = showResolved ? ` <span class="tok-resolved">(${escapeHtml(resolvedVal)})</span>` : "";
  return [
    `<div class="tok-swatch-card" style="background:${canvasBg};color:${canvasFg}">`,
    `<span class="tok-swatch" style="background:${escapeHtml(resolvedVal)}"></span>`,
    `<span class="tok-swatch-meta"><span class="tok-mode-label">${escapeHtml(label)}</span><code>${escapeHtml(rawVal)}</code>${sub}</span>`,
    `</div>`,
  ].join("");
}

/**
 * Renders one token card.
 * @param {TokenEntry} token
 * @param {Map<string, TokenEntry>} tokenMap
 * @returns {string}
 */
function renderTokenCard(token, tokenMap) {
  const darkRaw = token.dark ?? "";
  const lightRaw = token.light ?? token.dark ?? "";
  const resolvedDark = resolveValue(darkRaw, "dark", tokenMap) ?? darkRaw;
  const resolvedLight = resolveValue(lightRaw, "light", tokenMap) ?? lightRaw;
  const resolvedPureBlack = resolveValue(token.pureBlack ?? darkRaw, "pureBlack", tokenMap);
  const hasPureBlack = Boolean(token.pureBlack) || (resolvedPureBlack !== undefined && resolvedPureBlack !== resolvedDark);

  const commentHtml =
    token.comments.length > 0
      ? `<p class="tok-comment">${token.comments.map((c) => escapeHtml(c)).join(" · ")}</p>`
      : "";

  let bodyHtml = "";

  if (isColorToken(token, tokenMap)) {
    const swatches = [
      renderSwatch("Dark", "#1e1e1e", "#d4d4d4", darkRaw, resolvedDark),
      renderSwatch("Light", "#ffffff", "#1b1b1b", lightRaw, resolvedLight),
    ];
    if (hasPureBlack && resolvedPureBlack) {
      swatches.push(
        renderSwatch("Pure black", "#000000", "#e0e0e0", token.pureBlack ?? darkRaw, resolvedPureBlack),
      );
    }
    let colorModeHtml = "";
    if (token.colorDark || token.colorLight) {
      const cDarkRaw = token.colorDark ?? darkRaw;
      const cLightRaw = token.colorLight ?? token.colorDark ?? lightRaw;
      const cDarkRes = resolveValue(cDarkRaw, "colorDark", tokenMap) ?? cDarkRaw;
      const cLightRes = resolveValue(cLightRaw, "colorLight", tokenMap) ?? cLightRaw;
      colorModeHtml = [
        `<div class="tok-sub-label">Color glyph mode</div>`,
        `<div class="tok-swatch-row">`,
        renderSwatch("Color dark", "#1e1e1e", "#d4d4d4", cDarkRaw, cDarkRes),
        renderSwatch("Color light", "#ffffff", "#1b1b1b", cLightRaw, cLightRes),
        `</div>`,
      ].join("");
    }
    bodyHtml = `<div class="tok-swatch-row">${swatches.join("")}</div>${colorModeHtml}`;
  } else if (token.name.startsWith("--type-")) {
    bodyHtml = [
      `<div class="tok-preview-box">`,
      `<div class="tok-type-sample" style="font-size:${escapeHtml(resolvedDark)}">ChronoNote · Aa Bb Cc 0123 — The quick brown fox</div>`,
      `</div>`,
      `<div class="tok-values"><code>${escapeHtml(darkRaw)}</code></div>`,
    ].join("");
  } else if (token.name.startsWith("--font")) {
    bodyHtml = [
      `<div class="tok-preview-box">`,
      `<div class="tok-font-sample" style="font-family:${escapeHtml(resolvedDark)}">Aa Bb Cc 0123 · # v &gt; x =&gt; @name (topic)</div>`,
      `</div>`,
      `<div class="tok-values"><code>${escapeHtml(darkRaw)}</code></div>`,
    ].join("");
  } else if (token.name.startsWith("--radius-")) {
    bodyHtml = [
      `<div class="tok-preview-box tok-radius-row">`,
      `<div class="tok-radius-box" style="border-radius:${escapeHtml(resolvedDark)}"></div>`,
      `<code>${escapeHtml(darkRaw)}</code>`,
      `</div>`,
    ].join("");
  } else if (token.name.startsWith("--shadow-")) {
    bodyHtml = [
      `<div class="tok-swatch-row">`,
      `<div class="tok-shadow-stage" style="background:#1e1e1e;color:#d4d4d4"><div class="tok-shadow-card" style="background:#2d2d2e;box-shadow:${escapeHtml(resolvedDark)}">Dark</div><code>${escapeHtml(darkRaw)}</code></div>`,
      `<div class="tok-shadow-stage" style="background:#ffffff;color:#1b1b1b"><div class="tok-shadow-card" style="background:#ffffff;box-shadow:${escapeHtml(resolvedLight)}">Light</div><code>${escapeHtml(lightRaw)}</code></div>`,
      `</div>`,
    ].join("");
  } else {
    const parts = [`<span class="tok-kv"><span class="tok-mode-label">Value</span><code>${escapeHtml(darkRaw)}</code></span>`];
    if (token.light && token.light !== darkRaw) {
      parts.push(`<span class="tok-kv"><span class="tok-mode-label">Light</span><code>${escapeHtml(token.light)}</code></span>`);
    }
    if (token.colorDark) {
      parts.push(`<span class="tok-kv"><span class="tok-mode-label">Color mode</span><code>${escapeHtml(token.colorDark)}</code></span>`);
    }
    bodyHtml = `<div class="tok-values">${parts.join("")}</div>`;
  }

  return [
    `<article class="tok-card">`,
    `<div class="tok-head"><code class="tok-name">${escapeHtml(token.name)}</code></div>`,
    bodyHtml,
    commentHtml,
    `</article>`,
  ].join("");
}

/**
 * Renders a self-contained HTML design-token reference page from token CSS text.
 * @param {string} cssText
 * @returns {string}
 */
export function renderTokensPage(cssText) {
  const { tokens, families } = parseTokensCss(cssText);
  const tokenMap = new Map(tokens.map((t) => [t.name, t]));

  const navHtml = families
    .map(
      (f) =>
        `<a class="tok-pill" href="#family-${escapeHtml(f.name)}">${escapeHtml(f.name)} <span class="tok-count">${f.tokens.length}</span></a>`,
    )
    .join("\n      ");

  const sectionsHtml = families
    .map(
      (f) => [
        `  <section class="tok-section" id="family-${escapeHtml(f.name)}">`,
        `    <h2 class="tok-section-title">${escapeHtml(f.name)} <span class="tok-count">${f.tokens.length}</span></h2>`,
        `    <div class="tok-grid">`,
        ...f.tokens.map((t) => `      ${renderTokenCard(t, tokenMap)}`),
        `    </div>`,
        `  </section>`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `  <meta charset="utf-8">`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1">`,
    `  <title>ChronoNote Design Tokens</title>`,
    `  <style>`,
    `    * { box-sizing: border-box; }`,
    `    body {`,
    `      margin: 0;`,
    `      padding: 28px 24px 64px;`,
    `      font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Roboto", sans-serif;`,
    `      font-size: 14px;`,
    `      line-height: 1.45;`,
    `      background: #141416;`,
    `      color: #e4e4e7;`,
    `    }`,
    `    .tok-wrap { max-width: 1120px; margin: 0 auto; }`,
    `    .tok-header { margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 16px; }`,
    `    .tok-header h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; }`,
    `    .tok-subtitle { margin: 0 0 14px; color: #a1a1aa; font-size: 13px; }`,
    `    .tok-nav { display: flex; flex-wrap: wrap; gap: 6px; }`,
    `    .tok-pill {`,
    `      display: inline-flex; align-items: center; gap: 6px;`,
    `      padding: 4px 10px; border-radius: 999px;`,
    `      background: #222226; border: 1px solid rgba(255,255,255,0.1);`,
    `      color: #e4e4e7; text-decoration: none; font-size: 12px;`,
    `    }`,
    `    .tok-pill:hover { background: #2d2d33; }`,
    `    .tok-count {`,
    `      display: inline-block; padding: 0 6px; border-radius: 999px;`,
    `      background: rgba(255,255,255,0.1); color: #d4d4d8; font-size: 11px;`,
    `    }`,
    `    .tok-section { margin-top: 28px; }`,
    `    .tok-section-title {`,
    `      margin: 0 0 12px; font-size: 16px; font-weight: 600;`,
    `      display: flex; align-items: center; gap: 8px;`,
    `      padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);`,
    `    }`,
    `    .tok-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }`,
    `    .tok-card {`,
    `      background: #1c1c20; border: 1px solid rgba(255,255,255,0.1);`,
    `      border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;`,
    `    }`,
    `    .tok-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }`,
    `    .tok-name { font-size: 13px; font-weight: 600; color: #f4f4f5; }`,
    `    code { font-family: "Cascadia Code", "JetBrains Mono", "Consolas", monospace; font-size: 12px; word-break: break-word; }`,
    `    .tok-swatch-row { display: flex; flex-wrap: wrap; gap: 8px; }`,
    `    .tok-swatch-card {`,
    `      flex: 1 1 130px; display: flex; align-items: center; gap: 8px;`,
    `      padding: 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.28);`,
    `    }`,
    `    .tok-swatch {`,
    `      width: 26px; height: 26px; flex: 0 0 26px; border-radius: 4px;`,
    `      border: 1px solid rgba(128,128,128,0.45);`,
    `    }`,
    `    .tok-swatch-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }`,
    `    .tok-mode-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.72; }`,
    `    .tok-resolved { font-size: 11px; opacity: 0.75; }`,
    `    .tok-sub-label { font-size: 11px; color: #a1a1aa; margin-top: 2px; }`,
    `    .tok-preview-box {`,
    `      padding: 10px 12px; border-radius: 6px; background: #1e1e1e; color: #d4d4d4;`,
    `      border: 1px solid rgba(255,255,255,0.08);`,
    `    }`,
    `    .tok-type-sample, .tok-font-sample { line-height: 1.4; }`,
    `    .tok-radius-row { display: flex; align-items: center; gap: 12px; }`,
    `    .tok-radius-box { width: 44px; height: 28px; background: #37373b; border: 1px solid rgba(255,255,255,0.25); }`,
    `    .tok-shadow-stage {`,
    `      flex: 1 1 130px; padding: 12px; border-radius: 6px;`,
    `      border: 1px solid rgba(128,128,128,0.28); display: flex; flex-direction: column; gap: 8px;`,
    `    }`,
    `    .tok-shadow-card { padding: 8px 10px; border-radius: 6px; font-size: 12px; text-align: center; }`,
    `    .tok-values { display: flex; flex-wrap: wrap; gap: 8px 14px; color: #d4d4d8; }`,
    `    .tok-kv { display: inline-flex; align-items: center; gap: 6px; }`,
    `    .tok-comment { margin: 0; font-size: 12px; color: #a1a1aa; }`,
    `  </style>`,
    `</head>`,
    `<body>`,
    `<div class="tok-wrap">`,
    `  <header class="tok-header">`,
    `    <h1>ChronoNote Design Tokens</h1>`,
    `    <p class="tok-subtitle">Generated from <code>src/styles/01-tokens.css</code> (${tokens.length} tokens in ${families.length} families).</p>`,
    `    <nav class="tok-nav" aria-label="Token families">`,
    `      ${navHtml}`,
    `    </nav>`,
    `  </header>`,
    ``,
    sectionsHtml,
    `</div>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}

function main() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tokensPath = path.join(ROOT, "src", "styles", "01-tokens.css");
  const outPath = path.join(ROOT, "docs", "design", "tokens.html");
  const check = process.argv.includes("--check");

  const cssText = fs.readFileSync(tokensPath, "utf8");
  const html = renderTokensPage(cssText);

  if (check) {
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8").replace(/\r\n/g, "\n") : "";
    if (existing !== html) {
      console.error("tokens-page: docs/design/tokens.html is out of date; run `node scripts/tokens-page.mjs`");
      process.exit(1);
    }
    console.log("tokens-page: ok");
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");
  const { tokens, families } = parseTokensCss(cssText);
  console.log(`tokens-page: wrote docs/design/tokens.html (${tokens.length} tokens in ${families.length} families)`);
}

const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain =
  process.platform === "win32"
    ? entryFile.toLowerCase() === thisFile.toLowerCase()
    : entryFile === thisFile;
if (isMain) main();
