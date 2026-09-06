# ChronoNote — Changelog

Historical record of every change agreed after the first working build,
kept for the rationale behind each one — not just *what* changed but
*why*. Originally tracked as a pending-requirements doc while each batch
was still being gathered and confirmed before implementation; renamed once
everything below was applied, since nothing here is "pending" anymore.

**Status: all 31 sections implemented**, verified (frontend build +
type-check + `cargo check` all clean) — see individual sections below for
what each one covers; §27–31 are small fixes/additions logged briefly in a
`next-revision-notes.md` scratch file before being applied and folded in
here.

---

## 1. Grayscale-only UI — no color anywhere

Every hued element in the current build must become grayscale. This touches
two layers:

**Editor glyphs (spec 2.2 table).** Currently distinguished by hue (red/
green/amber/blue). Redesign to distinguish by weight/opacity/shape instead:

| Token | Current | New (grayscale) |
| :--- | :--- | :--- |
| `# ` Open | `[ ]` red, bold | `[ ]` full-opacity text color, regular weight |
| `v ` Done | `[✓]` green, bold | `[✓]` ~55% opacity (reads as "faded/settled") |
| `> ` Deferred | `[→]` amber, bold | `[→]` bold weight, full opacity (reads as "pending/in motion") |
| `=> ` Follow-up | ` ↳ ` blue | ` ↳ ` muted gray |
| `=> @name` Delegated | `↳ @name` blue badge | `↳ @name` badge with a neutral gray background, bold text |

**Chrome.** Every CSS variable currently pointing at a hue (`--accent`,
`--accent-hover`, `--status-bg`/`--status-fg`, `--warn`, `--open`, `--done`,
`--highlight` search-match yellow) gets replaced with grayscale tokens
(shades of the existing `--text`/`--muted`/`--border` scale, plus one or two
new mid-gray tokens for "selected/active" states — e.g. the active-tab top
border, the status bar background, modal-item hover/selected background,
and the search-match highlight all move to gray + weight/underline instead
of color).

**Top-bar icons.** Currently emoji (📅 📋 🕒 🔎 ➕, plus 🔄 which is being
removed per #3 below). Emoji render in full color regardless of CSS. Two
options:
- (a) apply `filter: grayscale(1)` to the icon glyphs — keeps the emoji
  shapes, quick, low risk;
- (b) swap emoji for a monochrome icon set (inline SVG or a icon font)
  drawn in `currentColor` — cleaner/more intentional but more work.

**Confirmed: option (a)** — `filter: grayscale(1)` on the top-bar icon
glyphs. No monochrome icon set for now.

---

## 2. `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle between open note tabs

**Confirmed direction (revised from the original ask):** plain `Tab` stays
reserved for indentation inside the editor. Tab-switching moves to
`Ctrl+Tab` (next tab) and `Ctrl+Shift+Tab` (previous tab), wrapping around,
applying globally (works whether or not the editor has focus).

Two things this requires, since neither exists yet in the current build:
- Add the `indentWithTab` keymap (from `@codemirror/commands`) to the
  editor's extension list so plain `Tab`/`Shift+Tab` actually indent/dedent
  the current line or selection while focused in the editor — today Tab is
  unbound and does nothing, so this is a genuinely new capability, not a
  restoration of one.
- Add `Ctrl+Tab`/`Ctrl+Shift+Tab` to the same global keydown handler that
  already carries `Ctrl+N`/`Ctrl+O`/`Ctrl+W`/etc. (`App.svelte`), calling
  `switchTab` with the next/previous id in the `tabs` array (wrapping).
  `e.preventDefault()` on both so the editor's own Tab handling never sees
  them.

---

## 3. Remove calendar sync → replace with a manual "paste lines → sections" import

Drop entirely:
- The "🔄 Sync" button and `syncCalendarForActiveTab`
- `src-tauri/src/calendar.rs` (the mocked Microsoft 365 event source)
- `sync_calendar_mock` Tauri command
- Spec tenet 1.4 "Resilient Calendar Integration" and its cancellation/
  reposition rules — no longer applicable once there's no external event
  source to reconcile against

Replace with a new modal (a new top-bar button, tentatively "📥 Import" →
grayscale icon per #1): a multi-line textarea where you paste/type
freeform lines of text. On submit, **each non-empty line becomes a new
section header**, appended to the end of the current note with the
existing two-blank-line spacing rule (spec 2.3), no underline-length
guessing beyond matching the header's own length, no automatic time-range
prefix. Purely additive — it never touches or reconciles existing sections
(no cancel/rematch logic, since there's no longer a "known event list" to
diff against).

`src/lib/calendarSync.ts`'s merge/reconcile logic becomes unnecessary and
gets deleted; only the very small "append a new section block with correct
spacing" piece survives, simplified.

**Confirmed: verbatim.** The whole pasted line becomes the section title
as-is, no `HH:MM - HH:MM` parsing — pasted text won't reliably include a
time range, so this is the more robust default anyway.

**Confirmed shortcut: `Ctrl+Shift+I`** ("Import") opens the dialog,
alongside the top-bar button. Checked against the existing bindings
(`Ctrl+N`, `Ctrl+O`, `Ctrl+W`, `Ctrl+Shift+A`, `Ctrl+Shift+H`,
`Ctrl+Shift+F`) — no collision.

---

## 4. Action drawer: a completed item stays visible until you close the drawer

Currently `toggleActionLine` (Ctrl+Space inside the drawer) rebuilds the
drawer's item list from scratch after every toggle
(`actionSnapshot.set(buildActionSnapshot())`), and since a line marked done
(`v `) no longer matches the "is this an action line" test, it vanishes
from the list immediately.

Fix: stop rebuilding the snapshot on toggle (and on "forward to today").
The snapshot is captured once when the drawer opens; toggling just updates
that line's live text in place (the drawer already re-reads each item's
current line content reactively), so a completed item keeps its row —
shown with the existing done styling (faded glyph + strikethrough) — for as
long as the drawer stays open. Closing and reopening the drawer takes a
fresh snapshot as before, so completed items correctly drop out on the next
open.

---

## 5. Selecting a line must select the glyph too (copy-paste fidelity)

The inline glyphs (`[ ]`, `[✓]`, `[→]`, `↳`, `↳ @name`) are rendered via
CodeMirror `Decoration.replace` widgets over the raw 2+ character token
(`# `, `v `, `> `, `=> `, `=> @name`). Right now those ranges aren't
registered as atomic, so a selection/cursor boundary can land in the middle
of a replaced token — which both looks wrong (the glyph doesn't appear
selected even though part of the underlying text is) and risks a
copy/paste that's missing part of the raw token.

Fix: register the same glyph-decoration ranges via CodeMirror's
`EditorView.atomicRanges` facet, so a selection or cursor motion can never
split a glyph's underlying token — it's always fully in or fully out. This
makes the visual selection highlight correctly cover the glyph and
guarantees clipboard content always contains the intact raw plain-text
token, matching what's actually on disk.

---

## 6. Settings panel: Color/Grayscale toggle + configurable notes directory

**Status: implemented.** New top-bar "⚙
Settings" button opening a modal. Proposed shortcut: `Ctrl+,` (comma) —
the conventional cross-app settings shortcut (VS Code, Chrome, Slack).
Checked against existing bindings — no collision.

### 6.1 Color / Grayscale theme toggle

Bring back a full color palette as a second option alongside the grayscale
one just built, switchable at runtime from the Settings modal (two options:
"Color" / "Grayscale").

Mechanics:
- Persisted as a new `colorMode` field (`"color" | "grayscale"`) on
  `AppConfig` in `config.json`, alongside `notesDir`. New Rust command
  `set_color_mode`, mirroring `set_notes_dir`.
- Applied via a `data-color-mode` attribute on `<html>`; `app.css` carries
  two full variable sets (color and grayscale) crossed with the existing
  light/dark handling — four variable blocks total instead of two.
- The icon `filter: grayscale(1)` only applies in grayscale mode; color
  mode restores full-color emoji.
- Loaded from `config.json` on boot and applied before first paint (or as
  close to it as practical) so there's no flash of the wrong theme.

**Confirmed: full parity.** The action-drawer and section-history glyph
indicators also follow the toggle. `glyphFor()` in both `ActionDrawerModal`
and `HistoryModal` needs to become reactive to the `colorMode` store and
return hued styles in color mode (matching whatever hues the main editor's
`.glyph-*` classes use in color mode), not just the current static
weight/opacity styling.

### 6.2 Configurable notes directory

Settings modal shows the current notes folder (already tracked in the
`notesDir` store) and lets you change it via a **native folder-picker**
("Browse…" button). Confirmed dependency additions:
- npm: `@tauri-apps/plugin-dialog`
- Cargo: `tauri-plugin-dialog`, registered with `.plugin(tauri_plugin_dialog::init())`
  in `src-tauri/src/lib.rs`
- Capability: add a `dialog:allow-open` (or `dialog:default`) permission
  entry to `src-tauri/capabilities/default.json`

The picker opens with `defaultPath` seeded from the current `notesDir` so
it starts where you already are. The backend side needs no new command —
`set_notes_dir` already exists in `storage.rs`; this is a frontend
orchestration + new dependency addition.

**Confirmed: no file migration.** Changing the directory only changes
where the app reads/writes from now on. Existing `.txt` files in the old
folder are left exactly where they are — this is deliberate, since you're
using directory-switching as project/scope switching, not as a "move my
notes" feature.

### 6.3 Switching directories resets the workspace to the new scope

Since directory-switching is really **project/scope switching**, everything
currently loaded — open tabs, the cross-tab search index, the action
drawer, section history — is scoped to the *old* directory and becomes
stale/wrong the moment `notesDir` changes. Concretely:

- `search` and the action drawer operate over **open tabs**, which still
  hold files (and filenames) from the old project.
- Section history and the date picker read **every file on disk** — via
  `allNotesCache`, populated from `read_all_notes()`, which resolves
  against whatever `notesDir` the backend currently has configured.
- Worse, if left open, a stale tab's debounced autosave would call
  `write_note(filename, content)` **after** the directory changes — writing
  old-project content into a same-named file in the *new* directory. This
  isn't just a UX nicety, it's a real correctness bug if not handled.

So a confirmed directory switch does a **full workspace reset**, not just a
config update:
1. Flush every open (non-scratchpad) tab's pending debounced save to disk
   — writing to the *old* directory, before it stops being current.
2. Call `set_notes_dir` with the newly picked path.
3. Close every open tab, and clear `allNotesCache`, `actionSnapshot`,
   `historyItems`/`historyTargetHeader`, and `searchResultsStore` — nothing
   from the old scope survives.
4. Re-run the same bootstrap `initApp()` does today: open today's note,
   read fresh from the *new* `notesDir`, make it the active tab.
5. Toast confirming the switch (e.g. "Switched notes directory to …").

**Confirmed gate: unresolved scratchpad content blocks the switch.**
Per your note — *"If there is any unsaved work, it needs to be resolved
before switching, to avoid losing information"* — the one thing a workspace
reset would actually **destroy** (not just hide) is a scratchpad tab with
content that was never promoted, since scratchpads are spec'd (1.3) to live
only in memory and are never written to disk. Regular dated-note tabs are
NOT part of this gate — they're already safely persisted (step 1 above
flushes them), so a tab with, say, unresolved open actions (`# `) does not
block a directory switch; those actions are just no longer visible after
the switch, safely sitting in their file in the old folder.

