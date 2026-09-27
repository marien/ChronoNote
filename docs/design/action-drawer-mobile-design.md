# Action Drawer: Mobile Portrait Layout & Ergonomics Design

## Context & Problem Statement

In ChronoNote's Action Drawer (`ActionDrawerModal.svelte`), each action row is displayed as a single horizontal line containing:
1. State glyph (`☐`, `☑`, `☒`, `➔`, etc.)
2. Action text (`modal-item-main`)
3. Section breadcrumb (`{#if item.header}<span class="item-breadcrumb">· {item.header}</span>{/if}`)
4. Line tag (`<div class="item-tag">line N</div>`)

On desktop monitors (800px+ width), this row structure works well. Desktop also leverages a CSS hover transition (`.modal-item:hover .item-breadcrumb { max-width: 0; opacity: 0; margin-right: 0; }`), allowing users to sweep their mouse over a row to temporarily collapse the section breadcrumb and reveal long task descriptions.

### Mobile Portrait Crowding
On mobile portrait viewports (360px–420px width), the single-line layout breaks down completely:
- **Line Number Tag (`.item-tag`)**: Consumes ~50px–65px.
- **Section Breadcrumb (`.item-breadcrumb`)**: Allocated `max-width: 50%` (~120px–160px). Crucially, **touchscreens have no hover state**, so the breadcrumb never collapses.
- **Remaining Task Space**: After subtracting margins, padding (14px × 2), and glyph space, the actual action text is crushed down to **~90px–110px**.
- **Result**: Only ~10–14 characters are readable before clipping with ellipsis (e.g., `# Prepare the...`), rendering the drawer ineffective for scanning daily tasks on mobile.

---

## Architectural & UX Analysis

### 1. Line Numbers (`.item-tag`) on Mobile
- **Verdict: Useless on mobile portrait; suppress.**
- **Rationale**: On mobile touchscreens, navigation is strictly direct-manipulation: tapping any row immediately opens the file and jumps the editor directly to that exact line. Mobile users do not reference line numbers for orientation or manual navigation. Consuming 15% of the total screen width for `line 14` is poor mobile ergonomics.

### 2. Section Breadcrumbs (`.item-breadcrumb`) on Mobile Portrait
- **Verdict: Suppress on mobile portrait.**
- **Rationale**: 
  - On desktop, the breadcrumb adds context during wide scans and collapses on hover when reading long actions.
  - On mobile portrait, screen real estate is at an absolute premium. Because `:hover` does not exist on mobile touch devices, the breadcrumb permanently occupies up to half of the row.
  - Task verbs and action content are the primary identifying tokens. In the rare case a user needs section context, a single tap opens the note at the exact heading location.

### 3. Would a Horizontal Scrollbar Be Useful?
- **Verdict: Strongly NO — a known mobile touch anti-pattern.**
- **Reasons**:
  1. **Scroll-Jacking & Gesture Ambiguity**: Mobile users navigate lists by flicking their thumb vertically. If individual rows have horizontal scrolling containers, natural diagonal thumb swipes get intercepted by the row's horizontal pan handler. Vertical momentum scrolling abruptly stalls ("scroll-trapping"), creating an aggravating, jerky experience.
  2. **Touch/Tap Latency & Dispatch Conflicts**: The primary action on an item row is tapping to jump to that line. Touch web engines must wait to see if a finger-down touch will pan horizontally before firing a click event. This introduces perceptible tap latency or fails to register the tap altogether if the user's thumb wiggles slightly.
  3. **Visual Degradation**: In a 36px virtualized row, a visible horizontal scrollbar consumes 6px–8px, clipping text ascenders/descenders. If hidden (`scrollbar-width: none`), users have no affordance that horizontal panning is possible, making it undiscoverable while still suffering from gesture collisions.
  4. **Virtual List Recycling**: Virtual lists (`virtualList.ts`) dynamically recycle DOM nodes during vertical scrolling. Retaining per-row horizontal scroll positions across DOM node reuse adds fragile state tracking for negative UX return.

---

## Proposed Design Solutions

### Phase 1: Clean Space Reclamation (Single-Line Scan, Recommended)

By hiding `.item-tag` and `.item-breadcrumb` on mobile portrait (`@media (max-width: 600px)`), available width for the action text expands from **~100px to ~315px–350px**:

| Metric | Current Mobile Layout | Proposed Mobile Layout |
| :--- | :--- | :--- |
| **Line Tag** | Visible (~55px) | `display: none` (0px) |
| **Section Breadcrumb** | Visible (~140px, no hover collapse) | `display: none` (0px) |
| **Usable Action Width** | ~100px | **~320px–350px** |
| **Visible Characters** | ~11–14 monospace chars | **~42–48 monospace chars** |
| **Full Text Coverage** | < 15% of real actions | **~88%–92% of real actions** |

#### CSS Specification
```css
@media (max-width: 600px) {
  /* Action drawer mobile unclutter: reclaim width for task descriptions */
  .modal-item .item-tag {
    display: none;
  }
  .modal-item .item-breadcrumb {
    display: none;
  }
  .modal-item-main {
    margin-right: 0;
  }
}
```

### Phase 2: Options for Extra-Long Actions (>48 characters)

For the remaining ~10% of tasks exceeding 48 characters, three design patterns exist:

1. **Option A: Pure Single-Line Ellipsis with Tap-to-Jump (Default / Recommended)**
   - Preserves uniform 36px row height and instantaneous virtualized list performance.
   - 45+ characters is more than enough to capture the action verb, subject, and key details.
   - Tapping the row instantly jumps directly to the full line in the note.

2. **Option B: Two-Line Wrapping with Mobile Touch-Target Row Height (48px)**
   - Per Apple Human Interface Guidelines and WCAG 2.5.5, the recommended minimum touch target size is 44×44px or 48×48px.
   - On mobile, `MODAL_ITEM_ROW_HEIGHT` can be adjusted from 36px to 48px, allowing 2-line clamp (`-webkit-line-clamp: 2`).
   - Accommodates up to ~90 characters per action, virtually eliminating truncation while improving touch ergonomics.

3. **Option C: Long-Press Toast / Sheet Preview**
   - Pressing and holding an action row triggers a mobile floating toast displaying the full unclipped line without jumping away from the drawer.

---

## Mobile Landscape & Tablet Behavior
- **Mobile Landscape (>600px)**: Screens have 667px–900px width. Line numbers and section breadcrumbs remain visible as ample horizontal space is available.
- **Desktop & Web (>600px)**: Retains full desktop layout with hover-to-collapse breadcrumbs and line tags.
