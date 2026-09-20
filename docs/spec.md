# ChronoNote: Master Technical & Product Specification

**Document Version:** 1.2.0 (amended — reflects the state through
`CHANGELOG.md` §188; the Android target and OneDrive sync described in §7.6
are released as of v0.10.0, and OneDrive sync in the web app (§7.3) as of v0.11.0)
**Target Environment:** Cross-platform native desktop (Windows / macOS /
Linux), an Android app, plus a browser-storage web app and a
zero-retention public demo
**Reference Architecture:** Tauri v2 (Rust) + Svelte 5 / TypeScript +
CodeMirror 6

> This document has been amended in place to reflect changes agreed after
> the first working build. See [`CHANGELOG.md`](CHANGELOG.md) for the full
> history and rationale behind every amendment — this note won't try to
> enumerate them all as the list keeps growing.

---

## 1. Intent & Architectural Principles

ChronoNote is a minimalist, keyboard-driven plain-text application engineered to replace Microsoft Notepad for tracking meetings, daily logs, and action items.

### Core Tenets
1. **Zero Database / Pure Plain Text:** Persistence is 100% human-readable ASCII/UTF-8 `.txt` files (desktop) or an equivalent plain-record store (the web app's IndexedDB tier — see §7). No SQLite layer, no proprietary syntax markers, no YAML front-matter, and no persistent UUIDs injected into note bodies.
2. **Tabular Monospace Grid Preservation:** Specialized tokens (`# `, `v `, `> `, `x `, `- `/`* `, `=> `, `! `) are visually replaced on screen using virtual presentation masking. Characters in memory match file bytes on disk; visual overlays occupy *exactly* the same typographic character width as the token they replace — forced via explicit CSS sizing rather than trusted to a glyph's natural rendered width, since a single Unicode symbol doesn't reliably occupy exactly one monospace cell in every font — so column alignments never break.
3. **Fail-Safe Task Protection:** Tabs cannot be closed silently if unresolved tasks (`# `) exist, or if a scratchpad holds content that was never promoted — since scratchpads are never written to disk, closing one unwarned would destroy that content permanently. A multi-level "reopen closed tab" history is a second layer of recovery on top of that warning.
4. **Calendar-Aware Sections:** A day's meetings become note sections automatically, from a `.agenda.json` file in the notes folder kept up to date by whatever external process the user syncs their real calendar with ("Sync calendar for this day," opt-in — see §3.4) — a reconciliation engine matches existing sections to the day's agenda by title, reorders/creates sections to match, and reviews (rather than silently drops) any section whose meeting is no longer on the agenda. An earlier manual "Sync from a list…" paste entry point into the same engine was dropped once the automatic file-based sync covered the case it existed for.
5. **One Frontend, Three Backends:** The entire UI above the storage layer is backend-agnostic — every interaction goes through one typed command surface (`TauriCommands`), never a direct Rust/IPC call. Three implementations of that surface exist (real Tauri IPC — desktop and Android alike — an IndexedDB-backed web app, and an in-memory mock for the demo and test suite), so the same Svelte components, editor, and controller logic run unmodified across all of them — see §7.
6. **Platform-Correct Shortcuts, Not Platform-Specific Code:** Every keyboard shortcut is `Ctrl` on Windows/Linux and `Cmd` on macOS, resolved from one shared registry rather than duplicated per platform — see §4.

---

## 2. Storage & Syntax Specification

### 2.1 Storage Structure
* **Root Storage Directory (desktop):** Configurable via `config.json` (defaults to `~/Documents/Notes/`).
* **Root Storage (web app):** A single IndexedDB database in the browser's own per-origin storage — no folder concept; see §7.3.
* **Daily File Naming Scheme:** ISO 8601 strict format: `YYYY-MM-DD.txt`.
* **Session State:** Which tabs were open and which was active is remembered per notes folder in a `.chrononote-session.json` file written inside that folder (not in the global `config.json`), so it travels with the folder rather than accumulating in a global list, and restores automatically both on app launch and when switching back to a previously-used folder. It is excluded from every note-scanning path by the same strict `YYYY-MM-DD.txt` filename check that governs daily files. The web app keeps the equivalent session record as its own IndexedDB entry.

### 2.2 Token Semantics & Dynamic Glyph Replacement

Every glyph is at most 2 characters (3 for `=> `), matching — never
exceeding — the character width of the token it replaces, forced via
explicit CSS `ch`-unit sizing on each glyph so column alignment holds
regardless of how a given symbol naturally renders in the active font.
Glyphs are theme-driven — weight/opacity distinguish them in grayscale
mode, color in color mode (Settings, `Ctrl/Cmd+,`) — and each *replaced*
span is an atomic unit for text selection, so selecting or copying a line
always includes the glyph's full underlying token. `@name` in a delegated
follow-up is the one exception: it's styled as a badge but stays real,
live, editable text, not part of the replaced/atomic span — fix a typo in
it directly, or backspace immediately after the arrow glyph to remove the
whole `=> ` token in one step, as if un-delegating the line.

| Raw Plain Text | Visual Presentation | Semantic Meaning | Lifecycle & Closing Impact |
| :--- | :--- | :--- | :--- |
| `# ` | `☐` | **Open Action (Self)** | **Unresolved.** Blocks tab closure with a safety modal (for a note dated today or earlier; a future-dated note closes silently — #76). Counted in status bar (Open). |
| `v ` | `☑` | **Completed Action (Self)** | **Resolved.** Counted in status bar (Closed). |
| `> ` | `»` | **Deferred Action (Self)** | **Resolved for origin day.** Represents a task forwarded to another day (typically today). Does not block tab close. Counted in status bar (Forwarded). |
| `x ` | `☒` | **Won't-Do Action (Self)** | **Resolved.** Distinct from `v ` (was done) — this one won't happen at all. Folds into the same status-bar bucket as `v ` (Closed). |
| `- ` or `* ` | `•` | **Bulleted List Item** | Purely structural — not an action, not counted anywhere, doesn't block tab close. May be indented in two-space increments to nest (see 2.4). `-` and `*` are interchangeable; both render identically. |
| `=> ` | `➔` | **Consequence / Follow-up** | Informational note or meeting outcome. |
| `=> @name` | `➔` + editable `@name` badge | **Delegated Action** | Action owned by another individual, with no action-state of its own. `@name` stays real text — edit it directly to fix a typo. The name may contain a hyphen (`@jean-luc`); on a `=> ` line it is badged wherever it appears, not only right after the arrow, and may be written parenthesised, `(@name)`. |
| `=> <symbol> ` (`<symbol>` = `#`/`v`/`>`/`x`) | `➔` + the symbol's own glyph | **Consequence Action** | An action that is itself a consequence of the line (or text) before it — not delegated to anyone. Counts toward the same status-bar bucket its inner symbol would on its own. Mutually exclusive with `=> @name` — a line is either delegated-to-a-person or a consequence-action, never both. |
| `(topic)` (right after the action symbol) | `(topic)` in a muted outlined pill | **Topic tag** | Groups actions by subject. Only recognised immediately after a leading `# `/`v `/`> `/`x ` or a `=> <symbol> `; a parenthesised word anywhere else, or in prose, stays plain text. Not counted anywhere. |
| `! ` | rest of line rendered bold, in an emphasis color | **Emphasis / Remember** | Purely informational — not an action, not counted anywhere, doesn't block tab close. Searchable like any other line via Cross-Tab Search; no dedicated drawer. |
| `Heading\n====` | Setext H1 Display | **Section / Meeting Header** | Section delimiter for manual section import and meeting action history. |

A resolved line (`v `, `x `, or a `=> v `/`=> x ` follow-up) is drawn slightly dimmed so open work stands out;
it returns to full strength on hover and while the caret or selection is on the line. Deferred (`> `) lines and
section titles are never dimmed.

All four action symbols (`# `/`v `/`> `/`x `) may be indented in two-space
increments, the same as bulleted list items — the indentation is real,
untouched whitespace; only the symbol itself is replaced. Clicking an
action glyph cycles its state (`# → v → > → x → #`); hovering it first
previews the next state without committing it.

**Copy/paste deferral:** copying a `# ` line and pasting it into today's
note, or into any *later*-dated note, marks the original line as `> `
(deferred) back in its source file/tab — a quick way to forward a task
without manually editing the original. Copying several lines together
defers every open-action line found anywhere in the copied block, not
just one at its start — other lines in the same copy (plain text,
bullets, already-resolved actions) are left as they were. Pasting into a
scratchpad or a past-dated note does not trigger this. Undoing or
redoing the paste correctly un-defers or re-defers the source line in
its own tab, even if the source tab isn't the active one.

### 2.3 Structural Spacing Rules
* **Inter-Section Spacing:** All automated insertions (section import, templating) must enforce **two blank lines** (`\n\n\n`) between the end of a section body and the subsequent Setext heading line.

### 2.4 List Nesting
* **Bulleted Lists:** A `- ` or `* ` at the start of a line (optionally indented) renders as `•`; the leading whitespace itself is untouched, real, visible indentation — only the marker is replaced. Nesting is two spaces per level, which is also exactly what pressing `Tab` on a bullet line already produces (the editor's indent unit is fixed at two spaces for this reason), so no bullet-specific indent handling is needed beyond that. Continuing a list with `Enter` reuses whichever marker character (`-` or `*`) the current line already has.
* **List Continuation:** Inside a bulleted line, `Enter` continues the list with a fresh bullet at the same indentation (or exits the list if the current bullet is empty); `Shift+Enter` adds a plain continuation line indented two spaces *past* the bullet's own indentation — aligned under the bullet's text, not the marker — with no new bullet. `Enter` on a leading-symbol action line continues it as a fresh open `# ` action at the same indent (empty line + `Enter` exits); `Enter` on a `=> ` follow-up continues as another plain `=> `, or as `=> # ` if the line was itself a `=> <symbol>` consequence-action.

---

## 3. Visual Design & Chrome Layout

The visual chrome mirrors the uncluttered footprint of modern system text editors (e.g., Windows 11 Notepad). It matches the OS's Light or Dark mode by default, or an explicit Light/Dark choice in Settings (`Ctrl/Cmd+,`) overrides that.

### 3.1 Iconography

Every UI icon — the top bar, every modal header, the tab strip, the find
bar and date-picker's chevrons — is one monoline SVG set
(`src/lib/icons/`), not emoji: a shared 24×24 grid, one stroke weight,
`stroke: currentColor`. Each mark is drawn from the app's own vocabulary
(the section rule, the dated page, the action box, the `»` forward mark)
rather than a generic icon-font pick, so the set reads as this app's. A
modal header reuses the exact same icon as the top-bar action that opens
it. Chrome icons take the surrounding text colour in every glyph-colour
mode (`--text` in the top bar, `--muted` in a modal header) — never a
semantic hue, which stays reserved for the editor glyphs (2.2). The
application (OS) icon is a separate, static baked asset (regenerated from
a master SVG via `npx tauri icon <master>`, since it can't follow a
runtime setting) — it's the same "dated page under its rule" mark the
in-app date-note action uses, white-knocked-out on the accent tile, so
the taskbar icon and the toolbar button read as one thing
(`docs/design/icon-A-master.svg`).

### 3.2 Top Bar & Tab Strip

On the desktop app, the top bar *is* the window's title bar — the native
OS title bar is disabled (`decorations: false`) and this one bar replaces
it entirely: the app icon at the leading edge, then the tab strip and
action buttons (unchanged from before), then minimize/maximize/close at
the trailing edge. No window title text renders anywhere in-window (the
OS still tracks one — `ChronoNote - <folder>` — for the taskbar and
Alt+Tab, just nothing draws it inside the window). The bar's own
background (outside the tabs/buttons) and the empty space in the tab
strip past the last tab are both drag regions for moving the window;
double-clicking either toggles maximize. This only applies to the real
desktop build — the demo and web app have no OS window at all (an
iframe / a browser tab) and keep a plain top bar with no icon, no window
controls, no drag regions.

The top bar hosts the tab strip and a row of action buttons (New
Scratchpad, Open Date Note, Actions, Section History, Cross-Tab Search,
Sync Calendar for This Day (only once turned on in Settings — see §3.4),
Promote-scratchpad when applicable, Settings) as
fixed-width siblings of the scrollable tab strip, not inside it. Tabs
stay ordered chronologically (earliest to latest, left to right), with
scratchpads always after every dated tab; the strip auto-scrolls to keep
the active tab in view on every switch. Tab labels drop the `.txt`
extension; middle-click closes a tab.

A four-tier, measurement-driven responsive system keeps the bar usable
as the window narrows, each tier only engaging once the previous one
still doesn't leave enough room (re-evaluated on resize via a
`ResizeObserver`, with an anti-flicker discipline — decide from the
current state, require clearing a margin before flipping back):
1. Full width: every button shows icon + label.
2. Labels collapse to icon-only.
3. If tabs still overflow, the scroll-arrow (`←`/`→`) pair appears at
   the ends of the tab strip — clicking either at an edge wraps around
   to the other end, the same cyclic behavior as cycling tabs by
   keyboard.
4. If icon-only buttons still leave the tab strip overflowing, every
   secondary action button (Actions/History/Search/Import/Promote/
   Settings) collapses into one "More actions" button, opening an
   anchored, non-modal popover listing them with their shortcuts. New
   Scratchpad and Open Date Note are never collapsed — they stay pinned
   and visible at every tier.

### 3.3 Status Bar

Three zones, left to right: the active notes folder's name, cursor
line/column, and word count on the left (plus, while text is selected,
how many lines the selection spans) — the folder name is the
lowest-priority item here, first to hide as the window narrows, and
shows the full path on hover; it moved here (from Settings-only) once
the merged title bar stopped rendering a visible window title anywhere;
a centre zone reserved for transient status messages (autosave
confirmations, "nothing to import," etc.), empty otherwise; and a right
zone showing Open / Closed / Forwarded action counts for the active
note (`x`, won't-do, folds into Closed alongside `v`, done), the
currently-running version number (clicking it opens About), an
update-available icon when relevant (also opens About), the `?`
Shortcuts & Symbols trigger, and — last — an About icon (moved here from
the top bar, #58 — always reachable regardless of window width instead
of competing with the tab strip for room).

On Android (§7.6) the left zone also carries a cloud item showing the
OneDrive sync state (folder name, "Syncing…", "Offline" or "Sync error";
tapping it opens Settings), and — only while the sync is holding a note
back for the user — an amber "⚠ N sync conflict(s)" item that opens the
Sync conflicts drawer (§5).

### 3.4 Settings

Settings (`Ctrl/Cmd+,`) is a tabbed dialog — Appearance / Notes & Sync /
Updates (the last dropped entirely in the web app, where nothing in it
applies; the tab labels are the same on every platform) — grouping
independent controls:

**Appearance** (theme, glyph palette and editor)
- **Theme:** Light / Dark / System for the app's own chrome (System
  follows the OS setting and is the default).
- **Glyph palette:** Color / Grayscale / Legacy — a three-way choice
  independent of the chrome theme above. Glyphs, tab/status-bar accents,
  and search highlighting all follow it, including inside the action
  drawer and section history. Color is the default for a fresh install;
  Legacy restores the pre-0.6 per-action colour scheme (red open, amber
  deferred, green done, grey won't-do, blue follow-up, yellow emphasis)
  for anyone who prefers it.
- **Editor width:** Full / Wrap / Reading column — Full keeps every line
  unwrapped (for tables and aligned columns), Wrap breaks long lines to
  fit the window, Reading column additionally caps the text to a
  comfortable centred measure.

**Notes & Sync** (calendar, notes location and data)
- **Calendar** (desktop only): a single opt-in toggle, "Show 'Sync
  calendar for this day'" (off by default) — the top-bar/More-actions/
  command-palette button for it doesn't exist at all until turned on.
  Once shown, the button is grayed out (not hidden) rather than removed
  whenever `.agenda.json` doesn't exist in the notes folder yet, or the
  active tab isn't dated today or later. See §5 for what it does once
  enabled and ready.
- **Notes folder** (desktop only): changeable via a native "Browse…"
  dialog, or from up to 5 recently-used folders listed inline with no
  dialog needed. Switching folders is treated as switching
  projects/scopes — it closes every open tab and reloads from the new
  folder, blocking the switch first if any scratchpad holds content
  that was never promoted (the only state that would actually be lost).
- **Data (export/import)**, shown identically on the desktop app and the
  web app: exports every note as a single bundle file, and imports one
  back in with merge-skip-duplicates semantics — see §7.3.
- **OneDrive cloud sync** (Android and the web app; neither has an
  Updates tab): connect a Microsoft
  account, browse to or create the OneDrive folder to sync the notes folder
  with, "Sync now" (which reports success or the reason for failure), sign
  out, and an "Advanced" disclosure for a client-ID and tenant override
  for work/school accounts. See §7.6.

**Updates** (desktop only — nothing to check for in the web app, where
a page reload always serves the latest deployed version): an
auto-check-on-launch toggle (on by default) and a "Check now" button.

### 3.5 Launch Behavior

The app launches without the white-flash-before-dark-theme most Tauri
apps show — the window's native background is set to match the OS/app
theme before the window is ever shown. Restoring a previous session's
tabs reads them all in parallel rather than one at a time, for a faster
time-to-typable. Scrollbars throughout (editor, modal lists, the import
textarea) are thin and theme-matched rather than the OS default.

### 3.6 Modal Dialog System & Mobile Ergonomics (v0.12.1 / Release B)

Every modal dialog conforms to a standardized 4-tier sizing scale, universal dismiss affordance, and responsive layout reflow:

1. **Standardized Sizing Scale:** Semantic classes apply fluid max-width constraints (`min(100%, var(--modal-width, 720px))` and `max-width: calc(100vw - 24px)`):
   * `.modal-sm` (440px): Compact single-choice prompts (`AboutModal`, `SafetyModal`, `UnsavedScratchpadsModal`, `MigrateNotesModal`).
   * `.modal-md` (560px): Standard single-column settings and form views (`SettingsModal`, `ConflictModal`, `SyncConflictsModal`, `CommandPaletteModal`).
   * `.modal-lg` (720px): Multi-column list views and table searches (`ActionDrawerModal`, `SearchModal`, `CalendarSyncReviewModal`, `OneDriveFolderPickerModal`).
   * `.modal-xl` (880px): Deep data inspectors and dual-column browsers (`HistoryModal`, `ShortcutsModal`).
2. **Universal Dismiss Affordance:** Every modal card provides a monoline `✕` icon button (`.modal-close-btn`, 32×32px, expanded to 44×44px hit-box under coarse pointers) in the top-right corner, ensuring clear, accessible exit affordance for mouse and touch users alike.
3. **Command Palette Mobile Chips:** Prefix filter indicators (`>`, `!`, `@`, `?`) render as interactive tap-chips (`.palette-chip`) allowing quick mode changes on touch screens. Under mobile viewports and coarse pointers, desktop keyboard navigation footers and shortcut hint tags are suppressed.
4. **Adaptive Multi-Column Layouts (≤ 680px / ≤ 520px):**
   * `ShortcutsModal`: Reflows side-by-side columns into a top segmented switcher (`[ Shortcuts ] [ Glyphs & Symbols ]`) with touch-friendly row heights.
   * `HistoryModal`: Reflows into an adaptive tab switcher (`[ History List ] [ Occurrence Preview ]`) where selecting an item immediately activates the preview pane with quick action buttons ("Import Action", "Open Note").
   * `SyncConflictsModal`: Replaces side-by-side split on small screens with a segmented view switcher (`[ Side-by-Side ] [ This Device ] [ OneDrive ]`).
   * `CalendarSyncReviewModal`: Reflows removal rows into a stacked two-row card.
5. **Mobile Ergonomics & Dynamic Floating Toast:** On mobile form factors (`$isMobile`), transient messages float below the top bar in a pill banner (`.mobile-toast`, `role="status"`, `aria-live="polite"`), avoiding interference from on-screen keyboards. Modals and popovers feature dark mode luminance borders with inset highlights (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 16px 44px rgba(0, 0, 0, 0.5)`).

---

## 4. Keyboard Shortcuts & Platform Awareness

Every shortcut resolves to `Ctrl` on Windows/Linux and `Cmd` on macOS
from one shared registry (`src/lib/shortcuts.ts`), read by the
window-level key handler and by every place a shortcut is *displayed*
(the Shortcuts & Symbols drawer, the command palette's hints, tooltips)
— there is exactly one definition per shortcut, not independently
hand-maintained copies. Matching is strict: a binding fires only with
the platform-correct modifier, never either, so the displayed label is
always an accurate description of what actually works. The in-app
Shortcuts & Symbols drawer (`Ctrl/Cmd+/` or `Ctrl/Cmd+Shift+/`) always
shows the exact, current, platform-correct list — the table below is a
snapshot for reference, not the source of truth.

| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| Command palette | `Ctrl+K` | `Cmd+K` |
| New scratchpad | `Ctrl+N` / `Ctrl+T` | `Cmd+N` / `Cmd+T` |
| Reopen closed tab | `Ctrl+Shift+T` / `Ctrl+Shift+N` | `Cmd+Shift+T` / `Cmd+Shift+N` |
| Open/create a dated note | `Ctrl+O` | `Cmd+O` |
| Close tab (or middle-click) | `Ctrl+W` | `Cmd+W` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `Cmd+Tab` / `Cmd+Shift+Tab` |
| Undo / redo (per tab) | `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` | `Cmd+Z` / `Cmd+Shift+Z` |
| Cycle action state on the current line | `Ctrl+Space` or `Ctrl+Enter` | `Cmd+Enter` only |
| Jump to next / previous open action | `F2` / `Shift+F2` | `F2` / `Shift+F2` |
| Caret to line start, then previous/next line start | `Ctrl+↑` / `Ctrl+↓` | *(not offered — Mac keeps the OS's own page-scroll on these keys)* |
| Convert current line to a section header | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| Actions (cross-tab action drawer) | `Ctrl+Shift+A` | `Cmd+Shift+A` |
| Section history | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| Find in this note | `Ctrl+F` | `Cmd+F` |
| Cross-tab search | `Ctrl+Shift+F` | `Cmd+Shift+F` |
| Sync calendar for this day | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| Settings | `Ctrl+,` | `Cmd+,` |
| About ChronoNote | `Ctrl+Shift+,` | `Cmd+Shift+,` |
| Shortcuts & Symbols drawer | `Ctrl+/` / `Ctrl+Shift+/` | `Cmd+/` / `Cmd+Shift+/` |
| Indent / dedent (in editor) | `Tab` / `Shift+Tab` | `Tab` / `Shift+Tab` |

Three combos are deliberately **not** made Mac-aware, each for a
specific reason recorded alongside its binding:
- **`Ctrl+Space`** (action-state cycle) collides with macOS's own
  input-source-switcher shortcut — `Cmd+Enter` is the reliable Mac
  binding for the same action instead.
- **`Ctrl+Y`-as-redo** isn't how CodeMirror's own history keymap binds
  Mac at all (`Cmd+Shift+Z` is the native Mac redo there already), so
  no Mac alias is offered for `Ctrl+Y` specifically.
- **`Ctrl+↑` / `Ctrl+↓`** (caret-to-line-start navigation) is
  Windows/Linux-only by design — macOS keeps CodeMirror's own default
  page-scroll behavior on those keys instead, and the Shortcuts drawer
  drops the row entirely on Mac rather than show a non-working combo.

The Action Drawer's own local `Ctrl+Space` (cycle the focused row's
action state without leaving the drawer) is a fourth, narrower case:
its `Enter` key already means "jump to that line," so a `Cmd+Enter`
alias would collide with that existing binding — left as a known,
documented Mac limitation (a mouse click on the row's glyph always
works there instead).

---

## 5. Navigation & Bulk-Action Drawers

Six drawers, all opened as a focused, non-blocking modal or anchored
popover, all dismissed with `Escape` or an outside click, and all
reachable from the top bar, a shortcut, or the command palette:

- **Command Palette** (`Ctrl/Cmd+K`) — fuzzy-searches and runs any
  command, jumps to an open tab, or opens a dated note, from one input,
  highlighting the matched characters. A "Current line" group runs the
  line operations (close/reopen, set to open/done/deferred/won't-do,
  convert to section, jump to next/previous open action) on the selection
  the editor had when the palette opened, and a command exports all notes
  to a `.json` file.
- **Date Picker** (`Ctrl/Cmd+O`) — an anchored month-grid calendar
  popover; a toggle (remembered for the session, off by default) shows
  only dates with open actions. A day reads brighter/bold once its note
  actually has content — merely visiting a date (creating its tab, never
  typing into it) doesn't count. Opens on the active tab's own month
  with that day highlighted (falling back to today for a scratchpad,
  which has no date of its own), rather than always defaulting to today.
  A dot under a day shows its state: green (has actions, none open),
  amber (has open actions), dim (a note with no actions).
- **Action Drawer** (`Ctrl/Cmd+Shift+A`) — lists actions across either
  just the open tabs or every file in the notes folder (a per-session
  toggle), most-recent-first either way. A second toggle (remembered for
  the session, on by default) switches between showing every open/
  deferred/delegated/done/won't-do line or strictly open ones only.
  `Ctrl+Space` on a focused row cycles its state in place; `Enter` jumps
  to it; `Shift+Enter` forwards it to today (source becomes `> `,
  today's note gets a fresh `# ` copy on top). Opens focused on whatever
  entry belongs to the tab that was active when it was opened. The date
  heading of the group at the top of the list stays pinned while you
  scroll (#77), so an action deep in a long group never loses its date;
  keyboard navigation keeps the selected row clear of the pinned heading.
- **Section History** (`Ctrl/Cmd+Shift+H`) — every dated note that has the
  section at all, past and future, most-recent-first; each date's header
  is itself selectable (not just its action rows) and switches the "From"
  panel to that occurrence's full body, glyph-rendered and scrollable, so
  the whole history can be reviewed without jumping to individual files.
  A date with no actions shows a header with a zero count and a dimmed
  placeholder instead of any rows. Under each header, a deduped,
  one-row-per-action list of that occurrence's actions and follow-ups
  (showing just the text after a mid-line `=>`) — an action already shown
  at a more recent occurrence doesn't repeat at an older one. An
  unobtrusive "Only Open" toggle (off by default) narrows the list to
  open actions only, dropping any date left with none. Plus a full-width
  "Previous occurrence" pane above the list: the first few lines of that
  section as it stood at its most recent occurrence before *today*,
  glyph-rendered, with a jump to the source.
- **Cross-Tab Search** (`Ctrl/Cmd+Shift+F`) — full-text search across
  either the open tabs or every file, same open-tabs/all-files toggle as
  the Action Drawer, results glyph-rendered like the drawer's own rows,
  each with the line before and after the match. Operators narrow the
  results and appear as removable chips: `is:open`, `is:done`, `tag:<topic>`,
  `has:@<name>`, `since:YYYY-MM-DD`, `before:YYYY-MM-DD`. Opening a result
  briefly pulses the target line.
- **Sync Calendar for This Day** (`Ctrl/Cmd+Shift+C`, see tenet 4) — an
  opt-in feature (Settings → Calendar, §3.4; hidden entirely until turned
  on) that reads a `.agenda.json` file in the notes folder (desktop only —
  kept up to date by whatever external process syncs the user's real
  calendar, not by ChronoNote) and reconciles it against the active tab's
  note. Only offered on a dated tab whose date is today or later, and
  grayed out until `.agenda.json` actually exists. The result goes to a
  review step —
  a checklist for new meetings, and a Leave-flagged/Discard/Move-to-
  another-day choice for any existing section whose meeting is no
  longer on the agenda but still has content — before anything is
  written.
- **Shortcuts & Symbols** (`Ctrl/Cmd+/` or `Ctrl/Cmd+Shift+/`) — the
  keyboard shortcut table (§4) and the token→glyph vocabulary (§2.2)
  side by side in two independently-scrollable columns. Each column
  takes keyboard focus on open, so arrow keys/Page Up/Down/Home/End
  scroll that column rather than the editor behind it, while every
  global shortcut (including `Escape`) keeps working regardless of
  where focus sits.
- **About** (its icon lives in the status bar, §3.3, not the top bar —
  #58 moved it there so it stays reachable regardless of window width) —
  the currently-running version (in the title row, read live), an
  Updates section (where an available update is reviewed and installed,
  §7.5), a Links section (the marketing website and the GitHub repo,
  each labeled and opened in the OS's default browser), and a Learn More
  section pointing at the Shortcuts drawer and command palette.

- **Sync conflicts** (Android; opened from the status bar's "⚠ N sync
  conflict(s)" item, §3.3) — for a note whose phone and OneDrive versions
  were both changed in the same place and couldn't be merged
  automatically. Shows the two versions side by side with only the
  differing lines highlighted, and three choices: *Keep this device's*,
  *Use OneDrive's*, or *Keep both* (the OneDrive text appended under a
  marker line). Nothing has been overwritten or uploaded while it waits.
  See §7.6.

Also reachable inline in the editor rather than as a drawer: the
in-document **Find bar** (`Ctrl/Cmd+F`), a floating, non-modal bar that
counts matches and steps through them with `Enter`/`Shift+Enter`.

---

## 6. Session, Persistence & Safety

### 6.1 Tabs & Session Restore
Reopening the app (or switching back to a previously-used notes folder)
reopens the tabs that were open last time, with the same tab active;
files deleted in the meantime are silently skipped. Today's dated tab is
always opened too, and becomes active if the previously-active one
couldn't be restored — including on the first launch of a new day, so
the app always lands on today rather than wherever it was left. Cursor
position and scroll offset are remembered per tab for the rest of the
session (not persisted across restarts); per-tab undo/redo history is
also preserved across a tab switch within the same session.

### 6.2 Safety-Close Gate & Reopen History
A tab cannot be closed silently for two independent reasons: unresolved
open actions on a note that is due — dated today or earlier; a
future-dated note's actions haven't come due yet, so it closes without a
warning (#76) — or a non-empty scratchpad (whose content would otherwise
be permanently lost, since scratchpads are never written to disk; a
scratchpad also keeps the open-actions warning, having no date to judge
by). The
safety modal focuses Cancel on open, with `Escape` also cancelling. On
top of that warning, a multi-level "reopen most recently closed tab"
history (`Ctrl/Cmd+Shift+T` / `Ctrl/Cmd+Shift+N`) is a second recovery
layer — a real dated note is reread fresh from disk rather than trusting
a cached snapshot; a scratchpad's cached content is restored verbatim,
since it has no disk copy to fall back on.

### 6.3 Autosave & Atomic Writes
Edits are debounced-autosaved, with an immediate flush on tab switch or
close, and a zero-loss exit barrier that flushes every pending save
before the window is allowed to actually close. A note is only written
when its text differs from what the file held when it was last loaded or
written (the §6.4 baseline hash): a flush of an unedited tab writes
nothing. Otherwise every tab switch would touch the file's timestamp —
which a cloud-sync client sees as an edit — and could overwrite a newer
version another device had synced in with the tab's stale text. Every write to disk
(desktop backend) goes through an atomic write (temp file + fsync +
atomic rename) serialized behind a process-wide lock, so two writes to
the same note racing (autosave vs. a drawer edit, for instance) can
never interleave or corrupt the file.

### 6.4 External-Change / Conflict Detection
Switching to a tab, or the app regaining OS focus, checks whether that
tab's file changed on disk since it was last read (via a content-hash
baseline) — if it has, the file is re-read and any local unsaved changes
are written instead to a timestamped copy in a hidden
`.chrononote-conflicts/` subfolder rather than silently overwritten or
silently discarded, and the user is shown a conflict modal to resolve it
by hand.

---

## 7. Distribution, Backends & the Update Mechanism

### 7.1 One Frontend, Four Build Targets
The same `src/` tree builds independent bundles, each with its own
Vite config and entry point, gated by a `backendKind` store
(`"desktop" | "demo" | "web" | "android"`) that the UI reads to hide
backend-specific affordances (e.g. the web app hides Notes Location and the
Updates section, since a page reload always serves the latest deployed
version):

| Target | Build config | Storage backend | Where it lives |
| :--- | :--- | :--- | :--- |
| **Desktop app** | `vite.config.ts` → `dist/` | Real files via Tauri IPC | Installed `.msi`/`.exe` |
| **Android app** | `npx tauri android build` (same `dist/`) | Real files via Tauri IPC, in the app's own storage, synced through OneDrive (§7.6) | An APK/AAB (not yet released) |
| **Public demo** | `vite.demo.config.ts` → `website/demo-app/` | In-memory mock, resets every load | `chrononote.mariendegelder.nl` (embedded + full-screen) |
| **Web app** | `vite.webapp.config.ts` → `website/webapp/` | IndexedDB, persists across reloads | `app.chrononote.mariendegelder.nl` |

All three share one typed command surface (`TauriCommands`,
`src/lib/tauriCommands.ts`) — the UI, editor, and controller logic never
know or care which backend is answering a given call.

### 7.2 Desktop Storage Backend
Plain `.txt` files under a configurable root folder (§2.1), read and
written through Tauri's Rust core (atomic writes, §6.3). The only tier
with a real filesystem and native OS integration (native folder picker,
native window chrome, the signed auto-updater below).

### 7.3 Web App Backend
An `IndexedDB`-backed implementation of the same command surface —
same editor, same drawers, same shortcuts, zero frontend changes needed
above the storage layer. A shared "Data" section in Settings (identical
on desktop and web) exports every note as one bundle file and imports
one back in with merge-skip-duplicates semantics, so a user's data can
move between the web app and the desktop app deliberately, by hand.
Installable as a PWA (offline-capable, launches in its own window) for
anyone who wants an app-like feel without leaving the browser-storage
tier.

**OneDrive sync (v0.11.0).** The web app can connect a Microsoft account
(OAuth 2.0 PKCE in the browser, no server of ours) and sync a chosen OneDrive
folder with the same three-way line merge and held-conflict model as Android
(§7.6). Browser storage and the OneDrive workspace are separate IndexedDB
stores with separate tab sessions; existing browser notes can be moved across
(with a backup), and a note that differs on both sides is held for the user
rather than overwritten. Choosing a different folder syncs the old one first
and clears the local mirror. Requires a "Single-page application" redirect URI
in the Entra app registration. See `CHANGELOG.md` §187-§188.

### 7.4 Demo Backend
The same in-memory mock backend the Playwright test suite runs against
(`src/lib/testing/mockBackend.ts`), seeded with a hand-authored,
always-current dataset (dates computed relative to today, not pinned) —
zero retention, resets on every page load, no server or Tauri host
required. Deliberately never ships inside the real desktop build (a CI
job greps the production `dist/` to guarantee it).

### 7.5 GitHub Releases Update Check (Desktop Only)
The desktop app checks GitHub for a newer release on launch (a Settings
toggle, on by default) and on demand. Checking is quiet — a status-bar
message only when it actually finds something newer, silence otherwise;
that message, the version number, and the update icon next to it are all
clickable shortcuts straight to About. Downloading is never automatic:
About shows the version found and a "Download & install" button the
user clicks themselves; its "What's changed" link (like the one-time
"first launch after an update" status-bar notice) opens the project's
full releases list rather than a single tag, so checking in after
several missed releases means scrolling past what changed instead of
navigating tag-by-tag. Every release artifact is signed
(`tauri-plugin-updater`'s own keypair), and the downloaded installer's
signature is verified before it runs.

### 7.6 Android App & OneDrive Sync (v0.10.0)

**The app.** The same frontend runs in Tauri's Android WebView, edge to
edge: the native code feeds the real status-bar, navigation-bar, display-cutout
and keyboard insets to the page as CSS variables, and switches the system
bar icons between light and dark with the app theme. Mobile behaviour is
**touch-first, never width-based** — it applies on a coarse-pointer device
(an Android user agent, or a phone/tablet hitting the web app), so a narrow
*desktop* window keeps the desktop layout and its own responsive rules
(§3.2). On a touch device the tab strip is replaced by a tabs-drawer
button, a bottom accessory bar inserts the tokens (☐ ☑ » • ➔ !, indent,
undo/redo) with the caret left after the inserted token, and a fast
horizontal swipe moves between tabs. Desktop keeps the tab strip and its
wrapping scroll arrows. Notes live in the app's own storage folder; there is
no OS folder picker.

**Sign-in.** Microsoft OAuth2 with PKCE, through the system browser and a
`chrononote://auth` deep link (the app may be suspended while the user is in
the browser, so a loopback listener isn't used). The redirect URI must be
registered on the Entra app registration. The refresh token is stored in a
file readable only by the app in its private data folder (Android has no
OS keychain backend for the crate the desktop build uses); the access token,
its expiry and the account name are kept beside it. Settings → Advanced can
override the client ID and tenant for work/school accounts.

**What syncs.** Daily notes (`YYYY-MM-DD.txt`) and `.agenda.json`, between
the notes folder and one chosen OneDrive folder, through the Microsoft Graph
API. Session state, scratchpads and conflict data stay on the device. A sync
runs on launch, when the app returns to the foreground (at most every 15
seconds), shortly after an edit is saved, and on demand. A sync *pulls* first
(a delta query for what changed in the cloud), then *pushes* local changes
with `If-Match` on the last synced version. The engine remembers, per note,
the last synced OneDrive version and content hash, plus the last synced text
(the "base"). It is safe to interrupt: what has been done is saved even if a
sync fails partway, and re-running it never creates duplicates.

**Divergence.** When both sides changed a note since the last sync:
- Edits that don't touch the same lines are **merged automatically**, and
  when both sides only *added* lines both are kept (the OneDrive lines
  first). The merged text is uploaded.
- If both sides changed the same existing lines — or there is no base to
  merge against — the note is **held**: neither the local file nor the
  cloud copy is touched and the note is not uploaded until the user picks a
  side in the Sync conflicts drawer (§5). No conflict files are ever created
  in OneDrive or the notes folder.
- A note deleted in the cloud is deleted locally only if it hasn't been
  edited since the last sync; an edited note is kept and re-uploaded.
- First contact (a note that was never synced but already exists in the
  cloud with different text) is held, not overwritten in either direction.

**Deleting.** Closing an empty dated tab deletes its file (§6.1); with sync
on, the OneDrive copy is deleted at the next sync too — but only if the cloud
version is still the one last synced (otherwise the newer cloud version comes
back). Only notes the app itself deletes are propagated. An empty note that
was never synced is never uploaded.

**Privacy.** Every file the sync keeps in the app's data folder (tokens,
folder link, sync cache, base copies) is excluded from Android Auto Backup
and device-to-device transfer, so a restored phone starts signed out.

**Scope.** OneDrive sync is Android-only for now. The Rust engine also
compiles into the desktop build, but no desktop UI exposes it; desktop
users can already point the notes folder at a folder the OneDrive client
syncs. The web app cannot use it.

---

## 8. Testing Strategy

Three automated layers, run on every push/PR via GitHub Actions
(`.github/workflows/test.yml`), plus manual verification for anything
purely visual/layout-shaped that none of them can reach:

1. **Vitest** — pure business logic: token/glyph parsing, date handling,
   section import, the bulk of the controller (tab lifecycle, the
   safety-close gate, copy/paste deferral, history dedup, directory
   switching, session restore).
2. **`cargo test`** — the Rust storage layer: config load/save, note
   CRUD, atomic writes, path-traversal rejection, conflict detection; and
   the OneDrive sync's decision logic (§7.6), which is pure filesystem and
   hashing so it needs no network: the three-way merge, held conflicts and
   their resolution, remote-delete and local-delete handling, and a guard
   that every OneDrive state file is excluded from Android backup.
3. **Playwright** — the real Svelte + CodeMirror frontend in headless
   Chromium against the in-memory mock backend (§7.4): every keyboard
   shortcut (including the Mac-emulated variants), every drawer, tab
   lifecycle, both safety gates, theme/palette persistence, and the
   responsive top-bar behavior (§3.2) — plus, with a touch/Android user
   agent, the mobile accessory bar and the Sync conflicts drawer (§7.6).

What none of them can reach is the real network and the real device: the
OneDrive sync was verified by hand against a live OneDrive (both directions,
merges, held conflicts, deletes both ways, an offline edit, an app killed
mid-sync) on an emulator, driving the real Rust commands through the
WebView's devtools. arm64 and a physical phone are still untested.

Full detail on running and extending each layer lives in the project's
`CLAUDE.local.md` (machine-local dev notes) and `tests/e2e/README.md`.

---

## Out of Scope / Not Yet Built

- **`rainbow` colour mode** — an early proposal superseded by the
  shipped Color/Grayscale/Legacy three-way palette (§3.4).
- **Native (`tauri-driver`) end-to-end tests** — the Playwright suite
  against the mock backend (§8) covers interaction behavior; a real
  native-window E2E pass was considered and deferred, no concrete plan.
- **OneDrive sync on desktop or the web app** — the sync engine (§7.6) is
  Android-only by decision. It already compiles into the desktop build, so
  surfacing it there is two UI gates; the web app cannot use it at all (no
  Rust runtime).
- **Propagating every local deletion** — only notes the app itself deletes
  (an emptied dated note on tab close) are deleted in the cloud; a file that
  merely goes missing on the phone is not.
- **A released Android build** — release signing, the Play Console listing
  (privacy policy, Data safety form, closed testing), and arm64 / real-device
  testing are still to do.
