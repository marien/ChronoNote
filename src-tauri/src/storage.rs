use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use ts_rs::TS;

/// Editor glyph colouring — the accent-hued set (§1's "colour" mode) or
/// the weight/opacity-only greyscale set. Stored in `config.json`;
/// deserialization now rejects anything else (an invalid value trips the
/// §97 corrupt-config recovery instead of silently passing through, as it
/// did while this was a bare `String`).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default, TS)]
#[serde(rename_all = "lowercase")]
pub enum ColorMode {
    Color,
    #[default]
    Grayscale,
}

/// Persisted app configuration. Lives outside the notes folder, in the
/// OS-appropriate app config directory (e.g. %APPDATA%\com.chrononote.app on
/// Windows, ~/.config/com.chrononote.app on Linux, ~/Library/Application
/// Support/com.chrononote.app on macOS) as `config.json`.
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub notes_dir: String,
    #[serde(default)]
    pub color_mode: ColorMode,
    /// Soft word-wrap in the editor (§80). Off by default — the app's
    /// tabular-monospace-grid tenet assumes no wrapping; this is an
    /// opt-in for prose-heavy notes. `#[serde(default)]` gives `false`
    /// for a config written before this field existed.
    #[serde(default)]
    pub word_wrap: bool,
    /// §99: cap the editor's text column to a comfortable reading measure
    /// (~720px, centred) instead of spanning the full window. On by
    /// default, but only *takes effect* when `word_wrap` is also on — with
    /// wrapping off (the default), a narrower column would just force
    /// horizontal scrolling of wide tables in a smaller box, which is the
    /// opposite of what wrap-off is for. `#[serde(default = ...)]` so a
    /// config written before this field existed still gets `true`.
    #[serde(default = "default_readable_line_length")]
    pub readable_line_length: bool,
    /// Up to 5 previously-used notes folders, most-recent-first, excluding
    /// whatever is current — spec §39. Maintained by `set_notes_dir`
    /// alone, so switching folders by hand-editing this file (as this
    /// project's own stress testing did) never adds spurious entries.
    #[serde(default)]
    pub recent_notes_dirs: Vec<String>,
}

const MAX_RECENT_NOTES_DIRS: usize = 5;

fn default_readable_line_length() -> bool {
    true
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn default_notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let doc_dir = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(doc_dir.join("Notes"))
}

// --- Path-parameterized cores ---------------------------------------------
//
// Every function below takes an explicit path instead of resolving one from
// an `AppHandle` itself — that's the only thing separating them from the
// public, Tauri-command-facing functions further down (each of which is
// just "resolve the real path, then call the `_at` version"). Splitting it
// out this way means the actual file-handling logic can be unit tested
// directly against a `tempfile::tempdir()`, without needing a running Tauri
// app (`AppHandle::path()` resolves real OS directories — `app_config_dir`/
// `document_dir` — which isn't something a plain `#[test]` can fake without
// either this split or standing up a full mock app pointed at a temp HOME).

// --- Durable, confined disk writes (§1) ----------------------------------

/// Errors from the workspace-confinement guard. The rest of this module
/// still surfaces failures as `String` (mapped at the Tauri-command
/// boundary); this dedicated type exists only where a caller or test
/// needs to tell "the requested path would escape the workspace" apart
/// from an ordinary I/O failure.
#[derive(Debug)]
enum StorageError {
    /// The resolved path lies outside the canonical workspace root —
    /// `..` traversal, an absolute override, or a symlink pointing out.
    PathEscapesWorkspace,
    Io(std::io::Error),
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::PathEscapesWorkspace => write!(f, "path escapes the workspace root"),
            StorageError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        StorageError::Io(e)
    }
}

impl From<StorageError> for String {
    fn from(e: StorageError) -> Self {
        e.to_string()
    }
}

