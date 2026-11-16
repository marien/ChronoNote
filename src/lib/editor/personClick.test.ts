// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMac } from "../platform";
import { createTestEditor, type TestEditor } from "../testing/testEditor";
import { assigneeAtCol, personClickPlugin } from "./personClick";

const editors: TestEditor[] = [];

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

describe("assigneeAtCol", () => {
  it("finds the assignee token covering col and ignores non-assignee text", () => {
    const line = "# ask @Dana x";
    expect(assigneeAtCol(line, 2)).toBeNull(); // 'a' of ask
    expect(assigneeAtCol(line, 5)).toBeNull(); // space before @
    expect(assigneeAtCol(line, 6)).toBe("Dana"); // '@'
    expect(assigneeAtCol(line, 8)).toBe("Dana"); // 'n'
    expect(assigneeAtCol(line, 11)).toBe("Dana"); // end of @Dana
    expect(assigneeAtCol(line, 12)).toBeNull(); // 'x'
  });

  it("picks the right assignee in a list and skips title lines", () => {
    const list = "o rota (@Ruth, @dana)";
    expect(assigneeAtCol(list, 9)).toBe("Ruth");
    expect(assigneeAtCol(list, 17)).toBe("dana");
    expect(assigneeAtCol("# ask @Dana x", 7, { title: true })).toBeNull();
  });
});

describe("personClickPlugin", () => {
  it("calls callback on Ctrl+mousedown over @Dana, ignores plain mousedown and Ctrl+mousedown on ask", () => {
    const onOpen = vi.fn();
    const ed = createTestEditor({
      doc: "# ask @Dana x",
      ui: { afterFilters: [personClickPlugin(onOpen)] },
    });
    editors.push(ed);

    // jsdom has no layout geometry; map clientX directly to a document column.
    ed.view.posAtCoords = (({ x }: { x: number; y: number }) => x) as typeof ed.view.posAtCoords;
    const modKey = isMac ? { metaKey: true } : { ctrlKey: true };

    const plainOnDana = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 8,
      clientY: 0,
    });
    ed.view.contentDOM.dispatchEvent(plainOnDana);
    expect(onOpen).not.toHaveBeenCalled();

    const modOnAsk = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 3,
      clientY: 0,
      ...modKey,
    });
    ed.view.contentDOM.dispatchEvent(modOnAsk);
    expect(onOpen).not.toHaveBeenCalled();

    const modOnDana = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 8,
      clientY: 0,
      ...modKey,
    });
    ed.view.contentDOM.dispatchEvent(modOnDana);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("Dana");
    expect(modOnDana.defaultPrevented).toBe(true);
  });
});
