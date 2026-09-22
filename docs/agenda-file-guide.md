# The `.agenda.json` calendar file

This is a reference for whatever external process feeds your real calendar
into ChronoNote's "Sync calendar for this day" feature — a script, a cron
job, another app, anything that can write a JSON file. It's written to be
precise enough to hand to a script (or an AI agent) directly, not just a
human — every rule below is the literal parsing behavior, not an
approximation. See `docs/migration-guide.md` if what you're looking for is
instead a **one-time bulk import** of existing notes from another tool —
that's a different feature (Settings → Data → "Import notes from a file…")
with its own file format; this document is about the **ongoing, repeated**
calendar-sync feed, a completely separate JSON schema for a completely
separate purpose.

## 1. The big picture

ChronoNote never writes this file — it only reads it. Whatever you already
use to sync your real calendar (Outlook, Google Calendar, a CalDAV script,
anything) needs to write `.agenda.json` itself, kept up to date however
often you want your calendar sync to reflect reality. ChronoNote doesn't
poll it, doesn't watch it for changes, and has no notion of staleness — it
reads the file fresh every time "Sync calendar for this day" runs
(`Ctrl/Cmd+Shift+C`, or the toolbar button) and trusts that whatever is on
disk at that moment is current.

The feature itself (a separate concern from this file format) is: reads the
file, filters to one day's meetings, and reconciles the result against that
day's note — matching existing sections by title, creating new sections for
meetings that aren't in the note yet, and offering a review step (leave
flagged / discard / move to another day) for any section whose meeting is
no longer on the agenda. None of that reconciliation logic is described
here; this document is only about what the *file* needs to contain for that
feature to work correctly.

## 2. Where it lives

**Desktop app:** a file literally named `.agenda.json` (leading dot, exactly
that name — not `agenda.json`, not `.agenda.JSON`) at the **root of your
notes folder** — the same folder your daily `YYYY-MM-DD.txt` files live in,
not a subfolder.

**Web app:** the feature is available there too, but only once you've
connected a OneDrive account and folder (Settings → Calendar). The web app
has no local filesystem of its own — it reads `.agenda.json` the same way
it reads everything else, from whatever OneDrive has synced down into the
browser's own storage. Concretely: put `.agenda.json` in the same
OneDrive-synced notes folder the desktop app (or your phone) would use, and
it becomes readable from the web app once OneDrive sync catches up. Without
a connected OneDrive folder, the web app has no way to receive this file at
all, and the sync button never appears.

Either way, the file's own **schema and rules are identical** — everything
below applies regardless of which app reads it.

## 3. The schema

