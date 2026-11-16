import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebBackend } from "./webBackend";
import { installIdbStub } from "../testing/idbStub";

type AgendaDetailsRow = {
  start: string;
  end: string;
  title: string;
  joinUrl: string | null;
  attendees: string[];
};

describe("WebBackend - read_agenda_details_for_date", () => {
  let backend: WebBackend;
  let mockStores: Record<string, Map<string, any>>;

  beforeEach(() => {
    mockStores = installIdbStub();
    backend = new WebBackend("0.30.0");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setAgenda(extra: Record<string, unknown>) {
    mockStores.notes_browser.set(".agenda.json", {
      content: JSON.stringify([
        {
          date: "2026-11-16",
          start: "10:00",
          end: "10:30",
          title: "Board",
          ...extra,
        },
      ]),
      contentHash: "hash-agenda",
      modifiedMs: Date.now(),
    });
  }

  async function readDetails(): Promise<AgendaDetailsRow[]> {
    return (await backend.invoke("read_agenda_details_for_date", {
      date: "2026-11-16",
    })) as AgendaDetailsRow[];
  }

  it("reads https joinUrl and attendees array", async () => {
    setAgenda({
      joinUrl: "https://teams.example/x",
      attendees: ["Dana Smith", "Ben"],
    });

    expect(await readDetails()).toEqual([
      {
        start: "10:00",
        end: "10:30",
        title: "Board",
        joinUrl: "https://teams.example/x",
        attendees: ["Dana Smith", "Ben"],
      },
    ]);
  });

  it("rejects non-https joinUrl as null", async () => {
    setAgenda({
      joinUrl: "http://teams.example/x",
    });

    expect(await readDetails()).toEqual([
      {
        start: "10:00",
        end: "10:30",
        title: "Board",
        joinUrl: null,
        attendees: [],
      },
    ]);
  });

  it("ignores wrong-typed attendees without failing the file", async () => {
    setAgenda({
      attendees: "Dana",
    });

    expect(await readDetails()).toEqual([
      {
        start: "10:00",
        end: "10:30",
        title: "Board",
        joinUrl: null,
        attendees: [],
      },
    ]);
  });

  it("filters non-string and blank items from attendees", async () => {
    setAgenda({
      attendees: ["Dana", 5, "  "],
    });

    expect(await readDetails()).toEqual([
      {
        start: "10:00",
        end: "10:30",
        title: "Board",
        joinUrl: null,
        attendees: ["Dana"],
      },
    ]);
  });

  it("ignores seriesId and omits it from the result", async () => {
    setAgenda({
      seriesId: "abc",
    });

    const result = await readDetails();
    expect(result).toEqual([
      {
        start: "10:00",
        end: "10:30",
        title: "Board",
        joinUrl: null,
        attendees: [],
      },
    ]);
    expect("seriesId" in result[0]).toBe(false);
  });

  it("defaults joinUrl to null and attendees to [] when omitted", async () => {
    setAgenda({});

    expect(await readDetails()).toEqual([
      {
        start: "10:00",
        end: "10:30",
        title: "Board",
        joinUrl: null,
        attendees: [],
      },
    ]);
  });
});
