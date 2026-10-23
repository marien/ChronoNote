# Due dates on actions (feature review B2)

Status: approved 2026-10-23 (Marien took all six recommended decisions, see the end); built and released in beta
0.33.0-2 (§419). The pill is being reworked to keep the source's width and the line's height (see "How it looks"
and "Rework: the pill's footprint").

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

**As built since 0.33.0-4 (§421, Marien's choice of option A after trying 0.33.0-3): nothing is replaced but `by:`.**
The date stays text, on the line's baseline. `by:` becomes a flag drawn over its own three cells (the characters stay,
transparent; the flag half a character in from the left for clearance). One outline surrounds flag and date, built
like the topic pill: an outset 1px shadow (no layout room at any display scaling; a 1px border with a -1px margin
over-cancels at 150 %, where Chrome draws the border 0.67 px), the topic pill's corner radius and tint strength, and
on the right 0.3 ch of padding cancelled by a -0.3 ch margin, so it reaches into the space after the date while the
text after it stays on its column. States: muted (later), amber (today), red (overdue), dimmed (done, deferred, won't
do); Grayscale: thin, solid, and solid with a bold flag and digits (no thicker border, so every outline keeps the
topic pill's height). Drawn the same on the caret line: nothing changes when the caret moves. The caret never stops
inside `by:` and Backspace after the flag removes it whole. A click on the flag opens the date picker, Ctrl+Click
opens that day; the digits are ordinary text and a date link. Measured at 11-24 px and 100/125/150 %: width, height
and baseline unchanged to within 0.01 px.

The two earlier attempts are kept below for the record.

*First attempt (0.33.0-2):* off the caret line the token was drawn as a pill with the date written short in the UI
language: `vr 30 okt` / `Fri 30 Oct`. On the caret line the raw `by:2026-10-30` text showed so it could be edited.

*Second attempt (0.33.0-3), the pill keeps the source's footprint (reworked 2026-10-23, after Marien tried 0.33.0-2).* Two premises of
ChronoNote hold for every glyph and must hold here too, and the first build broke both:

1. **Text width.** Anything drawn in place of source text takes exactly the width of that text. The editor font is
   monospace (Cascadia Code), so this is a width in `ch`: `by:2026-10-30` is 13 characters, so the pill is exactly
   `13ch` wide (the token's own length, so a typed `By:` is the same). Measured in 0.33.0-2: the pill was 9.4 ch, so
   the end of the line moved 3.6 characters when the caret entered or left it.
2. **Line height.** Nothing on a line may change its height. The pill is a box exactly one line tall
   (`height` and `line-height` = the editor's line height, `vertical-align: top`, `overflow: hidden`), the same
   recipe as the glyphs (`.glyph-topic-open` and friends). Measured in 0.33.0-2: an inline box on the text baseline,
   with a smaller font and a 1px border, made the line 0.1-0.24 px taller at 11, 12, 16 and 20 px (and other sizes at
   125 %), so every line below moved when the caret entered or left the line.

So the outer box is the token's exact footprint and has no border, padding or margin; the visible pill (border,
background, rounded corners) is an inner element, centred vertically, filling the box's width, with the label centred
in it. It cannot change the line's height because the outer box clips it. Prototyped in the browser at 11-24 px: zero
extra height at every size, width 13.000 ch.

**The label must fit in 12 characters** (13 minus half a character of padding on each side). The first form that fits
wins: weekday + day + month (`vr 30 okt`, `Thu, Sep 17`); then day + month (`17. Sept.`); for another year,
day + month + year (`17 sep 2027`), then the date with a two-digit year in the locale's numeric form; never longer
than 12. Measured with Intl for the 7 UI languages: weekday + day + month fits everywhere except German
(`Do., 17. Sept.`, 14) and Polish (`czw., 17 wrz`, 14) and French at its longest (13), which fall back to day + month.
`today` / `vandaag` always fits.

The raw text on the caret line, the dotted underline of an unreadable word and the colours are marks on the text
itself: they never change width or height. Swapping pill and raw text when the caret moves therefore moves nothing.

Not chosen: leaving the raw `by:2026-10-30` in place and only colouring it (no replacement at all, so both premises
hold trivially); it keeps the date in ISO form, which Marien chose against in decision 2.

| State of the action part | Pill |
| :--- | :--- |
| open, due later | muted |
| open, due today | amber, reads `today` / `vandaag` |
| open, past due | red, reads the date and, in the tooltip, "3 days late" |
| done, won't-do, deferred | dimmed with the line, never coloured (the deadline no longer matters there) |

Grayscale mode uses weight and an outline instead of colour, like the glyphs. Spell check skips the token.

## Rework: the pill's footprint

- `src/lib/editor/dueDates.ts`: the widget becomes an outer `span.cm-due-pill` (the footprint, its width set inline
  to the token's length in `ch`) holding an inner `span.cm-due-label` (the visible pill and its text); a pure
  `dueLabel(date, today, locale, maxChars = 12)` picks the first form that fits, unit-tested for all 7 languages,
  this year and another year.
- `src/styles/03-editor.css`: the outer box gets the glyph recipe (one line tall, `vertical-align: top`,
  `overflow: hidden`, no border, padding or margin, full font size); the state colours, border and grayscale rules
  move to the inner label, drawn with `box-shadow: inset` instead of `border` so its size does not depend on them.
- `website/guide.html`: the example label is unchanged in meaning; the guide's own badge is not part of the editor.
- **Tests that guard both premises from now on** (Playwright, in `glyph-layout.spec.ts` next to the glyph width
  checks, and in the Windows layout job at 100/125/150 %): at editor font sizes 11-24 px, a line with a pill is
  exactly as tall as a line without one; moving the caret onto and off that line leaves the top of every line below
  it where it was; the pill is as wide as its source text (13 ch, measured against `0` characters), and the end of
  the line does not move when the caret enters it.
- Size: small (a widget DOM change, CSS, one pure function, tests): within what I do myself.

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
