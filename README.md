# ChronoNote

A minimalist, keyboard-driven plain-text app for daily notes, meeting
logs, and action items. Tauri v2 (Rust) + Svelte 5 / TypeScript +
CodeMirror 6. One frontend ships three ways: a desktop app, a
browser-storage web app (installable as a PWA on your phone), and a
public demo.

Notes are plain `.txt` files, one per day — no database, no
front-matter, no hidden IDs.

See [`docs/spec.md`](docs/spec.md) for the full product/technical spec —
tokens & glyphs, keyboard shortcuts, drawers, session/safety behavior,
and the three build targets. See [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
for the complete history of *why* each part is built the way it is.

## Get it

- **Windows:** the installers (`.msi` / `-setup.exe`) are on the
  [Releases page](https://github.com/marien/ChronoNote/releases/latest).
  The app checks GitHub for new versions and can install them for you.
- **In a browser, or on your phone:** [chrononote.mariendegelder.nl](https://chrononote.mariendegelder.nl)
  is the demo (no data retention);
  [app.chrononote.mariendegelder.nl](https://app.chrononote.mariendegelder.nl)
  is the web app (saves to your browser, and can sync with a OneDrive
  folder) — install it to your home screen for an app-like experience.

## Prerequisites

- Node.js 18+ and npm
- Rust (via [rustup](https://rustup.rs))
- Windows: the "Desktop development with C++" workload (MSVC Build Tools)
- macOS: Xcode Command Line Tools
- Linux: see the [Tauri Linux prerequisites](https://tauri.app/start/prerequisites/)

## Development

```bash
npm install
npm run tauri dev
```

`npm run dev` alone starts just the Vite dev server in a regular browser
(no native window) — faster for pure UI iteration, but any Tauri IPC
call will throw outside the real app.

## Building an installer

```bash
npm run tauri build
```

## Running tests

```bash
npm run check                    # svelte-check — TypeScript/Svelte type errors
npm test                         # Vitest — frontend business-logic unit tests
cd src-tauri && cargo test       # Rust unit tests (storage, OneDrive sync and merge)
npm run test:e2e                 # Playwright — full frontend against a mock backend
```

All four run in CI (`.github/workflows/test.yml`) on every push/PR. See
[`docs/spec.md`](docs/spec.md#8-testing-strategy) for what each layer
covers, and `tests/e2e/README.md` for the Playwright harness in detail.

## Where your notes live

Daily notes are plain `.txt` files named `YYYY-MM-DD.txt`, stored in a
configurable root folder (`notes_dir` in the app's `config.json`,
defaulting to `~/Documents/Notes`). Nothing but UTF-8 text ever gets
written into a note file. `config.json` lives in the OS-appropriate app
config directory (e.g. `%APPDATA%\com.chrononote.app` on Windows).

The web app keeps the equivalent data in the browser's own storage — see
[`docs/spec.md`](docs/spec.md#7-distribution-backends--the-update-mechanism).

## Migrating existing notes

Already have notes somewhere else? See
[`docs/migration-guide.md`](docs/migration-guide.md) for the exact file
format to convert them into and how to bring them in via Settings → Data
→ "Import notes from a file…" — precise enough to hand to a conversion
script or an AI agent.

## Calendar sync

"Sync calendar for this day" (opt-in, Settings → Calendar) turns a real
meeting calendar into note sections automatically. ChronoNote never talks
to a calendar API directly — it reads a `.agenda.json` file that whatever
you already use to sync your calendar needs to keep up to date, at the
root of your notes folder. See
[`docs/agenda-file-guide.md`](docs/agenda-file-guide.md) for the exact
schema.

## Web app and demo

The same `src/` tree also builds the public demo and the web app —
see [`website/README.md`](website/README.md) for how those are built,
previewed locally, and deployed.

## License

[MIT](LICENSE)
