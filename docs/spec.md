# ChronoNote: Master Technical & Product Specification

**Document Version:** 1.0.0 (amended — see note below)  
**Target Environment:** Cross-Platform Native Desktop (Windows 11 / macOS / Linux)  
**Reference Architecture:** Tauri v2 (Rust) + Svelte 5 / TypeScript + CodeMirror 6  

> This document has been amended in place to reflect changes agreed after
> the first working build. See [`CHANGELOG.md`](CHANGELOG.md) for the full
> history and rationale behind every amendment — this note won't try to
> enumerate them all as the list keeps growing.

---

## 1. Intent & Architectural Principles

ChronoNote is a minimalist, keyboard-driven plain-text desktop application engineered to replace Microsoft Notepad for tracking meetings, daily logs, and action items.

### Core Tenets
1. **Zero Database / Pure Plain Text:** Persistence is 100% human-readable ASCII/UTF-8 `.txt` files. No SQLite layer, no proprietary syntax markers, no YAML front-matter, and no persistent UUIDs injected into note bodies.
2. **Tabular Monospace Grid Preservation:** Specialized tokens (`# `, `v `, `> `, `x `, `- `/`* `, `=> `, `! `) are visually replaced on screen using virtual presentation masking. Characters in memory match file bytes on disk; visual overlays occupy *exactly* the same typographic character width as the token they replace — forced via explicit CSS sizing rather than trusted to a glyph's natural rendered width, since a single Unicode symbol doesn't reliably occupy exactly one monospace cell in every font — so column alignments never break.
3. **Fail-Safe Task Protection:** Tabs cannot be closed silently if unresolved tasks (`# `) exist, or if a scratchpad holds content that was never promoted — since scratchpads are never written to disk, closing one unwarned would destroy that content permanently. A multi-level "reopen closed tab" history is a second layer of recovery on top of that warning.
4. **Manual Section Import:** Rather than an automated calendar sync, the user pastes freeform lines of text (e.g. copied from an email or agenda) into an import dialog (`Ctrl+Shift+I`); each non-empty line becomes a new section header, appended to the end of the current note. Purely additive — it never touches or reconciles existing sections.

---

## 2. Storage & Syntax Specification

### 2.1 Storage Structure
* **Root Storage Directory:** Configurable via `config.json` (defaults to `~/Documents/Notes/`).
* **Daily File Naming Scheme:** ISO 8601 strict format: `YYYY-MM-DD.txt`.
* **Session State:** Which tabs were open and which was active is remembered per notes folder in a `.chrononote-session.json` file written inside that folder (not in the global `config.json`), so it travels with the folder rather than accumulating in a global list, and restores automatically both on app launch and when switching back to a previously-used folder. It is excluded from every note-scanning path by the same strict `YYYY-MM-DD.txt` filename check that governs daily files.

### 2.2 Token Semantics & Dynamic Glyph Replacement

Every glyph is at most 2 characters (3 for `=> `), matching — never
exceeding — the character width of the token it replaces, forced via
explicit CSS `ch`-unit sizing on each glyph so column alignment holds
regardless of how a given symbol naturally renders in the active font.
Glyphs are theme-driven — weight/opacity distinguish them in grayscale
mode, color in color mode (Settings, `Ctrl+,`) — and each *replaced* span
is an atomic unit for text selection, so selecting or copying a line
always includes the glyph's full underlying token. `@name` in a delegated
follow-up is the one exception: it's styled as a badge but stays real,
live, editable text, not part of the replaced/atomic span — fix a typo in
it directly, or backspace immediately after the arrow glyph to remove the
whole `=> ` token in one step, as if un-delegating the line.

| Raw Plain Text | Visual Presentation | Semantic Meaning | Lifecycle & Closing Impact |
| :--- | :--- | :--- | :--- |
| `# ` | `☐` | **Open Action (Self)** | **Unresolved.** Blocks tab closure with a safety modal. Counted in status bar (Open). |
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

All four action symbols (`# `/`v `/`> `/`x `) may be indented in two-space
increments, the same as bulleted list items — the indentation is real,
untouched whitespace; only the symbol itself is replaced.

**Copy/paste deferral:** copying a `# ` line and pasting it into today's
note, or into any *later*-dated note, marks the original line as `> `
(deferred) back in its source file/tab — a quick way to forward a task
without manually editing the original. Copying several lines together
defers every open-action line found anywhere in the copied block, not
just one at its start — other lines in the same copy (plain text,
bullets, already-resolved actions) are left as they were. Pasting into a
scratchpad or a past-dated note does not trigger this.

### 2.3 Structural Spacing Rules
* **Inter-Section Spacing:** All automated insertions (section import, templating) must enforce **two blank lines** (`\n\n\n`) between the end of a section body and the subsequent Setext heading line.

### 2.4 List Nesting
* **Bulleted Lists:** A `- ` or `* ` at the start of a line (optionally indented) renders as `•`; the leading whitespace itself is untouched, real, visible indentation — only the marker is replaced. Nesting is two spaces per level, which is also exactly what pressing `Tab` on a bullet line already produces (the editor's indent unit is fixed at two spaces for this reason), so no bullet-specific indent handling is needed beyond that. Continuing a list with `Enter` reuses whichever marker character (`-` or `*`) the current line already has.
* **List Continuation:** Inside a bulleted line, `Enter` continues the list with a fresh bullet at the same indentation (or exits the list if the current bullet is empty); `Shift+Enter` adds a plain continuation line indented two spaces *past* the bullet's own indentation — aligned under the bullet's text, not the marker — with no new bullet.

---

## 3. Visual Design & Chrome Layout

The visual chrome mirrors the uncluttered footprint of modern system text editors (e.g., Windows 11 Notepad). It matches the OS's Light or Dark mode by default, or an explicit Light/Dark choice in Settings (`Ctrl+,`) overrides that.

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