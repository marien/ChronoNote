# Migrating existing notes into ChronoNote

This is a reference for converting notes from another tool (Notion, Obsidian,
a calendar export, plain Markdown, anything) into ChronoNote's format and
bringing them in via **Settings → Data → "Import notes from a file…"**. It's
written to be precise enough to hand to a conversion script or an AI agent,
not just a human — every format rule below is the literal parsing behavior,
not an approximation.

If you're the one writing the converter: read sections 1–4 to know exactly
what to produce, then look at the worked example (§5) before writing any
code. Section 6 is the human step — using the result once it's produced.

---

## 1. The big picture

ChronoNote's entire storage model is: **one plain-text file per calendar
day, one meeting/topic per section inside it.** There is no database, no
hidden IDs, no front-matter — every "feature" (section history, action
tracking, search) is just pattern-matching over plain text. That means a
converter's job is entirely mechanical: figure out which calendar day each
piece of source content belongs to, and rewrite its text using the token
syntax in §4.

The import feature reads one JSON **bundle** file containing every note as
plain text, keyed by filename — not a folder of `.txt` files (that's the
desktop app's own on-disk format, but the importer's *input* format is
JSON; see §2).

## 2. The bundle file format (what the importer reads)

Produce a single `.json` file shaped exactly like this:

```json
{
  "chrononoteExport": 1,
  "exportedAt": "2026-09-14T00:00:00.000Z",
  "notes": {
    "2026-08-25.txt": "Daily Standup\n=============\n# ship the migration guide\n",
    "2026-08-26.txt": "Weekly Planning\n===============\nv reviewed last week's notes\n"
  }
}
```

Rules, exactly as the importer enforces them:

- **`chrononoteExport`** must be the number `1`. (This is a schema version;
  the importer refuses a file whose version is *higher* than it understands,
  so don't invent a different number.)
- **`exportedAt`** is an ISO-8601 timestamp. Cosmetic only — put the
  conversion's run time here, or omit it (it defaults to the Unix epoch if
  missing, which is harmless).
- **`notes`** is a flat object: **filename → full file content as a single
  string.** Not an array, not nested by year/month — one flat map. See §3
  for the filename rules and §4 for the content format.
- An optional **`config`** object (`{"colorMode": "...", "themeMode":
  "..."}`) can carry over appearance settings — almost never relevant for a
  migration; omit it.
- Nothing else in the object is read. Extra fields are ignored, not an
  error.

The whole file must be valid JSON — a trailing comma or an unescaped quote
inside one of the note strings will fail the whole import, not just that
one note. Escape newlines as `\n` the way any JSON serializer already does;
don't hand-write literal line breaks inside a JSON string.

## 3. Filename rules

Every key in `notes` must be **exactly** `YYYY-MM-DD.txt` — a 4-digit year,
`-`, 2-digit month, `-`, 2-digit day, then literally `.txt`. For example:
`2026-03-07.txt`. Nothing else is accepted:

