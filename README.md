# ChronoNote

A minimalist, keyboard-driven plain-text app for daily notes, meeting
logs, and action items. Tauri v2 (Rust) + Svelte 5 / TypeScript +
CodeMirror 6, with the same frontend also shipping as a public demo and
a browser-storage web app.

See [`docs/spec.md`](docs/spec.md) for the full product/technical spec —
tokens & glyphs, keyboard shortcuts, drawers, session/safety behavior,
and the three build targets. See [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
for the complete history of *why* each part is built the way it is.

Try it live: [chrononote.mariendegelder.nl](https://chrononote.mariendegelder.nl)
(demo, no data retention) or
[app.chrononote.mariendegelder.nl](https://app.chrononote.mariendegelder.nl)
(web app, saves to your browser).

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
cd src-tauri && cargo test       # Rust storage-layer unit tests
npm run test:e2e                 # Playwright — full frontend against a mock backend
```

All four run in CI (`.github/workflows/test.yml`) on every push/PR. See
[`docs/spec.md`](docs/spec.md#8-testing-strategy) for what each layer
covers, and `tests/e2e/README.md` for the Playwright harness in detail.

## Where your notes live

Daily notes are plain `.txt` files named `YYYY-MM-DD.txt`, stored in a
configurable root folder (`notes_dir` in the app's `config.json`,
defaulting to `~/Documents/Notes`). Nothing but UTF-8 text ever gets
written into a note file — no database, no front-matter, no injected
IDs. `config.json` lives in the OS-appropriate app config directory
(e.g. `%APPDATA%\com.chrononote.app` on Windows). The web app keeps the
equivalent data in the browser's own storage instead — see
[`docs/spec.md`](docs/spec.md#7-distribution-backends--the-update-mechanism).

## Migrating existing notes

Already have notes somewhere else? See
[`docs/migration-guide.md`](docs/migration-guide.md) for the exact file
format to convert them into and how to bring them in via Settings → Data
→ "Import notes from a file…" — precise enough to hand to a conversion
script or an AI agent.

## Other build targets

The same `src/` tree also builds the public demo and the web app —
see [`website/README.md`](website/README.md) for how those are built,
previewed locally, and deployed.

### Android (v0.10.0)

The desktop frontend also runs as an Android app (Tauri v2 mobile), with a
touch accessory bar and OneDrive sync so the same notes folder is available on
phone and PC (three-way merge; a note edited on both sides is merged, or held
for you to resolve in-app — no loose conflict files). Not on a store yet: build
a signed sideloadable APK with `scripts/android-release.sh` (setup, signing and
the pinned Rust 1.95.0 toolchain are described in that script and in
`src-tauri/android-overrides/README.md`), then `adb install -r` it or copy it to
the phone. See spec §7.6 and CHANGELOG §181–§186.

## License

[MIT](LICENSE)
