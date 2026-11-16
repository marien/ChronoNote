# Brief F5: Person view

Run name `f5-person-view` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f5-person-view` · branch
`gemini/f5-person-view` · base `main` after F3 is merged (it adds the `namesOf` facet) · browser-test port `1464` ·
model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

Before a 1:1 or a meeting, Marien wants everything about one person in one place: his open actions that mention
them, what he delegated to them, and where they came up lately. Today that takes three searches. Design and decisions
(2026-11-16): `docs/design/wave3-designs.html`, section F5 (lines 138-158), questions 5.1-5.3. The view is
read-only.

## What exists now

- **Docked panes, `src/App.svelte`.**
  - `paneDocked` (line 638) is true on a window at least 1000 px wide, not on the phone, not in Zen or Peek.
  - `dockedPane` (line 639) is `$modal` when that is `"history"`, `"actions"` or `"weekReview"` and `paneDocked`.
  - Each docked pane is an `<aside>` with a resizer (lines 876-959). The week review pane (lines 932-959) is the
    closest model: it shares `actionsPaneShare`.
  - The same components open as dialogs when not docked (lines 998-1005).
  - Focus switching for docked panes is at lines 131-157, and outside-click handling at lines 236-275. Every place
    that lists the three pane names gets the new one too.
- **`src/lib/components/modals/WeekReviewModal.svelte`**: the `docked` prop (line 47) and a list of rows that jump to
  a note line with `controller.jumpToFileLine(item, docked ? { keepModal: true } : undefined)` (line 369). Follow
  this component for structure, keyboard handling (arrows, Enter, Esc) and styling.
- **Notes index** (`src/lib/notesIndex/`): `get(notesIndex).entries`; skip `isScratchpadKey` keys;
  `dateISOOfFilename`; `linesOf`, `sectionsOf`, `actionsOf(entry).flat` (each node is an `ActionNode` from
  `src/lib/actionGroups.ts` line 5: `lineIdx`, `from`, `to`, `state`, `delegated`, `kind`); `namesOf(entry)` (from F3).
  Call `await ensureLoaded()` before reading, as the palette does (`commandPalette.ts` line 633).
- **Section of a line:** `getSectionHeaderForLine(lines, lineIdx)` and `normalizeHeaderTitle` (`src/lib/tokens.ts`
  lines 852, 878).
- **Tokens:** `tokenizeLine(line)`. An `@name` in any position is an `"assignee"` token. Its text after `@` is the
  name.
- **Line menu:** `src/lib/components/EditorContextMenu.svelte`. It has `line` and `col` (line 84), and items
  such as Section History's (lines 395-410).
- **Ctrl+click on a link:** `src/lib/editor/clickableLinks.ts` lines 89-102 (modifier `isMac ? metaKey : ctrlKey`).
- **Palette `@` mode:** `commandPalette.ts` lines 657-693. It lists dates; people go below them.

## What to build

1. **The data, new `src/lib/personView.ts`** (pure apart from reading the index).
   - `personMatches(line, name)`. True when either:
     - the line has an `"assignee"` token whose name equals `name` case-insensitively (`@Dana`, `@dana` and
       `(@Ana, @Dana)` all match; `@Danal` does not); or
     - the name occurs as a whole word, case-insensitively. A word boundary is the line start or end, or any
       character that is not a `NAME_CHAR` (`src/lib/grammar/symbols.ts`).

   | Line | `name` | Result |
   | :--- | :--- | :--- |
   | `# send Dana the budget sheet` | `dana` | true |
   | `# ask @Dana about the key` | `Dana` | true |
   | `o rota (@Ruth, @dana)` | `Dana` | true |
   | `# call @Danal` | `Dana` | false |
   | `# Danaë's book` | `Dana` | false (`ë` is a name character) |

   - `buildPersonView(name, entries, todayISO, showOlder: boolean)` returns three groups. The window is the 8 weeks
     up to today: dated notes from `todayISO` minus 56 days onward, future notes included. Undated notes count for
     group 1 only.
     1. **Open actions that mention the person.** Every node in `actionsOf(entry).flat` with `state === "#"` and not
        `delegated`, whose own part (`line.slice(from, to)`) passes `personMatches`. This group is in every note,
        dated or not, however old (5.2: open actions are always all shown). Newest note first, then by line.
     2. **Delegated to the person.** Every node with `delegated === true` whose part has an assignee token equal to
        the name. Only inside the window, unless `showOlder`. Newest first.
     3. **Last mentions by meeting.**
        - Group every line that passes `personMatches`, except lines already in groups 1 or 2, by (note, section
          title line).
        - Each group gives `{ filename, dateISO, title, lineIdx of the first matching line, count }`. `title` is
          `normalizeHeaderTitle`; an empty string when the line is outside any section.
        - Only inside the window, unless `showOlder`. Newest note first, then by position in the note.
   - Each row of groups 1 and 2 is `{ filename, dateISO, lineIdx, text, section }`. `text` is the node's part
     without its leading symbol (use `nodeText` from `src/lib/actionDrawerRows.ts` on a matching item shape, or
     `stripLeadingToken` for a whole line).
   - `hasOlder` tells whether "Show older" would add rows.
   - `knownPeople(entries)` returns all names from `namesOf`. The spelling is the one used most; the order is most
     recently used first.

