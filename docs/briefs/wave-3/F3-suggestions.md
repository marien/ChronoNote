# Brief F3: Suggestions for @names, (topics) and section titles

Run name `f3-suggestions` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f3-suggestions` · branch
`gemini/f3-suggestions` · base `main` · browser-test port `1463` · model Gemini 4 Hydrogen (Google-Sonnet quota used up until 2026-11-22)

Read `docs/briefs/RULES.md` in your worktree first. It applies in full; rules 2, 3 and 5 matter most here.

## Why

Marien types the same names, topics and meeting titles every day, and a typo (`@Rtuh`) splits Search, the Actions
filter and Section History. While he types, a small list offers what his notes already use. Design and decisions
(2026-11-16): `docs/design/wave3-designs.html`, section F3, questions 3.1-3.4. Read that section (lines 113-136)
before you start.

## What exists now

- `src/lib/editor/editingExtensions.ts`: the editor's extensions in order. `EditorPane.svelte` (line 313) passes
  UI-only extensions in the slot `afterFilters` (line 335). The new extension goes there, so the pure
  `editingExtensions` (used by `src/lib/testing/testEditor.ts`) stays as it is.
- Tab and Enter already have meanings:
  - `numberedListKeymap` (`src/lib/editor/numberedListKeys.ts` line 763);
  - `editingKeymap` (`src/lib/editor/editingKeymap.ts` lines 111-112: Tab indents, Enter continues a bullet);
  - `indentWithTab` (`editingExtensions.ts` line 65).
  - While the list is open and only then, the new keys must win: use `Prec.highest`. Return `false` when no list is
    open, so every existing key behaves exactly as today.
- Tokens (`src/lib/grammar/tokenize.ts`): `tokenizeLine(line)`.
  - An `@name` is an `"assignee"` token, however it stands: after `=> `, bare, or in a `(@a, @b)` list.
  - A `(topic)` right after an action or topic symbol is a `"topicTag"` token.
  - `NAME_CHAR` is in `src/lib/grammar/symbols.ts` line 17.
- `@codemirror/autocomplete` is NOT a dependency, and none may be added. CodeMirror's own `showTooltip` facet and
  `StateField` in `@codemirror/view` / `@codemirror/state` are enough. A tooltip floats over the text, so line
  heights and widths do not change (rule 2).
- Notes: `notesIndex` (`src/lib/notesIndex/`).
  - `get(notesIndex).entries` maps filename to `NoteEntry`. Skip keys where `isScratchpadKey` is true.
  - `dateISOOfFilename(key)` gives the date, or null for an undated file.
  - `sectionsOf(entry)` gives each section with `normalized`.
  - Facets are memoised per entry in a `WeakMap` (`facets.ts`): follow that pattern for new facets.
- Section titles: `normalizeHeaderTitle` and `titleForMatching` in `src/lib/tokens.ts` (lines 878, 895).
  `isSetextUnderline` is used by `listSections` (line 914); find its export.
- Calendar: the store `calendarSyncEnabled` and `api.readAgendaForDate(date)`, which returns the day's meeting titles
  as calendar sync writes them (see `src/lib/boot.ts` lines 493-495).
- Phone detection: `controller.isMobile` (`EditorPane.svelte` line 838).

## What to build

1. **Facets, `src/lib/notesIndex/facets.ts`.** Two new memoised facets, each scanning `linesOf(entry)` with
   `tokenizeLine`:
   - `namesOf(entry)`: a `Map` from the lower-cased name to `{ spelling counts }`, one count per occurrence of every
     `"assignee"` token. The name is the token text without `@`.
   - `topicTagsOf(entry)`: the same for `"topicTag"` tokens. The value is the text inside the parentheses.
   - Add both to `_facetRuns`.

2. **The data, new `src/lib/suggestions.ts`** (pure, no editor imports).
   - `type SuggestionKind = "name" | "topic" | "title"`.
   - `interface Suggestion { insert: string; label: string; lastUsed: string | null; meetingToday?: boolean }`.
   - `buildSuggestions(kind, prefix, ctx: { noteDate: string | null; entries; meetingsToday: string[] })` returns at
     most 8 suggestions:
     - **Names and topics.**
       - Gather from every non-scratchpad entry.
       - `lastUsed` is the latest note date where it appears; undated files count as never.
       - The spelling offered is the one with the most occurrences across all notes; on a tie, the spelling of the
         latest note.
       - Keep a row when its lower-cased value starts with the lower-cased prefix, and is not equal to it. The note
         being typed in is in the index too, so the half-typed name must not suggest itself.
       - Order by `lastUsed` (latest first), then by total count, then alphabetically.
       - `insert` for a name: `@` + spelling. For a topic: `(` + spelling + `)`.
     - **Titles.**
       - `meetingsToday` comes first, in calendar order. Keep one when its lower-cased text contains the prefix.
         Mark it `meetingToday`, with `insert` the title as given.
       - Then recurring titles. Take `titleForMatching(normalized)` of every section in dated notes from `noteDate`
         minus 90 days up to and including `noteDate`.
         - A title is recurring when it appears in at least 2 different notes.
         - The spelling is the latest note's spelling. `insert` is that `titleForMatching` text.
         - Keep it when it contains the prefix, case-insensitively, and is not equal to it.
         - Order by `lastUsed`, latest first.
       - Drop a recurring title equal (case-insensitively) to a meeting already listed.
     - `label` is what the row shows: the same as `insert`.

   | Notes (date: lines) | Kind, prefix | Rows, in order |
   | :--- | :--- | :--- |
   | 2026-11-12: `# ask @Ruth`, 2026-11-03: `# ask @Robin`, 2026-10-12: `o x (@Rosa)`, 2026-11-14: `# @ruth call` | name, `R` | `@ruth` (last used 11-14), `@Robin`, `@Rosa` |
   | 2026-11-15: `# (budget) a`, 2026-11-02: `# (building) b`, 2026-11-01: `# (budget) c` | topic, `b` | `(budget)` (11-15), `(building)` (11-02) |
   | 2026-11-04 and 2026-10-07 have section `Board meeting`, 2026-11-04 has `Board prep`, meetings today `[14:00 - 15:00] Board review` | title, `board` (noteDate 2026-11-16) | `[14:00 - 15:00] Board review` (meetingToday), `Board meeting` |

   In the first row, `Ruth` and `ruth` appear once each. The tie goes to the latest note's spelling, 2026-11-14's
   `ruth`. Add a second case where `@Ruth` appears twice and `@ruth` once: then the row is `@Ruth`.