So: before applying a newly-picked directory, check every open tab for
`isScratchpad && content.trim() !== ""`. If any exist, show a blocking
modal (same visual pattern as the existing tab-close `SafetyModal`) listing
the affected scratchpads, with two ways forward — **Cancel** (abort the
switch, so you can go promote them yourself first) or **Discard & Switch**
(explicit, typed acknowledgment that the content is being thrown away). If
there's nothing unresolved, the switch just proceeds immediately with no
modal.

### Amendment: Settings button placement + shortcut (confirmed)

The gear icon (⚙) must be the **rightmost** element in the top bar's icon
row — after "New Scratchpad" (＋) and after the conditional "Promote"
button (which only shows for scratchpad tabs), so it stays last regardless
of tab state. Shortcut stays **`Ctrl+,`** as proposed in §6's opening —
say so if you'd rather have a different key.

---

## 7. Shortcuts help drawer (`Ctrl+/`)

New shortcut opens a modal listing every keyboard shortcut in the app — a
plain static list (no need for a dynamic per-command registry at this
scale). Covers everything defined so far:

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+N` | New scratchpad |
| `Ctrl+O` | Open/create a dated note |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Tab` / `Shift+Tab` | Indent / dedent (in editor) |
| `Ctrl+Space` | Cycle open → done → deferred (in editor, current line) |
| `Ctrl+Shift+S` | Convert current line into a section header (§8, new) |
| `Ctrl+Shift+A` | Action drawer |
| `Ctrl+Shift+H` | Section history |
| `Ctrl+Shift+F` | Cross-tab search |
| `Ctrl+Shift+I` | Import sections |
| `Ctrl+,` | Settings |
| `Ctrl+/` | This shortcuts drawer |
| `Escape` | Close whatever modal is open |

**This also changes the status bar.** Its bottom-right hint currently
hardcodes `[Ctrl+Shift+H] History | [Ctrl+Shift+A] Actions | [Ctrl+O] Date`
(`StatusBar.svelte`) — replace that whole cluster with a single pointer to
the new drawer: `[Ctrl+/] Shortcuts`.

---

## 8. Shortcut to convert the current line into a section header

New shortcut **`Ctrl+Shift+S`**, bound inside the editor's own CodeMirror
keymap — same place as the existing `Ctrl+Space` line-cycle command in
`EditorPane.svelte`, since it needs the live cursor line, not just a
global window-level listener like most other shortcuts. Turns the line the
cursor is on into a section header by inserting a new line directly below
it: `=` repeated to match the line's length (reusing the same
`underlineFor()` logic `sectionImport.ts` already has).

**Assumed scope — flag if wrong:** this only inserts the underline right
below the line; it does not also try to enforce the two-blank-line spacing
rule (spec 2.3) before/after. That rule is about *automated* section
insertion (the import dialog); this is a direct, single-line action you're
consciously triggering, so surrounding spacing is left for you to manage.

---

## 9. Responsive top bar: icon+label vs. icon-only

Top-bar buttons show icon **and** label (`📅 Date`) when the window is full
screen; icon-only (`📅`) otherwise.

**Flagged definition question:** "full screen" could mean:
- (a) literal OS-level fullscreen (`isFullscreen()` from
  `@tauri-apps/api/window` — already part of the installed `@tauri-apps/api`
  package, no new dependency, but I'd want to confirm whether querying/
  subscribing to it is already covered by the `core:default` capability
  or needs an explicit permission added to
  `src-tauri/capabilities/default.json`);
- (b) simply "maximized / has room" — `isMaximized()`, or even a plain CSS
  width breakpoint. Much simpler, and probably closer to what most people
  mean day-to-day on a window they resize by hand rather than press a
  dedicated fullscreen key for.

Defaulting to **(b)**, checking both `isMaximized()` and `isFullscreen()`
(so either way of making the window take the whole screen triggers labels)
unless you specifically want literal kiosk-style fullscreen only.

---

## Implementation notes: sections 1–9

- **§6.1 color/grayscale parity** ended up simpler than planned: instead of
  making `ActionDrawerModal`/`HistoryModal`'s `glyphFor()` reactive to a
  `colorMode` store, their inline styles just reference the same
  `--glyph-*` CSS custom properties the main editor's `.glyph-*` classes
  use. The browser's CSS cascade handles the mode switch automatically —
  no JS reactivity needed, and it's impossible for the two to drift out of
  sync since they share the same variables.
- **§6.1 icon filter** was inverted from the original grayscale-only
  design: `filter: grayscale(1)` now applies by default (bare `:root`,
  matching the pre-toggle behavior) and `[data-color-mode="color"]`
  removes it, rather than the other way around — this means an unset/
  not-yet-loaded color-mode preference safely falls back to grayscale
  instead of flashing full-color emoji before config loads.