2. **The view, new `src/lib/components/modals/PersonModal.svelte`** with a `docked` prop, like `WeekReviewModal`.
   - Header: `@Name` (the spelling from `knownPeople`, or as clicked) and a close button.
   - Three bands with counts:
     - "Your open actions that mention {name} · N"
     - "Delegated to {name} · N"
     - "Last mentions · by meeting"
   - Rows draw the text with glyphs, as the week review's rows do. A muted tail shows `· <date> · <section>`, the
     date as the week review shows dates.
   - Mention rows show `<date> · <section>` and a muted `· N lines` (`· 1 line`).
   - A band with no rows shows "None" in muted text.
   - Under groups 2 and 3, when `hasOlder`, a "Show older" button that rebuilds with `showOlder: true`.
   - Clicking a row, or `Enter` on it, jumps to the line, keeping the pane open when docked.
   - `Esc` closes. Arrow keys move through the rows of all bands, in order.
   - The view is a snapshot: it is built when it opens and when the person changes, and does not update while open.
     Marien keeps the Actions pane a snapshot for the same reason.

3. **Opening it.** A store `personViewName` (`writable<string | null>`), and `controller.openPersonView(name)`, which
   sets the store and `modal` to `"person"`.
   - **`App.svelte`:**
     - `dockedPane` also accepts `"person"`. It is docked under the same conditions (5.1: a pane beside the note on
       a wide window; a dialog otherwise and on the phone).
     - It is an `<aside class="person-pane">` sharing `actionsPaneShare`.
     - Add it to every list of pane names (focus switching, outside click, resizer state).
   - **Ctrl+click** (Cmd on Mac) on an `@name` in the editor opens it. Add a click handler in a new small ViewPlugin
     `src/lib/editor/personClick.ts`:
     - On `mousedown` with the modifier, find the position (`view.posAtCoords`), tokenize that line, and look for an
       `"assignee"` token covering the position. When found, prevent the default and call the callback.
     - A plain click keeps placing the caret (5.3).
     - Pass the callback from `EditorPane.svelte` through `afterFilters`, next to the other UI extensions.
   - **Line menu:** "Show @{name}" for the assignee token at `col`, or else the line's first assignee token. It is
     shown only when the line has one. Put it after the Section History item.
   - **Palette `@` mode:** after the dates, a group "People" lists `knownPeople` whose name starts with the term
     (case-insensitive, without a leading `@`), at most 20. The label is `@Name`; `run` calls
     `openPersonView(name)`.

4. **Text in all seven languages:**
   - `personView.openActions` "Your open actions that mention {name}"
   - `personView.delegated` "Delegated to {name}"
   - `personView.mentions` "Last mentions · by meeting"
   - `personView.lines` "{count} lines" / one "1 line" (follow the plural pattern in `en.ts`)
   - `personView.none` "None"
   - `personView.showOlder` "Show older"
   - `personView.ariaLabel` "Person: {name}"
   - `lineMenu.showPerson` "Show @{name}"
   - `commandPalette.group.people` "People"
   - Dutch: "Je open acties waarin {name} voorkomt", "Gedelegeerd aan {name}", "Laatst genoemd · per vergadering",
     "{count} regels" / "1 regel", "Geen", "Oudere tonen", "Persoon: {name}", "@{name} tonen", "Personen".

5. **Docs.**
   - `docs/spec.md`: a "Person view" entry next to Section History.
   - `website/guide.html`: a short paragraph.
   - No shortcut.

## Out of scope

- Editing from the view (cycling a state, forwarding): it is read-only.
- Attendees from the calendar (F9).
- Live updates (it is a snapshot).

## Tests to add

- `src/lib/personView.test.ts`:
  - The `personMatches` table.
  - `buildPersonView` on a set of notes with today 2026-11-16:
    - an open action mentioning Dana on 2026-06-01 is listed in group 1 (any age);
    - a delegation `=> @dana` on 2026-09-01 is not listed, but `hasOlder` is true and `showOlder` lists it;
    - a delegation on 2026-11-10 is listed;
    - a done action `v ask Dana` is not in group 1, and as a line it is counted in group 3;
    - two plain lines naming Dana in section `[10:00 - 10:30] Coffee rota` of 2026-11-12 give one group 3 row with
      title `Coffee rota` and count 2;
    - a line in group 1 is not counted again in group 3.
  - `knownPeople` order and spelling.
- `src/lib/editor/personClick.test.ts`: through `testEditor`, Ctrl+mousedown on the `@Dana` of `# ask @Dana x`
  calls the callback with `Dana`. A plain mousedown does not; neither does a Ctrl+mousedown on `ask`. If synthetic
  mouse events are impractical there, test the pure "token at position" helper instead and cover the click in the
  browser test.
- Browser: new `tests/e2e/person-view.spec.ts`.
  - Seed notes with Dana in all three groups. Ctrl+click `@Dana` in today's note: a pane `aside.person-pane` appears
    beside the editor at 1280×800 with the three bands and their counts. Click a row: the editor's caret is on that
    line and the pane stays.
  - At 800 px wide the same opens as a dialog.
  - Palette: type `@da` and choose `@Dana` under "People": the view opens.
  - Also run `tests/e2e/week-review-and-drawer-style.spec.ts` and `tests/e2e/command-palette.spec.ts`.

## Done when

- [ ] `personView.ts` with the tables above passing.
- [ ] The pane docks like the week review pane; a dialog when narrow or on the phone.
- [ ] Ctrl+click, the line menu item and the palette group open it; a plain click is unchanged.
- [ ] Keys in all seven languages; spec and guide updated.
- [ ] `npm run verify` and `npm run build` pass; the browser specs pass, the new one ten times.

## Report

The standard report from RULES.md.
