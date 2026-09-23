/** The one platform fork ChronoNote's keyboard shortcuts need: Mac uses
 * Cmd where every other platform uses Ctrl. Detected via the browser's
 * own APIs (not Tauri IPC), so the exact same check applies identically
 * across the desktop app's webview, the demo, and the web app — all
 * three share this module from the same `src/` tree. The desktop app
 * itself only ships for Windows for now, but the source stays
 * Mac-correct regardless, since the demo and web app are already
 * reachable by Mac users today via any browser. */
function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  // `userAgentData` (Chromium) reports a clean "macOS"; older/other
  // engines fall back to the long-deprecated but still-populated
  // `navigator.platform` (typically "MacIntel", including Apple Silicon
  // Macs running under Rosetta compatibility).
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent ??
    "";
  return /mac/i.test(platform);
}

export const isMac = detectIsMac();
