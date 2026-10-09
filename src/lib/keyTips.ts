/**
 * §B6: Alt key tips pure state machine reducer.
 *
 * Windows Office-style key tips: tapping Alt alone shows shortcut letters
 * on title bar commands; typing a letter invokes that command; Esc, Alt,
 * any other key, mouse click, blur, or opening an overlay dismisses tips.
 */

export interface KeyTipState {
  active: boolean;
  armed: boolean;
}

export const initialKeyTipState: KeyTipState = {
  active: false,
  armed: false,
};

export type KeyTipEvent =
  | {
      type: "altDown";
      code?: string;
      repeat?: boolean;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      metaKey?: boolean;
    }
  | {
      type: "altUp";
      code?: string;
    }
  | {
      type: "otherKeyDown";
      key: string;
    }
  | {
      type: "mouseDown";
    }
  | {
      type: "blur";
    };

export type KeyTipAction =
  | { type: "none" }
  | { type: "show" }
  | { type: "off" }
  | { type: "click"; letter: string; key: string };

export function next(
  state: KeyTipState,
  event: KeyTipEvent,
): { state: KeyTipState; action: KeyTipAction } {
  if (state.active) {
    switch (event.type) {
      case "altDown":
        return {
          state: { active: false, armed: false },
          action: { type: "off" },
        };
      case "altUp":
        return {
          state: { active: false, armed: false },
          action: { type: "none" },
        };
      case "otherKeyDown": {
        if (event.key === "Escape") {
          return {
            state: { active: false, armed: false },
            action: { type: "off" },
          };
        }
        if (/^[a-zA-Z]$/.test(event.key)) {
          const letter = event.key.toUpperCase();
          return {
            state: { active: false, armed: false },
            action: { type: "click", letter, key: letter },
          };
        }
        return {
          state: { active: false, armed: false },
          action: { type: "off" },
        };
      }
      case "mouseDown":
      case "blur":
        return {
          state: { active: false, armed: false },
          action: { type: "off" },
        };
    }
  }

  switch (event.type) {
    case "altDown": {
      const isAltLeft = !event.code || event.code === "AltLeft";
      if (!isAltLeft || event.repeat || event.ctrlKey || event.shiftKey || event.metaKey) {
        return {
          state: { active: false, armed: false },
          action: { type: "none" },
        };
      }
      return {
        state: { active: false, armed: true },
        action: { type: "none" },
      };
    }
    case "altUp": {
      const isAltLeft = !event.code || event.code === "AltLeft";
      if (isAltLeft && state.armed) {
        return {
          state: { active: true, armed: false },
          action: { type: "show" },
        };
      }
      return {
        state: { active: false, armed: false },
        action: { type: "none" },
      };
    }
    case "otherKeyDown":
      return {
        state: { active: false, armed: false },
        action: { type: "none" },
      };
    case "mouseDown":
    case "blur":
      return {
        state: { active: false, armed: false },
        action: { type: "none" },
      };
  }
}
