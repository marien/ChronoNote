# Due dates on actions (feature review B2)

Status: approved 2026-10-23 (Marien took all six recommended decisions, see the end). Not built yet; the build plan
is in "Build plan".

## The problem

An action's only date is the note it was written in. "Before Friday" lives in the prose, and nothing notices
when Friday passes. With more dated actions, the open-actions list (newest note first) no longer answers the
question that matters: *what is due soon, and what is late?*

## Principles

- **The date is text in the line.** No hidden state, no side file, no database. The file stays readable in
  Notepad and on the phone, and the due date travels with the line wherever it is copied or forwarded.
- **The file always holds a full date.** Short words (`fri`, `tomorrow`) are an input convenience only; they are
  rewritten to `YYYY-MM-DD` before they can reach disk in that form. A note read next month must not mean something
  different from what it meant when written.
- **Show it where Marien already looks** (the line, the status bar, the Action Drawer). No notifications, no
  reminders, no pop-ups (still on the feature review's "left out" list).
- **No storage change.** It is pure parsing of note text in the frontend, so the desktop app, the web app and the
  demo get it at once; `storage.rs`, the mock backend and the conformance cases do not move.

## Syntax

```
# send the report by:2026-10-30
# (budget) ask finance for the Q4 numbers by:2026-11-03
. budget => # send numbers to Sam by:2026-10-28
=> @dana send the slides by:2026-10-29
```

- `by:` followed directly by a full date. It reads as English in plain text, and looks like the search operators
  (`since:`, `before:`) Marien already knows.
- It belongs to the **action part** it stands in: a leading `# v > x`, a `=> <symbol>` consequence action, or a
  delegated `=> @name` (see "Delegated lines"). The grammar already splits a line into parts at each `=>` (§365
  dimming), so this reuses that split.
- Anywhere in the part, but written and suggested at the end. One per part: a second `by:` in the same part is plain
  text.
- On a topic (`o . ,`), bullet, emphasis or prose line it is plain text: no pill, not counted. Topics are
  discussion items, not work with a deadline.
- The date after `by:` is also an ordinary date link (D4), so Ctrl+Click opens that day.

## Typing it

Marien types `by:` and a word or a date. When the caret leaves the line (the same moment the state-first rewrite
of §367 runs, `stateFirst.ts`), and on paste, the word is replaced by the full date:

| Typed | Becomes (typed on Thu 2026-10-22) |
| :--- | :--- |
| `by:today`, `by:t` | 2026-10-22 |
| `by:tomorrow`, `by:tm` | 2026-10-23 |
| `by:mon` ... `by:sun` (and full names) | the next such day **after** today: `by:fri` = 2026-10-23, `by:thu` = 2026-10-29 |
| `by:+3` | three days from today |
| `by:wk44` | the **Friday** of ISO week 44 (a due date means "by the end of that week") |
| `by:10-30` | 2026-10-30; a month-day already past means next year (`01-05` typed in December) |
| `by:2026-10-30` | unchanged |

- Words are understood in English **and** the UI language (`vr`, `morgen`, `do` for Dutch); this is safe because
  the file only ever stores the full date. Built on `parseDateQuery` (`src/lib/date.ts`, the date picker's
  grammar), which gains weekday names, `+N` and the next-year rule; the date picker keeps its own meaning of `wk44`
  (the Monday). Note: the feature review said "the date words search already knows", but Search only knows ISO dates
  today; the words come from the date picker.
- Relative to **today**, not to the note's date. The pill shows the result straight away, so a wrong guess is
  visible and cheap to fix.
- A word it does not understand stays as typed and is not a pill (a dotted underline, tooltip "Not a date").
  Nothing is guessed.
- Text written outside the app (`by:fri` typed in Notepad) is only rewritten when the caret visits that line; until
  then it is plain text. The app never rewrites lines Marien did not touch.

**Without typing:** a "Set due date…" command (`Ctrl+Shift+D`, free; palette; line menu; the phone's accessory bar)
opens the date picker on the action under the caret and writes or replaces its `by:`, with a "No due date" button
to remove it. Clicking a pill does the same.

## How it looks

Off the caret line the token is drawn as a small pill at the end of the action, with the date written short in
the UI language: `vr 30 okt` / `Fri 30 Oct` (the year only when it is not this year). On the caret line, or while
hovering, the raw `by:2026-10-30` text shows so it can be edited, the same way a topic tag shows its parentheses.

| State of the action part | Pill |
| :--- | :--- |
| open, due later | muted |
| open, due today | amber, reads `today` / `vandaag` |
| open, past due | red, reads the date and, in the tooltip, "3 days late" |
| done, won't-do, deferred | dimmed with the line, never coloured (the deadline no longer matters there) |

Grayscale mode uses weight and an outline instead of colour, like the glyphs. Spell check skips the token.

## Where it shows up

1. **Status bar:** a red "2 overdue" item next to the counts, only when there is something overdue, counting open
   actions across **all notes**. Clicking it opens the Action Drawer in the due view. (Today's counts are for the
   active note only; this one is global on purpose, because a late action in last week's note is exactly the one
   you no longer see.)
2. **Action Drawer, due view:** a third toggle, "By due date", groups open actions as **Overdue / Today / This
   week / Later**, oldest due first; actions without a due date are left out of this view (they stay in the normal
   view). Everything else works as now: Enter jumps, Ctrl+Space closes in place, Shift+Enter forwards to today.
   Remembered for the session like the other toggles.
3. **Forwarding keeps the date.** Copy-forward, Shift+Enter in the drawer, Section History take-over and (later)
   A1 copy the line text, so `by:` comes along; the source becomes `> ` and stops counting. No double counting and
   no extra code: it falls out of "the date is text".
4. **Search:** `by:2026-10` already finds them as text. The operators `due:today`, `due:week` and `overdue` come
   with B3 (the shared filter parser and chips), not with this change, so B2 does not wait for B3.

Not proposed: a mark on the calendar for days something is due (a third meaning per day next to the dot and the
ring; could be a later addition if the due view is not enough), a "due today" info bar when opening today's note
(nagging), times of day, start dates ("not before"), priorities, recurring due dates.

## Delegated lines

`=> @dana send the slides by:2026-10-29` gets a pill too: "Dana owes this by Thursday". It is **not** in Marien's
own overdue count (it is not his work). Until B1 exists it shows in the due view only when the drawer's filter
contains `@`, as delegated lines do today. With B1, the "Waiting on" view sorts each person's lines by due date and
marks the late ones. B2 works on its own; B1 makes this part better.

## Build plan (size M)

One branch and worktree, `feat/due-dates` (`ChronoNote-due-dates`), one PR, merged when CI is green, then a beta
(`0.33.0-2` or the next free number) for Marien to try in the real app. Per the standing rules: implementation is
briefed to Gemini (`agy-task.ps1`), an independent test writer works from this document and not from the code, a
reviewer from another model family reads the diff, and every brief report ends with a Cost line. B2 is built on its
own; B1 and B3 stay parked.

Three slices, each its own brief, in order: each one builds on the one before and is green on `npm run verify` before
the next starts.

### Slice 1 · grammar and date words (no UI)

- `src/lib/grammar/tokenize.ts`: a `due` token kind (`by:` + a valid ISO date, decorated in place, not replaced),
  recognised only inside an action part (leading `# v > x`, `=> <symbol>`, `=> @name`), first one per part; golden
  snapshot and property tests extended. Topic, bullet, emphasis and prose lines yield no `due` token.
- `src/lib/tokens.ts`: `dueDateOfPart` / `dueItems(text)` returning, per action part, its state, due date and
  whether it is delegated; `countOverdue(text, todayISO)` (open own actions only, delegated excluded).
- `src/lib/date.ts`: `parseDueWord(word, todayISO, locale)` next to `parseDateQuery`: `today`/`t`, `tomorrow`/`tm`,
  weekday names and abbreviations (next one after today), `+N`, `wkN` (Friday of that ISO week; year rollover),
  `MM-DD` (next occurrence), ISO as is; English plus the UI language's words (new i18n keys in all 7 locales).
  `parseDateQuery` keeps its own behaviour for the date picker.
- Tests: Vitest with a fixed today across a week, a year end and every locale.

### Slice 2 · the editor

- Rewrite on leaving the line: extend the `stateFirstFilter` pattern (`src/lib/editor/stateFirst.ts`) with a sibling
  filter, same rules (user input and caret moves only, never a load or sync, one undo step with the movement).
  Paste runs the same rewrite (`src/lib/paste.ts`).
- Decoration: a new `src/lib/editor/dueDates.ts` (ViewPlugin) drawing the pill off the caret line (short date in the
  UI language, year only when not this year; `today` on the day; tooltip "N days late"), raw text on the caret line
  and on hover, the four states from "How it looks", grayscale variant, dotted underline for an unreadable word.
  Re-renders when `currentDateISO` changes (the midnight rollover in `boot.ts`). Spell check skips the token.
- "Set due date…": command in `src/lib/shortcuts.ts` (`Ctrl+Shift+D`, checked free) and the palette, an entry in
  `EditorContextMenu.svelte`, a button in `MobileAccessoryBar.svelte`; opens `DatePickerModal.svelte` in a "pick a
  due date" mode with a "No due date" button; clicking a pill opens the same. Ctrl+Click on the date stays the D4
  link.
- Tests: Playwright with a fixed clock: typing `by:fri` and leaving the line, undo, paste, each pill state, the
  picker set/replace/remove, the phone button; the Windows layout job for the pill's width at 100/125/150 %.

### Slice 3 · overview

- Status bar (`StatusBar.svelte`): the red "N overdue" item, computed from `allNotesCache` (filled at boot,
  `persistence.ts`) with open tabs' live text laid over it, refreshed on save, on rollover and on window focus;
  hidden at zero; never hidden by narrowing (like the counts). Click opens the Action Drawer in the due view on All
  files.
- Action Drawer (`ActionDrawerModal.svelte`, `src/lib/actions.ts`): the "By due date" toggle (session-remembered),
  groups Overdue / Today / This week / Later with the pinned group heading, oldest due first, undated actions left
  out; delegated lines only when the filter has `@` (as today). Enter, Ctrl+Space and Shift+Enter unchanged, and
  Shift+Enter's copy keeps `by:`.
- Forwarding check: copy-forward, Shift+Enter and the History take-over keep the date and the source stops counting
  (tests only; no code change expected).
- Tests: Vitest for the count; Playwright for the status-bar item, the due view, forwarding.

### Docs and release text (with slice 3)

`docs/spec.md` §2.2 (token row, typing rules), §3.3 (overdue item), §5 (due view); `website/guide.html` (syntax,
shortcut row: `guideShortcuts.test.ts` checks it); one CHANGELOG §-entry for the feature; one example line in the
onboarding template; README unchanged. New items in `docs/open-checks.md` for Marien: the pill at 125 % on the
laptop, Dutch weekday words, the overdue count after a night with the app open.

### Out of this build

`due:` / `overdue` search operators (B3), Waiting on by due date (B1), a calendar mark for due days.

## Decisions (Marien, 2026-10-23: all six as recommended)

1. **The token** is `by:2026-10-30` (not `due:` or a bracketed form).
2. **The pill** shows a short readable date in the UI language (`vr 30 okt`), not the ISO date.
3. **`by:fri` on a Friday** means next week's Friday; `by:today` is for today.
4. **The overdue count** in the status bar covers all notes.
5. **Delegated lines** get the pill now and stay out of the own overdue count.
6. **Order:** B2 is built on its own first; B1 and B3 come later.
