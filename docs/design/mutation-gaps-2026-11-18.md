# Mutation report, 2026-11-18 (first full run, T5)

`npm run mutation` over the nine core modules: 2 h 49 min, score **75.1 %** (4,698 faults caught, 28 timeouts,
1,343 survived, 224 in code no test runs). The full report is local: `reports/mutation/index.html`, survivors per line in
`reports/mutation/summary.txt` (`npm run mutation:summary`). The next run is incremental and only retests what changed.

| Module | Score | Survived | No test runs it | What the survivors say |
| :--- | ---: | ---: | ---: | :--- |
| `phoneInboxApply.ts` | 91.7 % | 43 | 1 | Well covered. |
| `tokens.ts` | 83.7 % | 267 | 19 | Mostly regex edges (an anchor or quantifier can change unnoticed) and boundary comparisons. |
| `calendarReconcile.ts` | 78.8 % | 83 | 11 | Title matching edges (`trim`, case), the `[CANCELED]` regex anchor, ad-hoc call times. |
| `pasteOverEmptyMarker.ts` | 75.0 % | 26 | 8 | Multi-line paste branches. |
| `paste.ts` | 73.7 % | 92 | 11 | Link paste: empty or blank link text, trailing spaces of the base. |
| `numberedListKeys.ts` | 70.5 % | 394 | 18 | The largest gap by count: many conditions in Enter/Tab/Backspace on numbered lists can flip without a test failing, despite the 163 spec rows. |
| `phoneInbox.ts` | 66.0 % | 154 | 24 | **Data safety:** the ledger reader's validation (a malformed or foreign ledger file), and `phoneConflictNote` picking a scratchpad tab with the same file name. |
| `richClipboard.ts` | 63.0 % | 278 | 121 | Nesting decisions in `htmlToNoteText` (when a list continues vs. starts again), Word marker strings, and 121 faults in code no test reaches. |
| `clipboardPaste.ts` | 56.4 % | 6 | 11 | Small file; the untested part is the HTML-or-plain decision path. |

## Worth a test first (real rules nobody checks)

1. `phoneInbox.ts`: a ledger file with a wrong `format`, a non-object `handled`, or entries with a bad `result` must be
   ignored entry by entry; a scratchpad tab named like a dated note must never be taken for that note.
2. `richClipboard.ts`: the list-continuation condition at line 80 (same indent, `ol`, ...) and the 121 untested faults.
3. `numberedListKeys.ts`: pick the survivors in the Enter and Backspace paths and add spec rows (`docs/spec/lists.md`)
   that pin them.
4. `paste.ts`: link paste with empty or blank text.

Not every survivor is a gap: some are equivalent (the change cannot alter behaviour, such as `trimEnd` on text that never
ends in spaces). A test-writing brief should say so per survivor rather than force a test.