- No time-of-day, no title suffix, no different extension.
- Zero-padded: `2026-3-7.txt` is invalid; it must be `2026-03-07.txt`.
- A key that doesn't match this exactly is **silently skipped** — not an
  error, just quietly not imported. (The importer doesn't validate that the
  date is a *real* calendar date, e.g. `2026-13-40.txt` would pass the
  filename shape check, but there's no reason to ever produce one.)

**There is no way to import anything that isn't tied to a specific day.**
ChronoNote's only other note type is an ephemeral, never-saved scratchpad —
not something a migration can populate, and not something worth trying to
map arbitrary un-dated source notes onto. If your source material has notes
with no clear date, either skip them, or file them under whatever day makes
the most sense contextually (creation date, a date mentioned in the text,
today's date as a catch-all) — that's a judgment call for the conversion,
not something the format itself resolves for you.

**One file per day.** If your source has multiple entries on the same day
(e.g. three separate meetings), they all become **sections inside that
one day's file** — see §4.2. Don't try to invent multiple files for one
date.

## 4. The plain-text content format (the value for each key)

Everything below describes the *string* that goes in `notes["YYYY-MM-DD.txt"]`.
The file on disk (and this JSON value) is plain UTF-8 text — every token
below is literal ASCII characters. ChronoNote displays a nicer symbol on
screen, but the underlying text is exactly what you write.

### 4.1 General principle

Write normal text. Only specific line-leading patterns get special
treatment (§4.3). Everything else — prose, blank lines, plain bullet-free
notes — passes through completely unchanged. There's no escaping mechanism
needed for ordinary content; you only need to be careful if a line
*happens* to start with one of the token patterns below without meaning to
(rare in practice — reword it, e.g. lead with a bullet instead).

### 4.2 Section headers (Setext style)

A section is: **a line of plain text, immediately followed by a line made
of three or more `=` characters and nothing else.**

```
Daily Standup
=============
```

That's the entire rule — the underline just needs to be `===` repeated 3+
times (the exact count doesn't matter, and it doesn't need to match the
title's length, though matching it looks nicer). The line above it becomes
the section's title, trimmed of leading/trailing whitespace. Nothing else
marks a section — no `#` Markdown heading syntax, no other underline
character (`---` is *not* a section header).

Convention (not a hard requirement, but what ChronoNote's own features
produce): leave **two blank lines** between the end of one section's body
and the next section's title line, for readability. The parser doesn't
care how many blank lines separate sections, but consistent spacing makes
the file pleasant to read outside the app too — the whole point of it
being plain text.

**A file doesn't need any sections at all** — a note with no Setext
headers anywhere is completely valid, just not eligible for Section
History (which only aggregates content under a matched title).

### 4.3 The action & token vocabulary

These are the only patterns that mean something special to ChronoNote.
Each requires **exactly one whitespace character** after the symbol — a
plain space is standard, but a tab also satisfies the rule (two spaces
also "work," in that the token still renders, but leave a stray visible
space before the text — always use exactly one). All four action symbols
and the bullet marker may be **indented** with any amount of leading
whitespace — the indentation is real, meaningful text, not stripped.
Two-space increments are just the app's own convention (matching what
pressing `Tab` produces), not a hard requirement. `!` emphasis is the one
exception: it is **only** recognized at true column 0, never indented.

| Write this (start of line, optionally indented except `!`) | Becomes on screen | Meaning |
| :--- | :--- | :--- |
| `# text` | ☐ text | **Open action** — unresolved, blocks closing that day's tab until resolved. |
| `v text` | ☑ text | **Done** — completed action. |
| `> text` | » text | **Deferred / forwarded** — resolved for this day, pushed elsewhere. |
| `x text` | ☒ text | **Won't do** — resolved, but abandoned rather than done. |
| `- text` or `* text` | • text | **Plain bullet** — structural only, not an action, not tracked. `-` and `*` are interchangeable. |
| `=> text` (anywhere on a line, not just at the start) | ➔ text | **Follow-up / consequence** — an informational note, no action-state of its own. |
| `=> @name text` | ➔ **@name** text | **Delegated to `@name`.** The name may contain a hyphen (`@jean-luc`). Can also be written parenthesised: `=> (@name) text`. |
| `=> # text` (or `v`/`>`/`x` in place of `#`) | ➔ ☐ text | **Consequence action** — a task that resulted from the line, with its own open/done/deferred/won't-do state. Mutually exclusive with `=> @name` — a line is either delegated to a person, or is itself an actionable consequence, never both. |
| `(topic)` **immediately after** a leading `#`/`v`/`>`/`x`, or after a `=> #`/`=> v`/`=> >`/`=> x` | a muted `(topic)` pill | Group actions by subject. A parenthesised word anywhere else on a line, or in plain prose, is left as ordinary text — it only means something right after an action symbol. |
| `! text` (column 0 only, never indented) | **text** (bold) | Emphasis — "remember this." Purely informational. |

A few worked examples, showing exactly how each rule combines:

```
# call the vendor about the renewal
  # (indented, still an open action — two-space nesting)
v (billing) reconciled last month's invoice
> follow up with legal next sprint
x skip the redesign, deprioritized
- just a plain note, not an action
=> decided to push the launch a week
=> @sam send the updated contract
=> (@sam) send the updated contract
=> # file a follow-up ticket
Talked to Priya => # write up the incident report
! Renewal deadline is the 30th, don't forget
```

The last example shows a `=> ` consequence appearing **mid-line**, after
other prose — this is explicitly supported and common in real converted
notes ("discussed X, which led to Y").

### 4.4 Recurring section titles (for Section History to actually work)

ChronoNote's Section History feature aggregates a section across every day
it recurs under **the same title**. To get a useful history out of a
migration, use the **exact same title** every time a recurring
meeting/topic repeats (e.g. always exactly `Daily Standup`, not `daily
standup` one day and `Standup (daily)` the next — though see below, the
match is case-insensitive, so casing differences alone are fine).

The title match is applied after two automatic cleanups, so you don't need
to hand-strip these yourself if your source data naturally includes them:

- A leading `[HH:MM - HH:MM]` time range is stripped for matching (and for
  display), e.g. `[09:00 - 09:30] Daily Standup` matches plain `Daily
  Standup`. A leading `[CANCELED]` marker is stripped the same way.
- A leading or trailing date in **exactly** `YYYY-MM-DD` form (with an
  optional `-` or `:` separator) is stripped **only for matching purposes**
  (it's kept as-is for display) — so `Weekly Sync - 2026-08-08` and `Weekly
  Sync - 2026-08-15` are recognized as the same recurring section. Any
  other date spelling (`Aug 8`, `08/08/2026`, …) is *not* recognized and
  will not match — if your source calendar exports titles with embedded
  dates, prefer the `Title - YYYY-MM-DD` shape (or just the date-free
  `Title` with the date's own file already telling you which day it was)
  over any other format.
- Matching is otherwise an exact, case-insensitive string comparison —
  no fuzzy matching, no partial matching. `Daily Standup` and `Daily
  Standup Notes` are two unrelated sections as far as history is concerned.

If recurrence grouping doesn't matter for your migration (e.g. you're
converting one-off notes, not recurring meetings), none of this matters —
just give each section a sensible title and move on.

### 4.5 What to leave alone

Don't try to reproduce ChronoNote's on-screen glyphs (☐, ☑, ➔, etc.)
directly — always write the plain-ASCII token (`# `, `=> `, …) and let the
app render the glyph. Writing a literal ☐ character does nothing special;
it's just a character in the text.

---

## 5. Worked example

Source material (hypothetical export from another tool — a calendar entry
plus a personal to-do list, both from the same day):

> **Meeting: Daily Standup** — 2026-08-25, 09:00-09:15
> - Yesterday: shipped the auth refactor
> - Today: start on the migration guide
> - Blocker: waiting on design review
>
> **Personal notes**
> - [ ] Renew car insurance
> - [x] Book dentist appointment
> - Follow up with Sam about the contract

Converted `notes["2026-08-25.txt"]` value:

```
Daily Standup
=============
- Yesterday: shipped the auth refactor
- Today: start on the migration guide
# resolve the design-review blocker


Personal
========
# renew car insurance
v book dentist appointment
=> @sam follow up about the contract
```

Notes on the choices made converting this:
- The calendar meeting's plain narrative bullets ("Yesterday: …", "Today:
  …") stayed plain bullets — they're status notes, not tasks.
- "Blocker: waiting on design review" became an actual open action (`#`),
  since a blocker is realistically a thing that needs resolving — this is
  the kind of judgment call a converter (or an AI agent doing the
  conversion) has to make; the format itself doesn't dictate it.
- The to-do list's `[ ]`/`[x]` Markdown checkboxes mapped directly to `#`
  (open) and `v` (done) — the closest equivalent this format has.
- "Follow up with Sam about the contract" became a delegated follow-up
  (`=> @sam`) rather than a self-owned open action, since it's addressed
  to someone else.
- Two blank lines separate the two sections, per the convention in §4.2.

The full bundle file wrapping this (and any other converted days):

```json
{
  "chrononoteExport": 1,
  "exportedAt": "2026-09-14T00:00:00.000Z",
  "notes": {
    "2026-08-25.txt": "Daily Standup\n=============\n- Yesterday: shipped the auth refactor\n- Today: start on the migration guide\n# resolve the design-review blocker\n\n\nPersonal\n========\n# renew car insurance\nv book dentist appointment\n=> @sam follow up about the contract\n"
  }
}
```

## 6. Performing the import

Once the `.json` bundle file exists:

1. Open ChronoNote (desktop app or the web app — the import works
   identically on both).
2. Open **Settings** (`Ctrl/Cmd+,`).
3. Under **Data**, click **"Import notes from a file…"** and choose the
   `.json` file.
4. ChronoNote shows a preview: how many notes the file contains, and a
   choice between:
   - **Merge (skip duplicates)** — adds every note whose filename doesn't
     already exist; a day that already has a note is left untouched (the
     existing note wins, the incoming one for that day is silently
     skipped). This is almost always what you want for a migration into
     an already-in-use ChronoNote — you get the historical notes without
     risking today's in-progress note.
   - **Replace everything** — deletes every note currently in ChronoNote
     first, then imports the file's notes. **Not reversible.** Only use
     this on a brand-new, empty ChronoNote install, or if you deliberately
     want the import to be the sole source of truth going forward.
5. Click **Import**. The status bar confirms how many notes were imported
   and how many were skipped (invalid filenames, or duplicates under
   Merge mode).

That's the whole process — there's no post-import cleanup step. Every
imported note behaves exactly like one typed directly into the app,
immediately eligible for Section History, the Action Drawer, and search.

## 7. Quick reference: common mistakes

- **Using Markdown headings (`# Title`) for sections.** ChronoNote's `#`
  is the *open action* symbol, not a heading marker — a line starting
  with `# ` is parsed as a task, not a section title. Sections use the
  Setext underline style in §4.2, with no leading symbol on the title
  line itself.
- **No whitespace, or zero-width content, right after a token symbol.**
  `#text` (no space) is not an action — it needs exactly one whitespace
  character (space or tab) right after the symbol to be recognized.
- **Forgetting a note is keyed by day, not by meeting/topic.** All of a
  day's content — however many separate source items it came from — goes
  into the *one* `YYYY-MM-DD.txt` value, split into sections.
- **A JSON string containing a literal newline instead of `\n`.** Breaks
  the file's JSON parsing entirely. Let your JSON serializer handle this;
  don't hand-assemble the file as a plain-text template.
- **Padding-free dates in filenames** (`2026-3-7.txt`). Always
  zero-padded, always `2026-03-07.txt`.