- **§6.3 workspace reset** is implemented as `performDirectorySwitch()` in
  `controller.ts`; the unsaved-scratchpad gate is `pickAndSwitchNotesDirectory()`
  checking every open tab for `isScratchpad && content.trim() !== ""`
  before proceeding.
- **§9 "full screen"** landed on checking both `isMaximized()` and
  `isFullscreen()` from `@tauri-apps/api/window`, refreshed on the
  window's `onResized` event — per the confirmed default.

---

## 10. New token: `! ` — emphasized "remember this" lines

**Status: implemented.**

A line starting with `! ` (exclamation, then a space — matching the
single-space convention every other token already uses) gets its own
glyph, and the *rest of the line* is visually emphasized, not just the
marker. Proposed:
- Raw token `! ` → glyph `[!]`, matching the bracket family (`[ ]`, `[✓]`,
  `[→]`) rather than introducing an unrelated symbol.
- The rest of the line (everything after `! `) renders **bold**, with a
  new `--glyph-emphasis-color` token (defaults to `var(--text)` in
  grayscale, a distinct warm hue in color mode — mirroring how the other
  `--glyph-*` tokens already split by mode).

**Explicitly out of scope, per what you said:**
- No dedicated drawer. Cross-tab search (`Ctrl+Shift+F`) already
  substring-matches raw line text regardless of prefix, so `!` lines are
  searchable the moment the token exists — nothing new to build there.
- Not counted in the status bar (`Open:`/`Delegated:`), not included in
  the action-drawer snapshot, doesn't block tab close. This is a note/
  emphasis marker, not a task — a different semantic than `# `/`v `/`> `.

**Implementation note:** this needs a bit more than the other glyphs,
since "emphasize the rest of the line" is a variable-length span (to end
of line), not a fixed-width token match. `glyphs.ts`'s `MatchDecorator`
currently uses the simple `decoration` callback (one fixed decoration per
regex match) — this needs the lower-level `decorate(add, from, to, match,
view)` form instead, so a single match can add two decorations: the `[!]`
replace-widget for the token itself, and a `Decoration.mark()` from the
end of the token to `view.state.doc.lineAt(to).to` (the line's end) for
the bold styling. This same `decorate`-based rework is also needed for
§11 below, so they land as one `glyphs.ts` change.

---

## 11. Editable `@name` in delegated follow-ups (`=> @name`)

**Status: implemented.**

Today, `=> @name` is rendered by replacing the *entire* match — arrow and
name together — with one static widget (`↳ @name`). Since a
`Decoration.replace` widget's text is just a rendered label, not real
document content, there's no way to click into "@name" and fix a typo
without the glyph getting in the way.

**Fix:** split the decoration into two independent pieces over the same
match:
- `=> ` (3 chars) stays a `Decoration.replace` → the arrow glyph (same
  visual as the plain `=> ` → `↳` case), and stays part of the atomic
  range used for selection/backspace (v1 §5).
- `@name` becomes a `Decoration.mark` (not a replace) carrying the
  existing `.glyph-assignee` badge styling (same background/color/weight
  it already has) — but since a mark decoration doesn't hide or replace
  anything, the actual characters stay live, selectable, and editable.
  Typing inside it, fixing a typo, arrow-keying through it all just work,
  because it's ordinary text under the hood.

**Backspace removing the whole `=> ` glyph — this should already fall out
for free, not need new code.** v1 §5 already registered every
glyph-replace range as atomic via `EditorView.atomicRanges`, and
CodeMirror's own docs describe backspace (and arrow-key motion) as
atomic-range-aware: deleting backward from just past an atomic range
removes the whole range in one step. Once `@name` is excluded from the
replace/atomic range (per the split above), the *only* thing left atomic
right before `@name` is the 3-character `=> ` span — so backspacing there
should already remove exactly "the glyph and both characters `=>`, as if
removing the follow-up/action," matching what you described, purely as a
consequence of the split. Worth confirming empirically once built, since
I'm reasoning from CodeMirror's documented behavior rather than having
tested this exact interaction yet.

**Implementation catch to get right:** `glyphAtomicRanges` currently feeds
the *entire* decoration set (everything `liveGlyphs` produces) into
`EditorView.atomicRanges`. Once that set contains a mix of replace
decorations (should be atomic) and mark decorations (must NOT be atomic —
otherwise `@name` becomes uneditable again, defeating the whole point),
that facet needs to be fed only the replace-type ranges. Likely solved
with a second, replace-only decoration set computed alongside the full
one, rather than trying to filter a mixed `DecorationSet` after the fact.

---

## 12. Restore the copy/paste "mark original as deferred" behavior

**Status: implemented.**

Bringing back the prototype behavior dropped during the initial build
(noted in the README's "Deliberately dropped" section): copying a `# `
task line and pasting it into **today's** note marks the original line as
`> ` (deferred) back in its source tab/file — as if forwarding the task
without having to manually go find and edit the original.

Ported from the prototype almost as-is, generalized the one hardcoded bit:
- The prototype hardcoded "today" as its fixed demo date
  (`2026-08-22.txt`); this uses the real `todayISO() + ".txt"`, matching
  how the rest of the app already computes "today" (date picker, forward-
  to-today, promote-scratchpad all do the same).
- `EditorView.domEventHandlers({ copy, paste })` on the CodeMirror view —
  the prototype's exact mechanism, just re-hosted in `EditorPane.svelte`.
- The "last copied action" needs to survive a tab switch (copy happens in
  the source tab's `EditorPane` instance, paste happens in a different
  one, and switching tabs fully remounts `EditorPane` per the `{#key}`
  block in `App.svelte`) — so this small bit of state has to live in
  `controller.ts` as module-level state (same pattern as `editorApi`),
  not inside the component.
- On copy: if the selected text starts with `# `, remember
  `{ text, sourceTabId }`.
- On paste: if there's a remembered copy, the *current* (paste-target)
  tab's filename is today's, and it's a different tab than the source —
  find that exact text still present in the source tab's content, replace
  it with `> ` + the rest, persist/toast, then clear the remembered copy
  either way (matched or not) so a later unrelated paste can't misfire.
- Scoped to `copy` only, not `cut` — matching the original exactly.

This composes cleanly with the atomic-range selection fix from v1 §5:
selecting a `# ` line for copy is now guaranteed to grab the intact `# `
prefix (that was the whole point of that fix), which is exactly the
precondition this feature's `sel.startsWith("# ")` check needs.

I'd also fold this into the docs as a real, named feature rather than a
silent easter egg, since you're asking for it by name now — a line in
`spec.md`'s token table and `README.md`'s feature list, not a hidden
behavior.

---

## 13. Compact glyphs for open/done/deferred (`# `, `v `, `> `)

**Status: confirmed.**
- **Open** (`# `) → `☐` (U+2610 Ballot Box)
- **Done** (`v `) → `☑` (U+2611 Ballot Box with Check)
- **Deferred** (`> `) → `»` (U+00BB Right-Pointing Double Angle Quotation Mark)

All three fit in ≤2 characters (glyph + trailing space), matching the
token width they replace — unlike the current 3–4-character bracket
glyphs (`[ ] `, `[✓] `, `[→] `), which are wider than what they stand in
for. `»` is plain Latin-1, guaranteed to render everywhere.

---

## 14. Keyboard navigation for confirmation dialogs (Safety / Unsaved Scratchpads)

**Status: implemented.**

Right now, closing a tab with unresolved open actions pops the
`SafetyModal`, but focus never leaves the editor — so Tab/Enter/Escape
don't reach the dialog's Cancel/Close-Anyway buttons at all; you have to
click. Root cause: every other modal that needs keyboard nav
(`DatePickerModal`, `ActionDrawerModal`, etc.) explicitly moves focus onto
its input on mount (`onMount(() => inputEl?.focus())`), but `SafetyModal`
never does that for either button, since it has no input to focus in the
first place.

Fix: focus the "Cancel" button on mount (the safe, non-destructive
default, so an accidental Enter doesn't destroy anything) — native
`<button>` elements already support Tab-cycling and Enter/Space
activation for free once focus is actually inside the dialog, so that's
the whole fix.

**Same bug exists in `UnsavedScratchpadsModal`** (built for §6.3) — it
has no focus management either. Fixing both while I'm in there.

**Related inconsistency worth fixing at the same time:** the global
`Escape` handler in `App.svelte` always just does `modal.set("none")` —
for most modals that's correct, but `SafetyModal`'s own Cancel button
calls `cancelSafetyClose()` (which also clears `pendingCloseTabId`) and
`UnsavedScratchpadsModal`'s Cancel calls `cancelDirectorySwitch()` (which
returns to the Settings modal, not to nothing). Pressing Escape on either
of those today skips that specific cleanup/return-state — harmless right
now since the relevant state gets overwritten next time it's used, but
inconsistent. Worth having Escape call each modal's own cancel function
where one exists, rather than the generic close-everything path.

---

## 15. `Ctrl+T` as an alias for `Ctrl+N` (new scratchpad)

**Status: implemented.** Purely additive —
`Ctrl+T` triggers the exact same `createScratchpad()` call as `Ctrl+N`.
No collision (there's no browser tab-strip to fight over the binding
with, same reasoning as why `Ctrl+N`/`Ctrl+W` are already safely
repurposed).

---

## 16. `Ctrl+Shift+T` / `Ctrl+Shift+N`: reopen the most recently closed tab

**Status: implemented.** Both bindings do the
same thing — reopen the most recently closed tab — with a real
multi-level history stack (not just "last one"), so repeated presses walk
further back, mirroring how browsers handle "reopen closed tab."

Design:
- `closeTab()` pushes a snapshot (`filename`, `isScratchpad`, `content`)
  onto an in-memory stack (module-level in `controller.ts`, bounded to a
  reasonable size — proposing the last 20 — so it doesn't grow forever
  over a long session) right before removing the tab.
- Reopening pops the stack. For a **real dated note**, this just calls
  the existing `openOrCreateDatedFile(filename)` — which already handles
  "already open → switch to it" vs. "not open → read fresh from disk" —
  rather than restoring the cached snapshot, so it always reflects
  whatever's actually on disk now (safer than trusting a possibly-stale
  in-memory copy).
- For a **scratchpad**, there's no disk copy to fall back on, so this is
  the one case that actually restores the cached `content` verbatim into
  a fresh tab (new id, same filename/label, e.g. "Scratchpad 3"). This
  is also a second layer of safety net for the gap that §21 below fixes
  directly (a non-empty scratchpad closing with no warning) — this stack
  is the "I confirmed the warning but regret it" recovery path, §21 is
  the "stop me before I do it" prevention.
- Reopened tabs are appended at the end and made active — same
  convention every other "open a tab" action in the app already follows
  (none of them try to restore original tab-bar position).

---

## 17. Right-pointing arrow for forwarded/delegated (`=> ` / `=> @name`)

**Status: confirmed — `➔` (U+2794, Heavy Wide-Headed Rightwards Arrow).**
Replaces `↳` (U+21B3). Lives in the Dingbats Unicode block (not Emoji),
so it renders as a normal themeable text glyph, not fixed-color emoji —
true Wingdings glyphs aren't usable cross-platform (Windows-only legacy
font, missing-glyph box on Mac/Linux), so this is the closest real
Unicode equivalent to Wingdings 224. Applies to both the plain follow-up
case and the arrow portion of the delegated case (once §11's decoration
split lands, the arrow and the `@name` badge are separate pieces, but the
arrow symbol itself is the same swap either way).

