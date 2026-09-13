# Merged Title Bar + Top Bar — Design & Implementation Proposal

Origin: Marien's brief (2026-09-13) — *"merging the title bar and top bar,
like I see on many other applications. Notepad for example has the
application icon on the left, then the tabs, and then the window chrome
for minimize, maximize and close... You can lose the application title.
The folder name should move to the status bar, so the user knows which
folder they are making notes in, when there is enough space to show it."*

**Decided up front (2026-09-13, via AskUserQuestion — all four
recommended options):**
1. **One merged row** — icon, tabs, the existing toolbar/More button, and
   the window controls all live in a single bar, not a merged row plus a
   separate second toolbar row.
2. **Accept losing Windows 11's Snap-Layouts hover flyout** on the
   maximize button — a fully custom-drawn title bar, not an attempt at a
   native-titlebar-overlay hybrid. (Win+arrow-key snapping still works
   regardless — that's the OS window manager, not the title bar.)
3. **Folder name** goes in the status bar's **left zone, leading edge**,
   as the **lowest-priority** item — first to disappear as the window
   narrows, before word count.
4. **Keep** `ChronoNote - <folder>` as the OS-level window title (for the
   taskbar and Alt+Tab) even though nothing renders it in-window anymore.

Status legend: ☐ not started · ◐ in progress · ☑ shipped — everything
below is ☐, this is the proposal, not yet implemented.

---

## 1. Current state (for reference)

Today ChronoNote has **two** horizontal bars stacked above the editor:

1. The **native OS title bar** (`decorations` unset in `tauri.conf.json`
   → defaults to `true`) — shows "ChronoNote - `<folder>`" (`boot.ts`'s
   `wireWindowTitleSync`, §31) with the OS-drawn icon and native
   minimize/maximize/close.
2. **`#top-bar`** (`TopBar.svelte`, 40px) — the tab strip (`#tab-bar`,
   inline `.tab` elements, no separate `Tab.svelte`) plus a cluster of
   pinned/collapsible toolbar buttons (New Scratchpad and Open Date
   always pinned; Actions/Section History/Search/Import/Promote/
   Settings/About collapse into a "More actions" popover under
   `settleLayout()`'s width-measured logic, §56).

Below the editor, **`#status-bar`** (25px, `StatusBar.svelte`) already has
a three-zone grid (left/centre/right) with a tiered CSS-media-query
collapse (§147: word count drops at ≤680px, Ln/Col at ≤520px, full labels
→ compact glyphs at ≤420px) — this is the pattern the folder name will
plug into.

The notes folder path lives in the `notesDir` store (`stores.ts`) and is
currently visible in exactly one place in the UI: Settings → Notes
Location. It is *not* shown anywhere in the persistent chrome today
(only in the OS title bar text, which most users rarely look at).

There is **no existing custom-titlebar infrastructure at all** — no
`data-tauri-drag-region`, no `-webkit-app-region`, no
`.minimize()`/`.maximize()`/`.startDragging()` calls anywhere, and
`decorations` isn't set in `tauri.conf.json`. This is a from-scratch
build, not a refactor of something partial.

---

## 2. Goals / Non-goals

**Goals**
- One merged bar replacing both the OS title bar and `#top-bar`: app
  icon → tabs → (draggable space) → toolbar buttons/More → minimize/
  maximize/close.
- No visible window title text anywhere in-window.
- The notes folder name becomes visible in normal use (status bar),
  where today it's Settings-only.
- The window remains fully movable (drag the empty bar) and resizable,
  with minimize/maximize/close behaving identically to today's native
  ones — including the existing close-barrier safety gate (§93) staying
  wired to exactly the same `onCloseRequested` path, unchanged.
- Desktop only. The demo and web app builds have no OS window at all
  (they run in an iframe/browser tab) — they keep today's `#top-bar`
  untouched, just as the "Notes Location"/"Updates" Settings sections
  already differ by `backendKind`.

**Non-goals (this pass)**
- macOS traffic-light styling. The app ships Windows-only today
  (`platform.ts`'s own comment says as much); the code stays
  platform-*aware* (reusing the existing `isMac` check) but a real macOS
  titlebar treatment (native traffic lights, left-aligned) is future
  work, called out in §7 below, not built now.
- Recovering the Windows 11 Snap-Layouts hover flyout via any native
  Win32 interop. Explicitly out of scope per the decision above.
- Changing what's *in* the toolbar/More menu, or the tab strip's own
  behavior (scrolling, groups, drag-to-reorder if any). This is a
  chrome-placement change, not a feature change.

---

## 3. Proposed layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [🗓] │ 2026-09-07 × │ 2026-09-06 × │ + 📅 │  ← drag →  │ ⋯ │ ─  □  ✕ │
└─────────────────────────────────────────────────────────────────────────┘
  icon        tabs (scrollable, existing groups/dots unchanged)   pinned   more   window controls
```

- **App icon** (new, far left, ~16-18px): today's checkbox/dated-page
  mark, the same one used for the icon set. No existing frontend asset
  references it (see §4.6) — a small new addition, not a reuse.
- **Tabs**: unchanged — same `.tab`/`.tab-group-divider` markup, same
  active/scratch/daily styling, same horizontal scroll + overflow
  arrows. Structurally still the `#tab-bar` flex child of the bar.
- **Pinned buttons** (New Scratchpad, Open Date): unchanged, same
  position, same icons.
- **Draggable space**: whatever's left between the pinned buttons and
  the toolbar cluster. See §4.3 for exactly how this is carved out —
  it has to survive both "few tabs, lots of empty space" and "many
  tabs, scrolled, zero empty space" without ever losing the ability to
  drag the window.
- **Toolbar cluster / "More"**: unchanged — same `settleLayout()`
  collapse logic, same icons, same order.
- **Window controls** (new, far right): minimize, maximize/restore,
  close — three new icon buttons, Windows/Linux convention (square,
  right-aligned, close reddens on hover), 32px tall to match the
  existing `.icon-btn`/`.tab` height so nothing in the bar looks
  mismatched.

Bar height: kept at the current **40px** — same as today's `#top-bar`,
now doing double duty as the title bar. This is a net vertical-space
*win*: today's native title bar (~32px on Windows) + 40px top bar = ~72px
of chrome above the editor; the merged bar alone is 40px, saving roughly
32px of vertical space for every window, every session.

---

## 4. Technical approach

### 4.1 `tauri.conf.json`

```jsonc
"windows": [
  {
    "label": "main",
    "title": "ChronoNote",      // unchanged — still the taskbar/Alt+Tab title
    "decorations": false,        // new — removes the native title bar entirely
    "width": 1100,
    "height": 720,
    "minWidth": 640,
    "minHeight": 420,
    "visible": false
  }
]
```

`decorations: false` also removes the native min/max/close buttons —
all three get rebuilt as app-drawn buttons (§4.4). Resizing from window
edges is expected to keep working without extra code (Tauri handles
edge-resize hit-testing for undecorated windows itself as long as
`resizable` stays at its default `true`) — this is a "verify in the
running app" item during implementation, not something to assume blind.
Whether Windows' native drop-shadow survives `decorations: false` (some
Tauri/Windows combinations need an explicit `shadow: true` to keep it)
is the other early empirical check.

### 4.2 Capabilities (`src-tauri/capabilities/default.json`)

Currently granted `core:window:*`: only `allow-set-title` (§31) and
`allow-destroy` (§93's exit barrier calls `.destroy()`, not `.close()`).
New permissions needed for the buttons/drag region themselves:

```jsonc
"permissions": [
  "core:default",
  "dialog:allow-open",
  "core:window:allow-set-title",
  "core:window:allow-destroy",
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-is-maximized",
  "core:window:allow-close",
  "core:window:allow-start-dragging",
  "opener:default",
  "updater:default",
  "process:allow-restart"
]
```

(Exact permission identifiers for `toggleMaximize`/`isMaximized` get
confirmed against the installed `@tauri-apps/api` version's actual ACL
schema at implementation time — v2's window-permission naming has
shifted across minor versions before.)

### 4.3 Drag region

Two drag zones, so the window stays draggable regardless of tab count:

1. A **flexible spacer** as the last child of `#tab-bar`
   (`flex: 1; min-width: 0;`, `data-tauri-drag-region`) — fills whatever
   space is left when tabs don't fill the row. This collapses to zero
   width once tabs overflow/scroll, which is fine because of (2).
2. A **fixed-width gutter** (~20-24px, never shrinks) between the
   toolbar cluster and the window-control buttons — always present,
   always draggable, regardless of how many tabs are open.

The drag-region attribute goes only on these two dedicated elements,
never on the bar as a whole — putting it on a container that also holds
real buttons is what breaks click-through on some Tauri versions, and
several existing Tauri app write-ups call this out as the standard
pattern.

**Implementation update:** confirmed via Tauri's own docs before
building that the attribute is exact-element-only (doesn't propagate to
or interfere with children lacking it), so it ended up applied directly
to `#top-bar` and `#tab-bar` themselves rather than a new spacer child
— simpler, and avoids the flexible spacer's `offsetWidth` corrupting
`TopBar.svelte`'s existing `settleLayout()` width measurements. The
fixed gutter (2) was still added as its own element, unchanged from the
proposal below.

**Implementation update:** double-click-to-maximize *does* come for free
from `data-tauri-drag-region` alone on Windows — confirmed the hard way.
An extra manual `on:dblclick` handler was added anyway as a "belt and
suspenders" measure and caused a real bug (every double-click toggled
maximize twice, maximizing then immediately restoring) — removed
entirely once Marien's hands-on test caught it. Superseded text, kept
for history: *"Double-click-to-maximize on the drag region is expected
to come for free from `data-tauri-drag-region` itself (Tauri's own
drag-region handling includes it) — another 'verify empirically' item,
with a manual `on:dblclick` → `toggleMaximize()` fallback ready if it
doesn't."*

### 4.4 Window control buttons

Three new buttons, new icons added to `src/lib/icons/paths.ts` (same
24×24 monoline family as the rest — `minimize`, `maximize`/`restore`
swapped by state, `close`, reusing the existing `close` glyph already
drawn for tab-close/modal-close).

```ts
// new module, e.g. src/lib/windowChrome.ts
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function minimizeWindow() {
  await getCurrentWindow().minimize();
}
export async function toggleMaximizeWindow() {
  await getCurrentWindow().toggleMaximize();
}
export async function closeWindow() {
  // Same call a native close button makes — still funnels through
  // onCloseRequested (boot.ts's §93 exit barrier), unchanged.
  await getCurrentWindow().close();
}
```

The maximize/restore icon swap needs live `isMaximized` state — the app
already tracks this shape of thing for `chromeExpanded` (§9,
`boot.ts`, driven by `onResized`/`isMaximized`/`isFullscreen`); the
titlebar reuses that same store rather than polling separately.

`closeWindow()` calling `.close()` (not `.destroy()`) is deliberate and
loss-free: `.close()` emits the same `onCloseRequested` event a native
close button, Alt+F4, or the OS "X" already do — so it's routed through
the exact existing exit-barrier logic (flush pending saves, the
unsaved-scratchpad gate) with zero behavior change from today.

### 4.5 CSS

- `#top-bar` becomes the titlebar row — add `padding-left` for the icon,
  `padding-right` for the window controls (replacing today's flat
  `padding-right: 8px`).
- New `.app-icon` (18px, `flex-shrink: 0`).
- New `.titlebar-drag-spacer` (the flexible one) and
  `.titlebar-drag-gutter` (the fixed one) — both `data-tauri-drag-region`
  as described above.
- New `.window-controls` group (`display: flex; height: 100%;`), each
  button 32px tall × ~46px wide (Windows convention is wider-than-tall
  for these, unlike the square `.icon-btn`s elsewhere) with its own
  hover state; `.window-controls .close:hover` gets the red/white
  Windows-standard treatment (`--state-error` background, white icon).
- `settleLayout()`'s width budget (`TopBar.svelte`) needs the window
  controls' fixed width added to its "how much room is left for tabs"
  calculation — the same function already accounts for the pinned
  buttons' width today, this is one more fixed term in the same sum,
  not new logic.

### 4.6 App icon asset

No frontend code references the real app icon anywhere today (checked —
`AboutModal.svelte` uses the generic hand-drawn `about` glyph, not the
logo). Two options:

- **(a)** Copy a small PNG (e.g. `32x32.png`) from `src-tauri/icons/`
  into `src/assets/` (or `public/`) so Vite can serve it normally.
- **(b)** Inline the same SVG source `docs/design/icon-A-master.svg` was
  drawn from, as a `.svg` import — scales crisper at 16-18px than a
  32px raster, and keeps the titlebar icon a real vector like the rest
  of the icon set instead of a bundler-only PNG.

**(b) is the better fit** — everything else in the chrome (`Icon.svelte`,
the whole icon set) is SVG; a lone raster `<img>` in an otherwise
all-vector bar would be the odd one out. `favicon`/social-preview tags
already deal with a similar "get the master SVG into a web-servable
form" problem for the website (§146) — the same source file, imported
once here.

### 4.7 `backendKind` gating

The merged bar (icon + window controls + drag regions) renders only when
`$backendKind !== "web"` **and** it isn't the demo build — i.e. real
desktop *and* the `?mock` Playwright/dev-in-browser harness (which is
`backendKind: "desktop"` too, per the existing convention, and already
exercises other `getCurrentWindow()` calls against `mockBackend.ts`'s
stubs). The demo (`backendKind: "demo"`) and the web app
(`backendKind: "web"`) keep today's plain `#top-bar` — no icon, no
window controls, no drag regions — since neither runs inside a Tauri
window at all.

### 4.8 Status bar: folder name

```svelte
<!-- StatusBar.svelte, left zone, new leading item -->
{#if $notesDir}
  <span id="stat-folder" class="stat-tier0" title={$notesDir}>
    {folderNameFromPath($notesDir)}
  </span>
  <span class="status-sep stat-tier0">·</span>
{/if}
<span id="stat-pos" class="stat-tier2">Ln {$statusPos.line}, Col {$statusPos.col}</span>
...
```

`folderNameFromPath()` already exists (`boot.ts`, currently private to
the title-sync code) — exported and reused here rather than
reimplemented, so the status bar and the (still-kept) taskbar title can
never disagree about what "the folder name" means.

New `.stat-tier0` CSS tier, hidden **before** the existing `stat-tier1`
(word count, ≤680px) — e.g. `@media (max-width: 860px) { .stat-tier0 {
display: none; } }`. Full title on hover via the native `title`
attribute covers the case where the visible name is ambiguous
(same-named folders in different parents).

`web`-backend gating note: the web app already shows a "Browser storage"
badge in this same status bar (§141) instead of a folder — the two are
mutually exclusive by construction (`notesDir` is meaningless for
IndexedDB-backed storage), so no extra conditional is needed beyond the
existing `{#if $notesDir}`.

---

## 5. Platform notes

- **Windows (the only shipped target today)**: everything above is
  written for Windows/Linux convention — square icons, right-aligned,
  close reddens on hover. This is the only platform that needs to work
  for v1 of this change.
- **macOS (future, not built now)**: traffic lights are native, always
  top-left, and Tauri's `titleBarStyle: "overlay"` (macOS-only config)
  is the correct mechanism there — a completely different code path
  from the Windows/Linux custom buttons, gated on the existing `isMac`
  check from `platform.ts`. Building this now would be speculative work
  for a platform nothing currently ships to; flagged here so a future
  macOS release isn't surprised by Windows-only assumptions baked into
  the CSS (e.g. icon-then-tabs left-to-right order would need to
  become tabs-only, with the icon dropped since traffic lights already
  occupy that corner).

---

## 6. Risks / trade-offs

| Risk | Mitigation |
| --- | --- |
| Windows 11 Snap-Layouts hover flyout lost | Accepted per the decision above; Win+arrow-key snapping still works (OS-level, independent of title bar). |
| Native drop-shadow/rounded corners may disappear with `decorations: false` on some Windows builds | Empirical check during implementation; `shadow: true` is the documented fallback if needed. |
| Double-click-to-maximize on the drag region might not come for free | **Resolved the other way** — Marien's hands-on test found it toggled *twice* per double-click (maximize then immediately restore) once a belt-and-suspenders manual `on:dblclick` handler was added on top of `data-tauri-drag-region`: on Windows the plain attribute already provides native double-click-to-maximize by itself, and the extra handler fired a redundant second toggle. The manual handler was removed entirely — `data-tauri-drag-region` alone handles both dragging and double-click-maximize. |
| Many open tabs leave zero flexible drag space | The fixed-width drag gutter (§4.3) guarantees a minimum draggable area regardless of tab count. |
| `settleLayout()`'s width math needs a new fixed term (window controls' width) | Same function already sums several fixed terms today — additive, not a rewrite. |
| Mock backend (`mockBackend.ts`) has no stubs for `minimize`/`toggleMaximize`/`isMaximized`/`close`/drag | New no-op-ish stubs needed, same shape as the existing `getCurrentWindow()` stubs already there for `setTitle`/`destroy`/`onFocusChanged`. |

---

## 7. Testing plan

- **Vitest**: `folderNameFromPath` gets its own direct unit test now that
  it's exported (today it's exercised only indirectly through the title
  sync); the new `windowChrome.ts` functions are thin wrappers over
  `getCurrentWindow()` — tested the same way existing thin wrappers
  around Tauri APIs are (mock the API, assert the call).
