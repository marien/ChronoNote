import { describe, expect, it } from "vitest";
import type { AgendaDetails } from "../types";
import { MockBackend } from "./mockBackend";

describe("MockBackend read_agenda_details_for_date", () => {
  it("parses joinUrl and attendees leniently and ignores seriesId", async () => {
    const backend = new MockBackend({
      agendaJson: JSON.stringify([
        {
          date: "2026-10-20",
          start: "09:00",
          end: "09:30",
          title: "Confirmed: Standup",
          joinUrl: "https://teams.microsoft.com/l/meetup-join/1",
          attendees: ["  Dana Smith ", "", 99, "Ben Jones"],
          seriesId: "AAMkAGI2",
        },
        {
          date: "2026-10-20",
          start: "10:00",
          end: "10:30",
          title: "Cancelled: Old",
          joinUrl: "https://example.com/old",
          attendees: ["Dana Smith"],
        },
        {
          date: "2026-10-20",
          start: "11:00",
          end: "11:30",
          title: "Sync",
          joinUrl: "http://x",
          attendees: "Dana",
        },
      ]),
    });

    await expect(backend.invoke("read_agenda_details_for_date", { date: "2026-10-20" })).resolves.toEqual([
      {
        start: "09:00",
        end: "09:30",
        title: "Standup",
        joinUrl: "https://teams.microsoft.com/l/meetup-join/1",
        attendees: ["Dana Smith", "Ben Jones"],
      },
      {
        start: "11:00",
        end: "11:30",
        title: "Sync",
        joinUrl: null,
        attendees: [],
      },
    ]);
  });

  it("carries joinUrl and attendees through timezone conversion", async () => {
    const backend = new MockBackend({
      agendaJson: JSON.stringify({
        timezone: "UTC",
        meetings: [
          {
            date: "2026-10-20",
            start: "09:00",
            end: "09:30",
            title: "UTC Sync",
            joinUrl: "https://meet.example.org/utc",
            attendees: ["Dana Smith"],
          },
        ],
      }),
    });

    const details = (await backend.invoke("read_agenda_details_for_date", { date: "2026-10-20" })) as AgendaDetails[];
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      title: "UTC Sync",
      joinUrl: "https://meet.example.org/utc",
      attendees: ["Dana Smith"],
    });
  });

  it("throws agendaInvalid when .agenda.json is missing or invalid", async () => {
    const missing = new MockBackend({});
    await expect(missing.invoke("read_agenda_details_for_date", { date: "2026-10-20" })).rejects.toEqual({
      code: "agendaInvalid",
    });

    const invalid = new MockBackend({ agendaJson: "[]" });
    await expect(invalid.invoke("read_agenda_details_for_date", { date: "2026-10-20" })).rejects.toEqual({
      code: "agendaInvalid",
    });
  });
});