---

## 18. Status bar: swap "Delegated" for "Closed" and "Forwarded" counts

**Status: implemented.** `countActions()`
currently returns `{ open, delegated }`; changes to `{ open, closed,
forwarded }` — counting `v ` and `> ` lines respectively — and drops the
delegated (`=> @name`) count from the status bar entirely. Delegated
lines are still fully visible in the editor (badge styling) and the
action drawer, just no longer summarized as a footer number. Every caller
of `countActions()` needs updating for the new shape; the tab-close
safety check only ever read `.open`, so that one's unaffected.

---

## 19. Action drawer & search: toggle between "open tabs" and "all files"

**Status: implemented.** Both features
currently only ever scan open tabs. Add a small in-modal toggle to each
("Open Tabs" / "All Files"), not persisted across drawer/search sessions
(resets to "Open Tabs" each time you reopen it) unless you'd rather it
remember your last choice.

"All Files" mode reuses `allNotesCache` (the same all-file-content cache
`refreshAllNotesCache()` already builds for History and the date picker,
which conveniently already overlays live open-tab content over what's on
disk) instead of iterating `tabs`, running the same line-scanning
predicate across every file instead of just open ones.

The real design wrinkle: acting on a result (jump/toggle/forward-to-
today) that comes from a file which **isn't** currently open needs to
open it first. History's `jumpToHistoryItem` already does exactly this
(`openOrCreateDatedFile` handles both "already open → switch" and "not
open → read from disk" internally) — Action Drawer and Search's jump/
toggle/forward functions currently assume an already-open `tabId` and
need to fall back to that same open-or-create path when a result comes
from "All Files" mode and isn't open yet. Likely lands as one shared
`jumpToFileLine`-style helper reused by all three (Action Drawer, Search,
History) instead of three near-duplicate implementations.

---

## 20. Move "Import" to after "Search" in the top bar

**Status: implemented.** Pure reordering —
new order: Date, My Actions, Section History, Search, Import, New
Scratchpad, [Promote], Settings. No design questions here.

---

## 21. Warn before closing a non-empty scratchpad

**Status: implemented.** `requestTabClose`
currently only warns (via `SafetyModal`) when a tab has unresolved open
actions (`counts.open > 0`) — a scratchpad with real content but no `# `
lines closes silently today, permanently losing it, since scratchpads are
never written to disk. Fix: also warn whenever the tab being closed is a
scratchpad with non-empty content (`tab.isScratchpad && content.trim() !==
""`), independent of whether it also has open actions.

Reuses the existing `SafetyModal` rather than a new component — same
dialog, message text adapts to whichever condition(s) triggered it:

- Open actions only: unchanged, today's message.
- Non-empty scratchpad only: something like *"Tab 'Scratchpad 2' — closing
  it will permanently discard its content, since scratchpads are never
  saved to disk. Are you sure you want to close it?"*
- Both at once: both clauses combined into one message.

This is the single choke point for tab closing (`requestTabClose`, called
by `Ctrl+W` and the tab-bar's `✕`) — no other path calls `closeTab()`
directly, so there's nowhere this check could be bypassed. Also means the
§14 keyboard-navigation fix (focusing Cancel on mount) automatically
covers this new warning too, since it's the same modal. And since
`closeTab()` pushes to §16's reopen-history stack regardless of which
warning path led here, a scratchpad closed via this new confirmation is
still recoverable via `Ctrl+Shift+T` — this is the "stop me before I do
it" layer, §16 is the "let me undo it" layer.

---

## 22. Move "New Scratchpad" next to the rightmost tab

**Status: implemented.** Currently "New
Scratchpad" sits with the other action icons on the far right of the top
bar, outside `#tab-bar`. Since `#tab-bar` has `flex: 1`, it claims all the
space up to the action icons even when the actual tabs don't fill it — so
simply reordering the markup wouldn't visually move the button next to the
last tab, it'd still land at the far right edge with a gap.

Fix: move the button to be the **last child inside `#tab-bar` itself**
(after the `{#each}` tab loop), so it sits in the same flex-shrink-to-
content row as the tabs — genuinely adjacent to whichever tab is
currently last, including scrolling together with the tabs if the row
overflows (see §26). Needs `flex-shrink: 0` so it never gets visually
squeezed.

This interacts with §25 below (tabs sorted by date): once tabs are sorted,
"the rightmost tab" is always either the latest-dated note or, if any are
open, a scratchpad — either way, the button stays correctly positioned
since it's just "whatever renders last."

---

## 23. Bulleted lists (`- `)

**Status: implemented.**

New token: `- ` at the start of a line (optionally indented) → bullet
glyph `•`. Nesting works by prepending two spaces per level (`  - `, `    - `,
...) — the leading whitespace stays untouched, real, visible indentation;
only the `-` + trailing space gets replaced, so a nested line like
`  - Sub-item` renders as `  • Sub-item`, indentation doing the visual work
it already does everywhere else in the app.

**Regex approach:** the existing `#`/`v`/`>`/`!` tokens are all anchored at
the *absolute* start of a line (`^#\s`, no leading whitespace allowed) —
bullets are the first token that needs to tolerate leading whitespace
while still only replacing the marker itself, not the indentation before
it. Cleanest way: a lookbehind, `(?<=^\s*)-\s`, so the match itself is
just `- ` (2 chars) positioned correctly after however much indentation
precedes it — no manual "subtract the indent length" math needed in the
decorate callback. Same trick simplifies the atomic-ranges-only matcher
(§11) for this token too.

**Nesting via Tab already works for free.** Indenting a bullet line with
`Tab` (from the existing `indentWithTab` binding, §6.2/v1) adds one indent
unit before the `-`, which — as long as the editor's indent unit is
explicitly 2 spaces (worth locking in explicitly via `indentUnit.of("  ")`
from `@codemirror/language` rather than trusting an unconfirmed default) —
is exactly "prepending a `-` with two spaces." No bullet-specific Tab
handling needed, just confirming the indent unit.

**Enter / Shift+Enter, bound in the editor's own keymap (like `Ctrl+Space`
and `Ctrl+Shift+S`), only when the current line matches `^(\s*)-\s`:**
- `Enter` → new line, same leading whitespace, plus a fresh `- ` — continues
  the list at the same nesting level. Splits line content normally if the
  cursor isn't at the end (whatever's after the cursor moves to the new
  bulleted line, same as ordinary Enter would split text).
