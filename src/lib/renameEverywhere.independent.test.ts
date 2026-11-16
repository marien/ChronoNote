// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  applyRename,
  planRename,
  renameInText,
  validTarget,
  type RenameTarget,
} from "./renameEverywhere";
import { ensureLoaded } from "./notesIndex";
import { clearDiskLayer } from "./notesIndex/diskLayer";
import { activeTabId, dismissToast, tabs, toastAction } from "./stores";
import { installMockTauri, type MockBackend } from "./testing/mockBackend";

describe("renameInText", () => {
  it("renames a timed section title and updates its exact underline", () => {
    const before = "[10:00 - 10:30] Coffee rota\n===========================";
    const target: RenameTarget = { kind: "title", from: "Coffee rota", to: "Hospitality rota" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe("[10:00 - 10:30] Hospitality rota\n================================");
    expect(res.lines).toEqual([
      {
        lineIdx: 0,
        before: "[10:00 - 10:30] Coffee rota",
        after: "[10:00 - 10:30] Hospitality rota",
      },
      {
        lineIdx: 1,
        before: "===========================",
        after: "================================",
      },
    ]);
  });

  it("keeps a trailing date suffix and non-exact underline", () => {
    const before = "Coffee rota - 2026-10-30\n===";
    const target: RenameTarget = { kind: "title", from: "Coffee rota", to: "Hospitality rota" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe("Hospitality rota - 2026-10-30\n===");
    expect(res.lines).toEqual([
      {
        lineIdx: 0,
        before: "Coffee rota - 2026-10-30",
        after: "Hospitality rota - 2026-10-30",
      },
    ]);
  });

  it("matches title case-insensitively and preserves [CANCELED] prefix", () => {
    const before = "[CANCELED] coffee ROTA\n=====";
    const target: RenameTarget = { kind: "title", from: "Coffee rota", to: "Hospitality rota" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe("[CANCELED] Hospitality rota\n=====");
    expect(res.lines).toEqual([
      {
        lineIdx: 0,
        before: "[CANCELED] coffee ROTA",
        after: "[CANCELED] Hospitality rota",
      },
    ]);
  });

  it("leaves a different title unchanged with empty lines", () => {
    const before = "Coffee rota planning\n===";
    const target: RenameTarget = { kind: "title", from: "Coffee rota", to: "Hospitality rota" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });

  it("leaves titles unchanged when { titles: false }", () => {
    const before = "[10:00 - 10:30] Coffee rota\n===========================";
    const target: RenameTarget = { kind: "title", from: "Coffee rota", to: "Hospitality rota" };
    const res = renameInText(before, target, { titles: false });

    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });

  it("renames matching @name tokens case-insensitively and leaves others intact", () => {
    const before = "# ask @dana => @Dana x (@Ben, @DANA)";
    const target: RenameTarget = { kind: "name", from: "Dana", to: "Dana-S" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe("# ask @Dana-S => @Dana-S x (@Ben, @Dana-S)");
    expect(res.lines).toEqual([
      {
        lineIdx: 0,
        before,
        after: "# ask @Dana-S => @Dana-S x (@Ben, @Dana-S)",
      },
    ]);
  });

  it("does not rename a longer @name prefix match", () => {
    const before = "# call @Danal";
    const target: RenameTarget = { kind: "name", from: "Dana", to: "Dana-S" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });

  it("renames a topic tag after an action token", () => {
    const before = "# (budget) send";
    const target: RenameTarget = { kind: "topic", from: "budget", to: "finance" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe("# (finance) send");
    expect(res.lines).toEqual([
      {
        lineIdx: 0,
        before,
        after: "# (finance) send",
      },
    ]);
  });

  it("leaves parenthesized text on a plain line unchanged", () => {
    const before = "plain (budget) text";
    const target: RenameTarget = { kind: "topic", from: "budget", to: "finance" };
    const res = renameInText(before, target, { titles: true });

    expect(res.text).toBe(before);
    expect(res.lines).toEqual([]);
  });
});

describe("validTarget", () => {
  it.each<[RenameTarget, boolean]>([
    [{ kind: "name", from: "Dana", to: "Dana-S" }, true],
    [{ kind: "name", from: "Dana", to: "@Dana-S" }, true],
    [{ kind: "name", from: "Dana", to: "Da na" }, false],
    [{ kind: "name", from: "Dana", to: "dana" }, true],
    [{ kind: "name", from: "Dana", to: "Dana" }, false],
    [{ kind: "topic", from: "budget", to: "fin ance" }, false],
    [{ kind: "topic", from: "budget", to: "fin(ance" }, false],
    [{ kind: "topic", from: "budget", to: "" }, false],
    [{ kind: "title", from: "Coffee rota", to: "   " }, false],
    [{ kind: "title", from: "Coffee rota", to: "[x] rota" }, false],
    [{ kind: "title", from: "Coffee rota", to: "2026-11-16 rota" }, false],
    [{ kind: "title", from: "Coffee rota", to: "Hospitality rota" }, true],
  ])("validates %j as valid=%s", (target, isValid) => {
    const res = validTarget(target);
    if (isValid) {
      expect(res).toBeNull();
    } else {
      expect(typeof res).toBe("string");
      expect(res!.length).toBeGreaterThan(0);
    }
  });
});

describe("planRename and applyRename", () => {
  let backend: MockBackend;

  const NOTE_10 = "Coffee rota\n===========\n# milk @dana";
  const NOTE_14 = "Coffee rota\n===========";
  const NOTE_20 = "Coffee rota\n===========\n# cups @Dana";

  beforeEach(async () => {
    sessionStorage.clear();
    clearDiskLayer();
    tabs.set([]);
    activeTabId.set("");
    dismissToast();

    backend = installMockTauri({
      notes: {
        "2026-11-10.txt": NOTE_10,
        "2026-11-14.txt": NOTE_14,
        "2026-11-20.txt": NOTE_20,
      },
    });
    await ensureLoaded();
  });

  it("plans title renames newest-first, excluding future notes and scratchpads", async () => {
    tabs.set([
      {
        id: "scratch-1",
        filename: "Scratchpad 1",
        isScratchpad: true,
        content: "Coffee rota\n===========",
      },
    ]);

    const plan = await planRename(
      { kind: "title", from: "Coffee rota", to: "Hospitality rota" },
      "2026-11-16",
    );

    expect(plan.map((p) => p.filename)).toEqual(["2026-11-14.txt", "2026-11-10.txt"]);
  });

  it("plans name renames across past and future dated notes, newest-first, excluding scratchpads", async () => {
    tabs.set([
      {
        id: "scratch-1",
        filename: "Scratchpad 1",
        isScratchpad: true,
        content: "# tea @dana",
      },
    ]);

    const plan = await planRename(
      { kind: "name", from: "Dana", to: "Dana-S" },
      "2026-11-16",
    );

    expect(plan.map((p) => p.filename)).toEqual(["2026-11-20.txt", "2026-11-10.txt"]);
  });

  it("skips a note that changed on disk between plan and apply", async () => {
    const plan = await planRename(
      { kind: "title", from: "Coffee rota", to: "Hospitality rota" },
      "2026-11-16",
    );
    const ticked = new Set(plan.map((p) => p.filename));

    backend.setNote("2026-11-10.txt", "Changed externally");

    const res = await applyRename(plan, ticked);
    expect(res.renamed).toEqual(["2026-11-14.txt"]);
    expect(res.skipped).toEqual(["2026-11-10.txt"]);
    expect(backend.getNote("2026-11-10.txt")).toBe("Changed externally");
  });

  it("renames both notes and keeps an earlier version with the old text for each", async () => {
    const plan = await planRename(
      { kind: "title", from: "Coffee rota", to: "Hospitality rota" },
      "2026-11-16",
    );
    const ticked = new Set(plan.map((p) => p.filename));

    const res = await applyRename(plan, ticked);
    expect(res.renamed).toEqual(["2026-11-14.txt", "2026-11-10.txt"]);
    expect(res.skipped).toEqual([]);

    for (const [filename, oldText] of [
      ["2026-11-14.txt", NOTE_14],
      ["2026-11-10.txt", NOTE_10],
    ] as const) {
      const versions = (await backend.invoke("list_versions", { filename })) as { name: string }[];
      expect(versions.length).toBeGreaterThan(0);
      const contents = await Promise.all(
        versions.map((v) => backend.invoke("read_version", { filename, name: v.name }) as Promise<string>),
      );
      expect(contents).toContain(oldText);
    }
  });

  it("undoes via toast action while skipping a note edited by hand after the rename", async () => {
    const plan = await planRename(
      { kind: "title", from: "Coffee rota", to: "Hospitality rota" },
      "2026-11-16",
    );
    const ticked = new Set(plan.map((p) => p.filename));

    await applyRename(plan, ticked);

    const handEdit = "Hand edited\n===========";
    backend.setNote("2026-11-14.txt", handEdit);

    const undoAction = get(toastAction);
    expect(typeof undoAction).toBe("function");
    await undoAction!();

    expect(backend.getNote("2026-11-10.txt")).toBe(NOTE_10);
    expect(backend.getNote("2026-11-14.txt")).toBe(handEdit);
  });
});
