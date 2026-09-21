# ChronoNote — Changelog

Historical record of every change agreed after the first working build,
kept for the rationale behind each one — not just *what* changed but
*why*. Originally tracked as a pending-requirements doc while each batch
was still being gathered and confirmed before implementation; renamed once
everything below was applied, since nothing here is "pending" anymore.

**Status: all sections through §195 implemented** (§178–§180 in v0.9.5: a save-only-when-changed fix and two GitHub issues, #76/#77; §181–§186 in v0.10.0: the Android app and OneDrive sync; §187–§188 in v0.11.0: OneDrive sync for the web app, and the fixes found reviewing and testing it; §191–§195 are unreleased: Android folder switch, short Settings labels, and v0.12 Releases A, B, and C). §153 is a
website-only Guide-page fix (found live right after §150–§152 shipped
as v0.7.12) — no version bump, nothing in the shipped app changed. §154
merges the OS title bar into the top bar (Notepad-style: icon, tabs,
minimize/maximize/close) — a real, user-visible native-window change,
held for Marien's own hands-on test before release, then shipped as
v0.8.0 (a minor bump rather than another v0.7.x, since v0.7 had already
reached 12 patch releases and this is a genuine UI change, not a patch).
§155 is a same-day bug fix found right after v0.8.0 shipped: Section
History's modal could grow past the window when the "From" occurrence
was long, instead of scrolling internally — fixed and shipped as
v0.8.1. §141's desktop-app
Import feature shipped as v0.7.9; §143's cross-platform shortcuts and
§144's top-bar collapse shipped together as v0.7.10. §145 is a
same-release cleanup pass over §143's deferred comment/test-title
wording — no version bump of its own. §146 (a reverse action-state cycle
shortcut plus three website follow-ups) and §147 (the status bar's
narrow-window collapse) shipped together as v0.7.11. §148 and §149 are
website/asset-only fixes found live right after that release (no
shipped-app change, so no version bump of their own): the Guide page's
rendered examples were too faint to see, and the web app's icon was a
stale pre-0.4 mark. §150 is a Section History overhaul (browsable
headers for every occurrence — past, empty, and future — a full-width
"Previous occurrence" pane always anchored to today, an "Only Open"
filter, and a glyph-rendered, scrollable "From" panel) — a real
desktop-app change. §151 is four small chat-feedback follow-ups (release
links open the full releases list instead of one tag, the status-bar
version number and update message are both clickable shortcuts to
About, and the date picker only bolds a day once it actually has
content). §152 adds the marketing website to About's links (alongside
GitHub, both now labeled) and folds the standalone "Version" section
into the title row. §150–§152 shipped together as v0.7.12. §141–§144's
web-app pieces are separately deployed live at
`app.chrononote.mariendegelder.nl` and `chrononote.mariendegelder.nl` —
that side needs no version bump of its own, a website deploy is
independent of a desktop-app release.
§138–§139 are implemented but were never themselves a release — they
don't touch the shipped app at all (a new marketing site + a dev-only
test scenario).
§99–§110 are the 0.6 UX/UI pass (`docs/design/ux-roadmap-0.6.md`); §111 is
a small v0.6.1 follow-up (the pre-0.6 glyph palette, back as an option).
§112 (#28) and §113 (#27) are Section History follow-ups (v0.6.2).
§114–§118 close #33–#37 (v0.6.3). §119–§122 close #38–#41 (v0.6.4).
§123 (#42) fixes the delegated-`@name` badge widening the line (v0.6.5).
§124–§126 are chat-feedback tweaks, released in v0.6.6: `=>` Enter on a
plain follow-up adds no `#`, `@name` may contain a hyphen, and `(@name)`
is a delegate. §127 is the 0.7 "maturity pass" — the UX/UI consistency
review plus the new icon set (`docs/design/maturity-0.7-roadmap.md`).
§128 is the GitHub-releases update check (same roadmap, Feature 3.1) —
the second of its two proposed features, M365 calendar import, is still
just a design (0.8.0, not started). §129–§131 close three GitHub issues
filed after the 0.7 pass (#46, #47, #48). §132 closes a fourth (#49,
top-bar alignment); §133 is the app-icon redraw the 0.7 roadmap called
for but deferred out of v0.7.0. §134 is a follow-up correction to §132
after its fix overcorrected visually. §135 fixes a long-standing
opener-plugin permission-scope bug (chat feedback, no issue) that made
the About drawer's external links silently do nothing. §136 closes #50
(a first-run-after-update notice) plus an always-visible status-bar
update icon (chat feedback, no issue). §137 (chat feedback, no issue) is
a date-picker perf/UX pass — fast per-visible-month loading, a loading
spinner, and opening on the active tab's own date. §138 is a new
`website/` marketing site, local-only at first, plus the `"demo"`
scenario it embeds. §139 turns that demo into a self-contained static
bundle and publishes the site to `chrononote.mariendegelder.nl` via
Plesk's own Git-pull (no credentials anywhere — Plesk clones the public
repo directly). §140 flips the default glyph palette from `Grayscale` to
`Color` (chat feedback, no issue), and fixes the demo's hardcoded
placeholder version number. §141 is Phase 1 of the browser-storage web
app (`docs/design/webapp-roadmap.md`) — a new `WebBackend` (IndexedDB),
export/import shared between the desktop app and the web app, and the
new `vite.webapp.config.ts` build target. §142 deploys it live to
`app.chrononote.mariendegelder.nl` (sharing the main site's existing
Plesk checkout, no second Git repo needed), adds landing-page CTAs
linking to it, and adds PWA/offline install. §143 makes every keyboard
shortcut platform-correct — Ctrl on Windows/Linux, Cmd on Mac — across
the app, demo, web app, and website, via one new shared registry
(`shortcuts.ts`/`platform.ts`) that six previously-separate display
surfaces and the window-level matcher all now read from. §144 (#56)
collapses the top bar's secondary action buttons into a "More actions"
popover on a narrow window, freeing that space back to the tab strip —
and along the way fixes a real pre-existing timing bug where the
responsive layout system could permanently miss its own recalculation
after a tab was added while the window was already narrow. §145 is a
cleanup pass over §143's deferred comment/test-title wording, which also
caught and fixed a real Playwright bug: 15 key-presses that §143's
migration had wrongly turned Mac-aware even though the bindings they
test are deliberately Windows/Linux-only. §146 adds a backward
action-state cycle (`Ctrl+Shift+Space`/`Ctrl/Cmd+Shift+Enter`) plus three
website follow-ups (Guide-page rendered examples, favicon/social-preview
tags — screenshots/GIFs left undone, a real tooling blocker). §147
collapses the status bar's own content on narrow windows/screens, fixing
an "Open" count running straight into the web app's "Browser storage"
badge with no gap, reported from a phone.
Each
section is verified before merge (`svelte-check`, the Vitest suite,
`cargo test`, and — from §77 on — the Playwright E2E suite, all green in
CI). See each section for what it covers and why. §27–31 were small fixes
logged briefly in a `next-revision-notes.md` scratch file before being
folded in here; everything from §32 on was written directly.

Which sections shipped in which release: §1–55 → v0.2.0, §56–59 → v0.2.1,
§60–74 → v0.3.0, §75–81 → v0.4.0, §82–83 → v0.4.1, §84–85 → v0.4.2,
§86–87 → v0.4.3, §88–89 → v0.4.4, §90–91 → v0.4.5, §92 → v0.4.6,
§refactor + §93–96 → v0.5.0, §97 → v0.5.1, §98 → v0.5.2, §99–110 → v0.6.0,
§111 → v0.6.1, §112–113 → v0.6.2, §114–118 → v0.6.3, §119–122 → v0.6.4,
§123 → v0.6.5, §124–126 → v0.6.6, §127 → v0.7.0, §128 → v0.7.1.

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

---

## 37. Section History didn't match titles that include a date

**Status: implemented and confirmed** (retested against the large stress
dataset: went from finding only a single literal-match hit to correctly
aggregating 16 results for the same recurring section across different
dates). Found during stress testing with a large generated dataset.
`openMeetingHistory()`
matches a section's history by comparing `normalizeHeaderTitle()` output
case-insensitively (`controller.ts`, the `h.toLowerCase() ===
targetHeader.toLowerCase()` check). `normalizeHeaderTitle()`
(`tokens.ts`) only strips a leading `[HH:MM - HH:MM]` time range or a
leading `[CANCELED]` tag — it does nothing about a date embedded in the
title itself. A title like `Weekly Sync - 2026-08-08` therefore never
matches `Weekly Sync - 2026-08-09` from a different day, defeating the
point of "history for this recurring section" the moment someone's
section-naming habit includes today's date (a very natural thing to do,
and exactly what the synthetic stress-test dataset's generator did for
every title, which is how this surfaced).

**Fix:** a new `titleForMatching()` in `tokens.ts` strips a leading or
trailing `YYYY-MM-DD` token (with a `" - "`, `": "`, or bare-space
separator) from `normalizeHeaderTitle()`'s output, and is layered on top
of it rather than folded in — `normalizeHeaderTitle()` itself is
unchanged, since it's also used to build the Action Drawer's per-action
section-tag *display*, where the date is useful context, not noise.
`openMeetingHistory()`'s two comparison sites (the target header and each
candidate section's header) both go through `titleForMatching()`; the
drawer's own "Section History: ..." heading now shows this canonical
(date-stripped) form too, since it aggregates entries from many different
dates under one topic.

Accepted limitation, unchanged from the original proposal: only the
spec's own `YYYY-MM-DD` format is stripped — other date spellings a user
might type (`Aug 8`, `08/08/2026`) aren't recognized.

---

## 38. Large-dataset stress test: findings, fixes, and retest results

**Status: implemented and confirmed via retest against the 3000-file
tier**, including once more against a copy of that dataset placed outside
OneDrive specifically to rule OneDrive out as a variable (per the user's
suggestion) before re-measuring.

### Methodology

Generated three synthetic dated-note datasets (dense, every calendar day,
realistic mixed content — sections, bullets, actions, followups,
emphasis) in an isolated folder outside the real notes directory
(`ChronoNote-StressTest-Data/tier-{small,medium,large}`, 30/500/3000
files respectively), each seeded with a `.chrononote-session.json`
simulating ~20 previously-open tabs so the restore path (§34) could be
exercised without manually opening tabs. Pointed the app at each tier in
turn via `config.json` (not through the Settings UI, to avoid needing
screen control the assistant doesn't have — see below), full-restarted
between tiers, and exercised Action Drawer/Search (both "All Files"),
Date picker, and Section History at each size.

Added temporary timing instrumentation (a Tauri `append_perf_log`
command, an `appendPerfLog` wrapper, and `performance.now()` wraps around
`refreshAllNotesCache`, `buildActionSnapshotAllFiles`, `openMeetingHistory`,
and `restoreOrBootstrapTabs` in `controller.ts`) logging to a file outside
git and outside the notes folder, since there's no way to attach a
profiler to the running window from outside it. This instrumentation is
still in the tree as of this writing — flagged for removal once any
resulting fixes are implemented and re-verified against it, so it doesn't
ship. A relevant methodology constraint: the assistant has no OS-level
screen or mouse control (only browser-automation tools, which can't reach
a native Tauri window) and no way to view the live window, so folder
switching was done by editing `config.json` directly and all interactive
verification (does it *feel* smooth, does a visual artifact appear) relied
on the user driving the app and reporting back / sending screenshots.

### Findings

**Confirmed cheap regardless of dataset size:**
- `restoreOrBootstrapTabs()` (§34): ~30ms flat across all three tiers
  (30/500/3000 files) — it scales with *open tab count* (~20 here), not
  total notes in the folder, exactly as designed. No action needed.
- Scrolling the (unvirtualized) 12,544-item Action Drawer "All Files"
  list on the large tier: user-reported "quite ok, barely perceptable
  lag." Not currently a priority on its own.

**Confirmed to scale with folder size, and now measurable:**
- `refreshAllNotesCache()` — reads every file's full content via
  `read_all_notes` and ships it across IPC in one call, unconditionally,
  every time Action Drawer/Search ("All Files") or the Date picker or
  Section History opens. Measured: ~7ms (30 files) → ~40ms (500 files) →
  ~210ms (3000 files, warm). Real but not severe on its own.
- One outlier: a single `refreshAllNotesCache` call on the large tier
  measured **2.1 seconds** — roughly 10x the other same-size calls
  moments earlier. OneDrive was confirmed paused beforehand (ruling out
  the sync-contention theory this assistant first suspected) and the user
  wasn't typing/saving at that moment either. Left unexplained — best
  remaining guess is unrelated external I/O contention (e.g. Windows
  Search Indexer reacting to 3000 freshly-created files, or antivirus
  real-time scanning), not something the app can fully control or that's
  worth building speculative mitigation for. Noted as a watch-item: if a
  multi-second stall recurs in normal use (not stress testing), revisit.

**The standout, well-understood, high-priority bug — "search all files
almost froze the app for a couple of seconds":** two independent,
compounding causes, both confirmed by reading the code, not guessed:
1. `SearchModal.svelte`'s `$: controller.runSearch(query, scope)` is a
   plain reactive statement — it re-runs on **every keystroke**, with no
   debounce. In "All Files" scope, `runSearch()` splits every cached
   file's content into lines and does a substring check against **every
   line of every file**, synchronously, on the main thread. At 3000
   files this is tens of thousands of lines re-scanned per character
   typed, blocking rendering/input the whole time it runs — typing a
   3-letter query fires this three times in a row.
2. Independently, `SearchModal.svelte` (and, found while checking,
   `ActionDrawerModal.svelte` too — same pattern, likely dormant there
   for the same reason) determines which rendered row is
   keyboard-selected via `{@const idx = flatList.indexOf(item)}` **inside
   the `{#each}` render loop** — an O(N) lookup performed once per
   rendered row, making the render itself O(N²) in match count. With a
   common query like "the" plausibly matching thousands of lines across
   3000 files, this alone is expensive; combined with #1 re-triggering it
   on every keystroke, the two compound into the multi-second freeze
   reported.
   `ActionDrawerModal.svelte`'s own filter-while-typing wasn't reported as
   laggy — plausibly because it only re-filters an already-built
   in-memory array (cheap) rather than re-scanning raw file text like
   Search does, so cause #1 doesn't apply there even though cause #2
   (the `indexOf` render cost) does, and wasn't triggered by the tests run
   so far. Worth explicitly testing the Action Drawer's text filter at
   the large tier before assuming it's fine.
- §37 (Section History date-matching) was found during this same testing
  pass and is logged separately above; not repeated here.

### Changes implemented, and retest results

1. **Fixed the O(N²) `indexOf` selection lookup** in both
   `SearchModal.svelte` and `ActionDrawerModal.svelte` — each list now
   annotates every item with its own `__flatIndex` once, while building
   the flat/grouped list, instead of recomputing it per rendered row via
   `flatList.indexOf(item)`. Zero behavior change, pure performance fix.
2. **Debounced the Search input in "All Files" scope** (200ms after
   typing stops; an empty query still runs immediately, since there's
   nothing to scan and waiting out a debounce just to clear the list
   would itself feel laggy). "Open Tabs" scope stays synchronous — its
   cost is already small, bounded by open-tab count, not total notes.
3. **Cached `allNotesCache`'s disk-read layer, invalidated only on
   write.** `refreshAllNotesCache()` now only calls `read_all_notes` when
   a new module-level `diskNotesCacheRaw` is `null`; the (cheap) merge
   with currently-open tabs' live content still re-runs every time, so an
   unsaved edit is never stale regardless of the disk layer's freshness.
   All 5 call sites that write a note now go through a new
   `writeNoteAndInvalidateCache()` instead of calling `api.writeNote()`
   directly — it only actually invalidates when the written filename has
   *no* open tab (`promoteScratchpad`'s brand-new today file,
   `forwardActionToToday`'s no-open-tab fallback); ordinary autosave
   writes (the overwhelming majority) skip invalidation entirely, since
   the live-tab merge already covers them regardless of disk-cache
   staleness. Resolved the open invalidation-story question from the
   original proposal: no manual "refresh" affordance was added for a file
   changed *outside* the app while it's running — an accepted, unchanged
   gap, not a new one.
4. **Virtualized Search's result list** (`SearchModal.svelte`) — of the
   four modals originally proposed for virtualization, only Search was
   built, deliberately, after a mid-point check-in: the other three
   weren't confirmed to actually need it (the user had already reported
   the large Action Drawer list scrolled fine), so virtualizing all four
   up front would have been speculative risk for unconfirmed benefit.
   Implementation: a flat array of fixed-height `Row`s (`{type: "header"
   | "item", ...}`, matching the existing group-header-then-items visual
   structure) with precomputed `top` offsets; only rows within the
   scrolled viewport (plus a 200px overscan buffer) are ever mounted,
   located via binary search over `top` (`rowAt()`) rather than a linear
   scan on every scroll tick. Keyboard nav calls a new
   `scrollSelectedIntoView()` explicitly from the Arrow Up/Down handlers
   (not reactively on `scrollTop`, which would otherwise fight a
   deliberate manual scroll away from the selected row). Action Drawer,
   Date picker, and Section History remain unvirtualized for now.

**Retest results** (3000-file tier, both inside and outside OneDrive —
no measurable difference between the two locations, so OneDrive was not
a factor in this environment):
- `refreshAllNotesCache`: first call (cold) ~415ms disk read; every
  subsequent call within the session ~0.8-1.3ms (cache hit) — down from
  ~210ms *every single time* before caching.
- `buildActionSnapshotAllFiles` (12,544 results): ~8-12ms total, down
  from ~220-230ms.
- `runSearch:all`, measured directly: **6-8ms even at 24,159 results** —
  confirms the scan itself was never the bottleneck once debounced; the
  remaining perceptible delay the user asked about afterward was
  render cost, not search cost, which directly motivated building #4.
- Section History (§37, retested here too): 16 results found across
  different dates, up from a single literal-match hit.

**Two more issues found and fixed during this same retest pass** (not
in the original proposal — surfaced by using the fixes, not predicted):
- **Toggling "Open Tabs"/"All Files" moved focus to the button**,
  requiring an extra click back into the input before typing a new
  query/filter. Fixed in both `SearchModal.svelte` and
  `ActionDrawerModal.svelte`'s `setScope()`: after the scope switches,
  `await tick()` then refocus the input and `.select()` its current
  text, so typing immediately starts fresh.
- **A "searching" spinner** (`.modal-spinner`, a small rotating ⟳) was
  added next to Search's match counter, shown while a debounced "All
  Files" scan is pending — the scan is wrapped in a `requestAnimationFrame`
  so the spinner actually gets a chance to paint before the (brief but
  synchronous) scan runs.
- **Two rows could appear highlighted simultaneously** — reported after
  scrolling the (now virtualized) Search results and then navigating with
  arrow keys: the row under the mouse cursor stayed highlighted via CSS
  `:hover` independently of the keyboard-selected row's `.selected`
  class, since a stationary mouse over content that scrolled underneath
  it doesn't fire a fresh `mouseenter`/`mouseleave`. This was a
  pre-existing bug, not something virtualization introduced — it would
  have reproduced the same way (mouse-wheel-scroll-then-arrow-key) before
  this session's changes too, just apparently never exercised that way
  before. Fixed by removing `:hover` from the shared `.modal-item`
  highlight rule in `app.css` (used by every list modal, so this fixes
  all of them at once) — `mouseenter` already updates the same
  `selectedIndex` keyboard nav uses, so with only one CSS trigger
  (`.selected`) left, whichever input touched it more recently naturally
  wins, matching the user's own suggested resolution exactly.

**Not pursued:** the 2.1-second outlier from the initial pass remains a
watch-item, not a fix — it didn't recur during retesting, including
outside OneDrive, and there's no reproducible cause to build mitigation
around.

### Final round: virtualized the remaining three modals

Requested explicitly after the Search retest confirmed the approach:
extended the same virtualization to `ActionDrawerModal.svelte`,
`DatePickerModal.svelte`, and `HistoryModal.svelte`.

- **Action Drawer**: identical structure to Search (group headers, then
  items), so reused the same fixed-height `Row` model and binary-search
  windowing verbatim.
- **Date picker**: simpler — a flat list with no grouping, so row
  position is `index * ITEM_ROW_HEIGHT` directly rather than needing
  precomputed offsets or a binary search.
- **Section History**: same grouped structure as Action Drawer/Search
  (grouped by date rather than filename). While implementing this one,
  found it still had the **exact same O(N²) `indexOf` selection bug**
  from earlier in §38 (`{@const idx = flatList.indexOf(it)}`) — missed in
  the first pass because History wasn't the surface that originally
  triggered the freeze investigation. Fixed the same way as Search/Action
  Drawer: each item now carries its own `__flatIndex`, assigned once.

All three follow the same pattern as Search: fixed/dictated row heights
(not measured), a 200px overscan buffer, and `scrollSelectedIntoView()`
called explicitly from the Arrow Up/Down handlers rather than reactively
on `scrollTop` (to avoid fighting a deliberate manual scroll).

**Retest, large tier (3000 files), confirmed working**: Action Drawer
~13ms (12,544 results), Section History ~7ms (16 results, correctly
aggregated per §37), Search 6-14ms even at 24,000-28,000 results —
consistent with the Search-only numbers from the prior round, now true
for all four modals.

**Cleanup after this retest confirmed everything working:**
- Removed all temporary stress-test instrumentation: the
  `append_perf_log` Tauri command, `appendPerfLog` in `tauriApi.ts`, and
  every `performance.now()`/`logPerf` call and the `PERF_LOG_PATH`
  constant in `controller.ts`. None of it ships.
- `config.json`'s `notesDir` restored to the real notes folder.
- Per the user's decision: the three OneDrive-hosted tiers
  (`ChronoNote-StressTest-Data/tier-{small,medium,large}`) were deleted;
  `ChronoNote-StressTest-NoOneDrive/tier-large` was kept for possible
  future stress testing. Neither location was ever inside the repo or the
  real notes folder.

---

## 39. Settings: show recent notes folders to switch to directly

**Status: implemented and confirmed.** Requested behavior: under
Settings' "Notes Location" section, show up to 5 recently-used notes
folders (other than the current one) as clickable entries — picking one
switches there directly, without opening the native folder-browse dialog.

Both open questions confirmed as proposed (full path display, silently
omit missing folders). Verified by seeding `config.json` with two test
entries — one real, one pointing at a nonexistent path — and confirming
only the real one appeared in Settings and correctly switched when
clicked. Also incidentally confirmed the recency-tracking logic itself:
after switching to the test folder and back, `recentNotesDirs` correctly
became `[<test folder>, <fake nonexistent path>]` — exactly the result
of removing/reinserting on both switches, matching the design below.

Implementation:
- **Storage**: a new `#[serde(default)] recent_notes_dirs: Vec<String>`
  field on `AppConfig` (`storage.rs`), living in the same global
  `config.json` as `notes_dir`/`color_mode` — this is inherently a
  cross-folder concern (a list of *other* folders), so unlike §34's
  per-folder tab session, it can't sensibly live inside any one notes
  folder.
- **When it's updated**: `set_notes_dir` (Rust) records the folder being
  switched *away from* — before overwriting `notes_dir`, it removes the
  new target path from `recent_notes_dirs` (if present — it's about to
  become current, so it shouldn't also appear in "other folders"), then
  inserts the *old* `notes_dir` at the front (deduped against any
  existing entry), capped at 5. This naturally builds a most-recent-first
  list of distinct folders you've actually used, and only through the
  app's own switch flow — editing `config.json` by hand (as this stress
  testing session did repeatedly) doesn't add spurious entries, since
  that bypasses `set_notes_dir` entirely.
- **UI**: `SettingsModal.svelte` gets a small list below the existing
  "Browse…" row, populated from `recentNotesDirs` (excluding whatever is
  currently active, so it only ever shows folders you'd actually switch
  *to*). Clicking an entry goes through the same safety flow as Browse —
  the existing unsaved-scratchpad check before a full workspace reset
  (§8) — via a new `switchToRecentDirectory(path)`, factored to share
  that check with `pickAndSwitchNotesDirectory()` rather than duplicating
  it.

Confirmed defaults, both accepted as proposed:
1. **Full path displayed**, not just the folder name — two recent folders
   could share the same last segment (e.g. "Notes" in different parent
   locations), and Settings already shows the *current* folder's full
   path in this same section, so showing recents any less precisely would
   be inconsistent.
2. **A folder that no longer exists on disk is silently omitted** from
   the list (consistent with how §34 already silently skips missing
   files) — checked at display time (`api.pathExists`, a new `path_exists`
   Tauri command) rather than stored as a flag, so a folder that
   reappears later (e.g. a drive remounted) isn't permanently lost from
   the list.

---

# Feedback from a real-life test run (§40-§54)

Logged in one batch per the user's explicit request ("keep track of each of
the feedback items for implementation") — **none of these are implemented
yet**. Each is its own section below so it can be confirmed and built
independently. Several reference exact current code so the proposed
change is unambiguous; several also carry genuine open questions that need
an answer before implementation, not just an assumption.

## 40. New token: `x ` — an action that won't be done

**Status: implemented.** Actions marked `x` (done and
*not* going to happen — distinct from `v `, which means it *was* done)
render as a "☒" glyph (ballot-box-with-X), the same family as `☐`/`☑`.

Confirmed:
- `x` joins the `Ctrl+Space` cycle in `EditorPane.svelte`'s `cycleLine()`
  (currently `# → v → > → #`). Proposed order: `# → v → > → x → #` (added
  at the end, before wrapping) — not explicitly specified, so flagging
  the exact position as my default rather than silently assuming it's
  uncontroversial; easy to reorder if a different position is wanted.
- `x` folds into the existing **Closed** bucket in `countActions()`
  (`tokens.ts`) and the status bar — no new fourth bucket. `countActions()`'s
  `closedMatches` regex becomes `/^[vx]\s/gm` (matching either token).
- Per §44, `isActionLine()` continues to exclude resolved states the same
  way `v ` already is excluded — `x` is resolved (just resolved as "won't
  do" rather than "done"), so it's excluded from the Action Drawer/
  snapshot building on the same basis.

Mechanical implementation (unchanged from the original draft):
- `glyphs.ts`: add `(^x\s)` to both `renderMatcher` and `atomicMatcher`'s
  regexes, rendering `Decoration.replace` with a new
  `InlineGlyphWidget("☒", "glyph-cancelled")`.
- `app.css`: a new `--glyph-cancelled-*` token family, following the same
  light/dark + color/grayscale pattern as `--glyph-open-*` etc.

---

## 41. An action-state symbol can follow a Delegate (`=> `) token

**Status: implemented.** Confirmed: there are exactly
three variants of a `=> `-prefixed line — no fourth combined form:
1. `=> text` — plain follow-up/consequence, no assignee, no action-state.
   Unchanged from today.
2. `=> @name text` — delegated to a person, no action-state of its own.
   Unchanged from today.
3. `=> <symbol> text`, where `<symbol>` is any of `# `/`v `/`> `/`x ` —
   **not** delegated to anyone; instead, this marks `text` as an action
   that is a *consequence* of the line before it (or of text earlier in
   the same line, before the `=>`) — e.g. a decision recorded above
   naturally produces this follow-up action, and that action can itself
   be open, done, deferred, or won't-do, exactly like a standalone action
   line. Confirmed explicitly: `=> @name <symbol> text` (assignee **and**
   action-state together) is **not** a thing — a line is either
   delegated-to-a-person (variant 2) or a consequence-action (variant 3),
   never both.

Design:
- **Rendering** (`glyphs.ts`): `=> ` replaces to the ➔ glyph (unchanged,
  3 chars) immediately followed by a second replacement for the inner
  action symbol (☐/☑/»/☒, 2 chars) — the same two-glyphs-in-a-row shape
  `=> @name`'s ➔-then-badge already has, just with a second *replaced*
  widget instead of a marked/editable span. Everything after the inner
  symbol is real, plain, editable text — "only the text after the action
  symbol is part of the action," per the original request.
- **Counting/matching**: `isActionLine()` (`controller.ts`) and
  `countActions()` (`tokens.ts`) need a variant-3 case — `=> #` counts
  toward Open the same as a bare `# ` line would, `=> v`/`=> x` toward
  Closed (per §40's fold-in), and `=> >` toward Forwarded — consistent
  with §44's "only open" toggle needing to recognize a `=> #` line as
  open too, not just a bare `# ` line.
- **`Ctrl+Space` cycle**: on a `=> # text` line, cycles the inner symbol
  in place (`# → v → > → x → #`, same order as §40), leaving the `=> `
  prefix untouched — mirrors how the cycle already only ever rewrites the
  first two characters of a plain action line today.

---

## 42. Action Drawer and History Drawer should open focused on the active tab's entry

**Status: implemented.** Currently, both
`ActionDrawerModal.svelte` and `HistoryModal.svelte` always start with
`selectedIndex = 0` — the top of the list (most-recent-first, per §27) —
regardless of which tab was active when the drawer opened. Requested:
open with the selection (and, given both are now virtualized per §38,
the scroll position) landed on whatever entry corresponds to the
currently *active* tab's date/file.

Proposed: on mount, look up `get(activeTabId)`'s tab, find the first
entry in `flatList` whose `filename` (Action Drawer) or `date` (History)
matches that tab's filename/date, and set `selectedIndex` to it (falling
back to `0` if the active tab has no entries in the list — e.g. it has no
open actions, or no history for the current section). Then call the
existing `scrollSelectedIntoView()` so it's actually visible, not just
selected off-screen.

---

## 43. Date drawer: toggle to show only dates with open actions

**Status: implemented.** `DatePickerModal.svelte`
already computes `openCount` per candidate (via `countActions(...).open`)
and displays it, but always lists every existing file matching the typed
query. A toggle (matching the "Open Tabs"/"All Files" toggle style
already used in Search/Action Drawer) filters the list down to
`candidates.filter(c => c.openCount > 0)`.

Confirmed: the "Direct match" entry (the literal typed date, the `parsed`
branch in `buildCandidates()`) stays pinned at the top regardless of the
toggle — it represents "jump here" intent, not a browse result, so it's
unaffected either way.

---

## 44. Action Drawer: toggle between existing behavior and "only open"

**Status: implemented.** Changed from the original
ask (permanently narrowing the drawer) to a *toggle*: a new control,
alongside the existing "Open Tabs"/"All Files" scope toggle, switching
between today's behavior (shows `# `, `> `, and `=> @` lines — open,
deferred, and delegated) and an "only open" mode showing strictly `# `
lines (and, per §41, a `=> #` consequence-action, if §41's "stand-in for
all four" reading is confirmed — an open consequence-action is still an
open action). Neither mode shows `x`/`v`-resolved lines, consistent with
§40.

Implementation: `ActionDrawerModal.svelte` gets a second local toggle
state (e.g. `showOnlyOpen: boolean`), filtering `filtered` (or `liveSnapshot`,
before grouping) down to lines whose innermost action symbol is `#` when
active — a small helper shared with §41/§45's token-parsing work, not a
one-off regex, since "what's the innermost action symbol on this line"
is now a concept needed in at least three places (this toggle,
`glyphFor()`, and the display-stripping from §45).

---

## 45. Action Drawer should show only the glyph, not the raw character

**Status: implemented.** Confirmed as a real
display bug by reading the template: `ActionDrawerModal.svelte` renders
`glyphFor(item.line)`'s icon **and then separately renders `item.line`
verbatim** —

```svelte
<span style={g.style}>{g.char}</span>
<span class={...}>{item.line}</span>
```

`item.line` is the raw line text, e.g. `"# Buy milk"` — so the drawer
currently shows `☐ # Buy milk`, with the raw `# ` token still visible
right next to the glyph that already represents it. (The main editor
doesn't have this problem — `glyphs.ts` *replaces* the token in-place in
the actual CodeMirror document view, whereas the Action Drawer just prints
the stored string as plain text.)

Fix: strip the leading token before display — a small helper (e.g.
`stripLeadingToken(line): string`, likely worth putting in `tokens.ts`
since History (`HistoryModal.svelte`, same `{g.char}` + raw-line pattern)
has the identical issue and should get the identical fix) that removes a
leading `# `, `v `, `> `, `x ` (§40), or `=> ` / `=> @name ` (§41) before
the text is rendered — the glyph alone conveys the token; the text should
start at the actual content.

---

## 46. Editor text size

**Status: implemented.** Confirmed: `.cm-editor`'s
`font-size: 14px !important;` (`app.css`) becomes `11px`. (Factual note
for the record: the actual prior value was 14px, not the assumed 12px —
confirmed as still wanting 11px against that corrected starting point.)

---

## 47. Render the Setext underline as an actual line, not literal `=` characters

**Status: attempted, reverted — logged for a future attempt.** Section
headers use a Setext-style underline (a title line followed by a `====`
line — spec 2.1/`isSetextUnderline()` in `tokens.ts`). Today this isn't
glyph-rendered at all; the raw `=` characters show as literal text in the
editor. Requested: replace the visual presentation of that underline row
with an actual drawn horizontal line, the same *length* as the title text
above it, without changing the line's height, character-editable when the
cursor is on the line (also confirmed: hovering it should reveal edit
mode too), and rendered as the drawn line otherwise.

**What was built, and why it was reverted:** a `glyphs.ts` decoration
replacing the `====` line with a `Decoration.replace` widget (a `<span>`
sized via `ch`-units to the title's character count), gated on both
cursor position (`state.selection`) and mouse hover (tracked via a
`StateField`/`StateEffect` pair updated from `EditorView.domEventHandlers`'
`mousemove`, since `posAtCoords` works whether the line is currently
rendered as the widget or as plain text — a `mouseenter`/`mouseleave` pair
on the widget's own element doesn't, because the element is removed from
the DOM the moment hover reveals the plain text underneath it). This
compiled and ran, but two rounds of visual feedback found it genuinely
broken:
1. **Vertical alignment never landed correctly.** First attempt used
   `height: 1em; vertical-align: text-bottom;` on an empty `inline-block`
   span with a `border-bottom` — too low, "near the top of the characters
   of the line below." Second attempt removed the explicit height/
   vertical-align and gave the span real (invisible) text content (a
   space) so its own line-box metrics would anchor the border — this made
   it *lower still*, the opposite of the intended correction. Both
   attempts were guesses at how `.cm-line`'s `line-height: 1.6` interacts
   with an `inline-block` widget's content-box vs. the actual text
   baseline, made without the ability to see the running app directly —
   correcting this by further guessing was assessed as more likely to
   waste rounds than to converge, especially after the second guess moved
   the wrong direction.
2. **Hover/click-to-edit only worked once**, then stopped reliably
   revealing edit mode on subsequent attempts — root cause not
   isolated before the decision to revert (leading candidate: CodeMirror's
   coordinate-to-position mapping, `posAtCoords`, may not resolve
   correctly for on-screen positions that fall *within* a custom replaced
   widget's own rendered DOM, as opposed to ordinary text — the widget is
   an opaque foreign element from CodeMirror's layout model's perspective
   for hit-testing purposes, unlike a `Decoration.mark` over real
   characters, which stays part of the normal text flow).

**Direction worth trying next time, not attempted here:** using
`Decoration.mark` (color: transparent + `text-decoration`/`border-bottom`)
over the *actual* `=` characters already in the document, instead of a
synthetic `Decoration.replace` widget with invented content. Marking real
text keeps it in CodeMirror's normal layout/hit-testing model — hover and
click-to-position should work natively, with no custom
`domEventHandlers`/`posAtCoords` plumbing needed — and a `text-decoration`
applied to real text is positioned by the browser's own font-metric
baseline calculation, not by guessing at box-model interactions with line-
height. The open problem that approach doesn't solve on its own: the
underline's rendered length would then track however many `=` characters
already exist in the file, not automatically conform to the title's
length above it — squaring that with "same length as the title" (without
silently auto-editing the file's actual `=` count, which would cross this
app's zero-database/no-silent-edits principle) is exactly the design
question to resolve before trying again.

Code changes from this attempt (the `glyphs.ts` decoration/StateField/
domEventHandlers, its `EditorPane.svelte` registration, and its
`.glyph-section-underline` CSS) have all been reverted — nothing from
this section shipped.

---

## 48. Top bar should scroll to follow the selected tab

**Status: implemented.** Confirmed by reading
`TopBar.svelte`: there's no `scrollIntoView`-equivalent logic anywhere —
`updateScrollState()` only tracks whether the arrows should show, and
nothing reacts to `activeTabId` changing. Switching tabs via `Ctrl+Tab`/
`Ctrl+Shift+Tab` (or via the Date picker, Search, etc.) can move the
active tab off-screen with no indication other than the highlight simply
not being visible.

Fix: a reactive block watching `$activeTabId` that finds the active tab's
DOM element within `#tab-bar` and scrolls it into view if it isn't
already (mirroring the pattern already established in Search/Action
Drawer/History's `scrollSelectedIntoView()` from §38, though tab widths
aren't fixed here the way virtualized list rows are, so this would use the
tab element's own `getBoundingClientRect()`/`offsetLeft` rather than a
precomputed offset table).

---

## 49. Copy/paste deferral should apply to today *or any later date*, not just today

**Status: implemented.** Confirmed by reading
`handlePasteIntoTab()` (`controller.ts`): the guard is
`targetTab.filename !== todayFilename` — pasting a copied `# ` line into
any tab other than *exactly* today's marks the original as deferred only
if the target is today. Requested: this should also apply when pasting
into a tab dated *after* today (forwarding a task to next week, say,
should count the same as forwarding it to today).

Fix is small and low-risk: since filenames are `YYYY-MM-DD.txt` and ISO
dates sort correctly as plain strings, the condition becomes
`targetTab.filename < todayFilename` (reject only *past* dates) instead
of `!== todayFilename` (reject everything except today). No open
questions — pasting into a past-dated tab presumably still shouldn't
count as deferral, since that's not "forwarding," it's backdating.

---

## 50. Actions can be indented by two spaces, like bullets

**Status: implemented.** Clarified: this is specifically
a bug-fix request, not a nesting/outline feature — confirmed there's no
"belongs to the bullet above it" semantic intended. Today, an indented
action line (e.g. `"  # Buy milk"`) is invisible to the app entirely: no
glyph renders, and it doesn't count anywhere, because `# `/`v `/`> `/`=> `
are matched anchored to the true start of the line (`^#\s` etc., both in
`glyphs.ts`'s regexes and `countActions()`/`isActionLine()`) — unlike
`- ` bullets, which already tolerate arbitrary leading indentation via a
lookbehind (`(?<=^\s*)-\s`). Wanted: an indented action should be
recognized as an action (rendered, counted, shown in the drawer) exactly
like an unindented one, with its glyph appearing at the correct visual
indentation — i.e. bring actions to parity with how bullets already
handle indentation, nothing more.

Implementation: change `^#\s`-style anchors to `(?<=^\s*)#\s` throughout
`glyphs.ts` (mirroring the bullet lookbehind exactly, both matchers) and
update `countActions()`/`isActionLine()` to `^\s*#\s`-equivalent patterns
(same idea, different regex flavor since those aren't lookbehind-based
today). Same treatment applies to `v `/`> `/`x ` (§40) — all four action
symbols should tolerate leading indentation consistently.

---

## 51. Bulleted lists: `*` as an alternative to `-`

**Status: implemented.** Small, well-scoped:
`glyphs.ts`'s bullet lookbehind pattern `(?<=^\s*)-\s` (in both
`renderMatcher` and `atomicMatcher`) becomes `(?<=^\s*)[-*]\s`, so either
character triggers the same `•` glyph. No open questions — this is
additive and doesn't change how `-` already behaves.

---

## 52. Top bar overflow: keep scroll arrows visible and make them wrap

**Status: implemented — this reverses a documented design decision from
§26, flagging explicitly rather than treating it as a bug fix.** §26's original design: `canScrollLeft`/
`canScrollRight` (`TopBar.svelte`) are computed from actual scroll
position, so an arrow disappears once there's nothing left to scroll in
that direction (e.g. the left arrow vanishes once you're scrolled all the
way left). Requested: once the tab bar is overflowing at all, show
**both** arrows permanently, and clicking one at an edge **wraps around**
to the other end — the same cyclic behavior `Ctrl+Tab`/`Ctrl+Shift+Tab`
already has for switching tabs (`cycleTab()` in `controller.ts`), just
applied to scroll position instead of selection.

Proposed: once `tabBarEl.scrollWidth > tabBarEl.clientWidth` (i.e.
overflowing at all — computed once in `settleLayout()`, not per-scroll),
show both arrows unconditionally rather than deriving them from
`scrollLeft`. `scrollTabBar(direction)` then checks whether the requested
scroll would go past an edge and, if so, jumps to the opposite edge
(`scrollLeft = 0` or `scrollLeft = scrollWidth - clientWidth`) instead of
the current unconditional `scrollBy`.

---

## 53. Top bar overflow: always show the New Scratchpad button

**Status: implemented.** Confirmed by reading
`TopBar.svelte`: the `+` button (`.tab-bar-new-btn`) is a child of
`#tab-bar` itself — the same scrollable container the tabs live in — so
when tabs overflow and the strip scrolls, the `+` button scrolls along
with them and can end up off-screen. Requested: it should always be
visible regardless of scroll position.

Fix: move the button out of `#tab-bar` in the markup, placing it as a
sibling positioned after the right scroll arrow (before the fixed action
buttons — Date/My Actions/etc.) — structurally the same kind of change as
§26 already made for the scroll arrows themselves, which live outside the
scrollable region for the same reason. This changes its visual position
slightly (currently "directly next to the rightmost tab," per §25/§28 —
moving it outside the scroll region means it's no longer immediately
adjacent to the last tab when the strip *isn't* overflowing). Flagging
since that's a small but real layout change beyond just "fix the overflow
case," not asking to confirm since keeping one consistent position
(always in the same place, scrolling or not) seems clearly better than a
button that jumps between "next to last tab" and "fixed after arrows"
depending on overflow state — but noting it in case that trade-off isn't
obvious from the request alone.

---

## 54. Action Drawer: hovering shows full action text over the header; header capped to 50% width

**Status: implemented.** Confirmed by reading the CSS:
`.item-breadcrumb` (the section-header tag shown after each action's
text, e.g. "· Weekly Sync") has no width constraint at all
(`.modal-item-main` has `overflow:hidden; text-overflow:ellipsis; flex:1`,
but the breadcrumb itself doesn't shrink or truncate) — so a long section
title can crowd or push against the action's own text within the row's
fixed width, since both compete for space in one `justify-content:
space-between` flex row.

Confirmed design:
1. **Cap the header/breadcrumb to 50% of the drawer's width**, with
   ellipsis truncation — `max-width: 50%` plus `overflow: hidden;
   text-overflow: ellipsis` on `.item-breadcrumb`.
2. **On hover, the row reflows** to give the action text the header's
   space — i.e. a `:hover`/JS-driven state where `.item-breadcrumb`
   shrinks or hides (rather than a floating tooltip overlay), letting
   `.modal-item-main`'s content claim the freed width so the full,
   untruncated action text can display. Since virtualized rows are
   absolutely positioned (§38) with a fixed row height, this needs to be
   a pure width/visibility change within the row's existing box — not an
   actual height-changing reflow of the list, which would conflict with
   the fixed-row-height assumption the virtualization's offset math
   depends on.

---

## 55. Bug fix: switching tabs could freeze the whole window

**Status: fixed.** Reported during testing of §48: "when switching tabs
with Ctrl+Tab, when the top bar started to follow the tab and it (almost)
reached the end, the topbar froze. I cannot switch tabs, and cannot press
any buttons anymore, and shortcuts don't work anymore." A second report
found it could also happen right at launch, once session restore's
initial active tab happened to sit in the same position.

**Root cause:** the app runs on Svelte 5. `TopBar.svelte`'s
`settleLayout()` (§52) and `scrollActiveTabIntoView()` (§48) are both
`async` functions invoked from legacy `$:` reactive statements, and both
used Svelte's own `await tick()` internally to wait a render pass. In
Svelte 5, `tick()` resolves through Svelte's own reactive scheduler —
resuming from it *inside* a function a `$:` block kicked off hands
control back into that same scheduler, which can decide the originating
statement is still "active" and re-run it. `scrollActiveTabIntoView` had
no guard against this, so each re-run kicked off a fresh `tick()`-await
cycle, and the resulting `scrollLeft` writes kept flip-flopping between
two values forever — a genuine, effectively-synchronous infinite loop
that pins the whole render thread (confirmed by reproducing it headlessly
outside Tauri, bisecting extensions/handlers/observers one at a time
until the single `await tick()` call was isolated as the trigger).

**Fix:** both functions now wait via a small `nextFrame()` helper
(`requestAnimationFrame`-based) instead of `tick()`. This still yields a
render pass — needed so a newly-created tab's element exists in the DOM
before being measured or scrolled to — but sits entirely outside Svelte's
scheduler, so resuming from it can no longer retrigger the reactive
statement that called it. The `ResizeObserver` in `onMount` was also kept
observing `#top-bar` rather than `#tab-bar` (a change made while
investigating this bug): `settleLayout()` toggles the action-button
labels, scroll arrows, and Promote button, all siblings of `#tab-bar`
inside `#top-bar`, so observing `#tab-bar` itself would mean the
observer's own layout decisions could resize the thing it's watching;
`#top-bar`'s width is driven only by the window, never by its own
children's reflow, so it doesn't have that problem.

---

## 56. Bug fix: top-bar action-button labels flickering rapidly

**Status: fixed.** Reported right after §55's freeze fix landed: "when the
right most tab is selected when the top bar is full of tabs, the labels
of the top right buttons start to appear and disappear in rapid
succession." Same neighborhood as §55 but a different mechanism —
reproduced headlessly with a fully-overflowing tab strip and confirmed,
via bisection, that `settleLayout()` was being re-invoked continuously by
its own `$: {...}` reactive statement even with its `ResizeObserver`
disabled outright, and even though every measurement it took
(`#top-bar`'s width, `#tab-bar`'s `clientWidth`/`scrollWidth`) stayed
byte-for-byte identical across every single call. Narrowed further to one
specific line: writing `isOverflowing = tabBarEl.scrollWidth >
tabBarEl.clientWidth` was the trigger — reassigning `showActionLabels`
the same way did not retrigger anything.

**Root cause:** Svelte invalidates (and schedules a re-render) on *every*
assignment to a reactive variable, never checking whether the new value
actually differs from the old one — Svelte 4 semantics, apparently still
true for legacy `let`s under Svelte 5's compatibility layer. Reassigning
`isOverflowing` to the exact value it already held was still enough to
mark the component dirty and re-render `{#if isOverflowing}` (the
scroll-arrow buttons), and that render pass was, through some channel not
fully traced to ground (plausibly related to the same async/`$:`
interaction behind §55, just via a different path — reassigning
`showActionLabels` even repeatedly never reproduced it, so it isn't
simply "any write inside an async function called from a `$:` block"),
enough on its own to cause the surrounding `$:` statement to run again —
which read the identical measurements, wrote the identical value, and
triggered another pass, forever.

**Fix:** both writes in `settleLayout()` (`showActionLabels` and
`isOverflowing`) are now guarded to only actually assign when the
computed value differs from the current one. Reproduced-and-confirmed
fixed: with the guard in place the same scenario settles in a handful of
calls and then goes fully quiet, instead of climbing indefinitely.

---

## 57. Bug fix: leftmost tab left partially hidden behind the scroll arrow

**Status: fixed.** Reported alongside §56: cycling backward
(`Ctrl+Shift+Tab`) all the way to the leftmost tab left it still partly
covered by the left scroll-arrow button, even though `scrollLeft` had
supposedly been set to bring it fully into view — dragging the tab strip
manually would reveal the rest of it.

**Root cause:** `scrollActiveTabIntoView()` (§48) used `el.offsetLeft` to
find the active tab's position within `#tab-bar`. `offsetLeft` is
relative to the element's nearest *positioned* ancestor (the nearest one
with `position` other than `static`) — not necessarily its scroll
container. Nothing in the tab bar's markup sets `position`, so that
ancestor turned out to be further out than `#tab-bar` itself, and the
reported offset included the left arrow button's own width whenever the
arrows were showing (confirmed directly: the first tab's `offsetLeft` was
`24`, matching the arrow button's width, not `0`). Scrolling to that
inflated value left the tab positioned exactly one arrow-width short of
fully visible.

**Fix:** compute the tab's position relative to `#tab-bar` directly via
`getBoundingClientRect()` differences (`el`'s rect minus `tabBarEl`'s
rect, plus the current `scrollLeft`) instead of `offsetLeft`/`offsetWidth`
— immune to whatever element happens to be the nearest positioned
ancestor. Confirmed fixed: the leftmost tab now sits flush against the
tab bar's own left edge, immediately after the arrow, with nothing
hidden.

---

## 58. `=> <symbol>` glyphs should be separately editable

**Status: implemented.** The Delegate arrow (`➔`) and the action-state
glyph that can follow it (`☐`/`☑`/`»`/`☒`) were visually two distinct
glyphs already, but behaved as one glyph for editing purposes: `Editor
View.atomicRanges` treated the whole 5-character `=> # ` span as a single
atomic unit, so the cursor couldn't land between them, and
selecting/backspacing either one took both. Requested: make them
separately editable.

Fix: `glyphs.ts`'s `atomicMatcher` regex used to match `=> <symbol> ` as
one combined alternative; it now matches `=> ` (the shared alternative
also used for a plain follow-up) and `<symbol> ` as two independent
alternatives, the latter gated by a `(?<==>\s)` lookbehind so it only
fires immediately after a Delegate arrow (never confused with a
standalone action line's own symbol, which is already gated by its own
`(?<=^\s*)` lookbehind). The two resulting atomic ranges are adjacent,
not merged, so the cursor can rest at the boundary between them.
Backspacing the symbol turns "=> # text" into "=> text" — un-marking it
as a consequence-action, the same way deleting `@name` off a delegated
line un-delegates it. Backspacing the arrow instead leaves the bare
"# text" behind. No change to `renderMatcher` was needed — it already
added the arrow and the symbol as two separate `Decoration.replace`
widgets; only the atomic-range bookkeeping was merging them.

---

## 59. Bug fix: `Ctrl+Space` didn't cycle a `=> <symbol>` line unless the arrow opened the line

**Status: fixed.** Reported alongside §58: cycling a consequence-action's
state with `Ctrl+Space` worked when `=> ` was the first thing on the
line, but did nothing when it followed other text — e.g. "Talked to Sam
=> # follow up" wouldn't cycle, while "=> # follow up" on its own would.

**Root cause:** `cycleActionSymbol()` (`tokens.ts`) matched the
consequence-action form with `/^(=>\s)([#vx>])(\s.*)$/` — anchored so the
arrow had to be the very first character of the line. Any line with
so much as a word before the arrow failed this match, fell through to
the plain-action-line pattern (which requires the *symbol* to open the
line), matched nothing there either, and returned `null` — a no-op.

**Fix:** dropped the anchor's assumption that the arrow opens the line —
the pattern is now `/^(.*=>\s)([#vx>])(\s.*)$/`, capturing whatever
precedes the arrow (nothing, or "Talked to Sam ", or anything else) as
part of the preserved prefix instead of requiring it to be empty. Cycling
now works identically regardless of where on the line the `=> <symbol>`
sits.

---

## 60. Bug fix: top-bar label flicker persisted on a specific display (§56 was incomplete, and so was this)

**Status: superseded by §61 — the hysteresis fix below turned out to be
solving the wrong problem, though it's harmless and was left in place.**
Reported the morning after v0.2.1 shipped: still
flickering when maximized, but only on one machine's main display
(1920×1200) and not on its other two (1920×1080) — same width, different
height, so almost certainly a difference in per-monitor Windows display
scaling (DPI) between them rather than raw resolution.

§56 fixed one real cause of this (Svelte re-rendering on every assignment
to a reactive variable even when reassigning the exact same value) but
that fix only helps when `settleLayout()`'s *decision* comes out
identical from one call to the next. It does nothing if the
*measurement* itself is genuinely noisy right at the fits/doesn't-fit
boundary — which is exactly what non-100% display scaling can cause:
`scrollWidth`/`clientWidth` are both whole device pixels under the hood,
and at certain scale factors that rounding can land on either side of
the line from one layout pass to the next with nothing meaningfully
different about the actual content. Confirmed the mechanism (not
reproducible directly without matching hardware, but verified in
isolation): simulating that exact pattern — a boundary value jittering by
1-3px across calls — against the old algorithm reproduced continuous
flip-flopping on nearly every call, while the same simulation against the
new one below never flipped once.

**Fix:** rewrote `settleLayout()`'s decision to (a) start from the
*current* `showActionLabels` state each time instead of always resetting
to "try labels on" from scratch, and (b) require clearing an 8px margin —
not just barely crossing the exact fits/doesn't-fit line — before
flipping either direction. A measurement wobbling by a pixel or two can
no longer flip the decision on its own; only a real, clearly-more-than-
noise change in available width can. `isOverflowing` keeps its exact
(no-margin) comparison, since scroll-arrow correctness has no comparable
noise-tolerance need and no reason to lag the true state.

Left in place (see §61) since it's harmless and a reasonable defensive
measure, but it did not fix the report it was written for — the user
retested and confirmed the flicker was unchanged.

---

## 61. Bug fix: top-bar label flicker, the actual root cause

**Status: fixed** (superseding §60's diagnosis). With §60's fix confirmed
not to help, and temporary diagnostic logging added to `settleLayout()`,
the user captured real console output from the affected display via the
dev build's DevTools — and it immediately reframed the whole problem:

```
[dbg] settle 1159 end {labels: false, overflowing: true, sw: 1781, cw: 1607}
[dbg] settle 1160 start {labels: false, sw: 1781, cw: 1607, dpr: 1}
[dbg] settle 1160 after-try-on {sw: 1781, cw: 1185}
[dbg] settle 1160 end {labels: false, overflowing: true, sw: 1781, cw: 1607}
[dbg] settle 1161 start {labels: false, sw: 1781, cw: 1607, dpr: 1}
...
```

`settleLayout()` had been called **1160+ times**, every single one
computing the *exact same* correct decision (`labels: false`,
`overflowing: true`) from *identical* measurements (`sw`/`cw` never
varied). §60's entire premise — a measurement wobbling near the
fits/doesn't-fit boundary — was wrong: there was no boundary wobble here
at all, just a runaway call count. The visible "flicker" was each pass
still optimistically flashing labels on for one frame (`showActionLabels
= true`, wait a frame, measure, revert) before reverting — a real,
correct part of the algorithm, just repeated far more often than it
should ever run.

**Root cause:** `settleLayout()` and `scrollActiveTabIntoView()` are
`async` and `await` a video frame partway through (via `nextFrame()`, a
`requestAnimationFrame` wrapper — §55 already moved them off Svelte's own
`tick()` to fix an earlier, harder freeze caused by exactly this class of
problem). §55's fix reduced *how often* a write in the resumed
continuation could retrigger the very `$:` reactive statement that made
the original call — bounding it to once per rendered frame instead of
potentially many times per Svelte flush — but it turns out that wasn't
enough to eliminate the retrigger, only slow it down. On a display that's
continuously compositing at 60Hz+ (unlike the throttled/backgrounded test
environments used to verify §55 and §60), "at most once per frame" is
still unbounded over time — which is exactly what a call count in the
thousands looks like.

**Fix:** both `$:` blocks now invoke their function via
`queueMicrotask(...)` instead of calling it directly:

```ts
$: {
  void $chromeExpanded;
  void displayTabs;
  if (tabBarEl) queueMicrotask(settleLayout);
}
```

Queuing the call defers even its first synchronous statement to a later
microtask, run only after Svelte has fully finished flushing the current
reactive statement. Nothing inside the queued function — not its
synchronous prefix, not anything after an internal `await` — can then be
attributed back to the `$:` block that scheduled it, because by the time
any of it runs, that block's own execution is long over. Verified by
forcing continuous repainting for several seconds under a live, moving
resize (not just a single static layout) and confirming the call count
stayed at the number of genuine triggers instead of climbing.

This did not hold up either — see §62.

---

## 62. Bug fix: top-bar label flicker, attempt four

**Status: fixed** (pending the user's confirmation on the display that
reproduces it — every prior attempt looked fixed here first). Reported
again after §61 shipped, with a new detail: it now also happened on
*middle* tabs, not just tabs near either end of the strip, pointing at
`scrollActiveTabIntoView` (which scrolls the tab strip to follow the
active tab) as at least as implicated as `settleLayout`.

Every attempt through §55/§56/§60/§61 treated a symptom where it was
last observed — first `tick()` specifically, then any reactive write,
then calling the function directly from a `$:` block at all — without
removing the actual channel: `settleLayout` and `scrollActiveTabIntoView`
are both `async`, both `await` a frame partway through, and both were
being *invoked from* `$:` reactive statements. Svelte 5's fine-grained,
signal-based reactivity (unlike Svelte 4's static, compile-time
dependency analysis) tracks a `$:` block's dependencies by what it
actually touches while running — §61's `queueMicrotask` was meant to put
the call fully outside that tracking window, and evidently still didn't,
for reasons not confirmed against Svelte's source, only inferred from
every fix so far moving where the retrigger showed up rather than ending
it.

**Fix:** stopped using `$:` blocks to invoke these two functions at all.
`onMount` now sets up plain store subscriptions instead —
`tabs.subscribe`, `chromeExpanded.subscribe`, and `activeTabId.subscribe`
call `settleLayout`/`scrollActiveTabIntoView` directly:

```ts
const unsubTabs = tabs.subscribe(() => settleLayout());
const unsubChrome = chromeExpanded.subscribe(() => settleLayout());
const unsubActive = activeTabId.subscribe(() => scrollActiveTabIntoView());
```

Store subscriptions are Svelte 3/4's older, plain callback-based pub/sub
— entirely separate machinery from the signals-based `$:` tracking that
every previous fix was fighting. A write inside a subscription callback,
or inside something it awaits, has no reactive statement left to ever be
misattributed back to, because there is no reactive statement involved at
all. This removes the channel rather than narrowing it further.

---

## 63. Remember each tab's cursor and scroll position across switches

**Status: implemented.** Every tab switch fully remounts the editor (the
`{#key activeTab.id}` block in App.svelte, there so typing doesn't reset
the undo history or cursor on every keystroke — see §34-era notes),
which as a side effect always dropped the cursor back to (1, 1) with no
scroll, even mid-thought in a long note. Requested: remember where the
caret was and how the viewport looked when leaving a tab, and restore
both when coming back to it.

Fix: `EditorPane.svelte` now takes a `tabId` prop and, on `onDestroy`,
saves the view's current selection (`view.state.selection.toJSON()`) and
a scroll snapshot (`view.scrollSnapshot()`) into a new in-memory,
tab-id-keyed map (`saveEditorViewState`/`getEditorViewState` in
controller.ts — not persisted to disk or restored across app restarts,
since this is about switching tabs within a running session, not the
separate, existing session-restore mechanism). On the next mount for that
same tab, both are passed into the initial `EditorState`/`EditorView`
config (`selection`/`scrollTo`) rather than applied via a `dispatch()`
afterward — CodeMirror's own initial layout pass was observed fighting a
post-construction scroll assignment (and, once a plain `view.focus()`'s
native scroll-into-view behavior got involved too, sending it to the
*bottom* instead) and winning regardless of ordering; setting both up
front leaves nothing for anything else to override.

A few implementation notes worth having found the hard way:
- `view.scrollSnapshot()` is captured continuously (on every `scroll`
  event), not once at destroy time — by the time `onDestroy` actually
  runs, the scroller's raw `scrollTop`/`scrollLeft` had already been
  observed reporting 0 regardless of where it visually was right
  beforehand (something about the `{#key}` teardown order; not fully
  explained, just reliably worked around).
- `scrollSnapshot()` anchors to a specific line/block rather than a raw
  pixel offset, so the restored scroll stays correct even if line heights
  shift slightly between saving and restoring — a better fit here than
  storing `scrollTop` directly.
- Restoring a saved selection clamps both ends to the current document's
  length first, in case content changed while the tab was inactive (e.g.
  §49's paste-forward marking a `#` line as `>` elsewhere) and a saved
  position no longer exists.
- `EditorView.updateListener` only fires on a `dispatch()`, never for the
  state a view is constructed with — since the initial selection is now
  set that way, the status bar's line/column is set explicitly from
  `view.state.selection` right after construction instead of assuming
  (1, 1).
- Entries are cleared from the map when a tab actually closes (in
  `closeTab()`) or all tabs are torn down at once (switching notes
  folders), so they can't accumulate for tabs that no longer exist.

---

## 64. Bug fix: copy/paste deferral only marked the first line of a multi-line copy

**Status: fixed.** The copy/paste deferral feature (marks a copied `# `
line as `> ` back in its source when pasted into today's note or later —
spec 2.2) only ever recognized and rewrote the *first* line of what was
copied. Copying several lines together — a few open actions at once, or
one buried after some plain text — left every line but the first
untouched in the source, even though all of them got pasted into the
target as-is. Requested: mark every copied open action as deferred, not
just the one on the first line.

**Root cause:** `recordCopiedAction()` gated on `text.startsWith("# ")` —
true only when the *entire* copied selection began with an unindented
open-action token — and `handlePasteIntoTab()` rewrote the source by
slicing off exactly the first two characters of the whole copied block
and prepending `"> "` once, regardless of how many lines or other open
actions it contained.

**Fix:** `recordCopiedAction()` now checks for an open-action line
*anywhere* in the copied text (`/^(\s*)#(\s)/m`, indentation-tolerant per
§50) rather than requiring the whole selection to start with one, and
`handlePasteIntoTab()` rewrites every matching line within the copied
block (`.replace(..., "gm")`) instead of just the block's own start.
Lines that aren't open actions — plain text, bullets, already-resolved
actions — are left untouched wherever they fall in the copied block. The
toast now reads "N original tasks... marked deferred" when more than one
line was affected, instead of always describing a single task.

---

## 65. Bug fix: top-bar labels stopped appearing at all after §62

**Status: fixed.** §62's store-subscription rewrite (confirmed to fix the
flicker) came with a real regression: reported right after, the
action-button labels never showed again, even after closing tabs down to
just one with far more room than needed. Two independent bugs, found
together while reproducing it directly:

1. **A burst of rapid `tabs` updates could leave a stale decision in
   place.** `settleLayout()`'s reentrancy guard (`settling`) simply
   dropped a call that arrived while a previous one was still awaiting a
   frame, rather than asking it to re-check afterward — closing several
   tabs in quick succession could mean only an early, still-overflowing
   state ever actually got evaluated, with nothing left to prompt a
   re-check once the rest had closed too. Fixed by setting a
   `settlePending` flag instead of dropping the call, and having the
   in-flight run loop once more on the fresh state before releasing the
   guard.

2. **The actual root cause, and why fix #1 alone didn't help:**
   `settleLayout()`'s "was icon-only, does it now fit with labels?" check
   compared `tabBarEl.scrollWidth` against `clientWidth - FIT_MARGIN`.
   `scrollWidth` is specified to never report less than `clientWidth` —
   an element with room to spare reports them as *equal*, not the
   content's actual (smaller) width — so once content fit at all,
   `scrollWidth > clientWidth - FIT_MARGIN` reduced to `clientWidth >
   clientWidth - 8`, which is unconditionally true regardless of how much
   spare room actually existed. Labels got tried on, immediately measured
   as "not enough room" no matter what, and reverted — every single time.
   `scrollWidth`/`clientWidth` can answer "is it overflowing, and by how
   much" correctly (used for the other two checks in this function,
   unaffected by this), just not "how much spare room is there," which
   isn't answerable from them at all once content fits.

**Fix:** added `tabsContentWidth()`, which sums the tab elements' own
`offsetWidth`s directly instead of relying on the container's
`scrollWidth` — a measurement that actually shrinks when there's less
content, however comfortably it fits — and used it only for that one
check. Verified both fixes together: closing tabs one at a time in rapid
succession down to a single tab, and closing straight down to one tab in
a single update, both correctly bring the labels back.

---

## 66. Status bar always grayscale, regardless of the color/grayscale toggle

**Status: implemented.** `--status-bg`/`--status-fg` were themed by
Settings' color/grayscale toggle the same as everything else (blue in
color mode) — requested: keep the status bar neutral always, independent
of that setting.

Fix: removed the two `[data-color-mode="color"]` overrides for
`--status-bg` (dark and light-media-query variants), so it always
resolved to its base `:root` value regardless of the toggle — the same
pattern `--editor-selection-bg` already used for the same reason (a
backdrop that needs to stay neutral under everything, not a themed
accent).

Follow-up, same session: asked to go a step further and use the *same*
background as the top bar rather than its own neutral shade. `#status-bar`
now uses `--tab-bg` directly instead of a separate `--status-bg` token,
which has been removed entirely (`--status-fg` remains, still contrasts
correctly against `--tab-bg` in both light and dark). The status bar
renders nothing else color-mode-dependent, so this is the whole change.

---

## 67. Action Drawer: remember the "Only Open" toggle across opens

**Status: implemented.** The "Only Open" toggle (§44) reset to its
default every time the drawer was reopened, rather than staying as the
user left it. Requested: remember it for the rest of the session, and
default to on at launch.

Fix: moved the toggle's state from a local `let` in
`ActionDrawerModal.svelte` to `actionDrawerShowOnlyOpen`, a new writable
store in controller.ts (`writable<boolean>(true)` — same in-memory-only,
not-persisted-to-disk treatment as `chromeExpanded`/the §63 editor-view-
state map, and the same reason: this is session-lived UI state, not note
content). The checkbox binds directly to the store
(`bind:checked={$actionDrawerShowOnlyOpen}`), and the filter logic itself
is unchanged — only where the boolean lives moved, not how it's used.

---

## 68. Date picker: remember the "Open Only" toggle across opens

**Status: implemented.** Same request as §67, extended to the Date
picker's own "Open Only" toggle (§43) — requested to default to *off*
here, unlike the Action Drawer's "Only Open" (on).

Fix: identical pattern to §67 — moved from a local `let openOnly` in
`DatePickerModal.svelte` to `datePickerOpenOnly`, a new writable store in
controller.ts (`writable<boolean>(false)`), bound directly
(`bind:checked={$datePickerOpenOnly}`).

---

## 69. Action Drawer: show `v`/`x` lines too when "Only Open" is off

**Status: implemented.** The drawer's snapshot-building (`isActionLine()`
in controller.ts) excluded resolved states (`v `/`x `, standalone or via
`=> `) outright, regardless of the "Only Open" toggle — so turning the
toggle off only ever revealed deferred/delegated lines, never done or
won't-do ones. Requested: with the toggle off, show `v`/`x` lines too;
with it on, keep showing only `#`.

Fix: `isActionLine()` now includes all four action states in what the
drawer's snapshot considers a candidate line at all
(`/^\s*[#>vx]\s/.test(line) || ... || /=>\s[#>vx]\s/.test(line)`) —
previously only `#`/`>` and their `=> ` forms qualified. No other change
was needed: the drawer's existing filter (`$actionDrawerShowOnlyOpen &&
innermostActionSymbol(item.line) !== "#"`) already narrows correctly to
`#`-only when the toggle is on, and the glyph/`item-completed` styling
for `v`/`x` rows was already in place from §45 — it just never had
anything to render before now.

---

## 70. Bug fix: History Drawer showed raw token characters for mid-line consequence-actions

**Status: fixed.** Reported as a scrolling-position-dependent glitch
("the top part shows correctly, but lower is not") — turned out to be
content-dependent instead, and coincidentally correlated with scroll
position only because the affected lines happened to sit lower in the
test data. The actual trigger: a `=> <symbol>` consequence-action that
follows other text on the line (e.g. "Talked to Sam => # follow up" —
exactly what §41 designed the form for) rather than opening it.

**Root cause, two bugs stacked:**
1. `openMeetingHistory()`'s inclusion check used `line.startsWith("=> ")`
   — true only when the arrow is the line's first two characters. A
   mid-line `=> ` was invisible to Section History entirely, on top of
   whatever else was wrong.
2. `stripLeadingToken()` (tokens.ts) had the same anchoring assumption
   across all three of its `=> `-based branches (`^=>\s...`) — a line
   that got included by some other path with `=> ` mid-line would fall
   through every branch unmodified, showing its raw `=> #`/`=> v` token
   text right next to the row's glyph instead of being stripped.

Both are the same class of bug §59 already fixed once for
`cycleActionSymbol()` — `=> ` support was added for the mid-line case in
that one place without being carried to every other function that also
assumes `=> ` opens the line.

**Fix:** `openMeetingHistory()`'s check is now `line.includes("=> ")`
(and its dedup-key normalization strips a mid-line `=> ` separately from
an anchored plain leading symbol, so two occurrences of the same action
with different leading context still dedupe as one). `stripLeadingToken()`'s
three `=> `-based patterns now capture and preserve whatever precedes the
arrow instead of requiring it to be empty, mirroring §59's fix to
`cycleActionSymbol()`. Verified with a 25-file synthetic history
containing a mid-line consequence-action on every date: entries now
appear (250 vs. 225 before) and render with clean, glyph-only text at
both the top and bottom of the scrolled list.

---

## 71. About drawer, Symbols & Sections legend, and a real focus fix for both non-input drawers

**Status: implemented.** Three requests bundled together: an About
drawer (project link + running version), a new drawer documenting every
token → glyph mapping and how section headers are formatted, and fixing
Keyboard Shortcuts (and, by the same reasoning, this new drawer too) so
that opening it actually moves keyboard focus into it — previously
neither drawer had any focus management at all, so arrow keys (and
everything else) kept reaching the background editor instead of
scrolling the drawer's own list.

**About drawer:** `AboutModal.svelte`, opened via a new "ℹ" icon button
placed to the right of the Settings gear in `TopBar.svelte` (no keyboard
shortcut — it's a simple info panel, not something reached for
mid-editing the way the other drawers are). Shows the project's GitHub
link (`controller.PROJECT_URL`, opened via `controller.openProjectLink()`
in the OS's default browser, not the app's own webview — see "opening
links" below) and the currently-running version number, read live from
`appVersion` (a new controller.ts store, populated once at `initApp()`
via `api.getAppVersion()`) rather than hardcoded anywhere in the
frontend, so it can't drift from `tauri.conf.json`/`package.json` at
release time.

**Opening links:** the app had no way to open a URL outside its own
webview before this — added `tauri-plugin-opener` (Cargo.toml, `lib.rs`,
the new `@tauri-apps/plugin-opener` npm dependency, and
`opener:allow-open-url` in `capabilities/default.json`), wrapped as
`tauriApi.openExternalUrl()`. `getAppVersion()` needed no new capability
— Tauri's core `app` module (`plugin:app|version`) is already covered by
`core:default`.

**Symbols & Sections legend:** `GlyphLegendModal.svelte`, modeled
directly on `ShortcutsModal.svelte`'s structure — a table of every token
→ glyph pair (`#`/`v`/`>`/`x`, `-`/`* `, `=> `, `=> @name`,
`=> <symbol>`, `! `) each with a one-line plain-language explanation,
plus a short paragraph on Setext-style section headers (a title line
followed by a `====` underline of four or more `=`, matching the exact
rule `isSetextUnderline()`/`getSectionHeaderForLine()` already use in
tokens.ts — the legend's wording was written to describe that real
implementation, not a separate approximation of it). Opened via
`Ctrl+Shift+/` (added to `App.svelte`'s global keydown handler and
listed in the Shortcuts drawer itself, next to the existing `Ctrl+/`).

**The focus fix:** neither `ShortcutsModal.svelte` nor the new
`GlyphLegendModal.svelte` has a text input to focus the way the Date
picker/Action Drawer/History/Search modals do, so both had exactly the
same gap — nothing ever moved focus off the editor when they opened.
Tried the obvious minimal fix first (just call `.focus()` on the
scrollable `.modal-list` div in `onMount`, relying on the browser's
default arrow-key/Page Up/Page Down/Home/End scroll behavior for a
focused `overflow: auto` element to do the rest) — browser-pane testing
of the *actual key presses* (not just checking `document.activeElement`,
which looked correct on its own) showed that default scroll action
couldn't be relied on to fire. Replaced it with an explicit handler
instead: a new shared action, `focusScrollableList()`
(`src/lib/actions/focusScrollableList.ts`, same `use:` pattern as the
existing `closeOnOutsideClick` action), focuses the list on mount and
handles Up/Down/Page Up/Page Down/Home/End itself via `scrollBy`/
`scrollTo` — verified in the browser pane by watching `scrollTop` move
in response to real key presses (`0 → 40` on the first `ArrowDown`,
clamped correctly at the bottom, `→ 0` again on `ArrowUp`). Nothing in
the handler calls `stopPropagation`, so the app's global shortcuts
(bound on `window` in App.svelte, `Escape` included — confirmed still
closing the drawer with focus inside it) are completely unaffected by
where focus sits.

---

## 72. Bug fix: About icon rendered tiny/misaligned; Glyph legend now theme-aware

**Status: fixed.** Two follow-ups reported after §71 shipped.

**About icon:** the plain `ℹ` character (U+2139) has *text* presentation
by default in the app's monospace font stack — it rendered as a small,
oddly-proportioned glyph next to the full-size color emoji used for
every other top-bar button (📅/📋/🕒/🔎/📥). Confirmed by rendering each
candidate to an offscreen canvas at the button's actual font and
measuring the opaque-pixel bounding box: plain `ℹ` came out ~7×16px
against ~23×23px for `📅`/`⚙`/etc. — visibly smaller and off-center, not
just a subjective impression. **Fix:** append the emoji variation
selector, U+FE0F (`ℹ️` instead of `ℹ`), which forces emoji presentation
— re-measured afterward at an identical 23×23px bounding box, byte-for-
byte matching `📅`'s. User was offered a few alternative icons (🛈, ❓,
📖) after the fix landed and confirmed keeping ℹ️.

**Glyph legend theming:** `GlyphLegendModal.svelte` originally rendered
every glyph in the list as plain text — it never followed the
color/grayscale toggle the way the actual editor and every other
glyph-displaying drawer (Action Drawer, Section History) do. Fix: each
glyph now uses the same `.glyph-open`/`.glyph-done`/`.glyph-progress`/
`.glyph-cancelled`/`.glyph-bullet`/`.glyph-followup`/`.glyph-assignee`/
`.glyph-emphasis-line` classes the editor's own decorations use
(app.css) — these already read the `--glyph-*-color`/`-weight`/
`-opacity` custom properties that `[data-color-mode="color"]` overrides,
so the legend now follows the toggle for free, with zero component
logic (no `colorMode` read, no conditional styling) — the exact same
"reference the same CSS variables" pattern `ActionDrawerModal.svelte`'s
and `HistoryModal.svelte`'s `glyphFor()` already used, just applied via
class instead of inline `style` since the legend's set of possible
glyphs is fixed rather than data-driven. Verified in both modes: open
action shows red/bold in color mode vs. plain weight in grayscale, done
green vs. dimmed, deferred orange vs. bold, delegated's `@name` badge
blue vs. neutral, etc.

---

## 73. Bug fix: top-bar icon and label sat ~1px out of vertical alignment

**Status: fixed.** Reported precisely: "all icons are aligned, and all
labels are aligned, but all together they look misaligned" — i.e. not
per-button jitter, a *systematic* offset between the icon glyph and its
label wherever both show. Confirmed and quantified in the browser rather
than by eye: `.icon-btn` is a `display: flex; align-items: center` row
whose two children — the emoji character and the (conditional)
`.icon-label` span — should both land centered on the same line.
Measuring their actual boxes (`getBoundingClientRect()`/`Range` on the
bare icon text) showed the label's box sitting exactly 1px higher than
the icon's on *every* button, despite both boxes reporting the same
14px height — the icon glyph (rendered from a color-emoji fallback font,
since none of the emoji used are in the app's own monospace stack) and
the label text (the app's actual monospace font) apparently get centered
slightly differently as a bare, unwrapped text-node flex item vs. a real
element flex item, even at equal box height.

**Fix:** wrap each button's icon character in its own `<span
class="icon-glyph">` (TopBar.svelte) — turning it from a bare text-run
flex item into a real element flex item, matching `.icon-label`.
`.icon-glyph` needed no styling of its own at all; wrapping alone was
enough. Re-measured afterward across every icon+label button (Date, My
Actions, Section History, Search, Import, Promote, Settings, About):
icon and label centers now land on the exact same pixel (`diff: 0`)
everywhere, confirmed on the actual compiled component, not just an
isolated test span.

**Follow-up:** still didn't read as aligned once actually looked at —
box-centers matching isn't the same thing as *looking* centered, since
an emoji's visible ink typically sits higher within its own box than a
line of text does in its. Rather than guess at another number, built a
side-by-side comparison artifact reusing the real button markup/CSS at
several label offsets (0-6px, actual size plus zoomed, with a guide line
through the icon's center) for a direct visual pick instead of another
measured-but-wrong attempt. `+1px` (`.icon-label { position: relative;
top: 1px; }` in app.css) was confirmed as the one that reads right.

---

## 74. About drawer: keyboard shortcut, and mention of the other two drawers' shortcuts

**Status: implemented.** Every other drawer opens via both a top-bar icon
and a keyboard shortcut except About, which only had the icon. Added
`Ctrl+Shift+,` (`App.svelte`'s global keydown handler, `controller.openAbout()`)
— paired with Settings' existing `Ctrl+,` the same way the Symbols &
Sections legend's `Ctrl+Shift+/` is paired with the Shortcuts drawer's
`Ctrl+/`, so the two shifted variants read as "the same key, plus the
drawer that goes one level further." Listed in the Shortcuts drawer
itself and in the About button's tooltip, same as every other shortcut.

Also added a short "Learn more" section to `AboutModal.svelte` naming
`Ctrl+/` (Keyboard Shortcuts) and `Ctrl+Shift+/` (Symbols & Sections) —
someone who found the About screen via its icon might not otherwise
know either drawer exists, since neither has its own top-bar icon.

---

## 75. Automated test suite (Vitest + `cargo test`)

**Status: implemented.** The project had zero automated tests through
§74 — every fix in this changelog to date was verified by hand in the
running app. Added a real suite covering the layer where virtually all
of those bugs actually lived: parsing/regex logic and state management,
not rendering.

**Frontend (Vitest, `npm test`):** `vite.config.ts` gained a `test`
block (jsdom environment, for the handful of DOM-touching cases) via
switching its `defineConfig` import from `vite` to `vitest/config` —
same config object, now typed for both. Vitest 3.x was pinned
deliberately (rather than latest/5.x) since this repo is still on Vite
5 and Vitest 5 requires Vite 6+; no reason to bump Vite just for this.
Test files are colocated as `*.test.ts` next to the module they cover:

- `tokens.test.ts` — every function, with explicit regression cases for
  the mid-line-`=>` bugs (§59, §70) and indentation tolerance (§41/§50).
- `date.test.ts`, `sectionImport.test.ts` — straightforward, using
  `vi.setSystemTime` for the date-relative cases.
- `actions/closeOnOutsideClick.test.ts`,
  `actions/focusScrollableList.test.ts` — the two Svelte actions, tested
  as plain DOM functions (no component framework needed for either).
  `focusScrollableList`'s test spies on `scrollBy`/`scrollTo` rather
  than asserting `scrollTop` afterward, since jsdom has no real layout
  engine and doesn't move `scrollTop` for those calls — this tests the
  actual key-dispatch logic (which key does what) independently of that
  limitation, the same distinction this session's own §71/§73
  investigation had to draw against a real browser.
- `controller.test.ts` — the largest one: tab lifecycle (create/switch/
  cycle/close, the safety-close gate, reopen-last-closed), the §64
  copy/paste-deferral feature (single line, multi-line, today-or-later
  only, not into a scratchpad, not back into the source), action-drawer
  snapshotting (§69's v/x-inclusion, §41's consequence-actions), §70's
  section-history dedup, directory switching (including the unsaved-
  scratchpad safety gate), and `initApp`'s session restore (today's tab
  always present, previously-active tab restored or falling back,
  deleted files silently skipped). `./tauriApi`,
  `@tauri-apps/api/window`, and `@tauri-apps/plugin-dialog` are mocked;
  `vi.resetModules()` + a fresh dynamic `import("./controller")` before
  every test sidesteps the module's several pieces of private,
  module-level singleton state (closed-tab history, the last-copied-
  action record, the disk-notes cache) — none of which have (or need) an
  exported reset function for the real app, since it only ever loads
  once — so no test can leak state into another regardless of run order.

**Deliberately out of scope:** no `.svelte` component is rendered or
tested directly. §72/§73's pixel-layout bugs needed a real browser to
even *measure* correctly during their own investigation — jsdom, which
has no real layout engine, would tell you even less than that did.
`EditorPane.svelte` (CodeMirror) and the modal components would need a
much heavier `@testing-library/svelte`-based setup for comparatively low
return, given `controller.ts` — where the actual business-logic risk
lives — is already directly covered. Documented as a deliberate scoping
decision (not an oversight) in `README.md` and `CLAUDE.local.md`.

**Rust (`cargo test`, `src-tauri/`):** `storage.rs`'s functions all took
`&AppHandle` and resolved real OS paths (`app_config_dir`/
`document_dir`) internally, which isn't something a plain `#[test]` can
control — and `tauri::test::mock_app()`'s path resolver still resolves
to real machine paths, not a temp directory, so using it here would have
meant tests actually touching real config/notes locations. Refactored
instead: every function's file-handling core was extracted into a
path-parameterized `_at` sibling (`load_config_at(path, ...)`,
`write_note_at(root, ...)`, etc.), with the original `AppHandle`-taking
functions becoming thin wrappers that resolve the real path and delegate
— **behavior-preserving, no public signature changed** (confirmed by
`cargo check` passing unchanged and by re-diffing `lib.rs`'s call
sites). `is_valid_note_filename` and `push_recent_notes_dir` needed no
refactor at all, already pure. Added `tempfile` as a dev-dependency;
tests cover filename validation (including path-traversal rejection),
the recent-folders dedup/cap-at-5 logic, config load/save (including
defaulting newer fields when loading an older/hand-edited file), note
CRUD, and tab-session persistence — 22 tests, all passing on the first
run after the refactor.

**CI:** added `.github/workflows/test.yml` (frontend job on
`ubuntu-latest`: `npm run check` + `npm test`; Rust job on
`windows-latest`, matching the only platform this project has actually
been built on: `cargo test`) running on every push/PR to `main` — so the
suite can't silently drift out of sync with what's actually committed.

**Keeping it current going forward:** documented as an explicit
expectation in `CLAUDE.local.md` — a change to the tested logic without
a corresponding test change is a sign something was missed, the same
way a change without a changelog entry would be.

---

## 76. MIT license

**Status: implemented.** Through §75 the repo had no `LICENSE` file at
all. For a project that's public on GitHub with tagged releases and
downloadable installers, "no license" is not neutral — it defaults to
all-rights-reserved, so nobody can legally fork, modify, or redistribute
it even though every other signal (open repo, published binaries) invites
them to. This closes that gap.

**MIT**, specifically: it's about the shortest permissive license, imposes
no copyleft, and asks only that the notice travel with source copies — no
obligations that would touch the distributed binary, which would be
overkill for a plain-text notes editor. Copyright line is
`2026 Marien de Gelder`.

Declared in three places beyond the `LICENSE` file itself so tooling and
GitHub's license-detection actually pick it up:
- `package.json` — `"license": "MIT"`
- `src-tauri/Cargo.toml` — `license = "MIT"`
- `README.md` — a `## License` section linking `LICENSE`

Landed in commit `36e711d`, after v0.3.0 was already tagged. No version
bump: adding a license isn't a code change and doesn't alter the built
app. This entry is written retroactively — the commit shipped without a
§-entry at the time, which (per §75's own closing note) is exactly the
kind of gap the changelog is supposed to not have.

---

## 77. UI/UX end-to-end test harness (Playwright + mock Tauri backend)

**Status: implemented.** §75 added the unit layer (`tokens.ts`, `date.ts`,
`sectionImport.ts`, the bulk of `controller.ts`, `storage.rs`) but drew a
hard line at rendered components: "no `.svelte` component is rendered or
tested directly." That left the entire *interaction* surface — does typing
`# ` actually paint a glyph, does `Ctrl+Shift+A` open the drawer, does
forwarding an action really rewrite two files — verified only by hand in
the running app. This fills that gap without walking back §75's reasoning
about jsdom.

**Approach — real frontend, fake backend.** The specs drive the *actual*
Svelte + CodeMirror frontend in headless Chromium (Playwright), but the
Tauri IPC layer is replaced with an in-memory stand-in. The frontend only
ever reaches Rust through `window.__TAURI_INTERNALS__.invoke(...)` (see
`tauriApi.ts` and the plugin packages), so `src/lib/testing/mockBackend.ts`
installs a substitute for that object: a `Map`-backed notes "filesystem"
implementing every command in `src-tauri/src/lib.rs`
(`get_config`/`list_note_files`/`read_note`/`write_note`/`read_all_notes`/
`read_tab_session`/`write_tab_session`/`set_notes_dir`/`set_color_mode`/
`path_exists`) plus the `plugin:app|version` / `plugin:dialog|open` /
`plugin:opener|open_url` / `plugin:event|*` / `plugin:window|*` calls the
app makes. No Rust build in the loop; the whole suite runs in ~25s.

Parity with `storage.rs` is deliberate and load-bearing: the mock mirrors
`is_valid_note_filename` (exactly `YYYY-MM-DD.txt` — the path-traversal
guard), `push_recent_notes_dir` (old dir to the front, new dir removed,
dedup, cap 5), `read_note` returning `null` (not an error) for a missing
file, and the session file being invisible to `list_note_files`. If
`storage.rs` semantics change, `mockBackend.ts` has to move with it — same
standing rule as tests tracking the code they cover.

**Generated dataset.** `src/lib/testing/dataset.ts` produces a realistic
run of daily notes — recurring meeting sections, carried-over actions,
delegated (`=> @name`) and consequence (`=> #`) lines, nested bullets,
emphasis, plain prose — deterministic from a seed (`prng.ts`, mulberry32;
nothing here touches `Math.random`). `scenarios.ts` packages named seeds
(`empty`, `busy-week`, `heavy` ≈ 10 weeks, `delegation`, `dir-switch`).
Drive any of them by hand with `npm run dev` →
`localhost:1420/?mock&scenario=busy-week`.

**Wiring.** `src/main.ts` gained one branch:
`if (import.meta.env.DEV && ?mock) await import("./lib/testing/bootMock")`.
`import.meta.env.DEV` is a compile-time constant, so `vite build` drops
the branch and the dynamic import with it — `src/lib/testing/` never
enters a production bundle. A dedicated CI job (`build-guard`) greps
`dist/` after a real build to keep it that way. Reload-persistence (for
"…survives a restart" tests) is handled by the mock snapshotting itself to
`sessionStorage` on every write and rehydrating from it — per browser tab,
so Playwright's per-test context isolation still gives each test a clean
slate.

**Coverage** (`tests/e2e/*.spec.ts`, 50+ cases): the token→glyph→disk
round-trip and every glyph; `Ctrl+Space` cycling and bullet continuation;
tab create/close/cycle/reopen and both safety-close gates (open actions,
unpromoted scratchpad); the Action Drawer (open/all scope, Only-Open,
`@`-filter, cycle-in-place, forward-to-today rewriting both files, jump);
the date picker grammar and create-on-open; section import spacing and
draft persistence; cross-tab / all-files search; Section History
aggregation and dedup across a recurring dated section; theme toggle
persisting across a reload; directory switching via both the recent list
and the folder picker, including the unsaved-scratchpad gate; the
Shortcuts / Symbols / About drawers, the external-link path, and drawer
focus capture. `visual.spec.ts` captures a screenshot gallery of every
modal and the full token vocabulary in both colour modes — **artifacts
for review, not pixel-diff assertions**: §72/§73 already established that
this app's sub-pixel layout is too noisy under display scaling for
`toHaveScreenshot()` to be anything but a flake source.

**Two component fixes made for testability, both real improvements:**
`SafetyModal` and `UnsavedScratchpadsModal` were the only two modals with
no `role="dialog"` / `aria-modal` / `aria-label` — added, so they're
consistent with the other eight and reachable by accessible name.

**Also:** `src/vite-env.d.ts` (the standard Vite ambient-types file —
needed now that `main.ts` reads `import.meta.env`); `@playwright/test` as
a dev dependency; `npm run test:e2e` / `:e2e:ui` / `:e2e:report` scripts;
`e2e` + `build-guard` jobs in `.github/workflows/test.yml`;
`tests/e2e/README.md` documents the whole setup.

---

## 78. Jump to next / previous open action (`Ctrl+↓` / `Ctrl+↑`)

**Status: implemented.** `Ctrl+Space` cycles the *current* line's action
state; there was no quick way to *get to* the next unresolved one in a
long note without scrolling and hunting. Added an editor-level shortcut
that moves the cursor to the next (`Ctrl+↓`) or previous (`Ctrl+↑`) open
action, wrapping around at the ends.

"Open action" is the same set everything else already agrees on — a
plain `# ` line (indented or not, §50) or a `=> #` consequence-action
(§41), i.e. `innermostActionSymbol(line) === "#"`. Resolved states
(`v `/`x `/`> `), bullets, emphasis, plain `=> ` follow-ups and `=> @name`
delegations are skipped.

`tokens.ts` gained `openActionLineIndices()` and `adjacentOpenActionLine(text,
fromLineIdx, dir)` (the wrap logic, unit-tested — empty note, single
action, both directions, cursor on/between actions). `EditorPane.svelte`'s
keymap calls it and dispatches a cursor move to the target line's start
with `scrollIntoView`, matching how the Action Drawer's "jump to line"
already behaves. A note with zero open actions gets a
`"No open actions in this note"` toast rather than a silent no-op (same
pattern as `reopenLastClosedTab`'s "No recently closed tabs").

**Key choice:** `Ctrl+ArrowUp`/`Ctrl+ArrowDown` are unbound in CodeMirror's
`defaultKeymap` and not intercepted by `App.svelte`'s global handler, so
there's no conflict; the editor `keymap` sits ahead of `defaultKeymap` in
the extension order regardless. Listed in the Shortcuts drawer. Covered
by `tokens.test.ts` and `tests/e2e/open-action-nav.spec.ts`.

---

## 79. Bug fix: glyph lines rendered ~1px taller than plain lines

**Status: fixed.** Reported after §71's editor font bump (12px → 13px,
commit `111ffdb`): lines carrying a token glyph (`☐`/`☑`/`☒`/`»`/`➔`/`•`)
sat slightly taller than lines without one, so line spacing visibly
hitched wherever an action or bullet appeared.

**Root cause** — confirmed in a real browser via the §77 E2E harness, not
by eye. The glyph characters aren't in the editor's monospace stack
(`Cascadia Code`/`JetBrains Mono`/`Consolas`) and fall back to a symbol
font — `Segoe UI Symbol` in WebView2 — whose glyph box runs ~1px taller
than the editor's own line box. Each glyph renders as a fixed-width
`inline-block` (the column-alignment guarantee, spec 2.2); with only
`width` pinned, the box's *height* was whatever the fallback font
produced, and an `inline-block` taller than the line drags the whole
line's height up with it. Forcing `.glyph-open`'s font to
`Segoe UI Symbol` in a throwaway measurement reproduced it exactly:
20.8px line → 21.8px.

**Fix** (`app.css`) — pin the glyph box to exactly one line: `height` and
`line-height` both `1.6em` (the `.cm-line` ratio), `overflow: hidden` so
a tall fallback glyph is contained rather than expansive, and
`vertical-align: top` so the box aligns to the line box's top instead of
its baseline. `text-align: center` keeps the glyph centered in its
2ch / 3ch cell. Re-measured across every glyph: all lines a uniform
20.8px, and the forced-tall-font case stays 20.8px too. Bonus — the glyph
box centers went from sitting 0.9–1.9px *above* the line center (the old
baseline alignment) to dead-centered (`delta: 0`), so glyphs read as
better aligned with their text than before, not just consistently
spaced. Locked in by `tests/e2e/glyph-layout.spec.ts`, including the
tall-fallback-font simulation.

---

## 80. Optional soft word-wrap in the editor

**Status: implemented.** The editor has always scrolled long lines
horizontally — deliberate, per the tabular-monospace-grid tenet (spec
1.2): wrapping would break column alignment in tables and aligned notes.
But for prose-heavy notes that's the wrong default, and there was no way
to change it. Added a **Settings toggle** ("Editor → Word wrap"), off by
default so nothing changes for anyone who doesn't opt in.

**Persistence** follows the exact `color_mode` pattern: a new
`word_wrap: bool` field on `AppConfig` (`storage.rs`, `#[serde(default)]`
→ `false` for a config written before it existed), a `set_word_wrap`
command (`lib.rs`), `api.setWordWrap()`, a `wordWrap` store in
`controller.ts` set from config in `initApp` and written through
`setWordWrap()`.

**Live toggle, no remount:** `EditorPane.svelte` wraps
`EditorView.lineWrapping` in a CodeMirror `Compartment`, seeded from the
store at mount and `reconfigure`d by a plain store subscription (not a
`$:` block — the TopBar.svelte reactivity note applies) whenever Settings
flips it. The document, cursor, undo history and scroll position are
untouched — confirmed by an E2E test that tags the `.cm-editor` node and
checks it's the same element after toggling.

Covered by `storage.rs` tests (round-trip + older-config default),
`controller.test.ts` (`setWordWrap` + `initApp` reads it), and
`tests/e2e/word-wrap.spec.ts` (default scrolls, toggle wraps + persists
across reload, seeded-on boots wrapped, reconfigure-in-place). The mock
backend (`src/lib/testing/mockBackend.ts`) mirrors the new command and
field.

---

## 81. Setext underline rendered as a double rule (retry of §47)

**Status: implemented.** §47 tried to draw the `====` row under a section
title as an actual rule and reverted it — vertical alignment never
landed (two guesses, both wrong), and hover/click-to-edit only worked
once. §47's own post-mortem named the fix: use `Decoration.mark` over the
real `=` characters instead of a `Decoration.replace` widget with
invented content. That's what this does, and it works.

**How** (`src/lib/editor/setextRule.ts`):
- A `ViewPlugin` marks the `=` run of every Setext underline row
  (`isSetextUnderline()`) with `.cm-setext-rule` — `color: transparent`,
  the characters kept in the layout so hit-testing / `posAtCoords` work
  natively. Width tracks the `=` count in the file; the app's own
  section-creation paths already write `max(3, title.length)` `=`, so for
  anything it created the rule matches the title width, with no silent
  auto-editing of the document.
- The mark is dropped — reverting to the literal, fully editable `=` —
  whenever the row is *active*: the cursor is on it, the selection
  touches it, or the mouse is over it. Cursor/selection come from
  `state.selection`; hover is tracked by `posAtCoords` on `mousemove`
  (a `StateField` holding the hovered line number), **not** by listeners
  on the mark's span — the moment hover reveals the plain text the span
  is gone, so a `mouseleave` on it would fire instantly and flip back.
  `posAtCoords` keeps resolving the same line whether it's drawn as the
  rule or as text, so the row stays revealed while the pointer is on it.
- The rule itself is **two 1px lines drawn as background gradients** at
  `calc(51% ± 0.09em)` of the line box — straight through where the `=`
  glyph's own ink sits (Cascadia Code renders `=` essentially centred in
  the line box; `51%` landed dead-on in a 10× overlay check of the rule
  against the real characters). Positioning the rule on the glyph, rather
  than somewhere that merely looks like an underline, is what makes the
  reveal seamless — there's no vertical jump when the row toggles between
  the rule and the literal `=`. (First cut used `border-bottom: 3px
  double` + `position: relative; top: -0.2em`; the border sits at the
  text box's *bottom*, ~half a line below the `=` ink, so the line
  visibly shifted up on reveal — caught in review.) Backgrounds don't
  affect layout, so the row stays exactly one line tall (all lines a
  uniform 20.8px, glyph rows included, per §79).

**Why it converged this time:** §47 was done "without the ability to see
the running app directly." This was tuned and verified in a real browser
via the §77 E2E harness — every reveal path (cursor, selection, keyboard-
onto-the-row, hover), the no-stuck-state guarantee, the row height, and
the vertical position (overlaid against the real `=` at 10× zoom), all
measured. Covered by `tests/e2e/setext-rule.spec.ts`.

**Not done:** revealing the underline while the cursor is on the *title*
line (only the underline row itself reveals it). §47's original ask was
"editable when the cursor is on the line" — singular, the underline —
and that's what shipped; extending it to the title row is a small
follow-up if wanted.

---

## 82. Bug fix: a stale copy record deferred actions in the wrong tab (#8)

**Status: fixed.** Reported after v0.4.0. Steps: copy a block of text
containing open actions from an older tab (to paste into another
application); switch to today's tab; copy and paste something there — and
the *older* tab's `# ` lines get marked `> ` (deferred), even though
nothing from that tab was pasted anywhere in ChronoNote.

**Root cause** — the copy/paste-deferral feature (§64) tracks the last
copied text in a module-level `lastCopiedAction` so the next paste knows
which source lines to forward. `recordCopiedAction()` (called on every
`copy` inside the editor) only ever *set* that record — and only when the
copied text contained an open action:

```ts
if (OPEN_ACTION_LINE.test(text)) lastCopiedAction = { text, sourceTabId };
```

So a later copy that *didn't* contain an open action (a plain line, a
done/deferred action, a section header) left the previous record
untouched. The next paste — anywhere today-or-later, in any tab — then
ran against that stale block and deferred its actions in the tab it was
originally copied from. `handlePasteIntoTab`'s existing
`srcTab.content.includes(copied.text)` guard didn't help here: the older
tab genuinely still contained the block.

**Fix** — `recordCopiedAction` now *always* replaces the record: a copy
that carries an open action becomes the new `lastCopiedAction`, and a
copy that doesn't clears it to `null`. A fresh copy of anything means the
previous copy is no longer what's about to be pasted. Covered by two new
`controller.test.ts` cases (a plain copy clears it; a different
open-action copy replaces it) and a `tests/e2e/paste-deferral.spec.ts`
case driving it through real copy/paste across tabs.

---

## 83. Rebind next / previous open action to `F2` / `Shift+F2` (#7)

**Status: fixed.** §78 shipped the jump on `Ctrl+↓` / `Ctrl+↑`. Poor
choice: CodeMirror's `defaultKeymap` doesn't bind those on Windows, so the
editor's contenteditable falls through to the browser's own "move the
caret to the start of this / the next line" — which is exactly what a user
expects `Ctrl+↓`/`Ctrl+↑` to do, and the §78 binding was fighting it.

Moved to **`F2` (next) / `Shift+F2` (previous)** — the near-universal
editor convention for "go to next / previous <match | problem | bookmark>"
(VS Code, Visual Studio, IntelliJ). Function keys aren't bound anywhere
else in ChronoNote. `Ctrl+↓`/`Ctrl+↑` are unbound in the editor keymap
again and go back to the browser's caret motion. One-line keymap change in
`EditorPane.svelte`, plus the Shortcuts drawer and
`tests/e2e/open-action-nav.spec.ts`.

---

## 84. Action glyphs `☐` `☑` `☒` shrunk to the size of the character they replace (#13)

**Status: fixed.** Reported after v0.4.1. The open / done / cancelled
glyphs render from a bordered-square symbol character (`☐ ☑ ☒`) that the
WebView2 fallback font draws at near-full-em — a closed shape that reads
visibly larger and heavier than the `#` / `v` / `x` it stands in for. The
deferred glyph (`»`) is a light chevron and already sits right; Marien
confirmed it should stay untouched.

**Fix** (`src/app.css`) — `transform: scale(0.85)` on `.glyph-open`,
`.glyph-done`, `.glyph-cancelled` only. That brings the drawn box down to
roughly the `#` cap height (measured in a 4.5× overlay of the rendered
editor against a plain `#` line), scaled about its own centre so it stays
put on the line.

**Why `transform`, not `font-size`:** the glyph span carries the §79
one-line box (`height: 1.6em; line-height: 1.6em` with `overflow: hidden`,
`vertical-align: top`) that keeps glyph rows exactly as tall as plain rows
(20.8px). `font-size: 0.85em` would also shrink that `1.6em` box to
~17.7px, and `vertical-align: top` would then hang the glyph above the
line's centre — `glyph-layout.spec.ts`'s vertical-centring assertion
caught this on the first attempt (delta 1.56px > 1px tolerance). A
transform doesn't touch the layout box, so all three glyph-layout cases
stay green and the row height is unchanged. `.glyph-progress` (`»`),
`.glyph-bullet` (`•`), `.glyph-followup` (`➔`) are left as they were.

---

## 85. `Enter` on an action line continues it as a new open action (#12)

**Status: implemented.** Requested after v0.4.1 — the same convenience
bullet lines already have (§51). Pressing `Enter` on a `# `/`v `/`> `/`x `
line (indented or not, §50) now:

- splits the line at the cursor and starts the tail on a new line, the
  way `Enter` on a bullet does — so it works mid-line, splitting one
  action into two;
- makes that new line a fresh **open** action (`# `) at the same
  indentation, *regardless* of the current line's symbol — you're adding
  a task, and tasks start open (writing `v ` or `x ` under a done item
  makes no sense; continuing under a `> ` deferred item you almost
  certainly mean a new to-do);
- on an *empty* action line (just the symbol), removes the marker
  instead — the "press Enter twice to leave the list" exit, identical to
  an empty bullet.

`Shift+Enter` is unchanged: a plain newline, no new marker.

**How.** New pure helper `actionLineEnter(lineText)` in `tokens.ts`
(returns `{ removeSymbol: true }`, `{ insert: "\n<indent># " }`, or
`null` to fall through) — unit-tested in `tokens.test.ts`. Wired into the
existing `bulletContinuation` in `EditorPane.svelte`: when the line isn't
a bullet and the key is plain `Enter`, it consults `actionLineEnter`
before deferring to CodeMirror's default newline. Leading-symbol lines
only — a `=> #` consequence-action or a `=> @name` delegation is not a
list item and still gets a plain newline. E2E coverage in
`editor-tokens.spec.ts` (continue, empty-exit, done-line → open, mid-line
split, `Shift+Enter` untouched).

---

## 86. Per-tab undo/redo history, and undoing a paste-forward un-defers the source (#9)

**Status: implemented.** Two parts.

**(a) Undo history is kept per tab.** `App.svelte` wraps the editor in
`{#key activeTab.id}`, so every tab switch fully unmounts and rebuilds
CodeMirror — which meant its undo stack restarted empty each time, even
though the cursor and scroll position were already being preserved
(`saveEditorViewState`/`getEditorViewState`). The history now rides along:
`onDestroy` serializes it with `view.state.toJSON({ history: historyField })`
and `onMount` restores it via `EditorState.fromJSON(…, { history: historyField })`.

The one catch is that CodeMirror's history stores changes as
position-based change sets, so it's only valid against the exact document
it was recorded on. A tab's text *can* change while it's inactive — an
action-drawer edit, or (part b) its `# ` lines being deferred by a paste
in another tab. So the saved state also carries `docAtSave`, and the
restore only happens when that still equals the tab's current content;
otherwise that one tab starts with a fresh undo baseline (you can't undo
"through" an edit the editor never saw). Cursor/scroll restore regardless,
as before. Confirmed with Marien.

Redo persists too (it's part of the same serialized field). `historyKeymap`
only binds Ctrl+Shift+Z to redo on macOS/Linux — Windows gets Ctrl+Y — so
§86 also adds `Mod-Shift-z → redo` to the editor keymap for parity, since
that's the combo most people reach for and undo/redo is the whole point
of the change. Ctrl+Y still works.

**(b) Undoing a paste-forward flips the source tab's `> ` back to `# `.**
The copy/paste-deferral feature (§64) marks the copied `# ` lines as `> `
in their *source* tab when you paste them into today's (or a later) note.
That source edit is a separate `writeTabContent`, outside the target
editor's transaction, so a plain Ctrl+Z in the target only ever undid the
paste itself and left the source deferred.

`handlePasteIntoTab` now records a `pasteDeferLink`
(`{ targetTabId, sourceTabId, openBlock, deferredBlock, reverted }`) — one
at a time, like `lastCopiedAction`, replaced by the next paste-forward.
`EditorPane`'s update listener reports every `undo`/`redo` transaction
(via `tr.isUserEvent`) to `onEditorUndo`/`onEditorRedo`. When the undo
that actually *removes the pasted block* from the target fires, the
controller flips the source's `> ` block back to `# ` (a targeted
`.replace`, so later edits in the source tab aren't clobbered); redo
re-applies it. Earlier undos — of edits made after the paste — pass
through untouched, and the link is dropped (source stays deferred) if the
block was since edited so it can't be matched, or if either tab closes.
Per Marien's call, the reach is deliberately just the paste's own undo
step: no attempt to also make the defer independently undoable *from* the
source tab (that would need synthetic history injection into an unmounted
editor).

Covered by `undo-history.spec.ts` (6 E2E cases: history survives a switch,
per-tab isolation, stale-baseline safety, the paste-undo flip, redo, and
undo-past-later-edits) and 8 `controller.test.ts` cases for the link
state machine.

---

## 87. Glyphs aligned to the character they replace, with the trailing space as a gap (#16)

**Status: implemented.** The inline glyphs are `Decoration.replace` widgets
sized `display: inline-block; width: 2ch` (`# `, `v `, `> `, `x `, `- `) or
`3ch` (`=> `) so text after them lines up with the same line unglyphed
(§79's note). They were also `text-align: center`, which pushed every
glyph a half-cell to the right of where its first character had been and
swallowed the token's trailing space — so `☐open` read as one clump,
shifted right of a bare `#`.

**Fix** (`src/app.css`), all in the `.glyph-*` rules:
- `text-align: left` — the glyph now starts on the same column its token
  did (`#`/`v`/`>`/`x`/`=` at column 0, or two spaces in when the action
  line is indented), and the rest of the `Nch` cell is the gap before the
  text.
- The scaled checkboxes (§84) get `transform-origin: left center` so the
  0.85 shrink pulls toward that left edge instead of the centre.
- `.glyph-open` / `.glyph-done` / `.glyph-cancelled` and `.glyph-followup`
  also get `translateY(0.05em)`: against lowercase text the checkbox and
  the follow-up arrow sat a hair high (their ink reaches well above the
  x-height while sharing the baseline). `»` (progress) and `•` (bullet)
  already aligned and are only left-shifted, not nudged.

Layout height is untouched — `transform` and `text-align` don't affect the
box — so §79's "every glyph line is exactly as tall as a plain line" still
holds. `glyph-layout.spec.ts` gains two cases (glyph vertically tracks the
line's own text; glyph starts on column 0 / two-spaces-in when indented)
and its old "centred in the line box" case is reworked to measure against
the text rather than the box.

---

## 88. Symbols & Sections legend: glyphs render as plain inline text (#19)

**Status: fixed.** The `.glyph-*` classes do two jobs: the `--glyph-*`
colour / weight / opacity theming (wanted anywhere a glyph appears) and
the editor's fixed-cell box model — `display: inline-block`, `width: 2ch`
/ `3ch`, the `1.6em` one-line box, `vertical-align: top`, and the §84/§87
`transform`s. `GlyphLegendModal` reuses the classes purely for the
colours (so the drawer follows the grayscale/colour toggle for free), but
it got the box model too: in each `<kbd>token</kbd> → <glyph>` row the
glyph sat in a 2ch inline-block, half a cell to the right of the arrow
and nudged down by the editor's `translateY`, so it read as misaligned.

**Fix** (`src/app.css`) — scope every layout declaration to `.cm-line`
(`.cm-line .glyph-open { … }`, etc.), leaving only the colour rules
unscoped. Editor glyphs are always inside a `.cm-line`, so the editor is
unchanged; everywhere else the classes are now just coloured text. In the
legend the glyph's vertical centre lands exactly on the token pill's
(measured delta 0). Covered by a `drawers.spec.ts` case asserting the
legend glyph is `display: inline`, un-transformed, ~1 char wide, and
row-aligned. The class doing double duty is still a smell — noted for the
0.5.0 refactor (a dedicated colour-only class, or moving the box model
into `glyphs.ts`).

---

## 89. `Ctrl+↑` / `Ctrl+↓` — caret to start of line / start of next line (#20)

**Status: implemented.** §83 moved the open-action jump off these keys
because the browser's contenteditable already did "caret to start of
line / start of next line" with them on Windows — but that was an
implicit browser default, not something ChronoNote guaranteed. Now it's
an explicit editor binding: `Ctrl+↑` moves the caret to the start of the
current line, `Ctrl+↓` to the start of the next line (`Shift` extends the
selection). "Line" is the document line — word wrap is off by default —
and `Ctrl+↑` is deliberately *"go to start of line"*, not *"step to the
previous line"*, exactly as the request read; if the up key should also
walk upward through line-starts that's a one-line follow-up.

Bound `win:` / `linux:` only in `EditorPane`'s `shortcuts` keymap, so
macOS keeps `defaultKeymap`'s page-scroll on `Ctrl+↑`/`Ctrl+↓` (the app
ships Windows-only today, but the binding stays correct if that changes).
Shortcuts drawer updated; `open-action-nav.spec.ts`'s old "Ctrl+↓ is
unbound now" case is reworked to assert the new caret motion.

---

## 90. `Ctrl+↑` at the start of a line steps up a line (#24)

**Status: implemented.** The §89 follow-up that section flagged. `Ctrl+↑`
still goes to the start of the current line, but when the caret is
*already* there it now moves to the start of the line above (and a
repeated press keeps climbing, clamping at line 1) — so the key is never
a no-op. `Ctrl+↓` is unchanged (already stepped to the next line). Just a
tweak to `lineStartTarget()` in `EditorPane`: `head === line.from &&
line.number > 1 ? doc.line(line.number - 1).from : line.from`. `Shift`
still extends the selection to the same target. Shortcuts drawer wording
updated; two `open-action-nav.spec.ts` cases added (climb + clamp, and
`Shift` extension from a line start).

---

## 91. First launch of the day opens on today's note (#23)

**Status: implemented.** ChronoNote restores the exact tab set and
active tab a folder had open last time (§34). But for a daily-notes app,
the first time you open it on a new day you almost always want *today* —
not yesterday's note you happened to leave focused. Session restore now
distinguishes the first launch of a day from a later one.

`TabSession` gains a `lastOpenedDate` field (`YYYY-MM-DD`, written by the
frontend on every session save, `Option<String>` / `#[serde(default)]`
in `storage.rs` so pre-#23 session files still load). At boot,
`restoreOrBootstrapTabs()` compares it to `todayISO()`: if they differ —
a new day, or a null session (**first launch ever, after install**) —
today's dated tab is forced active regardless of the saved `activeTab`.
The previously-open tabs are still all restored, just not focused. Later
the same day, `lastOpenedDate` matches and the saved active tab is
restored as before. The date is part of `persistTabSession()`'s dedup key
so the day rolling over always triggers a fresh write even when the tab
set is otherwise identical to yesterday's.

Covered by `controller.test.ts` (`initApp`): first-open-of-day forces
today, first-launch-after-install forces today, same-day reopen restores
the last active tab, and the session is stamped with today's date on
boot. `storage.rs` round-trip test extended for the new field.

---

## 92. Crash-atomic, workspace-confined disk writes (hardening §1)

**Status: implemented.** First slice of the hardening roadmap
(`docs/design/hardening-roadmap.md`, reconciled from an external review).
Storage-layer only — no frontend or IPC change, behaviour identical to
every caller.

**Atomic writes (§1.2).** `write_note_at`, `save_config_at` and
`write_tab_session_at` all went through `std::fs::write`, which truncates
the target *then* streams bytes — a crash, freeze, or `ENOSPC` mid-write
left a truncated or zero-byte note. New `atomic_write(path, bytes)` in
`storage.rs`: stream into a sibling temp file in the same directory (via
the `tempfile` crate — promoted dev→prod dependency), `sync_all()` to
force data + metadata to physical media, then `persist()` — an atomic
rename that replaces the target. On Unix the containing directory is
`sync_all()`'d too so the rename itself is durable. A crash at any point
leaves either the complete old file or the complete new one. The
`NamedTempFile` unlinks itself on drop, so a failure before the rename
leaves nothing behind (caveat: a *panic* — not a normal `Err` — under
release's `panic = "abort"` skips the drop, leaving one `.chrono-*.tmp`
in the notes dir; harmless, and `is_valid_note_filename` keeps it out of
every listing).

**Workspace confinement (§1.1).** New `resolve_workspace_path(workspace,
rel)` — rejects `..`, absolute paths and path prefixes lexically, then
`dunce::canonicalize`s (Windows-friendly, no `\\?\`) to catch symlinks
that escape the tree, returning `StorageError::PathEscapesWorkspace`.
Every note write now passes through it. `is_valid_note_filename` already
shape-checks daily filenames before any join, so in practice this is
defense-in-depth on the workspace root — but it's now a single
chokepoint.

Deps added: `tempfile` (dev→prod), `dunce`. Eight new `storage.rs` tests:
round-trip, replace-in-place, no-temp-litter, 50 rapid writes land the
last value, and `resolve_workspace_path` rejecting parent / absolute /
(Unix) symlink escapes while allowing direct children.

---

## 93. Zero-loss exit barrier (hardening §3)

**Status: implemented.** Hardening roadmap Phase 3, on the `refactor/
foundation` branch (→ v0.5.0). Autosave is debounced 400ms, so the last
burst of typing before an OS window close (X button, Alt+F4) could be
lost. Now the close is intercepted, every pending disk write is flushed,
and only then is the window destroyed.

**Frontend only** — Tauri v2's window manager already calls
`api.prevent_close()` automatically whenever a JS `tauri://close-requested`
listener exists (`tauri` crate, `manager/window.rs`:
`if window.has_js_listener(WINDOW_CLOSE_REQUESTED_EVENT) { api.prevent_close() }`),
so no Rust `on_window_event` handler is needed. `boot.ts`'s
`wireCloseBarrier()` (wired from `initApp`) registers
`getCurrentWindow().onCloseRequested`, `preventDefault()`s, then:

- **No unsaved scratchpad:** `flushAllPendingSaves()` (new, in
  `persistence.ts`) fires every debounced write immediately and awaits
  those plus anything already in flight — tracked via a module-level
  `inFlightWrites` set that every `writeNoteAndInvalidateCache` now adds
  to. It never rejects (`Promise.allSettled`), so a failing disk can't
  hang the quit. Then `getCurrentWindow().destroy()`.
- **Non-empty scratchpad present:** a scratchpad has no disk file, so it
  routes through the same unsaved-scratchpads gate a notes-folder switch
  uses (§39). Close is cancelled; the modal offers **Discard & Quit** or
  **Cancel**. A new `scratchpadGateContext` store (`"switch" | "close" |
  null`) drives the modal's wording and which resolve handlers its
  buttons call (`confirmDiscardAndClose` / `cancelAppClose` in `boot.ts`
  vs. the existing `confirmDiscardAndSwitch` / `cancelDirectorySwitch`).

One capability added: `core:window:allow-destroy` in
`src-tauri/capabilities/default.json` — `core:default` grants the
read-only window APIs but not `destroy`, so without this the barrier
prevented the close and then couldn't complete it (the window hung
un-closable — caught in a real-app close test, not by any suite).

The mock backend grew real event plumbing (`emitEvent`, listener
registry keyed to `plugin:event|listen`) so a test can drive
`tauri://close-requested` — also groundwork for Phase 4's window-focus
trigger. Covered by `tests/e2e/exit-barrier.spec.ts` (flush-before-
destroy, clean close when idle, the scratchpad gate + its two buttons)
and three `controller.test.ts` cases for `flushAllPendingSaves`.

---

## 94. External-modification detection & conflict resolution (hardening §2)

**Status: implemented.** Hardening roadmap Phase 4, on `refactor/
foundation` (→ v0.5.0). ChronoNote notes are plain files a cloud-sync
client or another editor can rewrite underneath an open tab. Now the
active tab's on-disk content is checked — on every tab activate and every
time the OS window regains focus — against a SHA-256 baseline recorded at
its last load or save:

- **hash unchanged** → nothing (the overwhelmingly common case; one
  `get_file_metadata` IPC).
- **changed, no local edits** → silent reload of the tab + a toast
  (`Reloaded … — it changed on disk`). Marien's call: no confirmation
  prompt for the clean case.
- **changed, with local edits** → the conflict prompt (`ConflictModal`),
  three choices, none of which lose data silently: **Keep disk version**
  (reload, drop my edits), **Keep my version** (overwrite disk — a
  compare-and-swap on the hash the user was shown, so a *third* change
  re-opens the prompt instead of clobbering), **Save mine as a copy**
  (writes `<name>-<HHMMSS>.txt` into a hidden `.chrononote-conflicts/`
  subdir, then reloads disk).
- **deleted on disk** → toast, drop the baseline; the tab keeps its
  content and the next save re-creates the file. No prompt either way.

While the conflict prompt is open the tab's debounced autosave is
frozen (`cancelScheduledSave`) so it can't overwrite the disk copy mid-
decision.

**Rust** (`storage.rs`, `lib.rs`): `sha2` dependency; `FileMetadata`
(`exists` / `contentHash` / `sizeBytes` / `modifiedMs`); `hash_bytes`;
new commands `get_file_metadata`, `read_note_with_metadata`,
`write_conflict_copy`; `write_note` now takes an optional `expectedHash`
compare-and-swap guard (rejects with a `conflict: note changed on disk`
prefix) and returns the `FileMetadata` of what it wrote. The
`.chrononote-conflicts/` dir and its timestamped files are invisible to
`list_note_files` / `read_all_notes` (both already filter by
`is_valid_note_filename`). 8 new `storage.rs` tests.

**Frontend**: new `drift.ts` (`checkActiveTabForDrift`, the three
`resolveConflict*` handlers, `sha256Hex` — same digest as Rust, so an
in-memory hash compares directly to a disk one). Per-tab clean-hash
baselines live in `stores.ts` (`markTabClean` / friends, a `Map` keyed by
tab id like the editor-view-state map), set by every note load
(`boot.ts` restore, `openOrCreateDatedFile`, `promoteScratchpad`) and
every successful save (`writeNoteAndInvalidateCache` captures the
returned hash). `boot.ts` `wireDriftDetection()` from `initApp` binds the
two triggers (`activeTabId` subscription + `onFocusChanged`). New
`ConflictModal.svelte`; `ModalKind` gains `"conflict"`; Escape is a
no-op on it (an explicit choice is required).

Covered by `tests/e2e/concurrency.spec.ts` (Case B, all three Case-C
buttons, deletion, the activate trigger) and five `controller.test.ts`
cases for the `checkActiveTabForDrift` state machine. The mock backend
computes real SHA-256 (`crypto.subtle`) so its metadata hashes match
both Rust and `drift.ts`.

**Post-review hardening of the check itself.** `checkActiveTabForDrift`
re-derives the tab, its baseline, and its content from the stores after
*every* `await` (via `driftTarget()`) rather than trusting a snapshot
taken before the first IPC — a keystroke landing during that window
could otherwise make Case B's silent reload discard it. Re-entrant calls
are coalesced into one follow-up run so a burst of tab switches still
checks whatever tab you land on. And `file_metadata_at` now only reports
`exists: false` for a genuine `ErrorKind::NotFound`; any other `fs::read`
failure (a sync client holding the file locked mid-write) propagates as
an error so the frontend simply retries on its next trigger instead of
announcing a phantom deletion.

---

## 95. Modal focus trap & focus restore (hardening §5.2)

**Status: implemented.** Hardening roadmap Phase 5 (the last), on
`refactor/foundation` (→ v0.5.0). Every modal already carried
`role="dialog"` + `aria-modal="true"` + `aria-label`; what was missing
was the actual keyboard containment.

New `src/lib/actions/focusTrap.ts`, `use:focusTrap` on all twelve
modals' `.modal-card`:

- **Trap** — while a modal is open, `Tab` / `Shift+Tab` cycle within its
  own controls and never reach the editor, a tab, or the top bar behind
  the overlay. If focus somehow starts outside the card (most modals
  don't `focus()` a control on mount), the first `Tab` pulls it in. A
  modal with no focusables swallows `Tab`. The listener is on `document`
  in the capture phase, not the card — a card-only listener never fires
  while focus is still on the editor.
- **Restore** — on close the action's `destroy()` returns focus to
  whatever held it when the modal opened (the editor, normally), falling
  back to `.cm-content` if that element is gone.

Nothing here touches Escape — App.svelte's global handlers still close
modals. 7 `focusTrap.test.ts` unit cases + `tests/e2e/modal-a11y.spec.ts`
(Tab stays inside Settings; closing returns focus to the editor).

---

## 96. App icon — concept A (checkbox + clock hands)

**Status: implemented.** The v0.5.0 identity change. The old icon was a
plain white clock on the accent-blue tile; the new one (concept A from
the three pitched in `docs/design/icon-proposals.html`, chosen for
0.5.0) sets clock hands *inside* the open-action checkbox glyph — the
action list and the passage of days in one mark, white-knocked-out on
the same accent blue. Master at `docs/design/icon-A-master.svg`;
`src-tauri/icons/{32x32,128x128,128x128@2x}.png` + `icon.ico` regenerated
via `npx tauri icon`. `tauri icon` also emits iOS/Android/Store variants
— gitignored, since ChronoNote ships Windows-only.

---

## 97. Corrupt-sidecar recovery + concurrent-write fix (test-coverage review)

**Status: implemented.** From a third external review (test coverage).
Two storage-layer robustness fixes + the tests that found the second one.

**Corrupt `config.json` / `.chrononote-session.json` → graceful
fallback.** A JSON sidecar that won't parse (a mid-write crash from
before atomic writes, disk rot, a botched hand-edit, a truncated
cloud-sync copy) used to propagate the `serde` error all the way to
`initApp()`, which then rejected — leaving the app stuck on "Loading
ChronoNote…" with no recovery path but deleting the file by hand. Now
`load_config_at` / `read_tab_session_at` rename the bad file aside as
`<name>.corrupt-<unix-ms>` (best-effort; the bytes stay for a
post-mortem) and fall back to a fresh default / a no-session bootstrap.
The quarantine name never matches `is_valid_note_filename`, so one
landing in the notes folder is invisible to every listing. App.svelte
also gained a `bootError` branch — a readable "ChronoNote couldn't
start" message instead of an endless spinner for the rarer case where a
core boot IPC just fails outright.

**Concurrent writes to one note no longer fail on Windows.** The new
`concurrent_writes_to_one_note_never_interleave_or_leave_litter` test
(6 threads hammering one file) surfaced a real bug in the §92 atomic
write: on Windows, `tempfile`'s `persist()` rename hits
`ERROR_ACCESS_DENIED` when the target is momentarily open — which
happens whenever ChronoNote fires two writes for the same note close
together (an autosave timer and an Action-Drawer edit; a `flushSave`
racing a pending `scheduleSave`; the §93 exit barrier flushing while a
debounced write is still queued). It showed up as random "Failed to save
note" toasts. Fix: a process-wide `WRITE_LOCK` mutex serializes every
`atomic_write` (writes are sub-millisecond and rare, so one global lock
beats per-path locking), plus a short retry loop around the rename for
genuinely *external* interference (an AV scanner / sync client holding
the file — `ERROR_ACCESS_DENIED` / `ERROR_SHARING_VIOLATION`, up to 8
tries with a linear backoff).

3 new `storage.rs` tests (corrupt config incl. empty + truncated,
corrupt session, concurrent writes) → 41 total; 1 new
`smoke.spec.ts` case (degraded boot shows a message). The mock backend
gained a `throwOnCommands` seed for testing failure paths.

Deliberately **not** done from that review: an integration-test dir
under `src-tauri/tests/` (the in-file `#[cfg(test)]` convention with
path-parameterized `_at` functions is the established pattern), a schema
version field (`#[serde(default)]` already covers additive changes; no
breaking migration exists), visual-regression pixel-diffing in a Docker
container (`visual.spec.ts` deliberately captures artifacts, not
assertions — §72/§73), and tauri-driver native E2E (real value, but it
needs a `windows-latest` CI job + flaky `msedgedriver`; the manual
per-release smoke tests cover the same ground for now). Rust→TS type
codegen (`ts-rs`) and compile-time mock parity are queued as follow-ups.

---

## 98. Rust→TS type codegen + compile-time mock parity (test-coverage review, follow-ups)

**Status: implemented.** The two items §97 explicitly queued. Both close
the same gap: the frontend's model of the Rust IPC surface was
hand-maintained in `src/lib/types.ts` and `src/lib/testing/mockBackend.ts`,
and nothing failed if it drifted from `src-tauri/`.

**`ts-rs` — the payload types are generated from Rust.** `AppConfig`,
`TabSession`, `FileMetadata`, `NoteWithMetadata` and the new `ColorMode`
enum carry `#[derive(TS)]`. A module-level `#[cfg(test)]`
`generate_typescript_bindings` in `storage.rs` writes
`src/lib/generated/tauri-types.ts` (deps-first so intra-file refs
resolve; `u64`/`i64` → `number`, not `bigint`, since our sizes and
mtimes are well inside a JS safe integer; ts-rs's inline `/* … */` doc
blocks are stripped for a one-line-per-type file). `types.ts` now
re-exports those and keeps only the frontend-only shapes (`NoteTab`,
`ActionSnapshotItem`, …). A new step in the `rust` CI job runs
`git diff --exit-code src/lib/generated/` after `cargo test` — a stale
checked-in file fails the build. `color_mode` also went from a bare
`String` on the Rust side (`"color"`/`"grayscale"` by convention) to a
real `#[serde(rename_all = "lowercase")]` enum; `set_color_mode` takes
`storage::ColorMode` now, so an unknown mode is rejected at the IPC
boundary instead of silently falling through to grayscale.

`ts-rs` is a dev/compile-time dependency only — the derive macro runs
during `cargo test`; nothing it ships is linked into the release binary.

**Compile-time mock parity.** New `src/lib/tauriCommands.ts` declares a
`TauriCommands` interface — one entry per `#[tauri::command]` in
`lib.rs`, mapping the command name to its `{ args, returns }` shape
(payloads sourced from the generated types). Both sides are now checked
against it:

- `tauriApi.ts`'s IPC wrapper is a generic `invoke<K extends TauriCommand>(cmd: K, args: CommandArgs<K>)` — a command name typo or a wrong arg shape is a `svelte-check` error, not a runtime `invoke` rejection.
- `mockBackend.ts`'s `dispatch` switch became a typed `CommandHandlers` map (`{ [K in keyof TauriCommands]: (args) => returns | Promise<returns> }`). A command that exists in Rust but has no mock handler — or a handler whose args/return don't match — fails `svelte-check`. Plugin calls (`plugin:*`, not real commands) stay in a separate loose switch.

No behaviour change for users. `svelte-check` (241 files), Vitest (195),
Playwright (95), and `cargo test` (42, +1 for the codegen test) all
green.

---

## 99. Configurable reading measure (0.6 UX pass — Phase 1)

**Status: implemented (v0.6.0).** First slice of
the 0.6 UX/UI work (`docs/design/ux-roadmap-0.6.md`, reconciled from three
external reviews). A new **"Limit line width for readability"** toggle in
Settings → Editor caps the editor's text column to a ~720px measure and
centres it, instead of spanning the full window.

Deliberately gated: the cap **only takes effect while word wrap is on**.
With wrapping off (the default), a narrower `.cm-content` would just push
wide tables and aligned columns into a horizontal scroll inside a smaller
box — the opposite of what wrap-off is for. So a user on defaults sees no
change; turning on word wrap now also gives a comfortable measure unless
they opt out.

New `AppConfig.readable_line_length: bool` (`#[serde(default = …)]` → `true`
for configs written before it existed) + `set_readable_line_length`
command; the generated TS binding, `TauriCommands` contract and mock
handler follow from §98's infrastructure. `EditorPane` applies it through a
CodeMirror `Compartment` (like §80's word-wrap), reconfigured live from the
`readableLineLength` store — no remount. 1 new Vitest case, 2 new
`settings.spec.ts` e2e cases (persist + reload; no-op with wrap off).

---

## 100. Three-zone status bar + ambient save state (0.6 UX pass — Phase 1)

**Status: implemented (v0.6.0).** The status bar
goes from two loosely-packed groups to a `1fr / auto / 1fr` grid:

- **Left** — `Ln N, Col C · N words · Open N Closed N Fwd N`. Cursor
  position and the spec's action counts stay; a live **word count** is
  new (`statusWordCount`, kept in sync by the same `boot.ts` subscription
  that already tracked the counts). Tabular figures so nothing jitters
  while typing.
- **Centre** — an **ambient autosave indicator** (`#stat-save`): a 6px
  dot + label, `data-state` = `saving` (amber, a real note has unflushed
  keystrokes or a write is in flight) → `saved` (green, "All changes
  saved") → `error` (red, "Save failed" — a toast still fires too). A
  scratchpad shows an honest "In memory only" instead, since it never
  touches disk. New `saveState` store driven by `persistence.ts`;
  distinct from the §94 per-tab drift baseline — this is only about
  *our* writes landing.
- **Right** — the app version (`v0.6.0`) and a `?` button that opens the
  shortcuts drawer (was a plain "[Ctrl+/] Shortcuts" text hint).

Toasts are untouched for now — folding the informational ones into the
centre slot is deferred to the Phase-1 visual pass (it ripples through
the e2e `toast()` helper). Final colours are placeholders until the
surface-palette decision (A/B/C) lands. Kept the `#stat-pos` /
`#stat-open|closed|forwarded` ids so existing e2e selectors still work.
2 new Vitest cases, 4 new `status-bar.spec.ts` e2e cases.

---

## 101. Focus always returns to the editor after a modal (0.6 UX pass — Phase 1)

**Status: implemented (v0.6.0).** Tightens §95's
focus-restore. It restored focus to *whatever* held it when the modal
opened — fine for the keyboard path (the editor), but a modal opened by
**clicking a top-bar button** left focus stranded on that button after
close, so the next keystroke did nothing until you clicked back into the
text.

`focusTrap`'s `destroy` now restores the pre-modal element only when it
was the editor (`.cm-editor` descendant), `<body>`, or still inside an
open `.overlay` (a chained modal hand-off); otherwise it focuses
`.cm-content` directly. CodeMirror keeps its own selection across the
focus loss, so the caret still lands exactly where it was — the reviews'
Task 8 without needing to serialise selection offsets (the editor isn't a
`<textarea>`). 1 extra `focusTrap.test.ts` case, 1 extra
`modal-a11y.spec.ts` case.

---

## 102. Surface elevation + retire the floating toast (0.6 UX pass — Phase 1)

**Status: implemented (v0.6.0).** Marien picked
**option B** from the surface study — keep ChronoNote's VS-Code charcoal
family, give it real depth.

**Four surface tiers** in `app.css`, replacing the old two:

| token | dark | role |
| --- | --- | --- |
| `--surface-canvas` | `#1e1e1e` | editor |
| `--surface-chrome` | `#252526` | top bar · tab strip · status bar |
| `--surface-overlay` | `#2d2d2e` | modals · popovers · drawers (was reusing chrome) |
| `--surface-raised` | `#37373b` | hovered rows · inputs · chips |

Borders split into `--edge-soft` (`rgba(255,255,255,.07)`, internal
divisions) and `--edge-strong` (`.13`, overlay/input outlines) — the old
opaque `#333` `--border` becomes an alias for the soft one. New
`--state-ok` / `--state-warn` / `--state-error` semantic tokens (not the
accent hue) now drive the §100 save dot. Light-theme values defined
alongside. The old flat names (`--bg`, `--tab-bg`, `--tab-active`,
`--border`) stay as aliases so no component rule had to be rewritten
wholesale — only the handful that genuinely wanted a different tier
(modal card → overlay, hovers → raised, inputs → raised + strong edge).

**The floating `#toast` is gone.** Transient messages ("Sections
imported", "No open actions in this note", the §94 drift notices) now
surface in the status bar's centre zone (`#stat-message`), pre-empting
the save-state readout while shown (still a 2.4s auto-clear via the
existing `showToast`). `Toast.svelte` deleted; `App.svelte` no longer
mounts it. `helpers.ts`'s `toast()` locator points at `#stat-message`,
so the 7 e2e assertions that used it keep working; 1 more updated
directly.

Visual change is deliberately subtle at rest — the depth reads when a
modal or (coming in Phase 2) a popover opens over the editor. `svelte-check`
(240 files, −1 for `Toast.svelte`), Vitest (199), Playwright (102),
`cargo test` (42) green.

---

## 103. 44px top bar + daily / scratchpad tab archetypes (0.6 UX pass — Phase 2)

**Status: implemented (v0.6.0).** The top bar
goes to a steady **44px** and tabs become two visibly different kinds:

- **Daily notes** — a small monochrome calendar icon (inline SVG,
  `currentColor`), the `YYYY-MM-DD` label, normal weight.
- **Scratchpads** — a draft-page icon, an *italic* label, and a 6px
  **amber dot** (`--state-warn`) between the label and the close button
  whenever the buffer has unsaved content (`content.trim() !== ""`). The
  old ` *` suffix is gone.

A 1.5px vertical **divider** (`--edge-strong`, 20px tall) separates the
daily-note group from the scratchpad group — rendered in `TopBar.svelte`
before the first tab whose `isScratchpad` flips true (they're already
sorted dated-then-scratchpad by `sortedTabsForDisplay`).

Tabs are now pill-topped (`border-radius: 6px 6px 0 0`, `inset` top
accent on the active one) with no inter-tab borders — hover raises them
to `--surface-raised`. Close buttons fade in on tab hover / focus / when
active (the VS Code pattern) and stay ≥24px hit targets; every top-bar
`.icon-btn` is now a ≥30px chip. Purely presentational — tab behaviour,
ordering, overflow scrolling and keyboard nav are untouched.

`helpers.ts` gained `tabLabels()` and `activeTabLabel()` now targets
`.tab-label` (tabs have multiple spans now); 4 specs updated, 1 new
`tab-archetypes.spec.ts`. Vitest (199), Playwright (103), `cargo test`
(42), `svelte-check` (240) green.

---

## 104. Anchored mini calendar popover (0.6 UX pass — Phase 2)

**Status: implemented (v0.6.0).** The date
picker stops being a screen-centred modal with a text-query result list
and becomes a compact **month-grid popover** anchored under the top-bar
📅 trigger (`[data-datepicker-trigger]`, measured on mount;
`position: fixed`, right-aligned, clamped to the viewport).

- **Month grid** — Monday-first, whole weeks, adjacent-month days greyed
  at the edges. New `date.ts` helpers: `monthGrid(year, month)` →
  `CalCell[]`, `addMonths`, `MONTH_NAMES` (11 Vitest cases).
- **Open-action dots** — a cell carries a `.has` dot when
  `<date>.txt` in the notes cache has `countActions().open > 0` (same
  signal the old picker's "N open actions" used; cache refreshed once on
  mount).
- **Type-to-jump kept** — a text field on top; `Enter` runs the existing
  `parseDateQuery` grammar (`today`, `-2`, `2026-09-05`, `12-25`) and
  commits. So the power-user path survives the redesign.
- **Keyboard** — arrows move a roving-`tabindex` focused day (crossing
  month boundaries re-pages the grid), `PageUp`/`PageDown` change month,
  `Enter` opens the focused day, a **Today** button re-centres. `Esc`
  and an outside `mousedown` close it; §101 then returns focus to the
  editor.
- Clicking any day → `commitDatePick` (unchanged: open/switch the tab,
  close the popover).

`DatePickerModal.svelte` rewritten in place (still `modal === "date"`,
still Ctrl+O / the 📅 button). The `datePickerOpenOnly` store and the
virtual-list plumbing it used are no longer imported — the dot replaces
the "Open Only" filter. `helpers.ts` gains `datePicker()`;
`navigation.spec.ts` rewritten (9 cases), `modal-a11y` + `visual`
updated. `svelte-check` (240), Vitest (204), Playwright (108),
`cargo test` (42) green.

---

## 105. Semantic colour-mode palette refresh (0.6 UX pass — Phase 3)

**Status: implemented (v0.6.0).** `color` mode's
glyph hues move to the reviews' semantic set (Marien's Q3 call — refresh
the existing mode, no new flag):

| state | was | now (dark) |
| --- | --- | --- |
| open / to-do | red `#ff6b6b` | cyan `#38bdf8` |
| done | green `#51cf66` | emerald `#10b981` |
| deferred | amber `#e5a50a` | violet `#a855f7` |
| won't-do | grey `#868e96` | slate `#7c8794` |
| follow-up / assignee | blue | cyan |
| emphasis (`! `) | yellow | amber `#f59e0b` — the one reserved warning hue |

Light-mode equivalents updated to match. **Grayscale mode is untouched.**
Chrome accent stays the option-B blue family; only the glyph tokens
changed. The Action Drawer / Section History / glyph-legend glyph columns
follow automatically (they read the same `--glyph-*` vars).

---

## 106. Click a glyph to cycle its state + Ctrl/Cmd+Enter (0.6 UX pass — Phase 3)

**Status: implemented (v0.6.0).**

- **Click a glyph** — the four action-state glyphs (a standalone `# v > x`
  or the inner symbol of a `=> <symbol>` consequence-action) now advance
  `# → v → > → x → #` on click. `InlineGlyphWidget` gained a `cyclable`
  flag; its `toDOM` adds a `mousedown` handler that `preventDefault`s
  (no cursor move / focus steal), resolves its own position with
  `view.posAtDOM`, and dispatches `cycleActionSymbol` on that line.
  `ignoreEvent()` returns true so CodeMirror doesn't also treat the click
  as a caret placement into the atomic range. The arrow, bullet and
  assignee glyphs are not cyclable. `.glyph-cyclable` gets a pointer
  cursor + a faint hover tint.
- **`Ctrl/Cmd+Enter`** — `Mod-Enter` in `EditorPane`'s keymap aliases the
  existing `Ctrl+Space` state cycle (the combo the reviews and most task
  apps use). Both stay.

Selection and undo/redo are preserved (a plain single CM transaction).
`ShortcutsModal` updated. 2 new `editor-tokens.spec.ts` cases.
`svelte-check` (240), Vitest (204), Playwright (110), `cargo test` (42)
green.

---

## 107. Unified command palette — Ctrl/Cmd+K (0.6 UX pass — Phase 4)

**Status: implemented (v0.6.0).** A fast-path
layer over everything that already has a shortcut and a drawer — nothing
here is the *only* way to reach a feature.

New `src/lib/commandPalette.ts` (in the `controller` facade) +
`CommandPaletteModal.svelte` + `modal` kind `commandPalette`, bound to
**Ctrl/Cmd+K** in `App.svelte`. Query prefixes route the results:

| prefix | shows |
| --- | --- |
| *(none)* | fuzzy-matched commands **+ open-tab titles** |
| `>` | application commands only (settings toggles, drawers, tab ops) |
| `!` or `#` | open-action lines across every daily note → jump to the line |
| `@` | the `parseDateQuery` grammar (`today`, `-2`, `2026-09-05`) + existing dated notes → open that note |
| `?` | hands off to the keyboard-shortcuts drawer |

Subsequence fuzzy matching; results carry a group header
(Commands / Settings / Help / Open tabs / Open actions / Dates). Arrow
keys + Enter, `Esc` / outside-click close (via the shared `focusTrap` /
`closeOnOutsideClick`), then §101 returns focus to the editor. The
`!`/`@` modes refresh the notes cache on demand; a `seq` guard drops
stale async result sets when you keep typing.

Reuses the `.modal-*` styles — no new chrome. `ShortcutsModal` gains the
`Ctrl+K` row. 6 new `command-palette.spec.ts` e2e cases. `svelte-check`
(242), Vitest (204), Playwright (116), `cargo test` (42) green.

---

## 108. Non-modal in-document find bar — Ctrl/Cmd+F (0.6 UX pass — Phase 5)

**Status: implemented (v0.6.0).** ChronoNote had
no in-document find at all (`Ctrl+Shift+F` is a *cross-tab results list*).
Now `Ctrl/Cmd+F` opens a **floating bar docked top-right of the editor** —
the editor stays fully scrollable and editable underneath, it's not a
modal.

- New dep `@codemirror/search` — used for `findNext`/`findPrevious`
  (wrap + scroll-into-view) and `SearchCursor` (counting). Its own panel
  is never opened.
- `FindBar.svelte` (rendered in `#editor-container` when the `findOpen`
  store is set): query input, live **"N of M"** (`findMatch` store),
  `‹`/`›`, `✕`. `Enter` / `Shift+Enter` = next / prev, `Esc` closes and
  clears — also from the global handler when focus has moved back to the
  editor.
- Match highlighting is a **custom compartment** highlighter in
  `EditorPane` (`@codemirror/search` only paints matches while its panel
  is open, which we don't use) — a `ViewPlugin` that marks
  case-insensitive `SearchCursor` hits across the visible ranges,
  swapped in as the query changes.
- The bar belongs to the editor instance: a tab switch (which remounts
  `EditorPane`) closes it and drops the query.
- `EditorApi` gained a `find` sub-object (`setQuery`/`next`/`prev`/
  `clear`); the two fake editor APIs in `controller.test.ts` updated.

`ShortcutsModal` + prod bundle (+31 kB for `@codemirror/search`). 4 new
`find-bar.spec.ts` e2e cases. `svelte-check` (244), Vitest (204),
Playwright (120), `cargo test` (42) green.

---

## 109. Section History gets a side-by-side preview (0.6 UX pass — Phase 5)

**Status: implemented (v0.6.0).** The Section
History drawer (`Ctrl+Shift+H`) — which aggregates a recurring section's
action lines across every dated note — used to let you `Shift+Enter` an
entry into the current note blind. It now has a **right-hand preview
column** (card widened to 880px) that updates as you arrow/hover through
the list:

- **From `<file>`** — the entry in its source context (two lines either
  side; the matched line bolded).
- **Shift+Enter inserts** — exactly the text that will be inserted, with
  the `> ` → `# ` "deferred becomes a fresh open action" rewrite already
  applied, plus a one-line note when that rewrite happens.
- **Target** — `→ at your cursor in <active note> (line N)`.

Pure presentation over the existing `importHistoricalItem` flow — reads
`allNotesCache` (already populated) and `editorApi.getCursorLineIdx()`.
`HistoryModal.svelte` + `app.css` (`.history-body` / `.history-preview` /
`.hp-*`). 1 new `search-and-history.spec.ts` case; 3 list assertions
scoped to `.modal-list` now that entry text also appears in the preview.
`svelte-check` (244), Vitest (204), Playwright (121), `cargo test` (42)
green.

---

**The 0.6 UX pass (§99–§110) shipped as v0.6.0.** Deferred within the
pass: the Unicode → SVG glyph-shape redesign (§105 note).

---

## 110. 0.6 review fixes + first round of visual feedback

**Status: implemented (v0.6.0).** An 8-angle
`/code-review` of the branch, plus Marien's notes from a live run of the
dev build.

### Review findings fixed (all introduced §99–§109)

- **DatePicker keyboard nav drifted in non-UTC timezones** — `new
  Date("2026-09-10")` parses as UTC midnight, disagreeing with the
  local-time grid. New `parseISODateLocal` / `addDaysISO` in `date.ts`
  (tested); the popover routes every `Date` through them.
- **`Ctrl+F` / `Ctrl+K` fired while a modal was open** — mounted the find
  bar invisibly behind the overlay. Both now no-op unless `modal ===
  "none"`; a reactive guard also closes the bar if a modal opens over it.
- **Save state masked a failure / stuck on "Saving…"** — `saveState` is
  now *derived per active tab* (`recomputeSaveState()` off
  `pendingSaveTabIds` / `inFlightFilenames` / `failedFilenames`), so a
  background write can't stomp it, a real failure isn't hidden by a
  concurrent success, and a §94 conflict cancelling the pending write
  clears it. 4 new Vitest cases.
- **Clicking the 📅 trigger to close the popover re-opened it** —
  `onOutsideMousedown` now ignores the trigger element.
- **Command palette ran a stale command** when you typed a `!`/`@`
  prefix and hit Enter before the async scan resolved — `commitFromInput`
  refuses to fire against a superseded query; the `!`/`#`/`@` modes are
  debounced 120 ms, plain filtering stays instant.
- **Find "N of M" showed "– of M"** whenever the caret wasn't exactly on
  a match, and went stale on clicks — `current` is now the match at/before
  the caret, recomputed on every selection change while the bar is open.
- **Section History import gave no visible confirmation** — its toast was
  behind the modal overlay. `#status-bar` now sits at `z-index: 250`
  (above `.overlay` at 200), so transient messages show with any drawer
  open. The `> `→`# ` rewrite is deduped into `historyInsertText()`.
- Deleted the dead `datePickerOpenOnly` store; `countWords` moved to
  `tokens.ts` as a non-allocating single-pass counter (+ test).

### Feedback

- **Combined help drawer** — the `?` (and `Ctrl+/` / `Ctrl+Shift+/`) now
  open one **Shortcuts & Symbols** drawer; `GlyphLegendModal` is deleted
  and its content folded into `ShortcutsModal` under a group header.
- **Tab / editor connection** — the tab-strip scrollbar (which ate the
  gap) is hidden; tabs are bottom-anchored so the active one meets the
  editor canvas.
- **Quieter save state** — the status-bar centre readout is gone. The
  active tab shows a small dot only when it matters: **red** for a failed
  save, **grey** for a memory-only scratchpad (was an amber "unsaved"
  dot). Nothing during a normal autosave.
- **Tab labels** drop the `.txt` — dated tabs show just `2026-09-10`.
- **Middle-click a tab to close it.**
- **The calendar follows what you type** — the jump input has focus on
  open (like the other drawers), and as you type a date or `YYYY-MM` the
  grid jumps to it and marks the target; `↓`/`Tab` hands off into the
  grid; a day you've written a note on renders at full strength vs a
  muted plain date.
- **"Limit line width for readability" now owns word-wrap** — turning it
  on force-enables wrap and disables the wrap toggle; it's a single
  prose-reading mode. **Default is now off** (`AppConfig.readable_line_length`
  → `#[serde(default)]` = false) — the monospace grid stays the
  out-of-box editor.

`svelte-check` (243), Vitest (212), Playwright (124), `cargo test` (42)
all green. `visual.spec.ts` / `drawers.spec.ts` / `navigation.spec.ts` /
`tab-archetypes.spec.ts` / `status-bar.spec.ts` / `settings.spec.ts`
updated; `helpers.ts` gains `dateLabel()`.

---

## 111. "Legacy" glyph palette — the pre-0.6 colours as a third option

**Status: implemented (v0.6.1).** Marien preferred the original
action colouring — red open, amber deferred, green done — over the §105
semantic palette (cyan/emerald/violet/slate), and asked for it back as an
opt-in rather than a replacement.

- `ColorMode` (Rust enum, `src-tauri/src/storage.rs`) gains a third
  variant `Legacy`, serialized as `"legacy"`. ts-rs regenerates
  `src/lib/generated/tauri-types.ts` → `"color" | "grayscale" | "legacy"`.
  No migration: an existing config is untouched, and the two prior values
  still mean what they did.
- `src/app.css` gains a `[data-color-mode="legacy"]` block (plus its
  light-scheme variant) that is a **verbatim restore of the pre-0.6
  `[data-color-mode="color"]` block** — the same `--glyph-*` tokens every
  mode drives, just the old hues: `--glyph-open-color` `#ff6b6b`,
  `--glyph-progress-color` (`> `) `#e5a50a`, `--glyph-done-color`
  `#51cf66`, won't-do `#868e96`, `=>`/assignee `#0098ff`, `! ` emphasis
  `#ffd43b`, and the old VS-Code-blue `#007acc` chrome accent. The
  `filter: none` icon rule now also matches `legacy` (it's a hued mode).
- Settings → Appearance is now a three-way (Color / Grayscale / Legacy)
  with a one-line hint on what Legacy is.
- The `Ctrl+K` "switch glyphs" command cycles
  grayscale → color → legacy → … instead of toggling two.

Nothing else special-cased — `setColorMode`, the store, `boot.ts`
`applyColorModeToDom`, and the mock backend were already typed on
`ColorMode` and widened for free.

New tests: `cargo test` `color_mode_legacy_round_trips_through_json` (43);
`controller.test.ts` legacy `setColorMode` case (213 Vitest);
`settings.spec.ts` + `command-palette.spec.ts` + `visual.spec.ts` legacy
cases (125 Playwright). `svelte-check` 243, `npm run build` green.

---

## 112. Section History: strip a leading action symbol even when the line also has a mid-line `=> ` (#28)

**Status: implemented (pending release).** #28 reported that the Section
History drawer "still shows the symbols after the glyphs" — the exact
class of bug §45/§70 already fixed twice, resurfacing for a line shape
those fixes didn't cover: a line with **both** a leading action symbol
**and** a `=> ` follow-up further along it, e.g. `# chase the vendor =>
get a quote`.

**Root cause:** `stripLeadingToken()` (`tokens.ts`) tried its three
`=> `-based branches before the plain-leading-symbol branch. A line like
the above matched the `followUp` branch (`/^(.*)=>\s(.*)$/`), which
returned `"chase the vendor get quote"` **with the `#` still on it** and
never reached the branch that strips a leading symbol. The row then
rendered `☐ # chase the vendor get quote` — the glyph plus the raw
character it already stands for.

**Fix:** strip a leading `[#vx>] ` first and unconditionally (it's always
at the true start of the line), then run the `=> ` handling on the
result. One line added, the old dedicated plain-symbol branch removed as
now-redundant. The Action Drawer shares the helper and gets the same fix.
Three new `tokens.test.ts` cases for the both-tokens-on-one-line shape
(60 tests in that file).

---

## 113. Section History: a verbatim "last occurrence" panel (#27)

**Status: implemented (pending release).** #27 — "I want to at a glance
see all the topics/notes discussed during the most recent occurrence
before today, to refresh my memory." The drawer's list is a
glyph-stripped, deduped, all-dates aggregate of **action lines** only
(§34/§37) — good for re-adopting a past task, useless for "what did we
actually cover last time." §109's preview shows ±2 lines around one
selected entry, not the whole meeting.

**What was added:** a collapsible **Last occurrence · `<date>`** panel
above the aggregate list, showing that section's body from its most
recent prior occurrence **verbatim** — every line as it sits on disk,
tokens and all, from just after the setext underline to just before the
next section header (trailing blanks trimmed). Ligatures are disabled in
this panel (`font-variant-ligatures: none`) so `=>` reads as `=>`, not
Cascadia Code's `⇒` — the point is fidelity to the file. An **Open file**
button jumps to that occurrence (cursor on the section's first body
line) and closes the drawer.

**"Most recent before"** = the newest note whose filename sorts before
the note the drawer was opened from (string compare orders
`YYYY-MM-DD.txt` chronologically); when opened from a scratchpad, the
newest note overall that isn't the active one. `null` (panel hidden) when
there's no earlier occurrence with any content.

- `history.ts`: `findLastSectionOccurrence()` (exported, unit-tested) +
  its `extractSectionBody()` helper; `jumpToLastOccurrence()`.
  `openMeetingHistory()` sets the new `historyLastOccurrence` store
  alongside `historyItems`.
- `types.ts`: `LastSectionOccurrence`. `stores.ts`:
  `historyLastOccurrence`.
- `HistoryModal.svelte`: the `<details class="history-last">` panel,
  wrapped with the list in a new `.history-main` column so the
  right-hand §109 preview column is unaffected. `app.css`:
  `.history-main` / `.history-last` / `.hl-*`.

Pure frontend — no Rust, no IPC, no mock-backend change. New tests:
`controller.test.ts` `findLastSectionOccurrence` (3 cases, 95 Vitest in
that file / 217 total); `search-and-history.spec.ts` verbatim-panel +
Open-file case (127 Playwright). `svelte-check` 243, all suites green.

---

## 114. Section History "Previous occurrence" pane — glyphs, line cap, rename (#33)

**Status: implemented (pending release).** Three refinements to the pane
added in §113 (v0.6.2), from #33:

- **Renamed "Last occurrence" → "Previous occurrence".** It shows the
  occurrence before the *open tab's* date, not necessarily "today" — the
  old name implied the latter. The store / type / helpers renamed to
  match (`historyPreviousOccurrence`, `PreviousSectionOccurrence`,
  `findPreviousSectionOccurrence`, `jumpToPreviousOccurrence`).
- **Glyph-rendered, not verbatim.** §113 deliberately showed the section
  body literally (raw tokens, ligatures off). #33 asked for the
  actionable glyphs instead, so a new pure `parseGlyphLine()`
  (`src/lib/editor/glyphLine.ts`, unit-tested) turns each line into the
  same token → glyph parts the editor's `glyphs.ts` produces — `# ` → ☐,
  `- ` → •, `=> @name` → ➔ + assignee badge, `! ` → bold, etc. — but as
  plain spans for a read-only viewer. It also applies the #35/#36 inline
  highlights.
- **Capped to the first 5 lines** with a "Show all N lines" / "Show
  fewer" toggle, so a long section can't crowd out the aggregate list.
  The whole-pane `<details>` collapse is gone (the line cap replaces it).

`HistoryModal.svelte` markup + `app.css` (`.history-prev` / `.po-*`,
replacing `.history-last` / `.hl-*`). New `glyphLine.test.ts` (9 cases);
`search-and-history.spec.ts` updated + a line-cap case.

---

## 115. Action-state behaviour: hover preview + two Enter fixes (#34)

**Status: implemented (pending release).** From #34:

- **Hover previews the next state.** A cyclable action glyph (`InlineGlyphWidget`
  in `glyphs.ts`) now morphs to the *next* state's glyph on `mouseenter`
  — dashed underline + reduced opacity (`.glyph-cyclable-preview`) so it
  reads as provisional — and reverts on `mouseleave`. Click still
  commits, exactly as before. The widget carries its raw symbol now so it
  can compute the next one.
- **🐛 Enter before the glyph no longer duplicates the symbol.** Pressing
  Enter with the caret at column 0 of `# a task` used to insert `\n# `
  there, producing a blank line then `# # a task`. `bulletContinuation()`
  now detects a caret at or before the leading token (bullet, action, or
  `=> `) and inserts a plain newline instead.
- **Enter on a `=> ` follow-up line continues it.** `actionLineEnter()`
  (`tokens.ts`) gained a branch: a leading `=> ` line (plain, `=> @name`,
  or `=> #`) continues as a fresh `=> # ` — a follow-up that is itself an
  open action, so a "led to → led to" chain keeps its thread. An empty
  `=> ` / `=> # ` line exits.

New: 4 `tokens.test.ts` cases, 3 `editor-tokens.spec.ts` cases.

---

## 116. `@name` highlighted anywhere on a delegation line (#35)

**Status: implemented (pending release).** The assignee badge used to
apply only to `@name` immediately after a `=> ` arrow. #35: the person
can be named anywhere on the line ("`=> ask @dana, cc @sam`"). `glyphs.ts`'s
`renderMatcher` gained an `@\w+` alternative that badges the name (a
`Decoration.mark`, still live editable text) when the line also contains a
`=> ` — a bare `@name` on a non-delegation line stays plain. `parseGlyphLine()`
does the same for the Previous-occurrence pane. `editor-tokens.spec.ts` +
`glyphLine.test.ts` cases.

---

## 117. `(topic)` tags on action lines (#36)

**Status: implemented (pending release).** #36: `(word)` on an action
line — used to group actions by subject — is now highlighted, styled like
the `@name` badge but outlined + muted + italic (`.glyph-topic`, chrome
tokens only, so no new per-colour-mode variables). Scoped to action-like
lines (a leading `# `/`v `/`> `/`x ` or any `=> `) via a shared
`isActionLikeLine()` in `tokens.ts`, so ordinary parentheticals in prose
are untouched. `glyphs.ts` `renderMatcher` + `parseGlyphLine()`;
`editor-tokens.spec.ts` + `glyphLine.test.ts` + `tokens.test.ts` cases.

---

## 118. Selection size in the status bar (#37)

**Status: implemented (pending release).** #37: while text is selected,
the status-bar left zone shows how much — `"{chars} selected"`, or
`"{lines} lines, {chars} selected"` when the selection spans more than
one document line. Multi-cursor selections sum their characters. New
`statusSelection` store, set from `EditorPane`'s update listener
(`selectionSet`), cleared on tab switch / editor teardown. `StatusBar.svelte`
renders `#stat-selection`. `status-bar.spec.ts` case.

---

## 119. Status bar: lines selected, not characters (#38)

**Status: implemented (pending release).** #38 — the §118 selection
readout (`"N selected"` / `"N lines, M selected"`) should show **only the
line count**. Now `"{n} line{s} selected"` whenever a selection is
non-empty (`1 line selected` for an in-line selection). `statusSelection`
dropped its `chars` field; `StatusBar.svelte` + `EditorPane` follow.
`status-bar.spec.ts` updated.

---

## 120. `(topic)` tags only right after the action symbol (#39)

**Status: implemented (pending release).** #39 tightens §117: a `(topic)`
tag is highlighted **only when it sits immediately after the action
symbol** — a leading `# `/`v `/`> `/`x `, or a `=> <symbol> `
consequence-action (`# (billing) chase it`, `Talked to Ana => # (q3)
follow up`). `(word)` anywhere else on the line, or in prose, is ordinary
text again. New `leadingTopicTag(line)` in `tokens.ts` (returns the tag's
char range, or `null`) replaces the old "anywhere on an action-like line"
rule; `glyphs.ts` and `glyphLine.ts` both gate on it. `isActionLikeLine`
is no longer used for topics (still used for #35). New `tokens.test.ts` +
`glyphLine.test.ts` cases; `editor-tokens.spec.ts` updated.

---

## 121. `.po-body` scrollbar matches the rest of the app (#40)

**Status: implemented (pending release).** #40 — the "Previous
occurrence" pane's scroll area (visible once "Show all N lines" is
ticked) used the browser-default scrollbar. Added `.po-body` to the
shared `.cm-scroller` / `.modal-list` / `.import-textarea` scrollbar
rules in `app.css` (thin, `--border` thumb, transparent track).

---

## 122. Section History: one row per action, follow-up text only (#41)

**Status: implemented (pending release).** A batch of Section History
list changes from #41:

- **A `HistoryItem` now carries an `action`** — the single action it
  represents — derived by a new `historyActionsForLine()` in `history.ts`:
  - a leading `# `/`v `/`> `/`x ` contributes that action, its text taken
    **up to the first ` => `**;
  - the **last** `=> ` on the line contributes its follow-up (`=> <symbol>
    text` → the inner `<symbol> text`; a plain `=> text` / `=> @name text`
    → `=> text`); earlier `=> `s are ignored.
  - So `# do X => # do Y` → **two** rows (`# do X`, `# do Y`);
    `a => b => # c` → one (`# c`); `Talked to Sam => # follow up` → one
    (`# follow up`, no "Talked to Sam" prefix).
- **List rows render via `parseGlyphLine(it.action)`** — glyphs, `@name`
  badges, and `(topic)` pills, same as the Previous-occurrence pane
  (replaces the old `glyphFor` + `stripLeadingToken` pair). `.modal-item-main`
  gets a `.history-item-line` variant (plain inline flow, no flex gap).
- **Shift+Enter / the preview's "inserts" box now use `it.action`**, not
  the whole source line — `historyInsertText` / `importHistoricalItem`
  operate on the action.
- **The "From" context preview and the Previous-occurrence pane still show
  complete source lines** — unchanged (`selectedItem.lineIdx` +
  `allNotesCache`).
- **Keyboard nav keeps the date header visible** when you arrow up to the
  first item of a group (`scrollSelectedIntoView` targets the preceding
  header row).

New: `historyActionsForLine` (5 `controller.test.ts` cases) + assertions
in the `openMeetingHistory` tests; `search-and-history.spec.ts` #41 case.
`HistoryModal.svelte` drops the now-unused `glyphFor` /
`innermostActionSymbol` / `stripLeadingToken` imports.

---

## 123. Delegated `@name` / topic badges were widening the line (#42)

**Status: implemented (pending release).** #42 — a `=> @name` line
rendered longer than its raw text, and `@name` plus everything after it
no longer lined up with the same column on an un-glyphed line. Cause:
`.glyph-assignee`'s `padding: 0 4px` (and `.glyph-topic`'s border +
padding) added real horizontal width to a live-text span sitting in a
monospace grid — the `➔`/`☐` widgets are fixed-width and were fine, but
the badges weren't.

**Fix** (`app.css`): the badge inset is now *drawn but not spent* — a
matching negative margin cancels it. `.glyph-assignee` →
`padding: 0 3px; margin: 0 -3px`; `.glyph-topic` →
`padding: 0 2px; margin: 0 -3px` (2px inset + 1px border). The pill still
looks the same; text after it sits exactly where it would with no glyph,
and a delegated line is the same length as its plain text. New
`glyph-layout.spec.ts` case measuring the column of text after each badge
against its raw-text twin.

---

## 124. `=>` Enter continuation: no action symbol on a plain follow-up

**Status: implemented, released in v0.6.6.** Refines §115 (#34). That
change made `Enter` on *any* leading `=> ` line continue as `=> # ` — a
fresh open action. Feedback (Marien): a **plain** `=> ` follow-up (or a
`=> @name` delegation) has no action of its own, so its continuation
shouldn't sprout a `# ` either.

Now `actionLineEnter()` (`tokens.ts`) checks whether the current line
carries a consequence-action symbol (`=> # `/`=> v `/`=> > `/`=> x `):

- `=> some note` + Enter → `=> ` (plain follow-up continues, no symbol)
- `=> @dana owns it` + Enter → `=> `
- `=> # ship it` + Enter → `=> # ` (consequence-action → fresh open one,
  unchanged — tasks start open)
- empty `=> ` / `=> #` still exits.

`tokens.test.ts` + `editor-tokens.spec.ts` cases updated / split.

---

## 125. `@name` may contain a hyphen

**Status: implemented, released in v0.6.6.** Feedback (Marien): a delegate
name like `@jean-luc` should be recognised. Every `@name` pattern was
`@\w+`, which stopped at the hyphen — so `@jean-luc` badged only as
`@jean`. Widened to `@[\w-]+` in `glyphs.ts` (both the `=> @name` and the
bare-`@name` alternatives, #35), `glyphLine.ts`, `stripLeadingToken` /
the Section-History dedup key, and the dataset stats helper.
`glyphLine.test.ts` / `tokens.test.ts` / `editor-tokens.spec.ts` cases.

---

## 126. `(@name)` is recognised as a delegate

**Status: implemented, released in v0.6.6.** Feedback (Marien): the
assignee can be written parenthesised, `(@name)`. Without this, `(@dana)`
matched the `(topic)` pattern instead (and, right after an action symbol,
rendered as a topic pill). Now:

- `glyphs.ts` gains a `\(@[\w-]+\)` alternative *before* the generic
  `(word)` one; the `@name` inside is badged (`.glyph-assignee`), the
  parens stay plain, on any action-like line.
- `leadingTopicTag()` (`tokens.ts`) excludes `(@…)` via a negative
  lookahead, so `# (@dana) …` is a delegate, not a topic.
- `glyphLine.ts` mirrors both for the read-only viewers.

`glyphLine.test.ts` / `tokens.test.ts` / `editor-tokens.spec.ts` cases.

---

## 127. The 0.7 maturity pass: icon set + UX/UI consistency review

**Status: implemented, released in v0.7.0.** Marien: "the next version
needs to be about maturing the application." Planned in
`docs/design/maturity-0.7-roadmap.md` (a full UX/UI review, findings
A–L) and `docs/design/icon-system-0.7.html` (three icon-set directions);
Set A ("Ruled") and "ship the consistency fixes + icon set together"
were both picked 2026-09-11. This section is the whole pass — findings
A–H, J, K.

**A — one icon set, no more emoji.** The top bar, every modal header, and
the small chrome marks (find-bar / date-picker chevrons, the tab close
`×`) used to be emoji (📅 📋 🕒 🔎 📥 ⬆ ⚙ ℹ️ ⌘ ⚠ ⌨) — full-colour, and
themed only via a `filter: grayscale(1)` / `filter: none` split that let
`color` mode's emoji fight the §105 semantic glyph palette. Replaced with
one monoline SVG set (`src/lib/icons/` — `Icon.svelte` + `paths.ts`, 24×24
grid, ~1.75 stroke, `stroke: currentColor`), drawn from the app's own
vocabulary (the section rule, the dated page, the `☐` action box, the `»`
forward mark) rather than a generic icon-font pick. A modal header reuses
the exact same icon as the top-bar action that opens it. Removes three
emoji-only CSS workarounds: the `filter` split, the empty
`<span class="icon-glyph">` wrapper (§73), and `.icon-label { top: 1px }`.
Two new icons (`update`, `calendar-import`) are drawn in now, unused
until the 0.7.x / 0.8.0 features land. The app (OS) icon is unchanged for
now — `icon-system-0.7.html` documents the eventual replacement, a static
asset regen is its own step.

**B — result rows glyph-render consistently.** Cross-Tab Search used to
show the *raw* line (`# `/`=> ` and all) with a `<mark>` highlight —
the only one of the three result drawers not glyph-rendering its rows.
New `renderResultLine()` (`src/lib/ui/resultRow.ts`) layers the query
highlight on top of `parseGlyphLine()`'s output instead, so a search hit
now reads `☐ chase the vendor` like the Action Drawer and Section History
do. The Action Drawer's own glyph column dropped its private
`--glyph-*` inline-style duplicate of the colour map in favour of the
newly-exported `glyphForSymbol()` (`glyphLine.ts`) — one map, not two
kept in sync by hand.

**C — one group-header format.** `2026-09-07.TXT (8)`, `2026-09-07.TXT (2
MATCHES)`, and `📅 2026-09-07 (1)` (Action Drawer / Search / History
respectively — the first two uppercased via the shared CSS, `.txt` kept)
collapse to one shared `groupHeaderLabel()` (`src/lib/ui/listFormat.ts`):
`2026-09-07  ·  8`. No emoji, no `.txt`, one shape.

**D — a real segmented control.** `Open Tabs` / `All Files` and `Color` /
`Grayscale` / `Legacy` used to be independent `.icon-btn.active` buttons
sitting side by side with no shared edge — a scope/mode choice rendered
the same as the unrelated `.toggle-switch` on/off control right next to
it. New `Segmented.svelte` (`role="radiogroup"`, one bordered container,
hairline dividers, filled selected segment) replaces both, and is reused
by finding K's new editor-width control below. Rule going forward:
**switch = on/off, segmented = pick-one-of-N.**

**E — the Shortcuts & Symbols drawer no longer clips itself.**
`.modal-item-main`'s `nowrap` + ellipsis (right for a scannable result
list) was truncating this drawer's own reference text mid-sentence
("open → done → deferred → won'"). New `.shortcuts-list` override lets
rows wrap.

**F — a modal's title bar is a title, not a fake search field.** History's
"Section History: …" heading was a `readonly` `<input>` solely so it
could hold focus for arrow-key capture. Now a plain `.modal-title`
heading (shared by Settings/About/Safety/Conflict/Unsaved too, replacing
each one's own inline `font-weight: bold`); keyboard focus for History's
arrow-key nav moves to the list itself (a real `role="listbox"`, already
the right target). Dialog footer "primary" actions (Close Anyway, Discard
& Quit, Keep my version) drop their inline `style="background: var(--text)…"`
for a shared `.btn-primary`, layered on `.icon-btn`.

**G — one empty-state style, one footer separator.** New `.modal-empty`
(centred, muted) replaces History's inline-styled one-off and Search's
previously-missing empty state (Action Drawer and the command palette
gained one too). Footer kbd hints were `·`, `|`, and `&nbsp;|&nbsp;`
across different drawers — all `·` now.

**H — naming.** The Action Drawer is "Actions" everywhere a user reads it
(top-bar tooltip, modal `aria-label`, the command palette, the Shortcuts
drawer) — it was "My Actions" in one place and "Action drawer" in others.
Section History was already consistent. No code-symbol renames (`actions.ts`,
`openActionDrawer`, `.history-*` etc. are unchanged) — user-facing strings
only.

**J — the command-palette legend stays visible.** The `>`/`!`/`@`/`?`
prefix legend used to live only in placeholder text, gone after the first
keystroke. Now a persistent `.palette-legend` strip under the input;
placeholder shortened to "Type a command…".

**K — one editor-width control.** `Word wrap` and `Limit line width for
readability` were two toggles, the second force-enabling *and disabling*
the first — a checked-and-greyed-out switch. Replaced with one 3-way
`Segmented`: **Full** (no wrap) / **Wrap** / **Reading column**. No config
or Rust change — still exactly `word_wrap` + `readable_line_length`
underneath (Full = both off, Wrap = `word_wrap` only, Reading column =
both), just one control instead of two coupled ones.

**I** (status-bar `·` separators between Open/Closed/Forwarded, and
spelling out "Forwarded") **and L** (the date-picker stays the one
anchored, non-modal surface — a deliberate hold, not a fix) are folded in
here too. Modal-width tokens (part of finding F's original writeup) were
scoped out: the six modals in play use five different widths for reasons
that don't collapse cleanly into three named sizes without an arbitrary
resize, so it's deferred rather than forced.

New: `src/lib/icons/` (`Icon.svelte`, `paths.ts`), `src/lib/ui/resultRow.ts`
(+ `.test.ts`), `src/lib/ui/listFormat.ts` (+ `.test.ts`),
`src/lib/components/Segmented.svelte`, `tests/e2e/icon-system.spec.ts`.
Updated: `TopBar.svelte`, `FindBar.svelte`, every modal, `StatusBar.svelte`,
`commandPalette.ts`, `app.css`. `settings.spec.ts` / `word-wrap.spec.ts` /
`search-and-history.spec.ts` / `action-drawer.spec.ts` /
`tab-archetypes.spec.ts` / `visual.spec.ts` updated for the new markup and
roles. Pure frontend — no Rust/IPC/storage change, `cargo test` unchanged
at 43. `svelte-check` 252 files 0 errors, Vitest 252 (+8), Playwright 139
(+1).

---

## 128. GitHub-releases update check

**Status: implemented, released in v0.7.1.** The second phase of the 0.7
"maturing the application" plan (`docs/design/maturity-0.7-roadmap.md`,
§Feature 3.1) — check github.com for a newer release, let the user
download and install it. Never silent about the *action*: checking can
run automatically, but a download only ever starts from an explicit
click.

**Plugins, not a hand-rolled downloader.** `tauri-plugin-updater` polls a
`latest.json` manifest and verifies its minisign signature before
installing; `tauri-plugin-process` relaunches where install doesn't
already exit the app. JS side: `@tauri-apps/plugin-updater` /
`@tauri-apps/plugin-process`. New Rust deps, new `updater:default` +
`process:allow-restart` capabilities.

**Config.** `AppConfig.auto_check_updates: bool`, `#[serde(default =
"default_true")]` — **on by default**, unlike every other boolean flag in
this file so far (`word_wrap`, `readable_line_length` all default off) —
a deliberate call for this one, disclosed via the Settings toggle sitting
right next to it. New `set_auto_check_updates` command, mirroring the
existing setters.

**Frontend.** `src/lib/updates.ts` — `checkForUpdates()` (the shared
"run a check and update the stores" path), `checkForUpdatesOnLaunch()`
(same, plus a quiet, auto-dismissing status-bar message when it finds
something — "no update" and a failed check both stay silent),
`downloadAndInstallUpdate()` (tracks progress from the plugin's own
`Channel` events), `restartToFinishUpdate()`. New stores:
`autoCheckUpdates`, `updateStatus` (`idle` / `checking` / `upToDate` /
`available` / `downloading` / `ready` / `error`), `updateAvailableVersion`,
`updateReleaseNotes`, `updateDownloadProgress`, `updateErrorMessage`.
`boot.ts`'s `initApp()` fires `checkForUpdatesOnLaunch()` when the config
flag is on, non-blocking.

**UI.** About drawer grows an "Updates" section covering every state
(checking / available + What's-changed + Download & install / downloading
with a byte counter / ready + Restart now / error + Try again). Settings
grows an "Updates" section: the on/off toggle + a "Check now" button.
Command palette gained a "Check for updates" entry (opens About, kicks
off a check). New `update` icon (`src/lib/icons/paths.ts`, drawn in back
in §127, unused until now) — a down-arrow into a tray.

**Windows install behaviour.** `downloadAndInstall()` exits the app to
run the installer and (by default, `restartAfterInstall: true`)
relaunches it automatically — so `downloadAndInstallUpdate()` may simply
never resolve on a real Windows install. The `"ready"` / "Restart now"
UI only matters for the case that *doesn't* self-relaunch. `installMode:
"passive"` in `tauri.conf.json` avoids the fully-silent installer mode.

**Release-workflow change (the real cost of this feature).** A one-time
minisign keypair was generated (`npx tauri signer generate`), the
*public* half embedded in `tauri.conf.json`
(`plugins.updater.pubkey`), the *private* half + its password kept in
two new gitignored `*.local` files in `src-tauri/` — see
`CLAUDE.local.md` for exactly which files and where they must be backed
up (losing them means future releases can't be signed). `bundle.
createUpdaterArtifacts: true` now makes every `npm run tauri build`
require `TAURI_SIGNING_PRIVATE_KEY(_PATH)` / `_PASSWORD` in the
environment, or the build fails outright — a deliberate fail-closed
choice over silently shipping an unsigned/unupdatable installer.
`endpoints` points at
`https://github.com/marien/ChronoNote/releases/latest/download/latest.json`,
so every future release must attach a `latest.json` (version, pub_date,
the nsis installer's URL + its `.sig` contents) alongside the installers.

**The updater can't be verified until there's a signed release to update
*from*.** v0.7.1 ships it "armed" — the *next* release after this one is
the first the update path can actually be exercised against end-to-end.

**Mock.** `mockBackend.ts` gained `plugin:updater|check` /
`plugin:updater|download_and_install` / `plugin:resources|close` /
`plugin:process|restart` handlers. `MockSeed.updateCheck` (`"none"` |
`"available"`) + `updateCheckVersion` drive the happy path; a failed
check or install is seeded like any other command failure —
`throwOnCommands: ["plugin:updater|check"]` — one mechanism for every
"this command fails" case, nothing update-specific needed. Since
`check()`'s args pass straight through with no serialization under the
mock (same JS runtime), `args.onEvent` in the mock's
`download_and_install` handler is the caller's own live `Channel`
instance — calling `.onmessage(...)` on it drives the real progress
callback directly, no `transformCallback` plumbing needed.

New: `src/lib/updates.ts` (+ `.test.ts`), `tests/e2e/update-check.spec.ts`.
Updated: `storage.rs` (no new `#[test]` fns — extended two existing
config-round-trip tests with `auto_check_updates` assertions instead, so
43 stays 43), `lib.rs`, `capabilities/default.json`, `tauri.conf.json`,
`stores.ts`, `boot.ts`, `menu.ts`, `commandPalette.ts`,
`AboutModal.svelte`, `SettingsModal.svelte`, `tauriCommands.ts`,
`tauriApi.ts`, `mockBackend.ts`. `svelte-check` 256 files 0 errors,
Vitest 265 (+13), Playwright 147 (+8), `cargo test` 43 (same count, more
assertions per test).

---

## 129. Date-picker dot goes stale after resolving a tab's last action, then closing it (#46)

**Status: implemented.** Reported: *"when the number of open actions
changes to zero on an open tab, the dot in the date picker is not
updated, also not when closing and reopening the date picker, or closing
and reopening the tab."*

**Root cause.** The §38 three-tier disk-read cache: `allNotesCache` (the
date picker's data source) is refreshed from a lazily-populated
`diskNotesCacheRaw`, merged every call with a live-tab overlay so an open
tab's in-progress edits show up without a disk round trip.
`writeNoteAndInvalidateCache()` deliberately *skips* invalidating
`diskNotesCacheRaw` when the written file has an open tab — trusting the
live overlay instead, to avoid a full re-read on every autosave. That's
correct while the tab stays open. But closing the tab removes it from the
overlay, and `diskNotesCacheRaw` was never updated with the resolved
content in the first place — so the merged cache falls back to *stale*
disk content with the action still open, and the dot never clears.

**Fix.** `closeTab()` now calls a new `noteClosingWithContent(filename,
content)` (`persistence.ts`) right before tearing the tab down: it
patches `diskNotesCacheRaw[filename]` directly with the tab's final
content, if the cache is already populated. A targeted patch, not a
blanket invalidation — keeps the §38 optimization's intent (no forced
full re-read) while fixing the actual staleness.
`writeNoteAndInvalidateCache()` itself is unchanged in behaviour, just
extracted so `writeNoteRaw()` is shared between it and nothing else
needing a name.

New: `persistence.ts` `noteClosingWithContent()`, wired from `tabs.ts`
`closeTab()`. Tests: `controller.test.ts` +2 (cache patched on close, a
closed scratchpad never touches the all-notes cache),
`tests/e2e/navigation.spec.ts` +1 (real repro: type an open action,
resolve it, close the tab, reopen the date picker, assert the day's `has`
class is gone). Pure frontend — no Rust/IPC/storage change, `cargo test`
unchanged at 44 (see §131 below for the count's real mover). `svelte-check`
256 files 0 errors, Vitest 270 (+5 incl. §130), Playwright 150 (+3 incl.
§130/§131 below).

---

## 130. Shortcuts & Symbols: side-by-side columns instead of one long scroll (#47)

**Status: implemented.** Reported: *"I want to be able to see the most
important shortcuts and the symbols without having to scroll down a
lot."*

**Fix.** `ShortcutsModal.svelte`'s single `.shortcuts-list` column
(everything stacked: shortcuts, then glyphs, then delegate/topic/emphasis
rows, then section headers) is now two side-by-side, independently
scrollable columns — keyboard shortcuts on the left, everything
symbol-related on the right — inside a new `.shortcuts-body` flex row.
The modal card widened to 880px (matching the History modal's precedent)
so neither column feels cramped.

**Two focus-scrollable columns, not one.** The existing `focusScrollableList`
action auto-focuses its element on mount so arrow/Page/Home/End keys
scroll it immediately — fine for a single list, but two columns both
auto-focusing would race (only one can hold real DOM focus). Split the
shared keydown handler out of `focusScrollableList.ts` into a private
`attachScrollKeys()`, kept `focusScrollableList` (auto-focus, used by the
left column) and added `scrollableListKeys` (click-to-focus only, used by
the right column) — both bind the same arrow/Page/Home/End behaviour.

New: `focusScrollableList.ts` `scrollableListKeys` export (+3
`focusScrollableList.test.ts` cases). CSS: `.shortcuts-body` /
`.shortcuts-col` in `app.css`, `.shortcuts-col` added to the shared
thin-scrollbar rule group. Tests: `tests/e2e/drawers.spec.ts` +1 (two
columns, side by side, independently scrollable, correct headers). Pure
frontend — no Rust/IPC/storage change, `cargo test` unchanged at 44.
`svelte-check` 256 files 0 errors.

---

## 131. Light / Dark / System theme setting (#48)

**Status: implemented.** Reported: *"Make a setting to switch between
light and dark mode under Appearance. It should also have the option to
use system settings."*

**Independent of the existing glyph palette.** `ColorMode`
(`color`/`grayscale`/`legacy`, §111) picks the *token glyph* colours; this
is a separate `ThemeMode` (`light`/`dark`/`system`, defaulting to
`system`) controlling the app chrome's own light-vs-dark rendering — the
two settings compose freely (e.g. Legacy glyphs on a Light chrome).
Settings → Appearance now has two labelled segmented-control rows,
"Theme" above "Glyphs".

**Rust/config.** New `ThemeMode` enum (`storage.rs`, `#[serde(rename_all
= "lowercase")]`, `#[default] System`) + `AppConfig.theme_mode`
(`#[serde(default)]` — every config written before this field existed
loads as `System`, unchanged behaviour). New `set_theme_mode` command.
ts-rs regenerates `ThemeMode` into `tauri-types.ts`. New test:
`theme_mode_round_trips_through_json_for_every_variant`; two existing
config round-trip tests extended to assert `theme_mode` too — 44 tests
(+1 net; §129/§130 above added none, so this is the whole delta since
§128's 43).

**Anti-flash fix, found in passing.** `show_window_without_flash()`
(`lib.rs`) pre-paints the window background before the frontend mounts,
to avoid a flash of the wrong colour — it read `window.theme()`, which
only reflects the *OS* setting. If a user had explicitly chosen Light
while their OS was in Dark (or vice versa), the pre-paint would briefly
show the wrong colour before the frontend corrected it. Fixed to consult
the persisted `AppConfig.theme_mode` first, falling back to
`window.theme()` only when it's `System`.

**Frontend.** New `themeMode` store, mirrored from/to `AppConfig` exactly
like `colorMode`. `boot.ts`'s `applyThemeModeToDom(mode)` sets
`<html data-theme="light"|"dark">` for an explicit choice, or removes the
attribute entirely for `system` (letting `prefers-color-scheme` alone
decide) — called once on boot and again on every `setThemeMode()`.

**CSS: dark-first three-state theming.** This app's baseline (`:root`)
has always been dark, so the pattern is the inverse of the usual
light-first one. For every themed selector block (`:root`, and each of
`[data-color-mode="color"]` / `[data-color-mode="legacy"]`, which already
had their own light-mode override): the existing `@media
(prefers-color-scheme: light)` block is now guarded
`:not([data-theme="dark"])` (so an explicit Dark choice can override a
light OS), and a new `[data-theme="light"]` block (no media query, so it
always wins) duplicates the same values for an explicit Light choice on
a dark OS.

New: `SettingsModal.svelte` "Theme" segmented control, `.settings-inline-label`
CSS. Tests: `controller.test.ts` +1 (`setThemeMode` — store, DOM
attribute, and persistence for all three values),
`tests/e2e/settings.spec.ts` +1 (segmented control, `data-theme` on the
`<html>` element, persists across reload, back to System removes the
attribute). `svelte-check` 256 files 0 errors, Vitest 271 (+1), Playwright
150 (+1), `cargo test` 44 (+1).

---

## 132. Top bar: tab icons didn't align with toolbar-button icons (#49)

**Status: implemented.** Reported: *"There seems to be a misalignment in
the top bar between the height and space for the tabs and height and
space for the buttons. It seems like there is some (unnecessary) empty
space above the tabs, that could be removed. That way the icons of the
buttons would align better with the icons on the tabs."*

**Root cause.** `#top-bar` is 44px tall; the toolbar buttons
(`#top-bar .icon-btn`, 30px) are direct children of it, so `#top-bar`'s
own `align-items: center` vertically centres them — icon centre 21.7px
from the top. `.tab` elements, by contrast, live inside `#tab-bar`, which
bottom-anchors its children (`align-items: flex-end`) so the active tab's
bottom can meet the editor canvas below with no seam. `.tab` had a fixed
`height: 34px`, so a bottom-anchored 34px tab in a 44px bar left ~9px of
empty space above it and nowhere else — pushing the tab's own icon
(vertically centred *within* the tab) down to 26.3px from the top: a
~4.7px mismatch against the toolbar icons directly above it.

**Fix.** `.tab { height: 34px }` → `height: 100%` — filling `#tab-bar`
exactly rather than guessing a shorter fixed value, so there's no gap
left to misalign anything (and it stays correct if the bar height or its
border ever changes). That also pushed `.tab-group-divider` (the hairline
between the daily-note and scratchpad tab groups, §103) out of vertical
centre — it's a fixed 20px-tall sibling that was inheriting the same
bottom anchor for the tabs' sake; gave it its own `align-self: center` so
it centres on the (now taller) tab row regardless.

No test previously asserted the two rows' vertical alignment (a
sub-pixel-layout claim, the kind `CLAUDE.local.md` already notes this
app treats as an eyeball check rather than a pixel-diff assertion) — none
added for the same reason; verified directly via `getBoundingClientRect()`
in the running app (both icon rows' centres now land on the same pixel)
and the existing `tab-archetypes.spec.ts` / `visual.spec.ts` /
`drawers.spec.ts` suites (which exercise the tab strip and the divider)
stayed green. Pure CSS — no Rust/IPC/storage change, `cargo test`
unchanged at 44. `svelte-check` 256 files 0 errors, Vitest 271, Playwright
150 (unchanged counts; no new tests, see above).

---

## 133. App icon redrawn as the "dated page" mark (0.7 iconography pass, part 2)

**Status: implemented.** The 0.7 maturity roadmap
(`docs/design/maturity-0.7-roadmap.md`) called this out explicitly but
deferred it out of §127/v0.7.0 ("the app-icon redraw... explicitly
deferred, not part of 0.7.0"): *"the app icon rejoins the family"* — the
OS icon becomes the same **dated page under its rule** the in-app "Open
date note" toolbar button uses (`src/lib/icons/paths.ts`'s `"date-note"`
path), so the taskbar icon and the toolbar button read as one thing,
replacing the unrelated §96 "checkbox + clock hands" mark.

**Implementation.** `docs/design/icon-A-master.svg` (the 1024px master,
regenerated in place — the prior checkbox-clock content is still visible
in git history) redraws the toolbar's `"date-note"` path (a rounded page
with a title line, a doubled "section rule" line, and a body line) at the
same scale and position the old checkbox mark occupied, so the two icon
generations read as continuous rather than a jarring swap: the page
rect lands at the exact same `(300,300)`–`(724,724)` bounds the old
checkbox did, and the stroke width (46.4px) keeps the toolbar icon's own
stroke-to-viewbox ratio (1.75⁄24) rather than borrowing the old mark's
chunkier one. Same treatment as before otherwise — white knockout on the
`#007acc` accent tile, `rx=232` rounded-square tile. Regenerated via
`npx tauri icon docs/design/icon-A-master.svg` → `src-tauri/icons/
{32x32,128x128,128x128@2x}.png` + `icon.ico` (the only 4 tracked files;
the rest of `tauri icon`'s output — `icon.png`, `.icns`, the Windows
Store/iOS/Android variants — stays gitignored, unchanged since §96, since
ChronoNote ships Windows-only). Checked legible at every render size down
to 16px before regenerating (a scratch multi-size preview page, not
committed).

New: nothing testable — this is a static OS-icon asset with no runtime
behaviour, so no unit/e2e coverage applies (same as §96's own delivery).
Docs: `docs/design/README.md`'s app-icon section and `docs/spec.md`'s
Iconography paragraph updated to describe the shipped state instead of
the prior "picked direction, not yet done." `svelte-check` 256 files 0
errors, Vitest 271, Playwright 150, `cargo test` 44 (all unchanged — pure
asset regeneration, no source change).

---

## 134. §132's own fix overcorrected — tabs read as unnaturally tall (#49, take 2)

**Status: implemented.** Marien, after v0.7.3: *"the top bar is too high
now. the tabs look unnaturally high and there seems to be space above and
below the toolbar-buttons."*

**§132 matched icon *positions* by stretching `.tab` to the bar's full
44px height, leaving `#top-bar .icon-btn` at its original 30px, centred.**
That did land both icon rows on the same pixel (verified numerically at
the time), but the *visual* effect was wrong: tabs now spanned edge-to-
edge — touching the very top of the window — while the toolbar buttons
floated in the middle of that tall bar with visible empty space both
above and below them. Matching positions by stretching one element to
meet the other is not the same as the two reading as one coherent row.

**Fix: match *heights*, not positions, and shrink the bar a little.**
`#top-bar`'s `align-items` changed from `center` to `flex-end` (so every
direct child — the toolbar buttons, the scroll arrows, "new scratchpad"
— bottom-anchors the same way `#tab-bar` already made `.tab` do), then
`.tab` and `#top-bar .icon-btn` were set to the *same* height (32px, down
from 34px/30px respectively). Two elements sharing one anchor edge and
one height necessarily share one visual centre — no stretching needed.
The bar itself shrank from 44px to 40px, and `.tab-group-divider` (the
daily/scratchpad separator, 20px fixed) got a recomputed `margin-bottom:
6px` (half of `32 - 20`) to stay centred on the new shared row instead of
sitting low against the very bottom.

**Also cleaned up:** `.tab-bar-new-btn` and `.tab-scroll-btn` each had
their own `height: 28px` — already dead code, silently overridden by the
more specific `#top-bar .icon-btn { height: 30/32px }` rule (confirmed
via computed style before touching anything, so as not to introduce a
*second* stale value). Removed rather than left to mislead the next
reader.

**Chose from three live-rendered options, not a mockup.** Rather than a
recreated illustration, three real CSS variations were applied directly
to the running dev app via injected styles and screenshotted for
comparison: (A) 44px bar / 34px shared height, (B) 44px bar / 30px shared
height, (C) 40px bar / 32px shared height. Marien picked C.

No test previously asserted the icon rows' vertical alignment (see §132's
own entry for why — an eyeball check, not a pixel-diff assertion); none
added here either, for the same reason. Verified via
`getBoundingClientRect()` in the running app (tab icons, toolbar-button
icons, and the group divider all land on the same pixel) and the existing
`tab-archetypes.spec.ts` / `drawers.spec.ts` / `visual.spec.ts` /
`navigation.spec.ts` / `glyph-layout.spec.ts` / `status-bar.spec.ts` /
`smoke.spec.ts` suites stayed green. Pure CSS — no Rust/IPC/storage
change, `cargo test` unchanged at 44. `svelte-check` 256 files 0 errors,
Vitest 271, Playwright 150 (unchanged counts).

---

## 135. About drawer's "What's changed" and project links silently did nothing

**Status: implemented.** Marien: *"I just saw the button on About that
says What's changed but it does not seem to do anything when I press it.
same for the project link."*

**Root cause: a permission granted the command but not the URLs.**
`capabilities/default.json` has had `"opener:allow-open-url"` since the
opener plugin was first added (the link-opening feature, long before
this session) — but per `tauri-plugin-opener`'s own generated permission
schema, that specific permission "enables the `open_url` command
**without any pre-configured scope**." An empty scope means every actual
URL is rejected by Tauri's runtime permission check, regardless of what
it is — the command itself runs, but the open attempt fails immediately.
The scope that actually authorizes `https://` (plus `http://`/`mailto:`/
`tel:`) is a *separate* permission, `opener:allow-default-urls`, which
was never granted. Both `openProjectLink()` and `openReleasePage()`
(`menu.ts`) swallow the resulting error (`.catch(() => {})`) rather than
surfacing it — a deliberate call at the time ("worst case a click does
nothing, which isn't worth a toast/modal of its own") that, combined with
the missing scope, made the failure completely silent instead of merely
low-key.

**Why nothing caught this sooner.** The mock backend's `plugin:opener|
open_url` handler (`mockBackend.ts`) just records the URL in
`openedUrls` — it has no concept of Tauri's capability/scope system at
all, so `drawers.spec.ts`'s "the project link opens externally via the
opener plugin" test can only ever prove the frontend *invoked* the
command with the right URL, never that a real OS call would actually
succeed. This class of bug — permission/capability misconfiguration — is
invisible to the entire mock-backed test suite by construction; only
running the packaged app and clicking the button surfaces it, which is
exactly how Marien found it.

**Fix.** `capabilities/default.json`: `"opener:allow-open-url"` →
`"opener:default"` — the plugin's own documented bundle for exactly this
use case (`allow-open-url` + `allow-default-urls` + `allow-
reveal-item-in-dir`), rather than hand-picking the fine-grained
permissions and getting the pairing wrong a second time.

No new test: this is a capability/scope bug categorically outside what
the mock can exercise (see above) — the existing `drawers.spec.ts`
coverage already asserts everything it's capable of asserting. Verified
by reading the plugin's own generated schema
(`src-tauri/gen/schemas/desktop-schema.json`) rather than guessing, and
`cargo check` confirming the new permission string is valid; real-app
click-through confirmation pending Marien's install of the release this
ships in. Pure config change — no Rust/frontend logic touched, `cargo
test` unchanged at 44, `svelte-check`/Vitest/Playwright counts unchanged.

---

## 136. First-run-after-update notice, and an always-visible "update available" status-bar icon

**Status: implemented, released in v0.7.6.** Held back briefly at
Marien's request (in case more changes landed first) before being
released the same day. Closes **#50**: *"At first run after update show
release notes with a link to release notes on github."* Plus a follow-up
request the same day: use the existing `update` icon (drawn in §127,
first put to use in §128's About/Settings UI) next to the version number
in the status bar whenever an update is available, not just as a
one-shot toast.

**Design decisions, confirmed with Marien up front:** the first-run
notice is a quiet status-bar link (matching the existing
`checkForUpdatesOnLaunch` toast style), not a modal — and it links out to
the GitHub release page rather than fetching/rendering the release body
inline, reusing `menu.ts`'s existing `openReleasePage()`.

**#50: detecting "this is the first launch after an update."** New
`AppConfig.last_seen_version: Option<String>` (Rust, `#[serde(default)]`)
— the version this installation last recorded actually running. New
`set_last_seen_version` command, mirroring the other setters exactly.
`boot.ts`'s `initApp()` compares it against the live `getAppVersion()` on
every boot: differ → set `justUpdatedToVersion` (new store) for the
status bar and persist the new version; a `null`/omitted
`last_seen_version` (a fresh install, or a config from before this field
existed) means there's no prior version to say "updated from," so
nothing is shown — the current version is just recorded as seen, ready
to catch the next real update. `StatusBar.svelte`'s centre zone shows
`"Updated to vX.Y.Z — What's new"` in that case (mutually exclusive with
the ordinary `toastMessage` slot); the link both opens the release page
and dismisses itself (`menu.ts`'s new `openJustUpdatedReleaseNotes()`) —
there's no separate close button, matching the app's quiet-by-design
toast conventions elsewhere.

**Status-bar update icon.** `#top-bar`'s toolbar already got an `update`
icon in §127 (a down-arrow into a tray) but it sat unused until §128 put
it on the About drawer's "Download & install" button. Now it also
appears — small, unlabelled, `title="Update available — see About"` —
immediately left of the version number in the status bar's right zone,
for as long as `updateStatus === "available"`. Unlike the one-shot
launch-time toast (which auto-clears), this stays visible the whole
session so the fact doesn't disappear along with the toast; clicking it
opens About directly.

New: `stores.ts` `justUpdatedToVersion`; `menu.ts`
`openJustUpdatedReleaseNotes()`; `tauriApi.ts` `setLastSeenVersion()`;
`storage.rs`/`lib.rs` the new field + command; `app.css` `#stat-updated`
+ `.status-link` + `.status-update-btn`. Updated: `mockBackend.ts` (new
seed field, handler, `MUTATING_COMMANDS` entry — mirrors `storage.rs` per
the project's mock-parity convention), `StatusBar.svelte`. Tests:
`controller.test.ts` +5 (`initApp`'s three lastSeenVersion branches,
`openJustUpdatedReleaseNotes`'s two), `storage.rs` — no new `#[test]` fn,
extended the existing round-trip/defaults tests instead (mirrors how
§128's `auto_check_updates` was covered, so 44 stays 44),
`tests/e2e/update-check.spec.ts` +3 (#50's three branches, including
"persists across a reload"), `tests/e2e/status-bar.spec.ts` +1 (the
update icon appears, links to About, shows the found version).
`svelte-check` 256 files 0 errors, Vitest 276 (+5), Playwright 154 (+4),
`cargo test` 44 (same count, more assertions per test).

---

## 137. Date picker: fast dots for the visible month, a loading spinner, and opens on the active tab's date

**Status: implemented, released in v0.7.7.** Held back briefly at
Marien's request ("Let me give some more feedback to work on. Don't cut
a new release yet") before being released once asked to. Two pieces of
feedback from the same message.

**"It takes a bit of time for the dates to get their dot and be set to
bold... probably because the files need to be read."** Exactly right —
opening the date picker calls `refreshAllNotesCache()`
(`persistence.ts`), which the *first* time anything asks for it each
session reads every note file in the folder (`read_all_notes`) before
the dots/bold can render at all. Months (or years) of daily notes make
that read genuinely slow; every date picker open after the first is
instant only because the disk layer stays cached in memory.

**Fix: read the visible month first, individually and in parallel; let
the full read catch up in the background.** New
`persistence.ts::prefetchNotesForDates(filenames)` reads a small batch
of specific filenames via individual `readNote` calls (`Promise.all`,
not the bulk `read_all_notes`) and merges them into the same
`allNotesCache` store the full read populates — so whichever finishes
first is what renders, and the other's result (identical, same files on
disk) is a harmless no-op once it lands. `DatePickerModal.svelte` calls
it with the current month grid's ~42 filenames every time the visible
month changes, but only until the one-time full read finishes
(`loadingAll` flag) — no point re-fetching days the complete cache
already has. **Respects the same rule §129/#46 established for the full
read:** an open, non-scratchpad tab's live (possibly unsaved) content
always wins over whatever's on disk for it, so this fast path can't
reintroduce that bug for a day that also happens to be open right now.

**A quiet spinner while the rest of the history is still loading.**
Reuses the existing `.modal-spinner` (the rotating "⟳" already used for
"Checking for updates…" in About) next to the month title, shown only
while the background full read (`loadingAll`) is in flight — which, after
the first time each session, is instant, so it won't normally be seen
again. New `.cal-title-wrap` keeps the nav-button spacing
(`.cal-head`'s `space-between`) stable whether or not it's showing.

**"Open it on the month of the day of the tab I was on, and highlight
that day."** The grid used to always default to today, focused on
today. New `activeTabIso()` reads the active tab's own filename (when
it's a dated tab — a scratchpad has no date of its own, so falls back to
today same as before) and seeds `year`/`month`/`focusedIso` from it
instead. `focusedIso` already drives the `.cal-day.target` highlight (the
same one keyboard navigation and type-to-jump use), so no new styling
was needed — just changing what it starts as.

New: `persistence.ts` `prefetchNotesForDates()`; `mockBackend.ts`
`MockSeed.delayCommands` (artificially delays a named command — used to
deterministically test the loading-spinner window, otherwise too fast to
observe against the mock's instant in-memory reads). Tests:
`controller.test.ts` +4 (`prefetchNotesForDates`'s merge rules — fetches
missing, skips already-cached, prefers an open tab's live content, never
touches a scratchpad), `tests/e2e/navigation.spec.ts` +3 (opens on the
active tab's month and highlights it, falls back to today for a
scratchpad, the visible month's dot lands well inside an artificially
slow `read_all_notes`'s delay and the spinner clears once it resolves).
Pure frontend — no Rust/IPC/storage change, `cargo test` unchanged at 44.
`svelte-check` 256 files 0 errors, Vitest 280 (+4), Playwright 157 (+3).

---

## 138. A marketing website, local-only for now — plus a new "demo" mock scenario

**Status: implemented, then published the same day (see §139).** ("let's
start with a local version of the website. we'll work on publishing it
later.") Not a change to the shipped app — nothing here affects `dist/`
or any release build.

**`website/`** — a new, separate static site (plain HTML/CSS, no build
step, no framework) with a landing page, a full usage guide (token
vocabulary, every keyboard shortcut, a workflow walkthrough), and a live
interactive demo. `style.css` hand-ports the app's own design tokens
(the four-tier charcoal surface palette, the monospace font stack, the
"color" glyph palette as the site's accent) rather than importing
`src/app.css` directly, so the site has no build-time dependency on the
app — see `website/README.md` for exactly what's ported and how to keep
it in sync by eye.

**The demo is the real app, not a recreation.** It embeds ChronoNote's
actual frontend, running against the existing in-memory mock Tauri
backend the test suite already uses. Originally an iframe pointed at
`?mock&scenario=demo` on the app's own local dev server — turned into a
real, self-contained static bundle the same day; see §139.

**New `"demo"` scenario** (`scenarios.ts`) — hand-authored, not
generated, so every token form gets a real, readable example and two
section titles ("Daily Standup", "1:1 — Priya"/"1:1 — Dana") recur across
weeks for Section History to have something worth aggregating. Unlike
every other scenario, its dates are computed relative to the *real*
current date (`todayISO()` + `addDaysISO()`) rather than the fixed
`REFERENCE_TODAY` every deterministic test scenario pins to — a public
demo needs to look current on whatever day someone actually loads it,
not increasingly stale after a fixed date passes. Caught one of my own
markup mistakes while eyeballing it live: `(topic)` only turns into the
topic-tag pill *right after* the leading action symbol
(`# (topic) text`, not `(topic) # text`) — the same rule the app itself
enforces, worth remembering for any future hand-authored scenario
content.

No new automated test: `demo` is a hand-verified, human-facing artifact
(eyeballed live via the Browser pane — Action Drawer, Section History,
and the date-picker calendar all checked directly), not something an
automated assertion should pin down the exact prose of. `svelte-check`
256 files 0 errors, Vitest/Playwright counts unchanged (no test
references the new scenario).

---

## 139. The website goes live: a self-contained demo bundle, published via Plesk

**Status: implemented, published** at `chrononote.mariendegelder.nl`.
Marien: *"Let's work on publishing the website... I want to use
[cloud86.io/Plesk] for the first versions... credentials cannot [be in
git], I don't want to leak any sensitive data."*

**Deploy mechanism, decided up front (AskUserQuestion): Plesk's own Git
extension, pulling the public GitHub repo directly — zero credentials
anywhere**, since a public repo needs no auth to clone. The declined
alternative was a GitHub Actions workflow pushing over SFTP/SSH on every
commit — more automatic, but a real deploy credential living somewhere
(even as a GitHub secret I'd never see) versus nowhere. Plesk just serves
static files with no build step, which meant §138's demo — an iframe
pointed at a locally-running dev server — had to become an actual static
artifact first.

**New build target, entirely separate from the real app's own.**
`vite.demo.config.ts` (`root: "demo-src"`, its own entry
`demo-src/index.html` → `src/main-demo.ts`) builds a self-contained
bundle — the mock backend always on, no Tauri host, no dev server —
written straight into `website/demo-app/` and **committed to git**, so
Plesk's pull needs no server-side build step at all. Confirmed by hand
this can never end up in the real desktop app's `dist/`: `build-guard`
(`.github/workflows/test.yml`) only ever inspects that folder, which this
config never writes to — ran both builds, grepped `dist/`, clean.
`website/index.html`/`demo.html` now iframe `demo-app/` instead of
`localhost:1420`. `npm run build:demo` is the one new maintenance step —
rebuild and commit after any frontend change that should show up in the
demo (documented in `website/README.md`).

**Gotcha hit and fixed, worth remembering for any future static bundle:**
always reference a built bundle's directory with a **trailing slash**
(`demo-app/`, never `demo-app/index.html`). `npx serve`'s default "clean
URLs" redirect strips the explicit filename *and* the trailing slash
together, which then resolves the bundle's relative asset paths against
the wrong parent directory (a real, reproduced bug — the demo rendered
blank until this was traced via `read_network_requests` and fixed). Real
production servers may behave differently, but the trailing-slash form
is the safe habit regardless of host.

**What I can't and didn't do:** create the subdomain, touch DNS, or
access Plesk itself — that's Marien's own hosting account and credentials,
handed over as a step-by-step checklist in chat instead (subdomain
creation, Git repository setup pointed at the public repo, setting the
subdomain's document root to the repo's `website/` subfolder specifically
so the rest of the cloned repo stays unserved, SSL, and a note about
`.git` never ending up inside a public document root).

No new automated test — this is deployment plumbing and a manual Plesk
checklist, not app behaviour. `svelte-check` 257 files 0 errors,
Vitest/Playwright counts unchanged.

---

## 140. Default glyph palette: `Color`, not `Grayscale`

**Status: implemented, released in v0.7.8.** Marien, after noticing the
published demo opened in grayscale: *"Is that the case for the
application as well? I prefer to have it launch in color mode."* It
was — `ColorMode`'s Rust `#[default]` has been `Grayscale` since the
mode existed (§98). Flipped
to `Color`: `storage.rs`'s `#[default]` attribute moved to the `Color`
variant, `stores.ts`'s pre-boot placeholder and `mockBackend.ts`'s
constructor fallback updated to match (the mock mirrors `storage.rs` by
convention — see `CLAUDE.local.md`).

**Only matters for a genuinely fresh install** (no `config.json` yet, or
one from before the `colorMode` field existed) — every config already on
disk keeps whatever it explicitly saved, `#[serde(default)]` only ever
fires for a config with the field truly absent. Existing users, including
Marien's own dev machine, are unaffected unless they reset their config.

**Test fallout, all from the same root cause:** several e2e tests
implicitly relied on "grayscale" being whatever a freshly-seeded mock
defaults to — `settings.spec.ts`'s toggle test, `command-palette.spec.ts`'s
`>colored` search (the palette's colour command's label names the *next*
mode in the cycle, so searching "colored" finds nothing once the app is
already in colour mode), and one `visual.spec.ts` gallery shot literally
named "editor-tokens-grayscale". Fixed by seeding `colorMode: "grayscale"`
explicitly wherever a test's actual point is the grayscale state or the
transition away from it — more robust than depending on whatever the
implicit default happens to be, and clearer about each test's intent.
`icon-system.spec.ts`'s theming test didn't depend on the default at all
(it now explicitly switches modes rather than reading whichever one is
current) but had a stale variable name from when it did; renamed while in
there.

Also fixed the website's demo showing a hardcoded `v0.3.0` (the mock's
own placeholder) instead of the version it was actually built from — new
`vite.demo.config.ts` `define: { __DEMO_APP_VERSION__ }`, read from
`package.json` via `fs.readFileSync` at config-load time (a plain
`import pkg from "./package.json"` in `scenarios.ts` itself broke
Playwright's separate Node-based spec loader with an import-attribute
error, even though Vite/Vitest both handle a bare JSON import fine —
worth remembering if any other file shared across those three loaders
ever wants build-time JSON data again).

Updated: `storage.rs` (2 existing test assertions flipped from
`ColorMode::Grayscale` to `ColorMode::Color` — no new test, the
enum-default behaviour is already what `#[derive(Default)]` covers),
`stores.ts`, `mockBackend.ts`, `scenarios.ts`, `vite.demo.config.ts`,
`tests/e2e/{settings,command-palette,icon-system,visual}.spec.ts`.
`svelte-check` 257 files 0 errors, Vitest 280 (unchanged — no test
asserted on the default specifically), Playwright 157 (unchanged),
`cargo test` 44 (unchanged, 2 assertions updated in place).

---

## 141. Web app Phase 1: a browser-storage tier, plus a shared import feature for the desktop app

**Status: implemented; the web app deployed the same day (§142); the
desktop-side Import feature released in v0.7.9.** Marien: *"Work out a
function and technical design for a web-app version of ChronoNote that
stores its
data in the browser... The journey: someone lands on the website and
uses the demo (no data retention), then starts using the web app (data
retention in browser), then installs the application locally (data
retention on disk)."* Full design: `docs/design/webapp-roadmap.md`. This
section is that doc's Phase 1, built the same day the design was agreed.

**The whole thing rests on one existing fact about this codebase:** the
frontend never talks to Rust directly — every interaction goes through
the typed `TauriCommands` contract (`tauriCommands.ts`) via `invoke()`,
and two implementations of it already existed (the real IPC bridge,
`tauriApi.ts`; the in-memory test/demo mock, `testing/mockBackend.ts`).
**`WebBackend`** (new, `src/lib/webapp/webBackend.ts`) is a third —
backed by IndexedDB instead of a `Map` or real files — and the entire
frontend above the command layer (every Svelte component, `controller.ts`,
every store) runs against it completely unmodified. Schema: one database
(`chrononote-webapp`), three object stores (`notes`, `conflicts`,
`meta` — holding the single `config` and `session` rows), via a small
hand-written promise wrapper (`webapp/idb.ts`) rather than a dependency.
`notesDir`/`recentNotesDirs`/`set_notes_dir`/`path_exists` have no
browser-storage analogue (v1 is one implicit workspace per origin, per
the design doc) — filled with an unused placeholder / no-ops
respectively; the Settings UI hides the whole Notes Location section
rather than ever showing them.

**A new build target**, `vite.webapp.config.ts` → `webapp-src/index.html`
→ `src/main-webapp.ts`, exactly mirroring the demo's existing
`vite.demo.config.ts` pattern (isolated `root`, `base: "./"`, its own
`__WEBAPP_VERSION__` build-time constant read from `package.json`) —
committed static output in `website/webapp/`, deployed the same
Plesk-Git-pull way as the demo. `npm run build:webapp`.

**Export / import**, the design doc's chosen format — a single JSON file
(`{chrononoteExport, notes: {filename: content}, config}`), pure
parse/build logic in `webapp/exportBundle.ts` (own Vitest coverage,
`exportBundle.test.ts`), triggered via a plain `Blob` + temporary
`<a download>` (a real webpage, not a sandboxed context — no special
handling needed). New shared primitive, **`import_notes_bundle`**
(`storage.rs` + the Tauri command + `tauriCommands.ts` + both mocks),
implemented identically in spirit by all three backends: desktop writes
through the existing atomic `write_note_at` in a loop, `WebBackend`
writes into IndexedDB, the mock writes into its `Map` — `merge` skips
any filename that already exists (the default), `replace` clears
everything first. **One shared "Data" section in `SettingsModal.svelte`**
does the picking (a plain hidden `<input type="file">` — Tauri's webview
supports the File API exactly like a real browser, so no OS dialog or
native fs-read command was needed even for the desktop side) and the
merge/replace confirmation, shown identically on the desktop app and the
web app — this is the design doc's "closing the loop" decision (built in
Phase 1, not deferred): the journey's last step is a real one-click
import on the desktop app, not a manual file operation.

**UI gating**, all keyed off a new `backendKind` store (`"desktop" |
"demo" | "web"`, set explicitly by each of the three `main*.ts` entry
points — *not* inferred from which backend engine is running, since the
mock backend itself powers both `main.ts`'s dev/test path, which wants
`"desktop"`, and `main-demo.ts`, which wants `"demo"`): the web app
hides Notes Location and the whole Updates story (Settings' toggle,
About's section, the status-bar update icon, `boot.ts`'s launch-time
check — there's no installer to update to; refreshing the page always
serves the latest deployed build) and shows a status-bar "Browser
storage" badge instead; the Data section itself shows on both the
desktop app and the web app, hidden only in the demo (nothing real to
export there, and the design doc keeps the demo's fake data clearly
separate from anything real).

**A real, if small, bug found and fixed along the way:** adding the Data
section made Settings tall enough that, on the test viewport, the
modal's footer ("Close") ended up sitting under the status bar — which
is deliberately `z-index: 250`, *above* a modal's overlay (§102), so its
save-state/toast messages stay visible even while a modal is open. That
same deliberate choice meant the status bar intercepted the Close click
once the modal grew past it. Fixed the general case, not just this
instance: `.settings-section` (shared by Settings and About) now caps at
`max-height: 380px; overflow-y: auto` — the same bound `.modal-list`
already uses elsewhere — so neither modal can grow tall enough to
collide with the status bar again, however many sections either gains
later.

**Verified live in the browser**, not just via the test suite: built
`website/webapp/`, served it, typed a real note, reloaded the page and
confirmed it survived (real IndexedDB persistence), exported, and
imported a hand-built bundle via a dispatched `change` event on the file
input (exercising the real code path end-to-end) — confirmed by reading
IndexedDB directly afterward that the new note landed and the existing
one's content was untouched, matching merge semantics exactly.

New tests: `storage.rs` +3 (`import_merge_writes_new_notes_and_skips_
existing_filenames`, `import_replace_clears_existing_notes_first`,
`import_skips_invalid_filenames_rather_than_erroring`), `exportBundle
.test.ts` (9, pure parse/build logic — `WebBackend`'s own IndexedDB code
isn't automated, jsdom has no IndexedDB implementation and none was
added as a dependency for it; verified manually in the browser instead,
see above). `svelte-check` 210 files 0 errors, Vitest 289 (+9), Playwright
157 (unchanged — every existing spec runs with `backendKind` at its
`"desktop"` default, so none of this gating changes their behaviour),
`cargo test` 47 (+3).

**Deployed the same day** — `website-live` promoted, and Marien set up
`app.chrononote.mariendegelder.nl` in Plesk pointing at the existing
`chrononote.mariendegelder.nl` checkout's `website/webapp/` folder (no
second Git repository or webhook needed — one shared checkout, decided
after Marien asked whether that was possible; see §142 and the
`webapp-phase-1-sept-2026` memory). Verified live: a note typed at
`app.chrononote.mariendegelder.nl` survived a real reload.

**What was Phase 2 at the time this section was written — see §142**,
done the same day: demo/landing-page CTAs linking to the web app, and
PWA/offline install. The OPFS storage engine revisit remains
not started, held back deliberately per Marien's own instruction.

---

## 142. Web app deployed; landing-page CTAs; PWA install

**Status: implemented and deployed the same day as §141.** Marien
verified the Plesk setup and asked to go ahead with deployment
verification, the landing-page CTAs, and PWA install — explicitly
holding off on the OPFS storage-engine revisit.

**Simpler hosting than §141 assumed.** The design doc's own hosting
section had recommended a subdomain but implied a second Plesk Git
checkout; Marien asked whether `app.chrononote.mariendegelder.nl` could
instead just reuse the existing `chrononote.mariendegelder.nl` checkout.
It can — a Plesk (sub)domain's Document Root is independent of where any
Git repository is checked out, so the new subdomain points its document
root at the *existing* checkout's `website/webapp/` folder directly. No
second Git repository, no second webhook: the one existing webhook's
`git pull` already refreshes `website/` and `website/webapp/` together
in the same pull, so both subdomains update simultaneously for free.
Each (sub)domain still gets its own web-server config context (and its
own SSL certificate) even while sharing files, so the per-subdomain
cache-header independence the design doc wanted is unaffected.
`docs/design/webapp-roadmap.md`'s hosting section and the
`webapp-phase-1-sept-2026` memory were updated to match before Marien
did the Plesk-side setup, so the actual steps taken matched the doc.

**Deployment verified for real**, not just assumed: `curl` against
`https://app.chrononote.mariendegelder.nl/` (200 OK, LiteSpeed), then a
full round-trip in the browser against the live deployment itself — typed
a note, reloaded the real page, confirmed it survived (genuine
production IndexedDB, not a local build).

**Landing-page CTAs** (`website/index.html`, `website/demo.html`) — a new
`cta-row` under the embedded demo: "Start using it — free, in your
browser" (primary, → the web app) and "Or install the desktop app"
(secondary, → GitHub Releases), plus a line of copy distinguishing the
three tiers explicitly (demo vs. web app vs. desktop). `demo.html`'s
full-screen demo bar gets the same web-app link alongside its existing
"back to chrononote" one. No new CSS — reuses the site's existing
`.btn`/`.btn-primary`/`.cta-row` classes.

**PWA / offline install**, per the design doc's own dedicated section —
built essentially as scoped there, no surprises:
- `webapp-src/public/manifest.webmanifest` — name, two icon sizes
  (256×256 and 512×512, reused from `src-tauri/icons/`, meeting Chrome's
  installability minimums), `display: "standalone"`.
- `webapp-src/public/sw.js` — a small, **network-first** service worker
  (fetch fresh when online and cache it; fall back to cache only when
  offline), not a build-time precache list — the bundle's hashed
  filenames change every rebuild, and there's nothing else to
  precompute since all real data already lives in IndexedDB, not
  anything the service worker manages. Network-first specifically
  (not cache-first) to keep the same freshness posture the
  `website-live` branch strategy (§ website deploy branch note,
  `CLAUDE.local.md`) already established: an online visitor should
  always see what's currently deployed, not a stale cached shell.
  Registered from `main-webapp.ts`, best-effort (a registration
  failure or an unsupported browser just means no offline capability —
  never a broken app).
- No custom "Install" button — the design doc called this a
  nice-to-have, not required; the browser's own install UI (Chromium's
  address-bar icon, Safari/iOS's manual "Add to Home Screen") is enough
  for v1.

Verified in the browser: manifest fetches and parses correctly at its
served path, the service worker registers with the correct scope, and
both icon files and `sw.js` itself resolve with `200`.

`svelte-check` 210 files 0 errors (unchanged — this section is markup,
JSON, and one small addition to `main-webapp.ts` with no new types),
Vitest 289 (unchanged), Playwright 157 (unchanged — none of this touches
anything the desktop-app suite exercises).

---

## 143. Ctrl on Windows/Linux, Cmd on Mac — everywhere: app, demo, web app, website

**Status: implemented, released in v0.7.10.** Marien: *"Now that there
is a webapp and demo, the application is not Windows only anymore, and
people with Mac can use it. Can you work out a way that for people on
Windows or Linux shortcuts
work and are shown as Ctrl, and on Mac work and are shown as Cmd? This
applies application (Windows only for now), demo, webapp and website."*
Recommendations shared and two decisions confirmed before writing any
code: Mac shortcuts display as the word "Cmd" (not the `⌘` glyph), and
matching is **strict** — a shortcut only fires with the
platform-correct modifier, never either, so the displayed label is
always a complete, accurate description of what actually works.

**Investigated first, before designing anything:** a background research
pass mapped every place a shortcut is matched or displayed. Findings that
shaped the design:
- **No central keybindings module existed.** Matching lived in a
  16-branch `if`/`else if` chain in `App.svelte`'s window-level listener
  (14 of 16 branches were `e.ctrlKey`-only — Cmd would have done
  nothing), plus a CodeMirror keymap in `EditorPane.svelte` (3 of 5
  custom bindings already Mac-safe via CodeMirror's own `Mod-` syntax,
  2 using literal `Ctrl-`).
- **Six separately-maintained copies of the same ~20 shortcuts** were
  already displayed independently — the Shortcuts & Symbols drawer, the
  command palette's hints, TopBar tooltips, StatusBar's tooltip, and two
  `<kbd>` references in About/Action Drawer — a drift risk that existed
  before Mac support and was going to need fixing regardless of
  platform, once every one of those six needed to become platform-aware
  at once anyway.
- **Zero platform detection anywhere** — no `navigator.platform`, no
  Rust `cfg!(target_os)`, and no native Tauri app menu at all (so no
  accelerator strings to update either — nothing there to touch).
- **Two real OS conflicts, not just relabeling**: `Ctrl+Space` (cycle an
  action line's state) collides with macOS's own input-source-switcher
  shortcut; `Ctrl+Y`-as-redo isn't bound at all on Mac in CodeMirror's
  own `historyKeymap` (Mac gets `Cmd+Shift+Z` there natively instead).

**Architecture: one shared registry.** New `src/lib/platform.ts` (a
single `isMac` boolean, from `navigator.userAgentData?.platform ??
navigator.platform` — a browser API, not Tauri IPC, so identical across
the desktop app's webview, the demo, and the web app, all three sharing
this `src/` tree) and `src/lib/shortcuts.ts` (`SHORTCUTS`: id → combo(s)
+ label). Every one of the six display surfaces now reads from this one
table via `formatShortcut`/`formatCombo` instead of a hand-written copy;
`App.svelte`'s window-level dispatcher matches against it via
`matchesShortcut`/`matchesCombo` instead of the old `if`/`else if`
chain. A combo can be restricted to specific platforms (`platforms:
["other"]` / `["mac"]`) — used for the Ctrl+Y-on-Mac non-binding, for
`Ctrl+Space` (Mac shows `Cmd+Enter` instead — the reliable universal
alias that already existed right next to it), and for the existing
`Ctrl+↑`/`Ctrl+↓` caret-navigation pair, which stays Win/Linux-only by
design (§90/#24 — Mac keeps CodeMirror's own default page-scroll there)
and is now simply dropped from the Shortcuts drawer entirely on Mac
rather than shown with a combo that wouldn't work.

**What changed where:**
- `App.svelte` — the 16-branch chain replaced by a `shortcutActions`
  lookup table + a loop over `matchesShortcut`; Ctrl/Cmd+K and Ctrl/Cmd+F
  keep their bespoke "ignore while a modal is open" guard (the one bit of
  behavior too special-cased for the generic table).
- `EditorPane.svelte` — `Ctrl-Space` scoped `win:`/`linux:`-only (Mac
  relies on `Mod-Enter`, already bound); `Ctrl-Shift-s` → `Mod-Shift-s`
  (safe conversion, no OS conflict there).
- `ShortcutsModal.svelte`, `commandPalette.ts`, `TopBar.svelte`,
  `StatusBar.svelte`, `AboutModal.svelte` — all six display surfaces
  now render from the registry. The Shortcuts drawer keeps its exact
  original row order (an explicit ordered list of ids + two literal
  non-combo rows — "click a glyph", "Escape" — that were never real
  key combos and don't belong in the registry's shape).
- **Deliberately left untouched**: `ActionDrawerModal.svelte`'s own
  local `Ctrl+Space` handler (toggle an action's state from within the
  drawer). Its existing bare `e.key === "Enter"` branch already claims
  Enter for a different action (jump to that item) — adding a
  `Cmd+Enter` alias here the way the editor gets one would collide with
  that, so this one specific binding stays a known, documented
  Mac limitation (unreliable if the input-source shortcut is active for
  that user's locale; a mouse click always works regardless) rather than
  risk a real regression to force it into the new system.

**Website** (`chrononote.mariendegelder.nl`, `guide.html`'s 18-row
shortcut table + `index.html`): new `website/shortcuts.js`, loaded on
both pages — the same detection logic as `platform.ts`, ported
standalone since the site has no shared build with the app. Every
shortcut mention was already wrapped in `<kbd>` tags; the script swaps a
leading "Ctrl" to "Cmd" for a Mac visitor (and specifically
`Ctrl+Space` → `Cmd+Enter`, matching the app's own exception). No
framework, no build step — matches the site's existing approach.

**Tests**: a new `tests/e2e/mac-shortcuts.spec.ts` — the first real,
automated Mac-behavior coverage this project has had. CI runs headless
Chromium on Windows/Linux, so "being on Mac" is emulated by overriding
`navigator.platform` **and** `navigator.userAgentData.platform` before
the app's scripts run (`isMac` is computed once at module-import time,
and Chromium's newer `userAgentData` API reports the *real* host OS,
silently overriding a `navigator.platform`-only fake — caught by a
failing first run of this exact test, not assumed). Playwright's own
`Meta+`/`Control+` key tokens set real `metaKey`/`ctrlKey` on the
synthetic event regardless of host OS, so this genuinely exercises the
platform-branching logic: Cmd+K opens the command palette and Ctrl+K
does nothing (and the same paired assertion for Cmd+, and Cmd+Shift+A);
Cmd+Enter cycles an action's state at the CodeMirror level while
Ctrl+Space does nothing; the Shortcuts drawer shows "Cmd", never "Ctrl",
and drops the Win/Linux-only caret-nav row entirely. Also migrated the
existing suite's 131 literal `"Control+..."` key-press strings (22 spec
files) to Playwright's own cross-platform `"ControlOrMeta+..."` token
(already used inconsistently in 25 places before this) — mechanical,
zero effect on today's Windows/Linux CI runs, but stops the suite from
hard-coding a Windows-only assumption.

**A verification-tooling note, not a code issue**: manually re-testing
in the Browser pane's own real (non-headless) browser tab, Ctrl+K
appeared to do nothing — traced to Chrome's own reserved "focus the
address bar for search" shortcut on that exact combo, intercepting it
before the page's JS ever saw it (confirmed by testing an unreserved
combo, Ctrl+Shift+A, which also silently failed to open Actions via the
pane's synthetic key-press tool but worked instantly via a plain mouse
click on the same button) — a limitation of that specific manual
verification method in a real browser chrome, not a regression. The
Playwright suite's headless Chromium has no address-bar UI to collide
with, which is exactly why its 162 passing assertions (157 existing +
5 new) are the real, authoritative confirmation here, not the manual
spot-check.

`svelte-check` 212 files 0 errors, Vitest 289 (unchanged — nothing here
has unit-level pure logic beyond what `EditorPane`'s existing structure
already covers), Playwright 162 (+5, all passing), `cargo test` 47
(unchanged — no Rust changes; there's no native app menu to update).

**Deferred, not part of this pass**: updating the ~33 code comments
that mention "Ctrl" (cosmetic, no behavior implication) and the ~29
Playwright test *titles* that say "Ctrl" in prose (test names only,
no assertion depends on them) — both accurate enough to leave as
Windows-first phrasing for now, revisit if they start reading
confusingly stale.

---

## 144. Top bar collapses its secondary buttons on a narrow window (#56)

**Status: implemented, closes #56, released in v0.7.10.** Marien:
*"Improvement: collapse buttons in top bar to have more space for tabs,
especially useful for
small screens."* Recommendations shared first, three decisions
confirmed before writing code: extend the existing measurement-based
`settleLayout` system (rather than an independent CSS breakpoint); keep
New Scratchpad and Open Date Note always visible, collapsing everything
else; and build a small anchored popover for the overflow rather than
repurposing the command palette.

**The mechanism.** `TopBar.svelte`'s action buttons (New Scratchpad,
Open Date, Actions, Section History, Cross-Tab Search, Import Sections,
Promote, Settings, About) sit as fixed-width siblings of the scrollable
`#tab-bar`, not inside it — on a narrow window they were claiming
~270px+ regardless of how little room was left for tabs, and the
existing responsive system (§55/56/60/61's `settleLayout` — labels on,
labels off, tab-strip scroll arrows as a last resort) never went further
than icon-only. Added a fourth tier, using the same "decide from the
current state, require clearing a margin before flipping" discipline
that system already earned the hard way: once icon-only buttons still
leave the tab strip overflowing, collapse Actions/History/Search/
Import/Promote/Settings/About into one "More actions" button —
`MoreActionsModal.svelte` (new), anchored the same way `DatePickerModal`
anchors to its own trigger (`data-more-trigger`, positioned under it,
closes on outside click/Escape, no `.overlay` backdrop — a toolbar
overflow menu, not a dialog). New Scratchpad and Open Date Note are
never touched by any of this. Tab-strip scroll arrows remain the true
last resort, now only appearing if tabs still don't fit even with the
buttons collapsed.

**A real, pre-existing timing bug found and fixed while building this,**
not just new code: `settleLayout` is invoked from `tabs.subscribe(() =>
settleLayout())`, which fires *synchronously* the moment the `tabs`
store updates — but Svelte's own DOM patch for whatever just changed (a
new tab's `{#each}` entry) lands on a separately scheduled pass, not
necessarily before that callback runs. Measuring immediately read stale
layout (the *previous* tab count's width) — confirmed by direct tracing,
not assumed — and since the component's `ResizeObserver` deliberately
watches `#top-bar` rather than `#tab-bar` (a `§`-documented choice, so
toggling the buttons/labels doesn't retrigger itself), *nothing* else
ever re-ran the measurement afterward: a tab created while the window
was already narrow could permanently miss the collapse decision until a
real window resize happened. Fixed generally, not just for the new
tier — `settleLayout` now awaits one animation frame before its very
first measurement on every invocation, regardless of what triggered it,
the same "let the DOM catch up" wait already used everywhere else in
this function. This bug pre-dates this section entirely (the labels
tier has the identical trigger path) but had never been caught — there
was no test coverage of this responsive behavior at all before now.

**New icon**: `more` (`src/lib/icons/paths.ts`) — three filled dots,
the same small-circle-accent language `settings`/`about` already use.
New `ModalKind` value `"topBarMore"`, and `menu.ts`'s `openMoreActions()`
alongside the module's other one-line "open a modal" functions.

**Tests**: new `tests/e2e/topbar-collapse.spec.ts` (6 cases) using
`page.setViewportSize()` — reliable and non-flaky for "is this button
hidden at this width," unlike pixel-perfect layout assertions. Covers:
wide-window baseline (nothing collapsed); narrow-window collapse (pinned
buttons stay, the rest don't render individually); the popover's full
content and that running an item closes it; the conditional Promote
entry; outside-click/Escape dismissal; and re-widening un-collapsing.
Each case re-run 8× back to back during development specifically to
confirm the timing bug above was actually fixed, not just usually
avoided.

`svelte-check` 213 files 0 errors, Vitest 289 (unchanged — this is
layout/DOM behavior, not unit-testable pure logic), Playwright 168
(+6, all passing, re-verified stable under repetition), `cargo test` 47
(unchanged — pure frontend). Closed **#56** on GitHub with a comment
pointing at this section.

## 145. §143 cleanup — stale "Ctrl" wording, plus a real Playwright bug it surfaced

**Status: implemented, released in v0.7.10 (no new version bump —
test/comment-only, no shipped-app behavior change).** Marien: *"Start
doing the cleanup,"* referring back to the two low-priority items §143
deliberately deferred: source comments and Playwright test titles still
saying bare "Ctrl" now that shortcuts are Mac-aware.

**Source comments** (~15 files: `EditorPane.svelte`, `actions.ts`,
`TopBar.svelte`, `controller.ts`, `glyphs.ts`, `setextRule.ts`,
`history.ts`, `menu.ts`, `search.ts`, `sectionImportActions.ts`,
`stores.ts`, `tabs.ts`, `tokens.ts`) — every doc comment describing a
binding that `shortcuts.ts` makes Mac-aware (unrestricted `mod: true`)
now says "Ctrl/Cmd"; comments describing a genuinely Windows/Linux-only
binding (`platforms: ["other"]` — the editor's `Ctrl-Space` cycle, the
`Ctrl+↓`/`Ctrl+↑` caret nav, `Ctrl+Y`-as-redo) were left as literal
"Ctrl", since that's accurate, not stale. `tokens.ts` had one comment
that turned out to be stale for an unrelated reason (referenced a §78
binding that §83 had already rebound to `F2`/`Shift+F2`, well before
this session) — fixed in passing.

**Playwright test titles** — same "Ctrl/Cmd" vs. literal-"Ctrl" judgment
call, applied per test by checking what each one actually presses, not
a blanket rename: `command-palette.spec.ts`, `drawers.spec.ts`,
`action-drawer.spec.ts`, `find-bar.spec.ts`, `navigation.spec.ts`,
`section-import.spec.ts`, `search-and-history.spec.ts`,
`settings.spec.ts`, `setext-rule.spec.ts`, `tabs-lifecycle.spec.ts`, and
`undo-history.spec.ts` all got title updates for combos that are
Mac-aware. `editor-tokens.spec.ts`, `open-action-nav.spec.ts`, and
`mac-shortcuts.spec.ts` (the file whose entire point is the Ctrl-vs-Cmd
distinction) keep their literal "Ctrl" titles where that's genuinely
what the binding is restricted to.

**A real bug found along the way, not just cosmetic:** §143's original
blanket `"Control+..."` → `"ControlOrMeta+..."` migration of Playwright
key-presses had incorrectly touched three combos that are deliberately
Windows/Linux-only by design — the editor's and Action Drawer's
`Ctrl+Space` (action-state cycle) and the `Ctrl+↑`/`Ctrl+↓` caret-nav
pair (§89/§90) — 15 occurrences across `action-drawer.spec.ts`,
`editor-tokens.spec.ts`, `navigation.spec.ts`, and `open-action-nav.spec.ts`.
`"ControlOrMeta+Space"` resolves to `Cmd+Space` on a real Mac, which
`shortcuts.ts` never binds there (it's OS-reserved for the input-source
switcher) — the test would have silently exercised a no-op key instead
of the feature it claims to test, on any future macOS CI run. Harmless
today only because CI is Windows/Linux-only, where `ControlOrMeta`
happens to resolve to `Control` anyway. Reverted all 15 to literal
`Control+Space`/`Control+ArrowUp`/`Control+ArrowDown` — the one
`"ControlOrMeta+Enter"` press in `editor-tokens.spec.ts` (the editor's
`Cmd+Enter` cycle-state alias) was left untouched since that one really
is Mac-aware.

`svelte-check` 213/0, Vitest 289/289, `cargo test` 47/47, Playwright
168/168 — all unchanged in count (pure comment/title rewording plus one
test-correctness fix that doesn't add or remove a case), all green.

## 146. Reverse action-state cycle, plus three website follow-ups

**Status: implemented, released in v0.7.11 (together with §147).**
Marien flagged four items noted for later in `website/README.md`'s
"Follow-ups" section and asked to build all four.

**A backward action-state cycle.** The existing cycle is one direction
only, `# → v → > → x → #` (`tokens.ts`'s `cycleActionSymbol`, bound to
`Ctrl+Space`/`Ctrl/Cmd+Enter` in the editor and `Ctrl+Space` in the
Action Drawer). Added the reverse (`# → x → > → v → #`) as a new
`direction: 1 | -1` parameter on the same function — one shared
implementation, not a duplicate — defaulting to `1` so every existing
call site is unaffected. Wired up as `Ctrl+Shift+Space` /
`Ctrl/Cmd+Shift+Enter` in the editor (`EditorPane.svelte`'s CodeMirror
keymap) and `Ctrl+Shift+Space` in the Action Drawer
(`toggleActionLine`/`toggleActionLineItem` gained the same `direction`
parameter). Follows the exact precedent the forward cycle already set
for Mac: no binding involving `Space` at all there (mod-resolved
`Space` combos have no safe Mac equivalent), so Mac gets
`Cmd/Shift+Enter` instead — a new `cycleLineStateReverse` entry in the
shared `shortcuts.ts` registry, shown in the Shortcuts & Symbols drawer
right below the forward entry. New tests: `tokens.test.ts` (+2),
`controller.test.ts` (+1), `editor-tokens.spec.ts` (+2),
`action-drawer.spec.ts` (+1), `mac-shortcuts.spec.ts` (+1, confirming
`Ctrl+Shift+Space` is a no-op on Mac and `Cmd+Shift+Enter` is the real
binding there, mirroring the existing forward-cycle Mac test).

**Guide page — plain text and rendered output side by side.** The
"Putting it together" section's two `.snippet` examples (`guide.html`)
used to show only the raw text someone would type. Each now sits in a
`.snippet-pair` next to a second panel rendering the same lines with
the site's existing `.glyph`/`.badge-assignee` classes (already used by
the token-vocabulary table higher on the page) — a section title gets
the app's own double-rule treatment (`border-bottom: 3px double`,
mirroring the editor's real Setext-underline rendering) via a new
`.rendered-title` class, and a bullet gets a `.rendered-bullet` `•`
prefix. Stacks to one column under 640px. Verified via the DOM (page
text, computed styles, element geometry) rather than a screenshot — the
Browser pane's screenshot capture was unreliable for this page
throughout this session regardless of scroll position (blank captures
even at `scrollY: 0` on a fresh navigation); this reads as a pane/CDP
timing issue, not a page bug, given `get_page_text` and computed-style
checks all came back exactly as expected.

**Favicon and social-preview meta tags.** The marketing site
(`index.html`, `guide.html`, `demo.html`) and the demo bundle
(`demo-src/index.html`) had no favicon and no Open Graph/Twitter Card
tags at all — reusing existing baked assets rather than commissioning
anything new, since `src-tauri/icons/` already has the "dated page"
mark (the same one `app.chrononote.mariendegelder.nl`'s `webapp/`
already used for its own favicon, which turned out to already be
covered — the "also missing on the web app" note from the previous
README pass was wrong and is corrected there). Copied `icon.ico` →
`favicon.ico`, `32x32.png` → `favicon-32.png`, `256x256.png` →
`apple-touch-icon.png`, and `icon.png` (512×512) → `og-image.png`, into
`website/assets/` (static pages) and a new `demo-src/public/` (picked
up automatically by Vite's public-dir passthrough into
`website/demo-app/`, the same mechanism `webapp-src/public/` already
used). Each static page's `<head>` gained matching `<link rel="icon">`/
`apple-touch-icon` tags plus `og:title`/`og:description`/`og:image`/
`twitter:*` tags using that page's own existing title and description.

**Screenshots/GIFs of the desktop app — not completed, real tooling
blocker.** The Browser pane's screenshot tool returns an image inline
for viewing but has no way to persist it to a file, and no other tool
available this session can save a browser-rendered frame to disk
either — so there's no way to turn "here's a screenshot" into a
committed website asset without either a different tool or Marien
supplying image files directly. Left this one for Marien to decide how
to proceed rather than fabricating placeholder images.

`svelte-check` 213/0, Vitest 292 (+3), Playwright 172 (+4), `cargo
test` 47 (unchanged — no Rust touched). `website/demo-app/` rebuilt
(`npm run build:demo`) to pick up both the favicon and the reverse-cycle
behavior.

## 147. Status bar collapses its content on narrow windows/screens

**Status: implemented, released in v0.7.11 (together with §146).**
Marien sent a screenshot
of the web app on a phone: the right zone's "Browser storage" badge was
rendering directly against the left zone's clipped, mid-word-cut "Open"
count with no gap at all between them ("OpBrowser storage"). Asked for
a proposal before implementing — two decisions confirmed
(AskUserQuestion, both recommended options): pure CSS breakpoints
rather than a `settleLayout`-style JS/`ResizeObserver` measurement
system (this bar's content is a fixed, known set of text spans, not an
unbounded tab list, so nothing here actually needs measuring); and a
priority order where word count drops first, then cursor position, then
the `Open`/`Closed`/`Forwarded` counts and the storage badge switch to
compact glyph/dot form — the counts and the `?` help button never
disappear, pinned the same way New Scratchpad/Open Date are in the top
bar's own collapse (§144).

**Root cause, not just the symptom.** `#status-bar` is a
`1fr auto 1fr` grid so the centre (transient-message) zone stays
optically centred — but with no message showing, that centre column
collapses to 0 width, and with no `column-gap` set, the left and right
zones' clipped text runs straight into each other. Added
`column-gap: 16px` as an unconditional floor fix (helps even before any
breakpoint engages), then three width tiers on top of it:
- **≤680px:** word count (`#stat-words`) hides first — least useful at
  a glance.
- **≤520px:** cursor position (`#stat-pos`, plus the selection-lines
  readout when present) hides too. The separator that used to sit
  between word-count and the counts is hidden at this same tier
  (`stat-tier2`, on both the position group and that specific
  separator) so `Open`/`Closed`/`Forwarded` never show an orphan
  leading `·` once they become the first thing in the zone.
- **≤420px** (phone width — the exact case reported): `Open 2` /
  `Closed 0` / `Forwarded 0` switch to `☐ 2` / `☑ 0` / `» 0`, the
  version number hides, and the web app's "Browser storage" text badge
  becomes a small static dot (same quiet-dot visual language as
  `#stat-message`/`#stat-updated`'s markers) — the full text moves into
  its `title` tooltip instead of disappearing outright.

**Implementation note:** `#stat-open`/`#stat-closed`/`#stat-forwarded`
(and `#stat-storage-tier`) keep their *own* text exactly as before —
the compact glyph/dot form is a separate sibling span, not a nested
child. Nesting both forms inside the same id'd element seemed simpler
at first, but Playwright's `toHaveText`/`textContent` don't respect
`display: none` (unlike `toBeVisible`/`innerText`), so a naive nested
version would have silently broken every existing exact-text assertion
on those ids (e.g. `#stat-open` reading `"Open 1 ☐ 1"`) and the
`statusCounts()` test helper (which strips non-digits and would have
read `11` instead of `1`). Caught before it shipped by re-running
`status-bar.spec.ts`, not by inspection.

New test: `status-bar.spec.ts` (+1), using `page.setViewportSize()` at
each tier boundary — same reliable, non-flaky technique
`topbar-collapse.spec.ts` already established over pixel-perfect layout
assertions — checking both `toBeVisible`/`toBeHidden` (rendering-aware)
and a manual `innerText` read (since `toHaveText` isn't) for the exact
narrowest-tier text, plus a `scrollWidth`/`clientWidth` check confirming
no overflow at 390px, the width from the reported screenshot. Manually
re-verified live too, against the real built `webapp/` bundle served
locally, at 1000px/650px/500px/390px — DOM/computed-style checks plus
one successful screenshot at 390px confirmed a clean, non-overlapping
bar matching the design exactly.

`svelte-check` 213/0, Vitest 292 (unchanged — pure CSS/markup, no new
unit-testable logic), Playwright 173 (+1), `cargo test` 47 (unchanged).
`website/demo-app/` and `website/webapp/` both rebuilt to pick this up.

## 148. §146's Guide-page rendered examples were too faint to actually see

**Status: implemented, website-only (no version bump — nothing in the
shipped app changed).** Marien, from the live site: *"the `-` does not
render as a dot under what you see. And the `=` do not show as a double
line."* Both elements were genuinely in the DOM with the right
`content`/`border-bottom` computed values (confirmed live via
`getComputedStyle` before touching anything) — this wasn't a markup or
selector bug, it was a color/weight choice bad enough to read as "not
there" once compressed into a phone screenshot.

Root cause: `.rendered-title`'s double rule used `--edge-strong`
(`rgba(255,255,255,0.13)` — a subtle *divider* color meant for
low-emphasis UI chrome borders, not a meaningful rule) at only 3px,
which left the double-border style's two hairlines too close together
to read as two lines at all; `.rendered-bullet::before`'s `•` used
`--muted` (`#858585`). Neither actually matches how the real editor
renders either of these — `.cm-setext-rule` (`src/app.css`) draws its
double rule in `--muted` at a clearly visible weight, and `.glyph-bullet`
renders in full-strength `--text`, not a dimmed color. Fixed by matching
the app's own choices instead of guessing at new ones: title's
border-bottom → `6px double var(--muted)`, bullet's `•` →
`var(--text)`. Verified via a live screenshot this time (not just
computed styles) — both are now clearly visible.

Pure `website/style.css` change, nothing else touched.

## 149. The web app's icon was still the pre-0.4 stock clock, not the current mark

**Status: implemented, no version bump — the desktop app's own build
references none of the files this touched.** Marien: *"Can you check if
the webapp already uses the correct icon?"* It didn't, and the same bug
had just been carried into three files added in §146's favicon work too.

**Root cause:** `src-tauri/icons/256x256.png` is a file `npx tauri icon`
does not produce and has apparently never regenerated — confirmed by
running it fresh here and diffing (every file the tool actually
outputs, `icon.png`/`128x128@2x.png`/`32x32.png`/`128x128.png`/
`icon.ico`/the iOS and Android sets, came back byte-identical to what
was already committed; `256x256.png` wasn't touched at all and isn't
even in the tool's output list). It's a true orphan, still holding the
generic pre-v0.4 "stock white clock" mark from before ChronoNote had
its own iconography at all — confirmed by actually opening the file and
looking at it, not just comparing filenames. §146 trusted it as "the
biggest available correct asset" without checking, and copied it into
`website/assets/apple-touch-icon.png`, `demo-src/public/apple-touch-icon.png`,
and (via that) `website/demo-app/apple-touch-icon.png`. Separately,
unrelated to this session, `webapp-src/public/icons/icon-256.png` (used
for both the web app's `<link rel="icon">` favicon *and* its
`manifest.webmanifest` PWA icon at that size — i.e. the actual browser
tab and home-screen icon a phone user would see) turned out to be
sourced from the same stale file, predating this session entirely.
`icon-512.png`/`og-image.png` were already correct — sourced from
`icon.png`, which was fine.

**Fix:** `src-tauri/icons/256x256.png` overwritten with
`128x128@2x.png` — same 256×256 pixel dimensions, a native (not
upscaled) export from the current master SVG at that exact resolution,
already visually identical in treatment to `icon.png`. Re-copied the
now-correct file to all four downstream consumers listed above, rebuilt
`website/demo-app/` and `website/webapp/`, and reverted the rebuild's
otherwise-unrelated output-file churn (`git diff --ignore-space-at-eol`
showed it was all CRLF/LF noise, not real content) so the commit is
just the six corrected PNGs.

`svelte-check` 213/0, Vitest 292/292 (unchanged — binary asset fix, no
logic touched), `cargo test` 47/47 (unchanged; re-run since `npx tauri
icon` touches files under `src-tauri/`).

## 150. Section History overhaul — browse every occurrence without leaving the drawer

**Status: implemented, released in v0.7.12.** Marien, reflecting on how the
`# (topic)` weekly-grouping habit and top-of-day reminders interact with
the tooling that's grown up around them, asked to improve Section
History directly: make "Previous occurrence" always anchor to today,
give it the full modal width, glyph-render the "From" panel without line
numbers, show a date header for every occurrence (including ones with no
actions, and future ones), make those headers themselves selectable and
able to drive the "From" panel, add an "Only Open" filter, and give the
"From" panel its own scrollbar so a whole section can be reviewed in
place — the point being to review notes and actions from every past and
future occurrence "without having to jump to the individual files/tabs."

**Previous occurrence, always before today.** `findPreviousSectionOccurrence`
used to take the note the drawer was opened from (`fromFilename`) and
look for the newest dated file sorting before *that* — so a drawer
opened from an old note could show something that isn't actually the
most recent prior occurrence relative to today, and a future-dated seed
file was silently invisible regardless of where it stood relative to the
note the drawer was opened from. Now it takes no `fromFilename` at all
and filters strictly on `todayISO()` — "previous" always means "before
today," full stop. Also now spans the full 880px modal width (its own
section, sibling to the list+preview split below it, not confined to the
list's column) — it lost its `45%`-of-parent-height cap in the process
(that only ever worked because it was a flex sibling being stretched to
another column's height) in favor of a fixed 220px, so a long expanded
section scrolls internally instead of pushing the rest of the drawer
around.

**One occurrence per dated file, not just one row per action.** The
aggregation loop used to be a hand-rolled state machine that only ever
noticed a date if it contributed at least one action row; a section with
notes but no `#`/`v`/`>`/`x`/`=>` lines, or one whose only action was
already shown at a more recent occurrence (the existing dedup), left
nothing behind at all — the date silently didn't exist as far as the
drawer could see. Refactored the loop to call the same `extractSectionBody`
helper "Previous occurrence" already used, once per file, building a new
`SectionOccurrence` (`filename`/`date`/full `lines`/`startLineIdx`/this
occurrence's own deduped `items`) for *every* file that has the section
at all — the existing deduped `historyItems` flat list is still produced
alongside it (unit tests + the dedup behavior are unchanged), but the new
`historyOccurrences` store is what the drawer now renders from. Since the
underlying `allNotesCache` already includes every note file on disk
regardless of date, a future-dated file with the section just falls out
of this for free — no separate "look ahead" logic needed.

**Headers are selectable rows now, not just visual separators.** The
list's virtualized row model gained a third row type (a header carries
its own `selIndex` right alongside item rows in one shared keyboard-nav
order) plus a new placeholder row for a zero-action occurrence
(`.modal-empty-inline`, "No actions in this section" — dimmed, no glyph,
not selectable, distinct from both a header and a real row). Clicking or
hovering a header selects it and updates the "From" panel — deliberately
*not* jumping to the file the way clicking an action row does, since
browsing dates without leaving the drawer was the whole point; `Enter`
still jumps to the occurrence's first body line for when you're done
browsing and want to act (`jumpToHistoryOccurrence`, mirroring
`jumpToHistoryItem`). `groupHeaderLabel`'s existing `date · count` format
already reads fine at zero, so the header itself doubles as the "no
actions" indicator's date/count half.

**"From" renders the whole occurrence, glyph-rendered, no line
numbers.** Used to be a raw `±2/+3`-line text window with a padded line
number per row (`hp-context`/`hp-hit`); now shows `fromOcc.lines` in
full via the same `parseGlyphLine` the "Previous occurrence" pane and
the list rows already use, each line a `.hp-line` div carrying
`data-line-idx` so a reactive helper (`scrollFromBodyToHit`, `tick()`
then `querySelector` + `scrollIntoView({block: "center"})`) can focus the
selected action's line — or scroll to the top for a header-only
selection — after Svelte actually paints the new occurrence. `.hp-context`
is its own scrollable region (added to the shared custom-scrollbar
selector list alongside `.modal-list`/`.po-body`) so scrolling a long
section doesn't also scroll the "Shift+Enter inserts"/"Target" sections
below it out of view; those two sections only render at all when an
actual item (not just a header) is selected, since there's nothing to
import or a target line to name otherwise.

**Follow-up (same session, before commit): "From" claims free space
instead of a fixed cap.** First pass gave `.hp-context` a flat
`max-height: 260px`, which Marien asked about directly: does it clip to
a line count like "Previous occurrence" does, or can it use whatever
room is actually free above "Target"? It should, and now does — the
270px number was arbitrary and either wasted space (a header-only
selection, with no Insert/Target below it at all, still capped at 260px
with empty space beneath) or capped a mid-length section that had more
real room available. Reworked as a flex layout instead: `.history-preview`
no longer scrolls itself (`overflow: hidden`, not `auto`); its first
`.hp-section` (always "From" when anything's selected) gets a new
`.hp-section-grow` (`flex: 1 1 auto; min-height: 0`), and `.hp-context`
itself is `flex: 1 1 auto; min-height: 0; overflow-y: auto` — it now
fills whatever the fixed-size Insert/Target sections (when present)
don't need, scrolling internally only once genuinely out of room, and
fills nearly the whole aside when they're absent (a header-only
selection).

**Follow-up (same session, before commit): "Only Open" moved next to the
list it filters.** Marien: it was "taking up too much space at the top"
in its own full-width row under the title, and "out of context" up
there since it only ever changes what's in the list below. Moved from a
dedicated `.modal-input-wrap` row (removed) to a new, compact
`.history-list-toolbar` strip directly above `.modal-list`, scoped to
the list column's width rather than the full 880px modal, right-aligned,
with a thin bottom border separating it from the rows it filters.

**"Only Open" (§150, unobtrusive by design).** A single `.toggle-switch`
— the same component and visual language as the Action Drawer's own
"Only Open" (§44) — off by default (`historyShowOnlyOpen`, session-only
like `actionDrawerShowOnlyOpen`; History defaults to showing everything
since it's a browse-everything review surface, not a worklist). On, it
filters every occurrence's `items` down to `isOpenHistoryAction` (a
leading `# `) and drops any occurrence left with zero remaining items
entirely — not just emptying it, since "only dates with open actions are
shown, not all dates" was explicit.

Test additions: `controller.test.ts` — `findPreviousSectionOccurrence`
cases re-pointed at `vi.setSystemTime` instead of a `fromFilename`
argument, plus a new case proving a future-dated file is ignored
regardless of which note the drawer is opened from; a new case building
`historyOccurrences` across a future/today-empty/past spread; a new
`isOpenHistoryAction` describe block. `search-and-history.spec.ts` (e2e)
— a new case proving "previous" is anchored to today (not the
opened-from note) and asserting the panel's rendered width; a new case
covering selectable headers (a future occurrence, a zero-action one with
its placeholder, and that clicking a header selects without closing the
drawer); a new case for the "Only Open" toggle hiding a fully-resolved
date while keeping one with a surviving open action. Also verified live
against the running mock-backend dev app (not just the automated suite):
a genuinely future-dated note's occurrence appearing above today's,
selecting a zero-action date's header updating the "From" panel to that
file's real content while leaving the drawer open, and the "Only Open"
toggle live-filtering both rows and headers.

`svelte-check` 213/0, Vitest 295/295 (+3), Playwright 176/176 (+3),
`cargo test` 47/47 (unchanged — pure frontend).

## 151. Four "for later" chat-feedback items: releases-list links, clickable update affordances, date-picker bold fix

**Status: implemented, released in v0.7.12.** Four small items Marien flagged
mid-conversation while reviewing §150, explicitly deferred ("for
later") rather than acted on immediately, then addressed together once
§150 was committed.

**"What's changed" (and the "Updated to vX.Y.Z" banner) now open the
full releases list, not one tag.** Marien: About's "What's changed" link
"brings me to the latest version, but I need to then step to 0.7.10 and
0.7.9 to see what else changed" after checking in on an install that was
several releases behind. `openReleasePage(version)` (`menu.ts`) always
opened `.../releases/tag/v{version}` for whichever single version was
found — exactly one release's notes, regardless of how many were
actually missed. Replaced with `openReleasesPage()` (no version
argument), which opens `.../releases` — GitHub's own releases index,
newest first, every release's full notes already stacked inline. Both
call sites (`AboutModal.svelte`'s "What's changed" and the #50 "Updated
to vX.Y.Z" launch banner's "What's new") now point here; a version gap
just means scrolling further down one page instead of re-navigating
per tag. No new UI, no in-app fetching/rendering of notes — stays
consistent with §136's original decision to link out to GitHub rather
than embed release-notes text.

**The version number is now itself a shortcut to About.** Marien: "in
the same pass: clicking on the version number in the bottom right,
should bring me to the about screen as well" — matching the existing
update-available icon right next to it, which already did this.
`#stat-version` changed from a plain `<span>` to a `<button>` (reset to
plain-text styling — no visible border/background — so it doesn't read
as a bigger control than it is) calling `controller.openAbout`.

**The "update available" status message is clickable too.** Marien: "I
get a message in the status bar that there is a new version and I need
to go to the About screen. Would be nice if I can click on that message
[to open About]." `#stat-message` is a generic transient-toast slot
shared by dozens of unrelated messages app-wide, so making the *whole*
slot clickable would have turned every other toast into a misleading
dead link. Instead, `checkForUpdatesOnLaunch`'s toast text is now a
named export (`UPDATE_AVAILABLE_TOAST`, `updates.ts`) and
`StatusBar.svelte` renders `#stat-message` as a `.status-link` button
(same component `#stat-updated`'s "What's new" already uses) only when
the current toast is *exactly* that text **and** `updateStatus ===
"available"` — the second check matters because `updateStatus` stays
`"available"` long after the toast itself auto-clears (2.4s), so
matching on status alone would make an unrelated toast that happens to
fire later, while the update icon is still showing, also render as a
false link.

**Date picker: a day only counts as "has a note" once it has content.**
Marien: "only mark days as having a note (bold) when the file has
content, meaning it is not empty." `DatePickerModal.svelte`'s
`noteByIso` set was built from every key in `allNotesCache` regardless
of content — and since `refreshAllNotesCache()`'s live-tab overlay
writes an open tab's content (including a brand-new, never-typed-into
tab's `""`) directly into that cache, merely *jumping to* a future date
was enough to bold it on the calendar, no typing required. Fixed with
one added `if (content.trim() === "") continue;` before adding to
`noteByIso`. Confirmed as a genuine, previously-uncovered gap: no test
anywhere referenced `.hasnote` before this — new
`tests/e2e/navigation.spec.ts` case creates a fresh future tab via
type-to-jump, confirms it's *not* bold, types into it, confirms it then
*is*.

`svelte-check` 213/0, Vitest 296/296 (+1), Playwright 180/180 (+4),
`cargo test` 47/47 (unchanged — pure frontend).

## 152. About screen: the website link, and a reorganization

**Status: implemented, released in v0.7.12.** Marien: "On the about
screen, show the website as well. And reorganize the about screen,"
then a follow-up once the reorganized layout was reviewed: "Can you add
Website: before the first link, and Project: before the second link?"

**Reorganized from four sections to three.** The standalone "Version"
section (just the version string on its own) is gone — folded into the
title row instead (`About ChronoNote` … `v0.7.11`, right-aligned via the
same `.modal-counter` style History/Search already use for their entry
counts). "Project" (a single GitHub-link row) became "Links", now
holding both `WEBSITE_URL` (`https://chrononote.mariendegelder.nl`,
new — §138/§139's marketing site had never been linked from the desktop
app before) and `PROJECT_URL`, each labeled (`Website:` / `Project:`,
`.settings-inline-label`, the same class #48's Theme/Glyphs rows use)
so the two aren't visually ambiguous. `openReleasePage`/`openProjectLink`
already existed in `menu.ts`; added `openWebsiteLink()` alongside them,
same "open in the OS's default browser, swallow errors" shape.

`svelte-check` 213/0, Vitest 297/297 (+1), Playwright 181/181 (+1),
`cargo test` 47/47 (unchanged — pure frontend).

## 153. Guide page: the "what you see" panel had a duplicate line break, then wasn't pixel-aligned to "what you type"

**Status: implemented, website-only (no version bump — nothing in the
shipped app changed).** Marien, from a screenshot of the live Guide
page: "It shows an extra enter in the what you see of 1 and 2," then,
once that was fixed, "the lines need to line up perfectly between what
you type and what you see" — followed by "The alignment needs to be
pixel perfect... Make sure the boxes are the same size and the lines
are the same height."

**The extra blank line** was a real markup bug: `.snippet`/`.snippet-
rendered` render with `white-space: pre-wrap`, so a literal newline in
the HTML source is itself a line break — the same as a `<br>`. The
"what you see" markup had both, back to back (`<span>…</span><br>` then
a newline before the next `<span>`), so every row broke twice. Fixed by
dropping the `<br>` tags entirely and writing it the same way "what you
type" already was: plain newlines, no `<br>`, relying on `pre-wrap`
alone.

**Fixing that surfaced a real structural mismatch**, not just the
duplicate break: "what you type"'s 4-line section header (title, `=`
underline, two body lines) was being rendered as only 3 rows, because
the title and its underline were merged into one row via a `border-
bottom` on the title itself. The real editor never does this —
`setextRule.ts`/`.cm-setext-rule` (`src/app.css`) draw the underline as
a rule on the underline's *own* line, leaving the title line completely
plain (no bold, no color change) on the line above it. Split into two
lines to match: the title now renders as plain text, and a new
`.rendered-rule` span (wrapping the actual `=` run from "what you
type", not an invented width) sits on its own line below it, using the
same double-gradient-background technique as `.cm-setext-rule`.

**Getting genuinely pixel-perfect took another pass past "looks close
enough."** Two independent things were each pushing rows out of exact
alignment by a few px: (1) `.snippet-rendered` set its own `line-height:
1.7` against `.snippet`'s inherited `1.6` — removed, now both inherit
the same value. (2) `.glyph`/`.badge-assignee` are `display: inline-
block` everywhere else on the site (the vocabulary table, badges in
running prose) — inlined into a row of plain text here, an inline-
block's baseline is *its own* content's baseline, not the surrounding
line's font metrics, so any row containing one (or, for the setext
rule, a row with nothing else to align against at all) landed a couple
of px off from a plain-text row, confirmed directly via
`Range.getClientRects()` on both panels. `.glyph`, `.badge-assignee`,
and the new `.rendered-rule` are now forced to plain `display: inline`
specifically inside `.snippet-rendered` (plus `font-size: inherit`,
since `.glyph` also draws at a deliberately larger 16px elsewhere, which
alone would have inflated just the rows that contain one). After both
fixes, every row's `top` matches "what you type" to the sub-pixel value
measured, and both boxes are the exact same height (verified: 111.71px
and 68.52px, identical to two decimal places) — not just visually
close.

Pure `website/guide.html` + `website/style.css`, nothing else touched.

## 154. Merged title bar — the top bar replaces the native OS title bar

**Status: released as v0.8.0** (a minor bump, not another v0.7.x patch —
v0.7 had already reached 12 releases and this is a genuine user-visible
UI change). Held back from release until Marien's own hands-on test in
the running native window, which surfaced four follow-up fixes (see
below) before sign-off.
Marien: *"the next bigger thing I want you to work on in merging the
title bar and top bar, like I see on many other applications. Notepad
for example has the application icon on the left, then the tabs, and
then the window chrome for minimize, maximize and close... You can lose
the application title. The folder name should move to the status bar."*
Design proposal written and reviewed first
(`docs/design/titlebar-merge-roadmap.md`) — four decisions confirmed via
AskUserQuestion before building: one merged row (not a second toolbar
row); accept losing Windows 11's Snap-Layouts hover flyout (Win+arrow
snapping still works — that's the OS window manager, unaffected); the
folder name in the status bar's left zone, lowest priority; keep
`ChronoNote - <folder>` as the OS-level taskbar/Alt+Tab title even
though nothing renders it in-window anymore.

**`tauri.conf.json`**: `"decorations": false` on the main window — removes
the native title bar and its min/max/close entirely. New capabilities
(`core:window:allow-close`/`allow-minimize`/`allow-toggle-maximize`/
`allow-start-dragging`) confirmed against Tauri's own docs before
adding, not guessed — `core:default` already covered the read-only
introspection calls (`isMaximized`/`isFullscreen`) already in use.

**`TopBar.svelte`** gains, gated on `$backendKind === "desktop"` (real
app *and* the `?mock` Playwright/dev harness — the demo and web app
have no OS window at all and keep the plain top bar unchanged): a new
`AppIcon.svelte` (the real "dated page" logo mark, copied verbatim from
`docs/design/icon-A-master.svg` — deliberately its own component, not
an entry in `icons/paths.ts`'s `currentColor` set, since a title bar
icon is a fixed brand mark that shouldn't re-theme itself, unlike every
other icon in the app); three new window-control buttons (new
`windowChrome.ts` — `minimizeWindow`/`toggleMaximizeWindow`/
`closeWindow`, thin wrappers over `getCurrentWindow()`, new icon paths
`minimize`/`maximize`/`restore` alongside the existing `close`); and
`data-tauri-drag-region` on `#top-bar` and `#tab-bar` themselves (not on
a new child element — confirmed via Tauri's own docs that the attribute
is exact-element-only, doesn't propagate to or interfere with children
lacking it, so tabs/buttons inside stay fully clickable) plus one new
always-present fixed-width `.titlebar-drag-gutter`, so the window stays
draggable even when tabs fill the whole strip with no empty space left.
Double-click-to-maximize is a small explicit `on:dblclick` handler (not
automatic from the drag-region attribute alone, per Tauri's docs),
guarded by `e.target === e.currentTarget` so a double-click that bubbles
up from a tab or button is never mistaken for one on the bar's own
empty background. `settleLayout()`'s existing DOM-measurement-based fit
logic needed no changes at all — it already measures `#tab-bar`'s live
`clientWidth`, which automatically shrinks correctly once the new
fixed-width siblings (icon, gutter, window controls) take their share of
the row.

**`closeWindow()` calls `.close()`, not `.destroy()`** — deliberately:
`.close()` emits the same `tauri://close-requested` event a native close
button, Alt+F4, or the OS "X" already did, so it's routed through the
exact existing §93 exit-barrier logic (flush pending saves, gate on
unsaved scratchpads) with zero behavior change. `mockBackend.ts` gained
one new case (`plugin:window|close` → `emitEvent("tauri://close-requested")`)
so a test clicking the real button exercises the identical path
`exit-barrier.spec.ts` already covers by driving that event directly —
confirmed this was necessary by finding that the mock's existing
catch-all window-command handler was a silent no-op for `close`, which
would have made the safety gate untestable (and, until this fix,
literally inert) for anyone using the new button instead of the OS's own.

**Status bar**: the notes folder name (`folderNameFromPath`, exported
from `boot.ts` rather than reimplemented — the status bar and the
still-kept taskbar title can never disagree about what "the folder
name" means) is now the leading item in the left zone, full path on
`title`-attribute hover, a new lowest-priority `.stat-tier0` CSS tier
(hidden below 860px, before word count's existing 680px tier).

Caught one real naming collision while testing: the new close button's
initial `aria-label="Close"` collided with `getByRole('button', {name:
"Close"})` already in use for Settings' own footer Close button (now
present on *every* page instead of only when a modal happens to be
open) — renamed to `"Close window"`/`"Minimize window"`/`"Maximize
window"`/`"Restore window"`, all now unambiguous.

Verified beyond the automated suite: `npm run tauri dev` launches and
runs cleanly with `decorations: false` and the new capabilities (no
panic, no capability-denied error) — actually dragging the window,
resizing from the edges, and the double-click-maximize/visual
shadow-and-corners questions the design doc flagged are Marien's own
hands-on pass before a release, not reachable from this environment.

**Follow-up (same day, before release): double-click-to-maximize was
firing twice.** Marien's hands-on test: "double-clicking the empty bar
space to maximize/restore is inconsistent. Sometimes maximizes briefly
and then [restores] right away." The original build added an explicit
`on:dblclick` handler (calling `toggleMaximizeWindow()`, guarded by
`e.target === e.currentTarget`) *alongside* the declarative
`data-tauri-drag-region` attribute already on the same elements — belt
and suspenders, since Tauri's docs describe manual `dblclick` handling
as a separate addition on top of the plain attribute. On Windows,
though, `data-tauri-drag-region` already provides native double-click-
to-maximize by itself (almost certainly via the same OS-level
"treat this region as the caption/title bar" mechanism real title bars
use, which the Windows window manager natively double-click-maximizes
regardless of any app-level JS) — so every double-click was toggling
maximize *twice*: once from Windows' own native handling of the drag
region, once more from the app's own redundant listener, landing back
where it started (or, per the report, restoring right after maximizing,
depending on ordering). Fixed by deleting `onTitlebarDblClick` and its
three `on:dblclick` bindings entirely (`#top-bar`, `#tab-bar`, the drag
gutter) — the plain `data-tauri-drag-region` attribute alone now
handles both dragging and double-click-maximize, matching what the
design doc's own "verify empirically" note anticipated might be the
case, just resolved the other direction (turned out the manual fallback
was never needed, and actively harmful to add pre-emptively). The
now-unnecessary `role="presentation"` (added earlier only to satisfy
the `dblclick`-needs-an-ARIA-role a11y lint rule) came out with it.

`svelte-check` 215/0, Vitest 303/303 (+6), Playwright 186/186 (+5),
`cargo test` 47/47 (unchanged — `decorations`/capabilities are config,
not Rust logic). **Not released** — held per explicit instruction until
Marien has tested it in the real app.

**Follow-up: reordered the drag gutter.** Marien: "switch the order of
the top bar buttons and the empty bar space." The fixed-width drag
gutter used to sit between the toolbar cluster and the window controls;
moved to sit between the tab strip and New Scratchpad/Open Date/the
toolbar cluster instead, so New Scratchpad, Open Date, the toolbar (or
"More"), and minimize/maximize/close now read as one clustered group at
the trailing edge — mirroring how the app icon reads as one thing with
the tabs at the leading edge — with the draggable gap sitting between
the two clusters rather than inside the trailing one. Pure markup
reorder in `TopBar.svelte` (the gutter element and its CSS are
unchanged); `settleLayout()`'s DOM-measurement-based fit logic is
unaffected by element order.

**Follow-up: the "restores with a single click soon after maximizing"
report is native OS behavior, not a bug.** Marien noticed that
double-clicking to maximize, then single-clicking the empty bar again
within roughly a second, restores it — but waiting longer needs a full
double-click again. Investigated and explained rather than "fixed":
Windows' own caption-double-click detection treats any two clicks on a
title-bar-equivalent region within the system's double-click time
window as a double-click, regardless of whether the earlier of the two
already completed a *previous* double-click — a real native Windows
title bar exhibits the identical behavior under the same click pattern,
since `data-tauri-drag-region` relies on that same native mechanism
(not a JS click-timer of the app's own). Confirmed with Marien
(AskUserQuestion) to leave this as native behavior rather than replace
it with a hand-rolled JS timing implementation, which would reopen the
door to the same class of race the previous double-toggle fix just
closed.

**Follow-up: the app icon sat visibly higher than every other icon in the
bar.** Marien: "It looks more placed to the top than the other icons on
the top bar." Root cause: `.app-icon` used `align-self: center`,
centering it in the full 40px bar — but `.tab`/`#top-bar .icon-btn`
bottom-anchor a 32px box (§49) inside that same 40px bar, so their own
icons' visual centre sits *lower* than a plain full-height centre would
(an 8px gap only above them, none below). Fixed by giving `.app-icon`
the same 32px-tall box and letting it inherit `#top-bar`'s
`align-items: flex-end` instead of overriding its own alignment —
confirmed pixel-exact via `getBoundingClientRect()` (both the app icon's
and a tab icon's own `<svg>` now centre at the identical y-coordinate,
where they previously differed by several px).

**Follow-up: the icon's top and left margins didn't match.** Marien,
after confirming the vertical fix above: "the space on the top of the
icon is more than on the left. What would you recommend as a UI/UX
designer?" Measured before recommending anything: the 32px-box-in-a-
40px-bar treatment above already gives the icon ~15.3px of room above
it (the bar's own 8px bottom-anchor gap plus ~8px from centring 16px of
icon in a 32px box) — the left margin was still `10px`, an old value
from before that box existed, unrelated to the new vertical rhythm.
Recommended (over enlarging the icon or shrinking the whole bar, both
higher-blast-radius changes that don't directly address an asymmetric
margin) matching the left margin to the same value instead: `10px` →
`16px`, confirmed via `getBoundingClientRect()` landing at 16px left vs.
15.3px top — visually equal, no other property touched. Marien: "Looks
good. Let's keep it like this."

**Follow-up: the active tab didn't follow a maximize→restore.** Marien:
"When I have a tab selected in maximized view and restore the window,
the tab bar does not follow and show the tab. It only changes when I
use the TAB keys or I click [a] visible tab." Root cause: the
`ResizeObserver` added for `settleLayout` (§144/#56) never called
`scrollActiveTabIntoView` — a resize only ever adjusted labels/collapse
state, never re-checked whether the (unchanged) active tab was still
actually visible. Not a regression introduced by this pass specifically
— the gap already existed for any resize — but the new one-click
maximize/restore made it trivial to trigger where before it needed an
actual window drag-resize to notice. Fixed by calling
`scrollActiveTabIntoView()` from the same `ResizeObserver` callback.

Fixing this surfaced a second, genuinely pre-existing bug while writing
the regression test for it: a `ResizeObserver` delivers once
immediately upon `.observe()`, before anything has actually resized —
that initial delivery now also called `scrollActiveTabIntoView`,
racing at mount against `activeTabId.subscribe()`'s own immediate
call. Guarded with a `resizeObserverPrimed` flag so the observer's
first delivery only ever runs `settleLayout` (which already tolerates
being invoked twice via its own `settling`/`settlePending` guard),
leaving the `activeTabId` subscription as the sole source of the
*initial* scroll position.

That still weren't enough on its own — the actual reproducible failure
while testing (not theoretical) was `scrollActiveTabIntoView` reading
`tabBarEl.clientWidth` after waiting only one frame, while
`settleLayout` can take *several* frames to converge through its own
labels → buttons-collapsed → overflow decision sequence; measuring
mid-sequence landed the newly-scrolled-to tab only partly visible.
Fixed by having `scrollActiveTabIntoView` wait out `settleLayout`'s own
`settling` flag (`while (settling) await nextFrame();`) before taking
its measurement, so it always reads the settled width regardless of
whether the two happened to be triggered together.

**Follow-up (same pass): the active tab now peeks its neighbors instead
of scrolling flush to an edge.** Marien, unprompted while the above was
being fixed: "also evaluate that if there is another tab next to the
selected one, to show that one as well, so the selected tab is not the
most left or right tab in view if it is not the most left or most right
tab." `scrollActiveTabIntoView` used to scroll the *minimum* distance
needed — the active tab's edge landing exactly flush with the strip's
visible boundary, indistinguishable from actually being the first/last
tab. New `TAB_EDGE_PEEK` (24px) added to the target scroll position on
whichever side has a real neighbor (checked via the active tab's index
in `displayTabs`, `0`/`length - 1` for "no neighbor to show") — a tab
that genuinely is first/last still scrolls flush, since there's nothing
there to peek.

New coverage for all of the above in `merged-titlebar.spec.ts` (a
previously-fully-uncovered area — no test anywhere had ever exercised
`scrollActiveTabIntoView` before this): resize-without-activeTabId-
change re-scrolls; a middle tab shows a sliver of both neighbors; the
genuine first tab scrolls to `scrollLeft: 0` exactly, no phantom peek.
Test widths deliberately stay at or above the app's own real
`minWidth: 640` (`tauri.conf.json`) — an earlier draft of these tests
used narrower widths and hit a degenerate `#tab-bar` `clientWidth: 0`
layout state the shipped app (which enforces that minimum) can never
actually reach.

**Follow-up (for later, addressed in the same pass): the action-cycle
hover preview no longer underlines.** Marien: "when I hover over an
action in the editor, the preview of the next action shows an
underline. Can you change that?" `.glyph-cyclable-preview` (§34) used
to combine reduced opacity with a dashed underline to read as
provisional; the underline cut visibly through the small glyph
characters. Dropped, keeping only the opacity dimming.

`svelte-check` 215/0, Vitest 303/303 (unchanged — pure frontend
interaction logic, already covered by the new Playwright cases above),
Playwright 189/189 (+3).

## 155. Section History modal capped at 80% of window height

**Status: released as v0.8.1.** Marien, right after
testing the just-shipped v0.8.0 title-bar merge: *"the section history
takes up too much space if the From: section text is too long. The
modal should not take up more than the height of 80% of the window or
so. If it does, a scrollbar needs to be shown for the From: section, so
the rest of the text is always visible."*

Root cause: nothing capped `.modal-card`'s overall height. The "From"
panel (`.hp-context`, §150) already had `flex: 1 1 auto; overflow-y:
auto` from when it was built, but that only does anything once an
ancestor actually has a *bounded* height to divide up — with the card
itself free to grow to fit its content, `.history-body` (and everything
inside it) just took its natural content size instead of competing for
a fixed budget, so a long occurrence grew the whole card past the
viewport rather than triggering its own scrollbar.

Fix, scoped to this modal (`app.css`) rather than the shared
`.modal-card` rule every other drawer also uses, to avoid touching
modals that already fit comfortably within 80vh: a new
`.history-modal-card { max-height: 80vh; }`, applied via a second class
on `HistoryModal.svelte`'s root card alongside `.modal-card`. `
.history-body` gained `flex: 1` (it previously had no flex-grow of its
own, only `min-height: 0`) so it actually claims the space the now-capped
card leaves after the header, the "Previous occurrence" panel, and the
footer — which is what lets `.hp-context`'s pre-existing `flex: 1 1
auto` and `overflow-y: auto` finally do their job.

Verified live in the running mock-backend dev app: typed an 80-line
block into a section, confirmed via `getBoundingClientRect()` that the
card holds to exactly 80% of the viewport height at both 720px and
600px window heights, and that `.hp-context`'s `scrollHeight` exceeds
its `clientHeight` (i.e. it's genuinely scrolling, not just clipping).
New Playwright case in `search-and-history.spec.ts` seeds an 80-line
section and asserts both of those facts directly, so a future regression
that removes the cap or the flex chain fails a real assertion instead of
only showing up in manual testing.

`svelte-check` 215/0, Vitest 303/303 (unchanged — pure CSS/layout fix),
Playwright 190/190 (+1), `cargo test` 47/47 (unchanged — pure frontend).

## 156. Top-bar label/collapse tiering refactored (#57)

**Status: released as v0.8.2.** Marien filed #57: "Whenever
I type something in the main input, the top bar buttons expand and
collapse very quickly. When making the windows smaller and larger, same
thing happens. When the window is maximized either all buttons with
labels are shown, or only the collapsed buttons are shown, and never all
buttons without labels. When the window is restored, either all buttons
without labels are shown, or only the collapsed buttons are shown, and
never all buttons with labels. ... This functionality needs to be
refactored and fully tested out for the next release."

Two independent bugs in `TopBar.svelte`'s `settleLayout`, both now fixed,
plus one design mismatch corrected per Marien's explicit choice
(AskUserQuestion) once it surfaced during investigation:

**Bug 1 — typing flickered the top bar.** Every keystroke calls
`updateActiveTabContent()`, which is a `tabs.set()` on every content
change, not just a tab being added/removed/renamed. `TopBar.svelte`
subscribed to `tabs` directly to decide when to re-run its layout
settling, so every keystroke re-ran the *entire* decision — and
`settleLayout`'s "try a better tier" branches unconditionally flip state
and measure again even when nothing about available width could
possibly have changed (that's what "decide from current state" means:
try harder, then revert if it doesn't fit). The result: a burst of
keystrokes visibly flashed labels/buttons on and off, over and over, for
no reason. Fixed with `layoutSignature()` — reduces a tab list to only
the fields that can actually affect the tab bar's rendered width
(id/isScratchpad/filename, and the scratchpad "unsaved" dot's on/off
state) before deciding whether to call `settleLayout()` at all. A
keystroke changes a tab's `content`, never any of those, so the
signature comes out identical and `settleLayout()` is never invoked.

**Design mismatch — labels were maximize-gated.** Action-button labels
required the window be maximized/fullscreen (`chromeExpanded`) on top of
having room — a restored window, however wide, could never show them at
all. This was §26's original design, predating the merged title bar; by
the time `docs/spec.md` was rewritten to describe the tiering as purely
width-driven, the code never caught up. Marien's bug report ("when
restored... never all buttons with labels") matches this exactly.
Presented as a choice (AskUserQuestion): keep the maximize gate and only
fix the flicker, or make labels purely width-driven to match spec.md.
Marien chose the latter. The `chromeExpanded` check in `settleLayout` is
gone entirely — a maximize/restore still re-triggers layout correctly
via the existing `ResizeObserver` (maximizing genuinely changes
`#top-bar`'s width), so nothing was lost by dropping the explicit
`chromeExpanded.subscribe`.

**Bug 2 — buttons could stay collapsed for no reason, found while fixing
the above.** Once labels stopped being maximize-gated, a new, previously
unreachable interaction surfaced: widening a window from a narrow,
collapsed state could leave the secondary action buttons collapsed into
"More" even at a width where they'd fit fine *without* labels — because
the buttons-collapse fit-check ran immediately after the labels decision
committed, measuring against a DOM where labels had *just* turned on
moments earlier in the same pass, understating how much room the buttons
actually had. The documented priority order says labels are the first
thing to drop, buttons collapsing is the last resort — but the code
didn't actually enforce that ordering when both decisions changed within
one settle pass. Fixed by having the buttons-collapse check retry once
with labels forced off before concluding a collapse is truly necessary —
skipped entirely when labels are already off, so this adds no extra
measurement or flicker risk to the common case. Found via a real,
reproducible Playwright failure (an existing #56 test — "widening the
window back un-collapses the buttons" — started failing once labels
were reachable at that width), not by inspection alone; confirmed against
the *unmodified* code first (same result) to rule out a pre-existing
flaw versus something the fix introduced, before concluding the ordering
bug was newly *reachable*, not newly *created*.

Verified: a Playwright `MutationObserver` on `#top-bar`'s subtree records
zero mutations while typing a full sentence, in both the icon-only/
collapsed tier and the (now-reachable) labeled tier — confirming
`settleLayout` genuinely never runs, not just that its result happens to
look stable. A companion test confirms a wide-enough restored window now
shows labels at all. Two pre-existing tests in `merged-titlebar.spec.ts`
needed hardening from one-shot `boundingBox()` reads to `expect.poll()`
— `settleLayout` now legitimately takes a couple more frames to converge
in the specific case Bug 2's retry covers, and those tests' immediate
reads occasionally caught an intermediate frame rather than the (still
correct) final settled state.

`svelte-check` 215/0, Vitest 303/303 (unchanged — pure frontend
interaction logic), Playwright 193/193 (+3), `cargo test` 47/47
(unchanged — pure frontend).

## 157. About moved from the top bar to the status bar (#58)

**Status: released as v0.8.2.** Marien filed #58: "Remove
the about button from the top bar, and add it's icon to the bottom bar
between the version number and the Shortcuts & symbols ? button."

`TopBar.svelte`'s individual About button (and its entry in the
collapsed "More actions" popover, `MoreActionsModal.svelte`) removed
outright — About no longer competes with the tab strip for room or folds
into "More" on a narrow window, since it's leaving the collapse group
entirely, not just moving within it. A new `.status-about-btn` icon
button added to `StatusBar.svelte`'s right zone, between `#stat-version`
and the `?` Shortcuts & Symbols trigger, reusing the same quiet
unlabelled-icon treatment `.status-update-btn` (the update-available
icon right next to it) already established. The status bar's zones don't
collapse the way the top bar's action row does, so About is now reachable
at any window width — the actual point of the move, not just a cosmetic
relocation.

`docs/spec.md` updated in three places: the top bar's action-button list
(§3.2, both the full list and the "collapses into More" tier), and a new
mention alongside the version number and update icon in the status bar's
right zone (§3.3); §5's drawer list now notes About's icon lives in the
status bar, not the top bar.

New/updated Playwright coverage: `topbar-collapse.spec.ts`'s existing
#56 tests no longer assert About's top-bar presence (asserting `Settings`
in the "widening the window back" test instead, to keep that test
meaningful) and gained one asserting About is *absent* from "More
actions"; `status-bar.spec.ts` gained two cases — the new button sits in
the correct DOM order and opens About, and it stays clickable at a
narrow width where the old top-bar button would have collapsed.

`svelte-check` 215/0, Vitest 303/303 (unchanged — pure frontend), Playwright
195/195 (+2), `cargo test` 47/47 (unchanged — pure frontend).

**Follow-up (same day): the icon's own styling didn't match its new
neighbor.** Marien, after testing: "match the design of the about icon
with '?' icon, which has a button-like outline. The about icon looks
slightly miscentered as well looking at the '?' icon and the version
number." `.status-about-btn` had borrowed `.status-update-btn`'s
borderless treatment (its nearer sibling in the source, but the wrong
visual reference — that button reads as a quiet inline glyph, not a
button). Restyled to match `.status-help`'s actual box instead: the
same 16px square, 1px border, 3px radius, and hover fill. Fixed the
centering as a side effect, not a separate tweak — `.status-update-btn`
had no fixed box at all, so the icon's own rendered size was the only
thing holding its position; matching `.status-help`'s square (and
`justify-content: center` alongside its existing `align-items: center`)
centers the icon within a real box the same way `?` sits in its own.
Verified via computed geometry, not by eye: the About and `?` boxes
came out pixel-identical (16×16, matching top/bottom edges), their
shared vertical center exactly matches the version text's own center,
and the icon sits with an equal 2px margin on all four sides of its box.

## 158. Section History's action list fills its column height (#59)

**Status: released as v0.8.2.** Marien filed #59: "The
list of actions in the left column sticks to a fixed size, while the
right column is growing larger. This makes it look like the list of
actions is incomplete. Can you make it fill the space it can have?"

Root cause: the shared `.modal-list` CSS rule caps at `max-height: 380px`
— correct for Action Drawer and Cross-Tab Search, whose `.modal-card` has
no height cap of its own, so that 380px is the *only* thing stopping
their list from growing unbounded with a long enough result set. Section
History is different since §155: its card is already capped at 80vh
(`.history-modal-card`), and its "From" column (`.hp-context`/
`.hp-section-grow`) already fills whatever room that leaves via `flex: 1
1 auto` with no fixed cap. The action list on the left never got the same
treatment — it kept the shared 380px ceiling regardless of how much
taller the card (and the column next to it) actually was, so on anything
but a short window the list visibly stopped well short of the "From"
column's height, reading as truncated rather than simply short on
content.

Fixed with a scoped override, `.history-main .modal-list { max-height:
none; }` — the list already had `flex: 1` (inline, from the virtualized-
list markup shared with Action Drawer/Search), so removing just the
`max-height` for this modal specifically lets it fill `.history-main`'s
real available height the same way `.hp-context` already does, bounded
by the same 80vh card cap. Action Drawer and Search keep the shared
380px cap untouched — verified directly (not just by reading the CSS):
opened both after the fix, at the same tall window that made History's
list grow past 380px, and confirmed their own lists still measured
exactly 380px.

Verified the fix scales correctly across window heights, not just at one
size: at a 1000px-tall window, `.history-main`/`.history-preview` (the
two columns) grew to 637.5px each, and the list's own box grew to
612.9px within that (the remaining ~25px going to the "Only Open" toolbar
strip above the list) — matching column heights at every size tried, not
a coincidence at one viewport.

New Playwright case seeds 20 recurring occurrences of one section at a
900px-tall window and asserts `.history-main` and `.history-preview`
measure the same height, and the list itself exceeds the old 380px cap.

`svelte-check` 215/0, Vitest 303/303 (unchanged — pure CSS), Playwright
196/196 (+1), `cargo test` 47/47 (unchanged — pure frontend).

## 159. Settings modal can grow, and its scrollbar matches the rest of the app (#60)

**Status: released as v0.8.2.** Marien filed #60: "Allow
the Settings Modal to be bigger if there is enough size. Style the
scrollbar the same as the main content window."

Two independent fixes, same modal:

**Size.** `.settings-section` capped at a fixed `max-height: 380px`
(added in §141 when the web-app "Data" section made the modal tall
enough to slide under the status bar's higher z-index, §102, and swallow
the Close button's click). That fixed cap meant Settings always scrolled
internally past five sections regardless of how much taller the window
actually was — the same class of bug as #59's Section History list, and
fixed the same way (§155/§158's pattern): `.settings-modal-card` now
caps the whole card at 80vh, well clear of the status bar at any window
size, and `.settings-section` fills whatever that leaves via `flex: 1;
min-height: 0` instead of a fixed ceiling. On a tall window all five
sections (Appearance, Editor, Updates, Notes Location, Data) now show
without any scrolling at all; on a short one, the card still caps at 80%
of the window and the section scrolls internally exactly as before —
verified both ways, not just the tall case, including confirming the
Close button stays reachable and clear of the status bar at a 500px-tall
window.

**Scrollbar.** `.settings-section` was never added to the shared thin-
scrollbar rule set (`.cm-scroller`, `.modal-list`, `.hp-context`, etc.)
when it became scrollable in §141 — it's been using the OS-default
scrollbar ever since, the literal second half of Marien's report. Added
to all five shared selector groups (base `scrollbar-width`/`-color`, and
the `::-webkit-scrollbar`/`-track`/`-thumb`/`-thumb:hover` pairs), no new
rules needed since it already uses the same design tokens as everything
else.

New Playwright coverage: one case confirms every section is visible with
`scrollHeight <= clientHeight` at a tall window and that `scrollbar-width:
thin` is applied; another confirms the card still caps at 80% of a short
window, scrolls internally (`scrollHeight > clientHeight`), stays clear
of the status bar, and Close still closes the modal.

`svelte-check` 215/0, Vitest 303/303 (unchanged — pure CSS), Playwright
198/198 (+2), `cargo test` 47/47 (unchanged — pure frontend).

## 160. Top-bar tab-id collisions and resize flicker (#61)

**Status: fixed.** Marien filed #61 after testing v0.8.2's #57 fix:
"I have tried the top bar buttons in different sizes, resizing, etc. The
behavior is still inconsistent (read buggy). When dragging the right
side of the window to resize, the top bar is flickering constantly as it
is trying to show content and then hide it again. Also opening and
closing tabs, leads to inconsistent behavior where sometimes the buttons
stay collapsed while there is enough room," with a precise repro: 10
tabs restored → collapsed; maximize → stays collapsed; close one tab →
uncollapses; restore → collapses; maximize → uncollapses; reopen the
closed tab → *stays* uncollapsed, unlike the very first step with the
same 10-tabs-maximized combination.

Two independent bugs, found by instrumenting `settleLayout` and
reproducing both live rather than guessing from the code:

**Bug 1 — tab ids could collide, silently under-rendering the tab
strip.** Every tab id was a bare `` `tab-${Date.now()}` `` (`tabs.ts`) —
`Date.now()`'s 1ms resolution (coarser still under some Windows timer
configurations) means two tabs created close enough together get the
*identical* id. `TopBar.svelte`'s `{#each displayTabs as tab (tab.id)}`
keys on exactly this id: two tabs sharing one collapse into a single
shared DOM node, so the tab strip renders *fewer tabs than actually
exist* — confirmed directly (10 tabs in the store, only 2 `.tab`
elements in the DOM, all nine scratchpads carrying the exact same id).
Every width/overflow measurement `settleLayout` makes is then wrong for
as long as those tabs stay open, which explains #61's reported
inconsistency far better than anything in the tiering logic itself: the
*same* nominal state (10 tabs, maximized) produced different results
depending on exactly which of those tabs happened to collide and when.
Fixed with a shared `generateTabId()` using `crypto.randomUUID()`
instead of a timestamp, applied at all four call sites that lacked a
uniqueness salt (`createScratchpad`, `openOrCreateDatedFile`,
`reopenLastClosedTab`'s scratchpad path, `promoteScratchpad`'s new-today-
tab path). `boot.ts`'s own two id sites were already safe — they salt
with the tab's filename, which is genuinely unique per dated note.

**Bug 2 — upgrading a tier always flashed it first, even while only
ever getting narrower.** The "try a better tier, revert if it doesn't
fit" pattern (§156) is the only way to measure a tier that isn't
currently rendered, but it ran unconditionally on *every* settle call —
including ones triggered by the window getting narrower, where trying a
wider tier can never succeed. Confirmed with a simulated continuous
narrowing drag (a `MutationObserver`-adjacent state-sampling test):
every single step flashed labels or the full button row on for a frame
before reverting, the entire way down — "flickering constantly," exactly
as reported. Fixed by gating upgrade attempts on `allowUpgrade`, computed
per caller: the `ResizeObserver` only allows one when `#top-bar` has
actually gotten *wider* since the last attempt (by a real margin, not
just any amount — retrying on every few-pixel tick during a slow widen
flickered almost as badly, just in the other direction), carried through
`settleLayout`'s own re-entrancy coalescing so a genuine widen among
several coalesced calls doesn't get dropped; the `tabs.subscribe` path
(closing/renaming a tab can free room with `#top-bar`'s own width
unchanged) always allows one, since it fires far less often than a
drag ever could and was never the source of the flicker. The *downgrade*
checks are never gated — shrinking must always be free to react.
Narrowing is now flicker-free entirely (confirmed: zero direction
reversals across a full-range simulated drag); widening is greatly
reduced but not perfectly zero — actually rendering a wider tier to find
out whether it fits is an inherent constraint no retry margin fully
removes, and the residual few flashes are bounded to right around the
actual fit boundary rather than constant throughout the drag.

New coverage: a Vitest test creates several scratchpads under a frozen
clock and asserts every resulting id is unique (directly reproducing
Bug 1's exact trigger); two Playwright tests in `topbar-collapse.spec.ts`
assert the DOM tab count matches the store's after rapid creation, and
that simulating a continuous narrowing drag never shows a collapse-state
reversal.

`svelte-check` 215/0, Vitest 304/304 (+1), Playwright 200/200 (+2),
`cargo test` 47/47 (unchanged — pure frontend).

## 161. Eliminating the residual widen-direction top-bar flicker (#61 follow-up)

**Status: fixed.**

Marien, after testing §160's fix: "I tested it. There is still a small
flicker when increasing the window size that is not visible when
decreasing the window size." Exactly the residual §160 disclosed as an
inherent limit of its own approach — narrowing was provably flicker-free,
but every upgrade attempt (icon-only → labels, collapsed → uncollapsed)
still worked by flipping the live, visible state first and reverting if
it turned out not to fit, which is the only way to measure a tier that
isn't currently rendered. Traced precisely: Svelte's DOM patch for a
state write lands via a microtask, which always resolves *before* the
next `requestAnimationFrame` `settleLayout` awaits — so the browser
paints the trial tier for at least one real frame whenever a revert
happens, guaranteed, not just as a theoretical race. `allowUpgrade`
(§160) only reduced how *often* an attempt fired; it did nothing about
each attempt that still did.

Given the choice between leaving this as documented, reducing frequency
further (a bigger retry margin), or eliminating it outright, Marien chose
elimination despite the larger surface area. Fixed by predicting the
outcome *before* ever touching the live state, using off-screen
measurement clones that are never part of the visible layout at all:

- `predictLabelsWouldFit()` computes the width a label would add to a
  button that's currently icon-only (a fixed off-screen `<span
  class="icon-label">` per label text, whose `getBoundingClientRect()`
  width plus `.icon-btn`'s own 6px flex `gap` — which only manifests once
  a label exists as a second flex child — gives the exact marginal cost),
  sums the applicable ones (Date always; the rest only if buttons aren't
  currently collapsed), and checks whether the tab strip's actual content
  width would still fit the tab bar's projected width after that delta is
  subtracted. `#tab-bar` is the flex layout's only `flex: 1` child (every
  sibling — the app icon, the button cluster, the drag gutter, the window
  controls — is fixed-width), so "current tab-bar width minus the
  cluster's width increase" is an exact, not approximate, prediction.
- `predictUncollapseWouldFit(labelsOn)` does the same for the "More"
  button expanding back into the full secondary-action row, using
  off-screen full-button clones (icon + conditional label, mirroring
  `showActionLabels`) compared against the live "More" button's own
  current width. Takes a hypothetical `labelsOn` rather than just reading
  the current value: the real uncollapse logic (§57) has its own embedded
  fallback — try with labels as they currently are, and only if that
  overflows, retry with labels forced off — and an initial version of
  this fix that predicted only the "as-is" case wrongly refused an
  uncollapse the live fallback would actually have found room for,
  caught by the pre-existing `topbar-collapse.spec.ts` regression test
  for exactly this scenario (a large single jump from 480px to 1280px,
  which needs the labels-off combination to fit) — not a new bug so
  much as an incomplete first draft of the prediction, found by running
  the existing suite before considering this done.

Both predictions gate the *upgrade* branches only (`else if (allowUpgrade
&& predict...())`) — the existing flip-measure-revert code stays in
place as a safety net for the rare case a prediction is off by a pixel,
rather than as the routine path. The *downgrade* checks (§156/§57) are
untouched; they were never gated at all, by design, since shrinking must
always be free to react immediately.

The off-screen clones are deliberately *not* full copies of the live
buttons: no `data-*-trigger` attributes, so `DatePickerModal`'s/
`MoreActionsModal`'s anchor-lookup queries can never accidentally match a
hidden clone instead of the real, visible trigger (confirmed by checking
those queries before adding the clones — this was the actual risk that
made "just clone the live markup" unsafe); no click handlers; `aria-hidden`
+ `inert` keep them out of the accessibility tree and unreachable by
keyboard. Positioned via a new `.topbar-measure` CSS class (`position:
fixed; visibility: hidden`) so they're genuinely laid out by the browser
(real, accurate `getBoundingClientRect()` widths) but never part of
`#top-bar`'s own flex flow and never painted to the screen. Same
"keep two things in sync" caveat as `mockBackend.ts` mirroring
`storage.rs`: a future icon/label change to a button has to be mirrored
into its measurement clone too.

New Playwright coverage: `topbar-collapse.spec.ts` gains a widening
counterpart to §160's narrowing-reversal test — the exact same
continuous-drag methodology, direction reversed (700px → 2200px,
20px steps), asserting zero collapse→uncollapsed→collapsed reversals
across the whole range.

`svelte-check` 215/0, Vitest 304/304 (unchanged — pure frontend/CSS,
no unit-testable logic beyond what §160's tests already cover), Playwright
201/201 (+1), `cargo test` 47/47 (unchanged).

## 162. Calendar sync via a local `.agenda.json` file (v0.9.0)

**Status: fixed, released in v0.9.0.**

Marien: "I want to start working on updating sections based on my
Microsoft 365 calendar... Can you come up with a design?" — the full
design (`docs/design/m365-calendar-import-roadmap.md`) specified Entra
ID OAuth2+PKCE via the system browser, a Graph `calendarView` fetch, and
a reconciliation mechanism worked out directly with Marien: a section
"belongs" to an agenda item if its title matches; the calendar block is
the contiguous span of sections currently matching *some* item in the
day's agenda, re-derived fresh on every sync with no persisted memory
of past syncs. Matched sections keep their content and get reordered to
the agenda's current order; unmatched agenda items become new empty
sections; sections that no longer match are removed outright if empty,
or — if they have content — surfaced in a review step for move-to-
another-day / discard / leave-flagged (reusing the `[CANCELED]` prefix
`normalizeHeaderTitle()` already strips).

The OAuth side was fully built (Entra OAuth2+PKCE, a `tiny_http`
loopback listener, refresh token in the OS keychain, Settings UI for a
client-ID/tenant override) and tested against a real beta build, but
hit a real, unresolvable blocker: Marien's organization requires Entra
admin consent for the app's requested Graph scopes, which Marien
decided not to request. Rather than abandon the reconciliation work —
the genuinely novel, hard part — Marien proposed a different source:
"I have thought of a different approach for syncing with a calendar.
Let's drop all the support and references to M365. The calendar
information will instead come for a file called .agenda.json that is
located in the Notes folder," with the exact JSON schema and rules
specified directly (an array of `{date, start, end, title}` objects;
sort by date/start; de-duplicate exact-duplicate entries but keep
same-title entries at different times as separate meetings; on a typo
in the original spec, corrected the same day — a missing, blank, or
`[]` agenda file is an error, not a valid empty calendar, since none of
those states are ever produced by a genuine successful sync).

This replaced only the "where do the events come from" layer — the
reconciliation engine and its review UI (`calendarReconcile.ts`,
`CalendarSyncReviewModal.svelte`) are exactly the design above,
unchanged, since they only ever consumed a plain `string[]` of agenda
titles. Removed entirely: `src-tauri/src/m365.rs` and 7 Cargo
dependencies (`reqwest`, `keyring`, `tiny_http`, `base64`, `rand`,
`url`, `iana-time-zone`). Added: `src-tauri/src/agenda.rs::
read_agenda_for_date`, which reads `.agenda.json` from the notes
folder, scopes to the requested date, sorts, de-duplicates, and errors
on anything that isn't a genuine non-empty array of well-formed
meetings — a day within a *valid* file that simply has no entries is a
legitimate empty result, not an error; only the whole file being empty
or invalid is rejected. A separate `agenda_file_exists` command (a
cheap existence check, deliberately not the fuller validation) backs
the button's gray-out state.

The originally-paired manual "Sync from a list…" paste entry point was
dropped once the file-based sync covered the case it existed for
("Marien: I am not sure this will work right away on my organization,
so I want a way to enter the sync flow... by providing a list" — the
de-risking that motivated it in the first place). "Sync calendar for
this day" is opt-in (a new `AppConfig.calendarSyncEnabled`, off by
default — Marien: "make having that sync button a Setting that only
shows up when turned on"), grayed out rather than removed when
`.agenda.json` doesn't exist yet or the active tab isn't dated today or
later, and bound to a new `Ctrl/Cmd+Shift+C` shortcut through the
shared `shortcuts.ts` registry.

Two real bugs found via hands-on testing on Marien's real agenda data,
neither caught by the original test suite: (1) unchecking a meeting in
the review step silently did nothing when its title had stray
whitespace — `confirmCalendarSync`'s exclusion filter compared the
*trimmed* checkbox title against the *raw, untrimmed* stored title, so
the match never fired; fixed by trimming once, at the source, in
`openCalendarSyncReview`. (2) a disabled `.icon-btn`/`.more-actions-item`
never actually looked disabled — neither class had ever had a
`:disabled` rule, and the toolbar icons theme with `currentColor`, so a
grayed-out button was pixel-identical to an enabled one; fixed with an
explicit dimmed `:disabled` style, which also fixed the same
long-standing gap on Settings' Export/Import buttons.

Also fixed a regression the "Sync from a list" removal itself
introduced: the #61-era top-bar collapse-width prediction functions
(`predictLabelsWouldFit`/`predictUncollapseWouldFit`) had that now-
deleted button hardcoded into their off-screen measurement clones —
caught by re-running the existing Playwright suite, not by inspection.

Desktop/demo only — the web app has no local notes folder to read
`.agenda.json` from, so the button (and the Settings toggle for it)
never appear there.

`svelte-check` 217/0, Vitest 318/318, Playwright 207/207, `cargo test`
57/57.

## 163. Settings modal is now tabbed

**Status: fixed, released in v0.9.0.**

Marien, while asking for the calendar-sync changes above: "While you
are modifying the Settings drawer, look into making it a tabbed
interface for 1) Appearance and Editor, and 2) Calendar, Notes and
Data, and 3) Updates." Settings had grown into one long scrolling list
(Appearance, Editor, Updates, Calendar, Notes Location, Data) across
several earlier sections (§99–§110, §141, §159); split into three tabs
matching Marien's own grouping, using the existing `Segmented` component
as the tab switcher rather than inventing new tab UI. "Updates" is
dropped from the tab list entirely on the web app, where nothing in it
applies (same gate the section itself already used). Not persisted
across opens — always starts on "Appearance & Editor," same as any
other freshly-opened modal.

Six existing Playwright specs needed updates for controls that moved
behind a tab that isn't the default one (`settings.spec.ts`'s directory-
switching and height-cap tests, `status-bar.spec.ts`'s and
`update-check.spec.ts`'s "Check now" interactions) — each now clicks the
relevant tab before touching a control it used to find directly on the
single unscrolled list.

`svelte-check` 217/0, Vitest 318/318, Playwright 207/207, `cargo test`
57/57 (unchanged — pure frontend).

## 164. Section History (and Action Drawer / Search's "All Files") opens instantly, with a spinner while the disk read is still catching up

**Status: fixed, released in v0.9.1.**

Issue #62: "When I am opening Section History for the first time after
start of the application it takes a bit of time for the drawer to open,
making me wonder if I pressed the correct key. I assume this is because
of reading all the files." Marien's own two suggestions — a loading
indicator, and starting the read in the background right after launch,
without delaying becoming interactive — are exactly what's implemented
here.

Root cause: `openMeetingHistory()` (`history.ts`) awaited
`refreshAllNotesCache()` — which reads every note file from disk the
first time anything asks for it each session (§38's shared
`diskNotesCacheRaw`) — *before* setting `modal.set("history")`. Nothing
was on screen to show progress on, and the whole drawer simply didn't
appear until the read finished. Asked whether the "open immediately +
spinner" half should also cover Action Drawer's and Cross-Tab Search's
own "All Files" toggles, since they share the identical cold-start cost
against the same cache — confirmed: "Apply to all four." (Export was
checked too: `SettingsModal.svelte`'s existing `exporting` flag + button-
text change already covers it, so it needed no change.)

Two independent pieces, matching Marien's own two-part suggestion:

1. **Open immediately, show a spinner while the read is in flight.**
   `openMeetingHistory()` now opens the modal (with empty stores) *before*
   awaiting the cache, gated by a new `historyLoading` store
   (`stores.ts`). `HistoryModal.svelte` shows the existing `.modal-spinner`
   (reused from About/date-picker/Search, not reinvented) in the header
   counter and as an empty-list placeholder while `historyLoading` is
   true. Action Drawer's `setScope` gained a `loadingAllFiles` flag with
   its own spinner next to the scope toggle; Search's `setScope` reuses
   its existing `searching` flag (previously scoped to the debounced
   per-keystroke "All Files" rescan) around the initial cache-population
   await too — the two code paths run at non-overlapping times, so
   nothing about `searching`'s original behavior changes.
2. **Warm the cache in the background at boot, so the above is usually a
   no-op.** `boot.ts`'s `initApp()` now fires `void refreshAllNotesCache()`
   right after tab restore — the same fire-and-forget pattern already
   used for `checkForUpdatesOnLaunch()` — so the disk read starts as soon
   as the app has something to show, without ever delaying becoming
   interactive. By the time any of the four drawers is actually opened,
   the read has usually already finished; the loading indicators above
   are the fallback for whenever it hasn't (a very large notes folder, or
   a very fast keypress right after launch).

Fixing this surfaced a real (if narrow) latent race that #1 made far more
likely to actually happen: `refreshAllNotesCache()`'s "read from disk only
if the cache is still null" guard assumed only one caller would ever hit
a cold cache per session. With boot now *always* kicking off a read, a
user opening a drawer before it resolves would see the same null cache
and fire a second, redundant `api.readAllNotes()` of its own — doubling
the very disk read this fix exists to only pay once. Fixed with an
in-flight promise (`diskReadInFlight` in `persistence.ts`): every
concurrent caller awaits the one real read instead of starting another.

`HistoryModal.svelte`'s existing `onMount`-time "select the active tab's
own row" convenience only runs once, at mount — if history data now
finishes loading asynchronously *after* that (the cold-cache case), that
selection doesn't retry. Left as-is: rare in practice once the boot warm
has had a chance to run, and not worth the reactive-retrigger risk this
codebase has been bitten by before (§55/§56/§60/§61) for a minor,
easily-dismissed edge case.

New tests: `controller.test.ts` gains a case asserting `openMeetingHistory`
opens the drawer and sets `historyLoading` before the disk read resolves
(not just after), a case asserting `initApp()` doesn't wait on the
background warm, and a case asserting two concurrent
`refreshAllNotesCache()` calls on a cold cache only read disk once. New
Playwright cases (`search-and-history.spec.ts` ×2, `action-drawer.spec.ts`
×1) seed `delayCommands: { read_all_notes: 1000 }` (§137's pattern) and
assert the spinner appears then clears in each of the three drawers.

`svelte-check` 217/0, Vitest 321/321 (+3), Playwright 210/210 (+3),
`cargo test` 57/57 (unchanged — pure frontend).

## 165. Settings' own "Check now" showed no result — only the status-bar icon did (#64)

**Status: fixed, released in v0.9.2.**

Marien filed #64: "When you click the button is does the update check
and show the icon in the bottom bar but in the Settings window itself,
there is no response. Make it work like checking for updates under
About."

Root cause: `AboutModal.svelte`'s Updates section renders a full status
block reactively off the shared `updateStatus`/`updateAvailableVersion`/
`updateErrorMessage`/`updateDownloadProgress` stores (checking… /
available, with a Download & Install button / downloading / ready /
error, with a retry button); `SettingsModal.svelte`'s own Updates tab
never read any of that — its "Check now" button just called
`controller.checkForUpdates()` and rendered nothing else. The call
itself worked fine (which is why the status-bar's small update icon
still appeared, since that reads the same store directly) — Settings
just never displayed the result.

Fixed by porting the same status block into `SettingsModal.svelte`
verbatim, sharing the identical stores so both places always agree by
construction rather than by two independently-maintained copies staying
in sync. Extended the existing "Settings' 'Check now' re-checks; About
reflects the result" Playwright test to also assert the version now
shows inside Settings itself (not just after reopening About), plus a
new dedicated case.

`svelte-check` 217/0, Vitest 321/321 (unchanged — pure UI), Playwright
211/211 (+1), `cargo test` 57/57 (unchanged — pure frontend).

## 166. Copy/paste deferral didn't recognize an open consequence-action, only a leading `# ` (#67)

**Status: fixed, released in v0.9.2.**

Marien filed #67: "Marking actions as deferred after copying needs to
work on open consequence actions as well" — copying a line like "Talked
to Sam => # follow up" and pasting it into today's (or a later) note
should defer the original the same way copying a plain `# ` line already
does (§64/§82), but didn't.

Root cause: `paste.ts`'s `OPEN_ACTION_LINE` regex
(`/^(\s*)#(\s)/`) only recognized a leading `#` at the very start of a
line (optionally indented) — it had no notion of the `=> <symbol>`
consequence-action form (§41) that `innermostActionSymbol()`
(`tokens.ts`) and the rest of the app (the Action Drawer's "Only Open"
toggle, `openActionLineIndices`) already treat as equally "open." A
copied block whose only open item was a mid-line `=> #` never got
recorded as carrying an open action at all, so nothing about it was
ever deferred on paste.

Fixed by widening the regex to `/(^\s*|=>\s)#(\s)/` — matches a leading
`#` exactly as before, or a literal `=> ` immediately before the `#`
anywhere on the line, leaving a bare `#` elsewhere (with neither prefix)
unmatched either way. The existing replace-based defer
(`# ` → `> `) and detection logic in `recordCopiedAction`/
`handlePasteIntoTab` needed no other changes — both already operate
generically on whatever `OPEN_ACTION_LINE` matches.

New `controller.test.ts` cases: a multi-line copy mixing a leading `# `
and a mid-line `=> #` defers both; a copy carrying *only* a consequence-
action (no leading `# ` at all) still gets recorded and deferred.

`svelte-check` 217/0, Vitest 323/323 (+2), Playwright 211/211
(unchanged — this fix has no UI-observable surface, just the underlying
copy/paste data logic; covered at the unit level instead), `cargo test`
57/57 (unchanged — pure frontend).

## 167. New shortcut: mark every action in a selection as open (#65)

**Status: fixed, released in v0.9.2.**

Marien filed #65: "Add shortcut to mark all actions in a selection as
open." New `Ctrl/Cmd+Shift+O`, bound in `EditorPane.svelte`'s CodeMirror
keymap: every line touched by the current selection (just the line the
caret's on, if the selection is a bare caret) whose action symbol is
`v`/`>`/`x` gets forced straight to `#`, in one place per line — a
leading (optionally indented, §50) symbol or a `=> <symbol>`
consequence-action (§41), same line shapes `cycleActionSymbol` already
recognizes. Lines with no action symbol at all (plain text, bullets,
section headers) are left untouched. One CodeMirror transaction for the
whole span, so it undoes as a single step; a selection with nothing to
change is a genuine no-op (returns `false`, letting the keymap fall
through) rather than an empty transaction.

New `setActionSymbolOpen()` in `tokens.ts`, sharing its line-matching
with `cycleActionSymbol()` via an extracted `replaceActionSymbol()`
helper (both now just supply a different "what's the new symbol"
function) rather than a second hand-copied set of regexes that could
drift from the first. Registered in `shortcuts.ts` so the Shortcuts &
Symbols drawer and tooltips pick it up automatically, same as every
other shortcut. Deliberately not added to the command palette — like
`cycleLineState`/`convertToSection`, it needs a live editor selection
the palette doesn't have a natural way to supply.

New tests: `tokens.test.ts` for `setActionSymbolOpen` (forces `v`/`>`/`x`
straight to `#`, passes an already-open line through unchanged, handles
indentation and consequence-actions, returns `null` for a line with no
action symbol); two `editor-tokens.spec.ts` cases exercising the real
keymap binding over a multi-line selection (mixed states all become `#`,
non-action lines untouched; a selection with nothing to change leaves
the document byte-for-byte the same).

`svelte-check` 217/0, Vitest 328/328 (+5), Playwright 213/213 (+2),
`cargo test` 57/57 (unchanged — pure frontend).

## 168. Visual distinction between past/today/future daily tabs (#68)

**Status: fixed, released in v0.9.2.**

Marien filed #68: "Create a visual distinction between past, today, and
future open tabs to make it easy to find the tab of today, which is the
one most of the works happens in during the day."

New `tabDateClass()` in `TopBar.svelte` compares a daily tab's filename
date against `todayISO()` and adds a `past`/`today`/`future` class
alongside the existing `daily`/`scratch` one (a scratchpad has no date
of its own, so it's excluded — `""`, no extra class). Deliberately just
the tab's icon color/opacity, not the label or the tab's own background —
quiet enough not to fight the existing active/hover treatment, and it
reads correctly regardless of which tab happens to be active: a past
tab's icon dims (`opacity: 0.45`) even while active, today's tab keeps
its accent-colored icon (the same `--tab-active-border` hue `.tab.active`
already uses) even while a *different* tab is active — the actual point
of the request — and a future tab's icon is tinted `--state-ok` (a calm
green, distinct from both). Verified live in the browser across all
three states at once (a restored multi-day session plus a freshly
opened future date via the date-picker) via computed styles, not just
by eye.

New Playwright case in `tab-archetypes.spec.ts`: seeds one past, one
today, and one future dated tab and asserts all three pairwise computed
icon color/opacity comparisons differ (not just "today looks different
from an undifferentiated rest").

`svelte-check` 217/0, Vitest 328/328 (unchanged — pure CSS/markup),
Playwright 214/214 (+1), `cargo test` 57/57 (unchanged — pure frontend).

## 169. Closing an empty dated tab deletes its file instead of leaving it behind (#63)

**Status: fixed, released in v0.9.2.**

Marien filed #63: "When a new day is opened or selected, right now an
empty file is created. If the user closed the tab again, that empty
file is retained. What if the file is only created when the first
content is added, and removed if there is no content when the tab is
closed? That would clean up the disk a bit, especially when a user
opens ChronoNote during the weekend with no intention of making notes
for that day, just to check what was left and what is new."

Investigated first: merely opening/selecting a dated tab doesn't
actually write anything to disk today — `openOrCreateDatedFile` only
reads (`api.readNoteWithMetadata`); the debounced autosave
(`scheduleSave`/`flushSave` in `persistence.ts`) is the only path to a
real write, and it only fires after an actual edit. So the precise
mechanism is "a tab left with empty content — whether truly untouched,
or typed into and then fully cleared again — still gets that empty
content persisted (or left on disk) when the tab closes," not quite
what the issue's own wording described, though the fix wanted is the
same either way.

Asked one clarifying question before implementing: should this also
apply to a note that *previously had real content* which the user then
fully cleared, or only to a tab that was empty for the entire time it
was open (the latter needing new per-tab state to tell the two cases
apart, since nothing currently tracks a tab's on-open disk state)?
Marien confirmed the simpler always-delete-when-empty behavior.

New `delete_note`/`delete_note_at` (mirroring `write_note`/
`write_note_at`'s existing pattern, including `resolve_workspace_path`'s
path-traversal guard) in `storage.rs` + `lib.rs`, and matching mock
handlers in `mockBackend.ts` and the web app's `webBackend.ts`
(`idbDelete`, already existed as a helper, just unused until now). A
missing file is **not** an error in any of the three — the common case
is a tab that was opened but never actually edited, so no file ever
existed for it, and deleting it should read as "already at the desired
state," not a failure.

`tabs.ts`'s `closeTab()` now branches: a non-scratchpad tab whose
content is `trim() === ""` calls the new `cancelScheduledSave()` +
`deleteNoteAndInvalidateCache()` (persistence.ts) instead of the usual
`flushSave()` — cancelling first so a pending debounced autosave can't
resurrect the file moments after it's deleted. Everything else about
close (the disk-cache patch, closed-tab history for reopening, the
safety-close gate for unresolved actions) is unchanged; the empty-close
path is purely about which disk operation runs, not the rest of the
lifecycle.

New tests: three Rust `storage.rs` cases (removes an existing file,
succeeds — doesn't error — on a missing one, rejects an invalid
filename same as `write_note_at`); five `controller.test.ts` cases
(deletes on close for empty content, for whitespace-only content, for a
previously-real note now cleared, cancels rather than flushes a pending
debounced save, never deletes a non-empty note or touches a
scratchpad); two `tabs-lifecycle.spec.ts` Playwright cases (a tab that
was never written into closes with nothing new to delete; a real note
fully cleared then closed is actually gone from the mock backend, not
just emptied).

`svelte-check` 217/0, Vitest 333/333 (+5), Playwright 216/216 (+2),
`cargo test` 60/60 (+3).

## 170. "Copy to next occurrence" — a shortcut to forward the selection to the next time this section comes up (#66)

**Status: fixed, released in v0.9.2.**

Marien filed #66: "Have a shortcut that copies selected text to the next
occurrence of a meeting/section. If there is a next occurrence on file,
copy the content there, marking open actions a deferred. If there is no
next occurrence on file, and Sync to calendar is available, find the
next occurrence there, create the file if not yet created, add the
section, and copy the content there, marking open actions a deferred.
If there is no next occurrence on file, and Sync to calendar is not
available, ask the user for a date, create the file if not yet created,
add the section, and copy the content there, marking open actions a
deferred."

The largest of a batch of six issues filed the same day (#63–#68) —
design was proposed and confirmed in two rounds before implementing,
unlike the other five: Marien corrected the search priority once the
initial design was on the table — **"on calendar should always be
leading, in case calendar is not used disk is leading. In both cases,
if nothing found, prompt the user."** — swapping the original issue
text's "disk always first, calendar as fallback" for "whichever source
is actually in use leads, and is the *only* one tried" before falling
back to a prompt.

New `Ctrl/Cmd+Shift+.`, dispatched at the same window-level as every
other modal-opening shortcut (`App.svelte`), reading the live editor
selection via a new `EditorApi.getSelection()` (extends to whole lines;
a bare caret counts as just its own line, same convention #65's
`markSelectionOpen` already established). New `src/lib/copyForward.ts`
holds the whole flow:

1. **Which section.** The same `getSectionHeaderForLine`/
   `normalizeHeaderTitle`/`titleForMatching` chain Section History
   already matches sections by (§150/§37) — a date embedded in the
   title, like "Weekly Sync - 2026-09-01", is ignored for matching the
   same way it already is there.
2. **Search, whichever source is in use.** Calendar sync leads when
   it's actually on (the identical three-part gate the "Sync calendar
   for this day" button already grays itself out on: the Settings
   toggle, desktop only, `.agenda.json` actually exists) — new
   `read_agenda_after`/`read_agenda_after_date` (`agenda.rs`/`lib.rs`)
   returns every `(date, title)` pair after a given date (title
   *matching* stays a frontend concern, same division of labor as the
   reconciliation engine and Section History already use — Rust just
   filters by date range). Otherwise on-disk notes lead: new
   `findNextSectionOccurrenceOnDisk` in `history.ts` (exported
   alongside the now-also-exported `extractSectionBody`), mirroring
   `findPreviousSectionOccurrence`'s descending search but ascending,
   and — deliberately unlike it — counting an empty-but-present section
   as a match, since there's somewhere to put the copy either way.
   Neither source is tried after the other comes up empty; nothing found
   either way goes straight to a prompt.
3. **Nothing found → reuse the date picker.** Rather than build a
   second date-picking UI, a new `copyForwardPending` store
   (`stores.ts`) records what's waiting; `DatePickerModal.svelte`'s own
   `commit(iso)` checks it first and resolves the pending copy instead
   of its normal "jump to this date" behavior when one is set —
   `closeAllModals()` clears it too, so cancelling the picker (Escape,
   outside click) abandons the copy rather than leaving it to hijack
   some later, unrelated use of the same picker. `commitDatePick`
   (`tabs.ts`) itself is untouched — branching lives in the component
   instead, specifically to avoid a real circular-import risk
   (`tabs.ts` → `copyForward.ts` → `history.ts` → `tabs.ts`) that would
   have broken this codebase's own maintained dependency DAG
   (`controller.ts`'s header comment).
4. **Apply the copy.** The selection is written verbatim into the
   target's section (its existing body if the section is already
   there — appended at the end, past a blank-line-artifact-stripping
   fix `insertIntoSection` needed for a section sitting at the very end
   of a file with its own trailing newline — or a brand-new section,
   header + underline, appended at the end of the file otherwise). The
   *source* selection gets whatever was open in it marked deferred —
   `# ` → `> `, and (thanks to #67, fixed earlier the same session) a
   `=> #` consequence-action too — via `paste.ts`'s own
   `deferOpenActionsInText`/`countOpenActionsInText`, newly exported and
   shared rather than reimplemented, exactly mirroring the existing
   copy/paste-forward rule (§64/§82/#67): the copy lands open, the
   original gets marked deferred, never the other way round.

Two judgment calls, neither specified by the request, both flagged
rather than assumed silently: "next" is relative to the *active tab's
own date*, not today, so catching up on an old note's backlog threads
forward from where you actually are instead of jumping straight to
"next after today" and skipping occurrences not yet caught up on; and
a brand-new section's header text is the calendar's own title when the
target came from a calendar match (matching how the reconciliation
engine already always uses the calendar's own title for a new section),
or the source note's own header text when it came from a prompted date
(no more-authoritative title available there).

New tests: three Rust `agenda.rs` cases for `read_agenda_after`'s pure
`titles_after_date` (excludes the boundary date itself, sorts by date
then start time, drops an exact duplicate, an empty range is a result
not an error); three `controller.test.ts` cases for
`findNextSectionOccurrenceOnDisk`; eleven more for
`copySelectionToNextOccurrence`/`resolveCopyForwardPending` (disk-
leading, calendar-leading into both a new and an existing section,
the prompt fallback, resolving and abandoning a pending prompt, a
consequence-action and a multi-line selection each deferring correctly,
and the three "can't do this" toasts — empty selection, no section,
scratchpad); four `copy-to-next-occurrence.spec.ts` Playwright cases
driving the real shortcut and the real date picker end to end. Verified
live in the browser too, including watching the source line's glyph
flip from open to deferred in the running editor.

`svelte-check` 218/0 (+1 file — the new `copyForward.ts`), Vitest
347/347 (+14), Playwright 220/220 (+4), `cargo test` 64/64 (+4).

## 171. Ctrl+Space (and the whole action-state family) now converts a plain line into an action, instead of doing nothing (#69)

**Status: fixed, released in v0.9.3.**

Marien filed #69: "ctrl+space converts a non-action line into an action
line" — pressing it on a line with no `#`/`v`/`>`/`x` symbol did nothing
at all, silently, with no feedback that the keypress had even landed.

`tokens.ts`'s `replaceActionSymbol` (shared by every action-state
transform) gained an optional `createAs` parameter: when a line matches
neither the plain-leading nor the consequence-action shape, `createAs`
promotes it into one instead of returning `null`. Two promotable
shapes: a `=> text` follow-up with no state of its own gets the new
symbol inserted right after the arrow (`Talked to Sam => let's regroup`
→ `Talked to Sam => # let's regroup`); anything else with no recognized
token at all gets it prepended as a fresh leading symbol (`just prose`
→ `# just prose`). Left alone regardless: a bullet (`- `/`* `) or
emphasis (`! `) line — their own, equally deliberate structural
tokens, not "actions waiting to happen" — a `=> @name` delegated line
(§41's "mutually exclusive with delegating to a person"), and the
setext `====` underline itself (a real bug caught by an e2e test before
this shipped — the *title* line above it was already excluded via the
next-line check below, but the underline line itself wasn't, and would
otherwise have been "promoted" into `# ====`).

A section-header *title* line can't be recognized from a single line in
isolation — it needs the *next* line, a setext underline — so that
exclusion lives in `EditorPane.svelte` instead, which has the document
context to check it, via a new local `isHeaderLine()` shared by every
caller below.

This promotion only applies where a *fresh* function opts into it —
`cycleActionSymbol`/`setActionSymbolOpen`'s existing default behavior
(no `createAs`) is completely unchanged, since the Action Drawer's own
identically-shaped `Ctrl+Space` (`toggleActionLine` in `actions.ts`)
only ever operates on a line already known to be an action from its own
snapshot; promoting arbitrary text there wouldn't correspond to
anything the user could see or have asked for. A new
`cycleActionSymbolOrCreate` (used only by the editor's own `Ctrl+Space`/
`Ctrl+Enter`, both directions — cycling backward still promotes at
"open," there being no real "previous state" to land on) and a
generalized `setActionSymbolTo(line, symbol)` (which #70 below also
builds on) carry the new behavior instead.

One real side effect, not a bug: `Ctrl/Cmd+Shift+O` ("mark selection
open," #65, already shipped in v0.9.2) shares `setActionSymbolTo`
internally, so it now *also* promotes plain lines within the selection
— selecting a block of plain notes and pressing it turns every line
into an open action, not just the ones that already had a state. This
wasn't asked for by #69 specifically, but follows directly from sharing
the same underlying logic rather than maintaining two subtly different
promotion rules, and reads as a natural extension of the same idea.

New tests: `tokens.test.ts` cases for `setActionSymbolTo`/
`cycleActionSymbolOrCreate`'s promotion and exclusion rules (including
the setext-underline regression); five `editor-tokens.spec.ts` cases
driving the real `Ctrl+Space` and `Ctrl+Shift+O` through the real editor
(a plain line, a plain follow-up, and the four excluded shapes); two
existing `editor-tokens.spec.ts` cases updated for `Ctrl+Shift+O`'s new
promoting behavior. Verified live in the browser too (a real dispatched
keydown, since this session's synthetic key-combo tool couldn't reliably
hold modifiers down for this check — Playwright's own dispatch has no
such issue and is what the automated suite actually exercises).

`svelte-check` 218/0, Vitest 354/354 (+7), Playwright 226/226 (+7 across
two files — 5 new plus 2 updated in place), `cargo test` 64/64
(unchanged — pure frontend).

## 172. Direct action-state shortcuts: Ctrl+1 through Ctrl+4 (#70)

**Status: fixed, released in v0.9.3.**

Marien filed #70: "shortcuts for each action state, starting from
Ctrl+1" — a way to set a line straight to a specific state without
stepping through `Ctrl+Space`'s cycle to get there.

New `Ctrl/Cmd+1`-`4`, mapped to `ACTION_CYCLE_ORDER` (`tokens.ts`) —
open, done, deferred, won't-do, the same order `Ctrl+Space` cycles
through. Each applies across the current selection (extended to whole
lines; a bare caret counts as just its own line, the same convention
#65's "mark selection open" already established), via a generalized
`applyActionStateToSelection(v, symbol)` in `EditorPane.svelte` that
`Ctrl/Cmd+Shift+O` (open) now also calls internally alongside the three
new ones, rather than four near-duplicate per-state functions. #69's
promotion applies here too — pressing `Ctrl+2` on a plain line sets it
straight to `v` (done) directly, not just to whatever `Ctrl+Space`'s
"tasks start open" default would give it, since `setActionSymbolTo`
creates fresh *at* the requested symbol rather than always at open.

New tests: `controller.test.ts`/`tokens.test.ts` cases for
`setActionSymbolTo`'s direct-state promotion; three `editor-tokens.spec.ts`
cases (all four shortcuts on an existing action line, promoting a plain
line directly to a non-open state, and a multi-line selection). Verified
live in the browser via a real dispatched keydown (`Ctrl+2`/`Ctrl+4`),
same caveat as #69 about this session's synthetic-input tool.

`svelte-check` 218/0, Vitest 354/354 (shared count with §171 above — the
two were implemented and tested together), Playwright 226/226 (shared
count with §171), `cargo test` 64/64 (unchanged — pure frontend).

## 173. Status bar: a folder icon that survives the folder-name collapse, and opens Settings on the right tab (#71)

**Status: fixed, released in v0.9.3.**

Marien filed #71: "show folder icon in bottom bar before folder name,
that stays visible when folder name is collapsed, has label with folder
name and click on the folded icon or folder name bring you to the
settings modal focus on changing the folder."

New `folder` icon (`src/lib/icons/paths.ts` — a plain manila-folder
outline, matching this set's own no-fill/single-path language rather
than a filled two-tone glyph). `#stat-folder` (`StatusBar.svelte`) is
now a `<button>` wrapping the icon plus the name (styled after
`#stat-version`'s own "plain-text-look button" pattern) instead of a
bare `<span>` — the icon isn't gated by the §147 `stat-tier0` narrow-
window collapse class the way the name text still is, so on a narrow
window the name disappears (as it already did) but the icon — and the
button around it, still a real click target — doesn't.

Clicking it calls a new `openSettingsOnNotesFolder()` (`menu.ts`), which
sets a new `settingsInitialTab` store before opening Settings.
`SettingsModal.svelte` reads that once at mount as its initial
`activeSettingsTab` (falling back to the usual "appearance" default)
and clears it immediately after, so a later plain `Ctrl+,` open still
starts on the first tab as always. "Focus on changing the folder" is
taken literally, not just "the right tab": when opened this way, mount
also moves keyboard focus to the "Browse…" button itself once the
Calendar tab's content has rendered.

New tests: three `merged-titlebar.spec.ts` cases (an existing test
updated for the icon surviving the collapse where the whole thing used
to vanish; a new case for the click → tab → focus chain; a new case
confirming a plain `Ctrl+,` still starts on the default tab). Verified
live in the browser: the icon click opens Settings on "Calendar, Notes
& Data" with focus on Browse…, and at 800px width the name text is
`display: none` while the icon stays visible and clickable.

`svelte-check` 218/0, Vitest 354/354 (unchanged — pure UI), Playwright
228/228 (+2 net — 2 new cases, 1 existing case extended in place),
`cargo test` 64/64 (unchanged — pure frontend).

## 174. Tab past/today/future colours went stale across a midnight rollover (#72)

**Status: fixed, released in v0.9.4.**

Marien: "When are colors of tabs changed? When I opened the app this
morning, yesterday was still colored blue and today was green. When I
looked later it was changed." (§68's colouring: today's tab gets the
accent border colour, a future-dated tab is tinted `--state-ok` green,
a past one is dimmed.)

Root cause: `TopBar.svelte`'s `tabDateClass(tab)` called `todayISO()`
directly inside the template's class-attribute expression. That's a
plain function call, not a reactive dependency Svelte tracks — the
class only actually gets *recomputed* when the surrounding template
re-renders for some other reason (the `tabs`/`activeTabId` stores
changing, a resize, etc.), which usually has nothing to do with the
clock ticking past midnight. A tab left open overnight kept showing
yesterday's colours until some unrelated interaction (switching tabs,
typing, resizing) happened to force a re-render and pick up the new
date — explaining exactly what Marien saw: stale on first look this
morning, correct "when I looked later" (once *something* had
re-rendered the bar in the meantime).

Fixed with a new reactive `currentDateISO` store (`stores.ts`),
seeded from `todayISO()` at boot and kept live by a new
`wireDateRollover()` in `boot.ts`: a cheap 30-second interval compares
`todayISO()` against the store's current value and updates it on a
genuine change, and the existing §94 window-focus hook (already
checking for drift/agenda-file changes on focus regain) now also
re-syncs it immediately, so reopening the app after being away doesn't
even wait out the interval. `tabDateClass(tab, today)` now takes
`today` as a parameter instead of reading the clock itself, and the
template passes `$currentDateISO` — a real Svelte dependency, so the
class genuinely re-evaluates the moment the store changes. The same
staleness bug existed one line down in the same file
(`calendarSyncReady`'s own `>= todayISO()` gate) — fixed the same way,
since it's the identical root cause in the identical component.

New `controller.test.ts` coverage: one test drives `vi.useFakeTimers()`
across a simulated midnight rollover and confirms the interval alone
catches it; a second confirms the window-focus hook refreshes it
immediately without waiting for the interval. `svelte-check` 218/0,
Vitest 356/356 (+2), Playwright 228/228 (unchanged — the underlying
`past`/`today`/`future` class logic itself didn't change, only when it
re-evaluates, which a real clock rollover in a headless test run isn't
practical to simulate through the browser), `cargo test` 64/64
(unchanged — pure frontend). Verified live in the mock-backend dev app
(today's tab correctly classed on load).

## 175. Three shortcut-behavior fixes: Ctrl+Shift+O no longer promotes plain lines, Ctrl+Space narrowed to close/reopen only, and the Shortcuts drawer catches up (#73)

**Status: fixed, released in v0.9.4.**

Marien filed #73 with three related pieces of feedback on last
release's #69/#70 work:

> Ctrl+Shift+O should not convert empty lines into action. right now it
> looks wired to Ctrl+1, which should do that, but Ctrl+Shift+O should
> not.
> The latest shortcuts that have been added and changed are not
> reflected on the Shortcuts & Symbols drawer.
> Use Ctrl+Space just for closing an open item. The other states can be
> done via Ctrl+1/2/3/4.

**Part 1 — Ctrl+Shift+O.** Confirmed exactly as described:
`EditorPane.svelte`'s `Mod-Shift-o` binding called the very same
`applyActionStateToSelection(v, "#")` as `Mod-1`, so it inherited
#69/#70's plain-line promotion even though that was never the point of
#65 (which predates #69 entirely). Un-shared: `tokens.ts`'s
`setActionSymbolOpen` — previously just a thin `setActionSymbolTo(line,
"#")` wrapper that inherited the promotion — now calls
`replaceActionSymbol` directly with no `createAs`, restoring #65's
original "only touch lines that already have a state" contract.
`applyActionStateToSelection` was generalized to take a per-line
transform function instead of a fixed target symbol, so `Ctrl+Shift+O`
passes `setActionSymbolOpen` (no promotion) while `Ctrl+1`-`4` keep
passing `(line) => setActionSymbolTo(line, symbol)` (promotes, as
before).

**Part 2 — Shortcuts drawer.** `ShortcutsModal.svelte`'s `rows` array
is a hand-maintained list of ids into the shared `shortcuts.ts`
registry — and it had simply never been updated for `markSelectionOpen`
(#65), `setActionOpen`/`setActionDone`/`setActionDeferred`/
`setActionWontDo` (#70), or `copyToNextOccurrence` (#66), even though
all five were already correctly registered in `shortcuts.ts` itself (so
`Ctrl+Shift+O`'s tooltip and the command palette already knew about it
— only this one drawer's static list had drifted). Added all five in
sensible positions, and reworded the "Click a glyph" row and the
consequence-action glyph-legend entry (both of which referenced
`cycleLineState`'s shortcut text) since that shortcut's own meaning
changed in Part 3 below.

**Part 3 — Ctrl+Space.** Confirmed the redesign with Marien
(AskUserQuestion) before implementing, since it's a real behavior
change to an already-shipped shortcut: Ctrl+Space (and its Mac-only
`Ctrl+Enter` twin) drops the four-state cycle and the #69 plain-line
promotion entirely, narrowing to one single job — close an *open* line
to done (`# → v`); everything else (a deferred/won't-do/already-done/
plain line) is now a no-op. The reverse binding (`Ctrl+Shift+Space` /
`Ctrl+Shift+Enter`) mirrors it: reopen a *done* line to open (`v → #`),
also a no-op on anything else. Every other state transition (including
reopening any line, from any state) already has a dedicated shortcut in
Ctrl+1-4, so there's no gap left by dropping the cycle — the point,
per Marien's own framing, was narrowing scope, not removing
capability. New `tokens.ts` functions `closeOpenAction`/
`reopenDoneAction`, sharing a new `matchActionSymbol` helper (extracted
from `replaceActionSymbol`, which every existing transform still uses)
that both `cycleActionSymbol`/`setActionSymbolTo`/`setActionSymbolOpen`
and these two new functions build on. `cycleActionSymbolOrCreate`
(the #69 function `EditorPane.svelte`'s old `cycleLine` used) is gone
entirely — nothing calls it once `cycleLine` was rewritten into a
generic `applyToCurrentLine(v, transform)` taking `closeOpenAction`/
`reopenDoneAction` directly. The Action Drawer's own, separate
`Ctrl+Space` (`toggleActionLine` in `actions.ts`) is untouched — it has
no direct-state shortcuts of its own and only ever operates on a line
already known to be an action from its own snapshot, so the full cycle
is still the only way to reach every state there.

Updated tests throughout: `tokens.test.ts` (`setActionSymbolOpen`'s
promotion tests flipped to "does NOT promote", new `closeOpenAction`/
`reopenDoneAction` describe blocks replacing the old
`cycleActionSymbolOrCreate` one), `editor-tokens.spec.ts` (Ctrl+Space/
Ctrl+Shift+Space cases rewritten for close/reopen-only semantics, a new
no-op case for deferred/won't-do/plain lines, the Ctrl+Shift+O case
updated to confirm plain lines stay untouched), `mac-shortcuts.spec.ts`
(the §145 Mac case rewritten around reopening a done line instead of
"cycling backwards to won't-do"). `svelte-check` 218/0, Vitest 358/358
(+2 net over §174's 356 — `cycleActionSymbolOrCreate`'s 3 tests
replaced by `closeOpenAction`/`reopenDoneAction`'s 6, `setActionSymbolOpen`'s
own block trimmed by 1), Playwright 226/226 (-2 net — several Ctrl+Space/
Ctrl+Shift+Space cases collapsed into fewer, broader no-op cases now
that there's less behavior to cover), `cargo test` 64/64 (unchanged —
pure frontend). Verified live in the mock-backend dev app: Ctrl+Space closes
an open line and is a no-op on a second press; Ctrl+Shift+Space
reopens; Ctrl+Shift+O opens an already-done line but leaves a plain
line alone; Ctrl+1 promotes a plain line to open; the Shortcuts drawer
lists every current binding correctly.

Also updated `website/guide.html`'s three mentions of Ctrl+Space's old
"cycle" behavior to match (the shortcut table row, the token-legend
row, and the workflow-step copy) — a real inaccuracy directly caused by
this change, not a broader website audit. The guide's shortcut table
was already missing rows for `Ctrl+Shift+O`/`Ctrl+1`-`4`/
`Ctrl+Shift+.` *before* this session (never added when #65/#66/#70
shipped) — flagged as a separate follow-up rather than folded into this
fix, since that gap predates and is unrelated to #73 itself.

## 176. Calendar sync excludes declined, cancelled, and forwarded meetings (#74)

**Status: fixed, released in v0.9.4.**

Marien: "Don't Sync meetings starting with 'Declined:', 'Cancelled:',
or 'Following:'." — an external calendar syncer commonly stamps one of
these prefixes onto a meeting's own title (in `.agenda.json`) to signal
it isn't a real, attending occurrence: a declined invite, a cancelled
meeting, or a forwarded copy of someone else's invite ("Following:" is
Outlook's own wording for that last case). None of these should ever
create or match a section during calendar sync.

Fixed at the source, in `agenda.rs`, so both call sites that ever
surface a title to the frontend inherit it for free: a new
`is_excluded_title`/`EXCLUDED_TITLE_PREFIXES` filters these out inside
`titles_for_date` (used by "Sync calendar for this day") and
`titles_after_date` (used by #66's "copy to next occurrence" calendar
search) — right after date-scoping, before sorting/de-duplication, so
an excluded meeting is treated exactly as if it had never been in the
file at all. Deliberately *not* filtered inside `parse_agenda` itself:
that function's "is this file's raw content confirmed-good data"
error-vs-empty distinction (§171's own module doc) is orthogonal to
which *individual* meetings within a valid file count — filtering
there would have also silently changed what counts as "a bare empty
array" for a file containing only excluded meetings, which isn't what
was asked. Match is case-sensitive and prefix-only (`title.starts_with(...)`),
not a substring search — these are fixed, consistently-capitalized
syncer-generated prefixes, not something a real meeting title would
incidentally contain mid-sentence; a title like "Re: Declined: 1:1"
(the prefix showing up after other text) is correctly left alone.

`mockBackend.ts`'s `titlesForDate`/`titlesAfterDate` mirror updated
identically, per the established "mock moves with agenda.rs" rule.
New Rust tests (`excludes_declined_cancelled_and_following_titles_74`,
`only_matches_the_excluded_prefixes_at_the_start_of_the_title`,
`read_agenda_after_excludes_declined_cancelled_and_following_titles_74`)
and a new `calendar-sync.spec.ts` e2e case confirming all three prefixes
are excluded from the sync review step. `svelte-check` 218/0, Vitest
358/358 (unchanged — pure Rust + mock), Playwright 227/227 (+1),
`cargo test` 67/67 (+3).

## 177. "Copy to next occurrence" no longer jumps the cursor to the top of the document (#75)

**Status: fixed, released in v0.9.4.**

Marien: "When doing Copy to next occurrence keep the focus on the line
being deferred. Now it jumps to the top." — after #66's `Ctrl+Shift+.`
copies a selection forward and marks the source's open action deferred,
the cursor (and scroll position) landed at line 1 instead of staying on
the line that had just changed.

Root cause: `commitCopyForward()` (`copyForward.ts`) rewrites the
source tab's content via `writeTabContent()`, which — for the active
tab — pushes the new text into the live CodeMirror view through
`EditorApi.setContent()`. That function dispatches a single transaction
replacing the *entire* document (`from: 0, to: doc.length`) with no
explicit `selection` — CodeMirror's default selection mapping for a
change spanning the whole document collapses any prior cursor position
to the very start of the newly-inserted content, since the whole old
range (wherever the cursor was inside it) maps to the start of its
one-piece replacement. This is true of every caller of `setContent`
(also used by drift/conflict resolution, which is the correct behavior
there — content genuinely changed out from under the user), but for
`copySelectionToNextOccurrence`'s own case the source tab is the one
the user is actively looking at and typing in, so losing cursor
position there is jarring in a way it isn't for an out-of-band external
change.

Fixed narrowly in `commitCopyForward()` rather than changing
`setContent`'s general behavior: right after the content rewrite, if
the source tab is still the active one, `editorApi.jumpToLine(fromLine)`
re-places the cursor at the start of the line that was just deferred.
Safe because `deferOpenActionsInText` (§64/§82/#67) only ever swaps a
symbol character in place — it never adds or removes lines — so
`fromLine` (captured before the edit) still points at exactly the right
line afterward. Both dispatches happen synchronously in the same tick,
so there's no visible flicker between "jumped to top" and "corrected."

New e2e coverage in `copy-to-next-occurrence.spec.ts`: after the copy,
types a character and asserts it lands on the (now-deferred) third
line rather than at the very top of the document — a black-box check
that doesn't depend on reading CodeMirror's internal selection state
directly. `svelte-check` 218/0, Vitest 358/358 (unchanged — pure
editor-focus behavior, not practical to unit-test without a real
CodeMirror view), Playwright 228/228 (+1), `cargo test` 67/67
(unchanged — pure frontend).

## 178. A note is only written when it changed — tab switches no longer clobber synced versions

**Status: fixed, released in v0.9.5.**

Marien, testing the app on a phone and a PC with the notes folder in OneDrive:
"it seems that the application is writing to disk whenever tabs are changed,
regardless if the content has changed… even without doing edits on the PC,
OneDrive on the PC still generates conflict files."

Root cause: `flushSave` (called when switching away from a tab, closing one,
and by the §93 exit barrier) and the 400ms autosave timer both wrote the tab's
in-memory text unconditionally — `writeNoteRaw` calls `api.writeNote(filename,
content)` with no `expectedHash`, so it is a blind overwrite. Two consequences:
1. Every tab switch rewrote the file, changing its timestamp. A cloud-sync
   client (the OneDrive client on the PC) treats that as an edit.
2. **Worse, a stale tab clobbered newer content.** If another device synced a
   newer version of a note in while its tab sat open and unedited here,
   switching away wrote the tab's old text back over it — undoing the other
   device's edit locally and making the sync client create conflict copies,
   even though nothing had been edited on this machine. The §94 drift check
   only runs for the tab being *activated* (and on window focus), so it never
   got the chance to reload the stale tab before `flushSave` wrote it.

Fix: every tab already records a SHA-256 of what disk held when it was loaded
or last written (the §94 clean baseline, `markTabClean`). `persistence.ts`'s new
`persistTab` compares the tab's text with that (`matchesDisk`) and skips the
write when they are equal; with no baseline yet it still writes (the safe
answer). The check-and-write is registered in `inFlightWrites` for its whole
duration so the exit barrier still waits for it, and the "Saving…" mark is held
until the decision so the status readout doesn't flicker. `sha256Hex` moved to
its own `hash.ts` (re-exported from `drift.ts`) to avoid a persistence ↔ drift
import cycle. A stale-but-unedited tab is picked up by the existing drift check
(a silent reload) the next time it is activated. Deliberately not changed: a tab
with real edits and a stale baseline still overwrites on flush — that is a
genuine two-sided edit, which the drift check's conflict prompt exists for.

New `no-idle-writes.spec.ts` (three cases; all three fail without the fix):
switching tabs without editing writes nothing; an edit is still saved and
switching afterwards adds no more writes; a newer version synced in while a tab
is open is neither overwritten nor missed on return. `svelte-check` 0 errors,
Vitest 363/363, Playwright 235/235, `cargo test` 67/67 (unchanged).

## 179. Closing a future-dated note doesn't ask about open actions (#76)

**Status: fixed, released in v0.9.5.**

#76: "Show unresolved actions warning only for today and dates in the past.
Close silently for dates in the future." A note dated in the future is a plan,
not a backlog — its open actions haven't come due, so the "are you sure you want
to close it?" prompt was just noise. `tabs.ts`'s new `hasDueOpenActions(tab,
open)` gates `requestTabClose`'s open-action reason on `filename date <=
todayISO()` (ISO date strings compare correctly as text). Scratchpads have no
date, so they keep the warning — and the other reason for the prompt, a
non-empty scratchpad about to be discarded, is untouched. The date picker's
"has open actions" dot and the status-bar counts are unchanged: future notes'
actions are still counted and shown, they just don't gate closing.

Vitest (+3: today still warns, a future note closes silently, a scratchpad with
open actions still warns) and Playwright (+2: a future-dated note closes with no
modal, a past one still asks).

## 180. The Actions drawer keeps the date of the actions in view (#77)

**Status: fixed, released in v0.9.5.**

#77: "On the actions drawer, keep showing the date row for the actions in view.
Without date it makes it hard to remember which date the action belongs to." The
drawer is a virtualized list of group-header rows and action rows; a group's
header scrolls out of view (and is unmounted) long before its last action, so
deep in a long group nothing said which day an action was from. The header of the
group at the top of the viewport is now pinned over it (`stickyHeader` in
`ActionDrawerModal.svelte`: the last header whose `top < scrollTop`, rendered as
a `position: sticky` element with an equal negative bottom margin so the scroll
extent is unchanged, and an opaque background — the normal header is a
translucent tint). It only appears once the group's real header has scrolled
past, and the next group's header takes over as you reach it. `scrollToShow`
gained an optional `topInset` so keyboard navigation snaps the selected row to
just below the pinned heading instead of leaving it hidden underneath (default
0, so Section History and Search are unaffected).

Vitest (+2 for `topInset`) and Playwright (`action-drawer-sticky-date.spec.ts`:
no pinned heading at the very top; at three scroll positions across three groups
the pinned heading names the same day as the action beneath it; arrow-key
navigation never leaves the selected row under it). The spec and the Guide page
(`website/guide.html`) were updated for #76's close rule and §6.3's
write-only-when-changed rule.

## 181. Android as a fourth build target, and the mobile chrome around it

**Status: implemented and live-tested (real phone, real OneDrive); released in v0.10.0.**

Marien pushed a large branch (authored 2026-09-17) adding Android next
to the desktop app, the demo and the web app, plus a Rust OneDrive sync
engine (§182–§184). This section covers the target itself; §182–§184
cover sync. The branch was reviewed by actually running its gates, then
brought to a state that builds, installs and runs on the emulator, and
tested end to end.

**Getting it to build.** `npx tauri android init` generates
`src-tauri/gen/android/`, which is gitignored, so native tweaks live as
tracked copies in `src-tauri/android-overrides/` (with a README listing
what to copy back after a re-init). Two environment findings, both
recorded in `CLAUDE.local.md`:
- Rust 1.98.1 cannot cross-compile for Android on Windows (a build-script
  link step fails with `os error 5`). Confirmed not an antivirus issue —
  a bare `cargo build --target x86_64-linux-android` reproduces it — and
  fixed by pinning the Android-building checkout to 1.95.0 with a
  directory-scoped `rustup override`. Whether to make that durable with a
  repo-tracked `rust-toolchain.toml` (which would also pin desktop
  builds) is still undecided.
- The checkout lives in OneDrive, which syncs and locks build output.
  Gradle's Rust plugin runs cargo from a folder where
  `src-tauri/.cargo/config.toml`'s target-dir override does not apply, so
  every Android build wrote 2–5 GB into `src-tauri/target`. Android
  builds now set `CARGO_TARGET_DIR` explicitly, and Gradle's own output is
  redirected outside OneDrive by a machine-local init script
  (`~/.gradle/init.d/`). A junction into OneDrive was tried and was wrong:
  OneDrive follows links and synced the target. Nothing Android builds
  produce may live inside the synced folder.

**Edge-to-edge insets and themed system bars.** The generated
`MainActivity` calls `enableEdgeToEdge()`, so the WebView is drawn under
the status and navigation bars, and this WebView reports
`env(safe-area-inset-*)` as 0 — the top bar sat under the status bar and
taps there were swallowed. Fixed natively: `MainActivity` computes the
real system-bar, cutout and keyboard insets and pushes them to CSS
variables (`--inset-top/right/bottom/left`, `androidChrome.ts`) that
`app.css` pads the body with, and a small JavaScript bridge switches the
status/navigation bar icons between light and dark to follow the app
theme. The on-screen keyboard and the gesture bar were checked the same
way.

**Mobile mode is touch-first, not width-based.** The branch triggered the
mobile layout at 600px wide and hid the horizontal tab strip below that,
which broke narrow *desktop* windows (the #56 collapse-into-More logic
measures that strip; the window's minimum width is 640px). Three
width-based triggers were replaced by `(pointer: coarse)` / an Android
user agent. Playwright had never been run on the branch; after the fix
the full suite passed, with a new spec guarding it. **The desktop
tab-scroll arrows (§52), which the branch had also removed in favour of a
tabs-drawer button, are restored exactly as on `main`** (Marien chose
this); the drawer button is touch-first only, and a new spec covers both.

**Accessory bar caret bug.** Tapping ☐ and then typing put the text
*before* the inserted `# ` — `applyToken` replaced the whole line with no
explicit selection, which makes CodeMirror collapse the caret to the line
start (the same class as #75). `applyToken` now maps the caret across the
replacement.

**Also:** a real launcher icon (the app's own "dated page" mark,
regenerated from `docs/design/icon-A-master.svg` for every density), and
the mobile touch ergonomics that came with the branch (accessory bar,
tabs drawer, swipe between tabs), unchanged.

Verification for §181–§184 together: `svelte-check` 0 errors, Vitest
368/368, Playwright 240/240, `cargo test` 136/136, plus the live test
matrix in §183–§184.

## 182. OneDrive sign-in and the sync engine (Android)

**Status: implemented and live-tested (real phone, real OneDrive); released in v0.10.0.**

The branch added Microsoft sign-in (OAuth2 PKCE) and a sync of the notes
folder through the Graph API (delta queries, eTag `If-Match` uploads,
SHA-256 content hashes, a `.onedrive-cache.json` remembering what was
last synced). It is deliberately **Android-only for now** — the Rust engine
is cross-platform and compiles into the desktop binary, but only two UI
gates (`SettingsModal`, `boot.ts`) expose it, and desktop users can
already point ChronoNote's notes folder at a folder the OneDrive client
syncs. The web app cannot use it (no Rust runtime).

**Sign-in.**
- Review found the refresh token (effectively standing access to the whole
  drive) stored in plain text; it now lives in the OS keychain on desktop
  (`keyring`). On Android `keyring` has no backend and silently used an
  in-memory store, so **the token vanished on every app restart and every
  sync failed once the one-hour access token expired** — found by the live
  test, since the first sync had worked. Android now keeps it in a mode-0600
  file in the app's private data folder.
- Settings → Advanced adds a client-ID and tenant override (built via
  `url`'s path-segment API so a malformed value cannot panic), for
  locked-down work/school tenants; the same wall the parked M365 effort hit.
- Android sign-in uses a `chrononote://auth` deep link
  (`tauri-plugin-deep-link`) instead of the desktop loopback listener, which
  is unsafe on a phone (Android can kill the app while the user is in the
  browser). `login_interactive` returns immediately with `pending: true`;
  the outcome arrives as an `onedrive-login-result` event. The redirect URI
  must be registered on the Entra app. Two bugs found live while testing
  it: a pasted `code=…` fragment kept its `code=` prefix, and the code was
  never percent-decoded (a real one ended in `$$`, sent as `%24%24`) —
  both made Microsoft answer AADSTS9002313.

**Sync-engine hardening** (all from reading the engine and then from live
tests; each has unit tests):
- The cache is saved even when a sync fails partway, so an interrupted sync
  no longer leaves files written to disk with a stale entry.
- **Sign-out no longer wipes the cache.** Wiping it made every local file
  look "never synced" after signing back in, which let a reconnect
  overwrite newer cloud edits. Switching to a *different* OneDrive folder
  does reset it; re-picking the same folder keeps it.
- A remote delete never destroys a local note that was edited since the
  last sync (it is kept and re-uploaded). A delta entry for a deleted item
  may carry only its id, so the note is matched by id; and a from-scratch
  listing detects deletions that were missed.
- OneDrive's change list echoes our own uploads back. Treating that as
  news re-downloaded the note and restored a note the app had just
  deleted; an entry whose etag we already hold is now skipped.
- An empty, never-synced note is not uploaded, uploads send an explicit
  `Content-Length` (an empty body made OneDrive answer 411), and the push
  loop records the first per-file failure and carries on instead of one bad
  file blocking every note after it. A 412 on upload writes nothing; the
  next pull deals with the newer cloud version.
- Settings' "Sync now" now reports success or the reason for failure — it
  used to swallow the result, which is why the token bug looked like
  nothing happening.

## 183. Conflicts are merged, or held for the user (no conflict files)

**Status: implemented and live-tested (real phone, real OneDrive); released in v0.10.0.**

The first design wrote a copy of the other version into
`.chrononote-conflicts/` and let one side silently overwrite the cloud.
Live testing showed why that is wrong: after a PC/phone divergence the PC
user saw their line vanish with no hint a copy existed on the phone.
Marien asked for conflicts to be resolved inside ChronoNote, with nothing
extra left in OneDrive, and the PC never seeing a conflict file.

**Merge.** The last-synced text of each note is kept in
`<app data>/.onedrive-bases/` as the common ancestor.
`onedrive/merge.rs` does a line-based three-way merge (an LCS diff of each
side against the base): both sides *appending* keeps both sets of lines
(the cloud's first), edits to different lines combine, an identical edit is
applied once, and anything where both sides touched the same existing
lines is a conflict. Trailing newlines are normalised first — appending to
a file without one would otherwise edit the same last line on both sides.
A clean merge is written locally, the cache is rebased onto the cloud
version, and the push uploads the result with `If-Match`.

**Held conflicts.** For a real conflict (or a note with no known base —
first contact after a reconnect, or synced by an older build) the sync
leaves both sides untouched: the local file is not modified, the cloud copy
is not overwritten, and the note is not uploaded until the user chooses.
The cloud's version is stored in `SyncCache.conflicts`; later cloud edits
update it. If the two sides become identical the conflict dissolves; a
remote delete clears it.

**Resolve screen.** The status bar shows "⚠ N sync conflict(s)" (the one
amber item there); tapping it opens `SyncConflictsModal` with the phone
and OneDrive versions side by side and **only the differing lines
highlighted** (`lineDiff.ts`, a line LCS with a set-comparison fallback for
very long notes), and three choices — *Keep this device's*, *Use
OneDrive's*, *Keep both* (the cloud text appended under a
`--- other version (sync conflict) ---` marker). The choice is applied,
the result uploaded, and the open tab reloaded through the existing
drift check. Commands: `onedrive_get_conflicts`,
`onedrive_resolve_conflict`; mirrored in both mock backends
(`MockSeed.oneDriveConflicts`).

**Live-test matrix** (real OneDrive, throwaway notes): phone edit → PC ✔;
PC edit → phone ✔; both append → merged automatically ✔; both edit one
line → held, warning, highlighted resolve screen, *Keep both* round trip ✔;
PC deletes a note the phone hasn't touched → removed on the phone ✔; PC
deletes a note the phone edited → kept and re-uploaded ✔; edit offline
(airplane mode) while the PC edits → merged after reconnecting ✔; app
killed mid-sync with 25 new notes → recovered with no duplicates or
conflicts ✔.

## 184. Deleting an emptied note on the phone deletes it in the cloud; OneDrive state stays out of backups

**Status: implemented and live-tested (real phone, real OneDrive); released in v0.10.0.**

**Deletes.** #63 made closing an empty dated tab delete its file
(`delete_note`), but with sync on the cloud copy lingered and reappeared on
other devices. `delete_note` now records a tombstone
(`.onedrive-deleted.json`) when OneDrive sync is set up, and the next sync
sends `DELETE` with `If-Match` = the last synced etag. If the note changed
elsewhere the delete is skipped and the pull restores the newer version;
a note that is back on disk, never synced, or held in a conflict is just
forgotten; a transient failure keeps the tombstone for the next sync. Only
notes the app itself deletes are propagated — not any file that happens
to go missing. Verified live by calling the real command through the
WebView devtools: delete → cloud 404; cloud edited after the delete → note
restored. (This is also what exposed the echoed-upload bug in §182.)

**Backup.** Android Auto Backup and device-to-device transfer would have
copied the sign-in files off the device, and restored them on a new phone
as "connected" with a dead token. Backup rules
(`android-overrides/res/xml/backup_rules.xml` for Android ≤ 11,
`data_extraction_rules.xml` for 12+, referenced from the manifest) exclude
every OneDrive state file: the tokens, folder link, sync cache and base
copies. A Rust test fails if the code gains a state file that is not
listed. Verified with a real `bmgr` local-transport backup on the
emulator: the data folder held six OneDrive entries and the archive
contained none. Notes themselves are not secrets and are synced through
OneDrive, not backup.

**Still to do before this branch can merge:** arm64 and real-device
testing; release signing (keystore, AAB, `versionCode`); the
`rust-toolchain.toml` decision; Play Console work (privacy policy, Data
safety form, closed testing, Microsoft publisher verification); moving
the OneDrive Rust structs onto the `ts-rs` generated types.

## 185. A signed, sideloadable Android release build

**Status: implemented and live-tested (real phone, real OneDrive); released in v0.10.0.**

Marien wants to sideload before deciding on a store. `scripts/android-release.sh`
builds a release APK for 64-bit ARM phones (every current Samsung and Pixel),
zipaligns and signs it, and verifies the result (signature schemes, the
signing certificate, package/versionCode/versionName, and that the native code
is `arm64-v8a`). Output: `~/.chrononote-android-release/ChronoNote_<version>_arm64.apk`
(about 12 MB); `CHRONONOTE_ABI=x86_64` builds the emulator variant, and
`CHRONONOTE_SKIP_BUILD=1` signs the newest existing build.

**The signing key is the app's identity.** It lives in `~/.chrononote-signing/`
(`chrononote-release.jks` plus `release.properties`) — deliberately outside the
repo and outside OneDrive, and never committed (a check confirms no keystore or
properties file is tracked). Every future update of an app installed from this
build, and any store listing, must be signed with the same key; it cannot be
recreated. **It has to be backed up somewhere durable** (the same warning as the
updater key). The `versionCode` is derived from the app version (0.9.4 → 9004),
so it rises with every release.

**Release builds shrink and rename code (R8), which broke nothing but needed one
rule:** the WebView calls the `ChronoNoteAndroid` bridge by name, so
`android-overrides/proguard-rules.pro` keeps it (tracked with the other
overrides; a renamed bridge would have silently lost the status-bar theming
and inset padding). The signed x86_64 release variant was installed on the
emulator to check this — it started with no crash, the insets and bar icons
were right, the Rust side answered, and `chrononote://auth` resolved to the app.

**Found by running the real release build:** About showed "Couldn't check for
updates. plugin updater not found" — the updater plugin is desktop-only
(`#[cfg(desktop)]`), but only the web app skipped the check. Android now skips
the launch check and the status-bar update icon, and About explains that
updates arrive the way the app was installed (with a "What's changed" link).
Covered by a new Playwright case with an Android user agent.

**First-run safeguard:** on a fresh install the phone can hold a blank note with
the same name as a real one in OneDrive; a blank local note has nothing to lose,
so the cloud version simply wins instead of raising a sync conflict.

Verification: `cargo test` 137/137, Vitest 368/368, Playwright 241/241,
`svelte-check` 0 errors.

## 186. First-connect clarity, and notes are only written when they changed (see also §178)

**Status: implemented and live-tested on a real phone, released in v0.10.0. The first item was found sideloading v0.9.4, the second on that phone plus a PC; the second was also a bug in the shipped desktop app, so it went out earlier as v0.9.5 (§178).**

**First connect (Android).** Signing in to OneDrive doesn't choose a folder,
but Settings displayed a hardcoded `/Documents/Notes` as if one were chosen;
"Sync now" then failed with "No OneDrive folder configured", and picking a
folder afterwards started a sync with no sign of it. Now: with no folder chosen
Settings says "No folder selected yet" with a "Choose folder…" button and a
disabled "Sync now", the folder picker opens by itself once the account is
connected (once per Settings visit), and the status bar says "Choose a folder".
Every sync — launch, returning to the app, saving a note, "Sync now", and
choosing a folder — now goes through one helper (`oneDriveSync.ts`,
`oneDriveSyncing` store): a spinner in the status bar cloud item, a greyed-out
spinning "Sync now" button, and — when the user asked for it — a status-bar
message saying how it ended. Background syncs stay quiet unless they fail. The
Rust error for "no folder" is friendlier too.

**Notes are only written when they changed.** `flushSave` (switching tabs,
closing a tab, the exit barrier) and the debounced autosave wrote the tab's
text unconditionally, with no `expectedHash`. Symptoms with OneDrive on both a
phone and a PC: every tab switch touched the file's timestamp, which a
cloud-sync client treats as an edit, and — worse — if another device had synced
a *newer* version in while a tab sat open and unedited, switching away wrote the
tab's stale text over it. That undid the other device's edit locally and made
the PC's OneDrive client create conflict copies, even though nothing had been
edited on the PC. Each tab already recorded a SHA-256 of what disk held when it
was loaded or last written (the §94 clean baseline); `persistence.ts` now
compares the tab's text with that (`matchesDisk`) and skips the write when they
are equal. With no baseline yet it still writes (the safe answer). The
check-and-write is registered as in flight so the §93 exit barrier still waits
for it, and `sha256Hex` moved to `hash.ts` (re-exported from `drift.ts`) to
avoid an import cycle. A stale-but-unedited tab is now picked up by the existing
drift check (a silent reload) the next time it is activated. Not addressed: a
tab with real edits and a stale baseline still overwrites — that is a genuine
two-sided edit, which the drift check's conflict prompt is for.

New coverage: `no-idle-writes.spec.ts` (switching without editing writes
nothing; an edit is still saved once; a newer version synced in is not
overwritten and is picked up on return — all three fail without the fix) and
`onedrive-first-connect.spec.ts`. `svelte-check` 0 errors, Vitest 368/368,
Playwright 247/247, `cargo test` 137/137.

## 187. Web App & PWA OneDrive Cloud Sync, Workspace Isolation, Migration Flow, and Offline PWA

**Status: implemented and tested, prepared on branch `feat/webapp-onedrive` for merge into `main`.**

Extends Microsoft OneDrive cloud synchronization directly into the ChronoNote Web App and Progressive Web App (PWA):

1. **Pure Client-Side OneDrive Sync Engine (`webOneDriveSync.ts`)**:
   - Runs OAuth 2.0 PKCE with Microsoft Entra ID directly in the browser (`webOneDriveAuth.ts`) with zero intermediary backend servers.
   - Microsoft Graph REST client (`oneDriveClient.ts`) supports delta sync queries, chunked uploads, and personal/corporate endpoints.
   - Expands CSP to authorize direct communication with Microsoft Graph, login, personal content, and SharePoint domains.
   - Flushes in-memory pending saves before starting sync, and triggers active-tab drift checks upon sync completion.

2. **Workspace Isolation (`notes_browser` vs `notes_cloud`)**:
   - IndexedDB schema upgraded with dedicated object stores: `notes_browser` for local offline notes and `notes_cloud` for OneDrive synchronized notes.
   - Tab sessions isolated per workspace (`session_browser` vs `session_cloud`), ensuring open workspaces on browser storage and OneDrive remain completely independent.
   - Safety backup store `notes_archive` preserves browser snapshots prior to migration.
   - Signing out of OneDrive cleanly transitions back to Browser storage via `performDirectorySwitch("Browser storage")`, restoring the browser tabs and notes exactly as they were before connecting.

3. **Seamless Migration Flow with Conflict Handling**:
   - When connecting to OneDrive, if notes exist in Browser storage, `MigrateNotesModal.svelte` prompts the user to either move them to OneDrive or keep Browser storage separate.
   - Clean notes merge directly; notes with divergent non-empty cloud versions are registered into `cache.conflicts` for visual resolution via `ConflictModal`.

4. **Calendar Sync (`.agenda.json`) Un-gated on Web**:
   - When connected to OneDrive on the Web App, Calendar Sync is un-gated across Settings, Top Bar, More Actions menu, Command Palette, and Copy Forward.
   - `webOneDriveSync` syncs `.agenda.json` alongside note files and immediately refreshes meeting detection.

5. **Offline-First PWA & Instant Launch**:
   - Enhanced `sw.js` precaches the application shell on install.
   - Serves immutable hashed assets (`/assets/`) Cache-First for instant 0ms launch.
   - Fast 1.5s network timeout on navigation with automatic offline cached fallback.
   - Added Apple mobile and PWA installability meta tags.
   - Added CI/CD build guard in `test.yml` to ensure `website/webapp/` builds cleanly and stays in sync.

Verification: Vitest 414/414 passing, `svelte-check` 0 errors/0 warnings, production bundle built. (Follow-up review and live testing: §188.)

## 188. Web OneDrive sync: fixes from review and live testing (v0.11.0)

Reviewing §187 and testing it against a real OneDrive found the following;
all are fixed before release.

1. **Conflict resolution never uploaded ("Keep this device's" / "Keep both").**
   `resolveConflict` cleared the held conflict but left the cached etag stale,
   so the next push was rejected with a 412 that the delta feed never
   re-reports - the choice silently never reached OneDrive. It now rebases the
   cache entry (id, etag, base) onto the version the conflict was held against.
2. **Sign-in `state` is checked** on the OAuth redirect (`exchangeCodeDirect`).
3. **A stale empty tab overwrote a note that synced in from OneDrive - the note
   was lost after connecting.** A tab for a note that doesn't exist yet had no
   clean baseline (no file, so no hash): the drift check skipped it and any
   save wrote unconditionally. After connecting, the first sync downloaded
   today's note, the open empty tab never reloaded, and the next save/flush
   wrote `""` over it, which the following sync uploaded. Tabs for
   not-yet-existing notes now carry the empty-content baseline
   (`loadBaseline` / `EMPTY_CONTENT_HASH`): a version that syncs in silently
   reloads, local edits raise the conflict prompt, an unedited empty tab is
   never written. Applies to the desktop app too.
4. **Choosing a different OneDrive folder copied the old folder's notes into
   the new one** (the local notes mirror one folder; choosing only reset the
   sync bookkeeping). `web_prepare_folder_switch` runs at the picker's commit
   point: it syncs the old folder first, blocks the switch (changing nothing)
   if that fails or leaves conflicts, then clears the mirror. After a sign-out,
   where the old folder may be unreachable, what can't be synced is archived
   (`cloud-<ts>/<name>` in `notes_archive`) before clearing. The last folder is
   remembered across sign-out.
5. **While switching**, open notes close and a scratchpad explains what is
   happening; the new folder's notes open only after its first sync. The
   scratchpad closes by itself unless the user wrote in it. Scratchpads that
   already had content stay open across the switch (their drafts are what the
   switch restores).
6. **Sign-out can remove the local copy** ("Also remove the OneDrive notes from
   this browser", off by default) - shared-browser hygiene.
7. **Sign-in expired** (refresh token rejected, ~24 h for SPA tokens) reads as
   "sign in again" instead of a raw OAuth 400.
8. **CSP `connect-src` narrowed** to Graph, the token endpoint and the download
   hosts (`*.files.1drv.com`, `*.microsoftpersonalcontent.com`,
   `*.sharepoint.com`). The service worker no longer caches navigations with a
   query string (the `?code=&state=` redirect). The folder picker opens by
   itself right after a web sign-in with no folder chosen.

Known and left alone: the migrate dialog says existing notes are "merged", but
a note that differs on both sides becomes a held conflict (no shared base to
merge against); the Android engine was not checked for the folder-switch
leftover problem in item 4.

Verification: Vitest 433, `svelte-check` 0, Playwright 251, `cargo test` 137.

## 189. Phone feedback on the web app: tabs drawer, active tab, keyboard, date picker (v0.11.1)

Marien used the web app on a phone and reported these.

1. **The tabs drawer was unsorted.** It listed tabs in open order; it now uses the
   tab bar's order (dated notes by date, then scratchpads, with a divider).
2. **The drawer didn't use the tab bar's colours.** The active row is now the
   canvas surface with the accent edge, and past/today/future tint the icon the
   same way as the tab bar (§68).
3. **Only the drawer button was visible, not which date was open.** The active
   tab is now shown next to the drawer button (tap it to open the drawer). To
   make room, a phone's top bar always keeps the secondary buttons (Actions,
   History, Search, Settings) inside "More".
4. **The on-screen keyboard covered the bottom bar and the last lines.** The web
   app's viewport meta now has `interactive-widget=resizes-content` (Chrome on
   Android shrinks the layout with the keyboard). iOS Safari ignores that, so
   `mobileViewport.ts` sizes the app to the visual viewport (`--app-vvh`) while a
   keyboard is up. First attempt only moved the bottom bar: CodeMirror scrolls the
   caret into view when the *selection* changes, not when the editor's box shrinks
   under it, and the caret-into-view call was tied to a keyboard detector that
   never fires on Chrome (the layout viewport itself shrinks there). It now keeps
   the caret in view (nearest, with a margin) on every viewport/window resize
   while the editor is focused, and shortly after focusing it, re-checking as the
   keyboard animates in. A Playwright test shrinks the viewport under the caret.
   Still not tried with a real keyboard.

5. **The date picker marked the day it opened on as selected.** On a touch device
   that isn't a selection (you tap the day you want), and the mark made flipping
   between months confusing. It is now only marked once the keyboard moves it
   (arrows, PageUp/PageDown, typing a date). Desktop is unchanged.

Verification: Vitest 436, `svelte-check` 0, Playwright 260.

## 190. A failed update install no longer leaves a windowless app (v0.11.1)

**Symptom** (a second laptop, 0.9.1 -> 0.11.0): the update downloaded, nothing
happened, and the app kept running with no window; every retry left another
windowless instance, and the `%TEMP%\ChronoNote-0.11.0-updater-*` folders were empty
(a successful update leaves `ChronoNote-<version>-installer.exe` behind).

**Cause.** `tauri-plugin-updater` 2.11.0 on Windows closes every window
(`cleanup_before_exit`) *before* it launches the extracted installer, and only
then `process::exit(0)`s. If the launch fails, it returns the error to a webview
that no longer exists and leaves the process running, and its cleanup deletes the
extracted installer. So the failure was real but invisible. The version number
(0.9 -> 0.11) was not involved: same plugin version in both, the signature and
manifest on the release were fine, and the check/download had worked. The likely
reason the launch itself failed on that laptop is F-Secure Device Protection
(DeepGuard) blocking a new, unsigned executable started from `%TEMP%`; nothing
showed in Defender/AppLocker/CodeIntegrity or F-Secure's history, so this is
inferred, not proven - the new log should settle it next time.

**Fix.**
- `update_install.rs`: a Rust `install_update` command replaces the plugin's
  `downloadAndInstall`. It uses a no-op before-exit hook, so the window stays until
  the installer is really running (on Windows the process exits right after the
  launch anyway). Errors carry the OS reason and the log path.
- `update.log` in the app's log folder records each step (check, found version,
  bytes downloaded, launching, any failure) with UTC timestamps.
- `updates.ts`: pending saves are flushed first (the exit skips the window-close
  barrier), progress comes over a `Channel`, and if the installer was launched
  but the app is still there a minute later it gives up with a message.
- About/Settings: an install failure now reads "Couldn't install the update. <reason>"
  (not "couldn't check"), with **Try again** and **Download from GitHub**; while the
  installer starts it says "Starting the installer...".
- The long-term fix for security software blocking the installer is Authenticode
  code signing (not done).

Verification: Vitest 438, `svelte-check` 0, Playwright 261, `cargo test` 138.

## 191. Android gets the folder-switch fix; the migrate dialog stops promising a merge (unreleased)

Two follow-ups left over from §188.

1. **Android had the same "old folder's notes end up in the new folder" problem**
   (§188 item 4): `set_folder` reset the sync cache but left the notes in the app's
   storage, so choosing a different OneDrive folder uploaded the previous folder's
   notes into it. `OneDriveManager::prepare_folder_switch` (`onedrive/sync.rs`) now
   does what the web app does: when the new folder differs from the one the notes
   belong to it syncs the old folder first, blocks the switch (changing nothing) if
   that fails or leaves conflicts, then clears the synced notes and the bookkeeping
   (cache, saved base versions, pending deletes; the tab session is left alone).
   After a sign-out, where the old folder may be unreachable, the notes are copied to
   `onedrive-archive/cloud-<ts>/` in the app's data folder first. The command is now
   `onedrive_prepare_folder_switch` for both targets (it replaced the web-only
   `web_prepare_folder_switch`), with its result type generated from Rust
   (`FolderSwitchResult`). In the picker the same close-tabs-and-scratchpad flow now
   also runs on Android when the folder actually changes (`finishFolderSwitch(...,
   { keepNotesDir: true })`, since Android's notes folder never moves).
2. **The migrate dialog said existing OneDrive notes "will be safely merged".** A note
   that differs on both sides has no shared base to merge against, so it is held as a
   conflict for the user to resolve (nothing is overwritten - see the §188 tests). The
   text now says exactly that.

Verification: Vitest 439, `svelte-check` 0, Playwright 261, `cargo test` 141 (+3:
clearing, tolerance of missing files, archiving). The orchestration that calls the
live OneDrive API (sync first, then clear) has no automated test on the Rust side.

## 192. Shorter Settings tab labels everywhere; About last in the status bar (unreleased)

1. **Settings tabs use the short labels on every platform:** "Appearance" and
   "Notes & Sync" (plus "Updates" on the desktop app). They were shortened on
   mobile first so all tabs fit; the desktop's longer "Appearance & Editor" and
   "Calendar, Notes & Data" are gone. Spec §3.4, the affected e2e specs and the
   `menu.ts` comment follow.
2. **Status bar, right zone:** the `?` Shortcuts & Symbols trigger now comes before
   the About icon, so About is last (version, update icon when relevant, `?`,
   About). Spec §3.3 and the order test follow.

Verification: Vitest 439, `svelte-check` 0, Playwright 261, `cargo test` 141.

## 193. v0.12 "Release A": palette, resolved lines, heatmap, search (unreleased)

The first stage of the UI/UX refinements roadmap (`docs/design/ui-ux-refinements-v0.12-roadmap.md`, decisions in its
section 13, task list in section 14). Designed and first implemented by another agent, reviewed and tested here
(findings in roadmap section 15). Release B (modals, mobile ergonomics) and Release C (Zen, drag and drop, sync
popover, typography, pure black) are not started.

1. **Command palette.** Matched characters are highlighted in every result (`fuzzyMatchWithIndices`,
   `splitHighlighted`, `.palette-match`; rendered as text segments, never `{@html}`). A new "Current line" group runs
   the direct action-state operations from the palette (close open / reopen done, convert to section, set to
   open/done/deferred/won't-do, jump to next/previous open action), each showing its real shortcut. The palette
   remembers the editor selection when it opens and restores it and focus before running, so a command can never hit a
   stale line (`getSelectionRange`/`setSelectionRange` on `EditorApi`). New "Export all notes to file (.json)" command
   (`exportAllNotesToFile` already existed). The `@` date search stays a substring match.
2. **Resolved lines are dimmed.** Lines whose action is done or won't-do (`v `/`x `, including `=> v `) get
   `cm-line-resolved` (opacity 0.72), full opacity on hover or while the caret/selection touches the line
   (`cm-line-resolved-active`; `:focus-within` never matches inside CodeMirror). Setext title lines and deferred `> `
   lines are never dimmed. It reuses `innermostActionSymbol`, not a second regex.
3. **Calendar completion dots.** `computeDayHeat` (`date.ts`): green = at least one action and none open (done,
   won't-do and deferred all count as resolved), amber = at least one open `# `, dim = a note with no actions. The
   `aria-label` says which. The old "has open actions" dot is now the amber one.
4. **Search.** Operators `is:open`, `is:done`, `tag:<topic>`, `has:@<name>`, `since:YYYY-MM-DD`,
   `before:YYYY-MM-DD`, parsed in `search.ts` and shown as removable chips (a repeated operator collapses into one
   chip, the last of conflicting single-valued ones wins, removing a chip removes every occurrence).
   Each result shows the line before and after the match, dimmed. Jumping to a result from Search or an Action Drawer /
   palette action pulses the target line for 1.4 s (`cm-line-hit-pulse`).
5. **Found while reviewing (fixed before merging):** dimmed lines did not restore on caret; a repeated operator threw
   Svelte `each_key_duplicate` and froze the modal; `has:@a(b` threw an uncaught regex `SyntaxError` (the value is now
   escaped); the #46 date-picker e2e test matched `has` against the new `has-done` class (hyphen is a word
   boundary).

Verification: Vitest 478, `svelte-check` 0, Playwright 269 (the "#62 spinner" test is the known timing flake and passes
alone), `cargo test` 141 (no Rust changed). Not verified on a phone; the demo bundle is rebuilt only at release time.

## 194. v0.12 "Release B": modal modernization, mobile reflow, touch ergonomics (unreleased)

The second stage of the UI/UX refinements roadmap (`docs/design/ui-ux-refinements-v0.12-roadmap.md`, sections 5 and 6).

1. **Standardized 4-tier modal dialog sizing scale.** All 14 dialogs now declare semantic tier sizing classes (`.modal-sm` 440px, `.modal-md` 560px, `.modal-lg` 720px, `.modal-xl` 880px) replacing inline hardcoded width attributes:
   - Small (`.modal-sm`): `AboutModal`, `SafetyModal`, `UnsavedScratchpadsModal`, `MigrateNotesModal`.
   - Medium (`.modal-md`): `SettingsModal`, `ConflictModal`, `SyncConflictsModal`, `CommandPaletteModal`.
   - Large (`.modal-lg`): `ActionDrawerModal`, `SearchModal`, `CalendarSyncReviewModal`, `OneDriveFolderPickerModal`.
   - Extra-large (`.modal-xl`): `HistoryModal`, `ShortcutsModal`.
   Fluid grid containment (`min(100%, var(--modal-width))`) prevents horizontal viewport overflow.
2. **Universal dismiss affordance (`.modal-close-btn`).** Standardized top-right `✕` icon button across dialogs (`AboutModal`, `CommandPaletteModal`, `ActionDrawerModal`, `SearchModal`, `SettingsModal`, `ShortcutsModal`, `SafetyModal`, `HistoryModal`, etc.) with 44×44px hit-box under coarse pointers for effortless touch dismissal without hunting for Escape keys.
3. **Command palette tap chips & mobile legend.**
   - Converted `.palette-legend` prefix markers into interactive tap-chips (`<button type="button" class="palette-chip">`) for `>`, `!`, `@`, `?`. Tapping inserts the prefix and focuses input; tapping the active prefix chip toggles it off.
   - Desktop-only keyboard navigation footers (`.modal-footer:not(:has(button))`) and shortcut hint tags (`.item-tag.is-shortcut`) are suppressed under mobile viewports and coarse pointers to maximize vertical content area.
4. **Mobile multi-column layout transformations.**
   - `ShortcutsModal`: on viewports ≤ 680px, side-by-side columns reflow to a top segmented switcher (`[ Shortcuts ] [ Glyphs & Symbols ]`), each column rendering at 100% width with 36px touch-friendly rows.
   - `HistoryModal`: on viewports ≤ 680px, columns reflow to an adaptive tab switcher (`[ History List ] [ Occurrence Preview ]`). Selecting an item or occurrence header automatically switches to Preview, with touch-accessible action buttons for "Import Action" and "Open Note".
   - `SyncConflictsModal`: on viewports ≤ 520px, columns reflow to a segmented view switcher (`[ Side-by-Side ] [ This Device ] [ OneDrive ]`) with status badges.
   - `CalendarSyncReviewModal`: on viewports ≤ 520px, `.sync-review-removal` reflows into a stacked two-row layout (meeting title on top, Segmented action choice underneath).
5. **Mobile ergonomics & floating toast.**
   - Dynamic floating toast pill (`.mobile-toast`) rendered when `$isMobile` is active, anchored 12px below the top bar (`role="status"`, `aria-live="polite"`), preventing hidden toasts on mobile keyboards while retaining status bar center zone for desktop.
   - Consolidated coarse-pointer touch targets (`.glyph-cyclable`, `.drawer-tab-close`, `.cal-day`, `.icon-btn`) into a single non-colliding pseudo-element rule.
   - Surface elevation & dark mode luminance borders: added subtle inset highlight border and deep shadow (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 16px 44px rgba(0, 0, 0, 0.5)`) across `.modal-card`, `.datepicker-pop`, and `.more-actions-pop`.

6. **Behaviour change worth knowing:** in the History dialog at 680px wide or less, tapping a row now opens the
   preview tab (with "Import Action" and "Open Note" buttons) instead of jumping straight to the note. Wider windows are
   unchanged.
7. **Not everything has a close button:** the disk-vs-memory conflict dialog (`ConflictModal`) deliberately has none,
   because it needs an explicit choice (Escape is a no-op there too).
8. **Deferred:** roadmap 6.4 (expressive empty states) was not implemented and stays parked.

Verification: Vitest 478, `svelte-check` 0, Playwright 278 (two new width-based specs cover the Sync conflicts and
Calendar review reflows), `cargo test` 141 (no Rust changed). Checked by hand at 375px: palette (chips, close button,
hidden hints) and the Shortcuts tab switcher.

## 195. v0.12 "Release C": Zen mode, drag-and-drop import, sync telemetry, typography & OLED mode (unreleased)

The third stage of the UI/UX refinements roadmap (`docs/design/ui-ux-refinements-v0.12-roadmap.md`, areas 3, 4, 9, 10).

1. **Zen mode (distraction-free canvas, Area 3).**
   - Toggle with `Ctrl+Alt+Z` (`Cmd+Option+Z` on macOS) or `F11` as desktop alias, or via Command Palette (`>Toggle Zen mode`).
   - Hides top bar (`translateY(-100%)`) and status bar (`translateY(100%)`) with smooth 200ms ease transitions.
   - Fixed indicator banner in top-right with "Zen mode" status and an "Exit" button.
   - Desktop window enters native fullscreen (`setFullscreen(true)` enabled via `allow-set-fullscreen` and `allow-is-fullscreen` permissions in `capabilities/default.json`).
   - Escape priority order: open modal dialogs and non-modal in-document find bar (`Ctrl+F`) close first on Escape; only when no dialog or find bar is active does Escape exit Zen mode.
   - Skipped for Android devices (guarded in shortcut dispatch and command palette).
2. **Web drag-and-drop file import (Area 4).**
   - Active on web app and demo builds (`$backendKind === "web"` or `"demo"`).
   - Dragging files over the window displays a full-screen frosted overlay (`#drop-overlay`) with icon and instruction banner.
   - Dropping a `.json` backup bundle opens Settings on the Data section pre-loaded with the bundle preview for confirmation.
   - Dropping one or more dated `.txt` notes (`YYYY-MM-DD.txt`) merges them into storage: identical notes are skipped, differing notes write conflict copies (`YYYY-MM-DD (conflict YYYY-MM-DD HHMMSS).txt`) using the OneDrive migration conflict behavior.
   - Dropping unrecognised files displays an informative toast notification.
3. **Cloud sync health & telemetry dashboard (Area 9).**
   - Clicking `#stat-cloud` in the status bar (when OneDrive is configured on Web or Android) opens an anchored telemetry popover (`#telemetry-popover`) docked above the status bar.
   - Displays real-time sync status (`● In sync`, `⟳ Syncing changes…`, `▲ Offline (cached)`, or `✕ Sync error`), humanized relative time since last successful sync (`Just now (HH:MM)`, `N minutes ago`, or `Never`), local cached note count (`IndexedDB` or local mirror), pending upload count, connected account email, and target OneDrive folder path.
   - "Sync Now" action button triggers immediate background sync with live spinner feedback.
   - "Open Settings" action button navigates directly to the Notes & Sync tab in `SettingsModal`.
   - Dismissible via top-right `✕` close button, Escape key, or outside clicks.
4. **Editor typography sliders & pure black OLED theme (Area 10).**
   - Added continuous range sliders in `SettingsModal.svelte` under the Editor section:
     - Base font size: 12px to 18px in 0.5px increments (default 13.0px), applied reactively via `--editor-font-size` CSS custom property.
     - Line spacing: 1.30 to 1.80 in 0.05 increments (default 1.60), applied reactively via `--editor-line-height` CSS custom property.
   - Added pure black OLED toggle (`pure_black: bool`) in Appearance settings, visible when dark theme is resolved:
     - Layers `data-pure-black` attribute on `<html>` over the dark theme, mapping `--surface-canvas` to absolute `#000000`, `--surface-chrome` to `#0a0a0a`, and `--surface-overlay` to `#121212` for OLED power savings and contrast.
     - Persisted across `storage.rs` AppConfig, `tauri-types.ts`, `mockBackend.ts`, and `webBackend.ts`.

Verification: Vitest 478 passed (all 26 test files), `svelte-check` 0 errors / 0 warnings, Playwright 289 passed (new specs: `zen-mode.spec.ts`, `drag-drop-import.spec.ts`, `sync-health-popover.spec.ts`, and extended `settings.spec.ts`), `check:e2e` passed, `cargo test` 141 passed, `npm run build:webapp` passed.


