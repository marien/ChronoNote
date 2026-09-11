# ChronoNote 0.7 — Maturity Roadmap

Origin: Marien's brief (2026‑09‑11) — *"The next version needs to be about
maturing the application."* Three workstreams:

1. **UX / UI review** — every interaction and screen, with a focus on
   visual consistency across panels and drawers. Findings + proposed
   changes below.
2. **Iconography** — a distinct-but-recognisable icon set drawn from the
   app's own vocabulary, replacing the emoji currently used in the top bar
   and modal headers. Visual proposals live in
   [`icon-system-0.7.html`](icon-system-0.7.html) (three directions, A/B/C,
   shown at real sizes in both glyph colour modes — open it in a browser).
3. **Two new features to design & propose** — GitHub update check, and
   Microsoft 365 calendar import. Specs below.

Status legend: ☐ not started · ◐ in progress · ☑ shipped

This document is the reconciled plan, in the same spirit as
[`ux-roadmap-0.6.md`](ux-roadmap-0.6.md): the review is **intent**, the
phases are what actually gets built, and nothing here is committed until
Marien signs off. Not yet on a branch — the files are uncommitted in
`docs/design/` for review.

---

## Release shape

The three workstreams are not one release. Each is substantial and each
has a different risk profile.

| Release | Scope | Risk | Deps |
| --- | --- | --- | --- |
| **0.7.0 — Maturity pass** | The UX-review fixes + the new SVG icon set (top bar, modal headers, chrome marks) + a redrawn app icon in the same family | Low — pure frontend + static assets, reviewable as a visual diff | none |
| **0.7.x — Update check** | Tauri updater plugin, About + Settings UI, one‑time signing keypair, revised release workflow | Medium — changes the release ritual; the update *path* can't be verified until there's a signed release to update *from* | `tauri-plugin-updater`, `tauri-plugin-process` |
| **0.8.0 — M365 calendar import** | Entra ID OAuth (PKCE), OS‑keychain token storage, Microsoft Graph calendar read, events → sections | High — first outbound network call for content; roughly doubles the Rust dependency surface; needs an Entra app registration | `reqwest`+rustls, `keyring`, an OAuth/loopback plugin |

Cadence: cut **0.7.0** once the consistency + icon pass is reviewed
together (matches the v0.6.0 "review the whole set, then cut" call). The
two features land as their own releases when each is ready.

---

# Part 1 — UX / UI Review

Reviewed against v0.6.6 in the running dev build (mock backend,
`busy-week` scenario): every top‑bar action, every modal/drawer, the
editor, the status bar, the tab strip, both glyph colour modes.

## What's already right (don't disturb)

- **Surface‑elevation tokens** (§102) — `--surface-canvas/chrome/overlay/
  raised` + `--edge-soft/strong` + `--state-*`. Clean, four honest steps,
  light values too. The whole 0.7 pass stays inside this system.
- **The fixed‑cell glyph model** (§79/§84/§87/§88/§123) — hard‑won, works.
  Not touched.
- **`drawSelection()` theming, thin unified scrollbars, focus‑trap on all
  12 modals, the anchored calendar popover** — all good.
- **The status bar's three‑zone grid** (§100) — metrics · ambient · meta.
  Structure is sound; only small rhythm fixes below.

## Findings

Grouped by theme. Each has a severity (▲ high / ● medium / ○ low), a
recommendation, and a rough effort. "High" = it actively undermines a
deliberate earlier decision or clips content; "low" = polish.

### A. Iconography is two languages bolted together   ▲

- The top‑bar actions and every modal header use **emoji** (📅 📋 🕒 🔎 📥
  ⬆ ⚙ ℹ️ ⌘ ⚠). The tab strip uses a **custom monoline SVG set** (calendar /
  dog‑eared page, 12px, 1.4 stroke). Two unrelated visual systems 40px
  apart.
