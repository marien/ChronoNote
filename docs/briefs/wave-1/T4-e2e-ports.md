# Brief T4: browser tests that can run side by side

Run name `t4-e2e-ports` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t4-e2e-ports` · branch
`gemini/t4-e2e-ports` · base `main` · browser-test port: the one this brief makes automatic · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

`playwright.config.ts` uses port 1420 and reuses any server already there. Two checkouts running the suite at the same
time therefore test the first one's code, and a dev server that has run for hours leaks stale state into a run. So
only one run at a time is allowed and coder models may not run the suite. After this brief every checkout runs the
suite on its own port with its own fresh server, with no setting needed.

## What exists now

`playwright.config.ts`, lines 49-55 and 104-111:

```ts
const PORT = Number(process.env.E2E_PORT) || 1420;
const VITE_CONFIG = process.env.E2E_VITE_CONFIG ? ` --config ${process.env.E2E_VITE_CONFIG}` : "";
...
  webServer: {
    command: PORT === 1420 ? "npm run dev" : `npx vite --port ${PORT} --strictPort${VITE_CONFIG}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI && PORT === 1420,
```

`vite.config.ts` sets no `cacheDir`, so Vite's cache is `node_modules/.vite`. Worktrees link `node_modules` to one
shared folder, so two Vite servers would share and corrupt one cache. `scripts/visual-review.mjs` (lines 95-101)
already works around this with a generated config that sets `cacheDir`.

## What to build

1. New file `src/lib/testing/e2ePort.ts` exporting two pure functions (no imports beyond `node:crypto`,
   `node:path`):
   - `e2ePort(cwd: string, env: Record<string, string | undefined>): number`
     - `env.E2E_PORT` is a whole number from 1024 to 65535: that number.
     - `env.E2E_REUSE === "1"`: 1420.
     - otherwise: `1500 + (first 4 bytes of sha256 of the lower-cased, forward-slashed cwd, as an unsigned integer) % 400`,
       so 1500 to 1899. The same folder always gives the same port.
   - `e2eReuse(env): boolean`: true only when `env.E2E_REUSE === "1"` and `env.CI` is empty.
2. `playwright.config.ts`: `const PORT = e2ePort(process.cwd(), process.env)`. The server command is always
   `npx vite --port ${PORT} --strictPort${VITE_CONFIG}`, except with reuse on, where it stays `npm run dev`.
   `reuseExistingServer: e2eReuse(process.env)`. Rewrite the comment block above `PORT` to describe the new rule in
   four lines or fewer. Keep `E2E_VITE_CONFIG` working as it does.
3. `vite.config.ts`: when `process.env.E2E_CACHE_DIR` is set, use it as `cacheDir`; otherwise leave Vite's default.
   In `playwright.config.ts`, pass `E2E_CACHE_DIR` to the server through `webServer.env`, set to
   `path.join(os.tmpdir(), "chrononote-vite", String(PORT))`, unless `E2E_VITE_CONFIG` is set (the visual review
   brings its own) or reuse is on.
4. `tests/e2e/README.md`, lines 23-24: replace the sentence about reusing `:1420` with the new rule and the two
   switches (`E2E_PORT=<n>` to choose a port, `E2E_REUSE=1` to use a dev server already running on 1420).
5. `docs/briefs/RULES.md`, section "Before your final commit": change the browser-test sentence so it no longer asks
   for a port from the brief; the example becomes `npx playwright test tests/e2e/<file>.spec.ts --workers=2 --reporter=line`.

| Folder | Environment | Port | Reuses a running server |
| :--- | :--- | :--- | :--- |
| any | `E2E_PORT=1437` | 1437 | no |
| any | `E2E_REUSE=1` | 1420 | yes |
| any | `E2E_REUSE=1`, `CI=true` | 1420 | no |
| `C:\a\ChronoNote` | none | fixed value in 1500-1899 | no |
| `c:/a/chrononote` | none | the same value as the row above | no |
| `C:\a\ChronoNote-x` | none | another value (assert it differs for these two) | no |
| any | `E2E_PORT=abc` or `80` | falls through to the derived port | no |

## Out of scope

`playwright.native.config.ts`, `scripts/visual-review.mjs`, the CI workflow, `src-tauri/tauri.conf.json` (the app's
own dev server stays on 1420).

## Tests to add

`src/lib/testing/e2ePort.test.ts`: one test per table row above.

Then prove it for real. In your worktree run these two at the same moment in two shells, or one after the other if
you have one shell, and report the ports printed and the results:

```bash
npx playwright test tests/e2e/tabs.spec.ts --workers=2 --reporter=line
```

```bash
E2E_PORT=1438 npx playwright test tests/e2e/tabs.spec.ts --workers=2 --reporter=line
```

If `tests/e2e/tabs.spec.ts` does not exist, use the smallest spec file whose name starts with `tab`.

## Done when

- [ ] `npm run verify` and `npm run build` pass.
- [ ] After `npm run build`, `grep -rl "e2ePort" dist/` prints nothing (test code never ships).
- [ ] Both Playwright commands above pass.
- [ ] No file under `src/` other than the two new ones changed.

## Report

The standard report, plus the port your worktree derived and how long the first server start took.
