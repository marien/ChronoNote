//! Downloads and installs an update, replacing the plugin's own
//! `downloadAndInstall` for one reason: on Windows the plugin closes every
//! window *before* it launches the installer, and if the launch then fails
//! (security software blocking the extracted installer, a policy, ...) it
//! returns the error to a window that no longer exists and leaves a windowless
//! process running. Here the windows stay open until the installer has really
//! been started (the process exits right after it launches - nothing else needs
//! tearing down), so a failure surfaces in About/Settings with its real reason.
//! Every step is also appended to `update.log` in the app's log folder.
use std::io::Write;

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum InstallEvent {
    #[serde(rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename_all = "camelCase")]
    Progress { chunk_length: usize },
    Finished,
    /// The installer is about to be launched; on Windows the app exits right after.
    Launching,
}

/// `YYYY-MM-DD HH:MM:SS` (UTC) from a Unix timestamp, without pulling in a date crate.
fn utc_stamp(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Howard Hinnant's civil-from-days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}", rem / 3600, (rem % 3600) / 60, rem % 60)
}

fn log_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_log_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("update.log"))
}

fn log(app: &AppHandle, msg: &str) {
    let Some(path) = log_path(app) else { return };
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{} UTC  {msg}", utc_stamp(secs));
    }
}

/// Where the log is, for messages ("see <path>").
fn log_hint(app: &AppHandle) -> String {
    log_path(app)
        .map(|p| format!(" (details: {})", p.display()))
        .unwrap_or_default()
}

#[tauri::command]
pub async fn install_update(app: AppHandle, on_event: Channel<InstallEvent>) -> Result<(), String> {
    log(&app, &format!("install requested (running v{})", app.package_info().version));

    let fail = |app: &AppHandle, what: &str, e: String| -> String {
        log(app, &format!("FAILED {what}: {e}"));
        format!("{what}: {e}{}", log_hint(app))
    };

    // A no-op before-exit hook: the plugin's default one destroys every window,
    // which is exactly what hides a failed launch (see the module comment).
    let updater = app
        .updater_builder()
        .on_before_exit(|| {})
        .build()
        .map_err(|e| fail(&app, "couldn't set up the updater", e.to_string()))?;

    let update = updater
        .check()
        .await
        .map_err(|e| fail(&app, "couldn't check for the update", e.to_string()))?
        .ok_or_else(|| fail(&app, "no update found", "the release may have changed - check again".into()))?;
    log(&app, &format!("found v{}", update.version));

    let mut first_chunk = true;
    let mut total: usize = 0;
    let progress = on_event.clone();
    let finished = on_event.clone();
    let bytes = update
        .download(
            |chunk_length, content_length| {
                if first_chunk {
                    first_chunk = false;
                    let _ = progress.send(InstallEvent::Started { content_length });
                }
                total += chunk_length;
                let _ = progress.send(InstallEvent::Progress { chunk_length });
            },
            || {
                let _ = finished.send(InstallEvent::Finished);
            },
        )
        .await
        .map_err(|e| fail(&app, "the download failed", e.to_string()))?;
    log(&app, &format!("downloaded {} bytes (streamed {total}); signature verified", bytes.len()));

    let _ = on_event.send(InstallEvent::Launching);
    log(&app, "launching the installer");
    // Blocking work (write the installer to %TEMP%, start it). On Windows success
    // never returns: the plugin exits the process once the installer is running.
    let app_for_install = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _ = &app_for_install;
        update.install(bytes)
    })
    .await
    .map_err(|e| fail(&app, "the install task failed", e.to_string()))?;

    match result {
        Ok(()) => {
            log(&app, "install returned Ok (non-Windows: restart to finish)");
            Ok(())
        }
        Err(e) => Err(fail(&app, "couldn't start the installer", e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::utc_stamp;

    #[test]
    fn formats_known_timestamps() {
        assert_eq!(utc_stamp(0), "1970-01-01 00:00:00");
        assert_eq!(utc_stamp(1_789_884_960), "2026-09-20 06:16:00");
        assert_eq!(utc_stamp(951_782_400), "2000-02-29 00:00:00"); // a leap day
    }
}