- Emoji don't follow the theme. §1 (v0.2.0) papered over this with
  `filter: grayscale(1)` — but §105's `color` mode then does
  `filter: none` on `.icon-btn`, so in colour mode you get **Segoe UI
  Emoji's own vendor colours** (a blue 📅, a manila 📋, a red 🕒) fighting
  the carefully‑chosen cyan/emerald/violet semantic palette. This directly
  works against §105.
- Emoji metrics forced the `.icon-label { position: relative; top: 1px }`
  and the "wrap the glyph in an empty span" hack (§73).
- 🕒 for **Section History** is misleading — it reads as a timer/alarm, not
  "prior occurrences of this recurring section."
- ⌘ for the command palette is Mac‑flavoured; the shortcut is `Ctrl+K` on
  this platform.

**Recommendation:** replace all chrome emoji with one monoline SVG set
(`currentColor`, one stroke weight, one grid) — see Part 2. Toolbar icons
render in `--text` in **every** colour mode (chrome is chrome, not
content), which also deletes the emoji‑clash bug. **Effort: M** (draw ~18
icons + wire them; removes two CSS hacks).

### B. The three virtualised result lists don't render rows the same way   ▲

| Drawer | Row content |
| --- | --- |
| **Action Drawer** | `glyph` (via an inline `glyphFor` style map) + text + `· breadcrumb` + `Ln N` |
| **Section History** | `parseGlyphLine(action)` spans + `Ln N` |
| **Cross‑Tab Search** | **raw line text** with a `<mark>` highlight + `Ln N` — no glyph rendering at all |

Search is the odd one out: `# triage the crash reports` shows the literal
`#`, while the same line in the Action Drawer shows `☐`. Three
near‑identical lists, three renderers.

**Recommendation:** one shared `<ResultRow>` (glyph column via
`parseGlyphLine`, main text, optional breadcrumb, `Ln N` tag). Search
keeps its match `<mark>` *on top of* the glyph rendering. **Effort: M.**

### C. Group headers differ across those same three lists   ●

- Action Drawer: `2026-09-07.TXT (8)` — uppercased, `.TXT` kept.
- Search: `2026-09-07.TXT (2 MATCHES)`.
- History: `📅 2026-09-07 (1)` — emoji, date only, no extension.

Tabs already drop `.txt`; headers should too. Pick one form:
**`2026‑09‑07  ·  8`** (date label, middle dot, count) — no emoji, no
uppercased extension, consistent count noun. **Effort: S.**

### D. Two control idioms for adjacent binary/mode choices   ●

In the Action Drawer and Search, the top row has **`Open Tabs | All
Files`** rendered as two separate `.icon-btn.active` buttons, immediately
next to **`Only Open`** rendered as a `.toggle-switch`. Settings uses the
switch for editor options but the segmented‑button style for
`Color / Grayscale / Legacy`.

**Recommendation — establish the rule and apply it:**

- **Switch** = one thing on/off (`Only Open`, `Word wrap`, `Limit line
  width`, `prompt on new day`).
- **Segmented control** = pick one of N *modes* (`Open Tabs / All Files`,
  `Color / Grayscale / Legacy`). Draw it as a real segmented control — one
  bordered container, hairline dividers, the selected segment filled —
  not two independent `.active` buttons.

**Effort: S** (one `.segmented` component, ~3 call sites).

### E. The Shortcuts & Symbols drawer clips its own text   ▲

`.modal-item-main` is `white-space: nowrap; text-overflow: ellipsis` —
right for a scannable result list, wrong for a reference drawer. Rows are
truncated mid‑sentence: *"open → done → deferred → won'"*, *"highlighted
whereve"*, *"won't‑do stat"*. The `<kbd>` / glyph column on the right is
`flex-shrink: 0` and eats the width.

**Recommendation:** this drawer gets its own row style — `white-space:
normal`, description wraps, the keycap/glyph sits top‑right of the block
(not vertically centred against a one‑liner). It's documentation, not a
list. **Effort: S.**

### F. Modal sizing and chrome are ad‑hoc   ●

