mod storage;

use tauri::AppHandle;

#[tauri::command]
fn get_config(app: AppHandle) -> Result<storage::AppConfig, String> {
    storage::load_config(&app)
}

#[tauri::command]
fn set_notes_dir(app: AppHandle, path: String) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.notes_dir = path;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_notes_dir,
            set_color_mode,
            list_note_files,
            read_note,
            write_note,
            read_all_notes,
            read_tab_session,
            write_tab_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
