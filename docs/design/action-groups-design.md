# Action groups and sub-actions (design, 2026-10-24)

Status: proposal; Marien's answers of 2026-10-24 are in (section 10). Purely visual grouping: no automatic closing in
either direction, no new tokens, not a byte changes on disk.

## 1. The four ways Marien writes them today

```
1  # prepare offsite: book room, send invite, order lunch
2  # onboard Lee => # laptop => # accounts => # intro meeting
3  # release 0.34
     # changelog
     # build
     # announce
4  # release 0.34                    # release 0.34
     => # changelog                  => # changelog
     => # build                      => # build
```

What the app does now: every line is its own drawer row (form 2 is one row showing the state of its *last*
symbol), indentation is untouched whitespace, and nothing connects the lines visually.

## 2. Two meanings, two forms

| Meaning | Form | Editor | Action Drawer |
| :-- | :-- | :-- | :-- |
| A quick list inside one action | 1 (`: a, b, c`) | as today | one row, as today |
| Steps in sequence ("then") | 2 (`=> # step` on one line) | as today | parent row + numbered step rows |
| Parts of one action (a checklist) | 3 (indented lines) | connected by tree lines | parent row + nested rows |

**Form 3 is the standard** for checklists (decided): it is the shortest to type (Enter on an indented action already
continues `  # ` at the same indent; Tab indents a fresh one), it exports to nested Markdown lists unchanged, and it
leaves `=>` with one meaning only: *then / as a consequence*. Form 4 keeps working (old notes group the same way, see
3.1); the guide just doesn't teach it.

## 3. Rules

### 3.1 Which lines form a group (forms 3 and 4): start simple

A group is an unbroken run of **group lines**. Anything else ends it.

- A **group line** is an action line (leading `# v > x`, at any indent) or a consequence/delegated line (leading
  `=> <symbol>` or `=> @name`, at any indent).
- A **parent** is an action line (`# v > x`) that is directly followed by at least one child.
- A **child** is a group line directly below the parent (or below another child) that is
  - indented more than the parent (form 3, and indented form 4), or
  - a `=> <symbol>`/`=> @name` line at the parent's own indent (unindented form 4).
- Depth follows indentation inside the run: a child indented more than the child above it is that child's child.
- **Every other line ends the group:** an empty line, plain text, a bullet, a numbered item without an action symbol,
  an agenda topic (`o . ,`), a plain `=> text` line, a section title or underline. A new action at the parent's indent
  (or less) ends it too and may start the next group.
- Lines after the break are not picked up again: an indented action after an empty line or a note is an ordinary,
  ungrouped action, exactly as today.
- Parents are actions only, never topics or bullets (decided).

Examples:

```
# release 0.34          group: parent + 3 children
  # changelog
  # build
  # announce

# release 0.34          group: parent + 1 child (build)
  # build
  - signing notes       <- bullet: the group ends here
  # announce            <- ungrouped indented action, as today

# release 0.34          no group: the empty line breaks it
                        
  # changelog           <- ungrouped

# onboard Lee           group: unindented form 4
=> # laptop
=> @dana accounts
```

Why this first: no look-back across empty lines, no topics or notes to reason about, and every case can be seen at a
glance. If Marien later wants notes or empty lines inside a group, the rule can be widened without changing how any
existing group looks today.

### 3.2 Steps (form 2)

- A line whose leading part is an action and that has one or more `=> <symbol>` or `=> @name` parts is a sequence.
  Part 0 is the parent, every later such part is a step, numbered 1, 2, 3 in the drawer.
- A plain `=> text` part has no row of its own: it stays with the part before it (the same rule as dimming, §365).
- A `=> @name` step is a row without a checkbox (it has no state), with the person badge.
- A line whose leading part is a topic (`. budget => # send numbers`) is not split: its action parts show as rows
  with the topic as context, as they do now.
- Forms compose: a child line with `=>` steps is a child row with steps under it.

## 4. Editor (forms 3 and 4)

```
☐ release 0.34
├ ☐ changelog
├ ☑ build              <- dimmed like any resolved line
└ ☐ announce
```

- A thin tree line in the indentation: down from under the parent's glyph, an elbow into each child's glyph, ending
  at the last child. For an unindented `=> #` child the elbow runs into the arrow's tail (`└➔ ☐`), so form 4 looks
  connected too.
- Drawn as a CodeMirror layer, like the curved wrap arrow in `wrapIndent.ts`: no characters replaced, no width, no
  line-height or baseline change (editor footprint premises). It runs through wrapped visual lines of the parent.
