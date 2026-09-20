# Design notes

## Merged title bar + top bar

**[`titlebar-merge-roadmap.md`](titlebar-merge-roadmap.md)** — pitched
2026-09-13: replace the native OS title bar and the app's own `#top-bar`
with one merged bar (app icon, tabs, then custom minimize/maximize/close),
Notepad-style. The notes folder name moves to the status bar. Four key
decisions confirmed up front (one merged row; accept losing Windows 11's
Snap-Layouts hover flyout; folder name in the status bar's left zone,
lowest priority; keep "ChronoNote - `<folder>`" as the OS-level taskbar
title). Desktop-only — the demo and web app keep today's plain top bar.

**Implemented (2026-09-13, §154 in `docs/CHANGELOG.md`)** — held out of
a release until Marien has tested the real native-window behavior
(dragging, edge-resizing, the visual shadow/rounded-corners question)
firsthand; nothing here is reachable from the automated test suite.

## 0.7 maturity roadmap

**[`maturity-0.7-roadmap.md`](maturity-0.7-roadmap.md)** — the plan for the
maturity release: a full UX/UI consistency review (findings A–L), the
iconography direction, and design specs for two proposed features (GitHub
update check; Microsoft 365 calendar import). Pitched 2026‑09‑11.

**Implemented and released, 2026-09-11 to 2026-09-15.** The UX/UI review
and icon set shipped as v0.7.0 (§127); the GitHub update check as v0.7.1
(§128). The Microsoft 365 calendar import sketched here was superseded
by a completely different design before it shipped — see the next entry.

**[`icon-system-0.7.html`](icon-system-0.7.html)** — the icon proposals
that go with it: three directions (A Ruled / B Cell / C Marks) for one
monoline SVG set replacing the emoji toolbar and modal headers, shown at
real render sizes in both glyph colour modes. Open in a browser. Distinct
from `icon-proposals.html` below, which is the older *app‑icon* study.

## Calendar sync

**[`m365-calendar-import-roadmap.md`](m365-calendar-import-roadmap.md)** —
pitched 2026-09-14: a Microsoft 365 calendar import via Entra OAuth2+PKCE
and Microsoft Graph. The reconciliation mechanism (§2.4 — title-matched
sections, reordered/created/removed-or-flagged, no sidecar file or ID) was
worked out directly with Marien and is the genuinely novel, load-bearing
part of the design.

