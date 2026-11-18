# Brief M2: tests for the clipboard list conversion gaps

Run name `m2-mutation-richclipboard` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\m2-mutation-richclipboard` ·
branch `gemini/m2-mutation-richclipboard` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **Tests only: no app code changes.**

## Why

The first full mutation run (`docs/design/mutation-gaps-2026-11-18.md`) scored `richClipboard.ts` at 63.0 %: 278 faults
survived and 121 sit in code no test runs. This is the code that turns a list copied from Word, Outlook, Teams, Google
Docs or a browser into note text, and back. `clipboardPaste.ts` (56.4 %, 6 survived, 11 untested) decides between HTML
and plain text.

## What exists now

- `src/lib/richClipboard.ts`: `htmlToNoteText` and `noteTextToHtml`. Tests: `src/lib/richClipboard.test.ts`,
  `src/lib/richClipboard.b4.independent.test.ts`, and the 86 spec rows in `docs/spec/clipboard.md` run by
  `src/lib/clipboardSpecTables.test.ts` (§510).
- `src/lib/editor/clipboardPaste.ts`, tests beside it.
- Mutation tools (local): `npm run mutation:one -- <file>` then `npm run mutation:summary`. One file takes 10-30 min.

## What to build

1. Run `npm run mutation:one -- src/lib/richClipboard.ts` and `npm run mutation:one -- src/lib/editor/clipboardPaste.ts`
   first, and keep both summaries.
2. Kill survivors that are real rules, preferring **new rows in `docs/spec/clipboard.md`** (under the right P or K
   rule, same notation) because they document the rule as well; use a unit test in
   `src/lib/richClipboard.mutation.test.ts` only for what a row cannot express. Start with:
   - the list-continuation decision around line 80 (same indent, `ol`, the item type): when a list continues and when
     it starts again;
   - the 121 untested faults: find which inputs reach that code (Word marker parsing, `aria-level`, `<pre>` in items)
     and add rows for them;
   - `clipboardPaste.ts`: the HTML-or-plain decision for each kind of clipboard content.
3. Run the two mutation commands again and report before and after.

## When a survivor cannot be killed

Equivalent survivors (the change cannot alter behaviour): list them with one line each on why; no forced tests. If a
row shows the app is **wrong**, do not fix the app and do not bend the row: leave it out and report the input, the
expected output, what the function gave, and the rule.

## Out of scope

Any file under `src/` that is not a test file; `docs/spec/clipboard.md` only gains rows (no rule text rewritten, except
a statement that must name a newly covered case). Other modules of the mutation report.

## Done when

- [ ] New rows and tests pass; the 427 existing spec rows still pass.
- [ ] Scores before and after for both files are in the report; the line-80 survivors are killed or listed as
      equivalent.
- [ ] `git diff --stat` shows only test files and `docs/spec/clipboard.md`.
- [ ] `npm run type-escapes` passes; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the before/after scores, the equivalent survivors with reasons, and any app
bug found (or "none").