/// Resolve `rel` against `workspace` and guarantee the result stays
/// inside it, following symlinks (§1.1). `..` components, absolute
/// paths, and symlinks that escape the tree all fail with
/// `StorageError::PathEscapesWorkspace`. Daily-note filenames are already
/// shape-checked by `is_valid_note_filename` before any join reaches
/// here, so in practice this is defense-in-depth on the workspace root
/// itself — but it's the single chokepoint every note write now passes
/// through.
fn resolve_workspace_path(workspace: &Path, rel: &Path) -> Result<PathBuf, StorageError> {
    // Canonicalize the root so the containment check compares like with
    // like. `dunce` keeps Windows paths as `C:\…` rather than the `\\?\`
    // verbatim form `std::fs::canonicalize` yields, which `starts_with`
    // wouldn't match against a plain root.
    let canonical_root = dunce::canonicalize(workspace)?;

    // Rebuild the path one component at a time, refusing anything that
    // could climb out lexically before we ever touch the filesystem.
    let mut resolved = canonical_root.clone();
    for comp in rel.components() {
        match comp {
            Component::Normal(c) => resolved.push(c),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(StorageError::PathEscapesWorkspace);
            }
        }
    }

    // Then defeat symlinks: canonicalize the target (or, if it doesn't
    // exist yet, its containing directory) and confirm it's still under
    // the root.
    let anchor = match dunce::canonicalize(&resolved) {
        Ok(p) => p,
        Err(_) => match resolved.parent() {
            Some(parent) => dunce::canonicalize(parent).unwrap_or_else(|_| resolved.clone()),
            None => resolved.clone(),
        },
    };
    if anchor.starts_with(&canonical_root) {
        Ok(resolved)
    } else {
        Err(StorageError::PathEscapesWorkspace)
    }
}

/// Serializes every `atomic_write` in the process. ChronoNote's own code
/// can fire two writes for the same note near-simultaneously (an autosave
/// timer and an Action-Drawer edit, say); on Windows the second one's
/// rename would then hit `ERROR_ACCESS_DENIED` because the target is
/// momentarily open. Writes are sub-millisecond and rare, so one global
/// lock is simpler and safer than per-path locking, and it makes the
/// rename retry below only about *external* interference.
static WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(windows)]
fn is_transient_rename_error(e: &std::io::Error) -> bool {
    // ERROR_ACCESS_DENIED (5) / ERROR_SHARING_VIOLATION (32) — the target
    // is briefly locked by an AV scanner, a cloud-sync client, or Explorer.
    matches!(e.raw_os_error(), Some(5) | Some(32))
}
#[cfg(not(windows))]
fn is_transient_rename_error(_e: &std::io::Error) -> bool {
    false
}

/// Crash-atomic, durable file write (§1.2). Streams `contents` into a
/// sibling temp file in the *same* directory (so the commit is a
/// same-filesystem rename), forces it to physical media with `sync_all`,
/// then atomically renames it over `path`. A crash at any point leaves
/// either the complete old file or the complete new one — never the
/// truncated or zero-byte note `fs::write` can produce when it dies
/// mid-stream. `NamedTempFile` unlinks itself on drop, so a failure
/// before the rename leaves nothing behind.
fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::Builder::new()
        .prefix(".chrono-")
        .suffix(".tmp")
        .tempfile_in(dir)?;
    tmp.write_all(contents)?;
    tmp.as_file().sync_all()?;

    // The global lock removes contention from *our* writes; a cloud-sync
    // client or an AV scanner can still hold the target open for a few
    // milliseconds. Retry the rename a handful of times before giving up.
    let mut attempt = 0u32;
    loop {
        match tmp.persist(path) {
            Ok(_) => break,
            Err(e) if attempt < 8 && is_transient_rename_error(&e.error) => {
                tmp = e.file; // persist hands the temp file back on failure
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(u64::from(attempt) * 15));
            }
            Err(e) => return Err(e.error),
        }
    }

    // Directory-entry durability: on Unix the rename isn't guaranteed
    // persisted until the containing directory is fsynced too. Opening a
    // directory for `sync_all` is a no-op / unsupported on Windows, where
    // `MoveFileEx` already commits the metadata.
    #[cfg(unix)]
    if let Ok(dir_handle) = fs::File::open(dir) {
        let _ = dir_handle.sync_all();
    }
    Ok(())
}

/// A JSON sidecar (`config.json`, `.chrononote-session.json`) that won't
/// parse is renamed aside as `<name>.corrupt-<unix-ms>` so the app can
/// fall back to a fresh default instead of refusing to boot — while the
/// bad bytes stay on disk for a post-mortem. Best-effort: a failed rename
/// just logs (the caller still falls back). The quarantine name is long
/// and un-dated-looking, so `is_valid_note_filename` never picks it up as
/// a note even when it lands in the notes folder.
fn quarantine_corrupt_file(path: &Path) {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut aside = path.as_os_str().to_owned();
    aside.push(format!(".corrupt-{stamp}"));
    if let Err(e) = fs::rename(path, &aside) {
        eprintln!("chrononote: could not quarantine corrupt {}: {e}", path.display());
    }
}

