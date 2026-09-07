/** Deterministic, seedable PRNG (mulberry32) — the dataset generator and
 * every scenario built on it must be reproducible run-to-run, so nothing
 * here may touch `Math.random()`. Only used by the testing harness; the
 * whole `src/lib/testing/` tree is dead-code-eliminated from production
 * builds (see `src/main.ts`'s `import.meta.env.DEV` gate). */
export class Prng {
  private state: number;

  constructor(seed: number) {
    // Force to a 32-bit unsigned integer so the same numeric seed always
    // produces the same stream regardless of how it was passed in.
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Random element of `arr`. Throws on an empty array rather than
   * returning `undefined` — every caller here relies on a real value. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Prng.pick() on an empty array");
    return arr[this.int(0, arr.length - 1)];
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Fisher-Yates shuffle of a copy of `arr`. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
