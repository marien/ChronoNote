# Brief T1b: bullets, list continuation and the editing keys as tables that run

Run name `t1b-spec-editing` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t1b-spec-editing` · branch
`gemini/t1b-spec-editing` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. No app code changes.

## Why

Step 1 (§503) moved the numbered-list rules into `docs/spec/lists.md`, 163 rows that a test runs; every row passed.
This step does the same for the three bullets after it in `docs/spec.md` §2.4: Bulleted Lists, List Continuation and
Editing keys.

## What exists now

- `docs/spec/lists.md`: the format to follow exactly (intro, `### L1. ...` headings, a statement, then a
  `| Before | Keys | After |` table; `‸` caret, `«` `»` selection, `↵` line break, `⇥` tab).
- `src/lib/editor/specTables.test.ts`: reads every `docs/spec/*.md` via `import.meta.glob` and runs each row. Keys are
  separated by `, ` and passed to `ed.press`.
- `docs/spec.md` line 232 (`* **Bulleted Lists:**`), line 235 (`* **List Continuation:**`), line 236
  (`* **Editing keys (§467):**`, which ends with the **Words (§472, decision D11)** part).
- Rows to take from (they pass today): `src/lib/editor/editing.enter.table.test.ts` (continuation, Shift-Enter D3,
  col 0 / indent, selection, due words), `editing.nav-move.table.test.ts` (Home, Shift-Home, word moves),
  `editing.states.table.test.ts` (Mod-1..7, Mod-Shift-o on selections and numbered items),
  `editing.indent-backspace.table.test.ts` (Tab on bullets, Shift-Tab and a leading tab), `editing.input.table.test.ts`
  (typing `by` before `:date`, paste merges). Key names as those files use them (`Mod-ArrowLeft`, `Shift-Home`,
  `Mod-Backspace`, `Mod-Delete`, `Mod-1`, `Mod-Shift-s`, ...).

## What to build

1. `src/lib/editor/specTables.test.ts`: two additions to what a Keys cell may hold, so typing and pasting can be
   written as rows. Everything that already parses keeps working (the 163 rows of `lists.md` must still pass).
   - `type "by"`: types the text with `ed.type`.
   - `paste "a↵b"`: pastes the text with `ed.paste` (the notation signs are decoded inside the quotes).
   Example: `| `# task ‸:2026-11-20` | type "by" | `# task by‸:2026-11-20` |`.
2. `docs/spec/editing.md`, same intro style as `lists.md`, rules in the order of the three old bullets:
   `B1...` for Bulleted Lists, `C1...` for List Continuation, `E1...` for Editing keys (the Words part included, as
   `E` rules too). 3 to 10 rows each, at least 80 rows in all.
   Sentences that a key-press row cannot show stay as prose under their rule, with no table and a line
   `Not run as a table: <why>` (examples: the `•` glyph rendering, a wrapped line's visual row, the phone toolbar,
   `Ctrl+click`/`Alt+drag`/double-click/triple-click, right-click Paste reading HTML).
3. `docs/spec.md` lines 232, 235 and 236: replace each bullet with one or two sentences and the link
   "The rules, with examples that run as tests, are in [docs/spec/editing.md](spec/editing.md)." Leave the other
   bullets alone, including Lists on the clipboard and Suggestions while typing.

## When a row fails

A row written from the prose that fails is a finding: do not change app code and do not bend the row. Leave it out
and list it in the report with Before, Keys, expected After, what the editor gave, and the sentence.

## Out of scope

Any file under `src/` other than `specTables.test.ts`. The existing `*.table.test.ts` files stay as they are.
`docs/spec/lists.md` stays as it is.

## Tests to add

The rows themselves, and in `specTables.test.ts` one unit-style test each for the `type "..."` and `paste "..."`
parsing (a quoted text containing `, ` stays one step). Run `npx vitest run src/lib/editor/specTables`, then
`npm test` once.

## Done when

- [ ] `docs/spec/editing.md` exists, B/C/E rules in the old order, at least 80 rows, every row passing.
- [ ] The 163 rows of `lists.md` still pass; changing one expected value in `editing.md` fails exactly that test
      (undo it).
- [ ] `docs/spec.md` lines 232, 235, 236 are short with the link; no other spec bullet changed.
- [ ] No `any`, `@ts-ignore` or `@ts-expect-error` added (`npm run type-escapes` passes).
- [ ] `git diff --stat` shows only `docs/spec.md`, `docs/spec/editing.md`, `src/lib/editor/specTables.test.ts`.
- [ ] `npm run verify` passes.

## Report

The standard report from RULES.md, plus: a sentence-to-rule mapping for the three bullets, the sentences left as
prose and why, and the rows that failed (or "none").