- `Shift+Enter` → new line, same leading whitespace, **no** `- ` — a
  continuation line for the current bullet's content, not a new bullet.
- Off a bullet line, both fall through: `Enter` defers entirely to
  CodeMirror's own default (smart-indent-aware) newline handling;
  `Shift+Enter` isn't bound anywhere else in the editor today, so this
  explicitly inserts a plain newline itself rather than risking it doing
  nothing.

**Assumed enhancement, flag if you'd rather keep it simpler:** pressing
`Enter` on an *empty* bullet (just `- ` or `  - `, nothing typed after it)
removes the bullet instead of adding another — the common "press Enter
twice to exit a list" pattern from most list-editing tools (Notion, Word,
many Markdown editors). Without it, exiting a list means manually deleting
a trailing empty bullet by hand.

**Single bullet glyph at every depth, not depth-varying (•/◦/▪-style):**
since indentation already visually encodes nesting depth, and keeping one
consistent glyph is simpler. Flag if you'd rather nested levels get
visually distinct bullet shapes.

---

## 24. Fixed-width glyphs — exact column alignment regardless of font

**Status: implemented.**

Even though `☐`/`☑`/`»`/`➔` are each single Unicode characters, single-
character string length doesn't guarantee single monospace-cell *rendered
width* — many symbol/dingbat characters render narrower or wider than a
standard letter in a given monospace font, which is exactly why text after
the glyph doesn't currently line up with text on a line that has no glyph
at all.

Fix: stop relying on the glyph's natural rendered width and force it via
CSS instead. Each `InlineGlyphWidget`'s `<span>` gets `display:
inline-block` plus an explicit `width` in `ch` units (the width of the
font's "0" character — the standard CSS unit for monospace-grid sizing):
`width: 2ch` for the `# `/`v `/`> ` replacements (`☐`/`☑`/`»`), `width:
3ch` for the `=> ` replacement (`➔`), matching your explicit note that the
arrow-plus-space needs three characters' worth of width. The widget's text
content drops its trailing space (no longer needed — the fixed-width box
itself provides the spacing), and the glyph left-aligns within that box,
landing exactly where the original marker character sat.

This is a pure rendering fix — doesn't touch the underlying regex, atomic
ranges, or the raw token in any file, and applies the same `2ch` treatment
to the new bullet glyph (§23) for consistency, even though you only named
`>`, `#`, and `v` explicitly.

---

## 25. Keep tabs ordered chronologically by date

**Status: implemented.**

Dated-note tabs sort earliest-to-latest, left to right; scratchpads always
sort after every dated tab, in their existing relative order (so newly
created/reopened scratchpads still land rightmost among themselves, same
as today). Since filenames are strict `YYYY-MM-DD.txt`, a plain string
comparison already sorts chronologically — no date parsing needed.

**Generalization worth flagging:** you described this as "earliest date up
to today, so today is always the most right date" — which is the normal
case, but if a *future*-dated note were ever opened (e.g. via the date
picker), a pure chronological sort would correctly place it even further
right than today, rather than treating today as a hard-pinned rightmost
boundary. That's the logical extension of "sorted by date," not a
contradiction of what you asked — flag if you specifically want today
pinned as an absolute rightmost bound regardless of any later-dated tab.

**Implementation is a display-order concern, not a storage-order one** —
the `tabs` store itself doesn't need reordering (every existing insertion
function like `createScratchpad`/`openOrCreateDatedFile`/
`reopenLastClosedTab` can keep appending as it does today). Instead, one
shared `sortedTabsForDisplay(list)` helper (dated tabs by filename string
comparison, scratchpads pinned after, stable sort preserving their
relative order) gets used consistently in three places so everything
stays coherent with what's visually on screen:
- `TopBar.svelte`'s render loop (obviously).
- `cycleTab()` (`Ctrl+Tab`/`Ctrl+Shift+Tab`) — so cycling moves to the
  *visually* adjacent tab, not just the next one in whatever order it
  happens to sit in the underlying array.
- `closeTab()`'s "which tab becomes active next" logic — so closing a tab
  activates its visual neighbor, matching the same expectation.

---

## 26. Tab bar overflow: left/right scroll buttons

**Status: implemented.**