- Widths are scattered inline styles: About 420, Settings 520, Safety 480,
  Conflict 520, Unsaved 480, Command Palette 560, History 880, everything
  else the 720 default. → three named tokens: `--modal-sm 440`,
  `--modal-md 560`, `--modal-lg 880`; the search/list drawers keep 720 as
  `--modal-list`.
- **`.modal-input-wrap` means two different things.** For the palette /
  search / action drawer / import it's a live input row. For Settings /
  About / Safety / History it's a static title bar — and History *fakes*
  it with a `readonly` `<input>` styled bold with `cursor: default`. Split
  into `.modal-title` (dialog heading + icon) and `.modal-search` (icon +
  input). A titled dialog and a command palette should not share a surface
  that means two things.
- **Primary/secondary buttons are inline styles.** "Close Anyway",
  "Discard & Quit", "Keep my version" each carry
  `style="background: var(--text); color: var(--bg)"`. → real `.btn` /
  `.btn-primary` classes. Also: the toolbar icon button and a modal footer
  action button are both `.icon-btn` — they shouldn't be.

**Effort: M** (touches every modal, but mechanically).

### G. Footer hint separators and empty states are inconsistent   ○

- Footer kbd hints use `·`, `|`, and `&nbsp;|&nbsp;` in different drawers.
  Pick `·`.
- Empty states: Search has none (blank list); History uses an inline
  `padding: 16px; opacity: 0.6` text line; the History preview pane has a
  centred `.hp-empty`. → one `.modal-empty` (centred, muted, one line +
  optional hint), used everywhere a list can be empty.

**Effort: S.**

### H. Naming drift   ○

The action drawer is "My Actions" (button label), "Action Drawer"
(aria/tooltip), "Action drawer" (modal + shortcuts). `openMeetingHistory`
/ `.history-*` / "Section History" / a comment saying "meeting action
history" all name the same thing. Pick one user‑facing name per feature
and use it in the label, the tooltip, the aria‑label, and the Shortcuts
drawer. Proposed: **"Actions"** and **"Section history"**. **Effort: S**
(no code‑symbol renames needed — user‑facing strings only).

### I. Status‑bar rhythm   ○

