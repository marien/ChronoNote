# Brief F2: copy a meeting as minutes

Run name `f2-minutes` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f2-minutes` · branch `gemini/f2-minutes` ·
base `main` after W2-0 is merged · browser-test port `1453` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design and decisions: `docs/design/wave2-designs.html`,
section F2 (2.1 as shown, 2.2 name from a setting, 2.3 done actions included under "Done", 2.4 plain lines left out,
2.5 palette and title menu, no shortcut).

## Why

After a meeting the user writes a follow-up mail by retyping what the note already holds. One command turns the
section into minutes on the clipboard, as rich text for Outlook and Teams and as plain text. The note is not changed.

## What exists now

- The tokenizer, `src/lib/grammar/tokenize.ts`: `tokenizeNoteLine(lines, lineIdx)` gives a line's tokens (kinds:
  `action`, `topic`, `bullet`, `emphasis`, `arrow`, `consequence`, `consequenceTopic`, `assignee`, `topicTag`, `due`,
  `dueWord`, `forwardLink`, `escape`, each with `from`, `to`, and `symbol` or `date`). `getLineActionParts(line,
  tokens)` gives the action parts of a line (`from`, `to`, `state`, `delegated`, `assignee`). `isTitleLine`,
  `isSetextUnderline`.
- Sections: `listSections(text)` and `getSectionHeaderForLine(lines, lineIdx)` in `src/lib/tokens.ts` (lines 852,
  910). A section runs from its title line to the line before the next section's title.
- Dates: `longDate(locale, iso)` in `src/lib/date.ts` (line 288). The UI locale is the `locale` store in
  `src/lib/i18n`.
- Clipboard: `copyRich(html, plain)` in `src/lib/clipboardWrite.ts` (from W2-0). `escapeHtml` in
  `src/lib/exportFormats.ts`.
- The setting: store `minutesName` (from W2-0).
- Command palette: `src/lib/commandPalette.ts`, the "Current line" commands near line 393 show the shape of an entry.
- Title menu: `src/lib/components/EditorContextMenu.svelte`; `onTitle` (line 78) is true on a section title or its
  underline; the Section history item (near line 397) is the model for an item that needs a section.

## What to build

1. `src/lib/minutes.ts`, pure, no stores:

   ```ts
   export interface MinutesLabels { decisions: string; actions: string; done: string; stillOpen: string; remember: string; notDiscussed: string; by: string }
   export interface MinutesInput { noteText: string; lineIdx: number; dateISO: string | null; locale: string; ownerName: string; labels: MinutesLabels }
   export function buildMinutes(input: MinutesInput): { html: string; plain: string; empty: boolean } | null
   ```

   `null` when `lineIdx` is not inside a section. Read every line of the section's body through the tokenizer:

   | The line has | Goes to | Text |
   | :--- | :--- | :--- |
   | an action part with state `#`, not delegated | Actions | the part's text; owner = `ownerName` (none when empty) |
   | a delegated part (`=> @name`), any position | Actions | the text after the name; when there is none, the text of the part before the arrow. Owner = the name. The part before the arrow is then NOT listed again, even when it is an open action |
   | an action part with state `v` | Done | the part's text |
   | an action part with state `>` or `x` | nowhere | |
   | a plain follow-up (`=> text`, no symbol, no name) | Decisions | `<subject>: <text>` where the subject is the text of the part before the arrow; just `<text>` when the line starts with the arrow |
   | a topic `o ` | Still open | its text |
   | a topic `, ` | Still open | its text + ` (<notDiscussed>)` |
   | a topic `. ` | nowhere itself (its follow-ups are still read) | |
   | `! ` as the first thing on the line | Remember | the text after `! ` |
   | anything else (plain text, bullets, numbered lines, sub-titles, blank) | nowhere | |

   Text clean-up for every entry: the leading symbol, list marker and `! ` are dropped; forward links
   (`(>…)`, `(<…)`) are dropped; a `by:YYYY-MM-DD` is taken out of the text and shown at the end as
   `, <by> <weekday short> <day> <month short>` in the locale (`Intl.DateTimeFormat(locale, { weekday: "short",
   day: "numeric", month: "short" })`); a `(topic)` tag moves to the end of the text; `@name` inside the text stays;
   spaces are collapsed; the first letter is made upper case. An owner is shown as the name without `@`, first
   letter upper case, after a colon.

   Entry shape: `Text (tag): Owner, by Fri 20 Nov`; without owner `Text (tag), by Fri 20 Nov`.

   Output order: title line, then Decisions, Actions, Done, Still open, Remember; a heading with no entries is left
   out. `empty` is true when no heading has entries.
   - Title line: `<title>, <long date with weekday>` (`Intl.DateTimeFormat(locale, { weekday: "long", day:
     "numeric", month: "long", year: "numeric" })`), just the title when `dateISO` is null.
   - `plain`: the title line, an empty line, then per heading: the heading, its entries as `- ` lines, an empty line.
     No trailing empty line.
   - `html`: `<p><b>title</b>, date</p>` then per heading `<p><b>heading</b></p><ul><li>…</li></ul>`. Everything
     escaped.

