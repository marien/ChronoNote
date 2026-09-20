mod agenda;
mod onedrive;
mod storage;
mod update_install;

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
fn set_calendar_sync_enabled(app: AppHandle, enabled: bool) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.calendar_sync_enabled = enabled;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}

/// #50: called once per launch, right after boot compares the running
/// version against `AppConfig.last_seen_version` — records the version
/// so the same launch's update notice (if any) isn't repeated next time.
#[tauri::command]
fn set_last_seen_version(app: AppHandle, version: String) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.last_seen_version = Some(version);
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
fn delete_note(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    filename: String,
) -> Result<(), String> {
    storage::delete_note(&app, &filename)?;
    // With OneDrive sync on, the cloud copy of an emptied note goes too.
    if let Ok(data_dir) = app.path().app_data_dir() {
        mgr.record_local_delete(&data_dir, &filename);
    }
    Ok(())
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

/// Shared by the desktop app's "Import notes from a file" Settings entry
/// and the web app's importer — both parse an export JSON frontend-side
/// and hand over just the `{filename -> content}` map. See
/// `docs/design/webapp-roadmap.md`.
#[tauri::command]
fn import_notes_bundle(
    app: AppHandle,
    notes: std::collections::HashMap<String, String>,
    mode: storage::ImportMode,
) -> Result<storage::ImportResult, String> {
    storage::import_notes_bundle(&app, &notes, mode)
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

#[tauri::command]
fn save_scratchpad_drafts(
    app: AppHandle,
    drafts: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    storage::save_scratchpad_drafts(&app, &drafts)
}

#[tauri::command]
fn load_scratchpad_drafts(
    app: AppHandle,
) -> Result<std::collections::HashMap<String, String>, String> {
    storage::load_scratchpad_drafts(&app)
}

#[tauri::command]
async fn onedrive_login(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<onedrive::OneDriveLoginResult, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(mgr.login_interactive(&app, &data_dir).await)
}

#[tauri::command]
fn onedrive_logout(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    mgr.logout(&data_dir)
}

#[tauri::command]
fn onedrive_get_account(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<Option<onedrive::OneDriveAccount>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(mgr.get_account(&data_dir))
}

#[tauri::command]
async fn onedrive_list_folders(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    parent_id: Option<String>,
) -> Result<Vec<onedrive::OneDriveFolderItem>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    mgr.list_folders(&data_dir, parent_id.as_deref()).await
}

#[tauri::command]
fn onedrive_set_folder(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    folder_id: String,
    folder_path: String,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    mgr.set_folder(&data_dir, &onedrive::OneDriveFolderConfig { folder_id, folder_path })
}

#[tauri::command]
async fn onedrive_prepare_folder_switch(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    new_folder_id: String,
) -> Result<onedrive::FolderSwitchResult, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cfg = storage::load_config(&app)?;
    let notes_dir = std::path::PathBuf::from(cfg.notes_dir);
    mgr.prepare_folder_switch(&data_dir, &notes_dir, &new_folder_id).await
}

#[tauri::command]
fn onedrive_get_folder(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<Option<onedrive::OneDriveFolderConfig>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(mgr.get_folder(&data_dir))
}

#[tauri::command]
async fn onedrive_sync_now(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<onedrive::OneDriveSyncResult, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cfg = storage::load_config(&app)?;
    let notes_dir = std::path::PathBuf::from(cfg.notes_dir);
    Ok(mgr.sync_now(&data_dir, &notes_dir).await)
}

#[tauri::command]
fn onedrive_get_conflicts(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<Vec<onedrive::SyncConflict>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cfg = storage::load_config(&app)?;
    Ok(mgr.conflicts(&data_dir, &std::path::PathBuf::from(cfg.notes_dir)))
}

#[tauri::command]
fn onedrive_resolve_conflict(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    name: String,
    resolution: String,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cfg = storage::load_config(&app)?;
    mgr.resolve_conflict(&data_dir, &std::path::PathBuf::from(cfg.notes_dir), &name, &resolution)
}

#[tauri::command]
async fn onedrive_create_folder(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    parent_id: Option<String>,
    name: String,
) -> Result<onedrive::OneDriveFolderItem, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    mgr.create_folder(&data_dir, parent_id.as_deref(), &name).await
}

