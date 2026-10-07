# One model for overlay state

Status: proposal, 2026-10-07. Waiting for Marien's approval.

## Problem

What is open on top of the editor is spread over several stores:

- `modal` in `stores.ts`: one of 17 kinds (`ModalKind`), only one at a time.
- Separate booleans: `findOpen`, `mobileTabDrawerOpen`, `oneDriveFolderPickerOpen`, `syncHealthPopoverOpen`.
- Modes: `isZenMode`, `peekMode`.

The rules for how they combine are hand-written in several places:

- `App.svelte`'s `dismissTopOverlayAndReturnTrue` decides what Escape closes, in a fixed order of `if`s.
- A capture-phase listener (`noteEscapeStart`) remembers whether *anything* was open when Escape went down,
  because a modal closes itself in its own handler before the window handler runs (the §274 bug: Esc on a
  drawer also ended Zen).
- Some overlays sit on top of others without the model knowing: the OneDrive folder picker opens over
  Settings; `cancelDirectorySwitch` returns to Settings by setting `modal` back to `"settings"` by hand.
- The mobile Back button (`mobileNavigation.ts`) needs its own `hasOpenOverlay`/`closeActiveOverlay` pair.
- Opening any modal by shortcut ends Peek (§274) through yet another path.

Each new overlay has to be added to every one of these places.

## Proposal

An overlay **stack** in a new `src/lib/overlays.ts`:

```ts
export type OverlayKind = ModalKind | "find" | "mobileTabs" | "folderPicker" | "syncHealth";

interface Overlay {
  kind: OverlayKind;
  dismissable: boolean;     // false for "conflict": needs an explicit choice
  onDismiss?: () => void;   // e.g. "unsavedScratchpads" cancels the pending close or folder switch
}

export const overlays = writable<Overlay[]>([]);
export function openOverlay(o: Overlay): void;   // push (replacing an existing entry of the same kind)
export function closeOverlay(kind: OverlayKind): void;
export function dismissTop(): boolean;           // what Escape and mobile Back call
export const topOverlay = derived(overlays, (s) => s.at(-1) ?? null);
```

- Escape: `dismissTop()`. If the stack was non-empty when the key went down, Escape never also ends Zen or
  Peek. That rule now lives in one function instead of a capture-phase flag.
- Mobile Back: the same `dismissTop()`.
- "Folder picker over Settings" and "back to Settings after cancelling a folder switch" fall out of the
  stack: closing the top shows what was under it.
- Zen and Peek stay as modes (they are not overlays), but `openOverlay` is the one place that ends Peek.

### Compatibility during the move

`modal` becomes a derived store: the kind of the top-most entry that is a `ModalKind`, or `"none"`. Every
component that reads `$modal` keeps working; writers move to `openOverlay`/`closeOverlay` one module at a time.
`findOpen` and the other booleans become derived the same way until their writers have moved.

## Migration plan

1. `overlays.ts` with unit tests (push, replace, dismiss order, non-dismissable entries, `onDismiss`).
2. Derive `modal` and the four booleans from it; keep their `set` working through thin wrappers that call
   `openOverlay`/`closeOverlay`, so nothing else changes yet. Full Playwright run.
3. Replace `dismissTopOverlayAndReturnTrue`, `noteEscapeStart` and the mobile-Back pair with `dismissTop()`.
   Existing specs: `zen-mode.spec.ts` (Escape priority), `back-navigation.spec.ts`, `modal-system.spec.ts`,
   `modal-a11y.spec.ts`, `peek.spec.ts`.
4. Move writers off the wrappers module by module; remove the wrappers.

## Risks

- Two overlays are legitimately open together today (folder picker over Settings). The stack must render both;
  only the top one gets keyboard focus (the existing focus trap already handles this per component).
- Behaviour must not change in step 2: it is a refactor with a compatibility layer, verified by the full
  Playwright suite before any writer moves.
