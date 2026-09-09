# ChronoNote 0.6 — UX / UI Roadmap

Origin: three external reviews delivered against v0.4.4 —
*"UX/UI Enhancements"*, *"UX/UI Enhancements & Visual Polish"* (the most
detailed — treated as the master), and *"SVG examples for UI improvements"*
(four annotated mockups). They overlap ~80%. This file is the reconciled,
sequenced plan actually being executed; the reviews are treated as
**intent**, not a literal spec.

Status legend: ☐ not started · ◐ in progress · ☑ shipped

Cadence: **one v0.6.0** cut after every phase lands and is reviewed
together (Marien's call — matches v0.5.0). Work accumulates on
`feat/ux-0.6`.

---

## Corrections to the source reviews

| Review assumed | Reality |
| --- | --- |
| Svelte + **Tailwind** (`max-w-3xl`, `mx-auto`) | Plain `app.css` + CSS custom properties. Every Tailwind reference is re-expressed as tokens. |
| Task glyphs live in a **gutter** (16×16 checkbox on an 18px line) | Glyphs are rendered **inline** — `Decoration.replace` widgets swap the token chars in the text flow, fixed `ch` width, atomic ranges (spec 2.2: "glyph never exceeds the character width of the token it replaces"). Shapes get redrawn *within* that cell; no gutter. |
| A **5-state** task model (todo / doing / done / deferred / canceled) | Spec + code have **4** states: `#` open, `v` done, `>` deferred, `x` won't-do. **Decision: stays 4.** No "in-progress" glyph in 0.6. |
| State cycle is on **Ctrl/Cmd+Enter** | `Ctrl+Space` already cycles (`cycleActionSymbol`). `Ctrl+Enter` is unbound in the editor — added as an alias. |
| A new **`coloredGlyphs`** boolean | Collides with the `color_mode: color \| grayscale` enum shipped in §98. **Decision: the semantic glyph palette refreshes the existing `color` mode.** No new toggle; grayscale untouched. `rainbow` mode and explicit light/dark/system theme stay backlogged. |
| "Search" is an in-document find (`3 of 12`, next/prev) | `Ctrl+Shift+F` is a **cross-tab results list** (`search.ts`). There is **no** in-document find. Task 5 = add one (CodeMirror `@codemirror/search`) as a floating widget; the cross-tab modal stays. |
| "Section import" pulls sections from past notes | `Ctrl+Shift+I` pastes raw lines → each becomes a section header. Pulling from past notes is **Section History** (`Ctrl+Shift+H`). The side-by-side preview (Task 9) goes to **History**. |
| Editor is a `<textarea>` (`selectionStart`/`End`) | CodeMirror 6. §95's `focusTrap` already restores focus + CM keeps its own selection across focus loss — Task 8 is mostly an audit + covering the new anchored popovers. |
| Status bar shows word count / save state | It shows `Ln/Col` + Open/Closed/Forwarded counts (a spec feature). There is **no save-state tracking anywhere** — autosave is silent, only failures toast. Task 6 adds a save-state store; the action counts are kept. |
| Target **v0.4.4** | Work starts from **v0.5.2**. |

---

## Visual identity — decision pending

Three options mocked on one window in
[`ux-0.6-palette-proposals.html`](ux-0.6-palette-proposals.html)
(published as an artifact for review):

- **A — Current.** VS Code charcoal, one flat border, 38px bar. Baseline.
- **B — Structural. ← PICKED (2026-09-09).** Same charcoal + blue accent,
  4 surface tiers, translucent hairlines, one dedicated overlay surface.
  Token-only change in `app.css`; both themes keep working. Shipped as
  §102. (The 44px bar is Phase 2.)
- **C — Full re-skin.** Not taken.

---

## Phases

Each phase = its own PR, CI green, browser-pane walkthrough. All land on
`feat/ux-0.6`; v0.6.0 is cut once the whole set is reviewed.

### Phase 1 — Foundation & low-risk polish  ✅ DONE

- ☑ **Surface-elevation tokens** (§102) — 4 tiers (`--surface-canvas/
  chrome/overlay/raised`), `--edge-soft`/`--edge-strong`, `--state-*`
  semantic colours; light values too. Old flat names kept as aliases.
- ☑ **Three-zone status bar** (§100) — `Ln/Col · N words · O/C/F` |
  save dot / transient message | version + `?`.
- ☑ **Save-state store** (§100/§102) — `saveState`; `#toast` retired into
  the status centre zone (`#stat-message`), `Toast.svelte` deleted.
- ☑ **`readableLineLength`** setting (§99) — gated on word-wrap.
- ☑ **Focus/selection-restoration** (§101) — modal close always lands in
  the editor. Anchored-popover outside-click/Esc still comes with P2/P5.

### Phase 2 — Tab strip & date navigation  ✅ DONE

- ☑ **44px top bar** + daily/scratchpad tab archetypes (§103) — calendar
  icon / draft icon + italic + amber unsaved dot, 1.5px group divider,
  ≥30px chip hit targets, pill-topped tabs, hover-reveal close buttons.
- ☑ **Anchored mini calendar popover** (§104) — month grid, open-action
  dots, type-to-jump input kept, full keyboard nav, anchored under the 📅
  trigger. `DatePickerModal.svelte` rewritten; `monthGrid`/`addMonths` in
  `date.ts`.

### Phase 3 — Glyph interaction & colour

- ☑ **Semantic `color`-mode palette refresh** (§105) — cyan open / emerald
  done / violet deferred / slate cancelled; amber reserved for emphasis.
  `[data-color-mode="color"]` + light block. Grayscale untouched.
- ☑ **Click-glyph-to-cycle + `Ctrl/Cmd+Enter`** (§106) — the four action
  glyphs (standalone or a `=> <symbol>` inner symbol) cycle on click via
  `mousedown` + `view.posAtDOM`; `Mod-Enter` aliases the `Ctrl+Space`
  cycle. Selection/undo preserved (plain CM transaction).
- ⏸ **Unicode → SVG checkbox shapes** — SPLIT OUT. 3 of the 4 glyphs are
  already checkbox-style (`☐ ☑ ☒`); `»` was explicitly kept (§84). A full
  SVG set touches 4 render sites + the finicky §79/§84/§87 layout CSS +
  3 layout specs, and "1px off" needs Marien's eyes on the real Windows
  app. Worth doing, but as its own reviewed change, not bundled here.

### Phase 4 — Command palette (Ctrl+K)  ✅ DONE

- ☑ §107 — `commandPalette.ts` + `CommandPaletteModal.svelte`, Ctrl/Cmd+K.
  Prefix routing `> ! # @ ?`, fuzzy subsequence match, grouped results,
  keyboard nav. Reuses the modal system. All existing shortcuts stay.

### Phase 5 — Search & section preview

- ☐ Floating non-modal in-document find (`@codemirror/search`): match
  count, Enter / Shift+Enter, Esc, editor stays live. Docked top-right of
  `EditorPane`.
- ☐ Side-by-side preview for **Section History** — selected section text +
  where it lands in the active note, before confirming.

---

## Deferred / dropped (don't re-litigate)

- **5th "in-progress" state** — spec change, not polish. If wanted, its
  own 0.7 feature.
- **Full re-skin (option C)** — only if picked in the A/B/C decision.
- **Search *and replace*** — the reviews mention "replace" once. Find-only
  is the 0.6 target.
- **Moving every informational toast into the status bar** — one transient
  slot there; genuine modal confirmations stay modal.
- **CodeMirror gutter for glyphs** — breaks the inline column model the
  spec mandates.
