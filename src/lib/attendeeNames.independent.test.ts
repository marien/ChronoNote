import { describe, expect, it } from "vitest";
import { attendeeNames } from "./attendeeNames";

describe("attendeeNames", () => {
  it("extracts the first name from 'First Last'", () => {
    expect(attendeeNames(["Dana Smith"], "")).toEqual(["Dana"]);
  });

  it("extracts the first name from 'Last, First'", () => {
    expect(attendeeNames(["Smith, Dana"], "")).toEqual(["Dana"]);
  });

  it("keeps a single name as-is", () => {
    expect(attendeeNames(["Dana"], "")).toEqual(["Dana"]);
  });

  it("extracts and capitalizes the first piece of an email address", () => {
    expect(attendeeNames(["dana.smith@example.org"], "")).toEqual(["Dana"]);
  });

  it("drops a trailing parenthetical suffix before extracting the first name", () => {
    expect(attendeeNames(["Dana Smith (External)"], "")).toEqual(["Dana"]);
  });

  it("disambiguates duplicate first names with '-' and uppercased last-word initial", () => {
    expect(attendeeNames(["Dana Smith", "Dana Brown"], "")).toEqual(["Dana-S", "Dana-B"]);
  });

  it("preserves accented characters", () => {
    expect(attendeeNames(["José Álvarez"], "")).toEqual(["José"]);
  });

  it("excludes ownName (case-insensitive first-name match)", () => {
    expect(attendeeNames(["Marien de Gelder", "Ben Jones"], "Marien")).toEqual(["Ben"]);
  });

  it("drops entries with no NAME_CHAR characters remaining", () => {
    expect(attendeeNames(["!!!"], "")).toEqual([]);
  });

  it("deduplicates identical names while keeping input order", () => {
    expect(attendeeNames(["Ben Jones", "Ben Jones"], "")).toEqual(["Ben"]);
  });
});
