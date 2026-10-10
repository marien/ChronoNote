export interface KnownViolation {
  rule: string;
  target: string;
  screen: string;
  reason: string;
}

export const KNOWN_VIOLATIONS: KnownViolation[] = [
  {
    rule: "scrollable-region-focusable",
    target: ".cm-scroller",
    screen: "*",
    reason: "CodeMirror 6 internal scroll container has tabindex=-1 by design for editor focus management",
  },
  {
    rule: "scrollable-region-focusable",
    target: ".shortcuts-col",
    screen: "Shortcuts drawer",
    reason: "Dual-column layout uses tabindex=-1 to enable programmatic arrow-key scrolling without claiming focus on mount (#47)",
  },
  {
    rule: "color-contrast",
    target: ".about-status-chip",
    screen: "*",
    reason: "Version status chip text has insufficient contrast ratio against surface background (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".item-tag",
    screen: "*",
    reason: "Item shortcut and tag badges have insufficient contrast ratio against background in dark theme (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".selected",
    screen: "*",
    reason: "Selected list item text has insufficient contrast ratio against selection accent background in dark theme (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".segmented-option",
    screen: "*",
    reason: "Active segmented control option has insufficient contrast ratio against active background in dark theme (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".cal-week-num",
    screen: "Date picker",
    reason: "Calendar week number captions have insufficient contrast ratio against calendar background in light and dark themes (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".cal-week-col-head",
    screen: "Date picker",
    reason: "Calendar week column header has insufficient contrast against popover background (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".cal-day",
    screen: "Date picker",
    reason: "Muted out-of-month calendar day button text has insufficient contrast against calendar background (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".history-occ-date",
    screen: "Section history",
    reason: "Occurrence date labels in the history strip have insufficient contrast against tab background (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: "kbd",
    screen: "Shortcuts drawer",
    reason: "Keyboard shortcut badges have insufficient contrast ratio against surface background in dark theme (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".glyph-assignee",
    screen: "Shortcuts drawer",
    reason: "Assignee glyph tag has insufficient contrast ratio against row background in dark theme (brief prohibits color changes)",
  },
  {
    rule: "color-contrast",
    target: ".accent",
    screen: "Confirmation dialog",
    reason: "Primary accent action button text has insufficient contrast ratio against accent background in dark theme (brief prohibits color changes)",
  },
];