**Superseded, 2026-09-15 (§162 in `docs/CHANGELOG.md`)** — the OAuth side
was fully built and beta-tested, then hit a real, unresolvable blocker
(the org's Entra admin consent requirement) and was parked. Marien then
asked for a completely different event source: a `.agenda.json` file in
the notes folder, kept up to date by an external process, with no OAuth,
no network call, and no Settings connection state at all. The
reconciliation engine described here carried over unchanged — only
§2.1–§2.3's "where do the events come from" layer was replaced. Shipped
as part of v0.9.0. The OAuth implementation itself never merged to
`main`; it lived and died on the `m365-reconciliation-engine` branch.

## App icon

The shipped icon (`src-tauri/icons/*`) through v0.4.x is a stock white clock on
the accent tile — generic, says nothing about notes or actions.

**[`icon-proposals.html`](icon-proposals.html)** — three directions, pitched
2026-09-08, each drawn from the app's own vocabulary and shown in both glyph
colour modes at Windows icon sizes. Open the file in a browser.

- **A — checkbox clock.** The `☐` open-action glyph with clock hands inside it.
- **B — the day's list.** A dated note card under its `===` rule, `☐` / `»` rows.
- **C — forward mark.** Just `»` (deferred) over a cursor tick.

Shared principle: the icon themes the way the app's glyphs do — neutral tile
always, mark is ink in grayscale mode / hue in colour mode. The OS icon is
static (regenerated with `npx tauri icon <master>`), so it ships as one
variant; only an in-app inline-SVG icon can follow the runtime setting.

### Decision (2026-09-08)

Ship **concept A** (checkbox + clock hands) as the OS icon, landing in
**v0.5.0** (§96).

### Redrawn (2026-09-11, v0.7.x)

Per the 0.7 iconography pass (`maturity-0.7-roadmap.md`, "the app icon
rejoins the family"), the OS icon is no longer its own unrelated mark —
it's now the same **dated page under its rule** the in-app "Open date
note" toolbar button uses (`src/lib/icons/paths.ts`, `"date-note"`), so
the taskbar icon and the toolbar button read as one thing.
[`icon-A-master.svg`](icon-A-master.svg) is still the 1024&nbsp;px master
(same file, redrawn in place — the checkbox-clock mark it used to hold is
still visible in git history) — a white knockout on the same accent tile
as before, only the mark itself changed. To regenerate the icon set:

```
npx tauri icon docs/design/icon-A-master.svg
```

That rewrites `src-tauri/icons/{32x32,128x128,128x128@2x}.png` and `icon.ico`.
If a neutral-tile / in-app themed variant is wanted too, the geometry is in
`icon-proposals.html` (concept A, grayscale + colour cells) — that file
documents the *pre-0.7* mark and is kept for history, not current.

## Web app

**[`webapp-roadmap.md`](webapp-roadmap.md)** — pitched 2026-09-12: a browser-storage
tier using IndexedDB as the third backend target (`WebBackend`, `main-webapp.ts`).
Allows testing and using ChronoNote directly from a browser without installation,
with manual export/import to bridge to the desktop app. Shipped as part of v0.8.0.

## Android app & OneDrive sync

**[`android-onedrive-roadmap.md`](android-onedrive-roadmap.md)** — pitched 2026-09-17:
the fourth target, bringing the same Svelte 5 + CodeMirror 6 frontend to Android via
Tauri 2 Mobile. Uses Microsoft Graph API for offline-first OneDrive cloud sync with
SHA-256 CAS conflict protection, paired with mobile touch ergonomics (Mobile Accessory Bar,
expanded 40px touch targets, scratchpad draft persistence, and a mobile tab drawer).
Includes multi-agent architectural invariants and contributor guidelines.

## UI & UX refinements (v0.12 roadmap)

**[`ui-ux-refinements-v0.12-roadmap.md`](ui-ux-refinements-v0.12-roadmap.md)** — pitched 2026-09-20:
consolidated UI & UX design specifications for ChronoNote v0.12 compared to baseline v0.11.1.
Specifies dynamic fuzzy-search match highlighting in the Command Palette (`Ctrl/Cmd+K`), line-level editor
actions aligned with the #73 direct action state model, palette note data export, gentle visual muting for
resolved action lines (`.cm-line-resolved`), redesigned non-italic topic pills (`.glyph-topic`) with zero-shift
adaptive parentheses hiding, cross-platform distraction-free Zen Mode (desktop native fullscreen, web CSS transitions,
and mobile accessory bar preservation), full-screen drag-and-drop import for browser storage, comprehensive
modal dialog system modernization (4 standardized sizing tiers, responsive mobile overlay & sheet transitions,
universal touch close affordance `✕`, responsive multi-column layout reflow for History/Shortcuts/Conflicts, and
interactive palette legend filter chips), cross-platform UX polish (dynamic floating toast, Fitts's law hit-target expansion,
and dark mode surface luminance), calendar date completion heatmap (green/amber/muted dots), cross-file search
3-line context expansion & in-editor jump pulse, cloud sync health & telemetry popover dashboard, and canvas
typography sliders with pure black OLED dark mode.
Reviewed 2026-09-20: see the roadmap's §13 (corrections already applied, plus the decisions still open
before any implementation; recommended split into three releases).

**[`ui-ux-refinements-v0.12-mockup.html`](ui-ux-refinements-v0.12-mockup.html)** — companion
standalone interactive HTML mockup demonstrating the proposed v0.12 design system: monoline SVG icons,
resolved line muting, redesigned topic pills with interactive parentheses reveal, dynamic match highlighting,
Zen mode, drag-and-drop overlay, interactive calendar completion heatmap popover, anchored OneDrive sync
telemetry dashboard, dynamic editor typography sliders, pure black OLED mode, and an interactive Modal Dialog Studio
allowing live testing of modal size tiers, universal touch close headers, and mobile viewport responsive transformations.
Open in a browser.


