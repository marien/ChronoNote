# Brief M1: tests for the phone inbox and link paste gaps

Run name `m1-mutation-inbox-paste` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\m1-mutation-inbox-paste` ·
branch `gemini/m1-mutation-inbox-paste` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **Tests only: no app code changes.**

## Why

The first full mutation run (`docs/design/mutation-gaps-2026-11-18.md`) found rules nobody checks. `phoneInbox.ts`
scored 66.0 % (154 faults survived, 24 in code no test runs), and two of its gaps are about data safety. `paste.ts`
scored 73.7 % (92 survived), mostly around pasting a link.

## What exists now

- `src/lib/phoneInbox.ts`, existing tests `src/lib/phoneInbox.test.ts`, `src/lib/phoneInboxApply*.test.ts`.
  - `loadLedger()` (around line 80): reads the ledger JSON; only `format === 1` with a `handled` object counts, and each
    entry only when it is an object with a `result` in `RESULTS` and a string `at`.
  - `phoneConflictNote(date)` (line 56): the open, non-scratchpad tab's text for `<date>.txt`, else the file.
- `src/lib/paste.ts`, tests `src/lib/paste*.test.ts`: link paste around lines 30-45 (empty or blank link text, the
  base's trailing spaces).
- Mutation tools (local): `npm run mutation:one -- <file>` then `npm run mutation:summary`. One file takes 10-20 min.

## What to build

1. Run `npm run mutation:one -- src/lib/phoneInbox.ts` and `npm run mutation:one -- src/lib/paste.ts` first, and keep
   both summaries (scores and survivors).
2. Add tests that kill survivors where the survivor is a real rule. Put them in the existing test files, or in
   `src/lib/phoneInbox.mutation.test.ts` / `src/lib/paste.mutation.test.ts` when an existing file would become
   confusing. Every test states the rule in its name (for example "ignores a ledger whose format is not 1"), not the
   mutant.
   Must be covered at least:
   - Ledger: wrong `format`, `handled` not an object, `handled` an array, an entry that is not an object, a `result`
     not in `RESULTS`, a missing `at`: each ignored, and the valid entries beside them kept. A ledger for another notes
     folder is not reused (`memory.dir`).
   - `phoneConflictNote`: a scratchpad tab whose `filename` equals `<date>.txt` is not used; the real tab is; with no
     tab, the file; a missing file gives `""`.
   - Link paste: empty link text, blank link text, a base with trailing spaces.
3. Run the two mutation commands again and report before and after.

## When a survivor cannot be killed

Some survivors are equivalent (the change cannot alter behaviour). Do not force a test: list them in the report with one
line each on why. If a test shows the app is **wrong** (not just untested), do not fix the app: leave the test out,
and report the input, what you expected, what happened and the line.

## Out of scope

Any file under `src/` that is not a test file. Other modules of the mutation report.

## Done when

- [ ] New tests pass; no existing test changed except to add cases.
- [ ] `phoneInbox.ts` and `paste.ts` scores before and after are in the report; every remaining survivor in the
      ledger reader and `phoneConflictNote` is either killed or listed as equivalent.
- [ ] `git diff --stat` shows only test files.
- [ ] `npm run type-escapes` passes; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the before/after scores, the equivalent survivors with reasons, and any app
bug found (or "none").
