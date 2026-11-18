mod config;
mod disk;
mod import;
mod notes;
mod phone;
mod session;
mod versions;

pub use config::*;
pub use import::*;
pub use notes::*;
pub use session::*;
pub use versions::*;

use phone::{
    read_phone_inbox_at, read_phone_ledger_at, read_saved_searches_at, write_phone_ledger_at,
    write_phone_meetings_at, write_phone_outbox_at, write_saved_searches_at,
};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
#[cfg(test)]
use std::fs;
#[cfg(test)]
use std::path::Path;
#[cfg(test)]
use ts_rs::TS;

// --- Public, Tauri-command-facing functions --------------------------------
// Each just resolves the real path via `AppHandle`, then delegates to the
// path-parameterized core above. Behavior is unchanged from before this was
// split out — only where the path comes from moved.

fn notes_root(app: &AppHandle) -> Result<PathBuf, String> {
    let cfg = load_config(app)?;
    Ok(PathBuf::from(cfg.notes_dir))
}

pub fn load_config(app: &AppHandle) -> Result<AppConfig, String> {
    load_config_at(&config_path(app)?, &default_notes_dir(app)?)
}

pub fn save_config(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    save_config_at(&config_path(app)?, cfg)
}

pub fn list_note_files(app: &AppHandle) -> Result<Vec<String>, String> {
    list_note_files_at(&notes_root(app)?)
}

pub fn read_note(app: &AppHandle, filename: &str) -> Result<Option<String>, String> {
    read_note_at(&notes_root(app)?, filename)
}

pub fn write_note(
    app: &AppHandle,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
    keep_version: bool,
) -> Result<FileMetadata, String> {
    let root = notes_root(app)?;
    if keep_version {
        write_note_keeping_version_at(&root, filename, content, expected_hash)
    } else {
        write_note_at(&root, filename, content, expected_hash)
    }
}

pub fn delete_note(app: &AppHandle, filename: &str, expected_hash: Option<&str>) -> Result<(), String> {
    delete_note_at(&notes_root(app)?, filename, expected_hash)
}

pub fn list_trash(app: &AppHandle) -> Result<Vec<TrashItem>, String> {
    list_trash_at(&notes_root(app)?)
}

pub fn restore_from_trash(app: &AppHandle, name: &str) -> Result<String, String> {
    restore_from_trash_at(&notes_root(app)?, name)
}

pub fn get_file_metadata(app: &AppHandle, filename: &str) -> Result<FileMetadata, String> {
    file_metadata_at(&notes_root(app)?, filename)
}

pub fn read_note_with_metadata(app: &AppHandle, filename: &str) -> Result<NoteWithMetadata, String> {
    read_note_with_metadata_at(&notes_root(app)?, filename)
}

pub fn write_conflict_copy(app: &AppHandle, name: &str, content: &str) -> Result<String, String> {
    write_conflict_copy_at(&notes_root(app)?, name, content)
}

pub fn read_phone_inbox(app: &AppHandle) -> Result<Option<String>, String> {
    read_phone_inbox_at(&notes_root(app)?)
}

pub fn read_saved_searches(app: &AppHandle) -> Result<Option<String>, String> {
    read_saved_searches_at(&notes_root(app)?)
}

pub fn write_saved_searches(app: &AppHandle, content: &str) -> Result<(), String> {
    write_saved_searches_at(&notes_root(app)?, content)
}

fn app_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn read_phone_ledger(app: &AppHandle) -> Result<Option<String>, String> {
    read_phone_ledger_at(&app_data_root(app)?, &notes_root(app)?)
}

pub fn write_phone_ledger(app: &AppHandle, content: &str) -> Result<(), String> {
    write_phone_ledger_at(&app_data_root(app)?, &notes_root(app)?, content)
}

pub fn write_phone_meetings(app: &AppHandle, content: &str) -> Result<(), String> {
    write_phone_meetings_at(&notes_root(app)?, content)
}

pub fn write_phone_outbox(app: &AppHandle, content: &str) -> Result<(), String> {
    write_phone_outbox_at(&notes_root(app)?, content)
}

pub fn read_all_notes(app: &AppHandle) -> Result<Vec<(String, String)>, String> {
    read_all_notes_at(&notes_root(app)?)
}

pub fn read_tab_session(app: &AppHandle) -> Result<Option<TabSession>, String> {
    read_tab_session_at(&notes_root(app)?)
}

pub fn write_tab_session(app: &AppHandle, session: &TabSession) -> Result<(), String> {
    write_tab_session_at(&notes_root(app)?, session)
}

pub fn import_notes_bundle(
    app: &AppHandle,
    notes: &std::collections::HashMap<String, String>,
    mode: ImportMode,
) -> Result<ImportResult, String> {
    import_notes_bundle_at(&notes_root(app)?, notes, mode)
}

pub fn load_scratchpad_drafts(
    app: &AppHandle,
) -> Result<std::collections::HashMap<String, String>, String> {
    read_scratchpad_drafts_at(&scratchpad_drafts_path(app)?)
}

pub fn save_scratchpad_drafts(
    app: &AppHandle,
    drafts: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    write_scratchpad_drafts_at(&scratchpad_drafts_path(app)?, drafts)
}

