# Brief M6: the tokenizer in the mutation set, and tests for its gaps

Run name `m6-mutation-tokenizer` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\m6-mutation-tokenizer` · branch
`gemini/m6-mutation-tokenizer` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **Tests only: no app code changes**, plus the
one config line below.

## Why

The mutation set (`stryker.config.mjs`, §512) lists `src/lib/tokens.ts`, but the tokenizer itself,
`tokenizeNoteLine`, lives in `src/lib/grammar/tokenize.ts` (453 lines), which no mutation run has measured. Every
glyph, every action count and every view depends on it. T1d (§518) added 165 spec rows in `docs/spec/tokens.md` that
run through it; this run measures how much they and the existing tests catch, and fills the gaps.

## What exists now

- `src/lib/grammar/tokenize.ts`, `symbols.ts`, `glyphs.ts`; tests beside them (`tokenize.test.ts`,
  `tokenize.property.test.ts`, `golden.test.ts`, `dueTokens.independent.test.ts`, `forwardLink.independent.test.ts`,
  `emphasisBullet.test.ts`), and `src/lib/tokenSpecTables.test.ts` with `docs/spec/tokens.md` (notation in its
  intro).
- Mutation tools (local): `npm run mutation:one -- <file>`, then `npm run mutation:summary`. One file takes 20-40 min.

## What to build

1. Add `"src/lib/grammar/tokenize.ts"` to `mutate` in `stryker.config.mjs` (next to `tokens.ts`).
2. Run `npm run mutation:one -- src/lib/grammar/tokenize.ts` and keep the summary.
3. Kill survivors that are real rules, preferring **new rows in `docs/spec/tokens.md`** under the right N rule; a unit
   test in `src/lib/grammar/tokenize.mutation.test.ts` only for what a row cannot express. Each row or test states the
   rule, not the mutant.
4. **Commit**, then run the mutation command once more and report before and after. (A run that ends in the final
   mutation run without a commit loses its work; commit first.)

## When a survivor cannot be killed

Equivalent survivors: list them grouped, one line each on why; no forced tests. If a row shows the app is **wrong**, do
not fix the app and do not bend the row: leave it out and report the input, the expected tokens, what it gave, and the
rule.

## Out of scope

Any file under `src/` that is not a test file; `docs/spec/tokens.md` only gains rows (no rule text rewritten, except a
statement that must name a newly covered case). `docs/spec.md` and `docs/spec/calendar.md` (another run writes there).
`src/lib/grammar/perf.test.ts` stays as it is.

## Done when

- [ ] `tokenize.ts` is in the mutation set; new rows and tests pass; every existing spec row still passes.
- [ ] Score before and after in the report.
- [ ] `git diff --stat` shows only `stryker.config.mjs`, test files and `docs/spec/tokens.md`.
- [ ] `npm run type-escapes` passes; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the before/after score, the equivalent survivors with reasons, and any app
bug found (or "none").
