use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use ts_rs::TS;
use super::config::CONFIG_SCHEMA_VERSION;
use super::disk::{atomic_write, quarantine_corrupt_file};

/// Which tabs were open, and which was active, last time this specific
/// notes folder was used — spec §34. Deliberately stored *inside* the
/// notes folder itself (rather than alongside `notes_dir`/`color_mode` in
/// the global `config.json`) so the state travels with the folder if it's
/// ever moved or copied, and so switching between folders doesn't need a
/// growing map of every folder ever opened. `is_valid_note_filename`
/// already restricts the daily-note scan to exactly `YYYY-MM-DD.txt`, so
/// this file is never picked up as a note.
pub(super) const SESSION_FILENAME: &str = ".chrononote-session.json";

#[derive(Serialize, Deserialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct TabSession {
    #[serde(default)]
    pub schema_version: u32,
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
    /// Meeting titles automatically added to a day's note by calendar sync,
    /// keyed by `YYYY-MM-DD`. Entries before `last_opened_date` are dropped on write.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional = nullable)]
    pub auto_added_meetings: Option<std::collections::BTreeMap<String, Vec<String>>>,
    #[serde(flatten)]
    #[ts(skip)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

pub(super) fn read_tab_session_at(root: &Path) -> Result<Option<TabSession>, String> {
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

pub(super) fn write_tab_session_at(root: &Path, session: &TabSession) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let mut session = session.clone();
    if let (Some(today), Some(meetings)) = (
        session.last_opened_date.as_deref(),
        session.auto_added_meetings.as_mut(),
    ) {
        meetings.retain(|date, _| date.as_str() >= today);
    }
    if session.auto_added_meetings.as_ref().is_some_and(|m| m.is_empty()) {
        session.auto_added_meetings = None;
    }
    let path = root.join(SESSION_FILENAME);
    if path.exists() {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(existing) = serde_json::from_str::<TabSession>(&raw) {
                for (k, v) in existing.extra {
                    session.extra.entry(k).or_insert(v);
                }
                session.schema_version = session.schema_version.max(existing.schema_version);
            }
        }
    }
    session.schema_version = session.schema_version.max(CONFIG_SCHEMA_VERSION);
    let raw = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    atomic_write(&path, raw.as_bytes()).map_err(|e| e.to_string())
}

