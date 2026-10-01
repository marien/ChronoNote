/**
 * Mobile / Web back-button navigation for overlays and modals.
 *
 * In web and PWA modes (especially Android navigation bar or gesture navigation),
 * users expect the hardware/gesture back button to close open drawers, dialogs,
 * or exit Zen mode before exiting the app.
 *
 * This module hooks into the browser History API:
 * 1. Whenever an overlay (modal, mobile tab drawer, folder picker, find bar, or zen mode)
 *    opens, a synthetic history entry `{ chrononoteOverlay: true }` is pushed.
 * 2. When the user triggers back navigation (firing `popstate`):
 *    - If an overlay is active, it dismisses the overlay and prevents exiting the app.
 *    - If no overlay is active, the popstate event passes through, allowing natural
 *      browser back/exit behavior.
 * 3. When an overlay is closed programmatically or via UI (e.g. Escape key, close button,
 *    or outside click), the synthetic history entry is removed via `history.back()` so
 *    the history stack stays clean.
 */

export interface BackNavState {
  hasOpenOverlay: () => boolean;
  closeActiveOverlay: () => void;
}

const OVERLAY_STATE_KEY = "chrononoteOverlay";

export interface MobileBackNavHandle {
  sync: (hasOverlay: boolean) => void;
  destroy: () => void;
}

export function wireMobileBackNavigation(state: BackNavState): MobileBackNavHandle {
  if (typeof window === "undefined" || typeof window.history === "undefined") {
    return {
      sync: () => {},
      destroy: () => {},
    };
  }

  let pushedForOverlay = false;
  let ignoreNextPopstate = false;

  // Called whenever app state changes (e.g. modal store, zenMode, mobileDrawer)
  function syncOverlayHistory(hasOverlay: boolean) {
    if (hasOverlay && !pushedForOverlay) {
      pushedForOverlay = true;
      try {
        window.history.pushState({ [OVERLAY_STATE_KEY]: true }, "");
      } catch {
        // Restricted environments
      }
    } else if (!hasOverlay && pushedForOverlay) {
      pushedForOverlay = false;
      // If the overlay closed from inside the app (e.g. X button, Escape),
      // unwind the history entry we pushed so back doesn't point to a phantom state.
      if (window.history.state && window.history.state[OVERLAY_STATE_KEY]) {
        ignoreNextPopstate = true;
        window.history.back();
      }
    }
  }

  function onPopState(e: PopStateEvent) {
    if (ignoreNextPopstate) {
      ignoreNextPopstate = false;
      return;
    }

    if (pushedForOverlay) {
      pushedForOverlay = false;
      if (state.hasOpenOverlay()) {
        state.closeActiveOverlay();
      }
    } else if (state.hasOpenOverlay()) {
      // If an overlay was somehow open without pushed state, close it
      state.closeActiveOverlay();
    }
  }

  function onOverlayChange(e: Event) {
    const custom = e as CustomEvent<{ hasOverlay: boolean }>;
    if (custom.detail && typeof custom.detail.hasOverlay === "boolean") {
      syncOverlayHistory(custom.detail.hasOverlay);
    }
  }

  window.addEventListener("popstate", onPopState);
  window.addEventListener("chrononote:overlaychange", onOverlayChange);

  return {
    sync: syncOverlayHistory,
    destroy: () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("chrononote:overlaychange", onOverlayChange);
      if (pushedForOverlay && window.history.state && window.history.state[OVERLAY_STATE_KEY]) {
        ignoreNextPopstate = true;
        window.history.back();
      }
    },
  };
}
