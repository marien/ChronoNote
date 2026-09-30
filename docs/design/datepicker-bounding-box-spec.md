# Date Picker Container Model & Agenda Indicators Design Specification

**Status**: Confirmed & Approved for Implementation  
**Decision by**: Marien  
**Related Documents**:
- Interactive Prototype: [`datepicker-first-principles-proposals.html`](datepicker-first-principles-proposals.html)
- Design Index: [`README.md`](README.md)
- Roadmap: [`ui-ux-refinements-v0.12-roadmap.md`](ui-ux-refinements-v0.12-roadmap.md)

---

## 1. Problem Statement & Motivation

When Calendar Sync (`$calendarSyncEnabled`) is active, external calendar meetings are stored in `.agenda.json`. Users often have meetings scheduled on upcoming days (e.g. tomorrow or next week) where **no note has been created or drafted yet**.

In the original date picker:
1. Days without notes appeared completely blank (faint grey numbers), giving zero indication that commitments were scheduled.
2. The legacy completion indicators (3px dots at the bottom center: `.has-done` green, `.has-pending` amber, `.has-log` muted) were tiny, easily overlooked, and felt like "crumbs" rather than clear typographic or structural UI elements.
3. Placing auxiliary markers (such as floating dashes or pips) near the top or bottom of day cells triggered **Gestalt proximity ambiguity**: because vertical cell gaps are small (~2.5px–3px), the eye could not instinctively tell whether a horizontal line was an *underline* for the day above or an *overline* for the day below.

---

## 2. First-Principles Taxonomy: The 4 Core States

Rather than layering more dots onto the existing cell, the visual language is rebuilt around a 4-tier container model plus two orthogonal system states:

| State | Definition | Semantic Meaning |
| :--- | :--- | :--- |
| **State D: Empty** | None of the others. | Pure flat space. No note written, no actions, no meetings scheduled. |
| **State C: Agenda Only** | Meetings in `.agenda.json`, but *no note drafted yet*. | **The Placeholder**: Signals an upcoming meeting slot you haven't prepared for. Noticed when browsing ahead. |
| **State A: Notes (Settled)** | Note exists; either purely informational/log or all tasks resolved. | **The Record**: Confident, settled record of discussions and completed work. |
| **State B: Open Actions** | Note exists and contains at least 1 unresolved task (`#`). | **Top Priority**: Unfinished tasks that require attention and action. |
| **Today** | The current local calendar day. | System reference anchor (orthogonal to note status). |
| **Selected** | The focused/targeted date (keyboard or click). | Active cursor/target. |

---

## 3. The Calibrated Intensity Hierarchy

$$\mathbf{D} \longrightarrow \mathbf{C} \longrightarrow \mathbf{A} \longrightarrow \mathbf{B}$$

1. **State B (Open Actions) is strongest**: Actions demand focus because they represent what the user still needs to accomplish.
2. **State A (Notes) is second**: Notes represent established records and memory.
3. **State C (Agenda Only) is muted**: It should be just a bit more noticeable than empty, acting as a quiet placeholder/slot rather than shouting.
4. **State D (Empty) is dormant**: Pure background, never distracting.

---

## 4. The Container / Bounding Box Architecture

The entire day cell acts as a physical container that progresses through the note lifecycle:

```
State D: Empty            State C: Agenda Only        State A: Notes (Done)       State B: Open Actions
┌──────────────┐          ┌ - - - - - - -┐            ┌──────────────┐            ┌──────────────┐
│              │          │              │            │ ▒▒▒▒▒▒▒▒▒▒▒▒ │            │ ▒▒▒▒▒▒▒▒▒▒▒▒ │
│      14      │   ───>   │      15      │    ───>    │      16      │    ───>    │      17      │
│              │          │              │            │ ▒▒▒▒▒▒▒▒▒▒▒▒ │            │ ▒▒▒▒▒▒▒▒▒▒▒▒ │
└──────────────┘          └ - - - - - - -┘            └──────────────┘            └──────────────┘
  (No box, flat)          (Dashed outline)           (Neutral solid chip)        (Chip + Accent border)
```

### Visual Specifications

* **State D (Empty)**:
  * `background: transparent; border: 1px solid transparent;`
  * Text: `color: var(--muted); opacity: 0.35; font-weight: 400;`
  * Flat and silent.

* **State C (Agenda Only - The Placeholder)**:
  * `background: transparent; border: 1px dashed var(--edge-strong);`
  * Text: `color: var(--muted); opacity: 0.85; font-weight: 500;`
  * The dashed border is the universal UI metaphor for an open reservation/slot waiting to be filled.

* **State A (Notes Settled - The Filled Container)**:
  * `background: var(--surface-raised); border: 1px solid var(--edge-soft);`
  * Text: `color: var(--text); font-weight: 600;`
  * A tactile, elevated neutral chip that demonstrates that a note physically exists.

* **State B (Open Actions - The Active Container)**:
  * **Shares State A's neutral chip background** (`var(--surface-raised)`), maintaining family continuity.
  * **Border only becomes an accent line**: `border: 1.5px solid var(--state-warn);`
  * Text: `color: var(--text); font-weight: 700;`
  * Strongest priority without simultaneously changing text color, background fill, and border.

