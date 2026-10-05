/** Copy/paste deferral (§64, §82) and the §86 (#9) paste-forward undo
 * link. Copying a `# ` open-action line and pasting it into today's (or a
 * later) note marks the original `> ` (deferred) back in its source tab;
 * undoing that paste flips it back. Split out of `controller.ts` in the
 * v0.5.0 refactor — depends only on `./stores`, `./persistence`, `./date`
 * and types. `tabs.ts` calls `notifyTabClosed` from `closeTab`. */
import { get } from "svelte/store";
import { showToast, tabs } from "./stores";
import { writeTabContent } from "./persistence";
import { todayISO } from "./date";
import { t } from "./i18n";

let lastCopiedAction: { text: string; sourceTabId: string } | null = null;

/** Indentation-tolerant (§50, same as everywhere else an open-action
 * symbol is recognized) and multi-line: a copied block only needs *some*
 * line to be an open action, not the whole selection to start with one —
 * copying a few lines together (a mix of open actions and plain text, or
 * several open actions at once) is exactly the case this needs to keep
 * working for.
 *
 * #67: also matches a `=> #` open *consequence*-action (§41) — not just a
 * leading `# ` — since `innermostActionSymbol()` (`tokens.ts`) already
 * treats those as equally "open," and the rest of the app (the Action
 * Drawer's "Only Open" toggle, `openActionLineIndices`) agrees. The first
 * alternative anchors to line-start (optionally indented) the same as
 * before; the second requires the literal `=> ` prefix immediately before
 * the `#`, so a bare `#` elsewhere on the line never matches either way.
 * Capture group 1 is the prefix to preserve as-is (indentation, or the
 * `=> `); group 2 is the trailing space, also preserved. */
const OPEN_ITEM_LINE = /(^\s*|=>\s)([#o])(\s)/;

/** Flips every open action within `text` (a leading `# `, or a `=> #`
 * consequence-action) to deferred `> ` / `=> > `, and open topics `o ` to skipped `, `,
 * leaving everything else byte-for-byte unchanged. */
export function deferOpenActionsInText(text: string): string {
  return text.replace(new RegExp(OPEN_ITEM_LINE, "gm"), (_m, p1, sym, p2) => {
    const replacement = sym === "#" ? ">" : ",";
    return `${p1}${replacement}${p2}`;
  });
}

/** How many open actions or topics `deferOpenActionsInText` would flip in `text`. */
export function countOpenActionsInText(text: string): number {
  return (text.match(new RegExp(OPEN_ITEM_LINE, "gm")) ?? []).length;
}

/** Called on every `copy` inside the editor. `lastCopiedAction` is only
 * ever meaningful for the *very next* paste, so any fresh copy must
 * replace it. */
export function recordCopiedAction(text: string, sourceTabId: string) {
  lastCopiedAction = new RegExp(OPEN_ITEM_LINE, "m").test(text) ? { text, sourceTabId } : null;
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
  reverted: boolean;
}
let pasteDeferLink: PasteDeferLink | null = null;

/** Test-only view of the link state. */
export function _pasteDeferLinkForTest(): Readonly<PasteDeferLink> | null {
  return pasteDeferLink;
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
  if (!before.includes(link.openBlock) || after.includes(link.openBlock)) return;

  const list = get(tabs);
  const src = list.find((t) => t.id === link.sourceTabId);
  if (src && src.content.includes(link.deferredBlock)) {
    tabs.set(writeTabContent(src.id, src.content.replace(link.deferredBlock, link.openBlock), list));
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
  if (before.includes(link.openBlock) || !after.includes(link.openBlock)) return;

  const list = get(tabs);
  const src = list.find((t) => t.id === link.sourceTabId);
  if (src && src.content.includes(link.openBlock)) {
    tabs.set(writeTabContent(src.id, src.content.replace(link.openBlock, link.deferredBlock), list));
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
export function handlePasteIntoTab(targetTabId: string, pastedText?: string) {
  if (!lastCopiedAction) return;
  const copied = lastCopiedAction;
  lastCopiedAction = null;
  if (pastedText !== undefined && normalizeClipboardText(pastedText) !== normalizeClipboardText(copied.text)) return;

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
    return;
  }

  const list = get(tabs);
  const srcTab = list.find((t) => t.id === copied.sourceTabId);
  if (srcTab && srcTab.content.includes(copied.text)) {
    // Defer every open action *within* the copied block, not just one at
    // its start — pasting a multi-line copy that happens to carry several
    // "# " lines (or one indented past the block's first line) should
    // forward all of them, the same as pasting just one always has.
    const deferredBlock = deferOpenActionsInText(copied.text);
    const newSrcContent = srcTab.content.replace(copied.text, deferredBlock);
    tabs.set(writeTabContent(srcTab.id, newSrcContent, list));
    // §86 (#9): remember this defer so an undo of the paste in the target
    // tab can flip it back.
    pasteDeferLink = {
      targetTabId,
      sourceTabId: srcTab.id,
      openBlock: copied.text,
      deferredBlock,
      reverted: false,
    };
    const count = countOpenActionsInText(copied.text);
    showToast(get(t)("toast.paste.originalMarkedDeferred", { count, filename: srcTab.filename }));
  }
}