`Open N` `Closed N` `Fwd N` sit together with no `·` between them while
every other group in the left zone is `·`‑separated; and `Fwd` is
abbreviated while `Open`/`Closed` aren't. → `Open N · Closed N ·
Forwarded N`, or a single compact `⌾ 8  ⌾ 2  » 1` cluster using the glyph
vocabulary. **Effort: S.**

### J. Command‑palette placeholder carries the whole legend   ○

`"Type a command… or  >  settings   !  actions   @  dates   ?  shortcuts"`
— the prefix legend lives in placeholder text that vanishes on the first
keystroke. → short placeholder (`"Type a command…"`) + a persistent
one‑line prefix legend as a header strip or in the footer next to the kbd
hints. **Effort: S.**

### K. `Word wrap` vs `Limit line width` coupling reads oddly   ○

Turning on "Limit line width" makes the "Word wrap" toggle
`checked + disabled` with an inline parenthetical. A checked‑and‑greyed
switch is a confusing state.

**Recommendation:** make it one 3‑way choice — **Editor width: `Full
(no wrap)` · `Wrap` · `Reading column`** — as the segmented control from
finding D. Maps cleanly onto the existing `word_wrap` /
`readable_line_length` config (no Rust change): Full = both false, Wrap =
wrap only, Reading column = both. **Effort: S.**

### L. One anchored surface among eleven centred ones   ○ (note, not a fix)

The date picker is the only drawer that anchors under its trigger with no
dimmed overlay and outside‑click‑to‑close (§104, deliberate). Everything
else is a centred card over `rgba(0,0,0,0.5)`. Not a bug — but worth
deciding whether the **command palette** should become the model the
lighter drawers (History preview, future quick actions) migrate toward.
No change in 0.7; flagging so it's a conscious hold.

## Part 1 — proposed 0.7.0 scope

Ship findings **A–H, J, K** together as the "maturity pass" (I and G are
cheap enough to fold in; L is a hold). One PR, CI green, browser
walkthrough, visual diff for Marien. New Vitest/e2e coverage for the
shared `ResultRow`, the `.segmented` control, and the Shortcuts‑drawer
wrap. `spec.md` §3 (Visual Design & Chrome Layout) gets the icon‑system
paragraph; `CHANGELOG.md` gets §127+.

---

# Part 2 — Iconography

Full visual proposals: **[`icon-system-0.7.html`](icon-system-0.7.html)**
— open in a browser, three directions shown at 16 / 20 / 32 px in both
grayscale and colour modes, with the full app‑function mapping.

## The problem in one line

The app icon (the §96 "checkbox‑clock"), the tab SVGs, and the emoji
toolbar are three unrelated visual systems, and the emoji don't theme.

## Design constraints

- **One monoline SVG set.** 24×24 viewBox, ~1.75 stroke (≈1.5 optical at
  16 px), `round` caps and joins, `stroke: currentColor`, no fill, ~2 px
  corner radius on the 24 grid. This is the tab‑strip language promoted to
  the whole app.
- **Themes for free.** Icons inherit `color`. In the top bar that's
  `--text`; on the active tab it picks up `--tab-active-border` (as the
  tab SVG already does); in a modal header it's `--muted`. **Chrome icons
  do not take a semantic hue in `color` mode** — that space belongs to the
  glyph palette (§105).
- **Legible at 16 px.** The toolbar renders a 16 px icon in a 30 px
  button. Anything that turns to mush that small gets a simplified 16 px
  variant (the same trick concept A/B already use in
  `icon-proposals.html`).
- **Drawn from the vocabulary.** The section rule `====`, the dated page,
  the action box `☐`, the forward `»`, the `=>` arrow, the monospace
  grid — every icon is built from one of these, so the set reads as *this*
  app's.
- **The app icon rejoins the family.** The OS icon becomes the same "dated
  page under its rule" mark the in‑app **Open date note** button uses, so
  the taskbar icon and the toolbar button are visibly one thing. (OS icon
  stays a single baked variant — regenerated with
  `npx tauri icon <master>` — since it can't follow a runtime setting;
  §96's note still holds.)

## Icon inventory (what gets drawn)

| # | Function | Today | 0.7 concept |
| --- | --- | --- | --- |
| 1 | New scratchpad | `＋` | plus over a dog‑eared draft page |
| 2 | Open date note | 📅 | dated page under its `=` rule (== app icon) |
| 3 | Actions | 📋 | two stacked `☐` boxes / a shallow tray |
| 4 | Section history | 🕒 | receding ruled cards + a return arrow |
| 5 | Cross‑tab search | 🔎 | lens over a `=` rule |
| 6 | Import sections | 📥 | lines entering a page from the left |
| 7 | Promote scratchpad | `⬆` | draft page → dated page (up) |
| 8 | Settings | ⚙ | monoline gear (redrawn to the grid) |
| 9 | About | ℹ️ | `i` in a ring |
| 10 | Command palette | ⌘ | `›` prompt caret + underscore |
| 11 | **Update available** *(new)* | — | down‑arrow into a tray, dot badge when active |
| 12 | **Calendar import** *(new)* | — | dated page + small sync arc (distinct from #2 and #6) |
| 13 | Warning (safety/conflict) | ⚠ | triangle + bar, redrawn |
| 14 | Chrome marks | `‹ › ✕` mixed | one chevron pair + one `×`, shared by the find bar, the date‑picker month nav, and every close affordance |
| 15 | Tab: daily / scratchpad | SVG (keep) | re‑spaced to the new stroke weight so the strip matches the bar |

Modal headers reuse the **same** path as the matching toolbar button, at
15 px in `--muted` — so opening "Actions" shows the Actions icon in its
header, not a second unrelated emoji.

## Three directions (see the HTML)

- **Set A — "Ruled."** Everything on the page + section‑rule metaphor.
  Calm, editorial, continuous with the existing tab SVGs and the §102
  hairlines. **← recommended default.**
- **Set B — "Cell."** Everything built from monospace grid cells and a
  caret block. More distinctive, more geometric — "a text tool." Slightly
  more abstract at 16 px.
- **Set C — "Marks."** Each icon foregrounds the literal editor glyph it
  relates to (Actions *is* a stack of `☐`; History *is* `»` over a
  timeline). Best one‑to‑one legibility, most character, busiest small.

**Recommendation:** ship **Set A** for the toolbar, modal headers and
chrome marks; borrow **Set C**'s glyph‑forward treatment only for the
three reading drawers' empty states (where size is not a constraint and it
becomes a tiny demo of the vocabulary). Redraw the OS icon as Set A's
"day" mark.

## Delivery

- Icons live as inline Svelte components or a single sprite in
  `src/lib/icons/` (one `<Icon name="…" />` component, `currentColor`,
  size prop). No icon‑font, no external dependency (CSP + offline ethos).
- Removes: the `filter: grayscale(1)` / `filter: none` rules, the
  `.icon-glyph` empty‑span hack, the `.icon-label { top: 1px }` nudge.
- `spec.md` §3 gains an "Iconography" paragraph. `docs/design/README.md`
  updated. The `icon-proposals.html` (app‑icon, 2026‑09‑08) stays as
  history; `icon-system-0.7.html` is the new source of truth for the UI
  set.
- e2e: the existing `visual.spec.ts` gallery picks up the new icons
  automatically; add one assertion that no `.icon-btn` contains an emoji
  codepoint.

---

# Part 3 — Feature designs

## Feature 3.1 — Check for application updates from GitHub

### Goal

On launch (opt‑in) and on demand, tell the user a newer ChronoNote
release exists, and let **them** download and install it. Never silent,
never forced.

### Approach — the official Tauri updater

Tauri v2 ships `tauri-plugin-updater`: it polls a static JSON manifest,
verifies a **minisign signature** on the downloaded installer, installs
it (NSIS/MSI on Windows), and relaunches via `tauri-plugin-process`. This
is the supported, signature‑checked path — we do **not** hand‑roll a
downloader.

**Manifest hosting:** a `latest.json` asset attached to each GitHub
Release. The updater endpoint is
`https://github.com/marien/ChronoNote/releases/latest/download/latest.json`.
The existing manual `gh release create` step uploads it alongside the
installers.

