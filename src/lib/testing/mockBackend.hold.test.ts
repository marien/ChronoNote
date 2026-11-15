// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MockBackend } from "./mockBackend";

const FILENAME = "2026-09-07.txt";

describe("MockBackend holdCommand / releaseHeld / isHeld", () => {
  it("holds read_note until released, then resolves with note content", async () => {
    const backend = new MockBackend({ notes: { [FILENAME]: "a" } });

    backend.holdCommand("read_note");
    expect(backend.isHeld("read_note")).toBe(false);

    let settled = false;
    const pending = backend.invoke("read_note", { filename: FILENAME }).then((res) => {
      settled = true;
      return res;
    });

    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }

    expect(settled).toBe(false);
    expect(backend.isHeld("read_note")).toBe(true);

    expect(backend.releaseHeld("read_note")).toBe(true);
    expect(backend.isHeld("read_note")).toBe(false);
    await expect(pending).resolves.toBe("a");
    expect(settled).toBe(true);
  });

  it("rejects with the given message and leaves the note unchanged when released with reject", async () => {
    const backend = new MockBackend({ notes: { [FILENAME]: "a" } });

    backend.holdCommand("write_note");
    const pending = backend.invoke("write_note", {
      filename: FILENAME,
      content: "b",
      expectedHash: null,
    });

    await Promise.resolve();
    expect(backend.isHeld("write_note")).toBe(true);

    expect(backend.releaseHeld("write_note", { reject: "nope" })).toBe(true);
    expect(backend.isHeld("write_note")).toBe(false);
    await expect(pending).rejects.toThrow("nope");
    expect(backend.getNote(FILENAME)).toBe("a");
  });

  it("does not hold a second call after release", async () => {
    const backend = new MockBackend({ notes: { [FILENAME]: "a" } });

    backend.holdCommand("read_note");
    const first = backend.invoke("read_note", { filename: FILENAME });
    await Promise.resolve();
    expect(backend.releaseHeld("read_note")).toBe(true);
    await expect(first).resolves.toBe("a");

    const second = backend.invoke("read_note", { filename: FILENAME });
    expect(backend.isHeld("read_note")).toBe(false);
    await expect(second).resolves.toBe("a");
  });

  it("releaseHeld returns false when nothing is waiting", async () => {
    const backend = new MockBackend({ notes: { [FILENAME]: "a" } });

    expect(backend.releaseHeld("read_note")).toBe(false);

    backend.holdCommand("read_note");
    expect(backend.releaseHeld("read_note")).toBe(false);
    await expect(backend.invoke("read_note", { filename: FILENAME })).resolves.toBe("a");
  });
});
