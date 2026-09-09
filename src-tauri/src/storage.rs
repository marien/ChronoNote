use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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
    fs::write(path, raw).map_err(|e| e.to_string())
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
    fs::write(root.join(filename), content).map_err(|e| e.to_string())
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
    fs::write(root.join(SESSION_FILENAME), raw).map_err(|e| e.to_string())
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
