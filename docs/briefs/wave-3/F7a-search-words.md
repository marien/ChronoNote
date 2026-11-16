# Brief F7a: Search finds decisions, topics, emphasis and sections

Run name `f7a-search-words` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f7a-search-words` · branch
`gemini/f7a-search-words` · base `main` · browser-test port `1461` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

Search (`Ctrl+Shift+F`) finds actions, but not what a meeting decided or which agenda topics came up. Marien wants to
ask "what did we decide about the budget in the board meeting?" as `section:board is:decision budget`. Four new
words do that. They are recognised wherever Search's words are: in Search and in the Actions pane's filter. Design and
Marien's decisions (2026-11-16): `docs/design/wave3-designs.html`, section F7, questions 7.1 and 7.2.

## What exists now

- `src/lib/search.ts`:
  - `parseSearchQuery` (line 55) splits the query with `/\S+/g` (line 60). Each recognised word becomes an operator
    plus a chip (`SearchFilterChip`, line 30, `kind: "is" | "tag" | "has" | "since" | "before" | "due"`). `is:open`
    and `is:done` share the one `"is"` chip slot (lines 69-104): the later one replaces the earlier one.
  - `removeChipFromQuery` (line 249) splits on whitespace and re-parses each token.
  - `runSearch` (line 266) tests each line with `matchesLine(filename, line)` (line 288), over the open tabs' content
    (line 312) or the notes index (line 328, `linesOf(entry)`).
- `src/lib/actionDrawerRows.ts`:
  - `hasActiveFilter` (line 135) lists the operators.
  - `nodeMatchesQuery` (line 153) tests one Actions pane item. `item.header` is its section title, already passed
    through `normalizeHeaderTitle` (`src/lib/actions.ts` line 59).
- `src/lib/tokens.ts`:
  - `normalizeHeaderTitle` (line 878) strips `[HH:MM - HH:MM]` and `[CANCELED]`.
  - `titleForMatching` (line 895) also strips a leading or trailing `YYYY-MM-DD`.
  - `listSections(text)` (line 910) returns `{ title, lineIdx, open }` per setext section, in order.
  - `innermostTopicSymbol(line)` (line 528) returns `"o" | "." | ","` or null.
- `src/lib/notesIndex/facets.ts`: `sectionsOf(entry)` (line 33) is `listSections` memoised per entry, with
  `normalized` (the `normalizeHeaderTitle` of the title). Use it for index entries. Use `listSections(tab.content)`
  for open tabs.
- `src/lib/grammar/tokenize.ts`: `tokenizeLine(line)` returns tokens with `kind`. The relevant kinds are:
  - `"emphasis"`: a leading `! `, any indentation.
  - `"topic"`: `o . ,` at line start.
  - `"arrow"`: the `=> `.
  - After an arrow: `"consequence"` (`=> # x`), `"consequenceTopic"` (`=> o x`), `"assignee"` (`=> @dana`).
  - RULES.md rule 3 applies: decide what a line is through these tokens, never with a new regular expression.
- `docs/spec.md` lines 654-664 (Actions pane filter) and 805-808 (Search) list the operators.
- `website/guide.html` line 256 explains Search's operators.

## What to build

1. **Query splitting, `search.ts`.**
   - Export `splitQuery(query): { token: string; start: number; end: number }[]`.
   - Its pattern is `/section:"[^"]*"?|\S+/gi`. A `section:` value in double quotes may hold spaces; a quote left
     open runs to the end of the query.
   - `parseSearchQuery` and `removeChipFromQuery` both use it, so a quoted chip is removed whole.

2. **Four words in `parseSearchQuery`.** All are case-insensitive. Extend `SearchFilterChip.kind` with `"section"`.

   | Word | Operator | Chip label | Chip slot |
   | :--- | :--- | :--- | :--- |
   | `is:decision` | `isDecision: true` | `is:decision` | the `"is"` slot: replaces `is:open`/`is:done`/`is:topic`/`is:emphasis` before it, and is replaced by any later `is:` |
   | `is:topic` | `isTopic: true` | `is:topic` | the `"is"` slot |
   | `is:emphasis` | `isEmphasis: true` | `is:emphasis` | the `"is"` slot |
   | `section:review` | `section: "review"` | `section:review` | its own `"section"` slot; a later `section:` replaces it |
   | `section:"design review"` | `section: "design review"` | `section:"design review"` | as above |
   | `section:` or `section:""` | none; the token stays in the term | | |

   Because the four `is:` words share one slot, setting one deletes the other three `is` operators (and
   `isOpen`/`isDone`), exactly as `is:open` and `is:done` do today. A query can therefore have only one `is:`.

3. **What a line must be.** Add these to `search.ts` and export them for tests. Each tokenizes the line once.

   | Function | True when | True for | False for |
   | :--- | :--- | :--- | :--- |
   | `isDecisionLine(line)` | some `"arrow"` token is NOT directly followed by a `"consequence"`, `"consequenceTopic"` or `"assignee"` token that starts right after it (`next.from === arrow.to`), and has non-blank text after it | `. budget => we keep the Q1 numbers`, `=> moved to March`, `# ask Sam => yes, approved` | `=> # call Sam`, `=> o next week`, `=> @dana prepare`, `# ask Sam`, `=> ` (nothing after) |
   | `isTopicLine(line)` | `innermostTopicSymbol(line) !== null` | `o coffee rota (@Ruth, @Ben)`, `. budget`, `, parked item`, `# call => o follow-up topic` | `# call Sam`, `- bullet`, `plain text` |
   | `isEmphasisLine(line)` | the tokens contain an `"emphasis"` token | `! the hall is booked until 22:00`, `  ! - indented emphasis` | `a ! in the middle`, `# call!` |

