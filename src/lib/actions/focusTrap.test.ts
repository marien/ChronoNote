import { describe, it, expect, afterEach } from "vitest";
import { focusTrap } from "./focusTrap";

const live: Array<{ destroy(): void }> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.innerHTML = "";
});

function setup(innerHTML: string) {
  // Stand in for the CodeMirror editor — `focusTrap` restores focus here
  // (or to whatever `.cm-editor` descendant held it) on destroy.
  const cmEditor = document.createElement("div");
  cmEditor.className = "cm-editor";
  const cmContent = document.createElement("div");
  cmContent.className = "cm-content";
  cmContent.tabIndex = 0;
  cmEditor.appendChild(cmContent);
  document.body.appendChild(cmEditor);
  cmContent.focus(); // pretend focus was in the editor when the modal opened

  const card = document.createElement("div");
  card.innerHTML = innerHTML;
  document.body.appendChild(card);
  const action = focusTrap(card);
  live.push(action);
  const buttons = [...card.querySelectorAll("button")] as HTMLButtonElement[];
  return { card, action, buttons, outside: cmContent };
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

  it("restores focus to the editor on destroy when that's where it came from", () => {
    const { card, action, buttons, outside } = setup("<button>a</button>");
    buttons[0].focus();
    action.destroy();
    card.remove();
    expect(document.activeElement).toBe(outside); // the .cm-content stand-in
  });

  it("sends focus to the editor even when the modal was opened from a top-bar button", () => {
    // A button that isn't inside .cm-editor / .overlay — e.g. a TopBar icon —
    // held focus when the modal opened.
    const toolbarBtn = document.createElement("button");
    toolbarBtn.textContent = "📅";
    document.body.appendChild(toolbarBtn);
    toolbarBtn.focus();

    const { card, action } = setup("<button>a</button>");
    // `setup` focuses .cm-content; simulate the click having moved focus
    // to the toolbar button *before* the trap captured it — re-run capture.
    action.destroy();
    live.pop();
    toolbarBtn.focus();
    const action2 = focusTrap(card);
    live.push(action2);

    action2.destroy();
    card.remove();
    expect(document.activeElement).toBe(document.querySelector(".cm-content"));
    toolbarBtn.remove();
  });

  it("stops trapping after destroy (no leaked listener)", () => {
    const { card, action, buttons } = setup("<button>a</button><button>b</button>");
    action.destroy();
    buttons[1].focus();
    const e = tab(card);
    expect(e.defaultPrevented).toBe(false);
  });
});
