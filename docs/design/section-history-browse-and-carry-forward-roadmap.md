# Section History: browse occurrences in context, carry lines forward — design

Status: **design only, not yet implemented.** Written 2026-09-24 at Marien's
request, after using the current (§150-era) Section History drawer for a
while: "What I realize when using it, is that I don't use the action list
itself, I use it to move between occurrences, and check the actual notes,
including actions, so I can see actions and follow-ups in context."

## 1. What's changing, in one sentence

Section History stops being an aggregated, de-contextualized *list of
action lines* and becomes a way to *browse full occurrences of a recurring
section, rendered exactly like the editor renders them*, with a way to pick
one or more lines from whatever you're reading and carry them forward to
today, to the next occurrence, or to wherever you opened the drawer from.

## 2. Why the current design doesn't fit this use

The drawer today (`HistoryModal.svelte`, `history.ts`) has two parts:

- **The flat list** (`historyItems`) — one row per action/follow-up, deduped
  across every occurrence, most-recent-first, filterable by "Only Open".
  Built by `historyActionsForLine`, which deliberately throws away
  everything *except* the action/follow-up text (`# do X => # do Y` becomes
  two rows, each showing only its own fragment). This is exactly backwards
  from what Marien described wanting: the surrounding note — what was
  actually discussed, the prose lead-in, a bullet's siblings — is the part
  this view discards.
- **The "Previous occurrence" pane** (`historyPreviousOccurrence`) — the
  one part that *does* show a full glyph-rendered occurrence body, but only
  ever the single most-recent-before-today one, and only as a read preview
  with an "Open file" jump — no way to act on a specific line from it, and
  no way to browse to any *other* occurrence and see the same treatment.

So the data model already half-supports what's wanted (`historyOccurrences`,
§150, holds every occurrence's raw lines and start offset — past, empty, and
future), but the UI treats only one of them specially and reduces all the
others to fragments. The redesign below promotes every occurrence to the
"Previous occurrence" pane's treatment, and turns the flat list into the
occurrence *picker* instead of the content itself.

## 3. Proposed layout