fn load_config_at(path: &Path, default_notes_dir: &Path) -> Result<AppConfig, String> {
    if path.exists() {
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        match serde_json::from_str(&raw) {
            Ok(cfg) => return Ok(cfg),
            // Corrupt or truncated (a mid-write crash from before atomic
            // writes, disk rot, a botched hand-edit). Set it aside and
            // rebuild a default rather than leave the app unbootable.
            Err(_) => quarantine_corrupt_file(path),
        }
    }
    let cfg = AppConfig {
        notes_dir: default_notes_dir.to_string_lossy().to_string(),
        color_mode: ColorMode::default(),
        word_wrap: false,
        readable_line_length: default_readable_line_length(),
        recent_notes_dirs: Vec::new(),
    };
    save_config_at(path, &cfg)?;
    Ok(cfg)
}

fn save_config_at(path: &Path, cfg: &AppConfig) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    atomic_write(path, raw.as_bytes()).map_err(|e| e.to_string())
}

/// Records `old_path` (the folder just switched away from) into the
/// recent-folders list, and removes `new_path` from it — `new_path` is
/// about to become current, so it shouldn't also appear as "other folders
/// to switch to". Deduped and capped at `MAX_RECENT_NOTES_DIRS`,
/// most-recent-first.
pub fn push_recent_notes_dir(recent: &mut Vec<String>, old_path: &str, new_path: &str) {
    recent.retain(|p| p != new_path && p != old_path);
    recent.insert(0, old_path.to_string());
    recent.truncate(MAX_RECENT_NOTES_DIRS);
}

/// Daily note filenames must be exactly `YYYY-MM-DD.txt`. This is both the
/// spec's naming scheme and a guard against path traversal, since the value
/// arrives from the frontend and is joined directly onto the notes root.
fn is_valid_note_filename(filename: &str) -> bool {
    let b = filename.as_bytes();
    b.len() == 14
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..10].iter().all(u8::is_ascii_digit)
        && &filename[10..] == ".txt"
}

fn list_note_files_at(root: &Path) -> Result<Vec<String>, String> {
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            if is_valid_note_filename(name) {
                out.push(name.to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

fn read_note_at(root: &Path, filename: &str) -> Result<Option<String>, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let path = root.join(filename);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

// --- External-modification detection (§2 / §94) -------------------------

/// The subdirectory `write_conflict_copy` drops "keep my version" copies
/// into when the on-disk note changed under the user's feet. Inside the
/// notes folder, hidden, and invisible to `list_note_files_at` /
/// `read_all_notes_at` because `is_valid_note_filename` rejects both the
/// directory name and the timestamped `.txt` files it holds.
const CONFLICTS_DIRNAME: &str = ".chrononote-conflicts";

/// Prefix on the error returned by `write_note_at` when an `expected_hash`
/// guard fails — the note on disk is no longer what the caller last saw.
/// The frontend matches on this to re-open the conflict prompt instead of
/// surfacing it as a generic save failure.
pub const CONFLICT_ERROR_PREFIX: &str = "conflict: note changed on disk";

/// What the frontend needs to tell whether a note file changed underneath
/// it: the SHA-256 of the current bytes (the authority — mtime is
/// unreliable across cloud-sync clients, which is the main case this
/// guards against), plus cheap corroborating signals.
#[derive(Serialize, Clone, PartialEq, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub exists: bool,
    /// SHA-256 hex of the file's bytes, or `None` when it doesn't exist.
    pub content_hash: Option<String>,
    pub size_bytes: Option<u64>,
    /// mtime in milliseconds since the Unix epoch, best-effort.
    pub modified_ms: Option<i64>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NoteWithMetadata {
    pub content: Option<String>,
    pub metadata: FileMetadata,
}

fn hash_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn file_metadata_at(root: &Path, filename: &str) -> Result<FileMetadata, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let path = root.join(filename);
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        // Only a genuine "not there" is `exists: false`. A transient
        // failure (a sync client or another editor holding the file
        // locked mid-write — the case §94 exists for) must surface as an
        // error so the frontend retries on its next trigger rather than
        // announcing a deletion.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(FileMetadata { exists: false, content_hash: None, size_bytes: None, modified_ms: None });
        }
        Err(e) => return Err(e.to_string()),
    };
    let modified_ms = fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    Ok(FileMetadata {
        exists: true,
        content_hash: Some(hash_bytes(&bytes)),
        size_bytes: Some(bytes.len() as u64),
        modified_ms,
    })
}

