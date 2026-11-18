# Brief U4: a token reference, and a check that keeps to it

Run name `u4-tokens` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\u4-tokens` · branch `gemini/u4-tokens` ·
base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. No CSS is changed by this brief.

## Why

The app has about 5,200 lines of CSS in 17 files plus `<style>` blocks in the Svelte components, written by many
model runs. A model reaches for a literal colour or font size unless it is shown what exists. When this is done there
is a page that shows every design token, and a check that fails when the number of raw colours or font-size literals
outside the token file goes up. Like the type-escape ceiling (§502), it records today's count and only lets it fall.

## What exists now

- `src/styles/01-tokens.css`: every token as a custom property on `:root`, with dark values first, a light block
  under `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {` (line 95), `:root[data-theme="light"]`
  (line 125), pure-black variants (lines 153, 166). Families by prefix: `--surface-*`, `--edge-*`, `--state-*`,
  `--text*`, `--muted*`, `--glyph-*`, `--selected-*`, `--highlight*`, `--tab-*`, `--shadow-*`, `--font*`, `--type-*`,
  `--radius-*`, `--motion-*`, `--ease-*`, and a few more. Comments next to a token explain it.
- `scripts/type-escapes.mjs` with `scripts/type-escapes.baseline.json` and `src/lib/typeEscapes.test.ts`: the pattern
  to copy exactly (pure exported functions, baseline JSON with `total` and `files`, check / `--update`, the refusal to
  raise, wiring into `scripts/verify.mjs` and the Frontend job of `.github/workflows/test.yml`).
- Today, outside `01-tokens.css`: about 32 hex colours, 30 `rgb()`/`rgba()`, 140 `font-size` declarations with a
  `px`/`rem`/`em` number (counted roughly with grep; your count is the one that counts).

## What to build

1. `scripts/css-literals.mjs` (+ `.d.mts`), `npm run css-literals`:
   - `countLiterals(fileName, text)` returns `{ colors, fontSizes }` for one file: for `.css` the whole text, for
     `.svelte` only the `<style>` blocks. Comments (`/* */`) are ignored.
     - a colour: a hex colour (`#abc`, `#aabbcc`, `#aabbccdd`), or a `rgb(`, `rgba(`, `hsl(`, `hsla(` call, or a named
       colour from this list only: `white`, `black`, `red`, `green`, `blue`, `gray`, `grey`. Not a colour:
       `transparent`, `currentColor`, `inherit`, `var(--x)`, a hex inside `url(...)`, a word inside a selector or a
       custom property name.
     - a font size: a `font-size:` declaration (or `font:` shorthand) whose value holds a number with `px`, `rem`,
       `em` or `pt`, and is not a `var(...)` or `calc()` of only `var(...)`s.
   - Files: `src/**/*.css` and `src/**/*.svelte`, except `src/styles/01-tokens.css`.
   - Baseline `scripts/css-literals.baseline.json`: `{ "colors": N, "fontSizes": M, "files": { "<path>": { "colors":
     n, "fontSizes": m } } }`, only files with a non-zero count. Check fails when either total rises, naming the files
     that went up; `--update` lowers, refuses to raise.
   - Wire it into `scripts/verify.mjs` right after "type escapes", and into CI's Frontend job after the type-escapes
     step.
2. `scripts/tokens-page.mjs`: generates `docs/design/tokens.html` from `01-tokens.css`. One self-contained HTML file,
   no external resources: a section per family; a colour token shows a swatch with its dark and light value side by
   side (and the pure-black value when there is one); a `--type-*` or `--font*` token shows a sample line in that
   font or size; `--radius-*` a box with that radius; `--motion-*`/`--ease-*` the value as text; every token shows its
   name, values and the comment written next to it. A token whose value is `var(--other)` shows that name. Running it
   twice gives the same bytes. `--check` writes nothing and exits 1 when the page is out of date; wire `--check` into
   `scripts/verify.mjs` next to the css-literals step, so the page cannot go stale.
3. `docs/briefs/RULES.md`: one line under "How you change code": "Use the tokens in `src/styles/01-tokens.css` (see
   `docs/design/tokens.html`); `npm run css-literals` fails when raw colours or font sizes grow (U4)." Spec §3.0: one
   sentence pointing to the page.

## Out of scope

Changing any CSS or Svelte style. Moving literals into tokens. Stylelint or any new dependency.

## Tests to add

`src/lib/cssLiterals.test.ts` (import from `../../scripts/css-literals.mjs` as `typeEscapes.test.ts` does):

| File | Text | colors | fontSizes |
| :--- | :--- | :--- | :--- |
| `a.css` | `.x { color: #fff; }` | 1 | 0 |
| `a.css` | `.x { background: rgba(0, 0, 0, 0.4); border-color: #1e1e1e80; }` | 2 | 0 |
| `a.css` | `.x { color: var(--text); background: transparent; fill: currentColor; }` | 0 | 0 |
| `a.css` | `.x { font-size: 13px; } .y { font-size: 0.9em; }` | 0 | 2 |
| `a.css` | `.x { font-size: var(--type-small); } .y { font: 12px/1.4 var(--font-ui); }` | 0 | 1 |
| `a.css` | `/* #fff and font-size: 12px in a comment */ .x { color: white; }` | 1 | 0 |
| `a.css` | `#main { background: url("a.svg#fff"); }` | 0 | 0 |
| `a.svelte` | `<div style="x"></div><style>.a { color: #000; font-size: 11px; }</style>` | 1 | 1 |
| `a.svelte` | `<p>#fff 12px</p><script>const c = "#fff";</script>` | 0 | 0 |

And a test that `tokens-page.mjs`'s pure render function, given a small token CSS (two colour tokens with a light
override, one radius, one `var()` alias), outputs each name once and both values of the overridden colour.

## Done when

- [ ] `npm run css-literals` passes on main's code; the baseline is committed; adding `color: #123456;` to any
      `src/styles` file makes it and `npm run verify` fail naming that file (undo it).
- [ ] `docs/design/tokens.html` is committed, opens in a browser without network, and `node scripts/tokens-page.mjs
      --check` passes; changing a token value in `01-tokens.css` makes `--check` fail (undo it).
- [ ] `npx vitest run src/lib/cssLiterals` passes (every row above).
- [ ] No `any`, `@ts-ignore` or `@ts-expect-error` added; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: both totals, the five files with the most literals, and the number of tokens
on the page per family.
