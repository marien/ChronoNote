mod agenda;
mod applog;
mod error;
mod onedrive;
mod peek_window;
mod snap_overlay;
mod storage;
mod update_install;
mod zen_window;

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

/// Applies a partial settings update (only the fields present) and returns the new config.
#[tauri::command]
fn update_config(app: AppHandle, patch: storage::ConfigPatch) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    patch.apply(&mut cfg);
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
async fn list_note_files(app: AppHandle) -> Result<Vec<String>, String> {
    // Off the main thread for the same reason as `read_all_notes`.
    tauri::async_runtime::spawn_blocking(move || storage::list_note_files(&app))
        .await
        .map_err(|e| e.to_string())?
}

// The note and session commands below run on the blocking pool, not the main (UI) thread: one
// slow file (OneDrive, security software) must not freeze the window. The compare-and-swap
// writes stay safe because `storage::NOTE_LOCK` serializes check + write.
#[tauri::command]
async fn read_note(app: AppHandle, filename: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || storage::read_note(&app, &filename))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn write_note(
    app: AppHandle,
    filename: String,
    content: String,
    expected_hash: Option<String>,
) -> Result<storage::FileMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::write_note(&app, &filename, &content, expected_hash.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_note(
    app: AppHandle,
    filename: String,
    expected_hash: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::delete_note(&app, &filename, expected_hash.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_trash(app: AppHandle) -> Result<Vec<storage::TrashItem>, String> {
    tauri::async_runtime::spawn_blocking(move || storage::list_trash(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn restore_from_trash(app: AppHandle, name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || storage::restore_from_trash(&app, &name))
        .await
        .map_err(|e| e.to_string())?
}


#[tauri::command]
async fn get_file_metadata(app: AppHandle, filename: String) -> Result<storage::FileMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || storage::get_file_metadata(&app, &filename))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_note_with_metadata(
    app: AppHandle,
    filename: String,
) -> Result<storage::NoteWithMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || storage::read_note_with_metadata(&app, &filename))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn write_conflict_copy(app: AppHandle, name: String, content: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || storage::write_conflict_copy(&app, &name, &content))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_all_notes(app: AppHandle) -> Result<Vec<(String, String)>, String> {
    // Reads every note in the folder. A plain `fn` command runs on the main thread, which is
    // also the UI thread: with a large folder (each read going through OneDrive's filter driver
    // and security software) that froze the window and held up every other command, startup
    // included. On the blocking pool it only delays whoever asked for it.
    tauri::async_runtime::spawn_blocking(move || storage::read_all_notes(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_tab_session(app: AppHandle) -> Result<Option<storage::TabSession>, String> {
    tauri::async_runtime::spawn_blocking(move || storage::read_tab_session(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// Shared by the desktop app's "Import notes from a file" Settings entry
/// and the web app's importer — both parse an export JSON frontend-side
/// and hand over just the `{filename -> content}` map. See
/// `docs/design/webapp-roadmap.md`.
#[tauri::command]
async fn import_notes_bundle(
    app: AppHandle,
    notes: std::collections::HashMap<String, String>,
    mode: storage::ImportMode,
) -> Result<storage::ImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || storage::import_notes_bundle(&app, &notes, mode))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn write_tab_session(
    app: AppHandle,
    open_tabs: Vec<String>,
    active_tab: Option<String>,
    last_opened_date: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::write_tab_session(
            &app,
            &storage::TabSession {
                schema_version: storage::CONFIG_SCHEMA_VERSION,
                open_tabs,
                active_tab,
                last_opened_date,
                extra: Default::default(),
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

// The scratchpad drafts stay on the main thread on purpose: they live in the local app-data folder
// (not OneDrive), and running in order guarantees an older draft save can never land after a newer one.
#[tauri::command]
fn save_scratchpad_drafts(
    app: AppHandle,
    drafts: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    storage::save_scratchpad_drafts(&app, &drafts)
}

#[tauri::command]
fn load_scratchpad_drafts(app: AppHandle) -> Result<std::collections::HashMap<String, String>, String> {
    storage::load_scratchpad_drafts(&app)
}

#[tauri::command]
fn append_log(level: String, message: String) {
    let lvl = match level.as_str() {
        "INFO" => "INFO",
        "WARN" => "WARN",
        "ERROR" => "ERROR",
        _ => "WARN",
    };
    applog::write(lvl, &message);
}

#[tauri::command]
fn read_log_tail(lines: u32) -> String {
    let limit = lines.min(500) as usize;
    applog::tail(limit)
}

#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    if !path.ends_with(".md") && !path.ends_with(".html") {
        return Err("Export file path must end with .md or .html".to_string());
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_log_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&dir);
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
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

/// Peek mode: the window is created transparent (`tauri.conf.json`), but `show_window_without_flash` paints an
/// opaque theme colour under the page so the normal window looks exactly as before. Peek clears that colour so the
/// page's own semi-transparent background (and nothing else) lets the desktop show through, and puts it back when
/// Peek ends. Text is never affected: only the background layer is translucent.
#[tauri::command]
fn peek_set_transparent(window: tauri::WebviewWindow, transparent: bool, r: u8, g: u8, b: u8) -> Result<(), String> {
    let color = if transparent { tauri::window::Color(0, 0, 0, 0) } else { tauri::window::Color(r, g, b, 255) };
    window.set_background_color(Some(color)).map_err(|e| e.to_string())
}

pub fn run() {
    let builder = tauri::Builder::default()
        // Must be the first plugin registered (Tauri docs): a second launch
        // hands off to the running instance and exits before anything else
        // initialises. Focuses the existing window instead of opening another.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            if let Ok(dir) = app.path().app_log_dir() {
                applog::init(dir);
                applog::write(
                    "INFO",
                    &format!(
                        "start ChronoNote {} ({} {})",
                        app.package_info().version,
                        std::env::consts::OS,
                        std::env::consts::ARCH
                    ),
                );
            }
            let prev = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                applog::write("PANIC", &info.to_string());
                prev(info);
            }));
            show_window_without_flash(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_install::install_update,
            zen_window::zen_cover_monitor,
            zen_window::zen_prepare_leave,
            peek_set_transparent,
            peek_window::peek_set_bounds,
            snap_overlay::snap_overlay_set_rect,
            get_config,
            set_notes_dir,
            update_config,
            list_note_files,
            read_note,
            write_note,
            delete_note,
            list_trash,
            restore_from_trash,
            get_file_metadata,
            read_note_with_metadata,
            write_conflict_copy,
            read_all_notes,
            read_tab_session,
            write_tab_session,
            import_notes_bundle,
            path_exists,
            agenda::read_agenda_for_date,
            agenda::read_agenda_entries_for_date,
            agenda::read_agenda_removed_for_date,
            agenda::read_agenda_after,
            agenda::read_agenda_dates,
            agenda::agenda_file_exists,
            save_scratchpad_drafts,
            load_scratchpad_drafts,
            append_log,
            read_log_tail,
            open_log_folder,
            write_export_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_export_file_valid_md() {
        let temp_dir = std::env::temp_dir();
        let target = temp_dir.join("chrononote_test_export.md");
        let path_str = target.to_str().unwrap().to_string();
        let res = write_export_file(path_str.clone(), "# Hello".to_string());
        assert!(res.is_ok());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "# Hello");
        let _ = std::fs::remove_file(target);
    }

    #[test]
    fn test_write_export_file_valid_html() {
        let temp_dir = std::env::temp_dir();
        let target = temp_dir.join("chrononote_test_export.html");
        let path_str = target.to_str().unwrap().to_string();
        let res = write_export_file(path_str.clone(), "<h1>Hello</h1>".to_string());
        assert!(res.is_ok());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "<h1>Hello</h1>");
        let _ = std::fs::remove_file(target);
    }

    #[test]
    fn test_write_export_file_rejects_invalid_extension() {
        let res = write_export_file("some/path/test.txt".to_string(), "hello".to_string());
        assert!(res.is_err());
        let res2 = write_export_file("some/path/test.exe".to_string(), "hello".to_string());
        assert!(res2.is_err());
    }
}
