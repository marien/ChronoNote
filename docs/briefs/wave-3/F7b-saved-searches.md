# Brief F7b: Saved searches

Run name `f7b-saved-searches` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f7b-saved-searches` · branch
`gemini/f7b-saved-searches` · base `main` after F7a is merged · browser-test port `1462` · model Gemini 4 Hydrogen (Google-Sonnet quota used up until 2026-11-22)

Read `docs/briefs/RULES.md` in your worktree first. It applies in full; rule 4 (storage commands in all three
backends) matters most here.

## Why

Marien repeats the same searches (`has:@dana is:open`, `section:board is:decision`). A star in Search saves the query;
saved searches appear as chips under the search field and in the command palette. They live in the notes folder, so
they follow him to the other laptop and the web app through OneDrive. Design and decisions (2026-11-16):
`docs/design/wave3-designs.html`, F7, question 7.3 ("In the notes folder").

One change against the design page: the file is `.chrononote-searches.txt` (plain text, one search per line), not
`.json`. The web app's OneDrive sync merges text files line by line (`merge3`), so two laptops that each save a
search merge cleanly.

## What exists now

- Search modal: `src/lib/components/modals/SearchModal.svelte`.
  - `query` (line 35) and `scope` (line 37) are its state.
  - The input row is lines 230-253: icon, input, counter, close button.
  - The filter chips row is lines 254-270 (`.search-chips-row`, `.search-chip`, `.chip-remove-btn`). Reuse these
    classes for the saved chips.
  - `onMount` (line 59) focuses the input.
  - `openCrossTabSearch()` in `src/lib/search.ts` (line 261) clears results and sets `modal` to `"search"`.
- Command palette: `src/lib/commandPalette.ts`.
  - `buildPaletteResults(query)` (line 566); the default mode is from line 695 (`commandItems()` + `openTabItems()`).
  - Group names map to i18n keys at line 83 (`"Open actions": "commandPalette.group.openActions"`).
  - `openTabItems()` (line 542) is the pattern for a dynamic group.
- Storage commands. Follow `read_phone_inbox`, which is the closest shape:
  - Rust `src-tauri/src/storage.rs` line 1254 (`read_phone_inbox_at`, with a size cap) and line 1246 (an
    `atomic_write`).
  - Commands in `src-tauri/src/lib.rs` line 188.
  - Contract `src/lib/tauriCommands.ts` line 72; wrapper `src/lib/tauriApi.ts` line 233.
  - Mock `src/lib/testing/mockBackend.ts` line 1232.
  - Web `src/lib/webapp/webBackend.ts` line 699. The web app keeps folder files in the active notes store; see how
    `.agenda.json` is read at line 788 (`getActiveNotesStore()`, `idbGet<StoredNote>`).
- Conformance cases: `src/lib/conformance/storage-cases.json` (`{ name, steps: [{ cmd, args, expect }] }`), run
  against every backend.
- Web OneDrive sync: `src/lib/webapp/webOneDriveSync.ts`.
  - `isSyncableFile` (line 76) decides which files sync.
  - The divergent branch is lines 783-822: `merge3`, else a held conflict.
  - The push phase is lines 845+.
  - The web app's `list_note_files` (webBackend line 345) filters with `isValidNoteFilename`, so the new file never
    shows as a note.

## What to build

1. **Storage: two commands in all three backends**, plus `tauriApi.ts` and the contract.
   - `read_saved_searches` returns `string | null`: the text of `<notes folder>/.chrononote-searches.txt`, or null
     when the file is missing. Files over 64 KB are an error (`"saved searches too large"`).
   - `write_saved_searches { content: string }` writes it atomically.
   - Web: the same key `.chrononote-searches.txt` in `getActiveNotesStore()`, stored like a note
     (`{ content, contentHash, modifiedMs }`, the hash as the web backend computes it for notes), so the OneDrive
     push phase uploads it.
   - Conformance cases:
     - read before any write → null;
     - write then read → the same text;
     - the file is not listed by `list_note_files`.

2. **OneDrive (web app only), `webOneDriveSync.ts`.**
   - `isSyncableFile` also accepts `.chrononote-searches.txt`.
   - In the divergent branch, for this one file only, never hold a conflict. The result is the local lines in their
     order, then the remote lines that are not among them; write it locally like a clean merge.
   - The desktop app needs nothing: the OneDrive client syncs the folder.

3. **The model, new `src/lib/savedSearches.ts`.**
   - `normalizeQuery(q)`: trim, and collapse runs of whitespace to one space. Inside a quoted `section:"..."` the
     spaces are kept as they are; use `splitQuery` from F7a and join the tokens with one space.
   - `parseSavedSearches(text)`: lines, each normalised, blank lines dropped, duplicates dropped (the first one is
     kept).
   - `serializeSavedSearches(list)`: lines joined with `\n` and a final `\n`.
   - A store `savedSearches` (writable `string[]`) and:
     - `loadSavedSearches()` reads the file into the store. A read error leaves the store as it was and logs once.
     - `toggleSavedSearch(query)` adds the normalised query at the end, or removes it when it is there, writes the
       file, and updates the store.
     - `removeSavedSearch(query)`.
   - At most 30 saved searches. Adding a 31st drops the first (oldest) one.

   | File text | `parseSavedSearches` |
   | :--- | :--- |
   | `has:@dana is:open\n\nsection:"design review"   is:decision\nhas:@dana  is:open\n` | `["has:@dana is:open", "section:\"design review\" is:decision"]` |
   | `` (empty) or null | `[]` |

4. **Search modal.**
   - **Star button.** A star icon button sits between the counter and the close button. The `Icon` component may
     already have a star; if not, add one the way the others are drawn.
     - It is shown only when `query.trim()` is not empty.
     - It is filled when `normalizeQuery(query)` is in `$savedSearches`, otherwise outlined.
     - Its `aria-label` and tooltip: "Save this search", or "Remove from saved searches" when filled.
     - Clicking it calls `toggleSavedSearch(query)`, then puts the focus back on the input.
   - **Saved chips.**
     - Under the input row (above the filter chips), a row of chips, one per saved search, in file order. The row is
       shown only when there is at least one saved search.
     - Each chip is a `<button>` showing the query text, with `aria-label` "Saved search: {query}".
     - Click: `query` becomes that text and the input gets the focus (the scope stays).
     - Right-click (`contextmenu`, default prevented) or `Delete` while the chip has focus: `removeSavedSearch`.
     - Long chips are cut with an ellipsis at 24 ch; the full text is in the tooltip.
   - `onMount`: `loadSavedSearches()`.
   - **Opening with a query.**
     - `openCrossTabSearch(initial?: { query: string; scope: "open" | "all" })` stores `initial` in a module-level
       variable (or a small store) that the modal reads once in `onMount`.
     - With `scope: "all"`, the modal runs the same path as clicking "All files" (`setScope("all")`), so the notes
       index is loaded first.

5. **Command palette.**
   - In the default mode (no prefix), a group "Saved searches" lists every saved search whose text fuzzy-matches the
     term, after "Open tabs".
     - Label: the query. Hint: "Saved search".
     - `run`: `openCrossTabSearch({ query, scope: "all" })`.
   - With an empty term, the group shows all saved searches.
   - Load the store when the palette opens (the palette modal's `onMount`). `buildPaletteResults` reads the store
     synchronously.
   - Add the group to the map at line 83.

6. **Text in all seven languages** (RULES.md rule 6), new keys:
   - `searchModal.saveSearch` "Save this search"
   - `searchModal.unsaveSearch` "Remove from saved searches"
   - `searchModal.savedSearchChip` "Saved search: {query}"
   - `searchModal.savedSearchesRow` "Saved searches" (the row's `aria-label`)
   - `commandPalette.group.savedSearches` "Saved searches"
   - `commandPalette.savedSearchHint` "Saved search"
   - Dutch: "Deze zoekopdracht bewaren", "Uit bewaarde zoekopdrachten halen", "Bewaarde zoekopdracht: {query}",
     "Bewaarde zoekopdrachten", "Bewaarde zoekopdrachten", "Bewaarde zoekopdracht".

7. **Docs.**
   - `docs/spec.md`, Cross-Tab Search (around line 802): one paragraph on saved searches (the star, the chips,
     right-click or Delete removes, the palette group, the file and its format, the 30 limit).
   - `website/guide.html`, next to the search operators: one sentence.

## Out of scope

- The Actions pane's filter does not get saved searches.
- The phone layout gets the chips as they come (they wrap); no extra work for touch.
- No shortcut.

## Tests to add

- `src/lib/savedSearches.test.ts`:
  - The table of step 3.
  - `normalizeQuery` keeps `section:"design  review"` (two spaces inside the quotes) as it is.
  - `toggleSavedSearch` adds, then removes.
  - The 31st entry drops the first.
  - A read error leaves the store unchanged.
- `src/lib/webapp/webOneDriveSync.test.ts`: `isSyncableFile(".chrononote-searches.txt")` is true. A divergent
  `.chrononote-searches.txt` (base `a\n`, local `a\nb\n`, remote `a\nc\n`) ends as `a\nb\nc\n` locally with no
  conflict held. Follow the existing divergent tests in that file.
- The conformance cases of step 1 (they run against the mock and the web backend in Vitest, and against Rust in
  `cargo test`; check how the existing cases are run in both).
- Rust unit tests in `storage.rs`: missing file → None; round trip; over 64 KB → error.
- Browser: new `tests/e2e/saved-searches.spec.ts`:
  1. Open Search, type `is:open`, click "Save this search", and see a chip `is:open`.
  2. Clear the input, click the chip: the input reads `is:open`.
  3. Close Search. Open the palette (`Ctrl+K` or the app's palette shortcut; see `tests/e2e/command-palette.spec.ts`),
     type `is:op`, choose the "Saved searches" row: Search opens with `is:open` on "All files".
  4. Right-click the chip: it disappears.

  Run it ten times (`--repeat-each=10`). Also run `tests/e2e/search-and-history.spec.ts` and
  `tests/e2e/command-palette.spec.ts`.

## Done when

- [ ] Both commands exist in Rust, mock, web, `tauriApi.ts` and the contract; the conformance cases pass on all.
- [ ] The web sync syncs the file and unions it on divergence; desktop needs no sync code.
- [ ] Star, chips, palette group and the opening-with-a-query path work as in steps 4-5.
- [ ] Six keys in all seven languages; the dictionary test passes.
- [ ] spec.md and guide.html updated.
- [ ] `npm run verify` (it runs `cargo test` and clippy when Rust changed) and `npm run build` pass; the three spec
      files pass, the new one ten times.

## Report

The standard report from RULES.md, plus which `Icon` you used or added for the star.
