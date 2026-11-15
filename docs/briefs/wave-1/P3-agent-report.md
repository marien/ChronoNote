# Brief P3: one command that ends every run the same way

Run name `p3-agent-report` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\p3-agent-report` · branch
`gemini/p3-agent-report` · base `main` (after T3 is merged: this uses its scanner) · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

Every coder run ends with a report written by the coder. The facts in it (which checks passed, which files changed,
whether tests disappeared) should come from a command, so reports are comparable and cannot be optimistic.

## What exists now

- `scripts/verify.mjs`: runs the secret scan, svelte-check, the e2e type check, Vitest, and cargo test + clippy when
  Rust changed. Prints one `verify: ok   <name> (N s)` or `verify: FAIL <name>` line per step and exits 1 on failure.
- `scripts/test-guard.mjs` (from brief T3): exports `scanTests(source)`, and as a command lists removed and
  switched-off tests against a base.

## What to build

`scripts/agent-report.mjs`, no dependencies, and `"agent:report": "node scripts/agent-report.mjs"` in `package.json`.

`node scripts/agent-report.mjs [--base <ref>] [--no-verify]` prints, in this order and this shape:

```
## Agent report
branch: gemini/x  base: main (merge base abc1234)  head: def5678  clean tree: yes
commits (2):
  def5678 Add the hold hook to the mock backend
  0a1b2c3 Test rule 4.2
files changed (3): +120 -8
  M src/lib/testing/mockBackend.ts  +41 -0
  A src/lib/testing/mockBackend.hold.test.ts  +52 -0
  M tests/e2e/editor-batch1.independent.spec.ts  +27 -8
outside the usual places: none
tests: +5 added, 0 removed, 0 more switched off
checks:
  verify: ok   secret scan
  verify: ok   svelte-check (41 s)
  ...
result: PASS
```

- `--base` defaults to `main`. Commits and files are those between the merge base and `HEAD`; if the tree is not
  clean, say `clean tree: no (N files)` and list them under `uncommitted:`.
- "outside the usual places" lists changed paths that match any of: `docs/CHANGELOG.md`, `docs/changelog/`,
  `website/webapp/`, `website/demo-app/`, `CLAUDE.local.md`, `package-lock.json`, `src-tauri/Cargo.lock`,
  `.github/`. It is information, not a failure.
- "tests" compares the titles in test files (`src/**/*.test.ts`, `tests/**/*.spec.ts`) at the merge base and now,
  with `scanTests`. Removed titles are listed one per line under it.
- "checks" runs `node scripts/verify.mjs` and repeats its `verify:` lines; with `--no-verify` it prints
  `checks: skipped (--no-verify)`.
- `result:` is `PASS` when verify passed (or was skipped), the tree is clean and no test was removed or switched off;
  otherwise `FAIL: <the reasons, comma separated>`. Exit code 0 for PASS, 1 for FAIL.

Then edit `docs/briefs/RULES.md`, section "Your plan file and your report": the report now starts with the full
output of `npm run agent:report`, followed by points 4 and 5 of the existing list (existing tests changed and why;
what you were unsure about). Remove points 1-3, which the command now covers.

## Out of scope

Running Playwright from this command. Changing `verify.mjs` or `test-guard.mjs`.

## Tests to add

`src/lib/agentReport.test.ts`: export the pure function that turns collected facts (branch, commits, file stats,
test differences, verify lines, clean flag) into the report text and the result, and test: a clean passing run; a
removed test gives `FAIL: 1 test removed`; a dirty tree gives `FAIL: uncommitted changes`; both together list both
reasons; a path under `.github/` appears under "outside the usual places".

## Done when

- [ ] `npm run verify` passes.
- [ ] `npm run agent:report` in your worktree, after your commit, prints `result: PASS`.
- [ ] Your final report starts with that output.

## Report

As RULES.md now says.
