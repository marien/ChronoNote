/** ChronoNote's icon set (§127, the 0.7 maturity pass — "Set A / Ruled"
 * from `docs/design/icon-system-0.7.html`, picked over B/C 2026-09-11).
 * Every icon shares one grid and stroke: 24×24 viewBox, ~1.75 stroke,
 * round caps/joins, `stroke: currentColor`, no fill — drawn from the
 * app's own vocabulary (the section rule, the dated page, the action
 * box, the forward mark `»`) rather than a generic icon-font pick.
 *
 * This replaces the emoji previously used in the top bar and every modal
 * header (📅 📋 🕒 🔎 📥 ⬆ ⚙ ℹ️ ⌘ ⚠) — emoji don't take `currentColor`, so
 * they couldn't follow the light/dark or colour/grayscale theme without
 * the `filter: grayscale(1)` / `filter: none` split that used to sit on
 * `.icon-btn` (removed in app.css alongside this). See `Icon.svelte` for
 * the component that renders these. */
export type IconName = keyof typeof ICONS;

export const ICONS = {
  "new-scratchpad": `<path d="M13 3H7a1 1 0 0 0-1 1v11"/><path d="M13 3l4 4v6"/><path d="M17 7h-4V3"/><path d="M8 19h8M12 15v8"/>`,
  "date-note": `<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7.5 9h6"/><path d="M7.5 12h9M7.5 13.6h9"/><path d="M7.5 17h5"/>`,
  actions: `<rect x="3.5" y="4" width="6" height="6" rx="1.4"/><path d="M5 7l1.4 1.4L9 5.6"/><path d="M13 7h7"/><rect x="3.5" y="14" width="6" height="6" rx="1.4"/><path d="M13 17h7"/>`,
  "section-history": `<rect x="8" y="4" width="12" height="12" rx="2"/><rect x="4" y="8" width="12" height="12" rx="2"/><path d="M12 12l-2 2 2 2M9 14h5"/>`,
  search: `<circle cx="11" cy="11" r="6"/><path d="M8 10.5h6M8 12.5h4"/><path d="M15.5 15.5L20 20"/>`,
  import: `<rect x="11" y="4" width="9" height="16" rx="2"/><path d="M3.5 8.5h6M3.5 12h6M3.5 15.5h6"/><path d="M7.5 10l2 2-2 2"/>`,
  promote: `<path d="M14.5 21H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6l4 4v3"/><path d="M13 5v4h4"/><path d="M18 21v-8M15 16l3-3 3 3"/>`,
  settings: `<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="1.6" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1.6" fill="currentColor" stroke="none"/>`,
  about: `<circle cx="12" cy="12" r="8.2"/><path d="M12 11.5v4.5"/><circle cx="12" cy="8" r="0.4" stroke-width="1.6"/>`,
  keyboard: `<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6.5 10h0M10 10h0M13.5 10h0M17 10h0" stroke-width="2.1"/><path d="M6.5 14.5h6.5" stroke-width="2.1"/>`,
  command: `<path d="M7.5 8l4 4-4 4"/><path d="M13 16h5"/>`,
  update: `<path d="M5 15v2.5A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M12 4v10M8 10l4 4 4-4"/>`,
  "calendar-import": `<rect x="3.5" y="4.5" width="14" height="14" rx="2"/><path d="M6.5 8h8"/><path d="M6.5 11h6M6.5 12.4h6"/><path d="M17.7 15.2a3.2 3.2 0 1 1-3-3.2"/><path d="M17.3 16.3l.4 2 2-.4"/>`,
  warning: `<path d="M12 4.5L21 19.5H3z"/><path d="M12 10.5v4"/><circle cx="12" cy="16.7" r="0.4" stroke-width="1.7"/>`,
  "chevron-left": `<path d="M14.5 6.5l-5 5.5 5 5.5"/>`,
  "chevron-right": `<path d="M9.5 6.5l5 5.5-5 5.5"/>`,
  close: `<path d="M7 7l10 10M17 7L7 17"/>`,
  "tab-daily": `<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M9 4v3M15 4v3"/>`,
  "tab-scratch": `<path d="M13 4H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9z"/><path d="M13 4v5h5"/><path d="M9 13h6M9 16h4"/>`,
} as const;
