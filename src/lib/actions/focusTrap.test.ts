import { describe, it, expect, afterEach } from "vitest";
import { focusTrap } from "./focusTrap";

const live: Array<{ destroy(): void }> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.innerHTML = "";
});

function setup(innerHTML: string) {
  const outside = document.createElement("button");
  outside.textContent = "editor stand-in";
  document.body.appendChild(outside);
  outside.focus(); // pretend focus was on the editor when the modal opened

  const card = document.createElement("div");
  card.innerHTML = innerHTML;
  document.body.appendChild(card);
  const action = focusTrap(card);
  live.push(action);
  const buttons = [...card.querySelectorAll("button")] as HTMLButtonElement[];
  return { card, action, buttons, outside };
}

function tab(node: HTMLElement, shift = false) {
  const e = new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, cancelable: true, bubbles: true });
  node.dispatchEvent(e);
  return e;
}

describe("focusTrap", () => {
  it("wraps Tab from the last focusable back to the first", () => {
    const { card, buttons } = setup("<button>a</button><button>b</button><button>c</button>");
    buttons[2].focus();
    const e = tab(card);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("wraps Shift+Tab from the first focusable back to the last", () => {
    const { card, buttons } = setup("<button>a</button><button>b</button><button>c</button>");
    buttons[0].focus();
    const e = tab(card, true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("leaves Tab alone in the middle of the list", () => {
    const { card, buttons } = setup("<button>a</button><button>b</button><button>c</button>");
    buttons[1].focus();
    const e = tab(card);
    expect(e.defaultPrevented).toBe(false);
  });

  it("swallows Tab when the modal has no focusables", () => {
    const { card } = setup("<p>just text</p>");
    const e = tab(card);
    expect(e.defaultPrevented).toBe(true);
  });

  it("ignores disabled and hidden controls", () => {
    const { card, buttons } = setup(
      '<button>a</button><button disabled>skip</button><button hidden>skip2</button><button>b</button>',
    );
    buttons[3].focus(); // "b" — the real last one
    tab(card);
    expect(document.activeElement).toBe(buttons[0]); // wrapped to "a", not a skipped one
  });

  it("restores focus to the previously-focused element on destroy", () => {
    const { card, action, buttons, outside } = setup("<button>a</button>");
    buttons[0].focus();
    action.destroy();
    card.remove();
    expect(document.activeElement).toBe(outside);
  });

  it("stops trapping after destroy (no leaked listener)", () => {
    const { card, action, buttons } = setup("<button>a</button><button>b</button>");
    action.destroy();
    buttons[1].focus();
    const e = tab(card);
    expect(e.defaultPrevented).toBe(false);
  });
});
