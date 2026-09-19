# ChronoNote

A minimalist, keyboard-driven plain-text app for daily notes, meeting
logs, and action items. Tauri v2 (Rust) + Svelte 5 / TypeScript +
CodeMirror 6. One frontend ships four ways: a desktop app, an Android
app, a browser-storage web app, and a public demo.

Notes are plain `.txt` files, one per day — no database, no
front-matter, no hidden IDs.

See [`docs/spec.md`](docs/spec.md) for the full product/technical spec —
tokens & glyphs, keyboard shortcuts, drawers, session/safety behavior,
and the four build targets. See [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
for the complete history of *why* each part is built the way it is.

## Get it

- **Windows:** the installers (`.msi` / `-setup.exe`) are on the
  [Releases page](https://github.com/marien/ChronoNote/releases/latest).
  The app checks GitHub for new versions and can install them for you.
- **Android:** the signed `_arm64.apk` on the same page (64-bit ARM,
  Android 7+). There is no store listing yet, so you install it yourself
  and update by installing a newer APK over it. See [Android](#android).
- **In a browser:** [chrononote.mariendegelder.nl](https://chrononote.mariendegelder.nl)
  is the demo (no data retention);
  [app.chrononote.mariendegelder.nl](https://app.chrononote.mariendegelder.nl)
  is the web app (saves to your browser).

## Prerequisites

- Node.js 18+ and npm
- Rust (via [rustup](https://rustup.rs))
- Windows: the "Desktop development with C++" workload (MSVC Build Tools)
- macOS: Xcode Command Line Tools
- Linux: see the [Tauri Linux prerequisites](https://tauri.app/start/prerequisites/)
- Android builds only: the Android SDK and NDK (`ANDROID_HOME`,
  `NDK_HOME`), a JDK, and the Rust Android target — see [Android](#android)

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
On Android the notes live in the app's own storage and sync with a
OneDrive folder you choose.

## Migrating existing notes

Already have notes somewhere else? See
[`docs/migration-guide.md`](docs/migration-guide.md) for the exact file
format to convert them into and how to bring them in via Settings → Data
→ "Import notes from a file…" — precise enough to hand to a conversion
script or an AI agent.

## Web app and demo

The same `src/` tree also builds the public demo and the web app —
see [`website/README.md`](website/README.md) for how those are built,
previewed locally, and deployed.

## Android

The frontend runs as an Android app (Tauri v2 mobile), with a touch
accessory bar and OneDrive sync so the same notes are on your phone and
your PC. A note edited on both sides is merged line by line, or held for
you to resolve inside the app — there are no loose conflict files. See
[`docs/spec.md`](docs/spec.md) §7.6 for the design and
[CHANGELOG](docs/CHANGELOG.md) §181–§186 for how it got here.

**Installing** (no store listing yet): download the `_arm64.apk` from the
[latest release](https://github.com/marien/ChronoNote/releases/latest),
open it on the phone and allow the install; or `adb install -r <apk>`.
The [guide](https://chrononote.mariendegelder.nl/guide.html#android) has
the OneDrive setup.

**Building it yourself:** `scripts/android-release.sh` builds, aligns,
signs and verifies an arm64 release APK (output in
`~/.chrononote-android-release/`). You need:

- the Android SDK/NDK and a JDK (see Prerequisites);
- Rust **1.95.0** with the Android target — Rust 1.98.1 can't
  cross-compile for Android from a Windows host, so the script pins the
  toolchain itself:
  `rustup toolchain install 1.95.0 && rustup +1.95.0 target add aarch64-linux-android`;
- a release keystore outside the repo — the header of the script says
  where it goes and what it contains.

The Android project under `src-tauri/gen/` is generated and gitignored;
the hand-maintained pieces live in `src-tauri/android-overrides/` — see
its README for the steps after regenerating it.

## License

[MIT](LICENSE)
