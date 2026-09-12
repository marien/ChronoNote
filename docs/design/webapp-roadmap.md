# ChronoNote web app — functional & technical design

Origin: Marien's brief (2026-09-12) — *"Work out a function and technical
design for a web-app version of ChronoNote that stores its data in the
browser. It would need an export/import function. The journey: someone
lands on the website and uses the demo (no data retention), then starts
using the web app (data retention in browser), then installs the
application locally (data retention on disk)."* Export/import format is
open ("whatever is convenient"), with an eye toward reuse for moving
between systems "if that is ever necessary."

Status: **proposed, not started.** This is a planning document, in the
same spirit as `maturity-0.7-roadmap.md` — nothing here is built yet.

**Decided (2026-09-12, all five open questions answered — see the bottom
of this doc):** hosting is a subdomain, `app.chrononote.mariendegelder.nl`;
import defaults to merge-skip-duplicates; the desktop-side "Import from
export file" feature is **in Phase 1**, not deferred; the web app is
released in lockstep with the desktop app; v1 ships the full feature
set, not a trimmed cut. Nothing below is stale from those decisions —
each is folded into its section.

---

## The three-tier journey

| Tier | Where | Retention | Purpose |
| --- | --- | --- | --- |
| **Demo** | `chrononote.mariendegelder.nl/demo-app/` (exists today, §138–139) | None — resets every page load | Let a visitor try the real interaction model with zero commitment |
| **Web app** (new, this doc) | e.g. `app.chrononote.mariendegelder.nl` | Browser storage (IndexedDB), survives reloads | Let someone actually *use* ChronoNote without installing anything |
| **Desktop app** (exists today) | Installed `.msi`/`.exe` | Plain `.txt` files on disk | The durable, no-caveats tier |

The web app is a **third build target**, sitting between the two that
already exist. It is not a variant of the demo (which must stay
zero-retention by definition) and not the real Tauri app (no native
shell, no filesystem). It's a new persistence backend for the exact same
frontend.

**The central technical insight this whole design leans on:** the
frontend never talks to Rust directly — every interaction goes through
one typed command surface, `TauriCommands` (`src/lib/tauriCommands.ts`),
via `invoke()`. Two implementations of that surface already exist: the
real IPC bridge (`tauriApi.ts`) and an in-memory mock
(`testing/mockBackend.ts`, used by the demo and the whole Playwright
suite). **A third implementation — an IndexedDB-backed `WebBackend` —
gets the entire application (every Svelte component, `controller.ts`,
every store) for free, unmodified.** This isn't a rewrite; it's a new
class implementing an interface that already has two other
implementations.

---

# Part 1 — Functional design

## What the web app includes on day one

Everything the editor itself does today, unmodified: token→glyph
rendering, the command palette, Cross-Tab Search, Section History,
Action Drawer, the date picker, per-tab undo history, word wrap /
reading width, both safety-close gates, light/dark/system theme, all
three glyph palettes. None of this is backend-specific — it's all above
the command layer.

**New, web-app-specific:**
- **Export** — download everything as a single file.
- **Import** — load a previously-exported file, merging into (or
  replacing) what's already there.
- **A visible "browser storage" indicator** so nobody mistakes this tier
  for either the ephemeral demo or the durable desktop app. A small
  status-bar badge (next to the existing version number) reading
  something like "Browser storage" with a tooltip explaining the
  caveats below, plus a one-time first-run note.
- **A persistent, low-annoyance nudge toward exporting and toward the
  desktop app** — not a nag on every launch, but present in Settings and
  in the About-equivalent panel: "Your notes live in this browser only.
  Export a backup, or install the desktop app for notes that live on
  your disk."

## What's explicitly deferred / out of scope

- **Multiple workspaces / "switch notes directory."** The desktop app's
  `recent_notes_dirs` concept doesn't map cleanly to a browser origin.
  V1 is **one implicit workspace per browser+origin.** `set_notes_dir`
  and `path_exists` become no-ops (see the command table below); the
  "Notes folder" row in Settings is hidden in this build.
