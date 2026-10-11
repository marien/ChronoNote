/** Pure export format conversions (Markdown and HTML) from ChronoNote plain-text grammar.
 * Uses the existing tokenizer and setext detection rather than new regexes. */
import { tokenizeLine } from "./grammar/tokenize";
import { isSetextUnderline } from "./tokens";

export function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Converts a single note's plain text into Markdown format.
 * If title is provided, prepends `# Title`. */
export function noteToMarkdown(text: string, title?: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section title: non-empty line followed by setext underline
    if (i + 1 < lines.length && isSetextUnderline(lines[i + 1]) && line.trim() !== "") {
      out.push(`## ${line.trim()}`);
      i++; // drop the underline line
      continue;
    }

    if (isSetextUnderline(line)) {
      // Standalone underline without a title: escape it so it doesn't break Markdown
      out.push(line.replace(/^(\s*)===/, "$1\\==="));
      continue;
    }

    if (line.trim() === "") {
      out.push(line);
      continue;
    }

    const tokens = tokenizeLine(line);
    const first = tokens[0];

    if (first?.kind === "emphasis") {
      const rest = line.slice(2).replaceAll("=> ", "→ ");
      out.push(`**${rest}**`);
      continue;
    }

    if (first?.kind === "action") {
      const indent = line.slice(0, first.from);
      const rest = line.slice(first.to).replaceAll("=> ", "→ ");
      switch (first.symbol) {
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

    if (first?.kind === "topic") {
      const indent = line.slice(0, first.from);
      const rest = line.slice(first.to).replaceAll("=> ", "→ ");
      switch (first.symbol) {
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

    if (first?.kind === "bullet") {
      const indent = line.slice(0, first.from);
      const rest = line.slice(first.to).replaceAll("=> ", "→ ");
      out.push(`${indent}${first.symbol} ${rest}`);
      continue;
    }

    // Numbered lists and plain lines: keep indentation, convert arrow, and escape Markdown-special
    // characters only where they would change meaning at the start of a plain line.
    let lineStr = line.replaceAll("=> ", "→ ");
    lineStr = lineStr.replace(/^(\s*)([#>]|\+\s|```|~~~|---|===)/, "$1\\$2");
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

    if (i + 1 < lines.length && isSetextUnderline(lines[i + 1]) && line.trim() !== "") {
      flushBody();
      parts.push(`<h2>${escapeHtml(line.trim())}</h2>`);
      i++; // skip underline
      continue;
    }

    if (isSetextUnderline(line)) {
      continue;
    }

    const tokens = tokenizeLine(line);
    const first = tokens[0];

    if (first?.kind === "emphasis") {
      const rest = line.slice(2).replaceAll("=> ", "➔ ");
      bodyLines.push(`<div class="note-line"><strong>${escapeHtml(rest)}</strong></div>`);
      continue;
    }

    if (first?.kind === "action") {
      const indent = line.slice(0, first.from);
      const rest = line.slice(first.to).replaceAll("=> ", "➔ ");
      let glyph = "☐";
      if (first.symbol === "v") glyph = "☑";
      else if (first.symbol === "x") glyph = "☒";
      bodyLines.push(`<div class="note-line">${escapeHtml(indent)}${glyph} ${escapeHtml(rest)}</div>`);
      continue;
    }

    if (first?.kind === "topic") {
      const indent = line.slice(0, first.from);
      const rest = line.slice(first.to).replaceAll("=> ", "➔ ");
      let glyph = "○";
      if (first.symbol === ".") glyph = "◉";
      else if (first.symbol === ",") glyph = "◌";
      bodyLines.push(`<div class="note-line">${escapeHtml(indent)}${glyph} ${escapeHtml(rest)}</div>`);
      continue;
    }

    if (first?.kind === "bullet") {
      const indent = line.slice(0, first.from);
      const rest = line.slice(first.to).replaceAll("=> ", "➔ ");
      bodyLines.push(`<div class="note-line">${escapeHtml(indent)}• ${escapeHtml(rest)}</div>`);
      continue;
    }

    const transformed = line.replaceAll("=> ", "➔ ");
    const content = transformed === "" ? "&nbsp;" : escapeHtml(transformed);
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
