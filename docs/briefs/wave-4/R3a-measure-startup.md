# Brief R3a: measure the web app's start-up before deciding on lazy dialogs

Run name `r3a-measure-startup` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r3a-measure-startup` · branch
`gemini/r3a-measure-startup` · base `main` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **No app code changes**: this run measures.

## Why

Review item R3 proposes loading the dialogs on first use (Settings, Section History, the week review, export, the
conflict dialogs, the licence text) instead of shipping them in the one start-up script (about 1.4 MB). The phone web
app parses all of it before the first note shows. Marien's decision (2026-11-15, again 2026-11-19): build it only if
the gain is visible. This run produces the numbers.

## What to measure

1. **What the dialogs weigh.** Build the web app (`npm run build:webapp`; output under `website/webapp/` or the
   config's `outDir`; do not commit the build output). With a bundle analysis (for example `rollup-plugin-visualizer`
   via `npx`, or a sourcemap build and `npx source-map-explorer`; do not add a dependency to `package.json`), report
   the size (raw and gzip) of the main script and how much of it the candidate dialogs and their own imports make up:
   `src/lib/components/modals/*` (list each one above 10 kB), `AboutPanel.svelte`, the third-party notices, and any
   large library only they use.
2. **Start-up time, phone-like.** Serve the built web app locally (`npx vite preview --config vite.webapp.config.ts`
   or a static server) and load it with Playwright Chromium, emulating a phone: a 412x915 viewport, a mobile user
   agent, CPU throttled 4x and 6x (CDP `Emulation.setCPUThrottlingRate`), and a "Fast 4G" network
   (`Network.emulateNetworkConditions`). Measure, as the median of 7 loads, cold (new context, no cache) and warm
   (same context, cached and service worker active):
   - script ready: `performance.now()` when the main module starts running (read the existing `boot done in N ms`
     log line in `src/lib/boot.ts` and the navigation timing; use `PerformanceObserver` / `performance.getEntries()`
     for script evaluate time, or CDP `Profiler` / tracing if needed);
   - first note shown: the editor (`.cm-content`) visible with the note text;
   - the time the main script spends in parse/compile/evaluate (from a trace), so the share the dialogs would save
     can be estimated as (their share of the script) x (that time).
   Use the web app's normal first-run path with the in-browser storage (no OneDrive); seed one note if the first run
   needs one.
3. Put the measuring script in `scripts/measure-startup.mjs` (runnable again after R3, `node scripts/measure-startup.mjs`
   with an optional `--throttle N`), so a before/after comparison can reuse it.

## Output

- `docs/design/r3-startup-measurement.md`: method, the table of sizes, the table of timings (cold/warm, 4x/6x),
  the estimated saving if the dialogs load on first use (in ms and as a share of time-to-first-note), and what else
  dominates start-up if it is not the script (for example fonts, the service worker, IndexedDB).
- `scripts/measure-startup.mjs`.
- No recommendation needed beyond the numbers; one sentence on what dominates is enough.

## Out of scope

Any change under `src/`, `package.json` dependencies, the build configs. Do not commit build output.

## Done when

- [ ] Both files exist; the script runs from a clean checkout after `npm run build:webapp`.
- [ ] `git diff --stat` shows only `docs/design/r3-startup-measurement.md` and `scripts/measure-startup.mjs`.
- [ ] `npm run verify` passes. Commit before the final report.

## Report

The standard report from RULES.md, plus the two tables and the estimated saving.
