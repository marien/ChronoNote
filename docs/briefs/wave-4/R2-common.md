# R2: rules shared by the file-split briefs (R2b-R2g)

Every R2 brief points here. Read `docs/briefs/RULES.md` first; this file adds to it.

## The goal

The implementers are cheap models. Measured on earlier runs, one re-read `mockBackend.ts` 22 times and `storage.rs`
16 times. A large file is split into a folder of smaller files by topic so later briefs read less. Nothing a user sees,
and nothing a test checks, may change. R2a (`storage.rs`, §511) is the model: moves, re-exports, proof.

## Allowed

1. **Move** a function, constant, type or block to a new file, unchanged: same body, same doc comment, same name. Only
   imports, `export` and (for TypeScript) the module-level state it needs come with it.
2. **Re-export** from the old file so every existing `import ... from "<old path>"` keeps working. No file outside the
   brief's folder may change its imports, unless the brief says so.
3. **Module-level state** (`let` at the top of a module, a store, a timer) moves to exactly one new file and is shared
   through exported getters/setters or the store; never duplicated. Say in the report which state moved where.
4. **Svelte components:** a self-contained region of markup moves into a child component in a folder named after the
   parent (for example `src/lib/components/topbar/TabStrip.svelte`) with:
   - the CSS rules that style it moved along (Svelte scopes styles per component); a parent rule that reaches into
     the moved region is moved too, or the brief's report says why it had to become `:global(...)`;
   - the same DOM: no extra wrapper element, same element types, classes, ids, `data-testid`, ARIA attributes and
     order; `bind:this` targets still bound (pass a callback or use `bind:` on a prop);
   - props passed explicitly, `$bindable` only where the parent already wrote the value back;
   - event handlers and `$effect`s that belong to the region move with it; ones that also touch the rest stay in the
     parent.
   Pure helpers in a component's `<script>` (no `$state`, no `$props`) may move to a sibling `.ts` file.
5. Formatting by hand like the surrounding code (no Prettier: the project declined it).

## Not allowed

Renaming, rewording comments, changing logic, changing CSS values, adding features, adding `any`, `@ts-ignore` or
`@ts-expect-error` (`npm run type-escapes` must pass with the ceiling unchanged), moving a test's expectations.

## Proof that it is a move (in the report)

- `git diff --stat main`: only the brief's file and folder (plus re-export lines).
- Sorted-line comparison: all lines of the old file against all lines of the new files, sorted, diffed. Every
  difference must be an import/export line, a component tag `<X ... />` that replaces moved markup, a prop declaration,
  indentation, or a blank line. Paste the count and every other differing line.
- `npm run check`, `npm run check:e2e`, `npm test`, `npm run type-escapes`, `npm run css-literals` pass.
- The browser spec files the brief names pass (your checkout gets its own port). GitHub runs the full browser suite,
  including the Windows-fonts layout job, on the pull request.

## Size target

No new file over 600 lines; the old file under 600 lines. Say which file misses the target and why.