- **Cross-device sync.** Export/import, done by hand, is the only
  "sync" mechanism. No server, no accounts, no network calls beyond
  loading the static bundle itself — matches "stores its data in the
  browser" literally.
- **PWA / offline install / service worker.** Not what "installs
  locally" means in the requested journey — that's the real desktop app.
  A Phase 2 candidate, small in effort (see "PWA / offline install"
  under Part 2) — mainly valuable as a mitigation for Safari's ITP purge
  risk, not as a substitute for the desktop app.
- ~~A desktop-side "Import from export file" feature~~ — **decided: this
  is in scope for Phase 1**, not deferred. See "Closing the loop:
  desktop-side import" below.

## The two transition points

**Demo → web app.** A "Start using it for real" call-to-action on the
demo/landing page, linking to the web app's own URL. The web app
**always starts blank** (or with one short "welcome" note explaining the
token vocabulary) — it must never inherit the demo's fake seeded data,
since that would be confusing (which notes are mine vs. sample data?)
and would blur the "no retention" promise of the demo tier.

**Web app → desktop.** Two things surfaced together, e.g. in Settings or
a dedicated panel: "Export your notes" and "Download the desktop app."
The desktop app gets a matching **"Import notes from a file"** entry
point (Settings or a menu item) that reads the same JSON export and
writes each note straight in — see "Closing the loop" below. Decided:
this ships in Phase 1, not deferred, so the journey's final step is a
real one-click action rather than a manual file operation.

## Data-safety messaging (why this isn't just a marketing funnel)

Browser storage is genuinely less durable than a disk file, in ways
worth surfacing honestly rather than glossing over:

- **Safari's Intelligent Tracking Prevention purges script-writable
  storage (including IndexedDB) after 7 days of no user interaction**
  with the site, for non-installed web apps. Someone who tries
  ChronoNote, likes it, and doesn't come back for a week and a half
  could lose everything with zero warning.
- Any browser: clearing site data / "clear browsing data" wipes it.
  Private/incognito windows never persist it at all.
- It's origin-scoped — doesn't follow the user to a different browser or
  device.

None of this is a reason not to build it — it's the reason the export
button and the desktop-app upsell both matter, and why the in-app
messaging should say this plainly rather than let someone find out the
hard way.

---

# Part 2 — Technical design

## Storage engine: IndexedDB

| Option | Verdict |
| --- | --- |
| `localStorage` | Rejected — synchronous (blocks the main thread), ~5-10MB cap, strings only. Note content is small individually but the whole point is it should comfortably hold years of daily notes. |
| **IndexedDB** | **Chosen.** Async, much higher practical storage ceiling, structured (object stores map naturally onto "one row per filename"), supported everywhere that matters. |
| OPFS (Origin Private File System) | Rejected for V1 — would let the web app literally maintain a virtual folder of `.txt` files, closest analogue to the desktop app's own model, but browser support (notably Safari) is newer and patchier. Worth revisiting once support is universal; the `WebBackend` abstraction below means swapping the storage engine later doesn't touch the frontend at all. |

**Schema** — three IndexedDB object stores in one database (`chrononote-webapp`):

- `notes` — key: filename (`"2026-09-12.txt"`), value: `{ content: string, contentHash: string, modifiedMs: number }`. The hash + timestamp are exactly `FileMetadata`'s shape already used by the real app's §94 conflict detection — reused as-is, not reinvented (see below).
- `config` — a single row (fixed key `"config"`), value: `AppConfig` minus `notesDir`/`recentNotesDirs` (meaningless here — see the command table).
- `session` — a single row (fixed key `"session"`), value: `TabSession`.

## `WebBackend`: one class, the existing `TauriCommands` contract

