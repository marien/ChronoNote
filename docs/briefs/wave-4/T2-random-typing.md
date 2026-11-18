# Brief T2: random typing against the real editor

Run name `t2-random-typing` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t2-random-typing` · branch
`gemini/t2-random-typing` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. This brief adds one test file and changes no
app code.

## Why

The table tests check the cases someone thought of. §477 (a caret jump when blank lines move) was found only by a
random test, on a release commit. When this is done, a test feeds random key sequences to the real editor (typing,
Enter, Tab, Backspace, state keys, paste, selections) and checks what must always hold.

## What exists now

- `src/lib/testing/testEditor.ts`: `createTestEditor({ doc })` (the full editing extensions; `|` marks the caret),
  `press(key)`, `type(text)`, `paste(text)`, `select(anchor, head?)`, `undo()`, `text()`, `view`, `destroy()`.
- `fast-check` is already a dev dependency. Follow `src/lib/numberedLists.property.test.ts` for the setup (jsdom
  environment line, `fc.assert(fc.property(...))`, editors destroyed after each run).
- Key names `press` accepts are the keymap's: `Enter`, `Shift-Enter`, `Tab`, `Shift-Tab`, `Backspace`, `Delete`,
  `Mod-1` .. `Mod-7`, `Mod-Shift-o`, `Home`, `End`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
  (`src/lib/editor/editing.states.table.test.ts` line 46 on shows the state keys).
- `renumberLists(lines, touched)` in `src/lib/numberedLists.ts` line 630 returns `LineEdit[]` (`{ lineIdx, text }`).

## What to build

`src/lib/editor/randomTyping.property.test.ts`:

1. A start document: 1 to 8 lines picked from this pool, then a caret at a random offset:
   `# task`, `v done`, `> later`, `x dropped`, `o topic`, `. talked`, `- bullet`, `  - sub bullet`, `* star`,
   `1. one`, `2. two`, `  1. sub one`, `1.1. dotted`, `2) paren`, `# 1. numbered action`, `=> @Dana`, `=> # follow`,
   `! - urgent`, `# (budget) topic action`, `Plain prose`, `  continuation`, `` (blank), and the two-line title
   `Board meeting` + `=============`.
2. An action is one of: type one character from `a`, ` `, `#`, `v`, `x`, `o`, `>`, `.`, `-`, `1`, `(`, `)`, `@`, `:`;
   press one key from the list above; paste 1 to 3 lines from the pool joined with `\n`; select a random range.
3. A sequence is 1 to 25 actions. After every action check:
   - nothing threw;
   - the selection lies within the document (`0 <= from <= to <= doc.length`);
   - the document has no `\r`.
4. After the whole sequence, check:
   - undoing until `undo()` returns false gives back the start text exactly;
   - renumbering is stable: apply `renumberLists(lines, all line indices)` once to the final lines (as plain string
     edits), then call it again on the result: the second call returns no edits.
5. `numRuns: 300`, the test's timeout 60 s. Do not fix the seed; on a failure fast-check prints the seed and the
   shrunk sequence, which is what we want.

## When a property fails

A failing property is a finding about the editor, not something to fix in this brief. Do not change app code and do
not weaken the property. Take fast-check's shrunk counterexample, check it fails on its own as a plain `it` with that
exact sequence, and then: leave that `it` in the file as `it.skip("finding: <one line>")` with the sequence, exclude
just that pattern from the random run with an `fc.pre(...)` whose comment names the skipped test, and report it.
Stop after three findings and report them all.

## Out of scope

Any change under `src/` other than the new file. No browser test. No changes to `testEditor.ts` (if it lacks
something you need, say so in the report).

## Tests to add

The one file above. Run it 5 times (`npx vitest run src/lib/editor/randomTyping --reporter=dot`, repeat) and give the
durations; then `npm test` once.

## Done when

- [ ] `src/lib/editor/randomTyping.property.test.ts` exists with the five checks of steps 3 and 4.
- [ ] Five runs in a row pass (or the findings are recorded as described), each under 30 s locally.
- [ ] Making undo lose a step on purpose (for example an extra `ed.press("Mod-1")` after the sequence, before the
      undo check) makes the property fail; undo that change.
- [ ] `git diff --stat` shows only the new file.
- [ ] `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the five durations, and each finding with its sequence, or "none".
