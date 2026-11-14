/** Pure export format conversions (Markdown and HTML) from ChronoNote plain-text grammar.
 * Uses the tokenizer, title-line detection, and glyph table rather than duplicate regexes. */
import { ARROW_GLYPH, GLYPHS, glyphSpecForSymbol } from "./grammar/glyphs";
import { isSetextUnderline, isTitleLine, isTitleUnderline, tokenizeLine, type Token } from "./grammar/tokenize";

const DEFERRED_GLYPH_HTML =
  '<span class="glyph-progress" role="img" aria-label="deferred"><svg class="glyph-progress-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.6 2.8l5.2 5.2-5.2 5.2"/></svg></span>';

const DEFERRED_TEXT_HTML = '<em class="deferred-note">(deferred)</em>';

export function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function leadingParts(tokens: Token[]): {
  indentFrom: number;
  action?: Token;
  topic?: Token;
  emphasis?: Token;
  bullet?: Token;
  restFrom: number;
} {
  if (tokens.length === 0) return { indentFrom: 0, restFrom: 0 };
  const action = tokens[0]?.kind === "action" ? tokens[0] : undefined;
  const topic = tokens[0]?.kind === "topic" ? tokens[0] : undefined;
  const emphasis = tokens.find((t) => t.kind === "emphasis");
  const bullet = tokens.find((t) => t.kind === "bullet");
  const lead = action ?? topic;
  const restFrom = bullet ? bullet.to : emphasis ? emphasis.from + 2 : lead ? lead.to : 0;
  const firstStructural = lead ?? emphasis ?? bullet;
  return { indentFrom: firstStructural ? firstStructural.from : 0, action, topic, emphasis, bullet, restFrom };
}

function renderMarkdownInline(line: string, from: number, tokens: Token[]): string {
  const parts: string[] = [];
  let pos = from;
  let pendingDeferred = false;

  for (const t of tokens) {
    if (t.from < from) continue;
    if (t.kind !== "arrow" && t.kind !== "consequence" && t.kind !== "consequenceTopic") continue;

    if (t.from > pos) {
      parts.push(line.slice(pos, t.from));
    }

    if (t.kind === "arrow") {
      if (pendingDeferred) {
        const last = parts.pop() ?? "";
        parts.push(last ? `${last.trimEnd()} *(deferred)* ` : "*(deferred)* ");
        pendingDeferred = false;
      }
      parts.push("→ ");
    } else {
      parts.push(`${glyphSpecForSymbol(t.symbol!).char} `);
      if (t.kind === "consequence" && t.symbol === ">") {
        pendingDeferred = true;
      }
    }
    pos = t.to;
  }

  const hasTail = pos < line.length;
  if (hasTail) {
    parts.push(line.slice(pos));
  }
  if (pendingDeferred) {
    if (hasTail) {
      const tail = parts.pop() ?? "";
      parts.push(`${tail.trimEnd()} *(deferred)*`);
    } else {
      parts.push("*(deferred)*");
    }
  }
  return parts.join("");
}

function formatMarkdownEmphasized(body: string): string {
  if (body.endsWith(" *(deferred)*")) {
    const core = body.slice(0, -" *(deferred)*".length);
    return `**${core}** *(deferred)*`;
  }
  return `**${body}**`;
}

