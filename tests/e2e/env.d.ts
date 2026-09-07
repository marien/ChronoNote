/** Ambient types for the E2E specs — the mock backend the dev-only
 * `?mock` boot path installs on `window`. The runtime lives in
 * `src/lib/testing/`. */
import type { MockBackend, MockSeed } from "../../src/lib/testing/mockBackend";

declare global {
  interface Window {
    __CHRONO_MOCK__?: MockBackend;
    __CHRONO_SEED__?: MockSeed;
  }
}

export {};