fn read_note_with_metadata_at(root: &Path, filename: &str) -> Result<NoteWithMetadata, String> {
    let content = read_note_at(root, filename)?;
    let metadata = file_metadata_at(root, filename)?;
    Ok(NoteWithMetadata { content, metadata })
}

/// Validates a conflict-copy filename from the frontend: a plain basename
/// ending `.txt`, no path separators or `..`. The timestamped name is
/// built frontend-side (it owns the local clock); this is the guard.
fn is_valid_conflict_filename(name: &str) -> bool {
    name.ends_with(".txt")
        && !name.is_empty()
        && name.len() <= 128
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && !name.contains("..")
}

fn write_conflict_copy_at(root: &Path, name: &str, content: &str) -> Result<String, String> {
    if !is_valid_conflict_filename(name) {
        return Err(format!("Invalid conflict-copy filename: {name}"));
    }
    let dir = root.join(CONFLICTS_DIRNAME);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = resolve_workspace_path(&dir, Path::new(name)).map_err(String::from)?;
    atomic_write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

fn write_note_at(
    root: &Path,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
) -> Result<FileMetadata, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;

    // §94: compare-and-swap. When the caller passes the hash it last saw,
    // refuse the write if the file has since changed — a blind overwrite
    // there would silently lose whatever landed on disk in between.
    if let Some(expected) = expected_hash {
        let current = file_metadata_at(root, filename)?.content_hash;
        if current.as_deref() != Some(expected) {
            return Err(format!("{CONFLICT_ERROR_PREFIX}: {filename}"));
        }
    }

    let target = resolve_workspace_path(root, Path::new(filename)).map_err(String::from)?;
    atomic_write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(FileMetadata {
        exists: true,
        content_hash: Some(hash_bytes(content.as_bytes())),
        size_bytes: Some(content.len() as u64),
        modified_ms: fs::metadata(&target)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64),
    })
}

fn read_all_notes_at(root: &Path) -> Result<Vec<(String, String)>, String> {
    let files = list_note_files_at(root)?;
    let mut out = vec![];
    for f in files {
        let content = fs::read_to_string(root.join(&f)).unwrap_or_default();
        out.push((f, content));
    }
    Ok(out)
}

/// Which tabs were open, and which was active, last time this specific
/// notes folder was used — spec §34. Deliberately stored *inside* the
/// notes folder itself (rather than alongside `notes_dir`/`color_mode` in
/// the global `config.json`) so the state travels with the folder if it's
/// ever moved or copied, and so switching between folders doesn't need a
/// growing map of every folder ever opened. `is_valid_note_filename`
/// already restricts the daily-note scan to exactly `YYYY-MM-DD.txt`, so
/// this file is never picked up as a note.
const SESSION_FILENAME: &str = ".chrononote-session.json";

#[derive(Serialize, Deserialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct TabSession {
    #[serde(default)]
    pub open_tabs: Vec<String>,
    #[serde(default)]
    pub active_tab: Option<String>,
    /// ISO date (`YYYY-MM-DD`) this folder was last opened on, as reported
    /// by the frontend. `None` for sessions written before #23 / for a
    /// folder never opened. Used at boot to detect the first launch of a
    /// new day and force today's note active regardless of `active_tab`.
    #[serde(default)]
    #[ts(optional = nullable)]
    pub last_opened_date: Option<String>,
}

fn read_tab_session_at(root: &Path) -> Result<Option<TabSession>, String> {
    let path = root.join(SESSION_FILENAME);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&raw) {
        Ok(session) => Ok(Some(session)),
        // Corrupt / truncated session — quarantine it and boot as if this
        // folder had no saved session (fresh today's-tab bootstrap).
        Err(_) => {
            quarantine_corrupt_file(&path);
            Ok(None)
        }
    }
}