Keep the two-pane shape the drawer already has (`.history-main` list +
detail pane, reflowing to a tab switcher on phones per the v0.12 roadmap) —
it's a pattern every other drawer in the app already uses, and Marien's own
description ("easily browse through the occurrences" + "check the actual
notes") maps directly onto a list-selects-detail split rather than a linear
carousel:

- **Left: an occurrence list**, one row per dated note that has this
  section — exactly `historyOccurrences` already, past/empty/future all
  included (§150's existing behavior). Each row shows the date and a short
  status (e.g. a dimmed "no actions" for an empty occurrence, matching
  today's placeholder). Clicking a row — or arrowing through it — loads
  that occurrence into the right pane. This replaces the flat action list
  entirely; occurrence order (most-recent past first, or however
  `historyOccurrences` already sorts) needs no new logic.
- **Right: the full section body, glyph-rendered.** Not the ±5-line capped
  preview `HistoryModal.svelte` uses today for "Previous occurrence" — the
  *whole* body, using the same `parseGlyphLine` rendering the editor and
  every other read-only view already share (`token-glyph-rendering`
  memory: keep `glyphs.ts`/`glyphLine.ts` in sync going forward, same as
  always). Read-only: no live CodeMirror instance, no in-place editing of a
  past note from inside this modal — that's a materially bigger, riskier
  feature (concurrent-edit/save semantics for a file that isn't the active
  tab) that nothing in Marien's request actually asks for. "Enter" (or a
  visible "Open file" action) still jumps to the real note for full
  editing, same as today.

## 4. Selecting lines, and what "take it over" means

- **Click a line** to select it; **Shift+click** (or drag) extends to a
  contiguous range — ordinary text-selection semantics, translated to a
  line list, so "even multiple lines" (Marien's own phrase) falls out for
  free rather than needing a separate multi-select mode.
- Selecting anything shows a small action bar (pinned at the bottom of the
  right pane) with the destination button(s) — see §5 — and, **only when
  exactly one line is selected and it has a `prose => action` shape**
  (`Talked to Sam => # follow up`), a second choice between:
  - **Whole line** — copies `Talked to Sam => # follow up` verbatim.
  - **Action only** — copies just `# follow up`, dropping the prose lead-in.

  This mirrors what `forwardActionToToday` (`actions.ts`) already does
  unconditionally for its own single-line case (it always strips to just
  the action) — here it becomes an explicit choice instead of a fixed rule,
  since a multi-line take-over has no equivalent per-line stripping (keep
  that path simple: multi-line always copies the lines as-is).

## 5. Where a take-over lands

Per Marien's own rule, phrased as two cases based on **where the drawer was
opened from** (not which occurrence is currently being browsed):

- **Opened from today or a future note:** one destination — insert into the
  section you opened the drawer from. No choice needed; you're pulling
  history forward to where you already are.
- **Opened from a past note:** two destination buttons — **"→ Today"** and
  **"→ Next occurrence (Tue, Oct 6)"** (the date is resolved once, when the
  drawer opens, via the exact same search `copySelectionToNextOccurrence`
  already uses — calendar-first-if-in-use, else the next on-disk occurrence,
  else "no next occurrence yet" and that button simply doesn't appear).

This is a fixed property of the drawer session, computed once at open time
from the opened-from tab's own date — not re-decided per occurrence
browsed, which keeps the mental model simple: "browsing" is for finding
content, "opened from" decides where it can go.

**Implementation should reuse, not reimplement, the existing copy-forward
machinery** (`copyForward.ts`): `commitCopyForward(sourceTabId, fromLine,
toLine, targetHeader, newSectionHeaderText, targetDateIso)` already does
exactly the right thing — writes the selected lines into the target
section (creating it if it doesn't exist yet), defers whatever was open in
the *source* lines, and shows a toast. The only new work is computing
`sourceTabId`/`fromLine`/`toLine` from a selection made in the History
drawer instead of the live editor, and `targetDateIso` from one of the
fixed destination buttons above instead of a search. `insertIntoSection`
needs no change at all.

One real difference from today's `commitCopyForward` call sites: the
*source* of a History take-over is a **note that likely isn't an open
tab** (you're reading history, not necessarily the note itself). Deferring
its open actions means writing to that file directly
(`writeNoteAndInvalidateCache`) rather than through `writeTabContent` when
there's no live tab for it — the same fallback `toggleActionLineItem`
already uses in `actions.ts` (open the file first if needed, then act on
it) is the precedent to follow, or write to disk without opening a tab at
all if opening one isn't otherwise wanted. Flagging as an implementation
detail to settle, not a design fork — either is consistent with existing
patterns.

## 6. What this removes or changes from today's behavior

Being explicit about the trade-offs, since this is a real behavior change
Marien should sign off on before implementation, not just an addition:

- **The flat, deduped, cross-occurrence action list is gone.** Today's
  "see every open action under this heading, across all time, in one
  scannable list" use case goes away in favor of "browse occurrence by
  occurrence." If that flat view is still sometimes wanted (e.g., "how many
  times has this recurring blocker come up"), it doesn't have a home in
  this redesign — worth confirming that's an acceptable loss, or whether a
  trimmed version of it survives as a secondary view.
- **The "Only Open" toggle loses its purpose** — there's no longer a flat
  list to filter down. A resolved (`v`/`x`) line reads the same dimmed way
  it already does in the main editor (existing "resolved-line dimming"
  CSS) rather than being hidden outright. If Marien wants a way to jump
  straight to "the nearest occurrence that still has an open action,"
  that's a distinct, smaller feature (a "find" step through the occurrence
  list) rather than a per-line filter, and isn't assumed here.
- **The dedicated "Previous occurrence" special-casing goes away** — every
  occurrence gets the same treatment, and "previous" is just wherever the
  occurrence list's selection starts by default (recommend: keep today's
  existing default of "the nearest occurrence before the opened-from
  date," so the drawer still opens on the most immediately useful entry
  rather than an arbitrary end of the list).
- **`Ctrl/Cmd+Shift+.` ("copy to next occurrence" from the live editor,
  #66) is unaffected and should stay** — it's a faster one-key path for
  the single most common case (defer this one line, right now, without
  opening History at all). This redesign is a complementary, more
  deliberate/exploratory path for when you're already looking through
  history and want to pull something forward from what you find — not a
  replacement for the quick path.

## 7. Recommendation

Build this as described above: occurrence list (left) drives a full
glyph-rendered read pane (right); line/range selection surfaces a
destination action bar computed once from where the drawer was opened;
take-over reuses `commitCopyForward` unchanged. Explicitly drop the flat
action list and "Only Open" toggle rather than trying to keep both
alongside the new browse view — maintaining two mental models in one
drawer (browse-in-context vs. scan-a-flat-list) is more confusing than
either alone, and Marien's own description of actual usage ("I don't use
the action list itself") is a strong signal the flat list isn't pulling
its weight. If a "how many times has this come up" style overview turns
out to be missed after living with the new drawer, that's a smaller,
separable follow-up rather than a reason to keep the old list around
unused in the meantime.

**Decisions to confirm before implementation:**

1. OK to fully remove the flat action list and "Only Open" toggle (§6),
   rather than keeping either as a secondary mode?
2. For a History-sourced take-over whose source note has no open tab,
   should the source note be silently opened first (a new background tab),
   or updated on disk without ever becoming a tab? (§5)
3. Should a resolved-but-visible line (dimmed) still be selectable/
   take-over-able, or only open/unresolved ones? (Recommend: selectable —
   "take over an already-done item as a fresh open one today" is a
   legitimate re-adoption case, exactly what today's `historyInsertText`
   already does for a deferred `>` line by turning it back into `#`.)
