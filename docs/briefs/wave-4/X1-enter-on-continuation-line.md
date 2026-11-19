# Brief X1: Enter on a list's continuation line starts the next item

Run name `x1-enter-continuation` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\x1-enter-continuation` · branch
`gemini/x1-enter-continuation` · base `main` · browser specs: any `tests/e2e/*list*.spec.ts` and
`tests/e2e/*enter*.spec.ts` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

Marien's feedback on 0.39.0 (2026-11-19): in a list, on a line without a number (a continuation line under an item),
Enter should make a new numbered line, and Shift+Enter a new line without a number at the same indentation. Today
neither rule exists in `docs/spec/lists.md` or `docs/spec/editing.md`; find out first what Enter and Shift+Enter do
there now and say so in the report.

## The rules (with `‸` for the caret, `·` for a space, as in `docs/spec/lists.md`)

A **continuation line** is a line with no marker of its own whose indentation is at least the text column of the
nearest list item above it, with only continuation lines (or that item's sub-items) between them. It belongs to that
item.

1. **Enter** on a continuation line of a numbered item inserts the item's next sibling number at the item's indent;
   the text after the caret moves to the new item; the following items renumber as Enter on the item itself does
   (L2 and the rules after it). For a bullet item (`- `, `* `) it inserts the same bullet at the item's indent.
   - `1. First↵···more‸` + Enter -> `1. First↵···more↵2. ‸`
   - `1. First↵···more‸↵2. Second` + Enter -> `1. First↵···more↵2. ‸↵3. Second`
   - `1. First↵···mo‸re` + Enter -> `1. First↵···mo↵2. ‸re`
   - `··1.1. Sub↵·······more‸` + Enter -> `··1.1. Sub↵·······more↵··1.2. ‸`
   - `- Bullet↵··more‸` + Enter -> `- Bullet↵··more↵- ‸`
2. **Shift+Enter** on a continuation line inserts a new continuation line with the same indentation (no marker).
   - `1. First↵···more‸` + Shift+Enter -> `1. First↵···more↵···‸`
   - `- Bullet↵··more‸` + Shift+Enter -> `- Bullet↵··more↵··‸`
3. Unchanged: a continuation line that holds only spaces (Enter there does what it does today; report what that is),
   lines under action, topic or `=> ` lines that are not list items, and plain text with no list item above.

Add these rows (and more on the edges: a continuation line under a sub-item, under an item whose number is `9.`, with
a selection, at the end of the document) under a new rule in `docs/spec/lists.md` (numbered and bullets), in the same
table notation. If the code that decides "continuation line" already exists (`numberedContinuationIndent` in
`src/lib/tokens.ts`, the Shift+Enter handling in `src/lib/editor/editingKeymap.ts`, `numberedListKeys.ts`), reuse it.

## Also

- `docs/spec.md` line 237 ("List Continuation"): one clause for the new rule. `website/guide.html`: the sentence about
  Enter in lists, if there is one, gains the continuation-line case.
- Changelog: none (Claude writes it).

## Out of scope

Paste handling (another run changes `richClipboard.ts`, `clipboardPaste.ts`, `paste.ts`). Any change to Enter or
Shift+Enter on a line that has a marker.

## Done when

- [ ] The rows above pass, plus your edge rows; every existing spec row and test passes unchanged (if one must change,
      stop and report it).
- [ ] The named browser specs pass; `npm run type-escapes` and `npm run verify` pass.
- [ ] Commit before the final report.

## Report

The standard report from RULES.md, plus: what Enter and Shift+Enter did on a continuation line before, and any case
where the new rule was unclear and how you decided it.