3. **Where a list opens, `src/lib/editor/suggestions.ts`.**
   - Export `suggestionContext(lineText, caretCol, nextLineText | null): { kind, prefix, from, to } | null`. `from`
     and `to` are line columns of the text a taken row replaces.
   - The list opens only when the selection is empty.

   | Line (caret `|`) | Next line | Result |
   | :--- | :--- | :--- |
   | `o coffee rota (@R|` | any | name, prefix `R`, replaces `@R` |
   | `# ask @|` | any | null (3.2: only after the first letter) |
   | `mail me at a@b|` | any | null (`@` glued to a word: the char before `@` must be line start, whitespace, `(` or `,`) |
   | `# (b|` | any | topic, prefix `b`, replaces `(b` |
   | `# => o (b|` | any | topic (after a consequence-topic symbol too) |
   | `plain (b|` | any | null (a topic tag only follows an action or topic symbol) |
   | `# (budget) more (b|` | any | null (only the first `(` right after the symbol) |
   | `Board|` | `=====` | title, prefix `Board`, replaces the whole line's text |
   | `Board|` | `plain` | null |
   | `# call @Ruth |` | any | null (a space ends the word) |

   - Decide "after an action or topic symbol" with `tokenizeLine` on the text before the caret. The first token is
     `"action"` or `"topic"`, or the last token before the `(` is `"consequence"` or `"consequenceTopic"`, and the
     `(` starts exactly where that token ends.
   - A name's prefix is `@` followed by one or more `NAME_CHAR`, ending at the caret. Build that test from the
     exported `NAME_CHAR`.

