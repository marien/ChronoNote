/**
 * Command contract test.
 *
 * The frontend mock is type-checked against `TauriCommands`, but Rust is not.
 * A misspelt command or argument name passes every unit and mock test, and only
 * fails at runtime in the installed app when Tauri fails to deserialize the IPC payload.
 *
 * This test statically parses the Rust commands in `src-tauri/src/` and verifies:
 * 1. Every `#[tauri::command]` is registered in `generate_handler!`, and vice versa.
 * 2. Every registered Rust command is present in `TauriCommands` (and vice versa, minus `WEB_ONLY`).
 * 3. The frontend-visible argument names (converted to camelCase) match between Rust and TypeScript.
 */

import { describe, expect, it } from "vitest";
// @ts-expect-error node:fs has no type definitions in browser tsconfig
import * as fs from "node:fs";
// @ts-expect-error node:path has no type definitions in browser tsconfig
import * as path from "node:path";
import ts from "typescript";

function findRsFiles(dir: string): string[] {
  let results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findRsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".rs")) {
      results.push(full);
    }
  }
  return results;
}

export function isInjectedType(typeStr: string): boolean {
  const cleaned = typeStr.trim().replace(/^&/, "").trim();
  return /^(tauri::)?(AppHandle|State<.*>|Window|WebviewWindow|Webview)(\b|$)/.test(cleaned);
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function splitParams(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "<" || ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
    } else if (ch === ">" || ch === ")" || ch === "]" || ch === "}") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseRustCommandSignatures(content: string): Map<string, string[]> {
  const commands = new Map<string, string[]>();
  const regex =
    /#\[tauri::command(?:\(([^)]*)\))?\][\s\S]*?(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*(?:<[^>]*>)?\s*\(([\s\S]*?)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const attrArgs = match[1] || "";
    const fnName = match[2];
    const rawParams = match[3];

    const renameMatch = /rename_all\s*=\s*"([^"]+)"/.exec(attrArgs);
    const renameAll = renameMatch ? renameMatch[1] : "camelCase";

    const params = splitParams(rawParams);
    const keptParams: string[] = [];
    for (const p of params) {
      const colonIdx = p.indexOf(":");
      if (colonIdx === -1) continue;
      const rawName = p.slice(0, colonIdx).trim().replace(/^mut\s+/, "").replace(/^_/, "");
      const rawType = p.slice(colonIdx + 1).trim();
      if (!isInjectedType(rawType)) {
        const finalName = renameAll === "snake_case" ? rawName : snakeToCamel(rawName);
        keptParams.push(finalName);
      }
    }
    if (!commands.has(fnName)) {
      commands.set(fnName, keptParams);
    }
  }
  return commands;
}

export function parseGenerateHandler(content: string): Set<string> {
  const match = /tauri::generate_handler!\[([\s\S]*?)\]/.exec(content);
  if (!match) throw new Error("tauri::generate_handler! not found");
  const names = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split("::").pop()!);
  return new Set(names);
}

export function parseTypeScriptCommands(filePath: string): Map<string, string[]> {
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) throw new Error(`Could not load source file: ${filePath}`);

  let commandsInterface: ts.InterfaceDeclaration | null = null;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "TauriCommands") {
      commandsInterface = node;
    }
  });

  if (!commandsInterface) {
    throw new Error(`interface TauriCommands not found in ${filePath}`);
  }

  const tsCommands = new Map<string, string[]>();
  for (const member of (commandsInterface as ts.InterfaceDeclaration).members) {
    if (ts.isPropertySignature(member) && member.name) {
      const cmdName = member.name.getText(sourceFile);
      const memberType = checker.getTypeAtLocation(member);
      const argsProp = memberType.getProperty("args");
      if (argsProp) {
        const argsType = checker.getTypeOfSymbolAtLocation(argsProp, member);
        const props = checker.getPropertiesOfType(argsType);
        tsCommands.set(
          cmdName,
          props.map((p) => p.name),
        );
      }
    }
  }
  return tsCommands;
}

// Commands implemented only by the browser backend (webBackend.ts / IndexedDB + Graph API), not in Rust.
const WEB_ONLY = new Set([
  "onedrive_login",
  "onedrive_logout",
  "onedrive_get_account",
  "onedrive_list_folders",
  "onedrive_create_folder",
  "onedrive_set_folder",
  "onedrive_prepare_folder_switch",
  "onedrive_get_folder",
  "onedrive_exchange_code",
  "onedrive_sync_now",
  "onedrive_get_conflicts",
  "onedrive_resolve_conflict",
  "onedrive_get_sync_status",
  "onedrive_get_advanced_config",
  "onedrive_set_advanced_config",
  "web_check_browser_notes",
  "web_migrate_browser_notes",
  "get_sync_health",
]);

