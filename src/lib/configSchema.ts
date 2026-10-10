/**
 * Must equal the Rust `CONFIG_SCHEMA_VERSION` constant in `src-tauri/src/storage.rs`.
 * Bump when a migration is added.
 */
export const CONFIG_SCHEMA_VERSION = 1;

/**
 * Returns true when the loaded config was written by a newer version of the app.
 */
export function isFromNewerApp(schemaVersion: number | undefined): boolean {
  return typeof schemaVersion === "number" && schemaVersion > CONFIG_SCHEMA_VERSION;
}
