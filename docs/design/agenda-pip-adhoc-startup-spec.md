# Agenda Notification Pip, Ad-Hoc Calls, Empty Note Auto-Sync, and Startup Tab Design Specification

**Status**: Confirmed & Approved by Marien  
**Author**: Antigravity  
**Reviewer**: Marien  
**Date**: 2026-10-01  
**Related Documents**:
- Calendar Import Roadmap: [`m365-calendar-import-roadmap.md`](m365-calendar-import-roadmap.md)
- Date Picker Container Model: [`datepicker-bounding-box-spec.md`](datepicker-bounding-box-spec.md)
- Design Index: [`README.md`](README.md)
- Interactive Mockup: [`agenda-pip-adhoc-startup-mockup.html`](agenda-pip-adhoc-startup-mockup.html)

---

## 1. Overview & Binding Decisions Taken by Marien

ChronoNote integrates with external calendars through local `.agenda.json` synchronization. Four integrated enhancements address calendar synchronization clarity, ad-hoc meeting notes, empty note onboarding, and startup tab ergonomics.

### Binding Decisions:
1. **Pip Indicator Tone**: Amber (`var(--state-warn)`, `#d8a24a` in Dark mode, `#b5771f` in Light mode). Conforms strictly to ChronoNote's core invariant: *"chrome status indicators are chrome, not content"*, distinct from syntax hues.
2. **Ad-Hoc Quote Syntax**: Supports both `'Call` and `' Call` (optional leading whitespace before or after quote), supporting standard ASCII single quote `'` (`0x27`) and typographic apostrophe `’` (`U+2019`).
3. **Pip Diff Ad-Hoc Isolation**: **Ad-hoc calls are completely ignored when evaluating the notification pip.** If the only difference between the note content and `.agenda.json` is the presence of one or more ad-hoc calls, `hasDiff` is `false` and the pip **must not** appear.
4. **Settings Placement**: Located in `SettingsModal.svelte` under the **Notes & Sync** tab inside a dedicated "Startup" section.

---

## 2. Area 1: Notification Pip on Agenda Sync Button

### 2.1 Problem & Goals
- Provide an unobtrusive visual indicator that signals when the external agenda (`.agenda.json`) contains updates (new meetings, removed meetings, or reordered meetings) relative to the active note.
- Only show when Calendar Sync is active (`$calendarSyncEnabled`) and for valid daily notes (`date >= todayISO()`).
- Never annoy or distract when content is already in sync.
- Strictly ignore ad-hoc calls: an ad-hoc call written in the note must never cause the pip to light up.

### 2.2 Difference Detection Engine
The difference detection is derived by comparing the active tab's note content against the agenda for that note's date:
```typescript
interface AgendaDiffState {
  hasDiff: boolean;
  newCount: number;
  removedCount: number;
  reorderedCount: number;
}
```

#### Evaluation Rules:
1. **Gating Checks**:
   - `calendarSyncEnabled` is `true`.
   - Active tab is a dated note (not a scratchpad) with `filename.slice(0, 10) >= todayISO()`.
   - Agenda file exists on disk (`$agendaFileExists`).
2. **Reconciliation Evaluation with Ad-Hoc Call Isolation**:
   - Fetch `agendaTitles = readAgendaForDate(date)` and `removedTitles = readAgendaRemovedForDate(date)`.
   - Ad-hoc sections (`isAdhocSection(header) === true`) are filtered out prior to diff calculation or treated as non-calendar sections by `computeCalendarSync`.
   - Run `computeCalendarSync(tab.content, agendaTitles, removedTitles)`.
   - `hasDiff` is `true` if and only if:
     $$\text{newTitles.length} > 0 \lor \text{removedEmpty.length} > 0 \lor \text{removedWithContent.length} > 0 \lor \text{reorderedTitles.length} > 0$$
   - **Crucial Invariant**: If the note contains 3 calendar meetings and 1 ad-hoc call, and the external calendar still has those exact 3 meetings in the same order, `newTitles = []`, `removedEmpty = []`, `removedWithContent = []`, `reorderedTitles = []` $\implies \mathbf{hasDiff = false}$. The pip **never** shows.

