import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildMarkers, overviewRuler, type MarkerData } from "./overviewRuler";

describe("overviewRuler", () => {
  it("builds markers for open actions, skipping agenda topics, resolved lines, and headers", () => {
    const doc = [
      "# Open action 1",
      "v Done action",
      "> Deferred action",
      "x Won't do action",
      "Heading title",
      "=============",
      "o Open topic",
      ". Discussed topic",
      ", Postponed topic",
      "Prose text line",
      "  => # Consequence open action",
    ].join("\n");

    const state = EditorState.create({ doc });
    const view = new EditorView({ state });

    const markers = buildMarkers(view, 500);

    // Should include:
    // Line 1: # Open action 1 (action)
    // (Line 7: o Open topic is a topic, so it must NOT be included)
    // Line 11: => # Consequence open action (action)
    expect(markers.length).toBe(2);

    expect(markers[0].type).toBe("action");
    expect(markers[0].lineNumber).toBe(1);
    expect(markers[0].items[0].text).toBe("# Open action 1");

    expect(markers[1].type).toBe("action");
    expect(markers[1].lineNumber).toBe(11);
    expect(markers[1].items[0].text).toBe("  => # Consequence open action");

    view.destroy();
  });

  it("returns empty markers when document has no open actions (even if open topics exist)", () => {
    const doc = [
      "v Done action 1",
      "x Cancelled action",
      "Just some plain text",
      "o Open topic but not an action",
      ". Discussed topic",
    ].join("\n");

    const state = EditorState.create({ doc });
    const view = new EditorView({ state });

    const markers = buildMarkers(view, 500);
    expect(markers).toEqual([]);

    view.destroy();
  });

  it("does not treat setext header titles starting with # as actions", () => {
    const doc = [
      "# Header title that happens to start with hash",
      "==============================================",
      "Some content",
      "# Real action",
    ].join("\n");

    const state = EditorState.create({ doc });
    const view = new EditorView({ state });

    const markers = buildMarkers(view, 500);
    expect(markers.length).toBe(1);
    expect(markers[0].lineNumber).toBe(4);
    expect(markers[0].items[0].text).toBe("# Real action");

    view.destroy();
  });

  it("clusters items that map to the same topPx coordinate", () => {
    const doc = [
      "# Action 1",
      "# Action 2",
    ].join("\n");

    const state = EditorState.create({ doc });
    const view = new EditorView({ state });

    // With a tiny track height of 3px, lines 1 and 2 map to topPx 0
    const markers = buildMarkers(view, 3);
    expect(markers.length).toBe(1);
    expect(markers[0].items.length).toBe(2);
    expect(markers[0].items[0].lineNumber).toBe(1);
    expect(markers[0].items[1].lineNumber).toBe(2);

    view.destroy();
  });

  it("mounts ruler DOM element in view.dom and cleans up on destroy", () => {
    const doc = ["# Action 1", "# Action 2"].join("\n");
    const state = EditorState.create({
      doc,
      extensions: [overviewRuler()],
    });
    const view = new EditorView({ state });

    const rulerEl = view.dom.querySelector(".cm-overview-ruler");
    expect(rulerEl).not.toBeNull();
    expect(rulerEl?.getAttribute("aria-hidden")).toBe("true");

    view.destroy();
    expect(view.dom.querySelector(".cm-overview-ruler")).toBeNull();
  });

  it("is not visible initially, shows on scroll when scrollable, and hides after 3s", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    const doc = Array.from({ length: 100 }, (_, i) => `# Action ${i + 1}`).join("\n");
    const state = EditorState.create({
      doc,
      extensions: [overviewRuler()],
    });
    const view = new EditorView({ state });

    const rulerEl = view.dom.querySelector(".cm-overview-ruler") as HTMLElement;
    expect(rulerEl.classList.contains("cm-ruler-visible")).toBe(false);

    // Mock scrollable dimensions
    Object.defineProperty(view.scrollDOM, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(view.scrollDOM, "clientHeight", { value: 500, configurable: true });

    // Trigger scroll
    view.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(rulerEl.classList.contains("cm-ruler-visible")).toBe(true);

    // Advance 1.5 seconds — still visible
    vi.advanceTimersByTime(1500);
    expect(rulerEl.classList.contains("cm-ruler-visible")).toBe(true);

    // Scroll again — resets timer
    view.scrollDOM.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1500);
    expect(rulerEl.classList.contains("cm-ruler-visible")).toBe(true);

    // Advance past 3 seconds total from last scroll
    vi.advanceTimersByTime(1501);
    expect(rulerEl.classList.contains("cm-ruler-visible")).toBe(false);

    view.destroy();
    vi.useRealTimers();
  });

  it("does not show markers on scroll if document has no scrollbar", () => {
    const doc = ["# Action 1", "# Action 2"].join("\n");
    const state = EditorState.create({
      doc,
      extensions: [overviewRuler()],
    });
    const view = new EditorView({ state });

    const rulerEl = view.dom.querySelector(".cm-overview-ruler") as HTMLElement;

    // Content fits without scrollbar
    Object.defineProperty(view.scrollDOM, "scrollHeight", { value: 200, configurable: true });
    Object.defineProperty(view.scrollDOM, "clientHeight", { value: 500, configurable: true });

    view.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(rulerEl.classList.contains("cm-ruler-visible")).toBe(false);

    view.destroy();
  });
});
