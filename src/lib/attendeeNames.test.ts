import { describe, expect, it } from "vitest";
import { attendeeNames } from "./attendeeNames";

describe("attendeeNames", () => {
  it("extracts short @names for every case in step 4", () => {
    expect(attendeeNames(["Dana Smith"], "")).toEqual(["Dana"]);
    expect(attendeeNames(["Smith, Dana"], "")).toEqual(["Dana"]);
    expect(attendeeNames(["Dana"], "")).toEqual(["Dana"]);
    expect(attendeeNames(["dana.smith@example.org"], "")).toEqual(["Dana"]);
    expect(attendeeNames(["Dana Smith (External)"], "")).toEqual(["Dana"]);
    expect(attendeeNames(["Dana Smith [Guest]"], "")).toEqual(["Dana"]);
    expect(attendeeNames(["Dana Smith", "Dana Brown"], "")).toEqual(["DanaS", "DanaB"]);
    expect(attendeeNames(["José Álvarez"], "")).toEqual(["José"]);
    expect(attendeeNames(["Marien de Gelder", "Dana Smith"], "Marien")).toEqual(["Dana"]);
    expect(attendeeNames(["!!!"], "")).toEqual([]);
  });

  it("preserves input order, strips non-NAME_CHAR characters, and drops duplicates", () => {
    expect(attendeeNames(["Ben Jones", "Dana Smith", "Ben Jones"], "")).toEqual(["Ben", "Dana"]);
    expect(attendeeNames(["Dana Smith", "Smith, Dana"], "")).toEqual(["Dana"]);
    expect(attendeeNames(["Jean-Luc Picard", "O'Brien, Miles"], "")).toEqual(["Jean-Luc", "Miles"]);
    expect(attendeeNames(["dana_van-dijk@example.org"], "")).toEqual(["Dana"]);
  });
});
