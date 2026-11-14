/** Copy/paste deferral (§64, §82) and the §86 (#9) paste-forward undo
 * link. Copying a `# ` open-action line and pasting it into today's (or a
 * later) note marks the original `> ` (deferred) back in its source tab;
 * undoing that paste flips it back. Split out of `controller.ts` in the
 * v0.5.0 refactor — depends only on `./stores`, `./persistence`, `./date`
 * and types. `tabs.ts` calls `notifyTabClosed` from `closeTab`. */
import { get } from "svelte/store";
import { currentDateISO, editorApi, showToast, tabs } from "./stores";
import { writeTabContent } from "./persistence";
import { dueWordExtra, todayISO } from "./date";
import { hasOpenAction, tokenizeNoteLine, trailingForwardLinksStart } from "./grammar/tokenize";
import { getSectionHeaderForLine, rewriteDueWords, stateFirst } from "./tokens";
import { locale, t } from "./i18n";

let lastCopiedAction: { text: string; sourceTabId: string; sourceOffset?: number } | null = null;

let pendingPasteFrom: string[] | null = null; // one `(<…)` per copied line
export function setPendingPasteFrom(val: string[] | null) {
  pendingPasteFrom = val;
}
export function takePendingPasteFrom(): string[] | null {
  const val = pendingPasteFrom;
  pendingPasteFrom = null;
  return val;
}

/** The forward links a paste adds (§371): `(>2026-10-14#Weekly Sync)` on the source line (where it went) and
 * `(<2026-10-13#Standup)` on the pasted line (where it came from). Ordinary note text, always at the end of the line. */
export function forwardLink(dir: ">" | "<", date: string, section: string): string {
  return ` (${dir}${date}${section ? `#${section}` : ""})`;
}
export function withToLink(line: string, link: string): string {
  if (!link || !link.trim()) return line;
  const suffix = link.startsWith(" ") ? link : ` ${link}`;
  const cut = trailingForwardLinksStart(line, "lastTo");
  const base = cut !== null ? line.slice(0, cut) : line;
  return base.trimEnd() + suffix;
}

export function withFromLink(line: string, link: string): string {
  if (!link || !link.trim()) return line;
  const suffix = link.startsWith(" ") ? link : ` ${link}`;
  const cut = trailingForwardLinksStart(line, "all");
  const base = cut !== null ? line.slice(0, cut) : line;
  return base.trimEnd() + suffix;
}

function isOpenDeferrableToken(kind: string, symbol?: string): boolean {
  return ((kind === "action" || kind === "consequence") && symbol === "#") ||
    ((kind === "topic" || kind === "consequenceTopic") && symbol === "o");
}

/** Flips every open action within `text` (a leading `# `, or a `=> #`
 * consequence-action) to deferred `> ` / `=> > `, and open topics `o ` to skipped `, `,
 * leaving everything else byte-for-byte unchanged. When `toSuffix` is passed, appends
 * the `(>…)` link only to lines where an action was deferred, replacing an existing trailing `(>…)`;
 * a `(<…)` stays, so a line forwarded again reads `> task (<where it came from) (>where it went)`. */
export function deferOpenActionsInText(text: string, toSuffix?: string): string {
  const lines = text.split("\n");
  return lines
    .map((line, i) => {
      const tokens = tokenizeNoteLine(lines, i).filter((tok) => isOpenDeferrableToken(tok.kind, tok.symbol));
      if (tokens.length === 0) return line;
      let isAction = false;
      let deferred = line;
      for (const tok of tokens) {
        if (tok.symbol === "#") isAction = true;
        const replacement = tok.symbol === "#" ? ">" : ",";
        deferred = deferred.slice(0, tok.from) + replacement + deferred.slice(tok.from + 1);
      }
      if (toSuffix && isAction) {
        deferred = withToLink(deferred, toSuffix);
      }
      return deferred;
    })
    .join("\n");
}

