// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyLineEdits } from "../editor/commands";
import { createTestEditor, type TestEditor } from "./testEditor";

const editors: TestEditor[] = [];

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

describe("applyLineEdits", () => {
  it("replaces three lines in one transaction so a single undo restores all three", () => {
    const doc = [
      "Coffee rota",
      "===========",
      "# ask @dana about cups",
      "plain line",
      "# (budget) remind @Dana",
    ].join("\n");

    const ed = createTestEditor({ doc });
    editors.push(ed);

    applyLineEdits(ed.view, [
      { lineIdx: 0, text: "Hospitality rota" },
      { lineIdx: 2, text: "# ask @Dana-S about cups" },
      { lineIdx: 4, text: "# (finance) remind @Dana-S" },
    ]);

    expect(ed.text()).toBe(
      [
        "Hospitality rota",
        "===========",
        "# ask @Dana-S about cups",
        "plain line",
        "# (finance) remind @Dana-S",
      ].join("\n"),
    );

    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(doc);
  });
});
