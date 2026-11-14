// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { dueDatesPlugin } from "./dueDates";
import { allNotesCache, currentDateISO, tabs } from "../stores";
import { countOverdue, countUpcoming, dueItems, withDueDate } from "../tokens";
import { _resetMemoForTest, dueSummary, groupByDue } from "../dueOverview";
import { withToLink } from "../paste";

describe("Rule 4 (D10): impossible due dates and unknown due words", () => {
  it("marks by:2026-02-30, by:2026-13-01 and by:fridy with cm-due-unknown while leaving by:fri and by:tomorrow unmarked", () => {
    currentDateISO.set("2026-11-14");
    const doc = [
      "# invalid feb by:2026-02-30",
      "# invalid month by:2026-13-01",
      "# typo word by:fridy",
      "# valid word by:fri",
      "# valid word 2 by:tomorrow",
      "caret line",
    ].join("\n");

    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [dueDatesPlugin],
      }),
    });

    const unknownSpans: { text: string; title: string }[] = [];
    const validDueSpans: string[] = [];
    const plugin = view.state.facet(EditorView.decorations);
    for (const f of plugin) {
      const set = typeof f === "function" ? f(view) : f;
      set.between(0, doc.length, (from, to, val) => {
        const cls = val.spec.class ?? "";
        if (cls.includes("cm-due-unknown")) {
          unknownSpans.push({
            text: doc.slice(from, to),
            title: (val.spec.attributes as Record<string, string>)?.title ?? "",
          });
        } else if (cls.includes("cm-due")) {
          validDueSpans.push(doc.slice(from, to));
        }
      });
    }

    expect(unknownSpans.map((u) => u.text)).toEqual(["by:2026-02-30", "by:2026-13-01", "by:fridy"]);
    for (const u of unknownSpans) {
      expect(u.title).toMatch(/Not a date/);
    }
    expect(validDueSpans).toEqual([]);
    view.destroy();
  });

  it("wavy-underlined dates are never treated as due dates in counts or due overview", () => {
    const today = "2026-11-14";
    _resetMemoForTest();
    currentDateISO.set(today);
    tabs.set([]);
    const text = [
      "# bad feb by:2026-02-30",
      "# bad month by:2026-13-01",
      "# typo by:fridy",
      "# real by:2026-11-15",
    ].join("\n");

    expect(dueItems(text).filter((i) => i.date !== undefined).map((i) => i.date)).toEqual(["2026-11-15"]);
    expect(countOverdue(text, today)).toBe(0);
    expect(countUpcoming(text, today, 7)).toBe(1);

    allNotesCache.set({ "2026-11-14.txt": text });
    const summary = get(dueSummary);
    expect({ overdue: summary.overdue, dueToday: summary.dueToday, upcoming: summary.upcoming }).toEqual({
      overdue: 0,
      dueToday: 0,
      upcoming: 1,
    });
    const groups = groupByDue(
      text.split("\n").map((line, lineIdx) => ({ filename: "2026-11-14.txt", lineIdx, line })),
      today,
    );
    expect(groups.flatMap((g) => g.items).map((i) => i.dueDate)).toEqual(["2026-11-15"]);
    allNotesCache.set({});
  });

  it("keeps balanced forward-link section parens before due dates and re-forwarding", () => {
    const line = "> task (>2026-11-20#Sync (Part 1))";
    expect(withDueDate(line, 0, "2026-11-25")).toBe("> task by:2026-11-25 (>2026-11-20#Sync (Part 1))");
    expect(withToLink(line, " (>2026-11-28#Follow)")).toBe("> task (>2026-11-28#Follow)");
  });
});