pub fn list_versions(app: &AppHandle, filename: &str) -> Result<Vec<NoteVersion>, String> {
    list_versions_at(&notes_root(app)?, filename)
}

pub fn read_version(app: &AppHandle, filename: &str, name: &str) -> Result<String, String> {
    read_version_at(&notes_root(app)?, filename, name)
}

pub fn restore_version(app: &AppHandle, filename: &str, name: &str) -> Result<FileMetadata, String> {
    restore_version_at(&notes_root(app)?, filename, name)
}

pub fn clean_up_versions_and_trash(app: &AppHandle) -> Result<(), String> {
    clean_up_versions_and_trash_at(&notes_root(app)?, chrono::Local::now())
}

// --- TS binding generation (§98) ---------------------------------------
//
// The Rust payload structs are the single source of truth for their
// TypeScript shapes. This test (re)writes `src/lib/generated/
// tauri-types.ts` from the `#[derive(TS)]` types; CI fails if the checked-
// in file is stale (`git diff --exit-code`). Kept out of the `tests`
// module below so it runs even when that module is filtered.

#[cfg(test)]
#[test]
fn generate_typescript_bindings() {
    // `u64`/`i64` -> `number` (not `bigint`): our sizes are KB and mtimes
    // ~1.8e12 ms, both well inside a JS safe integer, and the frontend +
    // mock treat these as plain numbers.
    let cfg = ts_rs::Config::default().with_large_int("number");
    // Emitted deps-first so intra-file references resolve.
    let decls = [
        ColorMode::decl(&cfg),
        ThemeMode::decl(&cfg),
        LanguageMode::decl(&cfg),
        StartupTabMode::decl(&cfg),
        TabLabelStyle::decl(&cfg),
        PeekHeader::decl(&cfg),
        PeekGeometry::decl(&cfg),
        PeekConfig::decl(&cfg),
        FileMetadata::decl(&cfg),
        AppConfig::decl(&cfg),
        ConfigPatch::decl(&cfg),
        TabSession::decl(&cfg),
        NoteWithMetadata::decl(&cfg),
        ImportMode::decl(&cfg),
        ImportResult::decl(&cfg),
        TrashItem::decl(&cfg),
        NoteVersion::decl(&cfg),
        crate::agenda::AgendaDetails::decl(&cfg),

        // i18n Phase 2 (docs/design/i18n-roadmap.md): the small, stable
        // error-code shape a few commands/result fields return instead of
        // a bare `String`, so the frontend can translate the ones we
        // author ourselves.
        crate::error::AppError::decl(&cfg),
        // OneDrive wire types (Settings, folder picker, sync + conflict screen).
        crate::onedrive::OneDriveAccount::decl(&cfg),
        crate::onedrive::OneDriveLoginResult::decl(&cfg),
        crate::onedrive::OneDriveFolderItem::decl(&cfg),
        crate::onedrive::OneDriveFolderConfig::decl(&cfg),
        crate::onedrive::FolderSwitchBlocked::decl(&cfg),
        crate::onedrive::FolderSwitchResult::decl(&cfg),
        crate::onedrive::OneDriveSyncResult::decl(&cfg),
        crate::onedrive::SyncConflict::decl(&cfg),
        crate::onedrive::SyncHealth::decl(&cfg),
        crate::onedrive::SyncStatus::decl(&cfg),
        crate::onedrive::OneDriveAdvancedConfig::decl(&cfg),
    ];
    // ts-rs inlines each Rust doc comment as a `/* … */` block mid-decl,
    // which reads badly on one line. Strip those and collapse whitespace
    // so every type is a single tidy line — the `// GENERATED …` header
    // and `storage.rs` already point a reader at the source of truth.
    let body = decls
        .iter()
        .map(|d| format!("export {}\n", tidy_decl(d)))
        .collect::<Vec<_>>()
        .join("\n");
    let contents = format!(
        "// GENERATED by `cd src-tauri && cargo test` from the `#[derive(TS)]` structs\n\
         // in `src-tauri/src/storage.rs` (§98). Do not edit by hand — the Rust\n\
         // definitions are the source of truth, and CI fails if this file is stale.\n\
         \n{body}"
    );
    let out = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("src")
        .join("lib")
        .join("generated")
        .join("tauri-types.ts");
    fs::create_dir_all(out.parent().unwrap()).unwrap();
    // Only rewrite on a real change so an unrelated test run doesn't churn
    // the file's mtime.
    if fs::read_to_string(&out).ok().as_deref() != Some(&contents) {
        fs::write(&out, &contents).unwrap();
    }
}

/// Drop `/* … */` blocks (ts-rs emits doc comments as these) and collapse
/// every whitespace run — including newlines — to a single space, so a
/// `TS::decl` string becomes one clean line.
#[cfg(test)]
fn tidy_decl(decl: &str) -> String {
    let mut out = String::with_capacity(decl.len());
    let mut chars = decl.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut prev = '\0';
            for c2 in chars.by_ref() {
                if prev == '*' && c2 == '/' {
                    break;
                }
                prev = c2;
            }
        } else {
            out.push(c);
        }
    }
    out.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace(", }", " }")
        .replace("{  ", "{ ")
}
