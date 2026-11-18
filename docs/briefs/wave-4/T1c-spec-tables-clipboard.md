# Brief T1c: lists on the clipboard as tables that run

Run name `t1c-spec-clipboard` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t1c-spec-clipboard` · branch
`gemini/t1c-spec-clipboard` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. No app code changes.

## Why

Steps 1 and 2 (§503, §506) turned the list and editing-key rules of the spec into 341 table rows that a test runs. This
step does the same for "Lists on the clipboard (§439)": what pasting HTML from Word, Outlook, Teams, Google Docs or a
browser gives, and what copying a list puts on the clipboard. These rules are about converting text, not key presses,
so they get their own table shape.

## What exists now

- `docs/spec.md` line 234, the bullet `* **Lists on the clipboard (§439):** ...`: the prose to turn into rules.
- `src/lib/richClipboard.ts`: `htmlToNoteText(html): string | null` (paste) and `noteTextToHtml(text): string | null`
  (copy). Both pure, run under Vitest's jsdom (they use `DOMParser`).
- Rows to take from (they pass today): `src/lib/richClipboard.test.ts` (31 cases) and
  `src/lib/richClipboard.b4.independent.test.ts` (the §469 edge cases).
- `docs/spec/lists.md` and `docs/spec/editing.md`: the style to follow (intro, `### X1. ...` headings, a statement, a
  table). `src/lib/editor/specTables.test.ts`: reads every `docs/spec/*.md` via `import.meta.glob` and runs each table
  whose header is `| Before | Keys | After |`; other tables must be ignored by it (check it does so today, and make it
  so if not, without changing how key tables run).

## What to build

1. `docs/spec/clipboard.md`: rules `P1...` for paste and `K1...` for copy, in the order of the prose. Two table shapes:
   - Paste: `| HTML | Text |`. HTML is written in a code span on one line; Text uses `↵` for a line break and `·` for a
     space where spaces matter at the start of a line (say so in the intro). `—` in Text means `htmlToNoteText`
     returns `null` (plain text is pasted instead).
   - Copy: `| Text | HTML |`, same notation; `—` in HTML means `noteTextToHtml` returns `null`.
   3 to 10 rows per rule, at least 60 rows in all. Cover: list detection (no list gives `—`, `data-chrononote` gives
   `—`), bullets, numbering from `start`/`value`, Word `a.`/`ii)` markers per level, nesting under a numbered and
   under a bullet parent, renumbering inside a nested list, continuation text, whitespace collapse, `<pre>`, the five
   §469 edge cases, copy nesting from 2-space and 3-space notes, non-list lines as `<div>`, escaping, `—` when no line
   is a list item.
   Sentences a table cannot show stay as prose with `Not run as a table: <why>` (the paste going through the same
   handling as plain text afterwards, an empty selection or several ranges copying plain text, drag and drop).
2. `src/lib/clipboardSpecTables.test.ts` (new): reads `docs/spec/*.md` the same way `specTables.test.ts` does (an
   `import.meta.glob` with `?raw`, no Node `fs`), runs every `| HTML | Text |` row through `htmlToNoteText` and every
   `| Text | HTML |` row through `noteTextToHtml`, one Vitest test per row named `<rule id> row <n>`.
3. `docs/spec.md` line 234: replace the bullet by two sentences and the link "The rules, with examples that run as
   tests, are in [docs/spec/clipboard.md](spec/clipboard.md)." Leave every other bullet alone.

## When a row fails

A row written from the prose that fails is a finding: do not change app code and do not bend the row. Leave it out and
list it in the report with the input, the expected output, what the function gave, and the sentence.

## Out of scope

Any file under `src/` other than the new test (and `specTables.test.ts` only if it does not already skip other table
shapes). `richClipboard.test.ts` and the independent test stay as they are. `lists.md`, `editing.md` stay as they are.

## Tests to add

The rows themselves. Run `npx vitest run src/lib/clipboardSpecTables src/lib/editor/specTables`, then `npm test` once.

## Done when

- [ ] `docs/spec/clipboard.md` exists, P and K rules in the prose's order, at least 60 rows, every row passing.
- [ ] The 341 rows of `lists.md` and `editing.md` still pass; changing one expected value in `clipboard.md` fails
      exactly that test (undo it).
- [ ] `docs/spec.md` line 234 is short with the link; no other spec bullet changed.
- [ ] No `any`, `@ts-ignore` or `@ts-expect-error` added (`npm run type-escapes` passes).
- [ ] `git diff --stat` shows only `docs/spec.md`, `docs/spec/clipboard.md`, `src/lib/clipboardSpecTables.test.ts`
      (and `specTables.test.ts` if step 2's check required it).
- [ ] `npm run verify` passes.

## Report

The standard report from RULES.md, plus: a sentence-to-rule mapping, the sentences left as prose and why, and the
rows that failed (or "none").