- Muted color, the same in color and grayscale themes; it dims with the lines it connects (a group with every line
  resolved dims as a whole) and returns to full strength on hover / when the caret is in the group.
- No resolved count in the editor (decided: drawer only).
- Form 1 and form 2 lines: no change.
- Peek, Zen, Section History previews and the read-only viewer use the same layer.

## 5. Action Drawer

```
24 OCT
▾ ☐ release 0.34                 1/3
    ├ ☐ changelog
    └ ☐ announce                       Release    <- source: only on the hovered / selected row
▸ ☐ onboard Lee                  1/3              <- collapsed
  ☐ prepare offsite: book room, send invite, order lunch
```

(Shown with "Only open" on: the resolved child `build` and step ① `laptop` are hidden and counted.)

- Children (form 3/4) are nested rows under the parent with the same tree lines; steps (form 2) are rows with a step
  number and a straight connector, so sequence and checklist read differently at a glance. A step keeps its number
  when earlier steps are hidden.
- Every child and step is a full row: focusable, `Ctrl+Space` cycles *that* symbol, `Enter` jumps to it (the caret
  lands at that part for a step), `Shift+Enter` forwards it. This needs part-level addressing in the drawer (line +
  column of the symbol), which the editor's "a click changes exactly the glyph clicked" already has.
- `Shift+Enter` on a parent forwards the parent line only, as now (decided). Its children stay where they are.
- The parent shows a muted count of resolved children/steps (`1/3`). Display only; it never changes a state.
- **Only open:** a group is shown when the parent or any child is open. The parent is always shown (dimmed when
  resolved) as context for its open children; resolved children and steps are hidden and counted in the `1/3`
  (decided).
- **Text filter:** a match on the parent shows the whole group; a match on a child shows that child with its parent.
- **By due date:** see section 6.
- Row heights and the virtualized list stay as they are (a child row is an ordinary row with a left inset); on the
  phone the inset is capped at two levels.

### 5.1 Collapse and expand

- A parent row (form 2, 3 or 4) gets a chevron in front of its glyph: `▾` expanded, `▸` collapsed. Form 1 and
  ungrouped actions get none (their rows keep the same left edge as now: the chevron sits in a column every
  top-level row reserves).
- Mouse: a click on the chevron toggles; a click anywhere else on the row still jumps to the line. On the phone the
  chevron has its own tap target of full row height.
- Keyboard (the usual tree convention): `Right` expands a collapsed parent, or moves to its first child; `Left`
  collapses an expanded parent, or on a child moves to its parent. `Up`/`Down`, `Enter`, `Shift+Enter` and
  `Ctrl+Space` are unchanged. The rows carry `aria-expanded` and `aria-level` for screen readers.
- Groups open **expanded**. A collapsed group stays collapsed for the session (like the other drawer toggles), keyed by
  note + parent text so it survives lines moving up or down; it is not written anywhere.
- A collapsed parent keeps its count (`1/3`), so you can still see how far along it is.
- The text filter wins over collapsing: a child that matches is shown under its parent even when the group is
  collapsed (the chevron shows `▾` while the filter is active).
- `Shift+Enter` on a collapsed parent still forwards the parent line only (decided).
- Collapsing is a drawer thing only; the editor never hides lines.

### 5.2 The source of a row (cleanup, applies to every row)

Today the note and section (`24 Oct · Release`) sit on every row in italics, at caption size, and they drop below
the action when the pane is narrow. The action should be the focus:

- **One line, right-aligned**, at caption size, in `--muted`, **not italic**. In the normal view it is the section
  (the date is already the group heading); in the due view it is the note's date plus the section
  (`2026-10-24 · Release`), because there the heading is Overdue / Today / ….
- **Only on the hovered or selected (keyboard-focused) row.** Every other row shows the action text alone.
- **Never at the cost of the action:** when the action text and the source do not both fit on the row, the source is
  not shown at all (not truncated, not wrapped). The action text keeps its ellipsis as now. (CSS: the row is a
  fixed-height flex row with wrapping and hidden overflow, so a source that does not fit wraps onto a line that is
  clipped away; no measuring in script.)
- On the phone it stays hidden, as now.
- The full text and source stay available as the row's tooltip, so nothing is lost.
- `.item-breadcrumb` is used only by the Action Drawer, so this changes nothing in the other drawers.

## 6. Due dates (§419) and groups

A due date stays exactly what it is today: it belongs to the action part it stands in, and only that part counts
towards the status bar's overdue item. Grouping only changes what the drawer's **due view** shows around it.

