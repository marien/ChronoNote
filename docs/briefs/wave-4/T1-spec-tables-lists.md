# Brief T1: the numbered-list rules as tables that run

Run name `t1-spec-tables` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t1-spec-tables` · branch
`gemini/t1-spec-tables` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. This brief changes no app code: only a new
spec file, one new test file and one paragraph of `docs/spec.md`.

## Why

The numbered-list rules are one paragraph of about 6,000 characters in `docs/spec.md` §2.4. Nobody can check a rule
against it without interpreting prose, and during the editor review three rules written that way were wrong. When
this is done, the rules live in `docs/spec/lists.md` as short sentences, each followed by a table of
before / keys / after, and a test reads that file and runs every row against the real editor. Spec and test are then
the same text.

## What exists now

- `docs/spec.md` line 233: the bullet that starts `* **Numbered Lists:**`. It is the only text you replace.
- `src/lib/testing/testEditor.ts`: `createTestEditor({ doc })` parses `|` as the caret and `[...]` as a selection
  (anchor at `[`); `ed.press(key)`, `ed.caret()` (text with `|` or `[...]` markers), `ed.text()`, `ed.undo()`.
- The cases to take rows from (they already pass): `src/lib/editor/editing.enter.table.test.ts` (rules marked
  `Spec 2.4`, from line 119 on), `src/lib/editor/editing.indent-backspace.table.test.ts` (from line 138, and from 639).
  Copy rows from there rather than inventing them. Do the runner the way `runKeyTable` in
  `editing.enter.table.test.ts` lines 28-43 does it.

## What to build

1. `docs/spec/lists.md`. A short intro (three sentences: what the file is, how to read a row, that
   `src/lib/editor/specTables.test.ts` runs every row). Then one section per rule:

   ```markdown
   ### L1. Enter continues a numbered item with the next number

   The parents and the delimiter are kept.

   | Before | Keys | After |
   | :--- | :--- | :--- |
   | `1. one‸` | Enter | `1. one↵2. ‸` |
   | `2) two‸` | Enter | `2) two↵3) ‸` |
   | `1.2. sub‸` | Enter | `1.2. sub↵1.3. ‸` |
   ```

   Notation inside the backticks, so that a markdown table can hold it:

   | Sign | Means | Becomes for `createTestEditor` |
   | :--- | :--- | :--- |
   | `‸` | the caret | `\|` |
   | `«` and `»` | selection anchor and head | `[` and `]` |
   | `↵` | line break | `\n` |
   | `⇥` | a tab character | `\t` |

   Spaces are written as spaces. The Keys cell holds one key or several separated by `, ` (`Tab, Tab`), with the key
   names `press` accepts (`Enter`, `Shift-Enter`, `Tab`, `Shift-Tab`, `Backspace`).

   Cover every sentence of the old paragraph with a rule (L1, L2, ...), in the paragraph's order, each with 3 to 10
   rows: what a numbered marker is (`1.`, `2)`, `1.1.`, `1.2.3)`; `3.5 hours` is prose: a row where `Enter` on it does
   NOT continue a list), Enter, Enter on an item with sub-items, Shift-Enter, Tab (new group, continuing a group,
   dotted under a numbered parent, first item of a group moving the whole group, the bullet case), Shift-Tab, a
   selection with Tab, Backspace (empty sub-item, at text start, the second Backspace), Enter on an empty sub-item, and
   the rest of the paragraph to its end. At least 60 rows in all.

2. `src/lib/editor/specTables.test.ts` (`// @vitest-environment jsdom`). Reads every `*.md` in `docs/spec/` (with
   `fs`, path from the repo root), finds each `###` heading and the table under it whose header is exactly
   `| Before | Keys | After |`, and makes one `it` per row named `<file> <heading>: <Before> + <Keys>`. Per row: open
   the editor with Before (converted), press the keys in order, `expect(ed.caret()).toBe(After converted)`. Then,
   when the text changed, undo at most once per key until the text equals Before's text, and expect it to. A table
   row the parser cannot read (wrong number of cells, a cell without backticks where one is needed) fails its own
   test with the line number, never silently skipped. Also one test that fails when `docs/spec/` holds no rows.

3. `docs/spec.md` line 233: replace the whole `* **Numbered Lists:**` bullet with one bullet of at most three
   sentences: what a numbered marker is, and "The rules for Enter, Shift+Enter, Tab, Shift+Tab and Backspace, each
   with examples that run as tests, are in [docs/spec/lists.md](spec/lists.md)." Leave every other bullet alone.

## When a row fails

A row you wrote from the prose that fails against the editor is a finding, not something to fix. Do not change app
code and do not bend the row to whatever the editor does. Leave that row out of `lists.md`, and list it in your
report with Before, Keys, the After you expected, what the editor gave, and the sentence it came from.

## Out of scope

- Any file under `src/` other than the new test. The existing `*.table.test.ts` files stay exactly as they are (no
  rows removed or moved: the test guard checks this).
- Other spec sections (bullets, list continuation, editing keys, paste). They follow in later steps.

## Tests to add

`src/lib/editor/specTables.test.ts` as above. Run `npx vitest run src/lib/editor/specTables` and the whole of
`npm test` once at the end.

## Done when

- [ ] `docs/spec/lists.md` exists, rules L1... in the old paragraph's order, at least 60 rows, every row passing.
- [ ] `npx vitest run src/lib/editor/specTables` passes and its test count equals the number of rows plus the
      "no rows" test.
- [ ] Breaking one row by hand (change an expected number) makes exactly that test fail; undo the change.
- [ ] `docs/spec.md` has the short bullet with the link; `git diff --stat` shows no file under `src/` except the new test.
- [ ] `npm run verify` passes.

## Report

The standard report from RULES.md, plus: a list mapping each sentence of the old paragraph to its rule number, and
the rows that failed (see "When a row fails"), or "none".