```jsonc
// latest.json (generated at release time)
{
  "version": "0.7.4",
  "notes": "See the release page.",
  "pub_date": "2026-10-01T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of ChronoNote_0.7.4_x64-setup.exe.sig>",
      "url": "https://github.com/marien/ChronoNote/releases/download/v0.7.4/ChronoNote_0.7.4_x64-setup.exe"
    }
  }
}
```

### UX

- **About drawer** grows a version block:
  - up to date → `v0.7.0 · latest` (muted check).
  - update found → `v0.7.4 available` + **`What's changed`** (opens the
    release page in the system browser) + **`Download & install`**.
  - downloading → a thin progress bar + `Downloading… 4.2 / 9.1 MB`.
  - ready → **`Restart to finish`**.
  - check failed → muted `Couldn't check for updates` + `Try again`.
- **On launch**, if auto‑check is on: a silent background `check()`. If an
  update exists, a **quiet** status‑bar centre‑zone message —
  `Update available — open About` — dismissible, never a modal.
- **Settings → new "Updates" section:** switch **`Check for updates when
  ChronoNote starts`** + a **`Check now`** button (mirrors About).
- First run after this ships: a one‑time line in About /
  the status bar disclosing that the app will contact github.com to check
  for updates, with the toggle right there.

### Data model

- `AppConfig.auto_check_updates: bool` — `#[serde(default = "default_true")]`
  so existing configs opt in; `set_auto_check_updates` command +
  `#[derive(TS)]` regen (mirrors `set_word_wrap`).