function renderHtmlInline(line: string, from: number, tokens: Token[]): string {
  const parts: string[] = [];
  let pos = from;
  // A deferred consequence's ` (deferred)` goes after its own text, i.e. before the next arrow or at the end,
  // so the export reads right without styles (as Markdown's `*(deferred)*`).
  let pendingDeferred = false;
  const pushText = (text: string) => {
    if (!pendingDeferred) return void parts.push(escapeHtml(text));
    parts.push(`${escapeHtml(text.trimEnd())} ${DEFERRED_TEXT_HTML}${text.endsWith(" ") ? " " : ""}`);
    pendingDeferred = false;
  };

  for (const t of tokens) {
    if (t.from < from) continue;
    if (t.kind !== "arrow" && t.kind !== "consequence" && t.kind !== "consequenceTopic") continue;

    if (t.from > pos || (pendingDeferred && t.kind === "arrow")) {
      pushText(line.slice(pos, t.from));
    }
    if (t.kind === "arrow") {
      parts.push(`${ARROW_GLYPH.char} `);
    } else if (t.kind === "consequence" && t.symbol === ">") {
      parts.push(`${DEFERRED_GLYPH_HTML} `);
      pendingDeferred = true;
    } else {
      parts.push(`${glyphSpecForSymbol(t.symbol!).char} `);
    }
    pos = t.to;
  }

  if (pos < line.length || pendingDeferred) {
    pushText(line.slice(pos));
  }
  return parts.join("");
}

/** Converts a single note's plain text into Markdown format.
 * If title is provided, prepends `# Title`. */