#### Performance & Reactivity:
- **Tab Open / Tab Switch**: When switching to a tab or opening a tab, compute diff asynchronously.
- **Window Focus**: On window focus (handled by `refreshAgendaFileExists`), re-check diff against the active note.
- **Debounced Note Edits**: While the user is typing in the active editor, diff computation is debounced by 400ms and re-evaluates against the in-memory tab content.

### 2.3 Visual Design & Placement
The notification pip is a monoline badge dot styled according to ChronoNote's design system:
- **Shape & Size**: A 6px circular dot (`border-radius: 50%`).
- **Position**: Placed at the top-right of the `calendar-import` button (inside the button relative box):
  ```css
  .icon-btn-pip {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--state-warn);
    box-shadow: 0 0 0 1.5px var(--surface-chrome);
    pointer-events: none;
  }
  ```
- **Color & Theming**:
  - Uses `var(--state-warn)` (`#d8a24a` in Dark mode, `#b5771f` in Light mode).
  - The `1.5px` border/halo using `var(--surface-chrome)` ensures crisp separation from the icon stroke and background.
- **Collapsed "More" Button Parity**:
  - When the top bar action buttons collapse into the `More` (`...`) button (`buttonsCollapsed = true` on narrow screens or mobile):
    - The `More` button itself displays the `.icon-btn-pip` if the collapsed items include the pending calendar sync.
    - Inside `MoreActionsModal`, the "Sync calendar" row displays the pip alongside its icon and label.

---

## 3. Area 2: Ad-Hoc Calls

### 3.1 Definition & Syntax
An **ad-hoc call** is a section created for an unplanned call or meeting that occurred outside the formal calendar.
- **Grammar**: Any Setext section whose header title begins with a single quote (`'`), ASCII 39 (`0x27`) or typographic apostrophe (`’`, `U+2019`), optionally preceded or followed by whitespace.
  - Matches: `'Quick sync with Dave`, `' Quick sync with Dave`, `’Quick sync`, `’ Quick sync`.
- **Regex**: `/^\s*['’]\s*/`
- **Example**:
  ```text
  'Quick sync with Dave
  =====================
  Agreed to postpone release until Tuesday.
  # Review PR #122 by 3pm
  ```

### 3.2 Reconciliation Semantics
Ad-hoc call sections are **first-class citizens of the note**, but are **strictly non-calendar**:
1. **Never Matched to Agenda**:
   - `isAdhocSection(header)` returns `true` if `/^\s*['’]/.test(header)`.
   - Ad-hoc sections are never matched against agenda titles (even if an external meeting title happens to start with a quote).
2. **Never Treated as Removed**:
   - Ad-hoc sections are completely excluded from `removedEmpty` and `removedWithContent`.
   - They will **never** trigger "Meeting removed" confirmation prompts in `CalendarSyncReviewModal`.
3. **Preserved In Place When Updating Section List**:
   - When `computeCalendarSync` rebuilds the note:
     - Ad-hoc sections are anchored relative to their surrounding sections.
     - If an ad-hoc call appears before the first calendar meeting, between meetings, or after the last meeting, its exact relative position is maintained.
     - When calendar meetings are updated, added, or reordered around them, ad-hoc sections remain in their relative slots.

#### Concrete Flow Example:
Suppose the note currently contains:
```text
Standup
=======
Standup notes.

'Call with Alice
================
Discussed deployment.

Planning
========
Sprint backlog.
```
External calendar updates: "Standup" is kept, "Planning" is moved to tomorrow (removed from today), and a new meeting "Design Review" is added.

**Reconciliation Result**:
```text
Standup
=======
Standup notes.

'Call with Alice
================
Discussed deployment.

Design Review
=============
```
- `'Call with Alice` remained directly after `Standup` without interruption.
- `Planning` was flagged/removed as normal.
- `Design Review` was appended.
- If the only difference between the note and calendar was `'Call with Alice`, no sync diff or pip would trigger.

---

## 4. Area 3: Silent Auto-Sync on Empty Note Opening

### 4.1 Motivation & Trigger Conditions
When a user opens an empty note for today (or a future date), having to manually click the sync icon and click "Apply" in a modal is redundant overhead.
ChronoNote automatically prepares the day's agenda silently.

