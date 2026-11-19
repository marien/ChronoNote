# R3a: Web App Start-up Measurement (Before Lazy Dialogs)

Measured on branch `gemini/r3a-measure-startup` (version `0.39.0-3`, clean `npm run build:webapp` output) to quantify whether loading dialogs on first use (review item R3) produces a visible start-up gain on a phone.

## Method

### 1. Bundle analysis
- Built `website/webapp/` via `npm run build:webapp` (`vite.webapp.config.ts`, Vite 8.3.8 / Rolldown / Svelte 5).
- Measured exact module and chunk weights using:
  - a sourcemap build (`npx vite build --config vite.webapp.config.ts --sourcemap`, discarded before timing runs) to attribute mapped JS bytes across `node_modules/`, `src/lib/i18n/locales/`, `src/lib/components/modals/*`, and `AboutPanel.svelte`; and
  - an in-memory lazy-split simulation of `App.svelte` and `ModalHosts.svelte` (plus sub-panels of `SettingsModal.svelte` and `HistoryModal.svelte`) in Rolldown to capture full minified + gzipped sizes including Svelte 5 `from_html(...)` template strings (which are unmapped in the sourcemap).

### 2. Phone-like start-up timing (`scripts/measure-startup.mjs`)
- Served `website/webapp/` locally over HTTP with `Content-Encoding: gzip` for text assets (`.html`, `.js`, `.css`, `.webmanifest`, `.json`, `.txt`) and `Cache-Control: public, max-age=31536000, immutable` on `/assets/`.
- Loaded in headless Playwright Chromium with:
  - **Viewport / touch**: `412x915`, `deviceScaleFactor: 2.625`, `isMobile: true`, `hasTouch: true`, Android mobile user agent (`window.matchMedia("(pointer: coarse)").matches === true` verified on every load).
  - **Network**: CDP `Network.emulateNetworkConditions` set to Chrome DevTools **Fast 4G** (`downloadThroughput = 1,012,500 B/s` [9 Mbps with 10% overhead], `uploadThroughput = 168,750 B/s` [1.5 Mbps with 10% overhead], `latency = 165 ms`).
  - **CPU**: CDP `Emulation.setCPUThrottlingRate` at `4x` and `6x`.
  - **Cold** (7 loads): fresh browser context per load, HTTP cache disabled, empty IndexedDB (app runs its normal first-run onboarding path, seeding the welcome scratchpad).
  - **Warm** (7 loads): same browser context after first run, Service Worker (`sw.js`) active and controlling every load (`7/7`), today's note seeded via `write_note` so `.cm-content` opens with note text on subsequent launches, each load in a fresh page.
- Captured per load via `PerformanceNavigationTiming`, `PerformanceResourceTiming`, a `MutationObserver` on `#app` / `.cm-content`, IndexedDB `app_log` (`boot done in N ms` from `src/lib/boot.ts`), and Chrome `Tracing` (`devtools.timeline`, `v8.execute`, `blink.user_timing`):
  - **Script Ready**: `performance.now()` when `v8.evaluateModule` starts running `index-Dfjfqmx0.js`.
  - **Main Parse+Compile**: union CPU duration of `v8.parseOnBackgroundParsing`, `v8.compileModule`, `v8.compile`, `v8.compileFunction`, and `V8.CompileCode` for the main script (explicitly excluding `v8.parseOnBackgroundWaiting`, which is ~432–438 ms of idle waiting for network stream chunks on cold loads).
  - **Main Evaluate**: duration of `v8.evaluateModule` for the main script (includes top-level module execution and Svelte `mount(App, ...)`).
  - **Boot Done**: `boot done in N ms` logged at the end of `initApp()` in `src/lib/boot.ts`.
  - **First Note**: `performance.now()` when `.cm-content` is mounted, non-empty, and has non-zero layout box (followed by `First Paint` on the next `requestAnimationFrame`).

