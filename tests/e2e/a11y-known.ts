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
];
