# Brief M3: fix the four list-paste bugs the mutation tests found

Run name `m3-clipboard-fixes` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\m3-clipboard-fixes` · branch
`gemini/m3-clipboard-fixes` · base `main` · browser specs: `tests/e2e/rich-clipboard*.spec.ts` and any spec whose name
contains `paste` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

M2 (§516) found four bugs in `src/lib/richClipboard.ts` (`htmlToNoteText`) while writing spec rows. Marien asked for
them to be fixed (2026-11-19). The first can lose text: a list in a table cell (Teams, Outlook) pastes as nothing.

## The four bugs, with the rows that must pass after the fix

Add each row to `docs/spec/clipboard.md` under the rule named (same notation: `↵` line break, `·` a meaningful space).

| # | Rule | HTML | Text now | Text after |
| :--- | :--- | :--- | :--- | :--- |
| 1 | P1 / P2 | `<table><tr><td><ul><li>Item</li></ul></td></tr></table>` | `` (empty) | `- Item` |
| 1b | P7 | `<table><tr><td>Name</td><td><ul><li>a</li><li>b</li></ul></td></tr></table>` | (lost) | `Name↵- a↵- b` (each cell on its own line(s), in order) |
| 2 | P4 | `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First</p><p>Break</p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a.</span>Sub</p>` | `1. First↵Break↵···1. Sub` | `1. First↵Break↵··1. Sub` |
| 3 | P7 | `<ul><li>x</li></ul><div>a<br>b</div>` | `- x↵a↵↵b` | `- x↵a↵b` |
| 4 | P6 / P13 | `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.<br>next</p>` | `1.·↵···next` | `1.↵···next` (no trailing space on the marker line) |

Causes M2 found (verify before relying on them):
1. `BLOCK_TAGS` (around line 162) lacks `TD` and `TH`, so `walkNode` hands a `<tr>` to `extractLines`, which skips
   `<ul>`/`<ol>`.
2. The non-list block branch (around line 610) resets `wordCounters` and `ariaParents` but not `wordParents` (the
   `TEXT_NODE` branch around 475 and `PRE` around 586 do reset it).
3. `BR` is in `BLOCK_TAGS`, so a `<div>` with a `<br>` counts as having block children and the `BR` branch (around 596)
   adds an empty line.
4. Around 509-513 and 565: the marker line is `indent + markerStr + itemLines[0]` with `itemLines[0] === ""`; trim the
   end of that line.

## Rules

- Change only `src/lib/richClipboard.ts`, `docs/spec/clipboard.md` (new rows; a rule statement only where it must name
  the new case), and tests. Every existing row and test must still pass unchanged; if one has to change, stop and
  report it instead.
- Run `npm run mutation:one -- src/lib/richClipboard.ts` after the fix and report the score (85.6 % before).
- Changelog: none (Claude writes it).

## Done when

- [ ] The five rows above pass; all 500+ clipboard and spec rows and the richClipboard tests pass unchanged.
- [ ] `git diff --stat` shows only the files named.
- [ ] The named browser specs pass; `npm run type-escapes` and `npm run verify` pass.

## Report

The standard report from RULES.md, plus: the cause confirmed or corrected for each bug, the mutation score after, and
anything else that changed output for an input not in the table (or "none").