/** How many open actions or topics `deferOpenActionsInText` would flip in `text`. */
export function countOpenActionsInText(text: string): number {
  const lines = text.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    for (const tok of tokenizeNoteLine(lines, i)) {
      if (isOpenDeferrableToken(tok.kind, tok.symbol)) count++;
    }
  }
  return count;
}

/** Called on every `copy` inside the editor. `lastCopiedAction` is only
 * ever meaningful for the *very next* paste, so any fresh copy must
 * replace it. `sourceOffset` records the exact character offset in the source document
 * to disambiguate identical action lines. */
export function recordCopiedAction(text: string, sourceTabId: string, sourceOffset?: number) {
  lastCopiedAction = countOpenActionsInText(text) > 0 ? { text, sourceTabId, sourceOffset } : null;
}

/** §86 (#9): links the most recent paste-forward to the `# ` → `> ` defer
 * it caused in the *source* tab, so that undoing the paste in the target
 * tab also flips the source's actions back to open. One at a time, like
 * `lastCopiedAction` — the next paste-forward replaces it. `reverted`
 * tracks whether the source is currently back to `# ` (an undo happened),
 * so a redo of the same paste can re-apply the defer. Cleared when either
 * tab closes, or when the source's `> ` block can no longer be found
 * (closed, or hand-edited) — in which case there's nothing safe to flip. */
interface PasteDeferLink {
  targetTabId: string;
  sourceTabId: string;
  openBlock: string;
  deferredBlock: string;
  pastedBlock?: string;
  sourceOffset?: number;
  reverted: boolean;
}
let pasteDeferLink: PasteDeferLink | null = null;

/** Test-only view of the link state. */
export function _pasteDeferLinkForTest(): Readonly<PasteDeferLink> | null {
  return pasteDeferLink;
}

/** Keeps the stored target-tab text aligned with what `pasteOverEmptyMarker` actually inserted (after `by:` rewriting or empty-marker merging). */
export function updatePasteDeferPastedBlock(text: string): void {
  if (pasteDeferLink && !pasteDeferLink.reverted) {
    pasteDeferLink.pastedBlock = text;
  }
}

/** Called by `tabs.ts`'s `closeTab`: a paste-defer undo link that points
 * at the tab being closed (either end) can no longer be honoured. */
export function notifyTabClosed(tabId: string) {
  if (pasteDeferLink && (pasteDeferLink.targetTabId === tabId || pasteDeferLink.sourceTabId === tabId)) {
    pasteDeferLink = null;
  }
}

function deferRestoredToast(sourceFilename: string, blockText: string) {
  const n = countOpenActionsInText(blockText);
  showToast(get(t)("toast.paste.deferRestored", { count: n, filename: sourceFilename }));
}

/** Called by `EditorPane` after an `undo` transaction that changed the
 * document in the active (target) tab. If that undo is the one that
 * removed the pasted block, flip the linked source tab's `> ` back to
 * `# ` to match. */
export function onEditorUndo(activeTabId: string, before: string, after: string) {
  const link = pasteDeferLink;
  if (!link || link.reverted || link.targetTabId !== activeTabId) return;
  // Only the undo step that actually removes the pasted block should fire —
  // earlier undos (of edits made after the paste) leave it in place.
  const checkBlock = link.pastedBlock ?? link.openBlock;
  const removed =
    (before.includes(checkBlock) && !after.includes(checkBlock)) ||
    (before.includes(link.openBlock) && !after.includes(link.openBlock));
  if (!removed) return;

  const list = get(tabs);
  const src = list.find((t) => t.id === link.sourceTabId);
  if (src && src.content.includes(link.deferredBlock)) {
    let restoredContent: string;
    if (
      link.sourceOffset !== undefined &&
      src.content.slice(link.sourceOffset, link.sourceOffset + link.deferredBlock.length) === link.deferredBlock
    ) {
      restoredContent =
        src.content.slice(0, link.sourceOffset) +
        link.openBlock +
        src.content.slice(link.sourceOffset + link.deferredBlock.length);
    } else {
      restoredContent = src.content.replace(link.deferredBlock, link.openBlock);
    }
    tabs.set(writeTabContent(src.id, restoredContent, list));
    deferRestoredToast(src.filename, link.openBlock);
    link.reverted = true;
  } else {
    pasteDeferLink = null;
  }
}

