# Brief P4: "not yet seen by Marien" kept by the tooling

Run name `p4-seen` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\p4-seen` · branch `gemini/p4-seen` · base
`main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. This brief names the changelog files and
`docs/open-checks.md`: you may edit them as described below, nothing else in them.

## Why

A released change that Marien has not looked at yet should be on the open-checks list, and a row on that list whose
changes he has all confirmed should go. Today both are kept by hand and drift. When this is done, a changelog entry
records when Marien has seen it, and a check fails when the open-checks list and the changelog disagree.

## What exists now

- `docs/changelog/0401-0500.md` and `0501-0600.md`: entries `## NNN. Title`, then a blank line, then
  `**Status: released in ...**` or `**Status: on main, not released yet.**`. Scripts that read them:
  `scripts/changelog-headings.mjs` (shared parsing, with `.d.mts`), `scripts/changelog-index.mjs`,
  `scripts/changelog-status.mjs`. Reuse `changelog-headings.mjs` to read entries.
- `docs/open-checks.md`: a table `| Since | What to check | Where / how | Section |`. The Section cell names entries as
  `§485`, `§481-§486`, `§493, §495` or `§494, §497`.
- `scripts/verify.mjs` line 53: the `steps` array; `scripts/type-escapes.mjs` and `src/lib/typeEscapes.test.ts` show
  the script and test pattern (pure exported functions, a small `main`).

## What to build

1. The line. An entry is **seen** when it has, after its Status line, a line that starts with
   `**Seen by Marien:**`, followed by either a date and where (`**Seen by Marien:** 2026-11-18, beta 0.39.0-1.`) or
   `not needed` and a reason (`**Seen by Marien:** not needed (tests and tooling only).`).
2. `scripts/seen-check.mjs` (+ `.d.mts`), `npm run seen-check`. It looks at entries from **§479 on** only (older ones
   were settled before this existed; the start number is a named constant).
   - `sectionsInCell("§481-§486")` → `[481, 482, 483, 484, 485, 486]`; `"§493, §495"` → `[493, 495]`; `"§485"` →
     `[485]`.
   - `checkSeen(entries, rows)` returns `{ missing, stale }`:
     - `missing`: a released (Status starts with `**Status: released`) entry ≥ 479 that is not seen and is named by no
       open-checks row. Fail: "§N is released and not seen by Marien: add an open-checks row or a Seen line."
     - `stale`: an open-checks row all of whose entries are seen. Fail: "the row '<What>' names only seen entries:
       remove it."
     - An entry that is not released yet may be on the list or not; neither fails.
   - Exit 1 when either list is non-empty, printing both. `--list` prints every released, unseen entry ≥ 479 with its
     title and the row that names it.
   - Wire it into `scripts/verify.mjs` after "changelog index".
3. Fill in today's lines (in the changelog files), exactly these:
   - `**Seen by Marien:** not needed (tests and tooling only).` on §479, §480, §501, §502, §503.
   - `**Seen by Marien:** not needed (no visible change).` on §487, §488, §489, §490, §491, §492.
   - Nothing on the others: §481-§486 and §493-§500 are waiting for Marien and each is named by a row in
     `docs/open-checks.md` already. If the check reports one of them as missing, report it; do not add a Seen line
     to make it pass.
4. `docs/open-checks.md`: one sentence under the intro: "`npm run seen-check` keeps this list and the changelog's
   `**Seen by Marien:**` lines in step (from §479 on)." Change no rows.
5. `docs/briefs/RULES.md`: no change. `CLAUDE.local.md`: no change.

## Out of scope

`changelog-status.mjs` and `release.sh` (the Status line stays exactly as it is). Entries before §479. Removing or
rewording any open-checks row.

## Tests to add

`src/lib/seenCheck.test.ts`:

- `sectionsInCell`: the three cell forms above, plus `"§499"` → `[499]` and `"none"` → `[]`.
- `checkSeen` with small made-up inputs:
  - released 500, not seen, no row → `missing [500]`;
  - released 500, not seen, row `§499-§501` → nothing;
  - released 500 seen, row `§500` only → `stale` that row;
  - row `§499, §500`, 499 seen, 500 not → nothing;
  - not released 501, no row → nothing;
  - released 470 (below 479), not seen, no row → nothing.
- Parsing a Seen line: both forms above count; `Seen by Marien` without the bold or before the Status line does not.

## Done when

- [ ] `npm run seen-check` passes on the branch with the lines of step 3.
- [ ] Removing the open-checks row for §496 makes it fail naming §496 (undo it); adding a Seen line to §496 while its
      row is there makes it fail naming the row as stale (undo it).
- [ ] `npx vitest run src/lib/seenCheck` passes.
- [ ] `node scripts/changelog-status.mjs` behaves as before (its tests pass).
- [ ] No `any`, `@ts-ignore` or `@ts-expect-error`; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the `--list` output on the branch.