- **Playwright**: new assertions that the app icon, tabs, pinned
  buttons, and window-control buttons all render in the merged bar when
  `backendKind === "desktop"`; that clicking minimize/maximize/close
  calls the corresponding mocked Tauri API exactly once; that close
  still triggers the existing safety-gate modals (unsaved scratchpad /
  unresolved actions) exactly as it does today — this is the one test
  that most needs to *not* regress, since it's proving the exit-barrier
  wiring survived the switch from a native to a custom close button.
  New status-bar case for the folder name appearing/disappearing at the
  new `.stat-tier0` breakpoint, following the exact pattern §147's
  narrow-width test already uses for the other tiers.
- **Manual, in the real built app** (this is the one layer none of the
  above can reach): actually dragging the window by the empty bar
  space, actually resizing from the edges, actually double-clicking to
  maximize, and a visual check for the drop-shadow/rounded-corner
  question above — all genuinely need eyes on the real Windows binary,
  not the mock-backend browser harness.

---

## 8. Rollout

Single pass, not phased — the pieces are too interdependent to ship
partially (a half-merged bar with no window controls yet would leave the
window unmovable). Suggested build order within that one pass:

1. `tauri.conf.json` + capabilities changes; confirm the window still
   launches, moves (temporarily via a debug keyboard shortcut or dev
   tools, before the drag region exists), and resizes.
2. `windowChrome.ts` + the three button icons + mock backend stubs;
   wire buttons with plain (non-drag) layout first, confirm minimize/
   maximize/close all behave correctly including the close-barrier gate.
3. App icon + drag regions (flexible + fixed gutter); confirm dragging
   and double-click-maximize.
4. `settleLayout()` width-budget update for the new fixed-width window
   controls.
5. Status bar folder name + new `.stat-tier0`.
6. Remove the old separate reliance on the native title bar's visual
   title entirely (already implicit once `decorations: false` lands) —
   confirm the taskbar/Alt+Tab still shows "ChronoNote - `<folder>`"
   correctly (§4's decision to keep it).
7. Full manual pass in the built app per §7, plus the automated suites.

Version bump: yes, this is a real, user-visible desktop-app change —
its own release once built and reviewed, not bundled silently into an
unrelated one.
