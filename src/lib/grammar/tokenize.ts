/** One line tokenizer for the note grammar (docs/design/line-tokenizer-design.md).
 * Pure and single pass. It reproduces exactly what the editor's `renderMatcher`
 * regex and the read-only `parseGlyphLine` recognise today; offsets are into
 * the original line. */
import { ACTION_CLASS, BULLET_CLASS, NAME_CHAR, NAME_GLUE, TOPIC_CLASS } from "./symbols";

export type TokenKind =
  | "action" // # v > x at line start (after indentation); includes the trailing space
  | "topic" // o . , at line start; includes the trailing space
  | "bullet" // - * at line start or after action/topic; includes the trailing space
  | "emphasis" // `! ` at column 0, indented, or after action/topic; covers to end of line
  | "arrow" // the `=> ` of a follow-up / delegation / consequence
  | "consequence" // the # v > x after `=> `, with its trailing space
  | "consequenceTopic" // the o . , after `=> `, with its trailing space
  | "assignee" // @name: after `=> `, bare, or inside a (@a, @b) list
  | "topicTag" // (topic) right after an action or topic symbol
  | "paren" // any other `(word)`: recognised (and consumed) but not decorated
  | "due" // by: followed by a valid calendar date YYYY-MM-DD
  | "dueWord" // by: followed by non-space chars not a valid ISO date
  | "forwardLink" // (>YYYY-MM-DD#Section) or (<YYYY-MM-DD#Section)
  | "escape"; // leading \ escaping a marker, or \ before =>

export interface Token {
  kind: TokenKind;
  /** Offsets in the line. Leading indentation is never part of a token. */
  from: number;
  to: number;
  /** "#", "v", ">", "x", "o", ".", ",", "-", "*" (or "!" for emphasis). */
  symbol?: string;
  /** Drawn as a glyph widget (and atomic in the editor), not marked in place. */
  replaced: boolean;
  /** ISO date YYYY-MM-DD for a "due" token. */
  date?: string;
  /** Direction for a "forwardLink" token: ">" (to) or "<" (from). */
  dir?: "<" | ">";
  /** Optional section for a "forwardLink" token. */
  section?: string;
  /** Text after "by:" for a "dueWord" token. */
  word?: string;
}

export interface ActionPart {
  from: number;
  to: number;
  state: "#" | "v" | ">" | "x" | null;
  delegated: boolean;
  assignee?: string;
}

export function isSetextUnderline(line: string): boolean {
  return /^={3,}$/.test(line.trim());
}

/** True for section (`===`) or subsection (`---`) underlines (three or more `=` or `-`). */
export function isTitleUnderline(line: string): boolean {
  let i = 0;
  const len = line.length;
  while (i < len && line.charCodeAt(i) <= 32) i++;
  if (i >= len) return false;
  const ch = line.charCodeAt(i);
  if (ch !== 61 && ch !== 45) return false; // '=' or '-'
  let count = 0;
  while (i < len && line.charCodeAt(i) === ch) {
    count++;
    i++;
  }
  if (count < 3) return false;
  while (i < len && line.charCodeAt(i) <= 32) i++;
  return i === len;
}

/** True when `line` is a non-blank title line directly above a title underline (`===` or `---`).
 * Blank lines and underline lines themselves are not title lines. */
export function isTitleLine(line: string, nextLine?: string): boolean {
  return nextLine !== undefined && isTitleUnderline(nextLine) && line.trim() !== "" && !isTitleUnderline(line);
}

/** Visual column width of a leading-whitespace string (each tab counts as 2 columns). */
export function columnOf(indent: string): number {
  let col = 0;
  for (let i = 0; i < indent.length; i++) {
    col += indent[i] === "\t" ? 2 : 1;
  }
  return col;
}