Mirrors what `MockBackend` already proves is possible — a from-scratch
implementation of `TauriCommands`, swapped in at boot instead of the
real IPC bridge, with the entire UI layer none the wiser:

| Command | `WebBackend` behavior |
| --- | --- |
| `get_config` | Read the `config` row; synthesize `AppConfig` defaults (§140: `colorMode: "color"`) on first-ever load. |
| `set_notes_dir` | **No-op / not exposed.** No multi-workspace concept in V1 (see Part 1). |
| `set_color_mode` / `set_word_wrap` / `set_readable_line_length` / `set_auto_check_updates` / `set_theme_mode` / `set_last_seen_version` | Write the one field to the `config` row, return the updated `AppConfig` — identical semantics to both other backends. |
| `list_note_files` | `IDBObjectStore.getAllKeys()` on `notes`. |
| `read_note` | Read `notes[filename].content`, or `null` if absent — same "missing file is `null`, not an error" contract the mock and the real backend both already honor. |
| `write_note` | Write `{ content, contentHash: sha256(content), modifiedMs: Date.now() }`; honor `expectedHash` the same way `storage.rs`'s CAS write does, rejecting with a conflict if it doesn't match. |
| `get_file_metadata` / `read_note_with_metadata` | Read straight from the stored `FileMetadata`-shaped row — no recomputation needed, it's kept current on every write. |
| `write_conflict_copy` | Write to a `notes` key like `2026-09-12.conflict-<ms>.txt`, mirroring the real backend's `.chrononote-conflicts/` naming spirit without needing a real subdirectory. |
| `read_all_notes` | `getAll()` on `notes`, filtered to valid `YYYY-MM-DD.txt` filenames (session/conflict-copy keys excluded, same rule the real backend applies). |
| `read_tab_session` / `write_tab_session` | Read/write the `session` row directly. |
| `path_exists` | **No-op / not exposed** — no filesystem, nothing to check. |

**Why this table matters:** every row above is either "read/write an
IndexedDB row" or "not applicable to a browser" — there is no row that
requires new *application* logic. `controller.ts`, every Svelte
component, `stores.ts` — none of it needs to know which of the three
backends it's talking to. This is the same guarantee the mock backend
already gives the test suite, extended to a real, deployed product
surface.

## Multi-tab conflicts come free from existing §94 machinery

Opening the same web app in two browser tabs and editing the same day in
both is a real scenario IndexedDB doesn't prevent on its own. The
desktop app already solved an equivalent problem — **§94's drift
detection** (`src/lib/drift.ts`, `ConflictModal.svelte`,
content-hash baselines) exists specifically to catch "this note changed
underneath the currently-open tab" and was built against the *abstracted
command layer*, not against real file APIs directly. Since `WebBackend`
implements `get_file_metadata`/`write_note` with the same hash-based
contract, **the existing drift-check-on-focus and conflict-copy UI work
unchanged** — no new conflict-handling code, just a backend that upholds
a contract that already exists for an unrelated reason.

## Export / import

**Format: a single JSON file.** Chosen over a `.zip` of raw `.txt` files
for simplicity (no compression library, no dependency), while staying
maximally convenient to hand-convert into the desktop app's folder model
if that's ever needed — the `notes` object *is* a filename→content map,
one line of script away from a real folder of files.

```jsonc
{
  "chrononoteExport": 1,
  "exportedAt": "2026-09-12T12:00:00Z",
  "notes": {
    "2026-09-12.txt": "# call the vendor\n...",
    "2026-09-11.txt": "..."
  },
  "config": { "colorMode": "color", "themeMode": "system" }
}
```

- `chrononoteExport` is a schema version, checked on import so a future
  format change can be detected and migrated (or rejected with a clear
  message) instead of silently misreading an old export.
- `config` is included for convenience (round-tripping the color/theme
  choice) but is optional on import — missing/invalid `config` just
  falls back to defaults, never blocks importing the notes themselves.
