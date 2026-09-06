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
  `- ` → `•`, `=> ` / `=> @name` → `➔`, `! ` → bold emphasis) via a
  CodeMirror decoration plugin — the file on disk never contains the
  glyphs, only the raw tokens (spec 2.2). Every glyph occupies *exactly*
  the character width of the token it replaces (2ch, or 3ch for `=> `),
  forced via CSS rather than trusted to the glyph's natural rendered width,
  since a single Unicode symbol doesn't reliably occupy one monospace cell
  in every font. `@name` in a delegated follow-up stays real, live,
  editable text (just styled as a badge), not baked into the glyph — fix a
  typo in it like any other text, or backspace right after the arrow to
  remove the whole `=> ` glyph in one step. Glyphs are theme-driven
  (weight/opacity in grayscale mode, color in color mode) and their
  replaced tokens are atomic for selection, so copy-paste always includes
  the intact raw text. Selection/cursor rendering uses CodeMirror's own
  `drawSelection()` (coordinate-based) rather than native browser
  selection, so the highlight correctly covers a glyph's full box instead
  of just the text around it.
- Bulleted lists (`- `, nesting via two-space indents — `Tab` on a bullet
  line already nests it correctly): `Enter` continues the list with a
  fresh bullet (or exits the list from an empty one), `Shift+Enter` adds a
  plain continuation line aligned under the bullet's text (two spaces past
  the bullet's own indentation) with no new bullet.
- Copying a `# ` line and pasting it into today's note marks the original
  as deferred (`> `) back in its source file/tab.
- Safety modal blocking tab close for two independent reasons: unresolved
  open actions, or a non-empty scratchpad (which would otherwise be
  permanently lost, since scratchpads are never written to disk) — with
  proper keyboard navigation (Cancel is focused on open, Escape cancels).
  `Ctrl+Shift+T` / `Ctrl+Shift+N` reopen the most recently closed tab, with
  a multi-level history, as a second layer of recovery.
- Date picker (`Ctrl+O`), cross-tab action drawer (`Ctrl+Shift+A`, items you
  complete with `Ctrl+Space` stay visible until you close the drawer),
  section history (`Ctrl+Shift+H`), cross-tab search (`Ctrl+Shift+F`), and
  manual section import (`Ctrl+Shift+I`) — paste freeform lines and each
  becomes a new section header, appended to the current note. Both the
  action drawer and search can toggle between scanning only open tabs or
  every file in the notes folder, consistently ordered most-recent-first
  either way. If the import drawer is closed without importing, the
  unsubmitted text is remembered (in memory only, cleared on a notes-folder
  switch) and offered back — pre-filled and selected — next time it opens.
- `Tab`/`Shift+Tab` indent/dedent inside the editor; `Ctrl+Tab` /
  `Ctrl+Shift+Tab` cycle between open note tabs; `Ctrl+N`/`Ctrl+T` open a
  new scratchpad; `Ctrl+Shift+S` turns the current line into a section
  header, leaving the cursor on a fresh line ready to type
- Tabs stay ordered chronologically (earliest to latest, left to right),
  with scratchpads always after every dated tab; "New Scratchpad" sits
  directly next to the rightmost tab rather than off with the other
  buttons, and always stays icon-only (no label, even when the others show
  one). When there are more tabs than fit, `←`/`→` buttons appear to
  scroll the strip — and if the window is maximized/fullscreen and space
  gets tight, the action buttons' labels collapse to icon-only first to
  reclaim room, before the scroll buttons are needed at all.
- The window title shows the current notes folder's name (just the folder,
  not the full path) — e.g. "ChronoNote - Notes" — updating live if you
  switch folders via Settings.
- Status bar shows Open / Closed / Forwarded action counts
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
- `Ctrl+/` opens a shortcuts help drawer listing every keybinding
- Top-bar buttons show icon+label when the window is maximized or
  fullscreen, and collapse to icon-only otherwise
- Launches without the white-flash-before-dark-theme most Tauri apps show:
  the window's native background is set to match the OS theme before it's
  ever shown. Restoring a previous session's tabs (§34) also reads them
  all in parallel rather than one at a time, for a faster time-to-typable.
- Thin, theme-matched scrollbars (editor, modal lists, the import
  textarea) in place of the OS-default ones, including a custom resize
  grip icon on the import textarea.
