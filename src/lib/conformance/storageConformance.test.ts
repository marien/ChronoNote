import { describe, it, expect } from "vitest";
import cases from "./storage-cases.json";
import { MockBackend } from "../testing/mockBackend";
import { WebBackend } from "../webapp/webBackend";
import { installIdbStub } from "../testing/idbStub";

interface TestStep {
  cmd: string;
  args?: Record<string, unknown>;
  expect?: {
    result?: unknown;
    fields?: Record<string, unknown>;
    error?: boolean;
  };
  capture?: Record<string, string>;
}

interface TestCase {
  name: string;
  steps: TestStep[];
  skip?: Record<string, string>;
}

function extractPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let curr: any = obj;
  for (const p of parts) {
    if (curr == null) return undefined;
    curr = curr[p];
  }
  return curr;
}

function substituteArgs(val: unknown, vars: Record<string, unknown>): unknown {
  if (typeof val === "string") {
    if (val.startsWith("$") && val.slice(1) in vars) {
      return vars[val.slice(1)];
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => substituteArgs(item, vars));
  }
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = substituteArgs(v, vars);
    }
    return out;
  }
  return val;
}

function checkFields(actual: any, expectedFields: Record<string, any>): void {
  if (Array.isArray(actual)) {
    if ("length" in expectedFields) {
      expect(actual.length).toBe(expectedFields.length);
    }
    if ("contains" in expectedFields) {
      const found = actual.some((item) => {
        try {
          expect(item).toEqual(expectedFields.contains);
          return true;
        } catch {
          return false;
        }
      });
      expect(found).toBe(true);
    }
    return;
  }
  expect(actual).toBeDefined();
  expect(actual).not.toBeNull();
  for (const [k, v] of Object.entries(expectedFields)) {
    expect(actual).toHaveProperty(k);
    if (v !== null && typeof v === "object" && !Array.isArray(v) && typeof actual[k] === "object" && actual[k] !== null) {
      checkFields(actual[k], v);
    } else {
      expect(actual[k]).toEqual(v);
    }
  }
}

async function runCase(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>,
  testCase: TestCase,
): Promise<void> {
  const vars: Record<string, unknown> = {};
  for (let i = 0; i < testCase.steps.length; i++) {
    const step = testCase.steps[i];
    const args = substituteArgs(step.args ?? {}, vars) as Record<string, unknown>;
    let result: unknown;
    let threw = false;
    try {
      result = await invoke(step.cmd, args);
    } catch {
      threw = true;
    }

    if (step.expect?.error) {
      if (!threw) {
        throw new Error(`Step ${i} (${step.cmd}) expected error but succeeded`);
      }
    } else {
      if (threw) {
        throw new Error(`Step ${i} (${step.cmd}) failed unexpectedly`);
      }
      if (step.expect) {
        if ("result" in step.expect) {
          expect(result).toEqual(step.expect.result);
        } else if ("fields" in step.expect && step.expect.fields) {
          checkFields(result, step.expect.fields);
        }
      }
    }

    if (step.capture) {
      for (const [varName, path] of Object.entries(step.capture)) {
        vars[varName] = extractPath(result, path);
      }
    }
  }
}

describe.each(["mock", "web"] as const)("%s backend conformance", (backendKind) => {
  for (const c of cases as TestCase[]) {
    const itFn = c.skip?.[backendKind] ? it.skip : it;
    itFn(c.name, async () => {
      let invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      if (backendKind === "mock") {
        sessionStorage.clear();
        const backend = new MockBackend({ notes: {} });
        invoke = (cmd, args) => backend.invoke(cmd, args);
      } else {
        installIdbStub();
        const backend = new WebBackend("0.0.0");
        invoke = (cmd, args) => backend.invoke(cmd, args);
      }
      await runCase(invoke, c);
    });
  }
});