- Frontend store `updateStatus: "idle" | "checking" | "available" |
  "downloading" | "ready" | "error"`, plus `availableVersion: string` and
  `downloadProgress: { done: number; total: number }`.
- No custom Rust command for the check itself — the JS plugin API
  (`check()`, `update.downloadAndInstall(onProgress)`, `relaunch()`) is
  enough. One thin wrapper reads the config flag before the launch check.

### Rust / config / capabilities

```toml
tauri-plugin-updater = "2"
tauri-plugin-process  = "2"
```

```jsonc
// capabilities/default.json — add
"updater:default",
"process:allow-restart"
```

```jsonc
// tauri.conf.json
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "endpoints": ["https://github.com/marien/ChronoNote/releases/latest/download/latest.json"],
    "pubkey": "<minisign public key>",
    "windows": { "installMode": "passive" }
  }
}
```

Prefer the **NSIS** installer on Windows (per‑user, no UAC). Today the
build ships `targets: "all"` (msi + nsis); the updater should target nsis,
so either narrow `bundle.targets` or make the manifest `url` point at the
`-setup.exe`.

### Release‑workflow change (call this out to Marien)

This is a **real change to the documented release ritual** in
`CLAUDE.local.md`.

1. **One‑time:** `npm run tauri signer generate` → store
   `TAURI_SIGNING_PRIVATE_KEY` + its password somewhere safe (password
   manager). Put the **public** key in `tauri.conf.json`.
2. Each release build now also emits `…-setup.exe.sig`. The
   `npm run tauri build` step needs `TAURI_SIGNING_PRIVATE_KEY` +
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the environment.
3. Generate `latest.json` (small script, or `tauri-apps/tauri-action` if
   the release ever moves to CI) and `gh release create` uploads the
   installer **+ its `.sig` + `latest.json`**.
4. **The updater can't be verified until there's a signed release to
   update *from*.** So 0.7.x ships the updater "armed"; the *next* release
   after that is the first the update path actually exercises. Plan a
   throwaway point bump to prove it end‑to‑end.

### Testing

- **Mock:** extend `mockBackend` with a fake updater surface —
  `check()` returns a canned `available` / `none`, `downloadAndInstall`
  drives a scripted progress sequence. e2e then covers the About states,
  the Settings toggle, and the launch banner without a network.
- **Rust:** `auto_check_updates` config round‑trip + default‑true for a
  config written before the field existed.
- **Manual checklist** (CLAUDE.local.md): install vN → publish vN+1 →
  launch vN → banner → About → Download → progress → Restart → confirm
  vN+1 and that notes/session survived.

### Risks

- github.com blocked on locked‑down / corporate machines → check fails
  silently, manual download still works.
- AV heuristics on a freshly downloaded exe → the signature check is ours;
  SmartScreen reputation is Microsoft's (improves with download volume;
  code‑signing cert is a separate, later question).
- Running a dev build → `check()` no‑ops without a real bundle; guard the
  launch call behind `import.meta.env.PROD`.
- Downgrade: the plugin compares semver; a `latest.json` that points
  backwards is refused.

### Effort

Frontend **M**, Rust/config **M**, plus the one‑time keypair + the
per‑release `latest.json` step. Its own release (0.7.x).

---

## Feature 3.2 — Import calendar items into sections from Microsoft 365 for Business

### History — this partially reverses an earlier decision

`CHANGELOG.md §3` **removed** a *mocked* M365 calendar sync
(`calendar.rs`, `sync_calendar_mock`) and spec tenet **1.4 "Resilient
Calendar Integration"** (with its cancel/reposition reconcile rules),
replacing it with manual paste‑to‑sections import. That call was right for
the time — the reconcile logic fought the Zero‑Database / plain‑text
tenet, and there was no real event source.