/** Mirror of `onEditorUndo` for a `redo` that re-inserts the pasted block:
 * re-applies the defer on the source tab. */
export function onEditorRedo(activeTabId: string, before: string, after: string) {
  const link = pasteDeferLink;
  if (!link || !link.reverted || link.targetTabId !== activeTabId) return;
  const checkBlock = link.pastedBlock ?? link.openBlock;
  const restored =
    (!before.includes(checkBlock) && after.includes(checkBlock)) ||
    (!before.includes(link.openBlock) && after.includes(link.openBlock));
  if (!restored) return;

  const list = get(tabs);
  const src = list.find((t) => t.id === link.sourceTabId);
  if (src && src.content.includes(link.openBlock)) {
    let redoneContent: string;
    if (
      link.sourceOffset !== undefined &&
      src.content.slice(link.sourceOffset, link.sourceOffset + link.openBlock.length) === link.openBlock
    ) {
      redoneContent =
        src.content.slice(0, link.sourceOffset) +
        link.deferredBlock +
        src.content.slice(link.sourceOffset + link.openBlock.length);
    } else {
      redoneContent = src.content.replace(link.openBlock, link.deferredBlock);
    }
    tabs.set(writeTabContent(src.id, redoneContent, list));
    const n = countOpenActionsInText(link.openBlock);
    showToast(get(t)("toast.paste.deferredAgain", { count: n, filename: src.filename }));
    link.reverted = false;
  } else {
    pasteDeferLink = null;
  }
}

/** Line endings and trailing whitespace differ between apps; the text itself must not. */
const normalizeClipboardText = (text: string) => text.split(String.fromCharCode(13)).join("").trimEnd();

/** `pastedText`: what is being pasted (the clipboard's text), when known. The remembered copy only counts when that IS
 * the text copied in ChronoNote: copy in ChronoNote, paste in another app, copy something else there and paste it
 * here must not defer the original. Without it (no clipboard data on the event) the old rule applies. */