2. A command "Copy as minutes" (`copyAsMinutes()` in a new `src/lib/minutesActions.ts`): takes the active tab's text
   and the caret line, builds the labels from i18n keys `minutes.*`, calls `buildMinutes`, then `copyRich`.
   - not in a section: toast "Put the caret in a meeting first."
   - `empty`: toast "Nothing in this meeting to put in minutes." and nothing is copied.
   - copied: toast "Minutes copied."
   - `copyRich` returned false: toast "Could not copy."
3. Add it to the command palette (commands group) and to the editor's right-click menu: on a section title or
   underline, and on any line inside a section, placed right after the Section history item. No keyboard shortcut.
   It also works in Peek (the menu and the palette already do).
4. i18n keys in all seven languages. English and Dutch:

   | Key | English | Dutch |
   | :--- | :--- | :--- |
   | `minutes.command` | Copy as minutes | Kopieer als notulen |
   | `minutes.decisions` | Decisions | Besluiten |
   | `minutes.actions` | Actions | Acties |
   | `minutes.done` | Done | Gedaan |
   | `minutes.stillOpen` | Still open | Nog open |
   | `minutes.remember` | Remember | Onthouden |
   | `minutes.notDiscussed` | not discussed | niet besproken |
   | `minutes.by` | by | uiterlijk |
   | `minutes.toast.copied` | Minutes copied. | Notulen gekopieerd. |
   | `minutes.toast.empty` | Nothing in this meeting to put in minutes. | Niets in dit overleg om in notulen te zetten. |
   | `minutes.toast.noSection` | Put the caret in a meeting first. | Zet de cursor eerst in een overleg. |
   | `minutes.toast.failed` | Could not copy. | Kopiëren is niet gelukt. |

5. `website/guide.html`: one short paragraph where export and "Copy as Markdown" are described. `docs/spec.md` §2.5:
   a bullet "Copy as minutes" with the table of step 1 in two or three sentences.

## The reference example

Section in the note of 2026-11-16, locale `en-GB`, `ownerName` `Marien`:

```
Design review
=============
. Vendor choice => we go with Acme => # (contract) send draft by:2026-11-20
o Budget 2027
, Hiring plan
# ask Sam for numbers => @sam
=> @dana prepares the demo by:2026-11-24
! No meeting next week
v book room
> move the offsite (>2026-11-23#Design review)
Sam was late, started 14:10
```

`plain` must be exactly:

```
Design review, Monday 16 November 2026

Decisions
- Vendor choice: we go with Acme

Actions
- Send draft (contract): Marien, by Fri 20 Nov
- Ask Sam for numbers: Sam
- Prepares the demo: Dana, by Tue 24 Nov

Done
- Book room

Still open
- Budget 2027
- Hiring plan (not discussed)

Remember
- No meeting next week
```

With `ownerName` `""` the first action is `- Send draft (contract), by Fri 20 Nov`.

## Out of scope

Changing the note. A dialog or preview. Sub-sections (`----` titles) as separate groups. A shortcut. Sending mail.

## Tests to add

- `src/lib/minutes.test.ts`: the reference example (plain, exact); the empty owner variant; the HTML for the same
  input contains `<p><b>Design review</b>, Monday 16 November 2026</p>` and `<li>Vendor choice: we go with Acme</li>`
  and escapes `<` in a line `o a < b`; a section with only plain text gives `empty: true`; a line
  `# a => # b => v c` gives two Actions entries (`A`, `B`) and one Done entry (`C`); `lineIdx` above the first
  section gives `null`; the title line itself as `lineIdx` works; locale `nl-NL` with Dutch labels gives
  `uiterlijk vr 20 nov` for the due date.
- `tests/e2e/minutes.spec.ts`: seed the reference note; run the command from the palette; read the clipboard
  (`context.grantPermissions(["clipboard-read", "clipboard-write"])`, then `navigator.clipboard.readText()`) and
  compare with the reference; the toast appears; the note's text is unchanged; the menu item is present on a title
  line and on a body line, and absent above the first section.

## Done when

- [ ] `npm run verify` and `npm run build` pass.
- [ ] `E2E_PORT=1453 npx playwright test tests/e2e/minutes.spec.ts tests/e2e/editor-context-menu.spec.ts --workers=2 --reporter=line` passes.
- [ ] The guide's shortcut-table test still passes (no shortcut was added).

## Report

The standard report, plus any line shape you met where the table in step 1 did not say what to do, and what you did.