- Tab session is deliberately **not** exported — it's ephemeral UI
  state, trivially reconstructed (falls back to opening today's note, the
  same as any fresh boot).

**Export** — read every row from `notes` + the `config` row, build the
JSON above, trigger a download via a `Blob` + a temporary `<a download>`
(this is a real webpage, not a sandboxed artifact — this works
normally), filename `chrononote-export-YYYY-MM-DD.json`.

**Import** — a file picker (`<input type="file" accept=".json">`), parse
and validate against the schema above, then a confirmation step showing
counts before anything is written (e.g. "12 notes in this file — 3 would
overwrite existing notes with the same date"). Two explicit modes,
matching the two real reasons someone would import:
- **Merge, skip duplicates** (default, decided) — write notes whose
  filename doesn't already exist; skip ones that do. Safe for "I have
  some old notes from another browser I want to add in" — never
  silently overwrites anything.
- **Replace everything** — clear `notes` first, then write all. For "I'm
  restoring a backup onto a fresh browser profile," explicitly a more
  destructive action and worth a clearer confirmation than the default
  path (this is the same "explicit permission for anything destructive"
  instinct the desktop app already applies elsewhere, e.g. the safety-close
  gate).

## Closing the loop: desktop-side import (Phase 1, decided in scope)

A new Tauri command, `import_notes_bundle`, taking the same
`{ notes: Record<filename, content> }` shape as the export JSON (parsed
frontend-side from the picked file, only the note map is sent over IPC —
`config` is not imported into an existing desktop install, since a
desktop user's own theme/color-mode choice should win). Implementation
is a straight loop over the existing `write_note_at` primitive already
in `storage.rs` — no new storage logic, just a new command that calls an
existing one N times. Frontend: a "Import notes from a file…" entry in
Settings, a file picker, the same merge/replace choice and
before-you-import count summary as the web app's own importer (shared
component/logic where practical — the confirmation UX should feel
identical in both places).

Filename validation on import reuses the exact same
`is_valid_note_filename` check `write_note` already enforces — an export
file is trusted no more than any other input, since it could in
principle have been hand-edited or come from a future/incompatible
schema version.

## Storage durability

- Call `navigator.storage.persist()` on first use, requesting the
  browser *not* evict this origin's storage under pressure. (Doesn't
  help against Safari's ITP time-based purge — nothing short of a real
  PWA install does — but it's a real, free improvement against ordinary
  storage-pressure eviction elsewhere.)
- Surface `navigator.storage.estimate()` (quota/usage) somewhere
  low-key, e.g. Settings — mainly useful as an early warning if someone
  somehow accumulates an unusually large history.

## PWA / offline install (Phase 2 candidate)

Not required for the requested journey ("installs locally" means the
real desktop app), but directly relevant to the Safari ITP risk flagged
above — an installed PWA is generally exempt from the 7-day
script-writable-storage purge, since installation itself signals
"real" engagement rather than a one-off visit. What it would take:

- **A web app manifest** (`manifest.webmanifest` — name, icons at a few
  sizes, `display: "standalone"`, theme/background color). Small,
  mechanical — reuses the app's existing icon art (`src-tauri/icons/`).
- **A service worker**, minimally just enough to satisfy install
  criteria and cache the app shell (`index.html` + JS/CSS bundle) for
  offline load — a cache-first strategy for the static shell is enough,
  since all real data lives in IndexedDB, not in anything the service
  worker needs to manage. No offline sync logic needed (there's nothing
  to sync — this is a single-origin, single-device store already).
- **The install prompt itself** — browsers show their own "Install app"
  UI once the manifest + service worker + HTTPS criteria are met; no
  custom UI strictly required, though a small "Install ChronoNote" button
  (using the `beforeinstallprompt` event on Chromium; Safari has no
  equivalent event, install there is manual via the Share sheet) is a
  nice-to-have.