- **A dated parent brings its group.** When a parent has an open own due date, its open children and steps are listed
  under it in the due view (nested, collapsible, with the `1/3` count), also the ones without a date of their own.
  Resolved children are hidden and counted, as in section 5.
- **A dated child brings its parent along as context.** When only a child (or step) has a due date, the group is
  listed too, with the parent as context row and the dated child under it.
- **One place per group.** A group is listed once, in the bucket (Overdue / Today / This week / Later) of the
  **earliest open due date in the group**, parent or child. So a checklist whose parent is due Friday but whose
  `# build by:2026-10-22` is already late shows under Overdue, where it needs to be. Each dated line shows its own
  date pill; undated children show none (no inherited date is drawn).
- **No inheritance in counts or in the text.** An undated child of an overdue parent does not count as overdue in the
  status bar, and nothing is written to the note. (If Marien later wants children to count with the parent's date,
  that is a separate decision.)
- Delegated children (`=> @dana … by:…`) are listed inside a group that is already shown; on their own they bring the
  group into the due view only when the filter has `@`, as delegated lines do now.
- The normal view is unchanged by due dates: groups show as in section 5, each dated line with its pill.

```
OVERDUE
▾ ☐ release 0.34  ⚑ 2026-10-28   1/3
    ├ ☐ build  ⚑ 2026-10-22                      <- the late child places the group under Overdue
    └ ☐ announce
TODAY
▾ ☐ onboard Lee  ⚑ 2026-10-24    0/2
    ① ☐ laptop
    ② ☐ accounts
```

## 7. What does not change

- Status-bar counts: every action still counts on its own (form 1 = 1, form 3 with three children = 4).
- Copy/paste deferral, Enter continuation, `Ctrl/Cmd+1`-`4`, topics: as now. Due dates: as now in the editor and the
  status bar (section 6 is about the drawer's due view only).
- Storage, the three backends and the conformance cases: untouched (all of this is derived from the text).

## 8. Further UX recommendations (each optional, for later)

1. **Convert between forms** (line menu + palette): "Split into sub-actions" turns `# a: b, c, d` into form 3, and
   the reverse. Useful when a quick list turns out to need tracking.
2. **"All steps done" hint:** when every child/step is resolved and the parent is still open, its count turns into a
   quiet `✓ all done` in the drawer. Still no automation.
3. **Next step highlight** for form 2: the first open step gets the accent, later ones stay normal.
4. **Fold a group** in the editor. Only if long groups turn out to be common; needs care with Peek and search.
5. **Widen the grouping rule** (notes, bullets or empty lines inside a group) once the simple rule has been used for
   a while.

## 9. Implementation sketch

- One pure function `actionGroups(lines)` in `src/lib/` returning parents, children (with depth) and steps (with line
  + column); shared by the editor layer and the drawer, with its own table-driven tests (forms 1-4, every kind of
  line that breaks a group, sections, nesting, mixed forms, topic lines).
- `ActionSnapshotItem` gains `parentId?`, `depth`, `stepIndex?` and `column?`; drawer toggling and forwarding take the
  column.
- Due view: `groupByDue` (`src/lib/dueOverview.ts`) works on groups instead of single lines, keyed by the earliest
  open date in the group; the status bar's overdue count keeps counting single lines.
- Drawer: chevron column, `Left`/`Right` handling and the session-only collapsed set (keyed by note + parent text);
  the row list built from groups skips the children of collapsed groups.
- Source cleanup: `.item-breadcrumb` in `src/styles/06-modals.css` loses the italics and the hide-on-hover, is
  shown only on `:hover`/`.selected`, right-aligned, and is clipped away when it does not fit (wrap + fixed row height).
- Editor: a new layer extension next to `wrapIndent.ts`; layout tests for 100/125/150 % (no width or height change).
- Spec, guide (`website/guide.html`) and a CHANGELOG § entry with the change.

## 10. Decisions (Marien, 2026-10-24)

1. Standardise on form 3 for checklists; form 4 keeps being read: **yes**.
2. Topics or bullets as parents: **no**.
3. Drawer `Shift+Enter` on a parent: **forwards the parent line only**.
4. Only open: resolved children are **hidden** (and counted).
5. The resolved count: **drawer only**.
6. Grouping rule: **start simple**: only directly adjacent action / `=> <symbol>` / `=> @name` lines group; any other
   line, empty lines included, ends the group (section 3.1).
7. Due dates: a dated parent brings its open children into the due view (section 6).
8. Groups can be collapsed and expanded in the drawer (section 5.1).
9. The source of a row: small, grey, right-aligned, only on the hovered/selected row, dropped when it does not fit
   (section 5.2).