4. **`section:` matching.** The section a line sits in:
   - The line must lie in a section's body: below its underline and above the next section's title line.
   - Lines above the first section, title lines and underline lines are in no section and never match `section:`.
   - The title is compared as `titleForMatching(normalizeHeaderTitle(title)).toLowerCase()`.
   - It matches when that contains the value in lower case (7.1 "Contains the word": `section:review` finds "Design
     review" and "Budget review").

   | Title | Query | Matches |
   | :--- | :--- | :--- |
   | `[10:00 - 10:30] Design review` | `section:review` | yes |
   | `[10:00 - 10:30] Design review` | `section:"design review"` | yes |
   | `Board meeting - 2026-11-03` | `section:2026` | no (the date is stripped) |
   | `[CANCELED] Board meeting` | `section:board` | yes |
   | `Weekly sync` | `section:review` | no |

5. **`runSearch`.** `matchesLine` receives the line's index and the note's sections, and applies the four operators
   with the rest (all must hold).
   - For open tabs, compute `listSections(tab.content)` once per tab.
   - For index entries, use `sectionsOf(entry)`. Its `normalized` already has `normalizeHeaderTitle` applied, so only
     `titleForMatching` is still needed.
   - Do not compute sections at all when the query has no `section:`.
   - A blank line (only whitespace) never matches. No existing operator or term could match one, but `section:` on
     its own would list every blank line of the section.

6. **Actions pane, `actionDrawerRows.ts`.**
   - `hasActiveFilter` counts the four new operators.
   - `nodeMatchesQuery`:
     - `section:` tests `titleForMatching(item.header).toLowerCase()` with the same rule.
     - The three `is:` words test the item's `line` with the functions of step 3. An action line is never a topic
       line, so `is:topic` mostly gives no rows there. That is intended; do not add a message for it.
   - `passesState` (line 213): the "Only open" toggle's rule `hasIs` stays as it is. It only looks at
     `isOpen`/`isDone`.

7. **Docs.**
   - `docs/spec.md`: add the four words to both operator lists (lines 654-664 and 805-808), each with one clause
     saying what it finds, as in the table of step 3.
   - `website/guide.html` line 256: add one sentence naming `section:`, `is:decision`, `is:topic` and `is:emphasis`,
     with the example `section:board is:decision budget`.

## Out of scope

- Saved searches and the star button: brief F7b, after this one.
- The Actions pane's scope labels, the palette, Section History.
- No new UI text. The chip labels are the operator words themselves, as today.

## Tests to add

- `src/lib/search.test.ts` (extend it):
  - `splitQuery` on `section:"design review" is:open budget` gives three tokens with correct start/end.
  - `parseSearchQuery` for every row of step 2's table, including replacement in the `"is"` slot: `is:open
    is:decision` leaves only `isDecision`, and `is:decision is:done` leaves only `isDone`.
  - `removeChipFromQuery` removes `section:"design review"` whole from `section:"design review" budget`, leaving
    `budget`.
  - Every row of step 3's table, through the three line functions.
  - `runSearch` over the mock or a stubbed index with one note. The note:

    ```
    above the first section => not in a section
    Board meeting
    ===
    . budget => we keep the Q1 numbers
    # call Sam => yes
    => # follow up
    ! the hall is booked

    Design review
    ===
    => moved to March
    ```

    0-based line indexes: 0 the first line, 1 `Board meeting`, 2 `===`, 3 `. budget ...`, 4 `# call Sam => yes`,
    5 `=> # follow up`, 6 `! the hall ...`, 7 blank (in Board meeting's body), 8 `Design review`, 9 `===`,
    10 `=> moved to March`. Expected results:

    | Query | Lines |
    | :--- | :--- |
    | `section:board is:decision` | 3, 4 |
    | `section:board is:decision budget` | 3 |
    | `is:decision` | 0, 3, 4, 10 (line 0 is in no section, but `is:decision` alone does not need one) |
    | `section:review` | 10 |
    | `section:board` | 3, 4, 5, 6 (not the blank line 7) |
    | `is:topic` | 3 |
    | `is:emphasis` | 6 |
- `src/lib/actionDrawerRows.test.ts`: `nodeMatchesQuery` with `section:review` against items whose `header` is
  `Design review` (true) and `Weekly sync` (false); `hasActiveFilter` is true for each new word on its own.
- Browser: `tests/e2e/search-and-history.spec.ts` gets one test. Seed a note like the one above, open Search, type
  `section:board is:decision`, and expect two results and the chips `section:board` and `is:decision`.

Run `tests/e2e/search-and-history.spec.ts`, `tests/e2e/action-drawer-filters.spec.ts` and
`tests/e2e/drawer-filters.independent.spec.ts`.

## Done when

- [ ] `splitQuery` exists and both `parseSearchQuery` and `removeChipFromQuery` use it.
- [ ] The four words parse as in step 2, with the shared `"is"` slot.
- [ ] `isDecisionLine`, `isTopicLine`, `isEmphasisLine` use `tokenizeLine` / `innermostTopicSymbol`, no new regex
      on note lines.
- [ ] Search and the Actions pane filter apply all four; sections are not computed without `section:`.
- [ ] spec.md and guide.html updated as in step 7.
- [ ] The tests above pass; `npm run verify` and `npm run build` pass; the three spec files pass.

## Report

The standard report from RULES.md.