The whole file is a single JSON **array** — not an object, not a bundle
with metadata fields wrapping it (that's the different, unrelated import
bundle format in `docs/migration-guide.md` — don't confuse the two). Every
element is an object with exactly these four string fields:

```json
[
  { "date": "2026-09-14", "start": "09:00", "end": "09:30", "title": "Daily Standup" },
  { "date": "2026-09-14", "start": "11:00", "end": "11:30", "title": "Design Review" },
  { "date": "2026-09-15", "start": "09:00", "end": "09:30", "title": "Daily Standup" }
]
```

| Field | Format | Notes |
| :--- | :--- | :--- |
| `date` | `YYYY-MM-DD` | Which day's agenda this meeting belongs to. Must match a real filename's date to be findable — same zero-padded shape as note filenames (`2026-09-14`, not `2026-9-14`). |
| `start` | `HH:mm`, 24-hour | Local wall-clock time, not UTC, no timezone offset, no seconds. `09:00`, not `9:00` or `09:00:00`. |
| `end` | `HH:mm`, 24-hour | Same shape as `start`. Used only for sorting and de-duplication (§5) — ChronoNote doesn't compute or display a duration anywhere. |
| `title` | any string | The meeting's title, exactly as it should appear as a section header — apart from the special prefixes in §6, which are stripped before the title is used. |

**All four fields are required on every entry.** A single entry missing any
one of them (a typo'd key, a `null` where a string is expected, an entry
that's a string instead of an object) fails validation for the **entire
file**, not just that one entry — see §4 for exactly what that means in
practice. There is no lenient/partial mode.

Nothing else in an entry is read. If your source data naturally includes
extra fields (an event ID, a location, attendee emails, a Teams link),
leave them in — they're harmlessly ignored, no need to strip them before
writing the file.

## 4. What counts as a valid file (this is the part most likely to surprise you)

A missing file, blank/empty content, a file that isn't valid JSON, JSON
that isn't an array, an array whose elements don't all match the shape in
§3, **or a bare empty array `[]`** — every one of these is treated as a
**hard error**, surfaced to the user as "The calendar file (.agenda.json)
is missing, empty, or invalid — check whatever syncs it." None of them mean
"you have no meetings today."

This is deliberate, not a bug to work around: none of those states are ever
produced by a genuine, successful sync of a real calendar. A real calendar
sync either produces a real array of real meetings (even if empty for the
requested day specifically), or the sync itself is broken/incomplete —
there's no legitimate reason for the file to be missing or blank once
you've set this feature up, so treating those states as "no meetings" would
silently hide a broken sync instead of surfacing it.

**The one case that *is* a legitimate, error-free "no meetings today":** a
**non-empty, well-formed array** that simply has zero entries whose `date`
matches the day being synced. In other words: `[]` (the array itself empty)
is an error, but `[{"date": "2026-01-01", ...}]` synced against
`2026-09-14` (a valid array, just nothing for that specific date) is a
completely normal empty result. If your sync process runs but genuinely
finds nothing on the calendar for the days ahead, don't write `[]` —
instead, either don't write the file at all for that run (leaving whatever
was there before, if it still has other days' entries you care about), or
include something like yesterday's already-past entries so the array isn't
literally empty. In practice this rarely comes up: a real calendar feed
almost always has *something* in it across the date range you're
exporting, even if not for the exact day someone happens to sync.

## 5. Sorting and de-duplication

You don't need to pre-sort or de-duplicate the file yourself — ChronoNote
does this on every read, scoped to whichever day (or date range, for the
"copy to next occurrence" feature) is being queried:

- **Sorted** by `start` time, then `end` time, then `title` (alphabetically)
  as a tiebreaker — this only matters when two meetings start at the exact
  same minute, to make the result deterministic rather than depending on
  the array's original order.
- **De-duplicated** on the exact `(start, end, title)` triple. Two entries
  that are identical in all three fields collapse into one — this handles
  a sync process that (harmlessly) writes the same meeting twice. Two
  meetings with the **same title at different times** are correctly kept
  as two separate entries (e.g. two `"1:1"` meetings on the same day with
  different people) — de-duplication is never based on title alone.

## 6. Special title prefixes (removed meetings and status stamps)

Two independent conventions ChronoNote recognizes in a `title`, both
**case-sensitive, exact-prefix, at the very start of the string only** — a
title that merely *contains* one of these words elsewhere is left alone.

**Removed-meeting prefixes** — a title starting with one of these means the
meeting is not actually happening, and ChronoNote treats its note section
(if one already exists) as something to flag for review (leave it marked,
discard it, or move it to another day) rather than something to keep
syncing:

```
Canceled:
Cancelled:
Declined:
Followed:
Following:
```

The prefix is stripped; whatever remains (trimmed) is the meeting's real
title, used for matching against existing sections. `"Canceled: 1:1 with
Sam"` is the removed meeting `"1:1 with Sam"`. If nothing is left after
stripping the prefix and trimming (a title that's *only* the marker, no
real title), the entry is silently ignored entirely — it's neither an
active meeting nor a removed one worth flagging.

**Status-word stamps** — `Placeholder` or `Confirmed`, followed immediately
by a separator (`:`, `-`, or `--`), are stripped the same way:
`"Placeholder: Budget review"` and `"Confirmed - Budget review"` both
become the meeting `"Budget review"`. Without a separator right after the
word, it's treated as part of the real title and kept as-is — `"Confirmed
attendees review"` stays exactly that (no separator follows "Confirmed").
A title can carry both kinds of prefix together, in either combination —
`"Canceled: Placeholder - Offsite"` is the removed meeting `"Offsite"`.

Neither convention needs to be used — if your calendar source has no
concept of "declined" or "placeholder" meetings, just never write these
prefixes and every title is used verbatim.

## 7. What ChronoNote does *not* do for you

**No attendee filtering.** If your calendar source includes meetings you
declined, single-attendee blocks (e.g. focus-time holds), or anything else
that isn't a real meeting with other people, your sync process needs to
filter those out itself before writing the file — ChronoNote does no
filtering of its own beyond the title-prefix conventions in §6. Everything
in the array is treated as a real, attending meeting unless its title says
otherwise.

**No timezone handling.** `start`/`end` are read as plain local wall-clock
strings with no timezone conversion of any kind. If your source calendar
spans timezones, resolve that before writing the file — write the time as
it should read on the day in question, in whatever timezone that day's
notes are being kept in.

**No recurrence expansion.** Each occurrence of a recurring meeting needs
its own entry with its own `date` — `.agenda.json` has no notion of "this
repeats every Monday." If your calendar source stores recurring meetings as
a single rule, your sync process needs to expand it into individual dated
entries before writing the file (typically for some rolling window, e.g.
"today plus the next N days").

## 8. Worked example

A sync process exporting two days, with one cancelled meeting, one
placeholder that resolved into a real meeting, and a recurring standup:

```json
[
  { "date": "2026-09-14", "start": "09:00", "end": "09:15", "title": "Daily Standup" },
  { "date": "2026-09-14", "start": "10:00", "end": "10:30", "title": "Confirmed: Design Review" },
  { "date": "2026-09-14", "start": "14:00", "end": "14:30", "title": "Declined: Budget Sync" },
  { "date": "2026-09-15", "start": "09:00", "end": "09:15", "title": "Daily Standup" },
  { "date": "2026-09-15", "start": "11:00", "end": "11:30", "title": "1:1 with Sam" }
]
```

Syncing `2026-09-14` against this file produces two active meetings —
`"Daily Standup"` and `"Design Review"` (the `Confirmed:` stamp stripped) —
plus one removed meeting reported for review, `"Budget Sync"` (the
`Declined:` prefix stripped, flagged rather than silently dropped if a
section for it already exists in that day's note). Syncing `2026-09-15`
finds `"Daily Standup"` (which Section History will correctly recognize as
the same recurring section as the 14th's, since title matching is
case-insensitive and exact once both are stripped of any prefix) and
`"1:1 with Sam"`, with nothing removed.

## 9. Quick reference: common mistakes

- **Writing `[]` when there are genuinely no meetings.** This is read as a
  broken/incomplete sync, not an empty calendar — see §4.
- **Wrapping the array in an object**, e.g. `{"meetings": [...]}` or
  `{"agenda": [...], "version": 1}`. The file's top level must be the array
  itself, not a key holding it.
- **A missing `end` field** because your source calendar doesn't track
  meeting duration. All four fields are required regardless — synthesize a
  plausible `end` (e.g. `start` plus 30 minutes) rather than omitting it.
- **Using a different date or time format** (`09/14/2026`, `9:00 AM`,
  an ISO datetime with a timezone offset). Only `YYYY-MM-DD` and 24-hour
  `HH:mm` are recognized — anything else fails the whole file's validation,
  since it won't deserialize into the expected shape at all.
- **Forgetting the leading dot in the filename.** It's `.agenda.json`, a
  dot-file, not `agenda.json`.
- **Expecting a placeholder/cancelled prefix to be recognized anywhere in
  the title.** Both conventions in §6 only match at the very start of the
  string — `"Team Sync (Confirmed)"` keeps `"(Confirmed)"` as literal text,
  it does not get stripped.
