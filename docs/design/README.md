# Design notes

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

Ship **concept A** as the OS icon, landing in **v0.5.0**.
[`icon-A-master.svg`](icon-A-master.svg) is the 1024&nbsp;px master — a white
knockout on the accent tile (evolves the current white-clock look rather than
replacing it wholesale). To regenerate the icon set:

```
npx tauri icon docs/design/icon-A-master.svg
```

That rewrites `src-tauri/icons/{32x32,128x128,128x128@2x}.png` and `icon.ico`.
If a neutral-tile / in-app themed variant is wanted too, the geometry is in
`icon-proposals.html` (concept A, grayscale + colour cells).
