import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebBackend } from "./webBackend";
import { installIdbStub } from "../testing/idbStub";
import type { AppConfig, ConfigPatch } from "../generated/tauri-types";
import type { AppError } from "../types";

describe("WebBackend - update_config & agenda reads", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;

  beforeEach(() => {
    mockStores = installIdbStub();
    backend = new WebBackend("0.30.0");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("update_config", () => {
    it("loads default configuration when no config is stored", async () => {
      const cfg = (await backend.invoke("get_config")) as AppConfig;
      expect(cfg.colorMode).toBe("color");
      expect(cfg.themeMode).toBe("system");
      expect(cfg.languageMode).toBe("system");
      expect(cfg.fontSize).toBe(13);
      expect(cfg.lineHeight).toBe(1.6);
      expect(cfg.statusBarVisible).toBe(true);
      expect(cfg.wordWrap).toBe(false);
      expect(cfg.notesDir).toBe("Browser storage");
    });

    it("updates specified fields and leaves unmentioned fields intact", async () => {
      const initial = (await backend.invoke("get_config")) as AppConfig;

      const patch: ConfigPatch = {
        fontSize: 16,
        wordWrap: true,
        themeMode: "dark",
      };

      const updated = (await backend.invoke("update_config", { patch })) as AppConfig;

      // Changed fields
      expect(updated.fontSize).toBe(16);
      expect(updated.wordWrap).toBe(true);
      expect(updated.themeMode).toBe("dark");

      // Unmentioned fields remain intact
      expect(updated.colorMode).toBe(initial.colorMode);
      expect(updated.lineHeight).toBe(initial.lineHeight);
      expect(updated.statusBarVisible).toBe(initial.statusBarVisible);
      expect(updated.languageMode).toBe(initial.languageMode);
      expect(updated.startupTabMode).toBe(initial.startupTabMode);

      // Verify reading back via get_config gives the same result
      const readBack = (await backend.invoke("get_config")) as AppConfig;
      expect(readBack.fontSize).toBe(16);
      expect(readBack.wordWrap).toBe(true);
      expect(readBack.themeMode).toBe("dark");
    });

    it("clamps font size between 12 and 18", async () => {
      const under = (await backend.invoke("update_config", {
        patch: { fontSize: 8 },
      })) as AppConfig;
      expect(under.fontSize).toBe(12);

      const over = (await backend.invoke("update_config", {
        patch: { fontSize: 25 },
      })) as AppConfig;
      expect(over.fontSize).toBe(18);
    });

    it("clamps line height between 1.3 and 1.8", async () => {
      const under = (await backend.invoke("update_config", {
        patch: { lineHeight: 1.0 },
      })) as AppConfig;
      expect(under.lineHeight).toBe(1.3);

      const over = (await backend.invoke("update_config", {
        patch: { lineHeight: 2.2 },
      })) as AppConfig;
      expect(over.lineHeight).toBe(1.8);
    });

    it("clamps historyPaneShare and actionsPaneShare between 0.18 and 0.60", async () => {
      const under = (await backend.invoke("update_config", {
        patch: { historyPaneShare: 0.10, actionsPaneShare: 0.05 },
      })) as AppConfig;
      expect(under.historyPaneShare).toBe(0.18);
      expect(under.actionsPaneShare).toBe(0.18);

      const over = (await backend.invoke("update_config", {
        patch: { historyPaneShare: 0.85, actionsPaneShare: 0.70 },
      })) as AppConfig;
      expect(over.historyPaneShare).toBe(0.60);
      expect(over.actionsPaneShare).toBe(0.60);
    });

    it("persists statusBarVisible, pureBlack, earlyUpdates, tabLabelStyle, startupTabMode", async () => {
      const updated = (await backend.invoke("update_config", {
        patch: {
          statusBarVisible: false,
          pureBlack: true,
          earlyUpdates: true,
          tabLabelStyle: "friendly",
          startupTabMode: "lastOpened",
        },
      })) as AppConfig;

      expect(updated.statusBarVisible).toBe(false);
      expect(updated.pureBlack).toBe(true);
      expect(updated.earlyUpdates).toBe(true);
      expect(updated.tabLabelStyle).toBe("friendly");
      expect(updated.startupTabMode).toBe("lastOpened");

      const readBack = (await backend.invoke("get_config")) as AppConfig;
      expect(readBack.statusBarVisible).toBe(false);
      expect(readBack.pureBlack).toBe(true);
      expect(readBack.earlyUpdates).toBe(true);
      expect(readBack.tabLabelStyle).toBe("friendly");
      expect(readBack.startupTabMode).toBe("lastOpened");
    });

    it("persists configuration changes across new backend instances", async () => {
      await backend.invoke("update_config", {
        patch: { languageMode: "nl", fontSize: 15 },
      });

      // Fresh instance pointing at the same IndexedDB stub
      const newBackend = new WebBackend("0.30.0");
      const cfg = (await newBackend.invoke("get_config")) as AppConfig;
      expect(cfg.languageMode).toBe("nl");
      expect(cfg.fontSize).toBe(15);
    });
  });

  describe("agenda reads", () => {
    const sampleAgenda = [
      { date: "2026-10-20", start: "09:00", end: "10:00", title: "Morning Kickoff" },
      { date: "2026-10-20", start: "11:00", end: "12:00", title: "Declined: Budget Sync" },
      { date: "2026-10-20", start: "14:00", end: "15:00", title: "Design Review" },
      { date: "2026-10-21", start: "10:00", end: "11:00", title: "Product Roadmap" },
    ];

    it("reads active meeting entries, removed entries, and active dates from .agenda.json", async () => {
      expect(await backend.invoke("agenda_file_exists")).toBe(false);

      mockStores.notes_browser.set(".agenda.json", {
        content: JSON.stringify(sampleAgenda),
        contentHash: "hash-agenda",
        modifiedMs: Date.now(),
      });

      expect(await backend.invoke("agenda_file_exists")).toBe(true);

      // Active titles for 2026-10-20 (excludes Declined:)
      const titles = (await backend.invoke("read_agenda_for_date", {
        date: "2026-10-20",
      })) as string[];
      expect(titles).toEqual(["Morning Kickoff", "Design Review"]);

      // Active entries with start/end
      const entries = (await backend.invoke("read_agenda_entries_for_date", {
        date: "2026-10-20",
      })) as Array<[string, string, string]>;
      expect(entries).toEqual([
        ["09:00", "10:00", "Morning Kickoff"],
        ["14:00", "15:00", "Design Review"],
      ]);

      // Removed/declined entries
      const removed = (await backend.invoke("read_agenda_removed_for_date", {
        date: "2026-10-20",
      })) as string[];
      expect(removed).toEqual(["Budget Sync"]);

      // Future meetings after 2026-10-20
      const future = (await backend.invoke("read_agenda_after", {
        afterDate: "2026-10-20",
      })) as Array<[string, string]>;
      expect(future).toEqual([["2026-10-21", "Product Roadmap"]]);

      // All active agenda dates
      const dates = (await backend.invoke("read_agenda_dates")) as string[];
      expect(dates).toEqual(["2026-10-20", "2026-10-21"]);
    });

    it("throws agendaInvalid error when .agenda.json is missing or corrupted", async () => {
      // Missing .agenda.json
      await expect(
        backend.invoke("read_agenda_for_date", { date: "2026-10-20" }),
      ).rejects.toEqual({ code: "agendaInvalid" });

      await expect(
        backend.invoke("read_agenda_entries_for_date", { date: "2026-10-20" }),
      ).rejects.toEqual({ code: "agendaInvalid" });

      await expect(
        backend.invoke("read_agenda_removed_for_date", { date: "2026-10-20" }),
      ).rejects.toEqual({ code: "agendaInvalid" });

      await expect(
        backend.invoke("read_agenda_after", { afterDate: "2026-10-20" }),
      ).rejects.toEqual({ code: "agendaInvalid" });

      // read_agenda_dates returns [] gracefully when missing
      expect(await backend.invoke("read_agenda_dates")).toEqual([]);

      // Corrupted .agenda.json
      mockStores.notes_browser.set(".agenda.json", {
        content: "not json content at all",
        contentHash: "bad",
        modifiedMs: Date.now(),
      });

      await expect(
        backend.invoke("read_agenda_for_date", { date: "2026-10-20" }),
      ).rejects.toEqual({ code: "agendaInvalid" });

      expect(await backend.invoke("read_agenda_dates")).toEqual([]);
    });
  });
});