- **Caveats:** `beforeinstallprompt`/programmatic install prompting is
  Chromium-only; Safari/iOS installation is a manual "Add to Home
  Screen" step with no way to prompt for it, so the messaging can invite
  but not force the behavior there. Doesn't change the IndexedDB schema
  or `WebBackend` at all — this is purely additive scaffolding around
  the same web app.
- **Effort:** small — a manifest file, a short service worker (a handful
  of lines using the Cache API, or a generator like Vite's own PWA
  plugin if a zero-maintenance option is preferred), and wiring the
  manifest `<link>` + service-worker registration into `main-webapp.ts`.
  Roughly comparable in size to the export/import feature itself, not a
  bigger undertaking.

## Build & deploy

A third Vite config, exactly mirroring the existing `vite.demo.config.ts`
pattern (`root`, dedicated entry, isolated from the real app's
`dist/`/`build-guard`):

- `vite.webapp.config.ts` → `webapp-src/index.html` → `src/main-webapp.ts`
  (boots `WebBackend` instead of the mock or the real IPC bridge).
- `npm run build:webapp`, output to (recommend) `website/webapp/` — the
  same "committed static bundle, deployed by Plesk's Git-pull" pattern
  already proven for the demo. No new deploy mechanism needed.
- **Promoted to `website-live` under the exact same discipline** the
  website deploy strategy already establishes: the web app doesn't
  auto-update on every `main` push either. **Decided: released in
  lockstep with the desktop app** — the web-app rebuild-and-promote step
  is folded into the same release-workflow step 8 that already rebuilds
  the demo, so both always reflect one specific, known app version
  rather than either drifting ahead of the other.
- **Hosting: decided — a subdomain, `app.chrononote.mariendegelder.nl`**,
  for independent cache headers from the marketing site/demo and to read
  clearly as "the actual application" rather than a page on the site.
  Needs the same one-time Plesk subdomain setup as the main site did
  (Marien's own step, same shape as the original `chrononote.
  mariendegelder.nl` setup).

---

## Decisions (2026-09-12)

All five questions this section originally posed have been answered:

1. **Hosting: `app.chrononote.mariendegelder.nl`** (subdomain) — independent
   cache headers from the marketing site, reads clearly as "the actual
   application."
2. **Import conflict policy: merge, skip duplicates**, as the default —
   never silently overwrites; "replace everything" stays available as an
   explicit, more clearly destructive secondary choice.
3. **Desktop-side "Import from export file": in Phase 1**, not deferred —
   see "Closing the loop" above. The journey's last step is a real
   one-click import, not a manual file operation.
4. **Release cadence: lockstep with the desktop app.** The web app is
   rebuilt and promoted to `website-live` as part of the same
   release-workflow step that already rebuilds the demo, so it can never
   silently drift ahead of what the desktop app actually supports.
5. **V1 scope: the full feature set**, not a trimmed cut — the backend
   abstraction means the complete app comes essentially for free, so
   there's little reason to ship less.

## Suggested release shape

| Release | Scope | Risk |
| --- | --- | --- |
| **Phase 1** | `WebBackend` (IndexedDB) + `vite.webapp.config.ts`/`main-webapp.ts` + export/import (web app) + desktop-side `import_notes_bundle` + the storage-tier UI indicator + data-safety messaging + `app.chrononote.mariendegelder.nl` hosting setup | Low-medium — new code, but additive; touches nothing in the real app's or demo's existing build output |
| **Phase 2** (optional, later) | Demo/landing-page CTAs wired to the new web app's URL; OPFS storage engine revisited if browser support has matured; PWA/offline install (see below) | Low — small, independent additions |

Nothing here touches `src-tauri/`, the real app's `vite.config.ts`, or
the demo's `vite.demo.config.ts` — this is a purely additive third
frontend target sharing the existing Svelte/TypeScript source tree.
