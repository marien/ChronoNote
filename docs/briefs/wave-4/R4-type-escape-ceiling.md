# Brief R4: a ceiling on type escapes

Run name `r4-type-escapes` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r4-type-escapes` · branch
`gemini/r4-type-escapes` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

An `any` or a `@ts-ignore` is the quickest way to make the type check pass, for a person or a model. About a hundred
of them exist. When this is done their number is counted the same way every time, recorded, and the check fails when
it goes up. It may go down whenever a file is touched anyway; nothing in this brief removes any.

## What exists now

- `scripts/verify.mjs` line 53: the `steps` array (`[name, command, args, cwd]`); `npm run verify` runs them before a
  push.
- `.github/workflows/test.yml` line 14: the job "Frontend (svelte-check + vitest)"; line 35 shows how a script step
  is added (`run: node scripts/test-guard.mjs ...`).
- `scripts/test-guard.mjs` with its types in `scripts/test-guard.d.mts` and its tests in `src/lib/testGuard.test.ts`:
  do the new script the same way (pure functions exported, a small `main` that reads files).
- `typescript` is a dev dependency; use its parser (`ts.createSourceFile`), not a regular expression, for `any`.

## What to build

1. `scripts/type-escapes.mjs` (+ `scripts/type-escapes.d.mts`):
   - `countEscapes(fileName, text)` returns the number of escapes in one file:
     - every `any` type node (`ts.SyntaxKind.AnyKeyword`): `let a: any`, `x as any`, `Array<any>`, `any[]`,
       `(e: any) => void` each count 1;
     - every comment directive `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` (in `//` or `/* */` comments);
     - for a `.svelte` file, only the contents of `<script lang="ts">` blocks (there can be two: `module` and
       instance), parsed as TypeScript.
   - Files: `src/**/*.ts`, `src/**/*.svelte`, `tests/**/*.ts`. Left out: `node_modules`, `src/lib/generated/`,
     `*.d.ts`.
   - Baseline file `scripts/type-escapes.baseline.json`: `{ "total": N, "files": { "<path with />": n, ... } }`, files
     sorted, only files with n > 0.
   - `node scripts/type-escapes.mjs` (check): exit 1 when the total is above the baseline's, listing each file whose
     count is above its baseline count (a new file counts from 0) with old and new numbers. When the total is below
     the baseline: exit 0 and print `type escapes: N (ceiling M); run npm run type-escapes -- --update to lower the
     ceiling`. Equal: print `type escapes: N (ceiling N)`.
   - `--update`: writes the current counts as the baseline, but refuses (exit 1, message) when the total is above the
     baseline's. Raising the ceiling means editing the JSON by hand, so it shows in the diff.
2. Write the first baseline with today's counts (there is no baseline yet: when the file is missing, `--update`
   writes it).
3. `package.json`: script `"type-escapes": "node scripts/type-escapes.mjs"`.
4. `scripts/verify.mjs`: a step `["type escapes", node, [path.join("scripts", "type-escapes.mjs")], ROOT]` right
   after "changelog index".
5. `.github/workflows/test.yml`, Frontend job: a step `- run: node scripts/type-escapes.mjs` after the install step,
   before svelte-check.
6. `docs/briefs/RULES.md`: one line in its list of rules: "Do not add `any`, `@ts-ignore` or `@ts-expect-error`.
   `npm run type-escapes` fails when their number rises (R4)." `docs/spec.md` §8 Testing Strategy: one sentence on
   the ceiling.

## Out of scope

Removing or changing any existing `any` or directive. Any other lint rule. ESLint.

## Tests to add

`src/lib/typeEscapes.test.ts` (import from `../../scripts/type-escapes.mjs` as `testGuard.test.ts` does):

| File name | Text | Count |
| :--- | :--- | :--- |
| `a.ts` | `let a: any = 1;` | 1 |
| `a.ts` | `const b = x as any;` | 1 |
| `a.ts` | `let c: Array<any>; let d: any[];` | 2 |
| `a.ts` | `function f(e: any): any {}` | 2 |
| `a.ts` | `// @ts-ignore\nfoo();` | 1 |
| `a.ts` | `/* @ts-expect-error reason */ foo();` | 1 |
| `a.ts` | `// @ts-nocheck` | 1 |
| `a.ts` | `const s = "any time"; // any old comment` | 0 |
| `a.ts` | `let anyThing: unknown; const many = 1;` | 0 |
| `a.svelte` | `<script lang="ts">let a: any;</script>\n<p>any</p>` | 1 |
| `a.svelte` | `<script context="module" lang="ts">let a: any;</script><script lang="ts">let b: any;</script>` | 2 |
| `a.svelte` | `<script>let a = 1;</script><p>as any</p>` | 0 |

And the check logic as a pure function `compare(baseline, current)` returning `{ ok, total, ceiling, rose: [{file,
before, after}] }`: equal (ok), lower (ok), higher in one file but lower in another so the total is equal (ok), a new
file with 1 (not ok, rose lists it).

## Done when

- [ ] `npm run type-escapes` passes on main's code and prints the count; the baseline file is committed.
- [ ] Adding `let z: any;` to any `src` file makes `npm run type-escapes` and `npm run verify` fail naming that file;
      undo it.
- [ ] `npx vitest run src/lib/typeEscapes` passes (all rows above).
- [ ] The CI step and the verify step are in place; `npm run verify` passes.
- [ ] The report states the count and how it compares to the 102 counted by hand on 2026-11-15 (a different way of
      counting is fine; say why it differs if it does).

## Report

The standard report from RULES.md, plus: the total, the five files with the most escapes.
