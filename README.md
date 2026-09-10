# ChronoNote

A minimalist, keyboard-driven plain-text desktop app for daily notes, meeting
logs, and action items. Tauri v2 (Rust) + Svelte 5 / TypeScript + CodeMirror 6.

See [`docs/spec.md`](docs/spec.md) for the full product/technical spec this
implements.

## Prerequisites

- Node.js 18+ and npm
- Rust (via [rustup](https://rustup.rs))
- Windows: the "Desktop development with C++" workload (MSVC Build Tools)
- macOS: Xcode Command Line Tools
- Linux: see the [Tauri Linux prerequisites](https://tauri.app/start/prerequisites/)

## Development

```bash
npm install
npm run tauri dev
```

## Building an installer

```bash
npm run tauri build
```

## Running tests

```bash
npm run check                    # svelte-check — TypeScript/Svelte type errors
npm test                         # Vitest — unit tests for the frontend's business logic
cd src-tauri && cargo test       # unit tests for the storage layer
```

The suite covers the token/glyph parsing rules (`tokens.ts`), date
handling, section import, the two focus/click Svelte actions, the
controller's tab/action/search/history logic, and the Rust storage layer
(config, note files, session state) — everything that isn't itself a
rendering/layout concern (those are exercised by hand in the running
app; see `docs/CHANGELOG.md` for why a couple of specific bugs, like a
1px icon/label misalignment, needed a real browser rather than a unit
test to actually pin down). A GitHub Actions workflow
(`.github/workflows/test.yml`) runs both suites on every push/PR.

## Where your notes live

Daily notes are plain `.txt` files named `YYYY-MM-DD.txt`, stored in a
configurable root folder (`notes_dir` in the app's `config.json`, defaulting
to `~/Documents/Notes`). Nothing but UTF-8 text ever gets written into a note
file — no database, no front-matter, no injected IDs.

`config.json` lives in the OS-appropriate app config directory (Tauri's
`app_config_dir`, e.g. `%APPDATA%\com.chrononote.app` on Windows).

## What's implemented

- Daily note tabs backed by real files, plus in-memory scratchpad tabs that
  are never written to disk until explicitly promoted (spec 1.3)
- Session restore, remembered per notes folder: reopening the app (or
  switching back to a folder you've used before) reopens the tabs that
  were open last time, with the same tab active — files deleted in the
  meantime are silently skipped. Today's dated tab is always opened too,
  and becomes the active tab if the previously-active one couldn't be
  restored. State lives in a small `.chrononote-session.json` file inside
  each notes folder, so it travels with the folder rather than living in
  a growing global list.
- Token → glyph rendering in the editor (`# ` → `☐`, `v ` → `☑`, `> ` → `»`,
  `x ` → `☒`, `- `/`* ` → `•`, `=> ` / `=> @name` / `=> <symbol>` → `➔`,
  `! ` → bold emphasis) via a CodeMirror decoration plugin — the file on
  disk never contains the glyphs, only the raw tokens (spec 2.2). Every
  glyph occupies *exactly* the character width of the token it replaces
  (2ch, or 3ch for `=> `), forced via CSS rather than trusted to the
  glyph's natural rendered width, since a single Unicode symbol doesn't
  reliably occupy one monospace cell in every font. `@name` on a `=> `
  line stays real, live, editable text (just styled as a badge), not
  baked into the glyph — fix a typo in it like any other text, or
  backspace right after the arrow to remove the whole `=> ` glyph in one
  step; it's highlighted wherever it appears on the line, not only right
  after the arrow, may contain a hyphen (`@jean-luc`), and may be written
  parenthesised (`(@name)`). `=> <symbol>` (any of `#`/`v`/`>`/`x`, mutually
  exclusive with `=> @name`) marks a consequence-action — a task that
  follows from the line before it, with its own open/closed/deferred/
  won't-do state, cycled with `Ctrl+Space` the same as a standalone
  action line. A `(topic)` tag immediately after the action symbol
  (`# (billing) …`) is highlighted, for grouping actions by subject.
  Clicking an action glyph cycles its state
  (`# → v → > → x`); hovering it first previews the next state. All four
  action symbols (standalone or after `=> `) may be indented in two-space
  increments, the same as bulleted lists. Glyphs are theme-driven
  (weight/opacity in grayscale mode, color in color mode) and their
  replaced tokens are atomic for selection, so copy-paste always includes
  the intact raw text. Selection/cursor rendering uses CodeMirror's own
  `drawSelection()` (coordinate-based) rather than native browser
  selection, so the highlight correctly covers a glyph's full box instead
  of just the text around it.
- Bulleted lists (`- ` or `* `, nesting via two-space indents — `Tab` on a
  bullet line already nests it correctly): `Enter` continues the list with
  a fresh bullet using whichever marker the line already has (or exits the
  list from an empty one), `Shift+Enter` adds a plain continuation line
  aligned under the bullet's text (two spaces past the bullet's own
  indentation) with no new bullet. `Enter` on an action line continues it
  as a fresh open `# ` action; on a `=> ` line it continues as another
  `=> ` follow-up (a `=> # ` consequence-action continues as `=> # `).
  With the caret before the leading token, `Enter` is a plain newline.
- Copying a `# ` line and pasting it into today's note, or any later-dated
  note, marks the original as deferred (`> `) back in its source file/tab
  — copying several lines together defers every open action found in the
  copy, not just one at its start.
- Safety modal blocking tab close for two independent reasons: unresolved
  open actions, or a non-empty scratchpad (which would otherwise be
  permanently lost, since scratchpads are never written to disk) — with
  proper keyboard navigation (Cancel is focused on open, Escape cancels).
  `Ctrl+Shift+T` / `Ctrl+Shift+N` reopen the most recently closed tab, with
  a multi-level history, as a second layer of recovery.
- Date picker (`Ctrl+O`, with a toggle to show only dates with open
  actions — remembered for the rest of the session, off by default),
  cross-tab action drawer (`Ctrl+Shift+A`, items you complete with
  `Ctrl+Space` stay visible until you close the drawer, plus a toggle —
  remembered for the session, on by default — to show every open/
  deferred/delegated/done/won't-do line or strictly open ones only),
  section history (`Ctrl+Shift+H`), cross-tab search (`Ctrl+Shift+F`), and
  manual section import (`Ctrl+Shift+I`) — paste freeform lines and each
  becomes a new section header, appended to the current note. Both the
  action drawer and search can toggle between scanning only open tabs or
  every file in the notes folder, consistently ordered most-recent-first
  either way. The action drawer and section history both open focused on
  whatever entry belongs to the tab that was active when you opened them.
  The action drawer shows only each line's glyph (not the raw token
  character) alongside its text, and its section-title tag is capped to
  half the row's width, temporarily giving that space back to the action
  text on hover. Section history shows a deduped, most-recent-first list
  of the section's actions and follow-ups across every dated note (one row
  per action, showing just the text after a mid-line `=>`), plus a
  "Previous occurrence" pane — the first few lines of that section as it
  stood at its last occurrence before the current note, glyph-rendered,
  with a jump to the source. If the import drawer is
  closed without importing, the unsubmitted text is remembered (in memory
  only, cleared on a notes-folder switch) and offered back — pre-filled
  and selected — next time it opens.
- `Tab`/`Shift+Tab` indent/dedent inside the editor; `Ctrl+Tab` /
  `Ctrl+Shift+Tab` cycle between open note tabs; `Ctrl+N`/`Ctrl+T` open a
  new scratchpad; `Ctrl+Shift+S` turns the current line into a section
  header, leaving the cursor on a fresh line ready to type
- Tabs stay ordered chronologically (earliest to latest, left to right),
  with scratchpads always after every dated tab, and the strip
  automatically scrolls to keep the active tab in view whenever you switch
  tabs by any means. "New Scratchpad" always stays visible and icon-only
  regardless of scroll position, next to the (also always-visible-once-
  overflowing) `←`/`→` scroll buttons — clicking either at an edge wraps
  around to the other end, the same cyclic behavior as `Ctrl+Tab`/
  `Ctrl+Shift+Tab`. If the window is maximized/fullscreen and space gets
  tight, the action buttons' labels collapse to icon-only first to reclaim
  room, before the scroll buttons are needed at all.
- Switching away from a tab and back resumes exactly where you left off —
  the cursor position and how far you'd scrolled are both remembered per
  tab for the rest of the session (not persisted across restarts).
- The window title shows the current notes folder's name (just the folder,
  not the full path) — e.g. "ChronoNote - Notes" — updating live if you
  switch folders via Settings.
- Status bar shows cursor line/column, word count, Open / Closed /
  Forwarded action counts (`x`, won't-do, folds into Closed alongside `v`,
  done), and — while text is selected — how many lines the selection spans
- Debounced autosave, with immediate flush on tab switch/close
- Settings panel (`Ctrl+,`, gear icon): toggle between a full-color and a
  grayscale-only UI theme (glyphs, tab/status-bar accents, and search
  highlight all follow it, including in the action drawer and section
  history), and change the notes folder via a native "Browse…" dialog —
  or pick from up to 5 recently-used folders listed right there, no
  dialog needed. Changing the folder is treated as switching
  projects/scopes: it closes every open tab and reloads everything from
  the new folder, blocking the switch first if any scratchpad has content
  that was never promoted (the only state that would actually be lost)
- `Ctrl+/` opens a shortcuts help drawer listing every keybinding;
  `Ctrl+Shift+/` opens a Symbols & Sections legend explaining every
  token → glyph mapping and how section headers are formatted. Both
  drawers move keyboard focus into their own scrollable list on open, so
  arrow keys/Page Up/Page Down/Home/End scroll the drawer instead of the
  editor behind it, while every global shortcut (including `Escape`)
  keeps working regardless of where focus sits.
- An About drawer (the "ℹ" icon, right of the Settings gear) shows the
  project's GitHub link — opened in the OS's default browser — and the
  currently-running version number, read live rather than hardcoded.
- Top-bar buttons show icon+label when the window is maximized or
  fullscreen, and collapse to icon-only otherwise
- Launches without the white-flash-before-dark-theme most Tauri apps show:
  the window's native background is set to match the OS theme before it's
  ever shown. Restoring a previous session's tabs (§34) also reads them
  all in parallel rather than one at a time, for a faster time-to-typable.
- Thin, theme-matched scrollbars (editor, modal lists, the import
  textarea) in place of the OS-default ones, including a custom resize
  grip icon on the import textarea.

## License

[MIT](LICENSE)
