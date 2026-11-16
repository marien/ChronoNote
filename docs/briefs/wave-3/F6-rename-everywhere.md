# Brief F6: Rename a section title, @name or (topic) in every note

Run name `f6-rename-everywhere` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f6-rename-everywhere` · branch
`gemini/f6-rename-everywhere` · base `main` after F5 is merged · browser-test port `1466` · model Gemini 4 Hydrogen (Google-Sonnet quota used up until 2026-11-22)

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. This brief writes many notes at once: data
safety comes before everything else. When in doubt, skip a note and say so; never write a note whose text you did
not read in this same step.

## Why

A meeting gets a new name ("Coffee rota" becomes "Hospitality rota"), a person's name was spelled two ways, or a
topic tag changes. Today Marien edits note by note, and Section History, Search and the Actions filter lose the
thread. One command renames the thing in every note, after showing every line it will change. Design and decisions
(2026-11-16): `docs/design/wave3-designs.html`, section F6 (lines 160-179), questions 6.1-6.3.

## What exists now

- **Notes:** `notesIndex` (`src/lib/notesIndex/`): `get(notesIndex).entries`, `isScratchpadKey`,
  `dateISOOfFilename`, `linesOf`. Call `await ensureLoaded()` first.
- **Section titles:**
  - `listSections(text)` (`src/lib/tokens.ts` line 910) gives `{ title, lineIdx }`.
  - `normalizeHeaderTitle` (line 878) strips a leading `[HH:MM - HH:MM]` and `[CANCELED]`.
  - `titleForMatching` (line 895) strips a leading or trailing `YYYY-MM-DD` with its separator.
  - Section History matches on `titleForMatching(normalizeHeaderTitle(title)).toLowerCase()` (e.g. `copyForward.ts`
    line 62).
  - `underlineFor(title)` (`src/lib/sectionFormat.ts`) is `=` repeated `max(3, length)`.
- **Tokens:** `tokenizeLine(line)`. `"assignee"` tokens are `@name` (any position), and `"topicTag"` tokens are
  `(topic)` right after an action or topic symbol. Use their `from`/`to`: never find names or topics with a new regex
  (rule 3).
- **Writing, `src/lib/persistence.ts`:**
  - `flushAllPendingSaves()` (line 222);
  - `updateNoteOnDisk(filename, change, { keepVersion: true })` (line 325): reads with the hash, writes with
    `expectedHash`, retries, and keeps the old text as an earlier version;
  - `writeTabContentAndWait(tabId, newText, restoreTo, { keepVersion: true })` (line 543).
  - The phone companion's `writeNoteWithUpdate` (`src/lib/phoneInbox.ts` lines 172-205) is the model for "open tab
    or file".
- **Editor:** `editorApi` (`src/lib/stores.ts` lines 557-595) has `replaceLines` (one transaction for a range). It
  has no multi-range edit yet.
- **Toast:** `showToast(msg, { action })` (`stores.ts` line 523). The whole toast is clickable when it has an action
  (`App.svelte` line 782). It shows for 2.4 s unless the text is long.
- **Line menu:** `src/lib/components/EditorContextMenu.svelte`. F5 added "Show @name" there: put the new item next
  to it. `lineSectionRole(lines, lineIdx)` (`tokens.ts` line 872) tells a title line.
- **Palette commands:** `commandItems()` in `src/lib/commandPalette.ts`.

## What to build

1. **The pure rename, new `src/lib/renameEverywhere.ts`.**
   - `type RenameTarget = { kind: "title" | "name" | "topic"; from: string; to: string }`.
   - `renameInText(text, target, opts: { titles: boolean }): { text: string; lines: { lineIdx, before, after }[] }`.
   - **Title** (only when `opts.titles`):
     - Applies to every section title line whose `titleForMatching(normalizeHeaderTitle(title)).toLowerCase()`
       equals that of `from`.
     - Only the core title changes: what the two functions strip in front (time, `[CANCELED]`, a leading date) and
       at the end (a trailing date with its separator) stays exactly as it was, and the core becomes `to`.
     - The underline: when it was exactly `underlineFor(old title line text)`, it becomes `underlineFor(new title
       line text)`; otherwise it stays.
   - **Name:** every `"assignee"` token whose name equals `from` case-insensitively becomes `@` + `to`.
   - **Topic:** every `"topicTag"` token whose inner text equals `from` case-insensitively becomes `(` + `to` + `)`.
   - Everything else in the line stays byte for byte.

   | Line(s) before | Target | After |
   | :--- | :--- | :--- |
   | `[10:00 - 10:30] Coffee rota` / `===========================` | title Coffee rota → Hospitality rota | `[10:00 - 10:30] Hospitality rota` / `================================` (it was the exact underline) |
   | `Coffee rota - 2026-10-30` / `===` | title → Hospitality rota | `Hospitality rota - 2026-10-30` / `===` (the underline was not exact: kept) |
   | `[CANCELED] coffee ROTA` / `=====` | title → Hospitality rota | `[CANCELED] Hospitality rota` / `=====` |
   | `Coffee rota planning` / `===` | title → Hospitality rota | unchanged (another title) |
   | `# ask @dana => @Dana x (@Ben, @DANA)` | name Dana → Dana-S | `# ask @Dana-S => @Dana-S x (@Ben, @Dana-S)` |
   | `# call @Danal` | name Dana → Dana-S | unchanged |
   | `# (budget) send` | topic budget → finance | `# (finance) send` |
   | `plain (budget) text` | topic budget → finance | unchanged (not a topic tag) |

   - **Validation:** `validTarget(target)`.
     - A name must be one or more `NAME_CHAR`s (`src/lib/grammar/symbols.ts`). A leading `@` typed by the user is
       dropped first.
     - A topic must be non-empty, with no whitespace and no `(` or `)`.
     - A title must be non-empty after trimming, on one line, and must not start with `[` or a date (it would then be
       read as a prefix).
     - `to` must differ from `from` in at least one character (a change of case only is allowed).

