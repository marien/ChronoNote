# Brief T3: a guard against deleted tests

Run name `t3-test-guard` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t3-test-guard` · branch
`gemini/t3-test-guard` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

A coder once deleted eight existing tests to get a green run. It was caught only because the reviewer read the whole
diff. From now on a pull request that removes or switches off a test fails its check, unless its description says
which and why.

## What exists now

- Tests: `src/**/*.test.ts` (Vitest) and `tests/**/*.spec.ts` (Playwright). About 3,900 call sites of `it(`, `test(`
  and their `.each` / `.skip` / `.fixme` / `.todo` forms.
- `.github/workflows/test.yml`, job `frontend` (lines 13-35): checkout with `persist-credentials: false`, Node 24,
  `node scripts/secret-scan.mjs --no-history`, `npm ci`, `npm run check`, `npm test`.
- `scripts/secret-scan.mjs` is the style to follow for a small Node script with no dependencies.

## What to build

1. `scripts/test-guard.mjs`, no dependencies, with one exported function and a command line.

   `scanTests(source: string): { titles: string[], off: number }`
   - `titles`: the first string argument of every `it(`, `test(`, `it.each(...)(`, `test.each(...)(`,
     `test.describe(` and `describe(` call whose first argument is a plain string or a template string without `${`.
     Quotes may be `"`, `'` or a backtick. A call inside a line comment is ignored.
   - `off`: the number of `.skip(`, `.fixme(` and `.todo(` calls whose first argument is a string (so a conditional
     `test.skip(!RUNNABLE, "…")`, whose first argument is not a string, does not count).

   Command line: `node scripts/test-guard.mjs [--base <ref>] [--allow "<reason>"]`
   - `--base` defaults to `origin/main`. Compare the merge base of `<ref>` and `HEAD` with the working tree.
   - For every test file that exists at the base (`git ls-tree -r --name-only`, read with `git show <base>:<path>`):
     - the file is gone and none of its titles appear in any test file now: every title is "removed";
     - a title that was in the file and is now in no test file at all is "removed" (a title that moved to another
       file is fine);
     - `off` for the file is higher than at the base: report "N more switched off in <file>".
   - Print a list: `removed: <file> › <title>`, and the switched-off lines. Then:
     - nothing found: print `test-guard: ok (N test files, M titles)` and exit 0;
     - something found and an allowance is present: print the list, then
       `test-guard: allowed: <reason>` and exit 0;
     - something found, no allowance: print the list, then how to allow it, and exit 1.
   - The allowance is `--allow "<reason>"` or the environment variable `TEST_GUARD_PR_BODY` containing a line that
     starts with `Tests removed:` followed by at least ten characters of reason.

2. `.github/workflows/test.yml`, job `frontend` only:
   - the checkout step gets `fetch-depth: 0` next to `persist-credentials: false`;
   - a new step right after the secret scan, pull requests only:

   ```yaml
         # T3: a pull request may not remove or switch off tests without saying so ("Tests removed: <why>" in its description).
         - run: node scripts/test-guard.mjs --base "origin/${{ github.base_ref }}"
           if: github.event_name == 'pull_request'
           env:
             TEST_GUARD_PR_BODY: ${{ github.event.pull_request.body }}
   ```

   Do not rename the job or any other job: the names are required checks.

3. `package.json`: script `"test:guard": "node scripts/test-guard.mjs"`.

## Out of scope

Rows of data tables inside a test (a row removed from an array is not seen by this guard; that is known and accepted).
`scripts/verify.mjs`. Any other workflow file.

## Tests to add

`src/lib/testGuard.test.ts`, importing `scanTests` from `../../scripts/test-guard.mjs`:

| Source | titles | off |
| :--- | :--- | :--- |
| `it("adds", () => {})` | `["adds"]` | 0 |
| `test('a', async ({ page }) => {})` and ``test(`b`, …)`` | `["a", "b"]` | 0 |
| ``it(`row ${i}`, …)`` | `[]` | 0 |
| `it.each([[1]])("case %i", …)` | `["case %i"]` | 0 |
| `test.describe("Rule 4", () => { test("4.1", …) })` | `["Rule 4", "4.1"]` | 0 |
| `test.fixme("later", async () => {})` | `["later"]` | 1 |
| `test.skip(!RUNNABLE, "needs the build")` | `[]` | 0 |
| `// it("old", …)` | `[]` | 0 |

Then try the command for real in your worktree, and put the output of each in your report:

1. Unchanged tree: `node scripts/test-guard.mjs` exits 0.
2. Delete one `it(...)` block from any test file (do not commit this): exits 1 and names the title. Restore the file.
3. Same deletion with `--allow "trying the guard"`: exits 0 and still prints the title. Restore the file.

## Done when

- [ ] `npm run verify` passes.
- [ ] The three trial runs behave as described and the tree is clean afterwards (`git status --porcelain` shows only your intended changes).
- [ ] `git diff main -- .github/workflows/test.yml` shows only the two changes in the `frontend` job.

## Report

The standard report, plus the counts the guard prints on the unchanged tree and how long it takes.
