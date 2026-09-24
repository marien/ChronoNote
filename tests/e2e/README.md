# ChronoNote E2E / UI-UX tests

Drive the **real Svelte frontend** in headless Chromium against an
**in-memory mock Tauri backend**, exercising the app the way a user would:
typing tokens, opening drawers, switching tabs, switching folders — then
asserting on the DOM *and* on what actually got persisted.

This is the layer `cargo test` (Rust storage) and the Vitest suite
(`src/**/*.test.ts`, pure logic) can't reach. It deliberately does **not**
run the native Tauri window — no Rust build in the loop, so it's fast
(~20s for the whole suite) and deterministic.

## Running

```bash
npm run test:e2e            # headless, all specs
npm run test:e2e -- editor  # just specs matching "editor"
npm run test:e2e:ui         # Playwright's watch/inspector UI
npm run test:e2e:report     # open the last HTML report
npm run check:e2e           # type-check the specs (tsc, no browser)
```

Playwright starts the Vite dev server itself (`webServer` in
`playwright.config.ts`) and reuses one already on `:1420`.

First-time setup on a new machine:

```bash
npm install
npx playwright install chromium
```

## How it fits together

```
tests/e2e/*.spec.ts
      │  seedApp(page, { seed })
      ▼
src/lib/testing/
  scenarios.ts   named seeds ("empty", "busy-week", "delegation", …)
  dataset.ts     generateDataset() — realistic YYYY-MM-DD.txt notes,
                 deterministic (prng.ts), full token vocabulary
  mockBackend.ts installMockTauri() → window.__TAURI_INTERNALS__
                 an in-memory notes "filesystem" implementing every
                 command in src-tauri/src/lib.rs + the plugin calls
  bootMock.ts    resolves a seed, installs the mock, wires debug hooks
      ▲
src/main.ts   if (import.meta.env.DEV && ?mock) → import("./lib/testing/bootMock")
```

`import.meta.env.DEV` is a compile-time constant, so `vite build` drops
the whole branch and `src/lib/testing/` never ships. (CI asserts this.)

### Seeding a test

```ts
import { seedApp } from "./helpers";

await seedApp(page, { seed: "busy-week" });          // a named scenario
await seedApp(page, { seed: { notes: { "2026-09-07.txt": "…" } } }); // ad hoc
```

`seedApp` pins the wall clock to `REFERENCE_TODAY` (2026-09-07) with
`page.clock.setFixedTime` — real timers keep running (unlike
`clock.install`), so debounced autosave and rAF layout code are
unaffected; only `new Date()` is frozen, which is what the dataset and the
date-picker grammar ("today", "-2", …) need.

### Asserting on persistence

`window.__CHRONO_MOCK__` (a `MockBackend`) is available in `page.evaluate`:

| helper | what |
| --- | --- |
| `mockNote(page, fn)` | current in-memory content of a note file |
| `lastWrittenNote(page, fn)` | latest `write_note` payload (waits out the 400ms debounce) |
| `noteWrites(page, fn)` | every `write_note` payload, in order |
| `mockFiles(page)` | `list_note_files` result |
| `activeTabContent(page)` | the active tab's raw doc text (incl. unsaved scratchpads) |
| `currentModal(page)` | which modal kind is open, per app state |

`m.openedUrls` / `m.nextDialogResult` cover the opener and folder-picker
plugins.

### Driving the app by hand

```bash
npm run dev
# then open:
http://localhost:1420/?mock&scenario=busy-week
```

Scenarios: `empty`, `single-day`, `busy-week`, `heavy` (~10 weeks),
`delegation`, `dir-switch`.

## Conventions

- **Arrange** editor content with `setEditorText()` (one dispatch — skips
  the editor's smart-Enter / bullet-continuation handling). Only use
  `typeInEditor()` / raw `keyboard` when the *typing itself* is under test.
- Prefer `role`/`aria-label` selectors (`modalCard(page, MODAL_LABELS.x)`)
  over CSS where possible.
- Screenshots in `visual.spec.ts` are **artifacts for review, not
  assertions** — appearance never fails a build here (see the file's own
  note and CLAUDE.local.md on why pixel-diffing this app is unreliable).

## What's covered

| spec | area |
| --- | --- |
| `smoke` | mock boot, session restore, token→glyph→disk round-trip |
| `editor-tokens` | every spec-2.2 glyph, Ctrl+Space cycle, bullet continuation, indentation |
| `open-action-nav` | Ctrl+↓ / Ctrl+↑ jump between open actions, wrapping (§78) |
| `glyph-layout` | glyph lines are the same height as plain lines, incl. tall-fallback-font sim (§79) |
| `word-wrap` | Settings toggle wraps / unwraps, persists across reload, reconfigures in place (§80) |
| `setext-rule` | `====` underline renders as a double rule; cursor / hover / selection reveal the literal chars (§81) |
| `tabs-lifecycle` | create/close/cycle/reopen, both safety-close gates |
| `action-drawer` | open/all scope, Only-Open, filter, `@`, cycle, forward-to-today, jump |
| `navigation` | date-picker grammar, Open-Only, create-on-open |
| `section-import` | setext + spacing rules, blank-line handling, draft persistence |
| `search-and-history` | cross-tab + all-files search; Section History occurrence browsing, line selection, take-over destinations |
| `settings` | theme persist + reload, directory switch (recent + Browse), scratchpad gate |
| `drawers` | shortcuts / legend / about, external link, focus capture, Escape |
| `paste-deferral` | copy `# ` → paste into today defers source to `> ` |
| `visual` | screenshot gallery (artifacts only) |
