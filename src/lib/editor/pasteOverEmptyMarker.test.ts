import { describe, expect, it } from "vitest";
import { rewritePasted } from "./pasteOverEmptyMarker";
import { currentDateISO } from "../stores";
import { get } from "svelte/store";

describe("rewritePasted", () => {
  it("rewrites due words in pasted actions", () => {
    currentDateISO.set("2026-10-22");
    // # call by:tomorrow -> # call by:2026-10-23
    expect(rewritePasted("# call by:tomorrow")).toBe("# call by:2026-10-23");
    // # call by:fri (Thursday today -> Friday is 2026-10-23)
    expect(rewritePasted("# call by:fri")).toBe("# call by:2026-10-23");
    // # x by:tomorrow
    expect(rewritePasted("# x by:tomorrow")).toBe("# x by:2026-10-23");
  });

  it("leaves unknown words and plain lines untouched", () => {
    expect(rewritePasted("# call by:foo")).toBe("# call by:foo");
    expect(rewritePasted("plain text by:tomorrow")).toBe("plain text by:tomorrow");
  });
});