4. **The extension, same file.** `suggestionsExtension(source: (kind, prefix) => Suggestion[])` holds a `StateField`
   with the open list (context, rows, selected index or -1, and whether an arrow key was used).
   - After each document or selection change, it recomputes `suggestionContext`. The list is open when there is a
     context and at least one row. The selected row starts at 0, drawn as selected; "arrow used" starts false.
   - It renders through `showTooltip`, below the caret's line start (`above: false`):
     - a `div` with `role="listbox"` and class `cn-suggest`;
     - rows with `role="option"` and `aria-selected`;
     - in each row, the label, then a muted date: "today" / "yesterday" / weekday short within 6 days / "3 Nov"
       (the year added when it is not the note's year), in the UI locale; "today's meeting" for `meetingToday`.
   - The editor's `aria-activedescendant` points at the selected row while the list is open.
   - Keys, with `Prec.highest`, active only while the list is open:

   | Key | Does |
   | :--- | :--- |
   | `Tab` | takes the selected row |
   | `ArrowDown` / `ArrowUp` | moves the selection (wraps) and sets "arrow used" |
   | `Enter` | takes the selected row if an arrow was used; otherwise returns `false`, so Enter is a normal Enter (3.1) |
   | `Escape` | closes the list until the context changes (a new word) |
   | anything else | normal; the list narrows or closes with the new text |

   - Taking a row: one transaction replaces `[from, to)` with `insert` and puts the caret after it (rule 5).
     - For a topic: when the character right after the caret is `)`, the replacement covers it too, so the result
       never has `))`.
     - It is a normal undo step.
   - A mouse click on a row takes it. A click elsewhere, or the editor losing focus, closes the list.
   - The list is never shown on the phone: `EditorPane` does not add the extension when `isMobile` is true (3.4).

5. **Wiring, `EditorPane.svelte`.**
   - Add `suggestionsExtension(source)` to `afterFilters`.
   - `source` calls `buildSuggestions` with `get(notesIndex).entries`, the active tab's date (the filename's date,
     null for undated) and today's meetings.
   - Meetings: only when `calendarSyncEnabled` is on and the note is dated. Call `api.readAgendaForDate(noteDate)`
     once per date and cache it in a `Map`. An error caches `[]`.
   - Do not await inside the extension. The first time a date is needed, start the read and use `[]` until it
     returns.

6. **Text in all seven languages**, new keys:
   - `suggestions.today` "today"
   - `suggestions.yesterday` "yesterday"
   - `suggestions.meetingToday` "today's meeting"
   - `suggestions.listLabel` "Suggestions" (the listbox's `aria-label`)
   - Dutch: "vandaag", "gisteren", "vergadering vandaag", "Suggesties".

7. **Style** (`src/app.css` or the file where editor tooltips are styled; if there is none, put it next to the other
   `.cm-` rules).
   - The popup uses the theme's surface and border tokens, as the line menu does. It is at most 8 rows, with no
     scrollbar.
   - The font is the UI font at the editor's size.
   - It looks right in light and dark themes.

8. **Docs.**
   - `docs/spec.md`: a short subsection under editing, with what opens the list, the keys, and the ranking.
   - `website/guide.html`: one paragraph.

## Out of scope

- The phone (3.4).
- The attendees from F9; they are a later brief that adds a source.
- Suggestions anywhere outside the note editor (Search, the Actions filter).

## Tests to add

- `src/lib/suggestions.test.ts`: the table of step 2, including both Ruth cases; the 8-row cap; the 90-day window
  (a title used on 2026-08-17 and 2026-11-04, noteDate 2026-11-16, is not recurring: 08-17 is outside).
- `src/lib/notesIndex/facets.test.ts`: `namesOf` and `topicTagsOf` on `# ask @Ruth (@Ben, @ruth) => @Dana x` and
  `# (budget) y`. Each is memoised: a second call does not raise `_facetRuns`.
- `src/lib/editor/suggestions.test.ts`:
  - Every row of step 3's table.
  - Through `testEditor` with the extension and a fixed source:
    - `Tab` takes the row: `# ask @R` becomes `# ask @Ruth`.
    - `Enter` without an arrow makes a new line and leaves `@R`.
    - `ArrowDown` then `Enter` takes the second row.
    - `Escape` closes, and typing another letter does not reopen it until a new word starts.
    - Taking a topic before an existing `)` gives `(budget)`, never `(budget))`.
    - With no list open, `Tab` on a numbered list line still does what it did. Take a case from
      `numberedListKeys` tests.
- Browser: new `tests/e2e/suggestions.spec.ts`.
  - Seed two notes with `@Ruth`. In today's note type `# ask @R`: the listbox shows `@Ruth`. Press `Tab`: the line
    reads `# ask @Ruth`.
  - Check the footprint rule: the height of the line and of the next line's top is the same with the list open as
    closed.
  - Run it ten times. Also run `tests/e2e/editor-batch3.independent.spec.ts` and the numbered-list specs (find them
    with `ls tests/e2e | grep -i list`).

## Done when

- [ ] No new dependency; the list is a `showTooltip` from a `StateField`.
- [ ] Every key returns `false` when no list is open; existing editor tests pass unchanged.
- [ ] Facets, data, context and extension as in steps 1-5; not on the phone.
- [ ] Four keys in all seven languages; spec and guide updated.
- [ ] `npm run verify` and `npm run build` pass; the browser specs pass, the new one ten times.

## Report

The standard report from RULES.md, plus how long `buildSuggestions` takes on `?mock&scenario=busy-week` (measure in
a unit test with that scenario's notes, if it is easy to load; otherwise say so).
