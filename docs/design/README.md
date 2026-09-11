# Design notes

## 0.7 maturity roadmap

**[`maturity-0.7-roadmap.md`](maturity-0.7-roadmap.md)** — the plan for the
maturity release: a full UX/UI consistency review (findings A–L), the
iconography direction, and design specs for two proposed features (GitHub
update check; Microsoft 365 calendar import). Pitched 2026‑09‑11, awaiting
Marien's sign‑off — nothing here is committed to a release yet.

**[`icon-system-0.7.html`](icon-system-0.7.html)** — the icon proposals
that go with it: three directions (A Ruled / B Cell / C Marks) for one
monoline SVG set replacing the emoji toolbar and modal headers, shown at
real render sizes in both glyph colour modes. Open in a browser. Distinct
from `icon-proposals.html` below, which is the older *app‑icon* study.

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
