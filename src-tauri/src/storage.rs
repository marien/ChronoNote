use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Persisted app configuration. Lives outside the notes folder, in the
/// OS-appropriate app config directory (e.g. %APPDATA%\com.chrononote.app on
/// Windows, ~/.config/com.chrononote.app on Linux, ~/Library/Application
/// Support/com.chrononote.app on macOS) as `config.json`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub notes_dir: String,
    #[serde(default = "default_color_mode")]
    pub color_mode: String,
    /// Soft word-wrap in the editor (§80). Off by default — the app's
    /// tabular-monospace-grid tenet assumes no wrapping; this is an
    /// opt-in for prose-heavy notes. `#[serde(default)]` gives `false`
    /// for a config written before this field existed.
    #[serde(default)]
    pub word_wrap: bool,
    /// Up to 5 previously-used notes folders, most-recent-first, excluding
    /// whatever is current — spec §39. Maintained by `set_notes_dir`
    /// alone, so switching folders by hand-editing this file (as this
    /// project's own stress testing did) never adds spurious entries.
    #[serde(default)]
    pub recent_notes_dirs: Vec<String>,
}

fn default_color_mode() -> String {
    "grayscale".to_string()
}

const MAX_RECENT_NOTES_DIRS: usize = 5;

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

/// Crash-atomic, durable file write (§1.2). Streams `contents` into a
/// sibling temp file in the *same* directory (so the commit is a
/// same-filesystem rename), forces it to physical media with `sync_all`,
/// then atomically renames it over `path`. A crash at any point leaves
/// either the complete old file or the complete new one — never the
/// truncated or zero-byte note `fs::write` can produce when it dies
/// mid-stream. `NamedTempFile` unlinks itself on drop, so a failure
/// before the rename leaves nothing behind.
fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::Builder::new()
        .prefix(".chrono-")
        .suffix(".tmp")
        .tempfile_in(dir)?;
    tmp.write_all(contents)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path).map_err(|e| e.error)?;
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

fn load_config_at(path: &Path, default_notes_dir: &Path) -> Result<AppConfig, String> {
    if path.exists() {
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    } else {
        let cfg = AppConfig {
            notes_dir: default_notes_dir.to_string_lossy().to_string(),
            color_mode: default_color_mode(),
            word_wrap: false,
            recent_notes_dirs: Vec::new(),
        };
        save_config_at(path, &cfg)?;
        Ok(cfg)
    }
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

fn write_note_at(root: &Path, filename: &str, content: &str) -> Result<(), String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let target = resolve_workspace_path(root, Path::new(filename)).map_err(String::from)?;
    atomic_write(&target, content.as_bytes()).map_err(|e| e.to_string())
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

#[derive(Serialize, Deserialize, Clone, Default)]
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
    pub last_opened_date: Option<String>,
}

fn read_tab_session_at(root: &Path) -> Result<Option<TabSession>, String> {
    let path = root.join(SESSION_FILENAME);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string())
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

pub fn write_note(app: &AppHandle, filename: &str, content: &str) -> Result<(), String> {
    write_note_at(&notes_root(app)?, filename, content)
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
        assert_eq!(cfg.color_mode, "grayscale");
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
            color_mode: "color".to_string(),
            word_wrap: true,
            recent_notes_dirs: vec!["/old1".to_string(), "/old2".to_string()],
        };
        save_config_at(&path, &cfg).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.notes_dir, "/my/notes");
        assert_eq!(loaded.color_mode, "color");
        assert!(loaded.word_wrap);
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
        assert_eq!(loaded.color_mode, "grayscale");
        assert!(!loaded.word_wrap);
        assert!(loaded.recent_notes_dirs.is_empty());
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
        write_note_at(dir.path(), "2026-09-07.txt", "hello world").unwrap();
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
        write_note_at(&root, "2026-09-07.txt", "content").unwrap();
        assert!(root.join("2026-09-07.txt").exists());
    }

    #[test]
    fn read_and_write_note_reject_an_invalid_filename() {
        let dir = tempdir().unwrap();
        assert!(read_note_at(dir.path(), "not-a-date.txt").is_err());
        assert!(write_note_at(dir.path(), "../escape.txt", "x").is_err());
    }

    #[test]
    fn read_all_notes_returns_every_valid_file_with_its_content() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "first").unwrap();
        write_note_at(dir.path(), "2026-09-02.txt", "second").unwrap();
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
    fn write_note_at_round_trips_through_the_atomic_path() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "content").unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "updated").unwrap();
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

    // --- tab session ---

    #[test]
    fn read_tab_session_returns_none_when_no_session_file_exists() {
        let dir = tempdir().unwrap();
        assert!(read_tab_session_at(dir.path()).unwrap().is_none());
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
        write_note_at(dir.path(), "2026-09-01.txt", "note").unwrap();
        write_tab_session_at(dir.path(), &TabSession::default()).unwrap();
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-01.txt"]);
    }
}