Re-run at any time after `npm run build:webapp`:

```bash
node scripts/measure-startup.mjs
node scripts/measure-startup.mjs --throttle 6
```

---

## Bundle sizes

The clean webapp build emits:
- **`website/webapp/assets/index-Dfjfqmx0.js`**: **1,573.84 kB** raw (**467.80 kB** gzip via Vite reporter; 462.99 kB at zlib level 9)
- **`website/webapp/assets/index-CabK_Zh5.css`**: **144.28 kB** raw (**23.97 kB** gzip)
- **`website/webapp/assets/THIRD-PARTY-NOTICES-OdsMQZus.js`**: **300.95 kB** raw (**26.98 kB** gzip) — **already** split into an async chunk via `await import("../../assets/THIRD-PARTY-NOTICES.txt?raw")` in `src/lib/components/AboutPanel.svelte` (0 B in the startup script)
- **`website/webapp/assets/dist-js-vsHuJNqy.js`**: **0.53 kB** raw (**0.25 kB** gzip)

| Item | Minified raw (kB) | Gzip L9 (kB) | Notes |
| --- | ---: | ---: | --- |
| Main startup script (`index-Dfjfqmx0.js`) | **1,573.84** | **462.99** | Vite reporter: 467.80 kB gzip |
| **`src/lib/components/modals/*` (> 10 kB each)** | | | |
| — `modals/ActionDrawerModal.svelte` | 20.50 | 7.47 | |
| — `modals/settings/NotesSyncPanel.svelte` | 18.67 | 5.77 | Inside `SettingsModal` (34.55 kB combined) |
| — `modals/WeekReviewModal.svelte` | 14.27 | 5.28 | |
| — `modals/settings/AppearancePanel.svelte` | 12.65 | 3.65 | Inside `SettingsModal` |
| — `modals/SearchModal.svelte` | 10.90 | 4.29 | Includes `listFormat.ts` & `resultRow.ts` |
| Remaining 25 files under `src/lib/components/modals/*` (< 10 kB each) | ~129.97 | — | Largest: `HistoryModal` (9.51 kB; 18.79 kB with `history/*`), `ShortcutsModal` (8.44 kB), `OneDriveFolderPickerModal` (8.32 kB), `PersonModal` (8.08 kB), `DatePickerModal` (7.48 kB) |
| `src/lib/components/AboutPanel.svelte` | 12.40 | 3.65 | Shared by `AboutModal` and `SettingsModal` |
| Exclusive dialog helpers (11 non-modal files) | ~10.19 | ~3.61 | `listCopy.ts`, `glyphLine.ts`, `lineDiff.ts`, `focusScrollableList.ts`, `SettingToggle`, `SettingRow`, `EmptyState`, `Segmented`, `dayHeat.ts`, `listFormat.ts`, `resultRow.ts` |
| **Third-party notices (`THIRD-PARTY-NOTICES-*.js`)** | **0** in main | **0** in main | Already lazy-loaded (300.95 kB raw / 26.98 kB gzip separate chunk) |
| **Large libraries exclusive to dialogs** | **0** | **0** | CodeMirror, Lezer, Svelte, and Tauri API shims are all used on startup |
| **Net reduction on main startup script if all dialogs are lazy-loaded** | **~182.19** (**11.6%**) | **~41.9–46.7** (**~9–10%**) | `1,573.91 kB → 1,391.72 kB` across startup chunks (per-dialog async chunks total 220.07 kB raw / 83.85 kB gzip including chunk wrappers) |

For context on what else makes up the remaining `1,391.7 kB` of `index-Dfjfqmx0.js`:
- **All 7 i18n locale files** (`src/lib/i18n/locales/{fr,de,es,pl,it,nl,en}.ts`, synchronously imported by `src/lib/i18n/index.ts`): **493.40 kB** mapped raw / **520.12 kB** as a chunk (**142.00 kB** gzip) — ~31–33% of the main script.
- **CodeMirror 6 + Lezer** (`@codemirror/*`, `@lezer/*`): **297.26 kB** mapped raw (~19% of the main script).