2. **The plan, same file.** `planRename(target, todayISO)`:
   - Goes over every non-scratchpad index entry.
   - Titles are not renamed in notes dated after `todayISO` (6.3: calendar sync owns those). Names and topics are
     renamed in every note.
   - Returns the notes with at least one changed line: `{ filename, dateISO, textBefore, textAfter, lines }`, newest
     note first.

3. **The dialog, new `src/lib/components/modals/RenameModal.svelte`** (a normal dialog, not a pane).
   - Two fields, From (read-only, as picked) and To (focused, prefilled with From, all selected).
   - Below them: "{lines} lines in {notes} notes". The plan is rebuilt 150 ms after typing stops.
   - The list: one row per note, with a tick (6.1, ticked by default), the date, and each changed line drawn with
     the old part struck through and the new part marked, as in the design's example.
   - Buttons: Cancel, and "Rename in {n} notes", where n counts the ticked notes. It is disabled when n is 0 or the
     target is not valid. An invalid To shows one muted line saying why.
   - `Esc` cancels. `Enter` in the To field presses the button.

4. **Applying, same file as step 1** (`applyRename(plan, ticked)`), one note at a time:
   1. `await flushAllPendingSaves()`.
   2. Write each ticked note:
      - **Open tab:** read the tab's current content. When it differs from the plan's `textBefore`, skip the note.
        Otherwise:
        - Save `textBefore` as an earlier version, then the new text: `writeTabContentAndWait(tab.id, textAfter,
          textBefore, { keepVersion: true })`.
        - When the tab is the active one, the editor change must be one undo step (the design says so). Add
          `editorApi.applyLineEdits(edits: { lineIdx, text }[])`, which dispatches ONE transaction replacing those
          lines (rule 5), and use it for the active tab in place of the outside `setContent`. Then await the save
          with `keepVersion`.
        - Name in the report how you made sure the earlier version holds `textBefore`, not the new text.
      - **Closed note:** `updateNoteOnDisk(filename, (current) => current === textBefore ? textAfter : current,
        { keepVersion: true })`. When `current` differs, nothing is written: count it as skipped.
   3. Collect `{ renamed: filename[], skipped: filename[] }`.
   4. After the run:
      - Show the toast "Renamed in {count} notes. Click to undo." (6.2), with an `action` that undoes it. Add
        `durationMs` to `ToastOptions` and give this toast 10 s.
      - When notes were skipped, show the toast "Skipped {count} notes that changed meanwhile: {dates}" after it,
        or as its second sentence.
   - **Undo:** the same steps in reverse for every renamed note. A note is put back to `textBefore` only when its text
     is still `textAfter`; otherwise it is skipped and named. Undo also keeps an earlier version.

