/** Token semantics from spec section 2.2/2.3: parsing helpers shared by the
 * editor's glyph rendering, the action drawer, and section history. */

/** §40: `x` (won't-do) folds into Closed alongside `v` (done) — both mean
 * "no longer outstanding," just for different reasons. §41: a
 * `=> <symbol>` consequence-action counts toward the same bucket its
 * inner symbol would on its own (`=> #` → Open, `=> v`/`=> x` → Closed,
 * `=> >` → Forwarded). §50: the leading action symbol may be indented,
 * matching how bulleted lines already tolerate indentation. */
export function countActions(text: string): { open: number; closed: number; forwarded: number } {
  const openMatches = text.match(/(^\s*#\s)|(=>\s#\s)/gm) || [];
  const closedMatches = text.match(/(^\s*[vx]\s)|(=>\s[vx]\s)/gm) || [];
  const forwardedMatches = text.match(/(^\s*>\s)|(=>\s>\s)/gm) || [];
  return { open: openMatches.length, closed: closedMatches.length, forwarded: forwardedMatches.length };
}

/** The action symbol that actually governs a line's state — whether it's
 * a plain action line or a `=> <symbol>` consequence-action (§41).
 * Returns `null` for lines with no action symbol at all (including plain
 * `=> text` and `=> @name text`, which have no state of their own). Shared
 * by the Action Drawer's "only open" toggle (§44) and its glyph-only
 * display (§45), so both agree on exactly what counts as "this line's
 * action state." */
export function innermostActionSymbol(line: string): "#" | "v" | ">" | "x" | null {
  const consequence = line.match(/=>\s([#vx>])\s/);
  if (consequence) return consequence[1] as "#" | "v" | ">" | "x";
  const plain = line.match(/^\s*([#vx>])\s/);
  if (plain) return plain[1] as "#" | "v" | ">" | "x";
  return null;
}

/** A line carrying an action or follow-up token — a leading (optionally
 * indented, §50) `# `/`v `/`> `/`x `, or a `=> ` anywhere on the line
 * (§41/§59, which can follow other text). Shared by Section History's
 * collector and the inline assignee (#35) highlighting. */
export function isActionLikeLine(line: string): boolean {
  return /^\s*[#vx>]\s/.test(line) || /=>\s/.test(line);
}

/** #36/#39: a `(topic)` tag used to group actions by subject, but only
 * when it sits **immediately after the action symbol** — a leading
 * (optionally indented) `# `/`v `/`> `/`x `, or a `=> <symbol> `
 * consequence-action. `(word)` anywhere else on the line (or in prose) is
 * left as ordinary text. Returns the tag's char range within `line`, or
 * `null`. Shared by the editor (`glyphs.ts`) and the read-only line
 * renderer (`glyphLine.ts`). */
export function leadingTopicTag(line: string): { from: number; to: number } | null {
  // `(@name)` is a parenthesised delegate (#126), not a topic — exclude it.
  const m = line.match(/^(\s*[#vx>]\s+|.*?=>\s+[#vx>]\s+)(\((?!@)[^\s()]+\))/);
  if (!m) return null;
  const from = m[1].length;
  return { from, to: from + m[2].length };
}

/** 0-based indices of every line whose governing action symbol is an open
 * `#` — a plain (optionally indented, §50) `# ` line or a `=> #`
 * consequence-action (§41). Exactly the set `countActions().open` counts
 * and the Action Drawer's "Only Open" toggle shows. */
export function openActionLineIndices(text: string): number[] {
  const out: number[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (innermostActionSymbol(lines[i]) === "#") out.push(i);
  }
  return out;
}

/** The line to jump to for "next open action" (`dir` +1) or "previous"
 * (`dir` -1) relative to `fromLineIdx`, wrapping around at the ends.
 * `null` when the note has no open actions at all. When the cursor is
 * already on the only open action, returns that same line (nothing else
 * to move to). Shared by `EditorPane`'s `Ctrl+↓`/`Ctrl+↑` (§78). */
export function adjacentOpenActionLine(text: string, fromLineIdx: number, dir: 1 | -1): number | null {
  const idxs = openActionLineIndices(text);
  if (idxs.length === 0) return null;
  if (dir === 1) {
    return idxs.find((i) => i > fromLineIdx) ?? idxs[0];
  }
  const before = idxs.filter((i) => i < fromLineIdx);
  return before.length > 0 ? before[before.length - 1] : idxs[idxs.length - 1];
}

/** §85 (#12): what pressing `Enter` on an action line should do, given
 * the current line's full text. A leading (optionally indented, §50)
 * `# `/`v `/`> `/`x ` line continues the way a bullet does — except the
 * new line is always a fresh **open** action (`# `), since you're adding
 * a task and tasks start open. An *empty* action line (just the symbol)
 * exits instead, same as an empty bullet.
 *
 * #34: a line that *is* a `=> ` follow-up (leading `=> `) continues as
 * another `=> ` follow-up, so a chain of "led to → led to" notes keeps
 * its thread. If the current line carries a consequence-action symbol
 * (`=> # `/`=> v `/…) the new line is a fresh open `=> # ` (adding a
 * task, tasks start open); a plain `=> ` or `=> @name` follow-up
 * continues as a bare `=> ` with **no** action symbol. An empty `=> ` /
 * `=> # ` line exits.
 *
 * Returns `null` for anything else (plain text, a mid-line `=> `) — the
 * caller then falls through to CodeMirror's default newline.
 *
 * The insert is placed at the cursor, so pressing Enter mid-line splits
 * the line in two, the tail becoming its own continued action —
 * mirroring `bulletContinuation`'s split-anywhere behaviour. */
export function actionLineEnter(lineText: string): { removeSymbol: true } | { insert: string } | null {
  const action = lineText.match(/^(\s*)([#vx>])\s/);
  if (action) {
    const [, indent, symbol] = action;
    if (lineText.trim() === symbol) return { removeSymbol: true };
    return { insert: `\n${indent}# ` };
  }
  const follow = lineText.match(/^(\s*)=>\s/);
  if (follow) {
    const trimmed = lineText.trim();
    if (trimmed === "=>" || trimmed === "=> #") return { removeSymbol: true };
    const consequenceAction = /^\s*=>\s[#vx>]\s/.test(lineText);
    return { insert: `\n${follow[1]}=> ${consequenceAction ? "# " : ""}` };
  }
  return null;
}

/** `Ctrl+Space`'s cycle (§40: `# → v → > → x → #`), shared between the
 * editor (`EditorPane.svelte`) and the Action Drawer's own `Ctrl+Space`
 * (`toggleActionLine` in `controller.ts`) so the two can't drift apart.
 * Handles both a plain (optionally indented, §50) action line and a
 * `=> <symbol>` consequence-action (§41), cycling only the symbol itself
 * and preserving everything else (indentation, the `=> ` prefix, the rest
 * of the line). Returns `null` if the line has no action symbol to cycle
 * (including plain `=> text` and `=> @name text`, which have none).
 *
 * The consequence-action match isn't anchored to the start of the line —
 * `=> <symbol>` can (and often does) follow other text on the line, e.g.
 * "Talked to Sam => # follow up", and cycling needs to work there too, not
 * just when the arrow happens to open the line. */
const ACTION_CYCLE_ORDER = ["#", "v", ">", "x"];
export function cycleActionSymbol(line: string): string | null {
  const delegateMatch = line.match(/^(.*=>\s)([#vx>])(\s.*)$/);
  if (delegateMatch) {
    const [, prefix, sym, rest] = delegateMatch;
    return prefix + ACTION_CYCLE_ORDER[(ACTION_CYCLE_ORDER.indexOf(sym) + 1) % ACTION_CYCLE_ORDER.length] + rest;
  }
  const plainMatch = line.match(/^(\s*)([#vx>])(\s.*)$/);
  if (plainMatch) {
    const [, indent, sym, rest] = plainMatch;
    return indent + ACTION_CYCLE_ORDER[(ACTION_CYCLE_ORDER.indexOf(sym) + 1) % ACTION_CYCLE_ORDER.length] + rest;
  }
  return null;
}

/** Strips a line's leading token(s) for display in the Action Drawer/
 * Section History (§45), which already show the equivalent glyph
 * separately — showing the raw character too was a duplicate, confusing
 * presentation (`☐ # Buy milk`). Leaves a delegated `@name` in place
 * (real, meaningful content — who it's assigned to — not a duplicate of
 * any glyph) and strips only the token characters proper.
 *
 * The three `=> `-based patterns aren't anchored to the start of the
 * line — `=> ` can (and often does) follow other text, e.g. "Talked to
 * Sam => # follow up" (§41/§59) — so whatever precedes it is kept, with
 * only the arrow and its symbol removed. Without this, a line like that
 * fell through every branch below unmodified, showing its raw `=> #`
 * token text right next to the row's glyph instead of being stripped.
 *
 * A plain leading action symbol is always at the true start of the line,
 * so it's stripped first and independently of the `=> ` handling — a
 * line with *both* ("# Call Sam => get quote", #28) used to keep its
 * leading `#` because a `=> ` branch matched and returned before the
 * plain-symbol branch was ever reached. */
export function stripLeadingToken(line: string): string {
  const withoutLeading = line.replace(/^(\s*)[#vx>]\s/, "$1");
  const consequence = withoutLeading.match(/^(.*)=>\s[#vx>]\s(.*)$/);
  if (consequence) return consequence[1] + consequence[2];
  const delegated = withoutLeading.match(/^(.*)=>\s(@[\w-]+\s.*)$/);
  if (delegated) return delegated[1] + delegated[2];
  const followUp = withoutLeading.match(/^(.*)=>\s(.*)$/);
  if (followUp) return followUp[1] + followUp[2];
  return withoutLeading;
}

/** Whitespace-delimited word count for the status bar (§100). Single
 * pass, no allocation — it runs on every keystroke over the whole note.
 * Glyph tokens (`# `, `=> `, …) count as words; not worth special-casing. */
export function countWords(text: string): number {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const ws = text.charCodeAt(i) <= 32;
    if (!ws && !inWord) n++;
    inWord = !ws;
  }
  return n;
}

export function isSetextUnderline(line: string): boolean {
  return /^={3,}$/.test(line.trim());
}

export function getSectionHeaderForLine(lines: string[], lineIdx: number): string {
  if (lineIdx < 0 || lineIdx >= lines.length) return "";
  if (lineIdx + 1 < lines.length && isSetextUnderline(lines[lineIdx + 1])) {
    return lines[lineIdx].trim();
  }
  if (isSetextUnderline(lines[lineIdx]) && lineIdx > 0) {
    return lines[lineIdx - 1].trim();
  }
  for (let i = lineIdx; i >= 1; i--) {
    if (isSetextUnderline(lines[i])) {
      return lines[i - 1].trim();
    }
  }
  return "";
}

export function normalizeHeaderTitle(rawHeader: string): string {
  return rawHeader
    .replace(/^\[\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\]\s*/, "")
    .replace(/^\[CANCELED\]\s*/, "")
    .trim();
}

/** Section History (§34/§37) should treat "Weekly Sync - 2026-08-08" and
 * "Weekly Sync - 2026-08-09" as the same recurring section — a date is a
 * very natural thing to include in a section title, and without this the
 * feature never finds a second match. Deliberately layered on top of
 * normalizeHeaderTitle()'s output rather than folded into it: that
 * function's result is also used to build the Action Drawer's section-tag
 * *display*, where the date is useful context, not noise — only the
 * History *matching* comparison should ignore it. Only the spec's own
 * YYYY-MM-DD format is stripped; other date spellings a user might type
 * aren't recognized, which is an accepted limitation, not a bug. */
export function titleForMatching(normalizedTitle: string): string {
  return normalizedTitle
    .replace(/^\d{4}-\d{2}-\d{2}\s*[-:]?\s*/, "")
    .replace(/\s*[-:]?\s*\d{4}-\d{2}-\d{2}$/, "")
    .trim();
}
