# Svelte runes in the three big drawers

Status: proposal, 2026-10-07. Waiting for Marien's approval.

## Problem

The app runs on Svelte 5 but every component uses the legacy syntax (`export let`, `$:`), and there are no runes
anywhere. Legacy `$:` blocks are ordered by the variables Svelte can *see* being assigned, which has caused
real bugs more than once:

- §55/§56 and §61/§62: a `$:` block calling async code that awaited `tick()` re-triggered itself (a UI freeze).
- §215 and §270: Section History opened on the right date tab but showed the first occurrence, because an index
  was assigned inside a helper called from a `$:` block, so a dependent block ran with the old value.

The three components with the most reactive blocks carry most of this risk:

| Component | Lines | `$:` blocks |
|---|---|---|
| `HistoryModal.svelte` | 723 | 15 |
| `ActionDrawerModal.svelte` | 368 | 13 |
| `SearchModal.svelte` | 345 | 11 |

## Proposal

Convert these three components to runes mode (Svelte 5 allows it per component; the rest of the app stays as
it is):

- `export let x` → `let { x } = $props()`.
- A `$:` that computes a value → `const y = $derived(...)` (or `$derived.by(() => …)` for multi-statement).
  Derived values have no ordering problem: they are computed on read.
- A `$:` that causes a side effect (scrolling into view, focusing, loading) → `$effect(() => …)`, written so it
  reads only what it depends on. Async work inside an effect is started, never awaited from the effect itself.
- Local state that changes → `let z = $state(...)`.
- Svelte stores keep working unchanged (`$tabs` etc. still auto-subscribe in runes mode), so nothing outside
  the three files changes.
- `on:click` → `onclick` inside these files.

## Migration plan

One component per branch, smallest first: `SearchModal`, then `ActionDrawerModal`, then `HistoryModal`.
For each:

1. Before converting, list every `$:` block and classify it (derived value / side effect), in the PR
   description. This list is what the reviewer checks against.
2. Convert. No behaviour change intended.
3. Gates: the existing Playwright specs cover these drawers well (`search-and-history.spec.ts` alone is 1,220
   lines; `action-drawer*.spec.ts`, `drawers.spec.ts`, `modal-a11y.spec.ts`). Add one regression test per
   component for the ordering bug it has had (History: opening from a later occurrence shows that
   occurrence's body).

## Risks

- `$effect` timing differs from `$:` (effects run after the DOM update). Focus and scroll code that relied on
  running before paint may need `$effect.pre`.
- Mixed-mode quirks at component boundaries (a legacy parent passing props to a runes child) are supported, but
  `bind:` to a runes child prop needs `$bindable()`.

## Not proposed

Converting the whole app. `TopBar.svelte` (10 blocks) and `App.svelte` (6) would be next if this goes well.