### 4.2 Trigger Invariants
Silent auto-sync occurs if and only if all of the following hold:
1. Active tab is a dated note (not a scratchpad).
2. The note date is today or future: `tabDate >= todayISO()`.
3. `calendarSyncEnabled === true` and `$agendaFileExists === true`.
4. Note content is empty: `tab.content.trim() === ""`.
5. External agenda contains $\ge 1$ meetings for that date (`agendaTitles.length > 0`).

### 4.3 Execution & Caret Placement
When triggered:
1. **Silent Reconciliation**:
   - Run `result = computeCalendarSync("", agendaTitles)`.
   - Update tab content immediately via `writeTabContent(tab.id, result.content, tabs)`.
   - Set clean baseline (`markTabClean`) so opening the tab does not mark it dirty or trigger unsaved prompts.
2. **Caret Placement**:
   - Automatically place the editor caret on **Line 3** (0-indexed line `2`), which is the blank line immediately below the first meeting's Setext underline:
     ```text
     Line 1 (idx 0): Morning Standup
     Line 2 (idx 1): ===============
     Line 3 (idx 2): [CARET HERE]
     ```
   - Call `editorApi.jumpToLine(2)` and `editorApi.focus()`.
   - The user can start typing notes for the first meeting immediately with zero clicks.

---

## 5. Area 4: Startup Tab Preference (First Launch of the Day)

### 5.1 Motivation & User Choice
Currently, ChronoNote resets the active tab to "Today" on the first launch of every calendar day (`isFirstOpenToday` in `boot.ts`).
While this is ideal for starting a fresh day, users working across consecutive days on projects or unfinished notes often prefer to stay in their existing context—**unless today actually requires their attention**.

### 5.2 Option Specification
Add a user setting: `startupTabMode`:

| Setting Value | Display Label | Behavior on First Launch of the Day |
| :--- | :--- | :--- |
| **`"today"` (Default)** | **Always open Today** | Unconditionally opens today's note (preserving current behavior). |
| **`"smart_last_active"`** | **Restore last note (Smart)** | Restores the last active note, **unless** today already has content or has scheduled meetings. |

### 5.3 Smart Decision Logic
When `startupTabMode === "smart_last_active"`:
On the first launch of a new day (`session.lastOpenedDate !== todayISO()`):
1. **Check Today's Note**:
   - Read today's note file (`${todayISO()}.txt`).
   - If today's note has non-whitespace content (`content.trim() !== ""`), **Open Today**.
2. **Check Today's Agenda**:
   - If Calendar Sync is enabled and today's agenda contains meetings (`readAgendaForDate(todayISO()).length > 0`), **Open Today**.
3. **Otherwise (Today is clean & clear)**:
   - Restore the last active tab from `session.activeTab`.
   - If `session.activeTab` was closed or not found, fall back to Today.

### 5.4 Settings UI & i18n
- **Location**: Located in `SettingsModal.svelte` under the **Notes & Sync** tab inside a "Startup" section.
- **Control**: Segmented toggle (`Segmented.svelte`) with two options:
  - Option 1: `today` (`$t("settings.startup.today")`)
  - Option 2: `smart` (`$t("settings.startup.smart")`)
- **Hint Text**:
  - *"Choose which note opens on the first launch of each day. Smart opens Today only if you already have notes drafted or meetings scheduled; otherwise it restores where you left off."*
- **Translations**: Localized strings added to all 8 supported languages: `en`, `nl`, `de`, `fr`, `pl`, `es`, `it`.

### 5.5 Backend & Storage Architecture
- **Rust `AppConfig` (`src-tauri/src/storage.rs`)**:
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
  #[serde(rename_all = "snake_case")]
  pub enum StartupTabMode {
      Today,
      SmartLastActive,
  }

  #[serde(default)]
  pub startup_tab_mode: StartupTabMode,
  ```
- **Tauri Commands & API**:
  - `set_startup_tab_mode(mode: StartupTabMode)`
  - Exposed via `tauriApi.ts`, `tauriCommands.ts`, `types.ts`.
- **Web & Mock Backends**:
  - Full parity in `webBackend.ts` and `mockBackend.ts` using IndexedDB and mock storage.
