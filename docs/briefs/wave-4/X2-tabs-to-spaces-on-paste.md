# Brief X2: pasted tabs become two spaces

Run name `x2-paste-tabs` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\x2-paste-tabs` · branch
`gemini/x2-paste-tabs` · base `main` · browser specs: `tests/e2e/rich-clipboard*.spec.ts`,
`tests/e2e/paste-deferral.spec.ts` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

Marien's feedback on 0.39.0 (2026-11-19): lists copied from Word (rich text) arrive with tab characters, and
ChronoNote's list keys work with spaces (Tab moves indentation; nesting and numbering read spaces). His words: convert
tabs to spaces, "I would even say, convert all tabs to two spaces when pasting from other sources".

## The rule

When text is pasted from another program, every tab character in the pasted text becomes two spaces, whether it came
through the HTML conversion (`htmlToNoteText` in `src/lib/richClipboard.ts`) or as plain text. This applies to tabs at
the start of a line (indentation) and inside it.

Not affected:
- A paste of ChronoNote's own copy (the HTML carries `data-chrononote`, see `richClipboard.ts` around line 154 and
  298): the exact text is kept, tabs included, so copy and paste inside ChronoNote changes nothing.
- Typing Tab, and tabs already in a note.
- `<pre>` blocks: still converted (a tab there becomes two spaces too), so the result has no tabs at all.

Find where a paste enters the editor (`src/lib/editor/clipboardPaste.ts`, `src/lib/paste.ts`) and decide where the
conversion belongs so it covers both the HTML and the plain path once; report why. Drag and drop of text from another
program follows the same rule if it goes through the same path (say whether it does).

## Spec and tests

- `docs/spec/clipboard.md`: a rule (or a statement in the matching P rule) with rows: a Word list paragraph with a tab
  after its marker, `<pre>` with leading tabs, plain text `⇥item` and `⇥⇥- sub`, a tab inside a line, and an own
  ChronoNote copy keeping its tab. If a row shape cannot express the plain-text path, add unit tests beside the code.
- Existing rows that expect a `⇥` in the output for a foreign paste must change to two spaces: list each one in the
  report with the reason (that is this change, not a regression). No other existing row or test may change.

## Also

- `docs/spec.md`: the clipboard bullet gains one clause. `website/guide.html`: the paste sentence, if there is one.
- Changelog: none (Claude writes it).

## Out of scope

Enter and Shift+Enter handling (another run changes `editingKeymap.ts`, `numberedListKeys.ts`, `docs/spec/lists.md`).

## Done when

- [ ] The new rows pass; existing rows pass except the listed `⇥` ones, changed on purpose.
- [ ] The named browser specs pass; `npm run type-escapes` and `npm run verify` pass.
- [ ] Commit before the final report.

## Report

The standard report from RULES.md, plus: where the conversion sits and why, the rows changed on purpose, and whether
drag and drop is covered.
