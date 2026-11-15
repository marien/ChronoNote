# ChronoNote — Changelog

Historical record of every change agreed after the first working build,
kept for the rationale behind each one — not just *what* changed but
*why*. Originally tracked as a pending-requirements doc while each batch
was still being gathered and confirmed before implementation; renamed once
everything below was applied, since nothing here is "pending" anymore.

**Status: all sections through §208 implemented** (§208 released as v0.13.0: the Android app dropped, in favor of the PWA-installable web app; §205–§206 released as v0.12.5: the caret after an open glyph now lands past the trailing space instead of hugging the shrunk checkbox (#93); a repeat calendar sync no longer re-flags an already-cancelled meeting, and un-cancels one that reappears on the calendar (#92); §207 is a post-release fix on `main`, no version bump (neither change touches the desktop app's own build): a CI build-guard/test flake found working the release, and stale website/webapp icon caching; §178–§180 in v0.9.5: a save-only-when-changed fix and two GitHub issues, #76/#77; §181–§186 in v0.10.0: the Android app and OneDrive sync; §187–§188 in v0.11.0: OneDrive sync for the web app, and the fixes found reviewing and testing it; §191–§195 in v0.12.0: the Android folder-switch fix, shorter Settings labels, and the v0.12 UI/UX refinements in three stages (§193 palette, resolved lines, calendar dots and search; §194 modal system and phone layouts; §195 Zen mode, drag-and-drop import, sync health popover, typography and pure black; §196 in v0.12.1: renewable web sign-in, wrapping long messages, the Shift+F11 Zen chord and a full-window Zen mode, the topic pill and multi-name delegates; §197 in v0.12.2: Sync Review keyboard use and calendar status prefixes (#78; §198–§203 in v0.12.3: polish (topic pill border, dimmed deferred lines, round spinner, the Updated-to message), glyph click toggles open and closed with position-aware targeting, the About version card, numbered lists and sub-lists, the Shortcuts drawer and website catch-up, and Zen mode from a maximized window); §204 in v0.12.4: Zen from a maximized window fixed at the cause, no flicker entering or leaving))). §153 is a
website-only Guide-page fix (found live right after §150–§152 shipped
as v0.7.12) — no version bump, nothing in the shipped app changed. §154
merges the OS title bar into the top bar (Notepad-style: icon, tabs,
minimize/maximize/close) — a real, user-visible native-window change,
held for Marien's own hands-on test before release, then shipped as
v0.8.0 (a minor bump rather than another v0.7.x, since v0.7 had already
reached 12 patch releases and this is a genuine UI change, not a patch).
§155 is a same-day bug fix found right after v0.8.0 shipped: Section
History's modal could grow past the window when the "From" occurrence
was long, instead of scrolling internally — fixed and shipped as
v0.8.1. §141's desktop-app
Import feature shipped as v0.7.9; §143's cross-platform shortcuts and
§144's top-bar collapse shipped together as v0.7.10. §145 is a
same-release cleanup pass over §143's deferred comment/test-title
wording — no version bump of its own. §146 (a reverse action-state cycle
shortcut plus three website follow-ups) and §147 (the status bar's
narrow-window collapse) shipped together as v0.7.11. §148 and §149 are
website/asset-only fixes found live right after that release (no
shipped-app change, so no version bump of their own): the Guide page's
rendered examples were too faint to see, and the web app's icon was a
stale pre-0.4 mark. §150 is a Section History overhaul (browsable
headers for every occurrence — past, empty, and future — a full-width
"Previous occurrence" pane always anchored to today, an "Only Open"
filter, and a glyph-rendered, scrollable "From" panel) — a real
desktop-app change. §151 is four small chat-feedback follow-ups (release
links open the full releases list instead of one tag, the status-bar
version number and update message are both clickable shortcuts to
About, and the date picker only bolds a day once it actually has
content). §152 adds the marketing website to About's links (alongside
GitHub, both now labeled) and folds the standalone "Version" section
into the title row. §150–§152 shipped together as v0.7.12. §141–§144's
web-app pieces are separately deployed live at
`app.chrononote.mariendegelder.nl` and `chrononote.mariendegelder.nl` —
that side needs no version bump of its own, a website deploy is
independent of a desktop-app release.
§138–§139 are implemented but were never themselves a release — they
don't touch the shipped app at all (a new marketing site + a dev-only
test scenario).
§99–§110 are the 0.6 UX/UI pass (`docs/design/ux-roadmap-0.6.md`); §111 is
a small v0.6.1 follow-up (the pre-0.6 glyph palette, back as an option).
§112 (#28) and §113 (#27) are Section History follow-ups (v0.6.2).
§114–§118 close #33–#37 (v0.6.3). §119–§122 close #38–#41 (v0.6.4).
§123 (#42) fixes the delegated-`@name` badge widening the line (v0.6.5).
§124–§126 are chat-feedback tweaks, released in v0.6.6: `=>` Enter on a
plain follow-up adds no `#`, `@name` may contain a hyphen, and `(@name)`
is a delegate. §127 is the 0.7 "maturity pass" — the UX/UI consistency
review plus the new icon set (`docs/design/maturity-0.7-roadmap.md`).
§128 is the GitHub-releases update check (same roadmap, Feature 3.1) —
the second of its two proposed features, M365 calendar import, is still
just a design (0.8.0, not started). §129–§131 close three GitHub issues
filed after the 0.7 pass (#46, #47, #48). §132 closes a fourth (#49,
top-bar alignment); §133 is the app-icon redraw the 0.7 roadmap called
for but deferred out of v0.7.0. §134 is a follow-up correction to §132
after its fix overcorrected visually. §135 fixes a long-standing
opener-plugin permission-scope bug (chat feedback, no issue) that made
the About drawer's external links silently do nothing. §136 closes #50
(a first-run-after-update notice) plus an always-visible status-bar
update icon (chat feedback, no issue). §137 (chat feedback, no issue) is
a date-picker perf/UX pass — fast per-visible-month loading, a loading
spinner, and opening on the active tab's own date. §138 is a new
`website/` marketing site, local-only at first, plus the `"demo"`
scenario it embeds. §139 turns that demo into a self-contained static
bundle and publishes the site to `chrononote.mariendegelder.nl` via
Plesk's own Git-pull (no credentials anywhere — Plesk clones the public
repo directly). §140 flips the default glyph palette from `Grayscale` to
`Color` (chat feedback, no issue), and fixes the demo's hardcoded
placeholder version number. §141 is Phase 1 of the browser-storage web
app (`docs/design/webapp-roadmap.md`) — a new `WebBackend` (IndexedDB),
export/import shared between the desktop app and the web app, and the
new `vite.webapp.config.ts` build target. §142 deploys it live to
`app.chrononote.mariendegelder.nl` (sharing the main site's existing
Plesk checkout, no second Git repo needed), adds landing-page CTAs
linking to it, and adds PWA/offline install. §143 makes every keyboard
shortcut platform-correct — Ctrl on Windows/Linux, Cmd on Mac — across
the app, demo, web app, and website, via one new shared registry
(`shortcuts.ts`/`platform.ts`) that six previously-separate display
surfaces and the window-level matcher all now read from. §144 (#56)
collapses the top bar's secondary action buttons into a "More actions"
popover on a narrow window, freeing that space back to the tab strip —
and along the way fixes a real pre-existing timing bug where the
responsive layout system could permanently miss its own recalculation
after a tab was added while the window was already narrow. §145 is a
cleanup pass over §143's deferred comment/test-title wording, which also
caught and fixed a real Playwright bug: 15 key-presses that §143's
migration had wrongly turned Mac-aware even though the bindings they
test are deliberately Windows/Linux-only. §146 adds a backward
action-state cycle (`Ctrl+Shift+Space`/`Ctrl/Cmd+Shift+Enter`) plus three
website follow-ups (Guide-page rendered examples, favicon/social-preview
tags — screenshots/GIFs left undone, a real tooling blocker). §147
collapses the status bar's own content on narrow windows/screens, fixing
an "Open" count running straight into the web app's "Browser storage"
badge with no gap, reported from a phone.
Each
section is verified before merge (`svelte-check`, the Vitest suite,
`cargo test`, and — from §77 on — the Playwright E2E suite, all green in
CI). See each section for what it covers and why. §27–31 were small fixes
logged briefly in a `next-revision-notes.md` scratch file before being
folded in here; everything from §32 on was written directly.

Which sections shipped in which release: §1–55 → v0.2.0, §56–59 → v0.2.1,
§60–74 → v0.3.0, §75–81 → v0.4.0, §82–83 → v0.4.1, §84–85 → v0.4.2,
§86–87 → v0.4.3, §88–89 → v0.4.4, §90–91 → v0.4.5, §92 → v0.4.6,
§refactor + §93–96 → v0.5.0, §97 → v0.5.1, §98 → v0.5.2, §99–110 → v0.6.0,
§111 → v0.6.1, §112–113 → v0.6.2, §114–118 → v0.6.3, §119–122 → v0.6.4,
§123 → v0.6.5, §124–126 → v0.6.6, §127 → v0.7.0, §128 → v0.7.1.

---

