# Brief T1d: the token rules as tables that run

Run name `t1d-spec-tokens` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t1d-spec-tokens` · branch
`gemini/t1d-spec-tokens` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. No app code changes.

## Why

Steps 1-3 (§503, §506, §510) turned the list, editing-key and clipboard rules into tables a test runs; the clipboard
tables found four real bugs (§517). This step does the same for the token rules in `docs/spec.md` §2.2 "Token
Semantics & Dynamic Glyph Replacement" (line 42 to about 227): which text on a line is recognised as which token
(`# v > x o . , - * => ! @name (topic)`, titles and underlines, links, due dates, and the cases where a symbol stays
plain text). The 2026-11-18 mutation run scored `src/lib/tokens.ts` at 83.7 % with 267 survivors, mostly regex
anchors and boundary comparisons: rows at those boundaries are what kills them.

## What exists now

- `src/lib/tokens.ts` (1,081 lines): `tokenizeNoteLine` and helpers (`isTitleLine`, `isSetextUnderline`,
  `parseNumberedItem`, `innermostActionSymbol`, `leadingTopicTag`, `countActions`, ...). Tests beside it
  (`src/lib/tokens*.test.ts`).
- `docs/spec/lists.md`, `docs/spec/editing.md`, `docs/spec/clipboard.md`: the style to follow (intro with the
  notation, `### X1. ...` rule headings, one statement, a table of 3-10 rows).
- `src/lib/editor/specTables.test.ts` runs `| Before | Keys | After |` tables; `src/lib/clipboardSpecTables.test.ts`
  runs `| HTML | Text |` and `| Text | HTML |`. Both read `docs/spec/*.md` with `import.meta.glob` and `?raw`, and
  ignore table shapes they do not know (check that this still holds for your new shape).

## What to build

1. `docs/spec/tokens.md`: rules `N1...` in the order of §2.2's prose, one per sentence or group of sentences that a
   line-in, tokens-out table can show. Table shape `| Line | Tokens |`: Line in a code span (use `·` for a space where
   it matters, say so in the intro); Tokens a short, readable notation of what `tokenizeNoteLine` returns (for example
   `action:open 0-2 · text 2-9`, or whatever reads best for its real output: decide once, describe it in the intro,
   keep it stable). `—` means no tokens. At least 80 rows. Put rows on the boundaries: a symbol at column 0 vs.
   indented, symbol with and without its space, a symbol inside a word, `=>` with and without `@name`, a `(topic)` at
   the start vs. later, titles vs. their underlines, due dates at the edges of their format.
   Sentences about rendering, selection, carets or CSS that a table of tokens cannot show stay prose with
   `Not run as a table: <why>`.
2. `src/lib/tokenSpecTables.test.ts` (new): runs every `| Line | Tokens |` row through `tokenizeNoteLine` (via one
   small formatter that produces the notation), one Vitest test per row named `<rule id> row <n>`.
3. `docs/spec.md` §2.2: keep the prose (it says more than the tables), and add one line under the heading: "The token
   rules, with examples that run as tests, are in [docs/spec/tokens.md](spec/tokens.md)." No other spec change.
4. Run `npm run mutation:one -- src/lib/tokens.ts` after, and report the score (83.7 % before).

## When a row fails

A row written from the prose that fails is a finding: do not change app code and do not bend the row. Leave it out and
report the input, the expected tokens, what the function gave, and the sentence.

## Out of scope

Any file under `src/` other than the new test. The other spec files and spec tests stay as they are.

## Done when

- [ ] `docs/spec/tokens.md` exists, at least 80 rows, every row passing; changing one expected value fails exactly
      that test (undo it).
- [ ] The existing spec rows (lists, editing, clipboard) still pass.
- [ ] `npm run type-escapes` passes; `git diff --stat` shows only `docs/spec.md`, `docs/spec/tokens.md`,
      `src/lib/tokenSpecTables.test.ts`.
- [ ] `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the notation chosen, a sentence-to-rule mapping, the sentences left as prose
and why, the mutation score after, and the rows that failed (or "none").