`#tab-bar` already scrolls horizontally (`overflow-x: auto`) when tabs
don't fit, but only via trackpad/scroll-wheel or dragging the thin custom
scrollbar — no clickable affordance. Add `←`/`→` buttons that appear only
when there's actually overflow in that direction, each click scrolling the
tab strip by a fixed increment (proposing `scrollBy({ left: ±160,
behavior: "smooth" })` — roughly one to two tabs' width) rather than
jumping straight to either end.

**Implementation shape:** needs real DOM measurement, which is inherently
imperative rather than pure Svelte reactivity — a bound reference to the
`#tab-bar` element, a `ResizeObserver` (content width changes as tabs are
added/removed, or the window resizes) plus a native `scroll` event
listener (manual trackpad/wheel scrolling), both updating two booleans
(`canScrollLeft`/`canScrollRight`) that control whether each arrow button
renders. Click-and-hold continuous scrolling would be a nice-to-have on
top of this, not required for a first pass — single clicks stepping
through are enough to start.

**Amendment — priority order with §9's action-button labels.** In full
screen/maximized mode, §9 shows icon+label on every top-bar action button.
When the tab count grows enough that the tab strip and the labeled buttons
together no longer fit, the fix isn't to jump straight to scroll arrows —
it's to reclaim space first: **collapse the action-button labels back to
icon-only before showing the arrows at all**, and only show arrows if tabs
still don't fit even after that. So the actual priority order, re-evaluated
whenever the window resizes or the tab count changes, is:

1. Window not maximized/fullscreen → icon-only buttons (§9's existing base
   case). Check tab overflow, show arrows if needed.
2. Window maximized/fullscreen, and tabs + labeled buttons both fit →
   labels shown, no arrows.
3. Window maximized/fullscreen, but tabs + labeled buttons together
   *don't* fit → drop back to icon-only buttons first, reclaiming the
   space the labels were using, then re-check.
4. Even icon-only, tabs still don't fit → *now* show the scroll arrows.

This turns "should labels show" from a pure function of window state (as
§9 originally specced it) into something that also depends on measured
tab-bar overflow — so it shares the same `ResizeObserver`/measurement
plumbing this section already needs, just feeding one more derived boolean
(something like `showActionLabels`, computed from `chromeExpanded` AND
"tabs fit with labels shown") rather than wiring up separate observers for
the two concerns.

---

## Implementation notes: sections 10–21

- **§10 emphasis line** ended up simpler than specced: rather than
  replacing `! ` with an `[!]`-style widget (written before §13 moved the
  whole app away from bracket glyphs), the `!` character itself is left
  completely alone and just gets a `Decoration.mark` from the `!` through
  end-of-line, styled bold + `--glyph-emphasis-color`. No widget, no
  symbol to pick, zero width change — you literally see the `!` you typed,
  bolded. Not atomic, since nothing is replaced.
- **§10/§11 shared plumbing**: `glyphs.ts`'s `MatchDecorator` now uses the
  `decorate(add, from, to, match, view)` callback instead of the simpler
  `decoration` one, so a single regex match can add more than one
  decoration (the emphasis line-mark, or the `=> `-glyph-plus-`@name`-mark
  split). Verified by `svelte-check` passing clean, which would have
  caught a wrong property name on `MatchDecoratorConfig`.
- **§11's atomic-ranges fix** landed as specced: a second, separate
  `MatchDecorator` (`atomicMatcher`, regex `/(^#\s)|(^v\s)|(^>\s)|(=>\s)/gm`)
  builds an atomic-only `DecorationSet` that never includes `@name` or the
  emphasis mark, fed into `EditorView.atomicRanges` via a second field
  (`atomicDecorations`) on the `liveGlyphs` plugin, kept separate from the
  `decorations` field used for actual rendering.
- **§19's unification** went further than planned: `jumpToTabLine` was
  deleted outright and replaced by one `jumpToFileLine(item)` used by the
  action drawer, search, *and* section history (`jumpToHistoryItem` is now
  a one-line delegate to it) — not three near-duplicate functions as
  originally hedged.
- **§16 + §21 interaction confirmed as designed**: `closeTab()` pushes
  every close (regardless of which warning path allowed it, or none at
  all) onto the history stack, so `reopenLastClosedTab()` recovers from
  both.

---

## Implementation notes: sections 22–26

- **§23 bullet glyph** ended up using the same lookbehind trick
  (`(?<=^\s*)-\s`) for both the render matcher and the atomic-only matcher,
  same as specced — no indent-length arithmetic needed in either.
- **§23 indent unit** is now pinned explicitly via
  `indentUnit.of("  ")` from `@codemirror/language` (imported directly for
  the first time — previously only reached transitively through
  `@codemirror/commands`'s `indentWithTab`) rather than trusting an
  unconfirmed default, so nesting a bullet with `Tab` reliably adds exactly
  two spaces.
- **§24 fixed widths** dropped the trailing space from every glyph
  widget's text content once the CSS `width: Nch` was in place — the box
  itself provides the spacing now, so keeping a literal space in the label
  too would have risked overflow for any glyph that renders wider than
  expected.
- **§25 sort helper** (`sortedTabsForDisplay`) is used in three places as
  specced — `TopBar.svelte`'s render loop, `cycleTab()`, and `closeTab()`'s
  "which tab activates next" logic, which needed slightly more care than a
  simple `idx - 1`: it now finds the closed tab's position in the
  *sorted* order before removal, and activates whatever sorted position is
  one to the left of that afterward, so the newly-active tab is always the
  visual neighbor regardless of where the closed tab actually lived in the
  underlying (unsorted) `tabs` array.
- **§26 layout settling** is a small async "try labels, measure, fall back
  to icon-only, measure again" loop (`settleLayout()` in `TopBar.svelte`),
  guarded by a `settling` flag against overlapping runs from rapid resize
  events, re-triggered by a `ResizeObserver` on `#tab-bar` plus a reactive
  block watching `chromeExpanded` and the sorted tab list. A plain `scroll`
  listener on the same element separately keeps the arrow
  visibility (`canScrollLeft`/`canScrollRight`) in sync with manual
  trackpad/wheel scrolling, independent of the label-collapse logic.
- **§22 + §25 interaction confirmed as designed**: since "New Scratchpad"
  now renders as the last element inside `#tab-bar` after the sorted tab
  list, it naturally stays adjacent to whichever tab sorts last — no
  special-casing needed for the scratchpad-vs-dated-note question.

---

## 27. Bug fix: Action Drawer / Search ordering inconsistent between scopes

**Status: implemented.** "Open Tabs" mode listed groups most-recent-first;
"All Files" mode listed them least-recent-first — the opposite direction.

**Root cause:** "All Files" mode iterates `Object.keys(allNotesCache)`,
whose insertion order comes straight from the backend's `read_all_notes`,
which the Rust side (`list_note_files`) sorts *ascending* for its own
purposes. "Open Tabs" mode iterated `get(tabs)` in raw insertion order,
which isn't date-sorted at all but happened to look roughly recent-first
for typical usage. Neither path was deliberately ordered — §19 (all-files
toggle) never addressed ordering when it added the second scope, only
which files/tabs to include.

**Fix:** both scopes now explicitly sort most-recent-first before
building their snapshot/results list, via two small helpers in
`controller.ts`:
- `sortFilenamesByRecency()` — the same "sort ascending, then reverse"
  idiom `openMeetingHistory()` already used for section history, applied
  to `buildActionSnapshotAllFiles()` and `runSearch()`'s "all" branch.
- `compareTabsByRecency()` — a tab comparator (dated tabs newest-first,
  scratchpads always last), the mirror image of §25's
  `compareTabsForDisplay` which sorts the opposite direction for the tab
  bar itself. Applied to `buildActionSnapshotOpenTabs()` and `runSearch()`'s
  "open" branch. Deliberately a separate function from §25's tab-bar
  comparator rather than a shared/parameterized one — the tab bar and
  these drawers have genuinely different, independently-justified
  ordering conventions (a left-to-right timeline vs. a most-recent-first
  list), so keeping them as two small, separately-named functions reads
  more clearly than one comparator with a direction flag.

**Follow-up, same root cause found elsewhere:** the Date drawer
(`Ctrl+O`/`DatePickerModal.svelte`) had the identical bug — its "existing
notes" list also iterated `Object.keys(cache)` directly, so it listed
oldest-first. Fixed the same way: `sortFilenamesByRecency()` is now
exported from `controller.ts` and reused there rather than duplicating
the sort inline, so all three places (Action Drawer, Search, Date picker)
share one ordering rule instead of three independent ones that could
drift again later. The typed-query "Direct match" line is unaffected —
it's a distinct pinned-to-top result, not part of the browsed list.

---

## 28. "New Scratchpad" never shows a label

**Status: implemented.** Since §22 moved this button inside `#tab-bar`,
it no longer participates in §9/§26's icon+label toggle — it's always
plain `＋`, regardless of `showActionLabels`. One-line removal of the
`{#if showActionLabels}...{/if}` from that specific button in
`TopBar.svelte`; every other action button keeps the conditional.

---

## 29. Bug fix: Shift+Enter in a bulleted list used the wrong indentation

**Status: implemented.** `bulletContinuation()` in `EditorPane.svelte` was
reusing `indent` (the bullet's own leading whitespace) directly for the
`Shift+Enter` branch, producing a continuation line at the *bullet's*
indentation rather than aligned under its *text* — for a top-level bullet
(`indent === ""`), that meant no indentation at all. Fixed to
`indent + "  "` (two spaces past the bullet's own indent, matching the
width one glyph+space occupies per §24), so continuation lines correctly
align under the bullet's text at every nesting depth. `Enter`'s
same-indentation sibling-bullet behavior was already correct and is
unchanged.

---

## 30. Bug fix: selecting a line didn't visually select the glyph

**Status: implemented.** Root cause turned out to be different from the
leading hypothesis logged in `next-revision-notes.md`: not a CSS/coordinate
quirk to work around, but a genuinely missing extension. `EditorPane.svelte`
never actually installed CodeMirror's `drawSelection()` extension — yet
`app.css`'s cursor styling already targeted `.cm-cursor-primary`/
`.cm-cursor-secondary`, which are specifically the class names
`drawSelection()` creates for its own custom-drawn cursor. That styling
had been present since the very first build and was silently inert; the
editor was relying on native browser DOM-range selection the whole time,
which has known quirks painting selection backgrounds across
`display: inline-block` elements (exactly what §24 turned every glyph
widget into). Adding `drawSelection()` switches to CodeMirror's own
coordinate-based selection/cursor rendering, which correctly measures and
paints across widget boundaries, and activates the previously-dead cursor
CSS as a side benefit. Worth a specific check after this that the caret
still renders as a single, correctly-colored line (not doubled) — the
extension's own base theme and `app.css`'s `!important` caret-color rule
could in principle fight over the native caret if `drawSelection()`
doesn't fully suppress it, though standard CodeMirror setups don't expect
that conflict.

**Follow-up regression, fixed in the same section:** `drawSelection()`'s
own default theme assumes a light-background editor — its selection fill
is a near-white color, which against our dark theme's light text made
selected lines nearly unreadable (reported immediately after this landed,
in both grayscale and color mode, so it wasn't a theme-specific issue).
Fixed by overriding `.cm-selectionBackground`/`.cm-focused
.cm-selectionBackground` with a new dedicated token,
`--editor-selection-bg` — deliberately a neutral blue-gray, defined once
per light/dark (not per color/grayscale mode, unlike the `--glyph-*`
tokens), since its only job is staying legible under *any* possible
foreground color rather than carrying semantic meaning of its own.

---

## 31. Window title shows the current notes folder's name

**Status: implemented.** Title becomes `ChronoNote - <folder>` (e.g.
"ChronoNote - Notes"), where `<folder>` is just the last path segment of
`notesDir`, not the full path — so it's clear at a glance which
project/scope (§6.3) is currently open. Implemented as a `notesDir.subscribe(...)`
side effect in `controller.ts` calling `getCurrentWindow().setTitle(...)`
(from `@tauri-apps/api/window`, already imported for §9's window-chrome
watcher) — fires correctly regardless of which code path changed
`notesDir` (initial boot vs. a directory switch), rather than needing a
call at each site. Path parsing splits on both `\` and `/` to handle
Windows and Unix paths uniformly. Required one addition to
`src-tauri/capabilities/default.json`: `core:window:allow-set-title`,
added explicitly rather than assuming `core:default` already covers it.

---

## 32. Bug fix: dragging inside a modal could close it on mouse-up outside

**Status: implemented.** Reported against the Import drawer specifically —
resizing `.import-textarea` via its native corner handle and releasing the
mouse outside the drawer closed it, even though the gesture was a resize,
not a request to dismiss. Root cause was generic to all 7 dismissable
modals (`ActionDrawerModal`, `HistoryModal`, `SearchModal`,
`DatePickerModal`, `SectionImportModal`, `ShortcutsModal`,
`SettingsModal`): each overlay used `on:click|self={controller.closeAllModals}`,
which only checks the *click* event's target. A drag that starts inside
the modal (resizing a textarea, or simply selecting text with the mouse)
but ends with the pointer over the overlay fires a `click` whose target
*is* the overlay, satisfying `|self` even though the user never intended
to click outside. `SafetyModal` and `UnsavedScratchpadsModal` were never
affected — by design they have no click-outside-to-close behavior at all
(§13), only explicit Cancel/Confirm.

Fixed with a small shared Svelte action,
`closeOnOutsideClick` (`src/lib/actions/closeOnOutsideClick.ts`), used via
`use:closeOnOutsideClick={controller.closeAllModals}` in place of the old
`on:click|self` on all 7 overlays. It tracks whether the *mousedown* that
started the current gesture also landed on the overlay itself, and only
closes if both the mousedown and the click targeted the overlay directly
— so a drag that starts on any child element (textarea, list item, input)
never closes the modal, no matter where the mouse is released.

---

## 33. Import drawer: remember unsaved draft text between opens

**Status: implemented.** Requested behavior:
if the Import drawer (`Ctrl+Shift+I`) is closed — via Cancel, Escape, or
an outside click — while its textarea holds text that was never actually
imported, keep that text in memory. The next time the drawer opens,
pre-fill the textarea with it, with the text **selected** (not just the
cursor placed), so typing immediately overwrites it if it's no longer
wanted, while a stray click-away or Escape doesn't silently lose it.

Proposed implementation:
- A new module-level variable in `controller.ts`, e.g. `importDraftText`
  (plain string, not a store — nothing else needs to react to it), mirroring
  the existing in-memory-only pattern used for `lastCopiedAction` (§10).
  Session-lifetime only: never written to `config.json` or disk, and lost
  on app restart, consistent with the "Zero Database" tenet (spec §1) —
  this is scratch memory, not note content.
- `SectionImportModal.svelte`: on mount, if `importDraftText` is
  non-empty, initialize `text` from it and call `textareaEl.select()`
  instead of (or in addition to) `.focus()`. On close — Cancel, Escape, or
  the outside-click handler from §32, i.e. every path that does *not* go
  through `submit()` — save the current (possibly-edited) `text` back into
  `importDraftText` if non-empty, or clear it if the field was left empty.
- On a successful `submit()` (the actual Import button / Ctrl+Enter path),
  clear `importDraftText` — the text has been consumed, so nothing should
  reappear next time the drawer opens.
- `performDirectorySwitch` (§8's full workspace reset) also clears
  `importDraftText`, per confirmed answer to open question 2 below — a
  directory switch is a clean slate, and the draft should not leak from
  one notes folder's working context into another's.

Confirmed answers, all reflected in the implementation:
1. "Input that was not important" means "input that was not yet
   **imported**".
2. The draft does **not** survive a notes-directory switch (§8) —
   `performDirectorySwitch` calls `clearImportDraft()`.
3. A single global draft, not per-tab.

Implementation matches the proposal above exactly: `importDraftText` in
`controller.ts`, `getImportDraftText()`/`saveImportDraft()`/
`clearImportDraft()` as the only ways to read or mutate it.
`SectionImportModal.svelte` seeds its local `text` from the draft at
component creation (so the textarea's first render already shows it — no
post-mount flash), and calls `.select()` in `onMount` only when a draft
was actually loaded, leaving a fresh empty drawer's focus behavior
unchanged. Escape and the §32 outside-click handler route through a
shared `closeDrawer()` that saves the current text as the new draft (or
clears it, if left empty); `submit()` clears the draft instead, since
that text has now been consumed.

**Follow-up refinement (tested and requested immediately after landing):**
Cancel does not follow that same "remember it" path. Clicking Cancel is a
deliberate "discard this" action, distinct from Escape or clicking away —
which read more as incidental dismissals a user might want to recover
from — so Cancel calls `clearImportDraft()` directly instead of going
through `closeDrawer()`.

---

## 34. Session restore: remember open tabs and the active tab per folder

**Status: implemented.** Previously `initApp()` always called
`bootstrapTodayTab()` (`controller.ts`) unconditionally — every launch
opened exactly one tab, today's dated note, and made it active. Nothing
about which tabs were open or which one had focus was persisted anywhere;
`AppConfig` (`storage.rs`) only held `notes_dir` and `color_mode`.
Requested behavior: reopening the app restores the tabs that were open
last time, with the tab that was active last time active again — and this
is remembered **per notes folder**, so switching folders (§8) and
switching back restores each folder's own last-known session, not a
single global one.

Confirmed answers to the three open questions below, both reflected in
the implementation:
1. If the previously-active tab can't be restored (file deleted, or it was
   a scratchpad — which never persists), **today's tab** becomes active.
2. Today's dated tab is **always** force-opened, regardless of what else
   restores — it's also what a fully-empty restore (every previously-open
   file now deleted) naturally falls back to, satisfying the existing
   always-at-least-one-tab guarantee for free.
3. The per-folder session is stored **inside each notes folder itself**
   (a small non-`.txt` file), not in the global `config.json` — so it
   travels with the folder if it's ever moved or copied, and switching
   between many folders over time doesn't grow one ever-larger global map
   of stale entries for folders that may no longer even exist.

Implementation:
- **What's persisted, per folder:** the list of open *dated* tab filenames
  (`YYYY-MM-DD.txt`) and which filename was active. Scratchpads are
  excluded — spec 1.3 makes them memory-only by design (never written to
  disk), so there is nothing to restore for one after the process has
  exited. Display order is never stored, since tabs are always re-sorted
  chronologically on render regardless of array order (§25) — only the
  filename set and the active filename matter.
- **Where it lives:** a new `.chrononote-session.json` file written
  directly in the notes folder root (`storage.rs`: `TabSession { open_tabs:
  Vec<String>, active_tab: Option<String> }`, via new `read_tab_session`/
  `write_tab_session` commands). `is_valid_note_filename`'s strict
  `YYYY-MM-DD.txt` check already excludes it from every note-scanning path
  (`list_note_files`, `read_all_notes`), so it never shows up as a note in
  search, the action drawer, or section history.
- **When it's saved:** `controller.ts` subscribes to both `tabs` and
  `activeTabId` (same pattern as the `notesDir.subscribe(...)` →
  window-title code from §31), computing the tuple (sorted non-scratchpad
  filenames, active filename-or-null-if-scratchpad) on every change and
  persisting only when that tuple actually differs from what was last
  written — so ordinary content autosave, which also calls `tabs.set(...)`
  on every edit via `writeTabContent`, recomputes the same tuple and skips
  the write instead of hitting disk on every keystroke. A 150ms debounce
  (`sessionSaveTimer`) coalesces the two near-simultaneous `tabs`/
  `activeTabId` updates a single tab operation (e.g. closing a tab) causes
  into one write.
- **When it's restored:** `restoreOrBootstrapTabs()` replaces the old
  `bootstrapTodayTab()`, called from both `initApp()` and
  `performDirectorySwitch()`. It reads the current folder's
  `.chrononote-session.json` (if any), calls `readNote()` for each saved
  filename — silently skipping any that come back missing, no toast, no
  error — force-adds today's tab, and sets it active unless the
  previously-active filename survived among the restored tabs.
- **Guarding against a restore race:** a module-level `restoringTabs` flag
  suppresses the save-subscription while `restoreOrBootstrapTabs()` is
  rebuilding the stores step by step (each intermediate `tabs.set(...)`
  would otherwise itself look like a real state change worth persisting),
  and explicitly cancels any debounced save left pending from just before
  the restore started — relevant for `performDirectorySwitch`, which
  clears `tabs`/`activeTabId` immediately before calling
  `restoreOrBootstrapTabs()`, since without that cancellation a slow
  restore could let that leftover timer fire mid-restore and write a
  half-built state to the *new* folder's session file. One explicit save
  fires right after the restore completes, capturing the settled result
  and seeding the dedup baseline for future no-op writes.
- **First time a folder is opened** (no session file yet): falls back to
  today's tab only, exactly like the old behavior.

---

## 35. Launch performance: no more white flash, faster time-to-typable

**Status: implemented.** Reported symptom: on launch, a plain white
window shows briefly before turning to the (dark, OS-default) theme, and
the app feels slow to reach a typable state. Investigated before touching
anything (see the assessment shared in chat) — the flash was **not** a
CSS or Svelte issue (`body`'s dark background and the `.boot-loading`
placeholder in `App.svelte` were already correct and would paint
near-instantly once the webview renders anything), it was purely a
platform-level gap: `tauri.conf.json`'s window had no `visible` setting,
so Tauri's default (`true`) shows the native OS window immediately on
creation, before WebView2 has done its own cold-start and painted a
single pixel of our HTML/CSS. That gap is inherently blank, regardless of
how fast our own code runs, and no amount of front-end optimization
removes it.

Fixed with two independent changes:
- **The flash itself:** `tauri.conf.json`'s window now starts
  `"visible": false`. In Rust's `setup()` hook (`lib.rs`,
  `show_window_without_flash`), before the window is ever shown, it reads
  the window's actual OS theme via `window.theme()` and calls
  `set_background_color()` to match (dark `#1e1e1e` or light `#ffffff`,
  mirroring `--bg` in `app.css`) — only then does it call `.show()`. The
  window's own native background now matches what the webview is about
  to paint, so there's nothing to flash between; light-mode users get a
  correctly-matching white background instead of an assumed dark one.
  This is a synchronous sequence inside `setup()` with no dependency on
  frontend readiness (no waiting on `initApp()`/IPC), so there's no risk
  of the window silently never appearing if something in the JS boot path
  were to hang.
- **Time-to-typable:** `restoreOrBootstrapTabs()` (§34) was reading each
  restored tab's file with a sequential `for...await` loop — one IPC
  round-trip per tab, one after another. Rewritten to fire all reads
  concurrently via `Promise.all`, so N restored tabs cost roughly one
  round-trip's worth of wall-clock time instead of N. Purely a
  latency/ordering change — the missing-file-skips-silently and
  today's-tab-always-included behavior from §34 are unchanged.

Considered and deliberately not done: hiding the window and waiting for
an explicit "frontend ready" signal before showing it (more moving parts,
and a real risk of the window never appearing if `initApp()` throws or an
IPC call hangs — the background-color approach above achieves the same
result with none of that risk, so there was no reason to reach for it);
and bundling a fixed WebView2 runtime instead of the shared one (would
not have addressed either symptom — the flash is a window/webview
sequencing issue, not a WebView2-installation one — while meaningfully
growing the installer and adding a runtime-update burden this app
doesn't otherwise have).

---

## 36. Thin, theme-matched scrollbars and a themed textarea resize grip

**Status: implemented.** Requested look: replace the OS-default scrollbar
with something thinner and theme-aware, "similar to Notepad or the Claude
application" — applied to the editor first, then to every other
scrollable/resizable area for consistency (the request named the Import
drawer's textarea specifically).

- `app.css` styles `.cm-scroller` (the editor), `.modal-list` (search/
  history/action-drawer results), and `.import-textarea` with
  `scrollbar-width: thin` / `scrollbar-color` (standards-track) and
  matching `::-webkit-scrollbar`/`-track`/`-thumb`/`-thumb:hover` rules
  (WebKit/Chromium, which covers all three Tauri desktop targets — none
  of Windows/WebView2, macOS/WKWebView, or Linux/WebKitGTK is
  Gecko-based). Thumb/track colors reuse the existing `--border`/`--muted`
  tokens, so light/dark and color/grayscale are already handled with no
  extra rules, same pattern as the pre-existing `#tab-bar` scrollbar (§25).
- **Follow-up, found while testing:** once the scrollbar appeared, the
  textarea's bottom-right resize grip showed a stray white sliver.
  Diagnosed in two passes (confirmed by a zoomed screenshot on the
  second): it was **not** the scrollbar-corner pseudo-element alone (that
  needed its own fix too — `::-webkit-scrollbar-corner` defaults to an
  opaque white box, separate from the track/thumb) — the more stubborn
  part was that Chromium's *native* resize-grip icon bakes in its own
  light top/left 3D-bevel highlight as part of the themed icon itself,
  which isn't a separate layer `background-color` can strip out. Worse,
  styling `::-webkit-resizer` at all (confirmed experimentally) switches
  Chromium off native rendering for it entirely — a plain
  `background: transparent` left the grip fully invisible (still
  functional, just unstyled/blank) rather than just removing the bevel.
  Resolved by fully replacing the icon: `background-image` with a small
  inline SVG (three diagonal lines, the classic grip shape, mid-gray
  `#888` chosen to read on both light and dark) instead of
  `mask-image` — deliberately avoided masking since these scrollbar
  sub-pseudo-elements only reliably support a limited CSS subset, and
  `background-image` was already proven to work here (it's how the thumb
  color is set).
