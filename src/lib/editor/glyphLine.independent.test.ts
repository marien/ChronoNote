import { describe, it, expect } from "vitest";
import { parseGlyphLine, type GlyphPart } from "./glyphLine";

interface ParseGlyphLineOpts {
  today?: string;
  from?: number;
  to?: number;
}

interface ExtendedGlyphPart extends GlyphPart {
  title?: string;
  parts?: GlyphPart[];
}

const parse = parseGlyphLine as unknown as (line: string, opts?: ParseGlyphLineOpts) => ExtendedGlyphPart[];

const textOf = (parts: GlyphPart[]) => parts.map((p) => p.text).join("");

describe("parseGlyphLine — due dates and range options (§426-T)", () => {
  const TODAY = "2026-10-24";
  const PAST = "2026-10-20";
  const FUTURE = "2026-10-30";

  describe("due date status classification", () => {
    it("marks an open action with past due date as overdue", () => {
      const parts = parse(`# buy milk by:${PAST}`, { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeDefined();
      expect(due!.cls).toBe("cm-due cm-due-overdue");
    });

    it("marks an open action with today's due date as today", () => {
      const parts = parse(`# buy milk by:${TODAY}`, { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeDefined();
      expect(due!.cls).toBe("cm-due cm-due-today");
    });

    it("marks an open action with future due date as later", () => {
      const parts = parse(`# buy milk by:${FUTURE}`, { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeDefined();
      expect(due!.cls).toBe("cm-due cm-due-later");
    });

    it("marks a completed action (v) as resolved regardless of the date", () => {
      const pastParts = parse(`v done task by:${PAST}`, { today: TODAY });
      const pastDue = pastParts.find((p) => p.cls?.includes("cm-due"));
      expect(pastDue).toBeDefined();
      expect(pastDue!.cls).toBe("cm-due cm-due-resolved");

      const futureParts = parse(`v done task by:${FUTURE}`, { today: TODAY });
      const futureDue = futureParts.find((p) => p.cls?.includes("cm-due"));
      expect(futureDue).toBeDefined();
      expect(futureDue!.cls).toBe("cm-due cm-due-resolved");
    });

    it("marks a forwarded action (>) as resolved regardless of the date", () => {
      const parts = parse(`> forwarded task by:${PAST}`, { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeDefined();
      expect(due!.cls).toBe("cm-due cm-due-resolved");
    });

    it("marks a cancelled action (x) as resolved regardless of the date", () => {
      const parts = parse(`x cancelled task by:${PAST}`, { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeDefined();
      expect(due!.cls).toBe("cm-due cm-due-resolved");
    });

    it("determines due state from the step's own state on multi-step lines", () => {
      // v done => # next by:<past> -> next is '#', so overdue
      const stepOverdue = parse(`v done => # next by:${PAST}`, { today: TODAY });
      const due1 = stepOverdue.find((p) => p.cls?.includes("cm-due"));
      expect(due1).toBeDefined();
      expect(due1!.cls).toBe("cm-due cm-due-overdue");

      // # a => v b by:<past> -> b is 'v', so resolved
      const stepResolved = parse(`# a => v b by:${PAST}`, { today: TODAY });
      const due2 = stepResolved.find((p) => p.cls?.includes("cm-due"));
      expect(due2).toBeDefined();
      expect(due2!.cls).toBe("cm-due cm-due-resolved");

      // # open by:<later> => v finished by:<past>
      const multi = parse(`# open by:${FUTURE} => v finished by:${PAST}`, { today: TODAY });
      const dues = multi.filter((p) => p.cls?.includes("cm-due"));
      expect(dues).toHaveLength(2);
      expect(dues[0].cls).toBe("cm-due cm-due-later");
      expect(dues[1].cls).toBe("cm-due cm-due-resolved");
    });
  });

  describe("due date structure and nested parts", () => {
    it("due date becomes ONE top-level part with nested parts and title", () => {
      const parts = parse(`# task by:${TODAY}`, { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeDefined();
      expect(due!.text).toBe(`by:${TODAY}`);
      expect(typeof due!.title).toBe("string");
      expect(due!.title!.length).toBeGreaterThan(0);

      expect(due!.parts).toBeDefined();
      expect(due!.parts).toHaveLength(2);
      expect(due!.parts![0]).toEqual({ text: "by:", cls: "cm-due-flag" });
      expect(due!.parts![1].text).toBe(TODAY);
      expect(due!.parts![1].cls).toBeUndefined();
    });

    it("does not classify non-ISO due words like by:fri as cm-due", () => {
      const parts = parse("# task by:fri", { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeUndefined();
      expect(textOf(parts)).toBe("☐ task by:fri");
    });

    it("does not classify by:tomorrow as cm-due", () => {
      const parts = parse("# task by:tomorrow", { today: TODAY });
      const due = parts.find((p) => p.cls?.includes("cm-due"));
      expect(due).toBeUndefined();
    });
  });

  describe("concatenation invariant", () => {
    it("concatenating all top-level parts reproduces the line exactly (with glyph replacing symbol)", () => {
      const line = `# (budget) review the plan by:${FUTURE} today`;
      const parts = parse(line, { today: TODAY });
      const rendered = textOf(parts);

      // Glyphs replace the action symbol, but the remainder including by:... is verbatim
      expect(rendered).toBe(`☐ (budget) review the plan by:${FUTURE} today`);
      const duePart = parts.find((p) => p.cls?.includes("cm-due"));
      expect(duePart).toBeDefined();
      expect(duePart!.text).toBe(`by:${FUTURE}`);
    });

    it("concatenating multi-step line with due dates keeps all characters without gaps or loss", () => {
      const line = `v step 1 by:${PAST} => # step 2 by:${FUTURE}`;
      const parts = parse(line, { today: TODAY });
      expect(textOf(parts)).toBe(`☑ step 1 by:${PAST} ➔ ☐ step 2 by:${FUTURE}`);
    });
  });

  describe("backward compatibility without opts and without due dates", () => {
    it("preserves identical output for lines without due dates called without opts", () => {
      // Action with (topic)
      const topicParts = parseGlyphLine("# (topic) discuss roadmap");
      expect(topicParts.map((p) => [p.cls, p.text])).toEqual([
        ["glyph-open", "☐"],
        [undefined, " "],
        ["glyph-topic", "(topic)"],
        [undefined, " discuss roadmap"],
      ]);

      // Line with @name
      const assigneeParts = parseGlyphLine("email @dana about it");
      expect(assigneeParts.map((p) => [p.cls, p.text])).toEqual([
        [undefined, "email "],
        ["glyph-assignee", "@dana"],
        [undefined, " about it"],
      ]);

      // Bullet line
      const bulletParts = parseGlyphLine("- a bullet point");
      expect(bulletParts.map((p) => [p.cls, p.text])).toEqual([
        ["glyph-bullet", "•"],
        [undefined, " "],
        [undefined, "a bullet point"],
      ]);

      // Arrow line
      const arrowParts = parseGlyphLine("=> follow up");
      expect(arrowParts.map((p) => [p.cls, p.text])).toEqual([
        ["glyph-followup", "➔"],
        [undefined, " "],
        [undefined, "follow up"],
      ]);
    });
  });

  describe("from and to range filtering", () => {
    it("emits only parts inside [from, to)", () => {
      const line = `# (budget) review by:${FUTURE} today`;
      const topicIndex = line.indexOf("(budget)");
      const parts = parse(line, { from: topicIndex, to: line.length, today: TODAY });

      // Should contain topic pill and due part, but no action glyph
      const hasActionGlyph = parts.some((p) => p.cls?.includes("glyph-open"));
      const topicPart = parts.find((p) => p.cls?.includes("glyph-topic"));
      const duePart = parts.find((p) => p.cls?.includes("cm-due"));

      expect(hasActionGlyph).toBe(false);
      expect(topicPart).toBeDefined();
      expect(topicPart!.text).toBe("(budget)");
      expect(duePart).toBeDefined();
      expect(duePart!.text).toBe(`by:${FUTURE}`);

      // When the range contains no glyph symbols, concatenated text equals line.slice(from, to)
      expect(textOf(parts)).toBe(line.slice(topicIndex, line.length));
    });

    it("omits due part when 'to' is placed before the due token", () => {
      const line = `# (budget) review by:${FUTURE} today`;
      const topicIndex = line.indexOf("(budget)");
      const beforeDue = line.indexOf(`by:${FUTURE}`);
      const parts = parse(line, { from: topicIndex, to: beforeDue, today: TODAY });

      const duePart = parts.find((p) => p.cls?.includes("cm-due"));
      expect(duePart).toBeUndefined();

      const topicPart = parts.find((p) => p.cls?.includes("glyph-topic"));
      expect(topicPart).toBeDefined();
      expect(textOf(parts)).toBe(line.slice(topicIndex, beforeDue));
    });

    it("concatenated text equals line.slice(from, to) for arbitrary text slice without glyphs", () => {
      const line = `# plain action with some text by:${FUTURE}`;
      const from = 8;
      const to = 22;
      const parts = parse(line, { from, to, today: TODAY });
      expect(textOf(parts)).toBe(line.slice(from, to));
    });
  });
});
