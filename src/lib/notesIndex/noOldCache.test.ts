// @ts-expect-error node:fs has no type definitions in browser tsconfig
import fs from "node:fs";
// @ts-expect-error node:path has no type definitions in browser tsconfig
import path from "node:path";
// @ts-expect-error node:url has no type definitions in browser tsconfig
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORBIDDEN = ["allNotesCache", "refreshAllNotesCache"] as const;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte"))) {
      out.push(full);
    }
  }
  return out;
}

describe("no old all-notes cache", () => {
  it("no .ts or .svelte file under src/ mentions allNotesCache or refreshAllNotesCache", () => {
    const self = path.resolve(fileURLToPath(import.meta.url));
    const srcRoot = path.resolve(path.dirname(self), "..", "..");
    const files = collectSourceFiles(srcRoot).filter((f) => path.resolve(f) !== self);

    const hits: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const word of FORBIDDEN) {
        if (content.includes(word)) {
          hits.push(`${path.relative(srcRoot, file)}: contains ${word}`);
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