export function handlePasteIntoTab(
  targetTabId: string,
  pastedText?: string,
  opts?: { targetLineIdx?: number; targetDocText?: string },
): string[] | null {
  if (!lastCopiedAction) {
    setPendingPasteFrom(null);
    return null;
  }
  const copied = lastCopiedAction;
  lastCopiedAction = null;
  if (pastedText !== undefined && normalizeClipboardText(pastedText) !== normalizeClipboardText(copied.text)) {
    setPendingPasteFrom(null);
    return null;
  }

  const todayFilename = todayISO() + ".txt";
  const targetTab = get(tabs).find((t) => t.id === targetTabId);
  // §49: today or any later date counts as "forwarding," not just today
  // exactly. Scratchpads are excluded outright — their filename (e.g.
  // "Scratchpad 1") isn't a date at all, and would sort after any real
  // date string, which would otherwise make this comparison wrongly treat
  // pasting into a scratchpad as "later than today."
  if (
    !targetTab ||
    targetTab.isScratchpad ||
    targetTab.filename < todayFilename ||
    copied.sourceTabId === targetTabId
  ) {
    setPendingPasteFrom(null);
    return null;
  }

  const list = get(tabs);
  const srcTab = list.find((t) => t.id === copied.sourceTabId);
  if (srcTab && srcTab.content.includes(copied.text)) {
    const targetDate = targetTab.filename.replace(/\.txt$/, "");
    const targetLines = (opts?.targetDocText ?? targetTab.content).split("\n");
    const targetLineIdx = opts?.targetLineIdx ?? (editorApi ? editorApi.getCursorLineIdx() : 0);
    const targetSection = getSectionHeaderForLine(targetLines, targetLineIdx).trim();
    const toSuffix = forwardLink(">", targetDate, targetSection);

    const srcDate = srcTab.filename.replace(/\.txt$/, "");
    const srcLines = srcTab.content.split("\n");
    let effectiveOffset = copied.sourceOffset;
    if (
      effectiveOffset === undefined ||
      srcTab.content.slice(effectiveOffset, effectiveOffset + copied.text.length) !== copied.text
    ) {
      const idx = srcTab.content.indexOf(copied.text);
      effectiveOffset = idx >= 0 ? idx : undefined;
    }
    const srcStartLineIdx =
      effectiveOffset !== undefined
        ? srcTab.content.slice(0, effectiveOffset).split("\n").length - 1
        : 0;
    // One `(<…)` per copied line, each with the section that line was in: a multi-line copy can span sections.
    // Open agenda topics get no links; only open actions get from-links.
    const copiedLines = copied.text.split("\n");
    const fromSuffixes = copiedLines.map((l, i) =>
      hasOpenAction(l, copiedLines[i + 1])
        ? forwardLink("<", srcDate, getSectionHeaderForLine(srcLines, srcStartLineIdx + i).trim())
        : "",
    );

    // Defer every open action *within* the copied block, not just one at
    // its start — pasting a multi-line copy that happens to carry several
    // "# " lines (or one indented past the block's first line) should
    // forward all of them, the same as pasting just one always has.
    // The `(to …)` link goes at the end of the line, so only when the copy reaches the end of its line; a copy of part
    // of a line is deferred without one (appending would put the link in the middle of the line).
    const copyEnd = effectiveOffset !== undefined ? effectiveOffset + copied.text.length : -1;
    const endsAtLineEnd =
      copied.text.endsWith("\n") || copyEnd === srcTab.content.length || srcTab.content[copyEnd] === "\n" ||
      srcTab.content[copyEnd] === "\r";
    const deferredBlock = deferOpenActionsInText(copied.text, endsAtLineEnd ? toSuffix : undefined);
    let newSrcContent: string;
    if (
      effectiveOffset !== undefined &&
      srcTab.content.slice(effectiveOffset, effectiveOffset + copied.text.length) === copied.text
    ) {
      newSrcContent =
        srcTab.content.slice(0, effectiveOffset) +
        deferredBlock +
        srcTab.content.slice(effectiveOffset + copied.text.length);
    } else {
      newSrcContent = srcTab.content.replace(copied.text, deferredBlock);
      const idx = srcTab.content.indexOf(copied.text);
      effectiveOffset = idx >= 0 ? idx : undefined;
    }
    tabs.set(writeTabContent(srcTab.id, newSrcContent, list));

    const today = get(currentDateISO);
    const loc = get(locale);
    const translate = get(t);
    const extra = dueWordExtra(
      translate("dueDate.words.today", undefined) ?? "",
      translate("dueDate.words.tomorrow", undefined) ?? "",
    );
    const rewrittenLines = copiedLines.map((line) => {
      let l = stateFirst(line) ?? line;
      return rewriteDueWords(l, today, loc, extra) ?? l;
    });
    const pastedBlock = rewrittenLines
      .map((l, i) => {
        if (!hasOpenAction(l, rewrittenLines[i + 1]) || !fromSuffixes[i]) return l;
        return withFromLink(l, fromSuffixes[i]);
      })
      .join("\n");

    // §86 (#9): remember this defer so an undo of the paste in the target
    // tab can flip it back.
    pasteDeferLink = {
      targetTabId,
      sourceTabId: srcTab.id,
      openBlock: copied.text,
      deferredBlock,
      pastedBlock,
      sourceOffset: effectiveOffset,
      reverted: false,
    };
    const count = countOpenActionsInText(copied.text);
    showToast(get(t)("toast.paste.originalMarkedDeferred", { count, filename: srcTab.filename }));
    setPendingPasteFrom(fromSuffixes);
    return fromSuffixes;
  }
  setPendingPasteFrom(null);
  return null;
}