---

## Start-up timings (median of 7 loads, 412x915 touch, Fast 4G)

| Scenario | HTML Ready (ms) | Main JS Fetch (ms) | Script Ready (ms) | Main Parse+Compile (ms) | Main Eval (ms) | Main PCE Total (ms) | Boot Done (`boot.ts`, ms) | First Note (ms) | First Paint (ms) | SW Active |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| **4x CPU, Cold** | 192.0 | 904.6 | 935.0 | 74.1 | 272.7 | **345.7** | 155.0 | **1,630.8** | 1,693.7 | 7/7 |
| **4x CPU, Warm** | 4.8 | 34.0 | 71.5 | 0.8 | 44.6 | **45.5** | 109.0 | **506.1** | 533.4 | 7/7 |
| **6x CPU, Cold** | 190.8 | 915.0 | 952.7 | 73.0 | 437.1 | **510.9** | 245.0 | **2,065.2** | 2,174.9 | 7/7 |
| **6x CPU, Warm** | 4.7 | 51.5 | 115.3 | 1.4 | 66.9 | **68.3** | 177.0 | **812.7** | 855.9 | 7/7 |

Notes on warm runs:
- In warm loads 2–7, Chromium's V8 bytecode cache (coupled with Service Worker Cache Storage) eliminates almost all script compile work (`0.8–1.4 ms`) and drops evaluation from `~261–414 ms` (warm run 1, before V8 code cache warms) down to `44.6 ms` (4x) and `66.9 ms` (6x).
- Local `sw.js` navigation `fetch()` resolves in ~5 ms against `127.0.0.1`; on a real mobile network, `sw.js` races `fetch(request)` with a `1,500 ms` timeout on HTML navigations before falling back to cache, while hashed `/assets/` are served Cache-First in ~34–52 ms (`0 B` network transfer).

---

## Estimated saving from lazy-loading dialogs (R3)

Using the dialogs' **11.6%** raw share of the main script (`182.2 / 1,573.9 kB`) times the measured main-script parse/compile/evaluate (PCE) time:

| Scenario | Main PCE (ms) | Est. CPU PCE Saving (`11.6% × PCE`) | Est. Network Saving on Fast 4G (`~46.7 kB` gzip) | Total Est. Saving | Share of Time-to-First-Note |
| --- | ---: | ---: | ---: | ---: | ---: |
| **4x CPU, Cold** | 345.7 ms | **40.0 ms** | ~46 ms | **~86 ms** (CPU only: 40.0 ms) | **5.3%** (CPU only: **2.5%**) of 1,630.8 ms |
| **4x CPU, Warm** | 45.5 ms | **5.3 ms** | 0 ms (SW cache) | **5.3 ms** *(36.0 ms before V8 code cache)* | **1.0%** of 506.1 ms *(4.3% before code cache)* |
| **6x CPU, Cold** | 510.9 ms | **59.2 ms** | ~46 ms | **~105 ms** (CPU only: 59.2 ms) | **5.1%** (CPU only: **2.9%**) of 2,065.2 ms |
| **6x CPU, Warm** | 68.3 ms | **7.9 ms** | 0 ms (SW cache) | **7.9 ms** *(53.8 ms before V8 code cache)* | **1.0%** of 812.7 ms *(4.1% before code cache)* |

Cold start-up is dominated by Fast 4G network transfer of the bundle (`~905–915 ms`, where the 7 synchronously bundled i18n locale files and CodeMirror/Lezer account for over half the payload) and CodeMirror/editor mount + Blink layout (`~378–601 ms` after app mount), while warm start-up is dominated by IndexedDB boot (`109–177 ms`) and CodeMirror initialization + initial layout (`~355–575 ms`, including `127–199 ms` of layout, with zero web-font fetches).