export interface TokenizeOptions {
  /** When true, the line sits directly above a `===` or `---` underline and has no tokens. */
  title?: boolean;
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Returns the token immediately after `arrow` (`tokens[arrowIndex]`) when only whitespace separates them,
 * or `undefined` when followed by plain text or end of line. Assumes `tokens` is sorted by `from`. */
export function tokenAfterArrow(line: string, tokens: readonly Token[], arrowIndex: number): Token | undefined {
  const arrow = tokens[arrowIndex];
  const next = tokens[arrowIndex + 1];
  if (!arrow || !next || next.from < arrow.to) return undefined;
  return line.slice(arrow.to, next.from).trim() === "" ? next : undefined;
}

export function getLineActionParts(line: string, tokens: readonly Token[]): ActionPart[] {
  interface Part {
    from: number;
    to: number;
    isAction: boolean;
    state: "#" | "v" | ">" | "x" | null;
    delegated: boolean;
    assignee?: string;
  }

  const parts: Part[] = [];
  const leadAction = tokens[0]?.kind === "action";
  parts.push({
    from: 0,
    to: line.length,
    isAction: leadAction,
    state: leadAction ? (tokens[0].symbol as "#" | "v" | ">" | "x") : null,
    delegated: false,
  });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== "arrow") continue;
    const next = tokenAfterArrow(line, tokens, i);
    if (!next) continue;

    if (next.kind === "consequence") {
      parts[parts.length - 1].to = t.from;
      parts.push({
        from: t.from,
        to: line.length,
        isAction: true,
        state: next.symbol as "#" | "v" | ">" | "x",
        delegated: false,
      });
    } else if (next.kind === "assignee") {
      parts[parts.length - 1].to = t.from;
      const assigneeName = line.slice(next.from + 1, next.to);
      parts.push({
        from: t.from,
        to: line.length,
        isAction: true,
        state: null,
        delegated: true,
        assignee: assigneeName,
      });
    } else if (next.kind === "consequenceTopic") {
      parts[parts.length - 1].to = t.from;
      parts.push({
        from: t.from,
        to: line.length,
        isAction: false,
        state: null,
        delegated: false,
      });
    }
  }

  return parts.filter((p) => p.isAction && p.from < p.to);
}

/** Same pattern as `leadingTopicTag` in tokens.ts, kept here so the grammar has no
 * dependency on it. `(@name)` is a delegate, not a topic. */
const LINE_START = new RegExp(String.raw`^(\s*)(?:(${ACTION_CLASS})|(${TOPIC_CLASS})|(${BULLET_CLASS}))\s`);

const LEADING_ESCAPE = new RegExp(
  String.raw`^(\s*)\\(?:(?:${ACTION_CLASS}|${TOPIC_CLASS}|${BULLET_CLASS}|!|=>)\s|[1-9]\d{0,8}(?:\.[1-9]\d{0,8})*[.)]\s)`,
);

const BULLET_AFTER_STATE = new RegExp(String.raw`^(${BULLET_CLASS})\s`);

// Alternatives in the editor's order: `\=> ` (escaped arrow), `=> @name`, `=> <symbol> `, `=> <topic> `, `=> `,
// bare `@name` (not glued to a word, `@` or `/`; also each name in `(@a, @b)`, which has no meaning of its own),
// `(word)` (never `(@…)`). Spaces between `=>` and its symbol or `@name` stay in the text; each marker stays symbol + 1 space.
const INLINE = new RegExp(
  String.raw`\\=>\s|=>\s+@(${NAME_CHAR}+)|=>\s+(${ACTION_CLASS})\s|=>\s+(${TOPIC_CLASS})\s|=>\s|(?<!${NAME_GLUE})@(${NAME_CHAR}+)|\((?!@)([^\s()]+)\)`,
  "gu",
);

