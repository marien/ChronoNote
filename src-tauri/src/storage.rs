use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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
}

fn default_color_mode() -> String {
    "grayscale".to_string()
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

pub fn load_config(app: &AppHandle) -> Result<AppConfig, String> {
    let path = config_path(app)?;
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    } else {
        let dir = default_notes_dir(app)?;
        let cfg = AppConfig {
            notes_dir: dir.to_string_lossy().to_string(),
            color_mode: default_color_mode(),
        };
        save_config(app, &cfg)?;
        Ok(cfg)
    }
}

pub fn save_config(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
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

fn notes_root(app: &AppHandle) -> Result<PathBuf, String> {
    let cfg = load_config(app)?;
    Ok(PathBuf::from(cfg.notes_dir))
}

pub fn list_note_files(app: &AppHandle) -> Result<Vec<String>, String> {
    let root = notes_root(app)?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
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

pub fn read_note(app: &AppHandle, filename: &str) -> Result<Option<String>, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let path = notes_root(app)?.join(filename);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

pub fn write_note(app: &AppHandle, filename: &str, content: &str) -> Result<(), String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let root = notes_root(app)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    fs::write(root.join(filename), content).map_err(|e| e.to_string())
}

pub fn read_all_notes(app: &AppHandle) -> Result<Vec<(String, String)>, String> {
    let files = list_note_files(app)?;
    let root = notes_root(app)?;
    let mut out = vec![];
    for f in files {
        let content = fs::read_to_string(root.join(&f)).unwrap_or_default();
        out.push((f, content));
    }
    Ok(out)
}