* **Today**:
  * `outline: 2px solid var(--tab-active-border); outline-offset: -2px; font-weight: 800;`
  * Renders a crisp perimeter ring around the cell, remaining completely distinct whether Today is empty (D), has agenda (C), is settled (A), or has open actions (B).

* **Selected Date**:
  * `background: var(--selected-bg) !important; color: var(--selected-fg) !important; border-color: var(--selected-bg) !important; outline: none !important;`
  * Overrides all container states with solid brand blue and white text.

* **Uniform Hover Feedback**:
  * All 4 states react smoothly to mouse hover with background elevation (`var(--surface-raised)` / `var(--surface-hover)`), providing consistent tactile feedback.

---

## 5. Theme & Palette Parity (Color, Legacy, Grayscale, Pure Black)

### Open Action Color Rationale: Why `--state-warn` (Amber) vs `--glyph-open-color` (Sky Blue)

In ChronoNote's editor, open actions use `--glyph-open-color` (`#38bdf8` in dark Color mode). However, in calendar and navigation chrome:
1. **Direct Collision with Today**: `--tab-active-border` is also `#38bdf8` (sky blue). If open action borders were sky blue, an open action day and Today would have the exact same border color, making it impossible to spot Today at a glance across the month.
2. **Established Chrome Invariant**: In ChronoNote, status chrome deliberately uses `--state-warn` (amber/gold) rather than the accent hue (`app.css` §14, §2926), matching the mobile drawer's `.occ-dot.has-pending` and the status bar's open count.
3. **Legacy Mode Alignment**: In Legacy mode (`[data-color-mode="legacy"]`), open actions automatically map to classic VS-Code red (`#ff6b6b` dark, `#d9383a` light), while Today uses VS-Code blue (`#007acc`), keeping them completely distinct.
4. **Grayscale Mode Contrast**: In Grayscale mode (`[data-color-mode="grayscale"]`), where color hues are absent, State B is rendered with a **1.5px solid white border** (`var(--text)`) and extra-bold text against State A's faint `0.08` opacity border, ensuring clear accessibility.

| Palette Mode | State C (Agenda) | State A (Note Done) | State B (Open Actions) | Today Indicator |
| :--- | :--- | :--- | :--- | :--- |
| **Color (Dark)** | `1px dashed rgba(255,255,255,0.16)` | Neutral chip + soft border | `1.5px solid #d8a24a` (Amber) | `2px outline #38bdf8` (Sky Blue) |
| **Color (Light)** | `1px dashed rgba(0,0,0,0.18)` | Neutral chip + soft border | `1.5px solid #b5771f` (Amber) | `2px outline #0e7490` (Cyan) |
| **Legacy (Dark)** | `1px dashed rgba(255,255,255,0.18)` | Neutral chip + soft border | `1.5px solid #ff6b6b` (Red) | `2px outline #007acc` (Blue) |
| **Legacy (Light)** | `1px dashed rgba(0,0,0,0.18)` | Neutral chip + soft border | `1.5px solid #d9383a` (Red) | `2px outline #0066b8` (Blue) |
| **Grayscale** | `1px dashed` muted border | Faint soft border (`0.08`) | **`1.5px solid #ffffff`** (Bold) | `2px outline` double ring |
| **Pure Black OLED** | Grounded on `#000000` | `#1e1e1e` chip + soft border | `1.5px solid #d8a24a` | `2px outline #38bdf8` |

---

## 6. Technical Implementation Plan

1. **Backend IPC & Data Loading**:
   * Add `read_agenda_dates` (or extract distinct dates from `.agenda.json` in one pass) to `src-tauri/src/agenda.rs`, `tauriCommands.ts`, `tauriApi.ts`, `webBackend.ts`, and `mockBackend.ts`.
   * When `DatePickerModal` opens and `$calendarSyncEnabled && $agendaFileExists`, fetch all meeting dates into a `Set<string>`.
   * Date cell lookup is instant `O(1)` (`agendaDates.has(cell.iso)`), with zero per-cell IPC latency.
2. **Component Markup (`DatePickerModal.svelte`)**:
   * Replace legacy `.has-done`, `.has-pending`, `.has-log` classes with clean semantic state classes:
     * `.st-agenda` (has agenda in `agendaDates`, but not in `noteByIso`)
     * `.st-done` (has note in `noteByIso`, `heatByIso` is "done" or "log")
     * `.st-open` (has note in `noteByIso`, `heatByIso` is "pending")
     * Default: `.st-none`
3. **Accessibility (`aria-label`)**:
   * Screen readers announce:
     * State B: `"2026-10-08, open actions"`
     * State A: `"2026-10-16, note recorded, all actions completed"`
     * State C: `"2026-10-14, scheduled meetings, no note drafted"`
     * State D: `"2026-10-10"`
4. **CSS (`src/app.css`)**:
   * Implement container rules under `.cal-day`, `.cal-day.st-agenda`, `.cal-day.st-done`, `.cal-day.st-open`, and `.cal-day.today`.
   * Remove old legacy `::after` completion dots.
5. **Quality Gates & Tests**:
   * Unit tests in `DatePickerModal.test.ts` verifying state transitions and ARIA output.
   * Playwright E2E tests in `calendar-sync.spec.ts`.
   * Run `npm.cmd test`, `npm.cmd run check`, `cargo test`, and `npm.cmd run build:webapp` (reverting bundles).
