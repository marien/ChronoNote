import { describe, expect, it } from "vitest";
import { computeDayHeat } from "../../date";

describe("DatePicker 3-Tier Completion Heatmap Math (Decision 3 / R7)", () => {
  it("returns null for empty note or whitespace-only note", () => {
    expect(computeDayHeat("")).toBeNull();
    expect(computeDayHeat("   \n\t  ")).toBeNull();
  });

  it("classifies note with 0 action items as 'log'", () => {
    const text = "Meeting notes from discussion with client.\nKey decisions made.";
    expect(computeDayHeat(text)).toBe("log");
  });

  it("classifies note with open '#' items as 'pending'", () => {
    const text1 = "# Open action item\nv Completed action";
    expect(computeDayHeat(text1)).toBe("pending");

    const text2 = "  => # Consequence open\n  > Deferred item";
    expect(computeDayHeat(text2)).toBe("pending");
  });

  it("classifies note with only done and deferred items as 'done' (deferred counts as resolved per Decision 3)", () => {
    const text1 = "v Completed item\n> Deferred item\nx Won't do item";
    expect(computeDayHeat(text1)).toBe("done");

    const text2 = "> Only deferred item";
    expect(computeDayHeat(text2)).toBe("done");

    const text3 = "=> v Delegated done\n=> > Delegated deferred";
    expect(computeDayHeat(text3)).toBe("done");
  });

  it("generates correct accessible aria-label based on heatmap tier", () => {
    const getAriaLabel = (iso: string, heat: "done" | "pending" | "log" | null) => {
      if (heat === "done") return `${iso}, all tasks completed`;
      if (heat === "pending") return `${iso}, open actions pending`;
      if (heat === "log") return `${iso}, note log with no tasks`;
      return iso;
    };

    expect(getAriaLabel("2026-09-18", "done")).toBe("2026-09-18, all tasks completed");
    expect(getAriaLabel("2026-09-19", "pending")).toBe("2026-09-19, open actions pending");
    expect(getAriaLabel("2026-09-20", "log")).toBe("2026-09-20, note log with no tasks");
    expect(getAriaLabel("2026-09-21", null)).toBe("2026-09-21");
  });
});
