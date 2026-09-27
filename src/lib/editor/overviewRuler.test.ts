import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildMarkers, overviewRuler, type MarkerData } from "./overviewRuler";

describe("overviewRuler", () => {
  it("builds markers for open actions and topics, skipping resolved lines and headers", () => {
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
    // Line 7: o Open topic (topic)
    // Line 11: => # Consequence open action (action)
    expect(markers.length).toBe(3);

    expect(markers[0].type).toBe("action");
    expect(markers[0].lineNumber).toBe(1);
    expect(markers[0].items[0].text).toBe("# Open action 1");

    expect(markers[1].type).toBe("topic");
    expect(markers[1].lineNumber).toBe(7);
    expect(markers[1].items[0].text).toBe("o Open topic");

    expect(markers[2].type).toBe("action");
    expect(markers[2].lineNumber).toBe(11);
    expect(markers[2].items[0].text).toBe("  => # Consequence open action");

    view.destroy();
  });

  it("returns empty markers when document has no open actions or topics", () => {
    const doc = [
      "v Done action 1",
      "x Cancelled action",
      "Just some plain text",
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
});
