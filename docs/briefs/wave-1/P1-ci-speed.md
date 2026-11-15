# Brief P1: halve the wait on GitHub

Run name `p1-ci-speed` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\p1-ci-speed` · branch
`gemini/p1-ci-speed` · base `main` (after T3 is merged: both edit `test.yml`) · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. You change one file: `.github/workflows/test.yml`.

## Why

The Test workflow takes 12 to 15 minutes on every push and pull request. The Rust jobs compile everything from
nothing each time, the browser is downloaded each time, and the browser suite runs on one machine. Target: under
seven minutes for a pull request.

## What exists now

`.github/workflows/test.yml` has six jobs. Five of their NAMES are required checks on `main`. They must exist under
exactly these names after your change, or no pull request can ever merge:

```
Frontend (svelte-check + vitest)
E2E (Playwright, mock backend)
E2E layout (Windows fonts, 100/125/150%)
Prod build drops the test harness
Rust (cargo test)
```

Every `uses:` in the file is pinned to a full commit SHA with the version as a comment. Keep that for anything you add.

## What to build

1. **Rust cache** in the jobs `rust` and `native`: add `Swatinem/rust-cache` right after the `rust-toolchain` step,
   with `workspaces: src-tauri`. In `native` add `key: native` so the debug build has its own cache.
   Find the SHA to pin with:

   ```bash
   git ls-remote https://github.com/Swatinem/rust-cache "refs/tags/v2.*"
   ```

   Take the highest `v2.x.y`; when a tag has a second line ending in `^{}`, that line's SHA is the commit. Write it
   as `uses: Swatinem/rust-cache@<40-character sha> # v2.x.y`.

2. **Browser cache** in `e2e` (see step 3) and `e2e-windows-layout`: cache Playwright's browser folder with
   `actions/cache` (pin it the same way, highest `v4.x.y` or newer major if one exists), keyed on the runner OS and
   the Playwright version:

   ```yaml
         - id: pw
           shell: bash
           run: echo "version=$(node -p "require('./node_modules/@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
         - uses: actions/cache@<sha> # vX.Y.Z
           id: pwcache
           with:
             path: ${{ runner.os == 'Windows' && '~\AppData\Local\ms-playwright' || '~/.cache/ms-playwright' }}
             key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}
         - run: npx playwright install chromium
           if: steps.pwcache.outputs.cache-hit != 'true'
   ```

   These steps come after `npm ci`. In the Linux job keep the existing `sudo rm -f /etc/apt/sources.list.d/...` line
   and its comment.

3. **Split the browser suite over three machines.**
   - Rename the current job key `e2e` to `e2e-shard`, give it
     `name: E2E shard ${{ matrix.shard }}/3` and
     `strategy: { fail-fast: false, matrix: { shard: [1, 2, 3] } }`.
   - Its test step becomes `npm run test:e2e -- --shard=${{ matrix.shard }}/3`, same `env` as now.
   - `node scripts/report-flaky.mjs` stays, per shard.
   - The report upload gets a name per shard: `playwright-report-${{ matrix.shard }}`.
   - Move the performance step out of this job into a new job `perf`
     (`name: Performance budgets`, `if: github.event_name == 'push'`, same setup steps, then
     `npx playwright test --project=perf --workers=1` with `PERF: "1"`).
   - Add a new job with the key `e2e` that carries the required name and only reports the shards' result:

   ```yaml
     e2e:
       name: E2E (Playwright, mock backend)
       # The required check. The suite itself runs in the three e2e-shard jobs.
       needs: e2e-shard
       if: ${{ always() }}
       runs-on: ubuntu-latest
       steps:
         - run: test "${{ needs.e2e-shard.result }}" = "success"
   ```

4. Change nothing else: no job renamed, no step removed, the comments that explain existing steps stay.

## Out of scope

`security-audit.yml`, `dependency-review.yml`, `playwright.config.ts`, any script, the release script.

## Tests to add

None can run locally. Check the file instead:

```bash
node -e "const y=require('fs').readFileSync('.github/workflows/test.yml','utf8'); for (const n of ['Frontend (svelte-check + vitest)','E2E (Playwright, mock backend)','E2E layout (Windows fonts, 100/125/150%)','Prod build drops the test harness','Rust (cargo test)']) { const c=y.split('name: '+n+'\n').length-1; console.log(c, n); if (c!==1) process.exitCode=1 }"
```

Each line must start with `1`.

```bash
grep -n "uses:" .github/workflows/test.yml | grep -v -E "@[0-9a-f]{40} # v"
```

Only the `dtolnay/rust-toolchain@<sha> # stable` lines may be printed.

## Done when

- [ ] Both commands above give the stated result.
- [ ] The file has no tab characters and every job is indented like its neighbours.
- [ ] `git diff --stat main` lists only `.github/workflows/test.yml`.

## Report

The standard report, plus the SHAs you pinned and the tag each belongs to. The reviewer opens the pull request and
reads the real run times there; say plainly that you could not run the workflow.