fn write_tab_session_at(root: &Path, session: &TabSession) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    atomic_write(&root.join(SESSION_FILENAME), raw.as_bytes()).map_err(|e| e.to_string())
}

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
) -> Result<FileMetadata, String> {
    write_note_at(&notes_root(app)?, filename, content, expected_hash)
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

pub fn read_all_notes(app: &AppHandle) -> Result<Vec<(String, String)>, String> {
    read_all_notes_at(&notes_root(app)?)
}

pub fn read_tab_session(app: &AppHandle) -> Result<Option<TabSession>, String> {
    read_tab_session_at(&notes_root(app)?)
}

pub fn write_tab_session(app: &AppHandle, session: &TabSession) -> Result<(), String> {
    write_tab_session_at(&notes_root(app)?, session)
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
        FileMetadata::decl(&cfg),
        AppConfig::decl(&cfg),
        TabSession::decl(&cfg),
        NoteWithMetadata::decl(&cfg),
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    // --- is_valid_note_filename ---

    #[test]
    fn accepts_a_well_formed_daily_filename() {
        assert!(is_valid_note_filename("2026-09-07.txt"));
    }

    #[test]
    fn rejects_wrong_length_or_extension() {
        assert!(!is_valid_note_filename("2026-9-7.txt")); // not zero-padded
        assert!(!is_valid_note_filename("2026-09-07.md"));
        assert!(!is_valid_note_filename("2026-09-07"));
        assert!(!is_valid_note_filename(""));
    }

    #[test]
    fn rejects_non_digit_date_components() {
        assert!(!is_valid_note_filename("202X-09-07.txt"));
    }

    #[test]
    fn rejects_the_session_filename_itself() {
        assert!(!is_valid_note_filename(SESSION_FILENAME));
    }

    #[test]
    fn rejects_path_traversal_attempts() {
        // The filename arrives from the frontend and is joined directly
        // onto the notes root — this check is the only thing standing
        // between that and writing outside the notes folder.
        assert!(!is_valid_note_filename("../../etc/passwd"));
        assert!(!is_valid_note_filename("..\\..\\config.json"));
    }

    // --- push_recent_notes_dir ---

    #[test]
    fn push_recent_notes_dir_inserts_the_old_path_first() {
        let mut recent = vec![];
        push_recent_notes_dir(&mut recent, "/old", "/new");
        assert_eq!(recent, vec!["/old"]);
    }

    #[test]
    fn push_recent_notes_dir_dedupes_and_removes_the_new_path() {
        let mut recent = vec!["/a".to_string(), "/new".to_string(), "/old".to_string()];
        push_recent_notes_dir(&mut recent, "/old", "/new");
        // "/old" moves back to the front rather than appearing twice;
        // "/new" is gone since it's about to become current.
        assert_eq!(recent, vec!["/old", "/a"]);
    }

    #[test]
    fn push_recent_notes_dir_caps_at_five_most_recent() {
        let mut recent = vec![];
        for i in 0..5 {
            push_recent_notes_dir(&mut recent, &format!("/folder{i}"), "/current");
        }
        assert_eq!(recent.len(), 5);
        assert_eq!(recent[0], "/folder4");
        assert_eq!(recent[4], "/folder0");
    }

    // --- config load/save ---

    #[test]
    fn load_config_creates_a_default_when_none_exists() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        let default_dir = dir.path().join("Notes");
        let cfg = load_config_at(&path, &default_dir).unwrap();
        assert_eq!(cfg.notes_dir, default_dir.to_string_lossy());
        assert_eq!(cfg.color_mode, ColorMode::Grayscale);
        assert!(cfg.recent_notes_dirs.is_empty());
        // The default is also persisted, not just returned in memory.
        assert!(path.exists());
    }

    #[test]
    fn load_config_round_trips_a_saved_config() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        let cfg = AppConfig {
            notes_dir: "/my/notes".to_string(),
            color_mode: ColorMode::Color,
            word_wrap: true,
            readable_line_length: false,
            recent_notes_dirs: vec!["/old1".to_string(), "/old2".to_string()],
        };
        save_config_at(&path, &cfg).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.notes_dir, "/my/notes");
        assert_eq!(loaded.color_mode, ColorMode::Color);
        assert!(loaded.word_wrap);
        assert!(!loaded.readable_line_length);
        assert_eq!(loaded.recent_notes_dirs, vec!["/old1", "/old2"]);
    }

    #[test]
    fn load_config_defaults_color_mode_and_recent_dirs_when_omitted() {
        // An older config.json (or one hand-edited down to just
        // `notesDir`) should still load, defaulting the newer fields.
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir": "/hand/edited"}"#).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.notes_dir, "/hand/edited");
        assert_eq!(loaded.color_mode, ColorMode::Grayscale);
        assert!(!loaded.word_wrap);
        // Omitted from an older config → defaults on (§99).
        assert!(loaded.readable_line_length);
        assert!(loaded.recent_notes_dirs.is_empty());
    }

    #[test]
    fn load_config_recovers_from_a_corrupt_or_truncated_file() {
        for bad in [r#"{ not json at all"#, r#"{"notesDir": "/x", "colorMo"#, ""] {
            let dir = tempdir().unwrap();
            let path = dir.path().join("config.json");
            fs::write(&path, bad).unwrap();
            // Falls back to a fresh default rather than erroring...
            let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
            assert_eq!(loaded.notes_dir, dir.path().join("Notes").to_string_lossy());
            // ...the rebuilt config is now valid on disk...
            assert!(load_config_at(&path, &dir.path().join("Notes")).is_ok());
            // ...and the bad bytes were set aside, not deleted.
            let quarantined: Vec<_> = fs::read_dir(dir.path())
                .unwrap()
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| n.starts_with("config.json.corrupt-"))
                .collect();
            assert_eq!(quarantined.len(), 1, "expected one quarantine file, got {quarantined:?}");
            assert_eq!(fs::read_to_string(dir.path().join(&quarantined[0])).unwrap(), bad);
        }
    }

    // --- notes: list/read/write/read_all ---

    #[test]
    fn list_note_files_returns_empty_for_a_nonexistent_root() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("does-not-exist");
        assert_eq!(list_note_files_at(&missing).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn list_note_files_filters_out_non_matching_names_and_sorts() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("2026-09-05.txt"), "").unwrap();
        fs::write(root.join("2026-09-01.txt"), "").unwrap();
        fs::write(root.join("notes.md"), "").unwrap();
        fs::write(root.join(SESSION_FILENAME), "").unwrap();
        let files = list_note_files_at(root).unwrap();
        assert_eq!(files, vec!["2026-09-01.txt", "2026-09-05.txt"]);
    }

    #[test]
    fn write_then_read_note_round_trips() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "hello world", None).unwrap();
        let content = read_note_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(content, Some("hello world".to_string()));
    }

    #[test]
    fn read_note_returns_none_for_a_missing_file_rather_than_erroring() {
        let dir = tempdir().unwrap();
        let content = read_note_at(dir.path(), "2026-01-01.txt").unwrap();
        assert_eq!(content, None);
    }

    #[test]
    fn write_note_creates_the_notes_directory_if_missing() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("nested").join("notes");
        write_note_at(&root, "2026-09-07.txt", "content", None).unwrap();
        assert!(root.join("2026-09-07.txt").exists());
    }

    #[test]
    fn read_and_write_note_reject_an_invalid_filename() {
        let dir = tempdir().unwrap();
        assert!(read_note_at(dir.path(), "not-a-date.txt").is_err());
        assert!(write_note_at(dir.path(), "../escape.txt", "x", None).is_err());
    }

    #[test]
    fn read_all_notes_returns_every_valid_file_with_its_content() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "first", None).unwrap();
        write_note_at(dir.path(), "2026-09-02.txt", "second", None).unwrap();
        let mut all = read_all_notes_at(dir.path()).unwrap();
        all.sort();
        assert_eq!(
            all,
            vec![
                ("2026-09-01.txt".to_string(), "first".to_string()),
                ("2026-09-02.txt".to_string(), "second".to_string()),
            ]
        );
    }

    // --- atomic_write (§1.2) ---

    #[test]
    fn atomic_write_creates_and_reads_back() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("2026-09-07.txt");
        atomic_write(&path, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
    }

    #[test]
    fn atomic_write_replaces_existing_content_in_place() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("2026-09-07.txt");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
    }

    #[test]
    fn atomic_write_leaves_no_temp_files_behind() {
        let dir = tempdir().unwrap();
        atomic_write(&dir.path().join("2026-09-07.txt"), b"x").unwrap();
        let leftovers: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n != "2026-09-07.txt")
            .collect();
        assert!(leftovers.is_empty(), "unexpected files left behind: {leftovers:?}");
    }

    #[test]
    fn rapid_consecutive_writes_land_the_last_value() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("2026-09-07.txt");
        for i in 0..50 {
            atomic_write(&path, format!("rev {i}").as_bytes()).unwrap();
        }
        assert_eq!(fs::read_to_string(&path).unwrap(), "rev 49");
    }

    #[test]
    fn concurrent_writes_to_one_note_never_interleave_or_leave_litter() {
        // Two ChronoNote paths (autosave + a drawer action, say) can call
        // write_note_at for the same file near-simultaneously. Each write
        // must land whole — the reader must never see a mix of two
        // writers' bytes — and no `.chrono-*.tmp` may survive.
        let dir = tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let handles: Vec<_> = (0..6)
            .map(|w| {
                let root = root.clone();
                std::thread::spawn(move || {
                    let body = format!("writer {w}\n").repeat(40);
                    for _ in 0..25 {
                        write_note_at(&root, "2026-09-07.txt", &body, None).unwrap();
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        let content = read_note_at(&root, "2026-09-07.txt").unwrap().unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 40);
        assert!(lines.iter().all(|l| *l == lines[0]), "content interleaved: {content}");
        let stray: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n != "2026-09-07.txt")
            .collect();
        assert!(stray.is_empty(), "stray temp files after concurrent writes: {stray:?}");
    }

    #[test]
    fn write_note_at_round_trips_through_the_atomic_path() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "content", None).unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "updated", None).unwrap();
        assert_eq!(
            read_note_at(dir.path(), "2026-09-07.txt").unwrap(),
            Some("updated".to_string()),
        );
        // No stray temp files in the notes dir after repeated writes.
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["2026-09-07.txt"]);
    }

    // --- resolve_workspace_path (§1.1) ---

    #[test]
    fn resolve_workspace_path_allows_a_direct_child() {
        let dir = tempdir().unwrap();
        let resolved = resolve_workspace_path(dir.path(), Path::new("2026-09-07.txt")).unwrap();
        assert!(resolved.starts_with(dunce::canonicalize(dir.path()).unwrap()));
        assert!(resolved.ends_with("2026-09-07.txt"));
    }

    #[test]
    fn resolve_workspace_path_rejects_parent_traversal() {
        let dir = tempdir().unwrap();
        assert!(matches!(
            resolve_workspace_path(dir.path(), Path::new("../outside.txt")),
            Err(StorageError::PathEscapesWorkspace),
        ));
        assert!(matches!(
            resolve_workspace_path(dir.path(), Path::new("sub/../../outside.txt")),
            Err(StorageError::PathEscapesWorkspace),
        ));
    }

    #[test]
    fn resolve_workspace_path_rejects_an_absolute_path() {
        let dir = tempdir().unwrap();
        #[cfg(windows)]
        let abs = Path::new(r"C:\Windows\System32\drivers\etc\hosts");
        #[cfg(unix)]
        let abs = Path::new("/etc/passwd");
        assert!(matches!(
            resolve_workspace_path(dir.path(), abs),
            Err(StorageError::PathEscapesWorkspace),
        ));
    }

    #[test]
    #[cfg(unix)]
    fn resolve_workspace_path_rejects_a_symlink_that_escapes() {
        use std::os::unix::fs::symlink;
        let workspace = tempdir().unwrap();
        let outside = tempdir().unwrap();
        symlink(outside.path(), workspace.path().join("link")).unwrap();
        assert!(matches!(
            resolve_workspace_path(workspace.path(), Path::new("link/x.txt")),
            Err(StorageError::PathEscapesWorkspace),
        ));
    }

    // --- external-modification detection (§94) ---

    #[test]
    fn file_metadata_reports_absent_for_a_missing_note() {
        let dir = tempdir().unwrap();
        let m = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert!(!m.exists);
        assert_eq!(m.content_hash, None);
    }

    #[test]
    fn file_metadata_hash_changes_iff_content_changes() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "one", None).unwrap();
        let a = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "one", None).unwrap();
        let a2 = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "two", None).unwrap();
        let b = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(a.content_hash, a2.content_hash);
        assert_ne!(a.content_hash, b.content_hash);
        assert_eq!(a.size_bytes, Some(3));
    }

    #[test]
    fn write_note_returns_the_hash_it_wrote() {
        let dir = tempdir().unwrap();
        let meta = write_note_at(dir.path(), "2026-09-07.txt", "hello", None).unwrap();
        let read = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(meta.content_hash, read.content_hash);
    }

    #[test]
    fn read_note_with_metadata_agrees_with_get_file_metadata() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "body", None).unwrap();
        let r = read_note_with_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(r.content, Some("body".to_string()));
        assert_eq!(r.metadata.content_hash, file_metadata_at(dir.path(), "2026-09-07.txt").unwrap().content_hash);
    }

    #[test]
    fn write_note_with_a_matching_expected_hash_succeeds() {
        let dir = tempdir().unwrap();
        let m = write_note_at(dir.path(), "2026-09-07.txt", "v1", None).unwrap();
        let hash = m.content_hash.unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "v2", Some(&hash)).unwrap();
        assert_eq!(read_note_at(dir.path(), "2026-09-07.txt").unwrap(), Some("v2".to_string()));
    }

    #[test]
    fn write_note_with_a_stale_expected_hash_is_rejected_as_a_conflict() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "v1", None).unwrap();
        // Someone else changed the file since we last read it.
        write_note_at(dir.path(), "2026-09-07.txt", "external edit", None).unwrap();
        let err = write_note_at(dir.path(), "2026-09-07.txt", "our edit", Some("deadbeef")).unwrap_err();
        assert!(err.starts_with(CONFLICT_ERROR_PREFIX));
        // The file was NOT overwritten.
        assert_eq!(read_note_at(dir.path(), "2026-09-07.txt").unwrap(), Some("external edit".to_string()));
    }

    #[test]
    fn write_conflict_copy_lands_in_the_hidden_subdir_and_stays_invisible() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "real note", None).unwrap();
        let path = write_conflict_copy_at(dir.path(), "2026-09-07-143022.txt", "my unsaved version").unwrap();
        assert!(path.contains(CONFLICTS_DIRNAME));
        assert_eq!(
            fs::read_to_string(dir.path().join(CONFLICTS_DIRNAME).join("2026-09-07-143022.txt")).unwrap(),
            "my unsaved version",
        );
        // The conflicts dir and its files never show up as notes.
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-07.txt"]);
        assert_eq!(read_all_notes_at(dir.path()).unwrap().len(), 1);
    }

    #[test]
    fn write_conflict_copy_rejects_a_path_traversal_name() {
        let dir = tempdir().unwrap();
        assert!(write_conflict_copy_at(dir.path(), "../escape.txt", "x").is_err());
        assert!(write_conflict_copy_at(dir.path(), "sub/nested.txt", "x").is_err());
        assert!(write_conflict_copy_at(dir.path(), "no-extension", "x").is_err());
    }

    // --- tab session ---

    #[test]
    fn read_tab_session_returns_none_when_no_session_file_exists() {
        let dir = tempdir().unwrap();
        assert!(read_tab_session_at(dir.path()).unwrap().is_none());
    }

    #[test]
    fn read_tab_session_recovers_from_a_corrupt_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(SESSION_FILENAME);
        fs::write(&path, r#"{"openTabs": ["2026-09-01.txt"], "activeTab"#).unwrap(); // truncated
        // Boots as if there were no session, rather than erroring.
        assert!(read_tab_session_at(dir.path()).unwrap().is_none());
        assert!(!path.exists()); // the bad file was moved aside
        let quarantined: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with(&format!("{SESSION_FILENAME}.corrupt-")))
            .collect();
        assert_eq!(quarantined.len(), 1);
        // A quarantine file in the notes folder is never seen as a note.
        fs::write(dir.path().join("2026-09-05.txt"), "note").unwrap();
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-05.txt"]);
    }

    #[test]
    fn write_then_read_tab_session_round_trips() {
        let dir = tempdir().unwrap();
        let session = TabSession {
            open_tabs: vec!["2026-09-01.txt".to_string(), "2026-09-02.txt".to_string()],
            active_tab: Some("2026-09-02.txt".to_string()),
            last_opened_date: Some("2026-09-02".to_string()),
        };
        write_tab_session_at(dir.path(), &session).unwrap();
        let loaded = read_tab_session_at(dir.path()).unwrap().unwrap();
        assert_eq!(loaded.open_tabs, session.open_tabs);
        assert_eq!(loaded.active_tab, session.active_tab);
        assert_eq!(loaded.last_opened_date, session.last_opened_date);
    }

    #[test]
    fn tab_session_defaults_fields_when_omitted() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join(SESSION_FILENAME), "{}").unwrap();
        let loaded = read_tab_session_at(dir.path()).unwrap().unwrap();
        assert!(loaded.open_tabs.is_empty());
        assert_eq!(loaded.active_tab, None);
        assert_eq!(loaded.last_opened_date, None);
    }

    #[test]
    fn the_session_file_is_never_picked_up_by_list_note_files() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "note", None).unwrap();
        write_tab_session_at(dir.path(), &TabSession::default()).unwrap();
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-01.txt"]);
    }
}
