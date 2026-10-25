# Week review (feature review A3): design draft

Status: decided (section 7), to be built. Approved as an idea on 2026-10-25: "Yes, this will help my Friday
afternoon or Monday morning week review. It should help me figure out which actions and topics are still open and
require follow-up."

## 1. Goal

One read-only view that answers, for one week: **what is still open and needs follow-up**, in the context of the
meeting it came from. Nothing is written to any note by opening it. It is a review, not a second action list: the
Action Drawer stays the place for "everything open, anywhere".

Fits Marien's way of working (from the same review): actions stay in the context of the meeting they were raised in
(A1 rejected); delegated work is not tracked as tasks (B1 rejected); undiscussed topics are rare (C1 rejected).

## 2. What it shows (proposal)

For one ISO week (Monday to Sunday), from the dated notes of that week:

```
Week 44 · 27 Oct - 2 Nov 2026                         ‹ week 43    week 45 ›
12 open actions · 3 open topics · 4 overdue                [ ] Show done

Monday 27 Oct
  Weekly Sync
    ☐ send the budget to Dana                         ⚑ 2026-10-30
    ☐ book the venue
       ├─ ☐ pick a date
       └─ ☐ 1. ask finance
    ○ hiring plan                                     (open topic)
  Standup
    ☐ fix the export bug                               → 2026-10-29 · Standup
Wednesday 29 Oct
  1:1 Priya
    ○ promotion case
```

- **Grouped by day, then by section (meeting)**, in note order, so every item keeps its meeting context. A day or
  section with nothing open is left out (or shown as one muted line, see question 4).
- **Open actions** (`#`, own and steps/sub-actions, drawn with the §423 groups, the due flag and pills as in the Action
  Drawer), **open topics** (`o`) and **postponed topics** (`,`).
- An action that was **forwarded** (`>` with a `(>date#section)` link) is not open here: it went somewhere. Its new
  copy is open where it landed, so it shows up in that week instead.
- The header counts what is open, and how many open actions are past their `by:` date.
- **Show done** (off by default): adds what was resolved that week per section (done `v`, cancelled `x`, discussed
  topics `.`, decisions `=>` lines), muted, for a fuller picture or a status update.

## 3. How you use it

- Open: command palette "Week review", the More menu, a shortcut (question 2), and a click on a week number in the
  date picker.
- `Left`/`Right` (or the arrows in the header): previous/next week. `Home`: this week.
- `Up`/`Down` select an item; `Enter` jumps to its line (the view stays open when docked, like Section History);
  `Ctrl+Space` changes the item's own state, `Shift+Enter` forwards it to today, both exactly as in the Action Drawer.
- Docked to the right of the note on a wide window (like Section History and Actions), a dialog otherwise and on the
  phone.

## 4. Build notes

- Reuses: the dated-note cache (`allNotesCache`) as Section History does, `actionTree` + `buildDrawerRows`-style rows
  for groups, `parseGlyphLine` for pills, the Action Drawer's keyboard handlers, the date picker's ISO week numbers.
- New: a week index over the cache (notes per ISO week), the section grouping (section headers are already parsed for
  Section History), the view component, palette/More/shortcut entries, 7 languages.
- Read-only; no new syntax; nothing stored except "Show done" per session.
- Estimate: M (a few days of agent work): one coder brief + an independent test writer, my review and browser checks.

## 5. Left out

- Copy as Markdown / a summary to send (C2 was put off; easy to add later on top of this view).
- Delegated parts as a "waiting on" list (B1 rejected). They appear only as part of the action line they are on.
- Notifications or a "review reminder".

## 6. Questions for Marien

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | Which week opens? | a) always this week; b) on Monday (and on a weekend) last week, otherwise this week; c) the last week you looked at | **b**: Monday morning reviews last week, Friday afternoon this one |
| 2 | Shortcut | a) `Ctrl+Shift+K` (free, not taken by browsers for the web app); b) only palette and More; c) your choice | **a** |
| 3 | Older open items | a) only the week's own items; b) also one line "N still open from earlier weeks" that opens the Action Drawer on them | **b**: a week review should not hide what is still open from before |
| 4 | Days and sections with nothing open | a) left out; b) one muted line each ("Standup: all done") | **b**: shows the meeting happened and was closed |
| 5 | Show done | a) toggle, off by default (as in section 2); b) always shown; c) not at all | **a** |
| 6 | Delegated parts (`=> @name`) | a) shown on their action's row only; b) also listed per person under the section | **a** (B1 rejected) |
| 7 | Editing from the view | a) `Ctrl+Space` and `Shift+Enter` as in the Action Drawer; b) read-only, Enter only | **a** |

## 7. Decisions (Marien, 2026-10-25)

All seven recommendations taken: 1b (last week on Monday and at the weekend, otherwise this week), 2a (`Ctrl+Shift+K`),
3b (one line "N still open from earlier weeks" that opens the Action Drawer on them), 4b (a muted line for a day or
section with nothing open), 5a ("Show done" toggle, off by default), 6a (delegated parts only on their action's row),
7a (`Ctrl+Space` and `Shift+Enter` as in the Action Drawer).
