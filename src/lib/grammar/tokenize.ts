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
  | "dueWord"; // by: followed by non-space chars not a valid ISO date

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

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function getLineActionParts(line: string, tokens: Token[]): ActionPart[] {
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
    const next = tokens[i + 1];
    if (!next || next.from !== t.to) continue;

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
const TOPIC_TAG = new RegExp(
  String.raw`^(\s*(?:${ACTION_CLASS}|${TOPIC_CLASS})\s+|.*?=>\s+(?:${ACTION_CLASS}|${TOPIC_CLASS})\s+)(\((?!@)[^\s()]+\))`,
);

const LINE_START = new RegExp(String.raw`^(\s*)(?:(${ACTION_CLASS})|(${TOPIC_CLASS})|(${BULLET_CLASS}))\s`);

const BULLET_AFTER_STATE = new RegExp(String.raw`^(${BULLET_CLASS})\s`);

// Alternatives in the editor's order: `=> @name`, `=> <symbol> `, `=> <topic> `, `=> `, bare `@name` (not glued to a
// word, `@` or `/`; also each name in `(@a, @b)`, which has no meaning of its own), `(word)` (never `(@…)`).
const INLINE = new RegExp(
  String.raw`=>\s@(${NAME_CHAR}+)|=>\s(${ACTION_CLASS})\s|=>\s(${TOPIC_CLASS})\s|=>\s|(?<!${NAME_GLUE})@(${NAME_CHAR}+)|\((?!@)([^\s()]+)\)`,
  "gu",
);

export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let scanFrom = 0;

  const emphasisLead = /^(\s*)!\s/.exec(line);
  if (emphasisLead) {
    const indent = emphasisLead[1].length;
    // The editor marks from the `!`; its inline tokens are still found after the `! `.
    tokens.push({ kind: "emphasis", from: indent, to: line.length, symbol: "!", replaced: false });
    scanFrom = indent + 2;
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
          scanFrom += 2;
        }
      }
    }
  }

  const tagFrom = TOPIC_TAG.exec(line)?.[1].length ?? -1;
  INLINE.lastIndex = scanFrom;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(line)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (m[1] !== undefined) {
      tokens.push({ kind: "arrow", from, to: from + 3, replaced: true });
      tokens.push({ kind: "assignee", from: from + 3, to, replaced: false });
    } else if (m[2] !== undefined) {
      tokens.push({ kind: "arrow", from, to: from + 3, replaced: true });
      tokens.push({ kind: "consequence", from: from + 3, to, symbol: m[2], replaced: true });
    } else if (m[3] !== undefined) {
      tokens.push({ kind: "arrow", from, to: from + 3, replaced: true });
      tokens.push({ kind: "consequenceTopic", from: from + 3, to, symbol: m[3], replaced: true });
    } else if (m[0].startsWith("=>")) {
      tokens.push({ kind: "arrow", from, to, replaced: true });
    } else if (m[4] !== undefined) {
      tokens.push({ kind: "assignee", from, to, replaced: false });
    } else {
      tokens.push({ kind: from === tagFrom ? "topicTag" : "paren", from, to, replaced: false });
    }
  }

  const actionParts = getLineActionParts(line, tokens);
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

        break;
      }
    }
    tokens.sort((a, b) => a.from - b.from || a.to - b.to);
  }

  return tokens;
}
