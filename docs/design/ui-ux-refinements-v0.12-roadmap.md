# ChronoNote v0.12 — UI & UX Refinements Roadmap

**Document Type:** Design Specification & Implementation Roadmap  
**Target Release:** ChronoNote v0.12.0 (compared against baseline v0.11.1)  
**Supported Targets:** Desktop (Tauri 2 Rust), Android (Tauri 2 Mobile), Web App & PWA (IndexedDB + Web OneDrive), Public Demo  
**Companion Interactive Mockup:** [`docs/design/ui-ux-refinements-v0.12-mockup.html`](ui-ux-refinements-v0.12-mockup.html)  

---

## 1. Executive Summary & Context

ChronoNote v0.11.1 solidified cross-platform parity across all four targets, adding full OneDrive synchronization to the Web App/PWA, offline PWA caching, phone-friendly mobile drawer enhancements (§189), and robust native update handling (§190).

With synchronization and mobile ergonomics firmly established, **v0.12.0** focuses on refining the desktop and web writing experience:
1. **Dynamic Match Highlighting in Command Palette (`Ctrl/Cmd+K`):** Real-time character highlighting for filtered commands, actions, dates, and tabs.
2. **Command Palette Line-Level Editor Actions:** Exposing line operations in the palette aligned strictly with the direct action state model (#73).
3. **Palette Data Export Command:** Direct single-keystroke JSON note export from the command palette.
4. **Resolved Action Line Muting (`.cm-line-resolved`):** Visual de-emphasis for completed (`v `) and cancelled (`x `) action lines, keeping active attention on open tasks (`# `).
5. **Redesigned Topic Pills (`.glyph-topic`):** Modern non-italicized pills with rounded borders and zero-layout-shift adaptive parentheses hiding.
6. **Cross-Platform Zen Mode:** Immersive, distraction-free writing canvas tailored specifically for desktop (native fullscreen), web (CSS translation + floating exit banner), and mobile (preserving the Mobile Accessory Bar).
7. **Full-Screen Drag-and-Drop File Import:** Defensive drop zone for web and demo builds, importing `.json` bundles with safe merge preview and `.txt` notes with collision safeguards.
8. **Modal Dialog System Modernization:** 4 standardized sizing tiers, responsive mobile overlay & sheet transitions, universal touch close affordance (`✕`), and multi-column layout reflow for History, Shortcuts, and Conflicts.
9. **Calendar Completion Heatmap:** Three-tier color-coded indicators in the date picker showing daily progress at a glance (all tasks done, pending tasks, or empty log).
10. **Contextual Search & Query Filters:** 3-line contextual expansion, search operators (`is:open`, `tag:...`, `has:@...`), and persistent in-editor pulse animation.
11. **Cloud Sync Health Dashboard:** Comprehensive telemetry popover on `#stat-cloud` (last sync, cache count, quota, and pending uploads).
12. **Canvas Typography & Pure Black OLED Mode:** User-configurable font size/line-height sliders and true `#000000` canvas dark mode.

---

## 2. Recommended Changes Compared to v0.11.1

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ChronoNote v0.12 Scope                          │
├──────────────────────┬──────────────────────┬──────────────────────────┤
│ 1. Command Palette   │ 2. Editor Styling    │ 3. Zen Mode              │
│  - Fuzzy Highlight   │  - Resolved Muting   │  - Store & Global Keymap │
│  - Line Actions (#73)│  - Redesigned Pills  │  - Desktop vs Web vs Mob │
│  - Palette Export    │  - Setext Continuity │  - Escape Guarantee      │
├──────────────────────┼──────────────────────┼──────────────────────────┤
│ 4. Web Drag & Drop   │ 5. Modal Modernize   │ 6. Cross-Platform Polish │
│  - File Interception │  - 4 Sizing Tiers    │  - Mobile Floating Toast │
│  - Merge / Collision │  - Universal Header  │  - Coarse Touch Fitts    │
│  - #stat-storage OK  │  - Multi-Column Mob  │  - Palette Filter Chips  │
│                      │  - Touch Close (✕)   │  - Surface Elevation     │
├──────────────────────┼──────────────────────┼──────────────────────────┤
│ 7. Calendar Heatmap  │ 8. Search & Filters  │ 9. Sync Telemetry & Card │
│  - Done/Pending Dots │  - 3-Line Context    │  - Last Sync / Cache Stat│
│  - Action Density    │  - Operators is:open │  - Storage Quota / Upload│
├──────────────────────┴──────────────────────┼──────────────────────────┤
│ 10. Typography & Pure Black OLED            │ 11. Parked for v0.13+    │
│  - Size (12-18px) & Spacing (1.4-1.8)       │  - Daily Rollover Flow   │
│  - Absolute #000000 OLED Canvas             │  - Tab Drag & Drop / Menu│
└─────────────────────────────────────────────┴──────────────────────────┘
```

---

### Area 1: Command Palette Enhancements (`Ctrl/Cmd+K`)

In v0.11.1, [`src/lib/commandPalette.ts`](../../src/lib/commandPalette.ts) provides prefix routing (`>`, `!`, `#`, `@`, `?`) and flat fuzzy matching, but result labels are unhighlighted, editor line actions cannot be executed from the palette, and note export requires opening Settings.

#### 1.1 Dynamic Fuzzy-Search Match Highlighting
* **Files:** [`src/lib/commandPalette.ts`](../../src/lib/commandPalette.ts), [`src/lib/components/modals/CommandPaletteModal.svelte`](../../src/lib/components/modals/CommandPaletteModal.svelte), [`src/app.css`](../../src/app.css)
* **Design Specification:**
  1. Upgrade `fuzzyMatch` in `commandPalette.ts` to compute matched character indices:
     ```typescript
     export interface FuzzyMatchResult {
       matches: boolean;
       score: number;
       indices: number[];
     }

     export function fuzzyMatchWithIndices(haystack: string, needle: string): FuzzyMatchResult | null {
       if (!needle) return { matches: true, score: 0, indices: [] };
       const h = haystack.toLowerCase();
       const n = needle.toLowerCase();
       const indices: number[] = [];
       let i = 0;
       for (let j = 0; j < h.length; j++) {
         if (h[j] === n[i]) {
           indices.push(j);
           i++;
           if (i === n.length) break;
         }
       }
       if (i < n.length) return null;
       return { matches: true, score: indices.length, indices };
     }
     ```
  2. Extend `PaletteItem` with optional `matchedIndices?: number[]`.
  3. Prefix Routing Alignment: In `buildPaletteResults(query: string)`, when queries start with `!`, `#`, `@`, or `>`, strip the prefix trigger character before computing `needle`. Calculate matched character indices against the stripped search term so that indices match character offsets in `item.label`.
  4. Safe Svelte Rendering in `CommandPaletteModal.svelte`: Render matched characters using a tokenized segment loop to avoid raw unescaped `{@html}` on user note content:
     ```svelte
     {#if row.item.matchedIndices && row.item.matchedIndices.length > 0}
       <span class="modal-item-text">
         {#each splitHighlighted(row.item.label, row.item.matchedIndices) as segment}
           {#if segment.highlight}
             <span class="palette-match">{segment.text}</span>
           {:else}
             {segment.text}
           {/if}
         {/each}
       </span>
     {:else}
       <span>{row.item.label}</span>
     {/if}
     ```
  5. Themed Match Styling in `src/app.css`:
     ```css
     .palette-match {
       color: var(--glyph-open-color);
       font-weight: 700;
       text-decoration: underline;
       text-underline-offset: 2px;
     }
     ```
     *(Uses semantic token `var(--glyph-open-color)`, resolving to `#0e7490` in light mode and `#38bdf8` in dark mode, maintaining WCAG AA contrast across all themes without hardcoded hex colors).*

#### 1.2 Line-Level Editor Commands
* **Files:** [`src/lib/controller.ts`](../../src/lib/controller.ts), [`src/lib/commandPalette.ts`](../../src/lib/commandPalette.ts), [`src/lib/components/EditorPane.svelte`](../../src/lib/components/EditorPane.svelte)
* **Design Specification:**
  1. In v0.11.1, editor operations are scoped locally inside `EditorPane.svelte`. Extend `EditorApi` in `src/lib/controller.ts` so the palette can dispatch actions to the active editor view:
     ```typescript
     export interface EditorApi {
       // ... existing methods
       closeCurrentOpenAction: () => boolean;
       reopenCurrentDoneAction: () => boolean;
       convertCurrentLineToSection: () => boolean;
       setActionStateOnSelection: (symbol: string) => boolean;
       jumpAdjacentOpenAction: (direction: 1 | -1) => boolean;
     }
     ```
  2. Implement and register these callbacks in `EditorPane.svelte` from the existing line handlers (`closeOpenAction`, `reopenDoneAction`, `convertLineToSection`, `setActionSymbolTo`, `jumpToAdjacentOpenAction`).
  3. In `commandPalette.ts`, add a dedicated `"Current line"` group to `commandItems()` matching the #73 direct action model and platform-aware shortcut registry (`shortcuts.ts`):
     - `"Close open action on current line"` (Hint: `Ctrl+Space` [Win/Linux] / `Cmd+Enter` [Mac])
     - `"Reopen done action on current line"` (Hint: `Ctrl+Shift+Space` [Win/Linux] / `Cmd+Shift+Enter` [Mac])
     - `"Convert line to section header"` (Hint: `Ctrl/Cmd+Shift+S`)
     - `"Set line/selection to Open"` (Hint: `Ctrl/Cmd+1`)
     - `"Set line/selection to Done"` (Hint: `Ctrl/Cmd+2`)
     - `"Set line/selection to Deferred"` (Hint: `Ctrl/Cmd+3`)
     - `"Set line/selection to Won't-Do"` (Hint: `Ctrl/Cmd+4`)
     - `"Jump to next open action"` (Hint: `F2`)
     - `"Jump to previous open action"` (Hint: `Shift+F2`)

#### 1.3 Data Export Command
* **Files:** [`src/lib/commandPalette.ts`](../../src/lib/commandPalette.ts), [`src/lib/exportImport.ts`](../../src/lib/exportImport.ts)
* **Design Specification:**
  - Add to `commandItems()` under group `"Commands"`:
    ```typescript
    {
      id: "cmd-export-notes",
      label: "Export all notes to file (.json)",
      hint: "Export",
      group: "Commands",
      run: async () => {
        await exportAllNotesToFile();
      },
    }
    ```

---

### Area 2: Editor Presentation & Monospace Styling

#### 2.1 Visual Muting for Resolved Actions (`.cm-line-resolved`)
* **Files:** [`src/lib/components/EditorPane.svelte`](../../src/lib/components/EditorPane.svelte), [`src/app.css`](../../src/app.css)
* **Objective:** Direct visual focus toward open action items (`# `) by gently muting completed (`v `) and cancelled (`x `) action lines, while strictly preserving the monospace grid.
* **Design Specification:**
  1. Add a CodeMirror 6 `ViewPlugin` in `EditorPane.svelte` applying line decorations:
     ```typescript
     const RESOLVED_LINE_REGEX = /^\s*(?:=>\s)?[vx]\s/;

     function buildResolvedLineDecorations(view: EditorView) {
       const builder = new RangeSetBuilder<Decoration>();
       for (const { from, to } of view.visibleRanges) {
         let pos = from;
         while (pos <= to) {
           const line = view.state.doc.lineAt(pos);
           if (RESOLVED_LINE_REGEX.test(line.text)) {
             builder.add(line.from, line.from, Decoration.line({ class: "cm-line-resolved" }));
           }
           pos = line.to + 1;
         }
       }
       return builder.finish();
     }

     const resolvedLinesPlugin = ViewPlugin.fromClass(
       class {
         decorations: DecorationSet;
         constructor(view: EditorView) {
           this.decorations = buildResolvedLineDecorations(view);
         }
         update(update: ViewUpdate) {
           if (update.docChanged || update.viewportChanged) {
             this.decorations = buildResolvedLineDecorations(update.view);
           }
         }
       },
       { decorations: (v) => v.decorations },
     );
     ```
  2. In `src/app.css`:
     ```css
     .cm-line.cm-line-resolved {
       opacity: 0.72;
       transition: opacity 150ms ease;
     }

     /* Full opacity restored on hover or when the cursor focuses within the line */
     .cm-line.cm-line-resolved:hover,
     .cm-line.cm-line-resolved:focus-within {
       opacity: 1;
     }
     ```
  3. Tenet Safeguards:
     - Deferred lines (`> `) remain at `1.0` opacity, as forwarded items remain active context for the day.
     - Consequence actions (`=> v `) and indented items (`  v `) are recognized by `RESOLVED_LINE_REGEX`.
     - In Grayscale mode (`[data-color-mode="grayscale"]`), where `.glyph-done` has `--glyph-done-opacity: 0.55`, ensure the line opacity does not degrade below WCAG AA contrast (`.cm-line-resolved .glyph-done { opacity: 1; }` when muted).

#### 2.2 Topic Pill Redesign (`.glyph-topic`)
* **Files:** [`src/lib/editor/glyphs.ts`](../../src/lib/editor/glyphs.ts), [`src/app.css`](../../src/app.css)
* **Objective:** Replace the italicized outlined tag from v0.11.1 with a sleek, upright rounded pill, hiding the enclosing `()` parentheses when the line is inactive while preserving exact monospace alignment.
* **Design Specification:**
  1. **Aesthetics:**
     - **No Italics:** Upright text (`font-style: normal; font-weight: 500;`).
     - **Rounded Pill Shape:** `border-radius: 4px; border: 1px solid var(--edge-strong);`
     - **Surface Fill:** `background: rgba(255, 255, 255, 0.05)` (Dark theme) / `background: rgba(0, 0, 0, 0.04)` (Light theme).
  2. **Adaptive Parentheses Hiding (Monospace-Preserved Zero Shift):**
     - The raw `(` and `)` characters remain physically in the DOM within the pill's border, each occupying `1ch` width.
     - **When Line is Inactive (unselected):** The `(` and `)` parentheses are styled with `color: transparent; user-select: none;`. Because they occupy physical space inside the rounded border, they serve as natural `1ch` left and right interior padding for the word inside. Total visual width equals `text.length * 1ch`. **Zero character shift occurs** on trailing line text when clicking in or out of the line.
     - **When Line is Active (cursor on line, selection intersects line, or mouse hovers):** The `(` and `)` parentheses smoothly fade into view in `var(--muted)` with `opacity: 0.75`. The user sees the literal plain-text `(topic)` syntax for transparent editing.
  3. **CodeMirror 6 Implementation:**
     - In `glyphs.ts`, the topic decorator checks active selection:
       ```typescript
       const { ranges } = view.state.selection;
       const lineIsActive = ranges.some((r) => r.from <= line.to && r.to >= line.from);
       ```
     - When matching `(topic)`:
       - Applies `Decoration.mark({ class: lineIsActive ? "glyph-topic glyph-topic-active" : "glyph-topic" })` over the entire span.
       - When `!lineIsActive`: Wraps the leading `(` and trailing `)` with `Decoration.mark({ class: "glyph-topic-paren" })`.
  4. **CSS Architecture in `src/app.css`:**
     ```css
     .glyph-topic {
       display: inline-block;
       background: rgba(255, 255, 255, 0.05);
       border: 1px solid var(--edge-strong);
       border-radius: 4px;
       color: var(--text);
       font-style: normal;
       font-weight: 500;
       line-height: normal;
       vertical-align: baseline;
       transition: border-color 150ms ease, background-color 150ms ease;
     }
     [data-theme="light"] .glyph-topic {
       background: rgba(0, 0, 0, 0.04);
     }

     /* Inactive line: parentheses are transparent but occupy exact 1ch width */
     .glyph-topic .glyph-topic-paren {
       color: transparent;
       user-select: none;
       transition: color 150ms ease, opacity 150ms ease;
     }

     /* Active line, focus, or hover: reveals parentheses */
     .cm-line:hover .glyph-topic .glyph-topic-paren,
     .cm-line:focus-within .glyph-topic .glyph-topic-paren,
     .glyph-topic-active .glyph-topic-paren,
     .glyph-topic:hover .glyph-topic-paren {
       color: var(--muted);
       opacity: 0.75;
     }
     .cm-line:focus-within .glyph-topic,
     .glyph-topic-active {
       border-color: var(--tab-active-border);
     }
     ```

#### 2.3 Setext Double Rule Continuity (§81)
* **Preservation Requirement:** Maintain the exact title-length double rule implemented in `app.css` line 983 (`.cm-setext-rule`). The rule must span only the length of the `=` characters matching the section title above it, rendered as two 1px background gradients at `51% ± 0.09em`, revealing editable `=` characters on hover or cursor focus with zero vertical layout shift. Full-width horizontal border rules remain prohibited.

---

### Area 3: Distraction-Free Zen Mode

* **Files:** [`src/lib/stores.ts`](../../src/lib/stores.ts), [`src/lib/shortcuts.ts`](../../src/lib/shortcuts.ts), [`src/App.svelte`](../../src/App.svelte), [`src/app.css`](../../src/app.css)
* **Objective:** Provide a single-key toggle to hide secondary application chrome for distraction-free note writing across all targets.
* **Design Specification:**
  1. Global State: Add `isZenMode = writable<boolean>(false)` in `src/lib/stores.ts`.
  2. Shortcut Registry: Register `"toggleZenMode"` in `src/lib/shortcuts.ts` bound to `F11`.
  3. Command Palette: Add `"Toggle Zen mode (distraction-free canvas)"` under `"Commands"`.
  4. Platform-Specific Target Behavior:
     - **Web App / PWA & Public Demo:**
       Add `body.zen-mode` class toggling CSS transitions:
       ```css
       body.zen-mode #top-bar {
         transform: translateY(-100%);
         opacity: 0;
         pointer-events: none;
       }
       body.zen-mode #status-bar {
         transform: translateY(100%);
         opacity: 0;
         pointer-events: none;
       }
       #zen-banner {
         position: fixed;
         top: 12px;
         right: 16px;
         background: var(--surface-overlay);
         border: 1px solid var(--edge-strong);
         border-radius: 4px;
         padding: 4px 10px;
         font-size: 11px;
         color: var(--muted);
         z-index: 50;
         display: flex;
         align-items: center;
         gap: 6px;
         box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
         animation: fadeIn 200ms ease;
       }
       .zen-exit-btn {
         background: none;
         border: none;
         color: var(--text);
         text-decoration: underline;
         cursor: pointer;
         font-family: inherit;
         font-size: inherit;
       }
       ```
     - **Desktop (Tauri 2):**
       Desktop builds have `decorations: false` where [`TopBar.svelte`](../../src/lib/components/TopBar.svelte) is the OS title bar. Hiding `#top-bar` via CSS would remove window controls. Instead, desktop Zen Mode triggers Tauri's native fullscreen API:
       `getCurrentWindow().setFullscreen(true)`. The OS manages the full-screen canvas, and pressing `Escape` or `F11` restores normal windowed chrome.
     - **Android Mobile:**
       Hides `#top-bar` and `#status-bar` while **preserving the Mobile Accessory Bar** above the virtual keyboard so touch users can indent, toggle tokens, and dismiss the soft keyboard.
  5. Exit Guarantee: Pressing `Escape` or `F11` anywhere in the app immediately exits Zen Mode (`isZenMode.set(false)`).

---

### Area 4: Web Application & Data Portability

#### 4.1 Full-Screen Drag-and-Drop File Import
* **Files:** [`src/App.svelte`](../../src/App.svelte), [`src/app.css`](../../src/app.css), [`src/lib/exportImport.ts`](../../src/lib/exportImport.ts)
* **Objective:** Intercept accidental file drops that cause web browsers to navigate away from the app, routing dropped notes directly into ChronoNote's safe import engine.
* **Design Specification:**
  1. Active only in Web App and Demo (`$backendKind === "web" || $backendKind === "demo"`).
  2. Window-Level Event Interception: Handle `dragenter`, `dragover`, `dragleave`, and `drop` with `e.preventDefault()`. Use a depth counter to prevent flicker over child DOM nodes:
     ```typescript
     let dragDepth = 0;
     let isDraggingFile = false;

     function onWindowDragEnter(e: DragEvent) {
       e.preventDefault();
       if (e.dataTransfer?.types?.includes("Files")) {
         dragDepth++;
         isDraggingFile = true;
       }
     }

     function onWindowDragLeave(e: DragEvent) {
       e.preventDefault();
       dragDepth--;
       if (dragDepth <= 0) {
         dragDepth = 0;
         isDraggingFile = false;
       }
     }

     function onWindowDragOver(e: DragEvent) {
       e.preventDefault(); // Prevents browser from opening file as navigation target
     }

     async function onWindowDrop(e: DragEvent) {
       e.preventDefault();
       dragDepth = 0;
       isDraggingFile = false;
       const files = Array.from(e.dataTransfer?.files ?? []);
       if (files.length === 0) return;

       const jsonFile = files.find((f) => f.name.endsWith(".json"));
       if (jsonFile) {
         await controller.handleDroppedBundle(jsonFile);
         return;
       }

       const txtFiles = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f.name));
       if (txtFiles.length > 0) {
         await controller.handleDroppedNotes(txtFiles);
         return;
       }

       controller.showToast("Unsupported file. Drop a .json export bundle or YYYY-MM-DD.txt note.");
     }
     ```
  3. Overlay Backdrop Markup:
     ```svelte
     {#if isDraggingFile}
       <div id="drop-overlay" aria-hidden="true">
         <div class="drop-banner">
           <Icon name="import" size={24} />
           <span>Drop .json export bundle or .txt notes to import</span>
         </div>
       </div>
     {/if}
     ```
  4. Styling in `src/app.css`:
     ```css
     #drop-overlay {
       position: fixed;
       inset: 0;
       background: rgba(14, 116, 144, 0.18);
       backdrop-filter: blur(4px);
       border: 3px dashed var(--glyph-open-color);
       display: flex;
       align-items: center;
       justify-content: center;
       z-index: 200;
       pointer-events: none;
       animation: fadeIn 120ms ease;
     }
     .drop-banner {
       background: var(--surface-overlay);
       border: 1px solid var(--edge-strong);
       border-radius: 8px;
       padding: 24px 36px;
       font-size: 15px;
       font-weight: 600;
       color: var(--text);
       box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
       display: flex;
       align-items: center;
       gap: 14px;
     }
     ```
  5. Import Safety Invariants:
     - Dropping `.json` bundles opens `SettingsModal`'s preview dialog with `mode = "merge"`, preventing accidental note overwrites.
     - Dropping `YYYY-MM-DD.txt` daily notes checks whether the note already exists in the backend before importing, preventing silent data loss.

#### 4.2 Status Bar Storage Button Continuity
* **Preservation Requirement:** In [`src/lib/components/StatusBar.svelte`](../../src/lib/components/StatusBar.svelte), `#stat-storage` remains an interactive `<button id="stat-storage" class="status-folder-btn">` that opens Settings on click, matching `#stat-folder` (Desktop) and `#stat-cloud` (OneDrive). Its existing implementation is retained without alteration.

---

### Area 5: Modal Dialog System Modernization & Mobile Ergonomics

An exhaustive audit of all 16 modals in [`src/lib/components/modals/`](../../src/lib/components/modals/) revealed several systemic design inconsistencies and severe mobile scaling failures that have accumulated as features were added:
1. **Unstandardized Inline Sizing:** Rather than using a coherent design scale, dialogs use 8 different arbitrary inline pixel widths (`420px`, `440px`, `480px`, `520px`, `560px`, `720px`, `880px`), leading to visual dissonance.
2. **Fatal Multi-Column Layout Collapse on Mobile:**
   - **`HistoryModal.svelte`:** On viewports under 680px, the 320px fixed preview pane crushes `.history-main` down to 10–48px width, rendering the history list completely unreadable.
   - **`ShortcutsModal.svelte`:** Splitting a 360–400px mobile screen into two 160px columns causes continuous awkward 2-word line wrapping and layout chaos.
   - **`SyncConflictsModal.svelte`:** Side-by-side text diff squashes local and OneDrive note columns into illegible slivers.
   - **`CalendarSyncReviewModal.svelte`:** In removal items, the Segmented choice control + date picker horizontally crowd out the event title on narrow devices.
3. **Rigid Overlay Placement:** Hardcoded `padding-top: 50px; align-items: flex-start;` pushes dialogs downward on mobile screens, causing keyboards or small displays to clip footer actions.
4. **Header Inconsistency & Absent Touch Close Affordance:** Only 2 modals (`MigrateNotesModal` and `OneDriveFolderPickerModal`) include a top-right close (`✕`) button. The other 14 modals rely strictly on `Esc` or clicking the dim backdrop. On touchscreens with no physical keyboard and dialogs taking up 92vw, users are trapped with no obvious touch affordance to dismiss the dialog.
5. **Desktop Shortcut Clutter on Touchscreens:** Footers display desktop keyboard instructions (`<kbd>Enter</kbd>`, `<kbd>Shift+Enter</kbd>`, `<kbd>Ctrl+Space</kbd>`) that are unusable on touch devices.
6. **Height Capping & Keyboard Resiliency:** Hardcoded `max-height: 380px` fails on landscape phones or when virtual keyboards deploy.

#### 5.1 Standardized Modal Sizing Scale (4 Tiers)
* **Files:** [`src/app.css`](../../src/app.css), and all modal components in `src/lib/components/modals/`.
* **Design Specification:**
  Replace inline `style="width: ...px"` with 4 semantic CSS tier classes:
  1. **`.modal-sm` (440px max):** Confirmation dialogs, warnings, and compact forms.
     - Used by: `AboutModal`, `SafetyModal`, `UnsavedScratchpadsModal`, `MigrateNotesModal`.
  2. **`.modal-md` (560px max):** Utility dialogues and single-column settings.
     - Used by: `SettingsModal`, `ConflictModal`, `SyncConflictsModal`, `CommandPaletteModal`.
  3. **`.modal-lg` (720px max):** Search, agendas, and worklists.
     - Used by: `ActionDrawerModal`, `SearchModal`, `CalendarSyncReviewModal`, `OneDriveFolderPickerModal`.
  4. **`.modal-xl` (880px max):** Dual-pane explorer studios.
     - Used by: `HistoryModal`, `ShortcutsModal`.

  * **Fluid CSS Grid Rule:**
    ```css
    .modal-card {
      background: var(--surface-overlay);
      border: 1px solid var(--edge-strong);
      border-radius: 8px;
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      width: min(100%, var(--modal-width, 720px));
      max-width: calc(100vw - 24px);
    }
    .modal-card.modal-sm { --modal-width: 440px; }
    .modal-card.modal-md { --modal-width: 560px; }
    .modal-card.modal-lg { --modal-width: 720px; }
    .modal-card.modal-xl { --modal-width: 880px; }
    ```

#### 5.2 Mobile-Responsive Viewport & Overlay Transitions
* **Files:** [`src/app.css`](../../src/app.css)
* **Design Specification:**
  Responsive overlay adaptation for mobile screens (`@media (max-width: 600px)`):
  ```css
  @media (max-width: 600px) {
    .overlay {
      padding: env(safe-area-inset-top, 12px) 12px env(safe-area-inset-bottom, 12px) 12px;
      align-items: center; /* Centered modal on mobile, avoiding keyboard push-off */
      justify-content: center;
    }
    .modal-card {
      border-radius: 12px;
      max-height: min(90dvh, 85vh);
      max-width: calc(100vw - 16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
    }
    .modal-list {
      max-height: min(340px, 50dvh);
    }
  }
  ```

#### 5.3 Universal Header Pattern & Touch Close Affordance (`✕`)
* **Files:** All modals in `src/lib/components/modals/`, [`src/app.css`](../../src/app.css)
* **Design Specification:**
  1. Standardize every modal header into a three-element layout:
     ```svelte
     <div class="modal-input-wrap modal-title">
       <div class="modal-header-leading">
         <Icon name="{iconName}" size={15} />
         <span>{title}</span>
       </div>
       {#if counterText}
         <span class="modal-counter">{counterText}</span>
       {/if}
       <button
         type="button"
         class="icon-btn modal-close-btn"
         aria-label="Close dialog"
         on:click={closeHandler}
       >
         <Icon name="close" size={14} />
       </button>
     </div>
     ```
  2. Searchable modals (`CommandPaletteModal`, `SearchModal`, `ActionDrawerModal`) retain their `<input class="modal-input">` but add the dedicated `.modal-close-btn` on the right edge.
  3. Touch Hit Area: `.modal-close-btn` has `width: 32px; height: 32px;` with an invisible touch expansion (`::after` min 44×44px hit-box under `pointer: coarse`).

#### 5.4 Mobile Multi-Column Layout Transformations
* **Files:** [`src/lib/components/modals/HistoryModal.svelte`](../../src/lib/components/modals/HistoryModal.svelte), [`src/lib/components/modals/ShortcutsModal.svelte`](../../src/lib/components/modals/ShortcutsModal.svelte), [`src/lib/components/modals/SyncConflictsModal.svelte`](../../src/lib/components/modals/SyncConflictsModal.svelte), [`src/lib/components/modals/CalendarSyncReviewModal.svelte`](../../src/lib/components/modals/CalendarSyncReviewModal.svelte), [`src/app.css`](../../src/app.css)
* **Design Specification:**
  1. **`HistoryModal.svelte` Responsive Tabbed Preview:**
     - On screens ≤ 680px, replace the side-by-side flex row with an adaptive tab toggle above the body: `[ History List ({count}) ] [ Occurrence Preview ]`.
     - Tapping any occurrence or item in mobile mode automatically switches to the Preview tab, allowing the user to view the full diff and tap "Import action" without horizontal squashing.
  2. **`ShortcutsModal.svelte` Segmented View:**
     - On screens ≤ 680px, introduce a top segmented switcher: `[ Shortcuts ] [ Glyphs & Symbols ]`. Each panel occupies 100% width with generous touch-friendly row heights.
  3. **`SyncConflictsModal.svelte` Segmented Diff:**
     - On screens ≤ 520px, add a segmented view toggle: `[ This Device ] [ OneDrive ] [ Side-by-Side ]`.
     - Stacks the version columns with high-contrast color chips (`var(--state-warn)` and `var(--glyph-open-color)`).
  4. **`CalendarSyncReviewModal.svelte` Stacked Removals:**
     - On screens ≤ 520px, `.sync-review-removal` reflows into a two-row block: meeting title on top, Segmented action button row underneath.

#### 5.5 Palette Legend Tap-Chips & Adaptive Footers
* **Files:** [`src/lib/components/modals/CommandPaletteModal.svelte`](../../src/lib/components/modals/CommandPaletteModal.svelte), [`src/app.css`](../../src/app.css)
* **Design Specification:**
  1. Convert the static `.palette-legend` spans into interactive tap chips:
     ```svelte
     <div class="palette-legend">
       <button type="button" class="palette-chip" on:click={() => setPrefix(">")}>
         <kbd>&gt;</kbd> commands
       </button>
       <button type="button" class="palette-chip" on:click={() => setPrefix("!")}>
         <kbd>!</kbd> actions
       </button>
       <button type="button" class="palette-chip" on:click={() => setPrefix("@")}>
         <kbd>@</kbd> dates
       </button>
       <button type="button" class="palette-chip" on:click={() => setPrefix("?")}>
         <kbd>?</kbd> shortcuts
       </button>
     </div>
     ```
     On mobile, users can tap chips directly instead of hunting for `>`, `!`, or `@` on secondary soft keyboard layers.
  2. Footer Suppression on Touch: Under `@media (pointer: coarse)` or mobile viewport, hide desktop keyboard shortcut hints (`<kbd>Ctrl+Space</kbd>`, etc.) to eliminate vertical clutter.

---

### Area 6: Additional Cross-Platform UX Polish

#### 6.1 Viewport-Aware Dynamic Floating Toast
* **Problem:** In v0.11.1, transient toast messages reside in the bottom status bar (`#stat-message`). On mobile devices, the status bar is frequently occluded by virtual keyboards, resting hands, or browser navigation bars.
* **Design Specification:**
  - On desktop, keep `#stat-message` in the status bar (preserving clean workspace design).
  - On mobile/touch targets (`@media (pointer: coarse)` or `$isMobile`), display transient notifications as a centered floating toast banner anchored 12px below the top bar or tab bar:
    ```css
    @media (pointer: coarse) {
      .mobile-toast {
        position: fixed;
        top: 48px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--surface-overlay);
        color: var(--text);
        border: 1px solid var(--edge-strong);
        border-radius: 20px;
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        z-index: 500;
        pointer-events: none;
        animation: toastSlideDown 180ms cubic-bezier(0.16, 1, 0.3, 1);
      }
    }
    ```

#### 6.2 Fitts's Law Hit-Area Expansion for Touch Targets
* **Problem:** Interactive elements like tab close buttons (`13px`), calendar day cells, and icon buttons (`24px`) can cause touch misses on high-DPI phone screens.
* **Design Specification:**
  - Apply WCAG 2.5.5 / 2.5.8 compliant pseudo-element hit expansions under `@media (pointer: coarse)`:
    ```css
    @media (pointer: coarse) {
      .icon-btn,
      .drawer-tab-close,
      .tab-close,
      .cal-day,
      .modal-close-btn {
        position: relative;
      }
      .icon-btn::after,
      .tab-close::after,
      .modal-close-btn::after {
        content: "";
        position: absolute;
        inset: -8px;
        min-width: 44px;
        min-height: 44px;
      }
    }
    ```

#### 6.3 Surface Elevation & Dark Mode Luminance Borders
* **Problem:** In dark theme, high-elevation surfaces (`--surface-overlay`) can bleed into background canvas on non-OLED displays without border contrast.
* **Design Specification:**
  - Standardize subtle 1px border highlights using `var(--edge-strong)` with an inset highlight (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 16px 44px rgba(0, 0, 0, 0.5)`).
  - Gives modals, popovers, and drawers a clean, tactile depth across all theme modes.

#### 6.4 Expressive Empty States
* **Problem:** Current empty states (`.modal-empty`) are plain monospace text lines ("No matches.", "No prior occurrences found...").
* **Design Specification:**
  - Elevate empty states with a centered monoline SVG mark (opacity 0.35, size 28px), a 13px bold title, and a 11px muted subtitle guiding the user's next action.

---

### Area 7: Calendar Navigation & Completion Heatmap

#### 7.1 Three-Tier Completion Heatmap Dots
* **Files:** [`src/lib/components/modals/DatePickerModal.svelte`](../../src/lib/components/modals/DatePickerModal.svelte), [`src/lib/date.ts`](../../src/lib/date.ts), [`src/app.css`](../../src/app.css)
* **Problem:** In v0.11.1, the date picker only displays binary indicators: whether a note exists (`.hasnote`), and whether it has open actions (`.has`). It cannot distinguish between a day where all planned tasks were completed versus a day with zero tasks (pure journal log), nor does it provide a sense of achievement across the month.
* **Design Specification:**
  1. Upgrade cell action status resolution into 3 distinct semantic tiers:
     - **`.cal-status-done` (Green dot / `var(--glyph-done-color)`):** Note exists, contains $\ge 1$ action items, and 100% of actions are resolved (`v ` or `x `).
     - **`.cal-status-pending` (Amber dot / `var(--state-warn)`):** Note exists and contains at least 1 open (`# `) or deferred (`> `) action.
     - **`.cal-status-log` (Dim muted dot / `var(--muted)`):** Note exists but contains 0 action items (pure meeting notes or reference logs).
  2. Visual Layout in `src/app.css`:
     ```css
     .cal-status-dot {
       width: 4px;
       height: 4px;
       border-radius: 50%;
       margin: 1px auto 0;
       transition: transform 120ms ease;
     }
     .cal-day:hover .cal-status-dot {
       transform: scale(1.3);
     }
     .cal-status-dot.done { background: var(--glyph-done-color); }
     .cal-status-dot.pending { background: var(--state-warn); }
     .cal-status-dot.log { background: var(--muted); opacity: 0.5; }
     ```
  3. Screen Reader & Accessibility:
     Enrich `aria-label` with completion context:
     - e.g., `"2026-09-18, all tasks completed"`
     - `"2026-09-19, 2 open actions pending"`
     - `"2026-09-20, note log with no tasks"`

---

### Area 8: Cross-File Search Context & Query Filters

#### 8.1 Contextual 3-Line Expansion in Search Results
* **Files:** [`src/lib/components/modals/SearchModal.svelte`](../../src/lib/components/modals/SearchModal.svelte), [`src/app.css`](../../src/app.css)
* **Problem:** In v0.11.1, search matches are rendered as single disconnected lines. In meeting notes and design documents, a single line like `➔ @marien Confirm export bundle` lacks immediate context unless the user navigates into the note to read the surrounding section.
* **Design Specification:**
  1. Add a contextual expansion toggle to each search result row:
     - Hovering or expanding an item displays a preview snippet showing **1 line before** and **1 line after** the match.
     - The matching line is rendered with bold match highlighting, while surrounding lines are visually dimmed (`opacity: 0.65`).
  2. Monospace Alignment: The 3-line snippet preserves exact monospace tabular indentation.

#### 8.2 Lightweight Search Syntax Operators
* **Files:** [`src/lib/components/modals/SearchModal.svelte`](../../src/lib/components/modals/SearchModal.svelte)
* **Design Specification:**
  Support simple, zero-latency in-memory query prefixes:
  - `is:open` — Restricts results to open action lines (`# `).
  - `is:done` — Restricts results to completed action lines (`v `).
  - `tag:<topic>` — Matches lines containing topic tag `(topic)` (e.g. `tag:ui`).
  - `has:@<name>` — Matches lines assigned to a collaborator (e.g. `has:@marien`).
  - `since:YYYY-MM-DD` / `before:YYYY-MM-DD` — Filters notes by date range.

#### 8.3 Persistent In-Editor Match Pulse
* **Files:** [`src/lib/components/Editor.svelte`](../../src/lib/components/Editor.svelte), [`src/app.css`](../../src/app.css)
* **Design Specification:**
  When jumping to a file and line from Search or Section History:
  1. Center the editor cursor on the target line.
  2. Apply a temporary pulse animation class `.cm-line-hit-pulse` for 1.2 seconds:
     ```css
     @keyframes searchHitPulse {
       0% { background: color-mix(in srgb, var(--glyph-open-color) 35%, transparent); }
       100% { background: transparent; }
     }
     .cm-line-hit-pulse {
       animation: searchHitPulse 1200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
     }
     ```
  Provides immediate visual orientation when landing in a long document.

---

### Area 9: Cloud Sync Health & Telemetry Dashboard

#### 9.1 Interactive Sync Health Popover on `#stat-cloud`
* **Files:** [`src/lib/components/StatusBar.svelte`](../../src/lib/components/StatusBar.svelte), [`src/lib/components/modals/SyncHealthPopover.svelte`](../../src/lib/components/modals/SyncHealthPopover.svelte), [`src/app.css`](../../src/app.css)
* **Problem:** Cloud synchronization in the Web App/PWA and Android builds runs entirely quietly in the background. Users have no direct way to check when the last synchronization succeeded, how many notes are mirrored in IndexedDB, or if background uploads are queued.
* **Design Specification:**
  1. Clicking `#stat-cloud` in the status bar opens an anchored telemetry popover card (matching the lightweight non-modal architecture of `DatePickerModal`):
     - **Sync Status Pill:** Live indicator:
       - `● In sync` (Green, `var(--state-ok)`)
       - `⟳ Syncing changes…` (Rotating spinner)
       - `▲ Offline (cached)` (Amber, `var(--state-warn)`)
     - **Last Successful Sync:** Humanized relative time (e.g., *"Just now (16:42)"* or *"12 minutes ago"*).
     - **Local Cache Stats:** Number of notes stored locally (e.g., *"52 notes in IndexedDB"*).
     - **Connected Account:** Masked user identity (`user@domain.com`) and target OneDrive folder path (`/Documents/ChronoNote`).
     - **Action Buttons:**
       - `Sync Now`: Triggers immediate background delta sync.
       - `Open Settings`: Jumps directly to the Notes & Sync tab in `SettingsModal`.

---

### Area 10: Canvas Density, Typography & Pure Black OLED Mode

#### 10.1 Editor Font Size & Line-Height Sliders
* **Files:** [`src/lib/components/modals/SettingsModal.svelte`](../../src/lib/components/modals/SettingsModal.svelte), [`src/app.css`](../../src/app.css), [`src/lib/controller.ts`](../../src/lib/controller.ts)
* **Problem:** Monospace font size is currently hardcoded to 13px with fixed line spacing. High-DPI laptop screens, external desktop monitors, and mobile phone displays require customizable density for optimal reading comfort.
* **Design Specification:**
  1. Add two continuous range sliders in `SettingsModal.svelte` under the **Editor** section:
     - **Base Font Size:** Range `12px` to `18px` in 0.5px increments (default `13px`).
     - **Line Spacing:** Range `1.30` to `1.80` in 0.05 increments (default `1.55`).
  2. Reactive CSS Variables:
     ```css
     .cm-editor {
       font-size: var(--editor-font-size, 13px);
       line-height: var(--editor-line-height, 1.55);
     }
     ```
  3. Real-time preview: Adjusting sliders immediately reflows the canvas beneath the modal without requiring a restart.

#### 10.2 Pure Black OLED Dark Theme
* **Files:** [`src/lib/types.ts`](../../src/lib/types.ts), [`src/app.css`](../../src/app.css)
* **Problem:** Modern smartphones and tablets utilize OLED screens where absolute black (`#000000`) turns off individual pixels, saving battery and maximizing contrast in low-light environments. ChronoNote’s default dark canvas is `#1e1e1e`.
* **Design Specification:**
  1. Extend `ThemeMode` with an optional `"oled"` variant or an Appearance toggle: `Pure Black (OLED)`.
  2. Tokens for `[data-theme="oled"]`:
     ```css
     [data-theme="oled"] {
       --surface-canvas: #000000;
       --surface-chrome: #0a0a0a;
       --surface-overlay: #121212;
       --surface-raised: #1e1e1e;
       --edge-soft: rgba(255, 255, 255, 0.10);
       --edge-strong: rgba(255, 255, 255, 0.18);
       --text: #e0e0e0;
       --muted: #8e8e8e;
     }
     ```

---

### Area 11: Parked Concepts for Future Consideration (Post-v0.12)

The following high-value ideas were evaluated during the UX audit and are documented here for future consideration in subsequent releases:

1. **Daily Rollover & Morning Review Workflow:**
   - Automatic morning prompt on empty today notes (*"Carry forward 3 open actions from yesterday?"*) with selective rollover checkboxes.
   - Reusable daily note templates (`=== Priorities ===`, `=== Standup ===`).
2. **Tab Drag-and-Drop & Context Menus:**
   - Mouse/touch drag reordering in the tab strip.
   - Right-click tab context menu: `Close`, `Close Others`, `Close to the Right`, `Rename Scratchpad`, `Reveal on Disk / OneDrive`.
   - `Ctrl+Tab` Most-Recently-Used (MRU) quick switcher.
3. **Action Drawer Multi-Select & Bulk Operations:**
   - Checkbox multi-selection in `ActionDrawerModal.svelte` to batch forward, mark done, or retag multiple tasks in a single operation.
4. **Mobile Day-Swipe Gestures & Won't-Do Glyph:**
   - Horizontal swipe gesture across the editor canvas to hop between consecutive calendar days.
   - Adding the missing `x` (won't-do `☒`) button to `MobileAccessoryBar.svelte`.

---

### Area 12: Architectural Invariants & Quality Gates

1. **Tabular Monospace Grid Preservation:** All glyphs (`☐`, `☑`, `»`, `☒`, `➔`, `•`) and pill borders must preserve exact monospace character alignment (`2ch` or `3ch`). No token replacement or styling may nudge subsequent characters off their monospace column.
2. **Zero Database / Pure Plain Text UTF-8:** Note files on disk, in IndexedDB, and on OneDrive remain pure human-readable plain text (`YYYY-MM-DD.txt`). No proprietary syntax markers, front-matter, or hidden headers.
3. **Universal Command Interface (`TauriCommands`):** All storage operations must flow through [`src/lib/tauriCommands.ts`](../../src/lib/tauriCommands.ts) across Rust, IndexedDB, and in-memory mock targets.
4. **Iconography Discipline:** All new controls must use ChronoNote's custom monoline SVG icon system ([`src/lib/icons/paths.ts`](../../src/lib/icons/paths.ts)). Emoji remain prohibited in the chrome.
5. **Quality Verification Protocol:** Every implementation must pass the standard 4-target test gate:
   ```bash
   # 1. Type-check Svelte 5 and TypeScript
   npm run check

   # 2. Frontend Vitest unit suite (438+ passing)
   npm test

   # 3. Rust unit tests (138+ passing)
   cargo test --manifest-path src-tauri/Cargo.toml

   # 4. Production web and desktop build
   npm run build
   ```

---

## 3. Summary of Deliverables

- **Roadmap Specification:** [`docs/design/ui-ux-refinements-v0.12-roadmap.md`](ui-ux-refinements-v0.12-roadmap.md)
- **Interactive Companion Mockup:** [`docs/design/ui-ux-refinements-v0.12-mockup.html`](ui-ux-refinements-v0.12-mockup.html)
- **Design Index:** [`docs/design/README.md`](README.md)

