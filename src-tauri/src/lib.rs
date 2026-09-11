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
fn set_color_mode(app: AppHandle, mode: storage::ColorMode) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.color_mode = mode;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn set_word_wrap(app: AppHandle, enabled: bool) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.word_wrap = enabled;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn set_readable_line_length(app: AppHandle, enabled: bool) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.readable_line_length = enabled;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn set_auto_check_updates(app: AppHandle, enabled: bool) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.auto_check_updates = enabled;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
fn set_theme_mode(app: AppHandle, mode: storage::ThemeMode) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.theme_mode = mode;
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
fn write_note(
    app: AppHandle,
    filename: String,
    content: String,
    expected_hash: Option<String>,
) -> Result<storage::FileMetadata, String> {
    storage::write_note(&app, &filename, &content, expected_hash.as_deref())
}

#[tauri::command]
fn get_file_metadata(app: AppHandle, filename: String) -> Result<storage::FileMetadata, String> {
    storage::get_file_metadata(&app, &filename)
}

#[tauri::command]
fn read_note_with_metadata(
    app: AppHandle,
    filename: String,
) -> Result<storage::NoteWithMetadata, String> {
    storage::read_note_with_metadata(&app, &filename)
}

#[tauri::command]
fn write_conflict_copy(app: AppHandle, name: String, content: String) -> Result<String, String> {
    storage::write_conflict_copy(&app, &name, &content)
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
    last_opened_date: Option<String>,
) -> Result<(), String> {
    storage::write_tab_session(
        &app,
        &storage::TabSession { open_tabs, active_tab, last_opened_date },
    )
}

/// Window starts hidden (see `tauri.conf.json`) so it can be shown only
/// once its background already matches the theme it's about to render —
/// otherwise the OS paints the window's own default (white) canvas for
/// the brief span between window creation and the webview's first real
/// paint, which is the actual source of the launch-time white flash (the
/// app's own CSS is already dark by default and paints correctly the
/// moment the webview does render; the flash happens entirely before
/// that point).
///
/// #48: `window.theme()` only reports the *OS*'s theme — correct for the
/// `System` setting (still the only thing this read alone can tell us),
/// but wrong the moment the user has pinned an explicit `Light`/`Dark`
/// that disagrees with it (a dark-OS user who picked "Light" would still
/// flash dark, then repaint light once the CSS's `[data-theme]` override
/// kicks in). Reading the saved config here — before the window is ever
/// shown — lets the *chosen* theme win the pre-paint colour, same as the
/// CSS will once it loads.
fn show_window_without_flash(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let configured = storage::load_config(app.handle()).ok().map(|c| c.theme_mode);
    let is_light = match configured {
        Some(storage::ThemeMode::Light) => true,
        Some(storage::ThemeMode::Dark) => false,
        _ => matches!(window.theme(), Ok(tauri::Theme::Light)),
    };
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            show_window_without_flash(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_notes_dir,
            set_color_mode,
            set_word_wrap,
            set_readable_line_length,
            set_auto_check_updates,
            set_theme_mode,
            list_note_files,
            read_note,
            write_note,
            get_file_metadata,
            read_note_with_metadata,
            write_conflict_copy,
            read_all_notes,
            read_tab_session,
            write_tab_session,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