pub(super) fn read_scratchpad_drafts_at(
    path: &Path,
) -> Result<std::collections::HashMap<String, String>, String> {
    if !path.exists() {
        return Ok(std::collections::HashMap::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&raw) {
        Ok(drafts) => Ok(drafts),
        Err(_) => {
            quarantine_corrupt_file(path);
            Ok(std::collections::HashMap::new())
        }
    }
}

pub(super) fn write_scratchpad_drafts_at(
    path: &Path,
    drafts: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(drafts).map_err(|e| e.to_string())?;
    atomic_write(path, raw.as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;
    use crate::storage::config::SCRATCHPAD_DRAFTS_FILENAME;
    use crate::storage::notes::list_note_files_at;

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
            schema_version: CONFIG_SCHEMA_VERSION,
            open_tabs: vec!["2026-09-01.txt".to_string(), "2026-09-02.txt".to_string()],
            active_tab: Some("2026-09-02.txt".to_string()),
            last_opened_date: Some("2026-09-02".to_string()),
            auto_added_meetings: None,
            extra: Default::default(),
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
        assert_eq!(loaded.auto_added_meetings, None);
    }

    #[test]
    fn tab_session_auto_added_meetings_round_trips_and_prunes_old_dates() {
        let dir = tempdir().unwrap();
        let mut map = std::collections::BTreeMap::new();
        map.insert("2026-09-01".to_string(), vec!["Yesterday".to_string()]);
        map.insert("2026-09-02".to_string(), vec!["Standup".to_string()]);
        map.insert("2026-09-03".to_string(), vec!["Planning".to_string()]);
        let session = TabSession {
            schema_version: CONFIG_SCHEMA_VERSION,
            open_tabs: vec!["2026-09-02.txt".to_string()],
            active_tab: Some("2026-09-02.txt".to_string()),
            last_opened_date: Some("2026-09-02".to_string()),
            auto_added_meetings: Some(map),
            extra: Default::default(),
        };
        write_tab_session_at(dir.path(), &session).unwrap();
        let loaded = read_tab_session_at(dir.path()).unwrap().unwrap();
        let mut expected = std::collections::BTreeMap::new();
        expected.insert("2026-09-02".to_string(), vec!["Standup".to_string()]);
        expected.insert("2026-09-03".to_string(), vec!["Planning".to_string()]);
        assert_eq!(loaded.auto_added_meetings, Some(expected));
    }

    #[test]
    fn scratchpad_drafts_roundtrip_and_missing_file_handling() {
        let dir = tempdir().unwrap();
        let file = dir.path().join(SCRATCHPAD_DRAFTS_FILENAME);
        let empty = read_scratchpad_drafts_at(&file).unwrap();
        assert!(empty.is_empty());

        let mut drafts = HashMap::new();
        drafts.insert("scratchpad-1".to_string(), "hello mobile".to_string());
        write_scratchpad_drafts_at(&file, &drafts).unwrap();

        let loaded = read_scratchpad_drafts_at(&file).unwrap();
        assert_eq!(loaded.get("scratchpad-1").map(String::as_str), Some("hello mobile"));
    }

    #[test]
    fn session_file_with_unknown_key_preserves_it_on_write() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join(SESSION_FILENAME),
            r#"{"openTabs":["2026-09-01.txt"],"schemaVersion":99,"futureField":"preserved"}"#,
        )
        .unwrap();
        let new_session = TabSession {
            schema_version: 0,
            open_tabs: vec!["2026-09-02.txt".to_string()],
            active_tab: Some("2026-09-02.txt".to_string()),
            last_opened_date: Some("2026-09-02".to_string()),
            auto_added_meetings: None,
            extra: Default::default(),
        };
        write_tab_session_at(dir.path(), &new_session).unwrap();
        let raw = fs::read_to_string(dir.path().join(SESSION_FILENAME)).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["futureField"], "preserved");
        assert_eq!(parsed["schemaVersion"], 99);
        assert_eq!(parsed["openTabs"][0], "2026-09-02.txt");
    }

    #[test]
    fn upgrade_fixture_tab_sessions_roundtrip_without_data_loss() {
        let tags = [
            ("v0.20.0", include_str!("../../tests/fixtures/v0.20.0/.chrononote-session.json")),
            ("v0.25.0", include_str!("../../tests/fixtures/v0.25.0/.chrononote-session.json")),
            ("v0.30.0", include_str!("../../tests/fixtures/v0.30.0/.chrononote-session.json")),
        ];

        for (tag, raw) in tags {
            let dir = tempdir().unwrap();
            let session_path = dir.path().join(SESSION_FILENAME);
            fs::write(&session_path, raw).unwrap();

            let session = read_tab_session_at(dir.path()).unwrap().expect("session should load");
            assert_eq!(
                session.open_tabs,
                vec!["2026-09-01.txt", "2026-09-02.txt", "2026-09-03.txt"],
                "mismatched open_tabs for {tag}"
            );
            assert_eq!(
                session.active_tab.as_deref(),
                Some("2026-09-02.txt"),
                "mismatched active_tab for {tag}"
            );
            assert_eq!(
                session.last_opened_date.as_deref(),
                Some("2026-09-02"),
                "mismatched last_opened_date for {tag}"
            );

            write_tab_session_at(dir.path(), &session).unwrap();

            let saved_str = fs::read_to_string(&session_path).unwrap();
            let orig: serde_json::Map<String, serde_json::Value> = serde_json::from_str(raw).unwrap();
            let saved: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&saved_str).unwrap();
            for (k, _) in &orig {
                assert!(saved.contains_key(k), "key {k} in session dropped for {tag}");
            }
        }
    }
}