#[tauri::command]
async fn onedrive_exchange_code(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    code: String,
) -> Result<onedrive::OneDriveLoginResult, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(mgr.exchange_code_direct(&data_dir, &code).await)
}

#[tauri::command]
fn onedrive_get_sync_status(
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<onedrive::SyncStatus, String> {
    Ok(mgr.get_status())
}

#[tauri::command]
fn onedrive_get_advanced_config(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
) -> Result<onedrive::OneDriveAdvancedConfig, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(mgr.get_advanced_config(&data_dir))
}

#[tauri::command]
fn onedrive_set_advanced_config(
    app: AppHandle,
    mgr: tauri::State<'_, std::sync::Arc<onedrive::sync::OneDriveManager>>,
    config: onedrive::OneDriveAdvancedConfig,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    mgr.set_advanced_config(&data_dir, &config)
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

/// Completes the Android OAuth flow when `chrononote://auth?code=...`
/// arrives — either while the app is already running (`on_open_url`) or
/// as the reason it just launched, if Android had to restart it from
/// scratch while the user was off in the browser (`get_current`). Both
/// route through the exact same `exchange_code_direct` the manual-paste
/// fallback UI already uses, then emit `onedrive-login-result` so the
/// frontend — which got `pending: true` back immediately when the user
/// tapped "Connect" — can pick up the real outcome whenever it arrives.
/// A no-op on desktop: no scheme is configured there, so neither hook
/// ever fires.
fn wire_onedrive_deep_link(app: &AppHandle) {
    use tauri::Emitter;
    use tauri_plugin_deep_link::DeepLinkExt;

    fn handle_deep_link_url(app: AppHandle, url: String) {
        tauri::async_runtime::spawn(async move {
            let mgr = app.state::<std::sync::Arc<onedrive::sync::OneDriveManager>>();
            let Ok(data_dir) = app.path().app_data_dir() else {
                return;
            };
            let result = mgr.exchange_code_direct(&data_dir, &url).await;
            let _ = app.emit("onedrive-login-result", result);
        });
    }

    if let Ok(Some(urls)) = app.deep_link().get_current() {
        if let Some(url) = urls.first() {
            handle_deep_link_url(app.clone(), url.to_string());
        }
    }

    let app_for_listener = app.clone();
    app.deep_link().on_open_url(move |event| {
        if let Some(url) = event.urls().first() {
            handle_deep_link_url(app_for_listener.clone(), url.to_string());
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let onedrive_mgr = std::sync::Arc::new(onedrive::sync::OneDriveManager::new());

    let builder = tauri::Builder::default()
        .manage(onedrive_mgr)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        // Android-only in practice — no desktop scheme is configured in
        // tauri.conf.json, so this is inert there. See onedrive/sync.rs's
        // Android `login_interactive` for why the OAuth redirect needs a
        // real deep link instead of desktop's loopback-listener trick.
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            show_window_without_flash(app);
            #[cfg(target_os = "android")]
            if let Ok(dir) = app.path().app_data_dir() {
                onedrive::auth::init_secret_dir(dir);
            }
            wire_onedrive_deep_link(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_install::install_update,
            get_config,
            set_notes_dir,
            set_color_mode,
            set_word_wrap,
            set_readable_line_length,
            set_auto_check_updates,
            set_theme_mode,
            set_calendar_sync_enabled,
            set_last_seen_version,
            list_note_files,
            read_note,
            write_note,
            delete_note,
            get_file_metadata,
            read_note_with_metadata,
            write_conflict_copy,
            read_all_notes,
            read_tab_session,
            write_tab_session,
            import_notes_bundle,
            path_exists,
            agenda::read_agenda_for_date,
            agenda::read_agenda_after,
            agenda::agenda_file_exists,
            save_scratchpad_drafts,
            load_scratchpad_drafts,
            onedrive_login,
            onedrive_logout,
            onedrive_get_account,
            onedrive_list_folders,
            onedrive_create_folder,
            onedrive_set_folder,
            onedrive_prepare_folder_switch,
            onedrive_get_folder,
            onedrive_sync_now,
            onedrive_get_conflicts,
            onedrive_resolve_conflict,
            onedrive_get_sync_status,
            onedrive_exchange_code,
            onedrive_get_advanced_config,
            onedrive_set_advanced_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
