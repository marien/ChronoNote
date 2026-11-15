# Brief F8: copy the Actions list as shown

Run name `f8-copy-list` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f8-copy-list` · branch
`gemini/f8-copy-list` · base `main` after W2-0 and U1 are merged · browser-test port `1455` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design and decisions: `docs/design/wave2-designs.html`,
section F8 (8.1 day and meeting headings, 8.2 `☐ ☑` boxes, 8.3 folded groups as shown, 8.4 first line included).

## Why

The Actions pane's filter answers questions such as "what is open on (budget) since 1 November", but the answer
cannot leave the pane. A Copy button puts the rows on screen on the clipboard as a tidy list, rich and plain, for a
status mail or a review.

## What exists now

- `src/lib/components/modals/ActionDrawerModal.svelte`: `flatList` (line 293) is the list of rows shown, in order,
  each `{ item, depth, hasChildren, expanded, progress, contextOnly }` (`DrawerRow` in
  `src/lib/actionDrawerRows.ts`, line 8). `item` is an `ActionSnapshotItem` (find its definition with a search for
  `interface ActionSnapshotItem`): it has the note's `filename`, the `line` text, and the fields the pane uses to
  show the row's own text (`nodeText(item)`, `nodeState(item)` in `actionDrawerRows.ts`) and its section (the value
  the pane shows as the row's source). The filter text is `filter`; its operator chips are `chips` (each with a
  `label`); the switches are the stores `actionDrawerShowOnlyOpen` and `actionDrawerDueView`; the scope is `scope`.
- After U1, row 1 of the header has a marked slot: `<!-- F8: copy button goes here -->`.
- `src/lib/components/modals/WeekReviewModal.svelte`: `rows` (line 267) with `type` `dayHeader`, `sectionHeader`,
  `item`; items are `WeekReviewItem` (`src/lib/weekReview.ts` line 34).
- `copyRich(html, plain)` in `src/lib/clipboardWrite.ts`; `escapeHtml` in `src/lib/exportFormats.ts`;
  `formatNoteDate` in `src/lib/noteDateLabel.ts` for a note's date as the user's date setting shows it.

## What to build

1. `src/lib/listCopy.ts`, pure:

   ```ts
   export interface CopyRow { dateISO: string | null; dateLabel: string; section: string; depth: number; state: "#" | "v" | ">" | "x" | null; text: string; step?: number; progress?: { resolved: number; total: number }; folded: boolean }
   export function buildListCopy(rows: CopyRow[], headerLine: string): { html: string; plain: string }
   ```

   - `plain`: `headerLine`, an empty line, then the rows. Whenever the pair (dateLabel, section) differs from the
     previous row's, a heading line `<dateLabel> · <section>` (just `<dateLabel>` when the section is empty). No empty
     line between groups. A row is `<two spaces per depth><box> <text>`, where the box is `☐` for `#`, `☑` for `v`,
     `☒` for `x`, `▷` for `>`, and nothing (no box, no extra space) for `null`. A step row puts `<step>. ` after the
     box. A folded row with progress appends ` (<resolved>/<total>)`.
   - `html`: `<p>headerLine</p>`, then per group `<p><b>heading</b></p>` and a `<ul>` whose nesting follows `depth`;
     each `<li>` starts with the box character. Everything escaped.
   - `text` is given to the function already cleaned (step 2).

2. In `ActionDrawerModal.svelte`: a Copy icon button in the marked slot (`aria-label` and tooltip "Copy list"),
   disabled when `flatList` is empty. On click it builds `CopyRow`s from `flatList`:
   - `text`: the row's own text as shown (`nodeText(item)`), with forward links (`(>…)`, `(<…)`) removed and a
     `by:YYYY-MM-DD` rewritten to `by <weekday short> <day> <month short>` in the UI locale; the topic tag and
     `@names` stay as typed;
   - `dateLabel`: the note's date as the pane's day band shows it; `section`: the row's section title;
   - `folded`: `hasChildren && !expanded`;
   - `headerLine`: `Actions · <the filter text as typed, if any> · <"only open" when that switch is on> ·
     <"by due date" when on> · <today as day month year in the locale>`, parts joined by ` · `, empty parts left out.
     In the due view the groups' heading is the due group's label (Overdue, Today, the day) in place of the date.
   Then `copyRich`; toast "List copied (N actions)." or "Could not copy."
3. The same button in `WeekReviewModal.svelte`'s header (next to its `?` button from U1), building rows from its
   `item` rows; `headerLine`: `Week <n> · <range> · <today>`.
4. i18n keys in all seven languages; English and Dutch:

   | Key | English | Dutch |
   | :--- | :--- | :--- |
   | `listCopy.button` | Copy list | Kopieer lijst |
   | `listCopy.title` | Actions | Acties |
   | `listCopy.onlyOpen` | only open | alleen open |
   | `listCopy.byDue` | by due date | op deadline |
   | `listCopy.toast.copied` | `List copied (${count} actions).` | `Lijst gekopieerd (${count} acties).` |
   | `listCopy.toast.failed` | Could not copy. | Kopiëren is niet gelukt. |

5. `docs/spec.md` §5, Action Drawer and Week review: one sentence each. `website/guide.html`: one sentence where the
   Actions view is described.

## The reference example

Rows: note 2026-11-09 (label `Mon 9 Nov`), section `Design review`: an open parent `(budget) send draft
by:2026-11-20`, depth 0; its steps `numbers from Sam` (open, step 1, depth 1) and `template` (done, step 2, depth 1).
Note 2026-11-10 (label `Tue 10 Nov`), section `1:1 Dana`: open `(budget) check forecast @dana`, depth 0.
`headerLine`: `Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026`. `plain` must be exactly:

```
Actions · tag:budget since:2026-11-01 · only open · 15 Nov 2026

Mon 9 Nov · Design review
☐ (budget) send draft by Fri 20 Nov
  ☐ 1. numbers from Sam
  ☑ 2. template
Tue 10 Nov · 1:1 Dana
☐ (budget) check forecast @dana
```

The same with the parent folded and progress 1/2: the two step lines are absent and the parent line ends with
` (1/2)`.

## Out of scope

Copying a single row. A keyboard shortcut. Export to a file. The Search dialog and Section History.

## Tests to add

- `src/lib/listCopy.test.ts`: the reference example (exact), the folded variant, a row with state `null` (no box),
  a row without section (heading is the date only), HTML nesting for depth 0-1-1-0 (`<ul><li>…<ul><li>…</li>
  <li>…</li></ul></li><li>…</li></ul>`), escaping of `<`.
- `tests/e2e/list-copy.spec.ts` (grant clipboard permissions): seed a note that produces the reference rows, open the
  pane on all files with the filter `tag:budget`, press Copy, compare the clipboard's text with the expected list
  (today's date computed in the test); fold the group and copy again; empty list: the button is disabled; week
  review: the copied text starts with `Week ` and contains the action.

Run:

```bash
E2E_PORT=1455 npx playwright test tests/e2e/list-copy.spec.ts tests/e2e/actions-header.spec.ts --workers=2 --reporter=line
```

## Done when

- [ ] `npm run verify` and `npm run build` pass.
- [ ] The command above passes, and the header test of U1 still passes with the button in place at 180 px.

## Report

The standard report.
