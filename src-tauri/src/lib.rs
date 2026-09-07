mod storage;

use tauri::{AppHandle, Manager};

#[tauri::command]
fn get_config(app: AppHandle) -> Result<storage::AppConfig, String> {
    storage::load_config(&app)
}

#[tauri::command]
fn set_notes_dir(app: AppHandle, path: String) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    if cfg.notes_dir != path {
        let old_path = cfg.notes_dir.clone();
        storage::push_recent_notes_dir(&mut cfg.recent_notes_dirs, &old_path, &path);
    }
    cfg.notes_dir = path;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn set_color_mode(app: AppHandle, mode: String) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.color_mode = mode;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn list_note_files(app: AppHandle) -> Result<Vec<String>, String> {
    storage::list_note_files(&app)
}

#[tauri::command]
fn read_note(app: AppHandle, filename: String) -> Result<Option<String>, String> {
    storage::read_note(&app, &filename)
}

#[tauri::command]
fn write_note(app: AppHandle, filename: String, content: String) -> Result<(), String> {
    storage::write_note(&app, &filename, &content)
}

#[tauri::command]
fn read_all_notes(app: AppHandle) -> Result<Vec<(String, String)>, String> {
    storage::read_all_notes(&app)
}

#[tauri::command]
fn read_tab_session(app: AppHandle) -> Result<Option<storage::TabSession>, String> {
    storage::read_tab_session(&app)
}

#[tauri::command]
fn write_tab_session(
    app: AppHandle,
    open_tabs: Vec<String>,
    active_tab: Option<String>,
) -> Result<(), String> {
    storage::write_tab_session(&app, &storage::TabSession { open_tabs, active_tab })
}

/// Window starts hidden (see `tauri.conf.json`) so it can be shown only
/// once its background already matches the theme it's about to render —
/// otherwise the OS paints the window's own default (white) canvas for
/// the brief span between window creation and the webview's first real
/// paint, which is the actual source of the launch-time white flash (the
/// app's own CSS is already dark by default and paints correctly the
/// moment the webview does render; the flash happens entirely before
/// that point). Reading `window.theme()` before showing lets light-mode
/// users get a matching white background instead of an assumed dark one.
fn show_window_without_flash(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let is_light = matches!(window.theme(), Ok(tauri::Theme::Light));
    let color = if is_light {
        tauri::window::Color(255, 255, 255, 255)
    } else {
        tauri::window::Color(0x1e, 0x1e, 0x1e, 255)
    };
    let _ = window.set_background_color(Some(color));
    let _ = window.show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            show_window_without_flash(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_notes_dir,
            set_color_mode,
            list_note_files,
            read_note,
            write_note,
            read_all_notes,
            read_tab_session,
            write_tab_session,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