const FORWARD_LINK_RE = /\(([<>])(\d{4}-\d{2}-\d{2})(?:#([^)\r\n]+))?\)/gu;

/** #208: `! - item` / `! * item` (also after an action or topic symbol: `# ! - item`) is an emphasised list item: a
 * bullet right after the `! ` is drawn as one. Returns where the scan continues. */
function pushBulletAfterEmphasis(tokens: Token[], line: string, scanFrom: number): number {
  const bullet = BULLET_AFTER_STATE.exec(line.slice(scanFrom));
  if (!bullet) return scanFrom;
  tokens.push({ kind: "bullet", from: scanFrom, to: scanFrom + bullet[0].length, symbol: bullet[1], replaced: true });
  return scanFrom + bullet[0].length;
}

export function tokenizeLine(line: string, options?: TokenizeOptions): Token[] {
  if (options?.title) return [];
  const tokens: Token[] = [];
  let scanFrom = 0;

  const leadingEscape = line.includes("\\") ? LEADING_ESCAPE.exec(line) : null;
  if (leadingEscape) {
    const indent = leadingEscape[1].length;
    tokens.push({ kind: "escape", from: indent, to: indent + 1, replaced: false });
    scanFrom = leadingEscape[0].length;
  } else {
    const emphasisLead = /^(\s*)!\s/.exec(line);
    if (emphasisLead) {
      const indent = emphasisLead[1].length;
      // The editor marks from the `!`; its inline tokens are still found after the `! `.
      tokens.push({ kind: "emphasis", from: indent, to: line.length, symbol: "!", replaced: false });
      scanFrom = pushBulletAfterEmphasis(tokens, line, indent + 2);
    } else {
      const lead = LINE_START.exec(line);
      if (lead) {
        const [full, indent, action, topic, bullet] = lead;
        const symbol = action ?? topic ?? bullet;
        tokens.push({
          kind: action ? "action" : topic ? "topic" : "bullet",
          from: indent.length,
          to: full.length,
          symbol,
          replaced: true,
        });
        scanFrom = full.length;

        if (action || topic) {
          const bulletFollow = BULLET_AFTER_STATE.exec(line.slice(scanFrom));
          if (bulletFollow) {
            tokens.push({
              kind: "bullet",
              from: scanFrom,
              to: scanFrom + bulletFollow[0].length,
              symbol: bulletFollow[1],
              replaced: true,
            });
            scanFrom += bulletFollow[0].length;
          } else if (/^!\s/.test(line.slice(scanFrom))) {
            tokens.push({
              kind: "emphasis",
              from: scanFrom,
              to: line.length,
              symbol: "!",
              replaced: false,
            });
            scanFrom = pushBulletAfterEmphasis(tokens, line, scanFrom + 2);
          }
        }
      }
    }
  }

  const fwdLinks: Token[] = [];
  // Only lines that can hold one run the regex: this runs for every line on every rebuild (perf.test.ts).
  FORWARD_LINK_RE.lastIndex = line.includes("(>") || line.includes("(<") ? scanFrom : line.length;
  let fm: RegExpExecArray | null;
  while ((fm = FORWARD_LINK_RE.exec(line)) !== null) {
    const [full, dir, dateStr, section] = fm;
    const parts = dateStr.split("-").map((p) => parseInt(p, 10));
    if (isValidCalendarDate(parts[0], parts[1], parts[2])) {
      fwdLinks.push({
        kind: "forwardLink",
        from: fm.index,
        to: fm.index + full.length,
        dir: dir as "<" | ">",
        date: dateStr,
        ...(section !== undefined ? { section } : {}),
        replaced: false,
      });
    }
  }

  let hasTopicTag = false;
  if (line.includes("=>") || line.includes("@") || line.includes("(")) {
    INLINE.lastIndex = scanFrom;
    let m: RegExpExecArray | null;
    while ((m = INLINE.exec(line)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
      if (fwdLinks.some((f) => from < f.to && to > f.from)) {
        continue;
      }
      if (m[0].startsWith("\\")) {
        tokens.push({ kind: "escape", from, to: from + 1, replaced: false });
      } else if (m[1] !== undefined) {
        tokens.push({ kind: "arrow", from, to: from + 3, replaced: true });
        const symFrom = to - m[1].length - 1;
        tokens.push({ kind: "assignee", from: symFrom, to, replaced: false });
      } else if (m[2] !== undefined) {
        tokens.push({ kind: "arrow", from, to: from + 3, replaced: true });
        tokens.push({ kind: "consequence", from: to - 2, to, symbol: m[2], replaced: true });
      } else if (m[3] !== undefined) {
        tokens.push({ kind: "arrow", from, to: from + 3, replaced: true });
        tokens.push({ kind: "consequenceTopic", from: to - 2, to, symbol: m[3], replaced: true });
      } else if (m[0].startsWith("=>")) {
        tokens.push({ kind: "arrow", from, to, replaced: true });
      } else if (m[4] !== undefined) {
        tokens.push({ kind: "assignee", from, to, replaced: false });
      } else {
        const isTag =
          !hasTopicTag &&
          tokens.some(
            (t) =>
              (t.kind === "action" || t.kind === "topic" || t.kind === "consequence" || t.kind === "consequenceTopic") &&
              t.to <= from &&
              line.slice(t.to, from).trim() === "",
          );
        if (isTag) hasTopicTag = true;
        tokens.push({ kind: isTag ? "topicTag" : "paren", from, to, replaced: false });
      }
    }
  }

  if (fwdLinks.length > 0) {
    tokens.push(...fwdLinks);
    if (tokens.length > 1) tokens.sort((a, b) => a.from - b.from || a.to - b.to);
  }
  const actionParts = line.includes(":") ? getLineActionParts(line, tokens) : [];
  let addedDue = false;
  if (actionParts.length > 0) {
    // Not glued to a word, and not inside a URL path or an address (`…/by:x`, `a.by:x`, `@by:x`).
    const DUE_RE = /(?<![\p{L}\p{N}_/.@:-])by:/giu;
    for (const part of actionParts) {
      DUE_RE.lastIndex = part.from;
      let dm: RegExpExecArray | null;
      while ((dm = DUE_RE.exec(line)) !== null) {
        if (dm.index >= part.to) break;
        const matchStart = dm.index;

        if (tokens.some((t) => t.kind !== "emphasis" && matchStart >= t.from && matchStart < t.to)) {
          continue;
        }

        const afterStart = matchStart + 3;
        if (afterStart >= part.to) continue;

        const sliceAfter = line.slice(afterStart, part.to);
        const whiteIdx = sliceAfter.search(/\s/);
        const rawWordEnd = whiteIdx === -1 ? part.to : afterStart + whiteIdx;
        const rawWord = line.slice(afterStart, rawWordEnd);
        if (rawWord.length === 0) continue;

        const cleanWord = rawWord.replace(/[)\].,;!?"']+$/, "");
        if (cleanWord.length === 0) continue;

        const tokenTo = afterStart + cleanWord.length;

        if (tokens.some((t) => t.kind !== "emphasis" && tokenTo > t.from && tokenTo <= t.to)) {
          continue;
        }

        const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanWord);
        if (isoMatch && isValidCalendarDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))) {
          tokens.push({
            kind: "due",
            from: matchStart,
            to: tokenTo,
            replaced: false,
            date: cleanWord,
          });
        } else {
          tokens.push({
            kind: "dueWord",
            from: matchStart,
            to: tokenTo,
            replaced: false,
            word: cleanWord,
          });
        }
        addedDue = true;
        break;
      }
    }
  }

  if (addedDue && tokens.length > 1) {
    tokens.sort((a, b) => a.from - b.from || a.to - b.to);
  }
  return tokens;
}

/** Tokenizes line `lineIdx` of a split note, treating a non-blank title line above `===` or `---` as plain text. */
export function tokenizeNoteLine(lines: readonly string[], lineIdx: number): Token[] {
  const line = lines[lineIdx] ?? "";
  return tokenizeLine(line, { title: isTitleLine(line, lines[lineIdx + 1]) });
}

/** Tokenizes a 1-based document line (e.g. CodeMirror `Text`), treating title lines above `===` or `---` as plain text. */
export function tokenizeDocLine(
  doc: { lines: number; line(n: number): { text: string } },
  line: { number: number; text: string },
): Token[] {
  const nextText = line.number < doc.lines ? doc.line(line.number + 1).text : undefined;
  return tokenizeLine(line.text, { title: isTitleLine(line.text, nextText) });
}

/** True when a line has at least one open (`#`) action part (and is not a title line above `===` or `---`). */
export function hasOpenAction(line: string, nextLine?: string): boolean {
  const tokens = tokenizeLine(line, { title: isTitleLine(line, nextLine) });
  return getLineActionParts(line, tokens).some((p) => p.state === "#");
}