This feature brings calendar sync back **as a real, opt‑in, additive
source** — the manual import **stays**; the calendar is a second way to
produce the same output (section headers appended to a day's note). Spec
tenet 1.4 is re‑framed or a 1.5 is added: *"Calendar import is additive
and user‑initiated — it appends sections, it never reconciles or removes."*

### Auth — the user signs in, the app only ever holds tokens

- **Microsoft Entra ID OAuth 2.0, Authorization Code + PKCE**, public
  client (desktop, **no client secret**).
- Scopes: `Calendars.Read`, `offline_access`, `User.Read`, `openid`,
  `profile`.
- **"for Business"** = work/school account. The Entra **app registration**
  is multi‑tenant; some orgs will require **admin consent** for
  "ChronoNote" — document this, and provide an advanced escape hatch
  (paste your own tenant's client ID in Settings) for locked‑down orgs.
- **Flow:** the app opens the Microsoft sign‑in page in the **system
  browser** (`tauri-plugin-opener`), with a loopback redirect
  (`http://127.0.0.1:<ephemeral>/`) caught by a short‑lived local listener
  (`tauri-plugin-oauth`, or a hand‑rolled `tiny_http` in the existing
  tokio runtime). The user types their password and does MFA **on
  Microsoft's page**; the app receives only the auth code, exchanges it in
  **Rust** for tokens. ChronoNote never sees the password. Granting the
  consent is the user's own click.

### Token storage — OS keychain, never a file

The refresh token is a long‑lived secret. It goes in **Windows Credential
Manager** via the `keyring` crate (`chrononote / m365-refresh-token`) —
**not** `config.json` (plaintext, and on some setups roamed) and **never**
the notes folder. `config.json` holds only:

```jsonc
"m365": {
  "connected": true,
  "account_email": "marien@contoso.com",
  "prompt_on_new_day": false
}
```

Disconnecting deletes the keychain entry.

### Fetching

`GET /me/calendarView?startDateTime=<day 00:00>&endDateTime=<day 24:00>`
with `Prefer: outlook.timezone="<local>"` — `calendarView` expands
recurring series into instances. Page through `@odata.nextLink`. Per
event, keep: `subject`, `start` / `end` (local), `location`,
`isCancelled`, `isAllDay`, `organizer`. All HTTP + token refresh in
**Rust** (`reqwest` + rustls) — secrets stay server‑side.

```rust
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub subject: String,
    pub start_local: String,   // "HH:MM"
    pub end_local: String,
    pub location: Option<String>,
    pub is_cancelled: bool,
    pub is_all_day: bool,
    pub organizer: Option<String>,
}
```

### Mapping events → sections

Each selected event becomes a section header appended to the target dated
note, with the spec‑2.3 two‑blank‑line spacing (reusing `linesToSections`
/ `underlineFor`). Header text:

```
09:30–10:00  Weekly Sync
=========================
```

The old "verbatim, no time parsing" rule (§3) was for *pasted* text that
wouldn't reliably contain a time range. Calendar events carry structured
times, so `HH:MM–HH:MM  Subject` is now the right, useful default. (A
Settings option can drop the time prefix for people who don't want it.)

### "Sync" — the hard part, and why it was cut before

Re‑running for a day that already has imported sections. Three options:

| | Behaviour | Cost |
| --- | --- | --- |
| **A. Additive + dedupe** *(recommended)* | "Refresh from calendar" appends only events whose `subject + start` isn't already a section title in that note. Cancelled events are shown unchecked. Never edits or deletes. | A meeting cancelled or moved in Outlook stays as a stale section you delete by hand. |
| **B. Managed block** | One delimited region (`— calendar 2026‑09‑11 —` … `— end —`) the importer owns and rewrites wholesale each run. | Accurate for cancels/reschedules, but the app now owns hidden structure inside a plain‑text file — the exact thing the Zero‑Database tenet resists — and hand‑edits inside the block collide with the rewrite. |
| **C. One‑shot, no dedupe** | "Import this day's meetings" — appends, done. Simplest. | Re‑running double‑imports. |

**Recommendation: A.** Additive with `subject + start` dedupe, an explicit
**`Refresh from calendar`** that only ever adds. In the UI call it
**"Calendar import"**, not "sync" — and say plainly in Settings that it
adds, never removes. If Marien wants true two‑way accuracy, B is the
fallback, but it costs a tenet — that's a conscious decision, not a
default.

### UX

- **Settings → new "Calendar" section:**
  - not connected → **`Connect Microsoft 365`** → system‑browser consent →
    `Connected as marien@contoso.com` + **`Disconnect`**.
  - switch **`Offer calendar import when I open a new day`**.
  - advanced (collapsed): a client‑ID field for orgs that require their
    own app registration.
- **New toolbar action + command‑palette entry:** *"Import calendar for
  this day"* — icon #12 (dated page + sync arc). Shown only when
  connected; targets the active dated note (disabled on a scratchpad).
- **Running it:** a modal in the SectionImport family — spinner → a
  checklist of the day's events (all checked; cancelled ones greyed +
  unchecked) → **`Import 5 sections`** → appended, `Sections imported`
  toast. A preview textarea shows exactly what will be written (same
  review‑before‑commit affordance the manual importer already has).
- **Errors:** token expired → silent refresh; refresh failed →
  `Reconnect Microsoft 365` in Settings; offline → `Can't reach Microsoft
  365 right now`; no events → `No meetings on 2026‑09‑11`.

### Rust commands

- `m365_begin_auth() -> M365Account` — opens browser, runs the loopback
  listener, exchanges the code, stores the refresh token, returns the
  account.
- `m365_disconnect()` — clears the keychain entry + the config block.
- `m365_fetch_events(date: String) -> Vec<CalEvent>` — refresh token →
  access token → `calendarView` → mapped events.
- `m365_status() -> Option<M365Account>` — for boot / Settings.

### Privacy

Meeting subjects, locations and organiser names get written into `.txt`
files **in cleartext** — the user should know that, and it's stated at
import time. Nothing is transmitted anywhere; the only stored secret is
the refresh token, in the OS keychain. This is consistent with the app's
model (everything is a plain‑text file you own) as long as the cleartext
point is explicit.

### Dependencies — a real step up

`reqwest` + rustls (async HTTP + TLS), `keyring`, an OAuth/loopback
plugin. This is the **first outbound network call for content** and
roughly doubles the Rust dependency surface. That's a genuine maturity
decision, not a small add — hence its own release (**0.8.0**), gated on
the Entra app registration existing, and worth keeping behind a build
feature flag until the live path is proven.

### Testing

- **Mock:** `m365_status` / `m365_fetch_events` / `m365_begin_auth`
  return canned data; e2e drives connect → import → sections‑appended
  without a network or a real account.
- **Rust:** Graph‑JSON fixture → `Vec<CalEvent>` mapping; the
  `subject + start` dedupe; header formatting (with/without time prefix);
  `calendarView` paging.
- **Manual checklist:** a real Business account, admin‑consent path, token
  refresh after expiry, disconnect clears the keychain.

### Effort

Frontend **M–L**, Rust **L** (new HTTP/OAuth/keychain surface),
plus the one‑time Entra app registration and its consent story. **0.8.0.**

---

## Open questions for Marien

1. **Icon direction** — A (Ruled) / B (Cell) / C (Marks), or a mix? (See
   `icon-system-0.7.html`.) Recommendation: A for chrome, C's treatment
   for empty states.
2. **0.7.0 scope** — ship findings A–H + J + K as one pass, or split the
   icon set from the consistency fixes?
3. **Calendar "sync" semantics** — additive‑only (A, recommended) or the
   managed‑block (B, costs the Zero‑Database tenet)?
4. **Update auto‑check default** — on (recommended for a desktop app, with
   first‑run disclosure) or off?
5. **Time prefix on calendar section headers** — `HH:MM–HH:MM  Subject`
   default, or subject‑only to match the old §3 decision?
6. **Editor‑width control** (finding K) — collapse `word_wrap` +
   `readable_line_length` into one 3‑way `Full / Wrap / Reading column`?
