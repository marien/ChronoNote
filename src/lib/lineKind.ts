export type LineKind = "action" | "topic" | "plain";

const ACTION_RE = /^\s*([#vx>]|=>\s[#vx>])\s/;
const TOPIC_RE = /^\s*[o.,]\s/;

/**
 * Classifies a line of text as "action", "topic", or "plain" for the mobile accessory bar.
 * - Action lines: leading `# `, `v `, `x `, `> ` (or consequence `=> ` followed by one of those).
 * - Topic lines: leading `o `, `. `, `, `.
 * - Everything else: plain.
 */
export function lineKind(text: string): LineKind {
  if (ACTION_RE.test(text)) {
    return "action";
  }
  if (TOPIC_RE.test(text)) {
    return "topic";
  }
  return "plain";
}
