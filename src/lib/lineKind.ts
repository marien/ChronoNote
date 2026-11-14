import { tokenizeLine, type TokenizeOptions } from "./grammar/tokenize";

export type LineKind = "action" | "topic" | "plain";

/**
 * Classifies a line of text as "action", "topic", or "plain" for the mobile accessory bar.
 * - Action lines: leading `# `, `v `, `x `, `> ` or `=> ` consequence-action (unless it's a title line).
 * - Topic lines: leading `o `, `. `, `, ` or `=> ` consequence-topic (when not led by an action).
 * - Everything else: plain.
 */
export function lineKind(text: string, options?: TokenizeOptions): LineKind {
  const tokens = tokenizeLine(text, options);
  const first = tokens[0];
  if (first?.kind === "action") return "action";
  if (first?.kind === "topic") return "topic";
  for (const t of tokens) {
    if (t.kind === "consequence") return "action";
    if (t.kind === "consequenceTopic") return "topic";
  }
  return "plain";
}
