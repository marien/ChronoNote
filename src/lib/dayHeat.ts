import { computeDayHeat, type DayHeatState } from "./date";
import type { NoteEntry } from "./notesIndex";

const heatMemo = new WeakMap<NoteEntry, DayHeatState | null>();

/** Returns `computeDayHeat(e.text)`, remembered per `NoteEntry` so keystrokes in one note do not recompute others. */
export function dayHeatOf(e: NoteEntry): DayHeatState | null {
  let v = heatMemo.get(e);
  if (v === undefined) {
    v = computeDayHeat(e.text);
    heatMemo.set(e, v);
  }
  return v;
}
