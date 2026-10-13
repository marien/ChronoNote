/** One line tokenizer for the note grammar (docs/design/line-tokenizer-design.md).
 * Pure and single pass. It reproduces exactly what the editor's `renderMatcher`
 * regex and the read-only `parseGlyphLine` recognise today; offsets are into
 * the original line. */
import { ACTION_CLASS, BULLET_CLASS, TOPIC_CLASS } from "./symbols";

export type TokenKind =
  | "action" // # v > x at line start (after indentation); includes the trailing space
  | "topic" // o . , at line start; includes the trailing space
  | "bullet" // - * at line start or after action/topic; includes the trailing space
  | "emphasis" // `! ` at column 0, indented, or after action/topic; covers to end of line
  | "arrow" // the `=> ` of a follow-up / delegation / consequence
  | "consequence" // the # v > x after `=> `, with its trailing space
  | "consequenceTopic" // the o . , after `=> `, with its trailing space
  | "assignee" // @name: after `=> `, bare, or inside a (@a, @b) list
  | "assigneeList" // the whole `(@a)` / `(@a, @b)`; its assignee tokens follow it
  | "topicTag" // (topic) right after an action or topic symbol
  | "paren"; // any other `(word)`: recognised (and consumed) but not decorated

export interface Token {
  kind: TokenKind;
  /** Offsets in the line. Leading indentation is never part of a token. */
  from: number;
  to: number;
  /** "#", "v", ">", "x", "o", ".", ",", "-", "*" (or "!" for emphasis). */
  symbol?: string;
  /** Drawn as a glyph widget (and atomic in the editor), not marked in place. */
  replaced: boolean;
}

/** Same pattern as `leadingTopicTag` in tokens.ts, kept here so the grammar has no
 * dependency on it. `(@name)` is a delegate, not a topic. */
const TOPIC_TAG = new RegExp(
  String.raw`^(\s*(?:${ACTION_CLASS}|${TOPIC_CLASS})\s+|.*?=>\s+(?:${ACTION_CLASS}|${TOPIC_CLASS})\s+)(\((?!@)[^\s()]+\))`,
);

const LINE_START = new RegExp(String.raw`^(\s*)(?:(${ACTION_CLASS})|(${TOPIC_CLASS})|(${BULLET_CLASS}))\s`);

const BULLET_AFTER_STATE = new RegExp(String.raw`^(${BULLET_CLASS})\s`);

// Alternatives in the editor's order: `=> @name`, `=> <symbol> `, `=> <topic> `, `=> `, `(@a, @b)`,
// bare `@name` (not glued to a word, `@` or `/`), `(word)`.
const INLINE = new RegExp(
  String.raw`=>\s@([\w-]+)|=>\s(${ACTION_CLASS})\s|=>\s(${TOPIC_CLASS})\s|=>\s|\(@([\w-]+(?:[\s,]+@[\w-]+)*)\)|(?<![\w@/])@([\w-]+)|\(([^\s()]+)\)`,
  "g",
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
      tokens.push({ kind: "assigneeList", from, to, replaced: false });
      for (const n of m[0].matchAll(/@[\w-]+/g)) {
        tokens.push({ kind: "assignee", from: from + n.index!, to: from + n.index! + n[0].length, replaced: false });
      }
    } else if (m[5] !== undefined) {
      tokens.push({ kind: "assignee", from, to, replaced: false });
    } else {
      tokens.push({ kind: from === tagFrom ? "topicTag" : "paren", from, to, replaced: false });
    }
  }
  return tokens;
}