5. **Starting it.**
   - Line menu "Rename everywhere…":
     - on a section title line (title target, `from` = the core title);
     - on an `@name` at `col` (name target);
     - on a topic tag at `col` (topic target).
     - Only one item shows: the token under `col` wins, then the title.
   - Palette commands:
     - "Rename section everywhere…" opens the dialog for the caret's section;
     - "Rename name everywhere…" and "Rename topic everywhere…" open it for the token at the caret.
     - Each is disabled when there is nothing to rename.
   - No shortcut.

6. **Text in all seven languages** (Dutch in brackets):
   - "Rename everywhere…" (Overal hernoemen…)
   - "Rename section everywhere…", "Rename name everywhere…", "Rename topic everywhere…" (Sectie overal hernoemen…,
     Naam overal hernoemen…, Onderwerp overal hernoemen…)
   - "From" (Van), "To" (Naar)
   - "{lines} lines in {notes} notes" (with singular forms: "1 line", "1 note") ({lines} regels in {notes} notities;
     1 regel, 1 notitie)
   - "Rename in {n} notes" (Hernoemen in {n} notities)
   - "Cancel" (reuse the common key if there is one)
   - The invalid-To reasons, one per rule of step 1
   - "Renamed in {count} notes. Click to undo." (Hernoemd in {count} notities. Klik om terug te draaien.)
   - "Undone in {count} notes." (Teruggedraaid in {count} notities.)
   - "Skipped {count} notes that changed meanwhile: {dates}" ({count} notities overgeslagen die intussen veranderd
     zijn: {dates})

7. **Docs.**
   - `docs/spec.md`: a "Rename everywhere" entry with the rules of steps 1, 2 and 4.
   - `website/guide.html`: one paragraph.

## Out of scope

- Renaming in Section History's own state, calendar sync's memory or saved searches.
- Note filenames.
- Undo after the toast is gone: Earlier versions remain the way back then.

## Tests to add

- `src/lib/renameEverywhere.test.ts`:
  - Every row of step 1's table.
  - Validation for each rule.
  - `planRename` with today 2026-11-16 and a note dated 2026-11-20 holding the title: the title is not renamed there,
    but a name on that note is.
  - Scratchpads are left out.
  - Newest-first order.
- `applyRename` against the mock backend:
  - A closed note changed between plan and apply is skipped and named.
  - The earlier versions (`list_versions`) of each renamed note hold the old text.
  - Undo puts back every note whose text is still the renamed text, and skips one that was edited after the rename.
- `src/lib/testing` editor test: `applyLineEdits` with three edits is one undo step: one `undo` restores all three
  lines.
- Browser: new `tests/e2e/rename-everywhere.spec.ts`.
  - Seed three notes with section `Coffee rota` (one of them dated tomorrow) and one `@dana`.
  - Right-click the title in today's note, choose "Rename everywhere…", and type `Hospitality rota`. The dialog says
    2 notes (tomorrow's is left alone). Untick one note and rename.
  - Today's note shows the new title and Ctrl+Z brings the old one back.
  - The unticked note is unchanged.
  - The toast's click undoes the rename in the note that was renamed.
  - Run it ten times.
  - Also run `tests/e2e/search-and-history.spec.ts`.

## Done when

- [ ] Renames use token positions and the title functions; no new regex decides what a line is.
- [ ] Every written note gets an earlier version holding its text before the rename; a note changed meanwhile is
      never written.
- [ ] Future-dated notes keep their titles; names and topics change everywhere.
- [ ] The active note's change is one undo step; the toast undoes the whole rename.
- [ ] Texts in all seven languages; spec and guide updated.
- [ ] `npm run verify` and `npm run build` pass; the browser specs pass, the new one ten times.

## Report

The standard report from RULES.md, plus how `applyLineEdits` and the earlier version of the active note interact
(what is on disk, in which order).