export function noteToMarkdown(text: string, title?: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section/subsection title: non-empty line directly above === or ---
    if (isTitleLine(line, lines[i + 1])) {
      out.push(`## ${line.trim()}`);
      i++; // drop the underline line
      continue;
    }

    if (isTitleUnderline(line)) {
      // Standalone underline without a title: escape it so it doesn't break Markdown
      out.push(line.replace(/^(\s*)(===|---)/, "$1\\$2"));
      continue;
    }

    if (line.trim() === "") {
      out.push(line);
      continue;
    }

    const tokens = tokenizeLine(line);
    const { indentFrom, action, topic, emphasis, bullet, restFrom } = leadingParts(tokens);
    const indent = line.slice(0, indentFrom);
    const body = renderMarkdownInline(line, restFrom, tokens);
    const rest = emphasis ? formatMarkdownEmphasized(body) : body;

    if (action) {
      switch (action.symbol) {
        case "#":
          out.push(`${indent}- [ ] ${rest}`);
          break;
        case "v":
          out.push(`${indent}- [x] ${rest}`);
          break;
        case ">":
          out.push(`${indent}- [ ] ${rest} *(deferred)*`);
          break;
        case "x":
          out.push(`${indent}- [x] ~~${rest}~~ *(won't do)*`);
          break;
      }
      continue;
    }

    if (topic) {
      switch (topic.symbol) {
        case "o":
          out.push(`${indent}- ${rest}`);
          break;
        case ".":
          out.push(`${indent}- ${rest} *(discussed)*`);
          break;
        case ",":
          out.push(`${indent}- ${rest} *(not discussed)*`);
          break;
      }
      continue;
    }

    if (emphasis) {
      const bulletPrefix = bullet ? `${bullet.symbol} ` : "";
      out.push(`${indent}${bulletPrefix}${rest}`);
      continue;
    }

    if (bullet) {
      out.push(`${indent}${bullet.symbol} ${rest}`);
      continue;
    }

    // Numbered lists and plain lines: keep indentation, render consequences, and escape
    // Markdown-special characters only where they would change meaning at the start of a plain line.
    const lineStr = body.replace(/^(\s*)([#>]|\+\s|```|~~~|---|===)/, "$1\\$2");
    out.push(lineStr);
  }

  const result = out.join("\n");
  if (title) {
    return result ? `# ${title}\n\n${result}` : `# ${title}`;
  }
  return result;
}

/** Converts multiple dated notes into a single Markdown document with `# YYYY-MM-DD` headings. */
export function notesToMarkdown(notes: { date: string; text: string }[]): string {
  if (notes.length === 0) return "";
  return notes
    .map((note) => {
      const md = noteToMarkdown(note.text);
      return md ? `# ${note.date}\n\n${md}` : `# ${note.date}`;
    })
    .join("\n\n") + "\n";
}

function renderNoteContentHtml(text: string): string {
  const lines = text.split(/\r?\n/);
  const parts: string[] = [];
  let bodyLines: string[] = [];

  function flushBody() {
    if (bodyLines.length > 0) {
      parts.push(`<div class="note-body">${bodyLines.join("\n")}</div>`);
      bodyLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isTitleLine(line, lines[i + 1])) {
      flushBody();
      parts.push(`<h2>${escapeHtml(line.trim())}</h2>`);
      i++; // skip underline
      continue;
    }

    if (isSetextUnderline(line)) {
      continue;
    }

    const tokens = tokenizeLine(line);
    const { indentFrom, action, topic, emphasis, bullet, restFrom } = leadingParts(tokens);
    const indent = line.slice(0, indentFrom);
    const bodyHtml = renderHtmlInline(line, restFrom, tokens);
    const deferredLine = action?.symbol === ">" ? ` ${DEFERRED_TEXT_HTML}` : "";
    const restHtml = (emphasis ? `<strong>${bodyHtml}</strong>` : bodyHtml) + deferredLine;

    const glyphs: string[] = [];
    if (action) {
      glyphs.push(action.symbol === ">" ? DEFERRED_GLYPH_HTML : glyphSpecForSymbol(action.symbol!).char);
    } else if (topic) {
      glyphs.push(glyphSpecForSymbol(topic.symbol!).char);
    }
    if (bullet) {
      glyphs.push(GLYPHS.bullet.char);
    }

    if (glyphs.length > 0 || emphasis) {
      const prefix = glyphs.length > 0 ? `${glyphs.join(" ")} ` : "";
      bodyLines.push(`<div class="note-line">${escapeHtml(indent)}${prefix}${restHtml}</div>`);
      continue;
    }

    const content = bodyHtml === "" ? "&nbsp;" : bodyHtml;
    bodyLines.push(`<div class="note-line">${content}</div>`);
  }

  flushBody();
  return parts.join("\n");
}

const HTML_STYLE = `
  :root {
    --bg: #ffffff;
    --fg: #1a1c20;
    --muted: #5a606b;
    --line: #dde0e5;
    --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
    --font-mono: "Cascadia Code", "Cascadia Mono", Consolas, ui-monospace, monospace;
  }
  body {
    margin: 24px;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-ui);
    line-height: 1.5;
  }
  .date-heading {
    font-family: var(--font-ui);
    font-size: 20px;
    font-weight: 600;
    margin: 24px 0 12px 0;
    border-bottom: 1px solid var(--line);
    padding-bottom: 4px;
  }
  .date-heading:first-child {
    margin-top: 0;
  }
  .note-container {
    margin-bottom: 28px;
  }
  h2 {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 600;
    margin: 16px 0 8px 0;
  }
  .note-body {
    font-family: var(--font-mono);
    font-size: 13.5px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .note-line {
    min-height: 1.5em;
  }
  .glyph-progress {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.78em;
    height: 0.78em;
    box-sizing: border-box;
    border: 1.4px solid currentColor;
    border-radius: 1.5px;
    vertical-align: -0.06em;
  }
  .glyph-progress-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  @media print {
    body {
      background: transparent !important;
      margin: 0;
    }
    .date-heading:not(:first-of-type) {
      page-break-before: always;
      break-before: page;
    }
  }
`.trim();

/** Converts a single note into a complete standalone HTML document. */
export function noteToHtml(text: string, title?: string): string {
  const content = renderNoteContentHtml(text);
  const heading = title ? `<h1 class="date-heading">${escapeHtml(title)}</h1>\n` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title ?? "ChronoNote")}</title>
  <style>
${HTML_STYLE}
  </style>
</head>
<body>
${heading}${content}
</body>
</html>`;
}

/** Converts multiple notes into a single standalone HTML document with page-break rules. */
export function notesToHtml(notes: { date: string; text: string }[]): string {
  const renderedNotes = notes
    .map(
      (n) => `  <div class="note-container">
    <h1 class="date-heading">${escapeHtml(n.date)}</h1>
${renderNoteContentHtml(n.text)}
  </div>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ChronoNote Export</title>
  <style>
${HTML_STYLE}
  </style>
</head>
<body>
${renderedNotes}
</body>
</html>`;
}