describe("commandContract", () => {
  it("parses multi-line signatures and filters injected parameters", () => {
    const sample = `
      #[tauri::command]
      pub async fn sample_command(
        app: AppHandle,
        state: State<'_, AppState>,
        note_id: String,
        on_event: Channel<EventPayload>,
      ) -> Result<(), String> {
        Ok(())
      }
    `;
    const parsed = parseRustCommandSignatures(sample);
    expect(parsed.get("sample_command")).toEqual(["noteId", "onEvent"]);
  });

  it("ensures every #[tauri::command] is registered in generate_handler! and vice versa", () => {
    const rsFiles = findRsFiles(path.resolve("src-tauri/src"));
    const allRustCommands = new Map<string, string[]>();

    for (const f of rsFiles) {
      const content = fs.readFileSync(f, "utf8");
      for (const [name, params] of parseRustCommandSignatures(content)) {
        if (!allRustCommands.has(name)) {
          allRustCommands.set(name, params);
        }
      }
    }

    const libContent = fs.readFileSync(path.resolve("src-tauri/src/lib.rs"), "utf8");
    const registered = parseGenerateHandler(libContent);

    for (const name of allRustCommands.keys()) {
      expect(registered.has(name), `Command ${name} has #[tauri::command] but is not in generate_handler!`).toBe(true);
    }

    for (const name of registered) {
      expect(allRustCommands.has(name), `Command ${name} is in generate_handler! but has no #[tauri::command]`).toBe(true);
    }
  });

  it("matches TauriCommands interface against registered Rust commands and argument names", () => {
    const rsFiles = findRsFiles(path.resolve("src-tauri/src"));
    const allRustCommands = new Map<string, string[]>();

    for (const f of rsFiles) {
      const content = fs.readFileSync(f, "utf8");
      for (const [name, params] of parseRustCommandSignatures(content)) {
        if (!allRustCommands.has(name)) {
          allRustCommands.set(name, params);
        }
      }
    }

    const libContent = fs.readFileSync(path.resolve("src-tauri/src/lib.rs"), "utf8");
    const registered = parseGenerateHandler(libContent);

    const tsFile = path.resolve("src/lib/tauriCommands.ts");
    const tsCommands = parseTypeScriptCommands(tsFile);

    // 1. Every registered Rust command must be in TauriCommands
    const missingInTs = [...registered].filter((name) => !tsCommands.has(name));
    expect(missingInTs, `Registered Rust commands missing from TauriCommands: ${missingInTs.join(", ")}`).toEqual([]);

    // 2. Stale allowlist check: no WEB_ONLY command may be registered in Rust
    for (const name of WEB_ONLY) {
      expect(registered.has(name), `Stale allowlist: ${name} is registered in Rust`).toBe(false);
    }

    // 3. Every TauriCommands entry must be a registered Rust command, EXCEPT WEB_ONLY
    const unexpectedInTs = [...tsCommands.keys()].filter(
      (name) => !registered.has(name) && !WEB_ONLY.has(name),
    );
    expect(
      unexpectedInTs,
      `TauriCommands entries not registered in Rust and not in WEB_ONLY: ${unexpectedInTs.join(", ")}`,
    ).toEqual([]);

    // 4. For every command in both: the set of argument names must be equal.
    // Report all mismatches in ONE assertion message, one line per command: name: rust [a, b] vs ts [a, c]
    const mismatches: string[] = [];
    for (const [name, rustParams] of allRustCommands) {
      if (registered.has(name) && tsCommands.has(name)) {
        const tsParams = tsCommands.get(name)!;
        const rSorted = [...rustParams].sort();
        const tSorted = [...tsParams].sort();
        if (JSON.stringify(rSorted) !== JSON.stringify(tSorted)) {
          mismatches.push(`${name}: rust [${rustParams.join(", ")}] vs ts [${tsParams.join(", ")}]`);
        }
      }
    }
    expect(mismatches.join("\n"), `Argument name mismatches:\n${mismatches.join("\n")}`).toBe("");
  });
});
