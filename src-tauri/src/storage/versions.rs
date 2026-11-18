use chrono::TimeZone;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;
use super::disk::{NOTE_LOCK, atomic_write, resolve_workspace_path};
use super::notes::{FileMetadata, hash_bytes, is_valid_note_filename, normalize_note_text};

pub const VERSIONS_DIRNAME: &str = ".chrononote-versions";
pub const VERSIONS_KEEP_DAYS: i64 = 30;

#[derive(Serialize, Clone, PartialEq, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersion {
    pub name: String,
    pub saved_ms: i64,
    pub size_bytes: u64,
}

fn note_stem(filename: &str) -> &str {
    filename.strip_suffix(".txt").unwrap_or(filename)
}

fn parse_version_filename(name: &str) -> Option<(i64, chrono::NaiveDateTime)> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return None;
    }
    let stem = name.strip_suffix(".txt").unwrap_or(name);
    if stem.len() != 15 {
        return None;
    }
    let naive = chrono::NaiveDateTime::parse_from_str(stem, "%Y%m%d-%H%M%S").ok()?;
    let ms = chrono::Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|dt| dt.timestamp_millis())
        .unwrap_or_else(|| {
            chrono::TimeZone::from_utc_datetime(&chrono::Utc, &naive).timestamp_millis()
        });
    Some((ms, naive))
}

fn is_valid_version_name(name: &str) -> bool {
    parse_version_filename(name).is_some()
}

fn versions_dir_for(root: &Path, filename: &str) -> PathBuf {
    root.join(VERSIONS_DIRNAME).join(note_stem(filename))
}

fn newest_version_timestamp_at(root: &Path, filename: &str) -> Option<(i64, chrono::NaiveDateTime)> {
    let dir = versions_dir_for(root, filename);
    if !dir.exists() {
        return None;
    }
    let entries = fs::read_dir(&dir).ok()?;
    let mut newest: Option<(i64, chrono::NaiveDateTime)> = None;
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            if let Some((ms, naive)) = parse_version_filename(name) {
                match &newest {
                    Some((best_ms, _)) if *best_ms >= ms => {}
                    _ => newest = Some((ms, naive)),
                }
            }
        }
    }
    newest
}

pub fn should_keep_version_at(
    root: &Path,
    filename: &str,
    expected_hash: Option<&str>,
    new_content: &str,
    now: chrono::DateTime<chrono::Local>,
) -> bool {
    if expected_hash.is_none() || new_content.trim().is_empty() {
        return true;
    }
    match newest_version_timestamp_at(root, filename) {
        None => true,
        Some((ms, _)) => now.timestamp_millis() - ms > 5 * 60 * 1000,
    }
}

pub(super) fn keep_version_at_time(
    root: &Path,
    filename: &str,
    previous: &str,
    now: chrono::DateTime<chrono::Local>,
) -> Result<(), String> {
    if previous.trim().is_empty() {
        return Ok(());
    }
    let dir = versions_dir_for(root, filename);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut existing: Vec<(String, i64, PathBuf)> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    if let Some((ms, _)) = parse_version_filename(name) {
                        existing.push((name.to_string(), ms, path));
                    }
                }
            }
        }
    }
    existing.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
    if let Some((_, _, newest_path)) = existing.first() {
        if let Ok(newest_content) = fs::read_to_string(newest_path) {
            if normalize_note_text(&newest_content) == normalize_note_text(previous) {
                return Ok(());
            }
        }
    }

    let mut dt = now;
    let mut stamp = dt.format("%Y%m%d-%H%M%S").to_string();
    let mut candidate = dir.join(format!("{stamp}.txt"));
    while candidate.exists() {
        dt += chrono::Duration::seconds(1);
        stamp = dt.format("%Y%m%d-%H%M%S").to_string();
        candidate = dir.join(format!("{stamp}.txt"));
    }
    let prev_norm = normalize_note_text(previous);
    atomic_write(&candidate, prev_norm.as_bytes()).map_err(|e| e.to_string())
}

pub(super) fn keep_version_at(root: &Path, filename: &str, previous: &str) -> Result<(), String> {
    keep_version_at_time(root, filename, previous, chrono::Local::now())
}

pub fn clean_up_versions_and_trash_at(
    root: &Path,
    now: chrono::DateTime<chrono::Local>,
) -> Result<(), String> {
    let now_ms = now.timestamp_millis();
    let today = now.date_naive();
    let max_version_age_ms = VERSIONS_KEEP_DAYS * 24 * 60 * 60 * 1000;

    let vroot = root.join(VERSIONS_DIRNAME);
    if vroot.exists() {
        if let Ok(note_dirs) = fs::read_dir(&vroot) {
            for entry in note_dirs.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let mut earlier_by_day: std::collections::BTreeMap<
                        chrono::NaiveDate,
                        Vec<(i64, PathBuf)>,
                    > = std::collections::BTreeMap::new();

                    if let Ok(files) = fs::read_dir(&path) {
                        for file_entry in files.flatten() {
                            let fpath = file_entry.path();
                            if fpath.is_file() {
                                if let Some(name) = file_entry.file_name().to_str() {
                                    if let Some((ms, naive)) = parse_version_filename(name) {
                                        let file_date = naive.date();
                                        if now_ms - ms > max_version_age_ms {
                                            let _ = fs::remove_file(&fpath);
                                        } else if file_date < today {
                                            earlier_by_day
                                                .entry(file_date)
                                                .or_default()
                                                .push((ms, fpath));
                                        }
                                    }
                                }
                            }
                        }
                    }

                    for (_day, mut versions) in earlier_by_day {
                        versions.sort_by_key(|v| std::cmp::Reverse(v.0));
                        for (_, old_path) in versions.into_iter().skip(1) {
                            let _ = fs::remove_file(old_path);
                        }
                    }

                    let is_empty = fs::read_dir(&path)
                        .map(|mut it| it.next().is_none())
                        .unwrap_or(false);
                    if is_empty {
                        let _ = fs::remove_dir(&path);
                    }
                }
            }
        }
    }

    let trash_dir = root.join(TRASH_DIRNAME);
    if trash_dir.exists() {
        let max_trash_age_ms = TRASH_KEEP_DAYS * 24 * 60 * 60 * 1000;
        if let Ok(entries) = fs::read_dir(&trash_dir) {
            for entry in entries.flatten() {
                let fpath = entry.path();
                if fpath.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        if let Some((deleted_ms, _)) = parse_trash_filename(name) {
                            if now_ms - deleted_ms > max_trash_age_ms {
                                let _ = fs::remove_file(&fpath);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

pub const TRASH_DIRNAME: &str = ".chrononote-trash";
pub const TRASH_KEEP_DAYS: i64 = 30;

#[derive(Serialize, Clone, PartialEq, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub name: String,
    pub original_filename: String,
    pub deleted_ms: i64,
    pub preview: String,
}

fn parse_trash_filename(name: &str) -> Option<(i64, String)> {
    if name.contains('/') || name.contains('\\') {
        return None;
    }
    let (ts_part, orig) = name.split_once('_')?;
    if ts_part.len() != 15 {
        return None;
    }
    if !is_valid_note_filename(orig) {
        return None;
    }
    let naive = chrono::NaiveDateTime::parse_from_str(ts_part, "%Y%m%d-%H%M%S").ok()?;
    let ms = chrono::TimeZone::from_utc_datetime(&chrono::Utc, &naive).timestamp_millis();
    Some((ms, orig.to_string()))
}

pub(super) fn list_trash_at(root: &Path) -> Result<Vec<TrashItem>, String> {
    let trash_dir = root.join(TRASH_DIRNAME);
    if !trash_dir.exists() {
        return Ok(vec![]);
    }
    let mut items = vec![];

    let entries = match fs::read_dir(&trash_dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name_str) = entry.file_name().to_str().map(String::from) else {
            continue;
        };
        if let Some((deleted_ms, orig)) = parse_trash_filename(&name_str) {
            let preview = match fs::read_to_string(&path) {
                Ok(content) => content
                    .lines()
                    .map(|l| l.trim())
                    .find(|l| !l.is_empty())
                    .map(|l| l.chars().take(80).collect::<String>())
                    .unwrap_or_default(),
                Err(_) => String::new(),
            };
            items.push(TrashItem {
                name: name_str,
                original_filename: orig,
                deleted_ms,
                preview,
            });
        }
    }

    items.sort_by(|a, b| b.deleted_ms.cmp(&a.deleted_ms).then_with(|| b.name.cmp(&a.name)));
    Ok(items)
}

pub(super) fn restore_from_trash_at(root: &Path, name: &str) -> Result<String, String> {
    let Some((_, orig)) = parse_trash_filename(name) else {
        return Err(format!("Invalid trash filename: {name}"));
    };
    let _guard = NOTE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let note_path = resolve_workspace_path(root, Path::new(&orig)).map_err(String::from)?;
    if note_path.exists() {
        let content = fs::read_to_string(&note_path).map_err(|e| e.to_string())?;
        if !content.trim().is_empty() {
            return Err("note-exists".to_string());
        }
    }
    let trash_dir = root.join(TRASH_DIRNAME);
    let trash_path = resolve_workspace_path(&trash_dir, Path::new(name)).map_err(String::from)?;
    let content = fs::read(&trash_path).map_err(|e| e.to_string())?;
    atomic_write(&note_path, &content).map_err(|e| e.to_string())?;
    fs::remove_file(&trash_path).map_err(|e| e.to_string())?;
    Ok(orig)
}

pub(super) fn list_versions_at(root: &Path, filename: &str) -> Result<Vec<NoteVersion>, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let dir = versions_dir_for(root, filename);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut items = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            if let Some(name_str) = entry.file_name().to_str() {
                if let Some((saved_ms, _)) = parse_version_filename(name_str) {
                    let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    let name = if name_str.ends_with(".txt") {
                        name_str.to_string()
                    } else {
                        format!("{name_str}.txt")
                    };
                    items.push(NoteVersion {
                        name,
                        saved_ms,
                        size_bytes,
                    });
                }
            }
        }
    }
    items.sort_by(|a, b| b.saved_ms.cmp(&a.saved_ms).then_with(|| b.name.cmp(&a.name)));
    Ok(items)
}

pub(super) fn read_version_at(root: &Path, filename: &str, name: &str) -> Result<String, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    if !is_valid_version_name(name) {
        return Err(format!("Invalid version name: {name}"));
    }
    let file_name = if name.ends_with(".txt") {
        name.to_string()
    } else {
        format!("{name}.txt")
    };
    let dir = versions_dir_for(root, filename);
    let path = resolve_workspace_path(&dir, Path::new(&file_name)).map_err(String::from)?;
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(normalize_note_text(&content).into_owned())
}

pub(super) fn restore_version_at(root: &Path, filename: &str, name: &str) -> Result<FileMetadata, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    if !is_valid_version_name(name) {
        return Err(format!("Invalid version name: {name}"));
    }
    let _guard = NOTE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let file_name = if name.ends_with(".txt") {
        name.to_string()
    } else {
        format!("{name}.txt")
    };
    let dir = versions_dir_for(root, filename);
    let version_path = resolve_workspace_path(&dir, Path::new(&file_name)).map_err(String::from)?;
    let version_text = fs::read_to_string(&version_path).map_err(|e| e.to_string())?;
    let version_text = normalize_note_text(&version_text).into_owned();

    let target = resolve_workspace_path(root, Path::new(filename)).map_err(String::from)?;
    if target.exists() {
        if let Ok(curr) = fs::read_to_string(&target) {
            if !curr.trim().is_empty() {
                keep_version_at(root, filename, &curr)?;
            }
        }
    }

    atomic_write(&target, version_text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(FileMetadata {
        exists: true,
        content_hash: Some(hash_bytes(version_text.as_bytes())),
        size_bytes: Some(version_text.len() as u64),
        modified_ms: fs::metadata(&target)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn cleanup_keeps_day_d_and_newest_of_earlier_days_and_prunes_old() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-15.txt";
        let v_dir = root.join(VERSIONS_DIRNAME).join(note_stem(filename));
        fs::create_dir_all(&v_dir).unwrap();

        // Fixed now: Day D is 2026-10-15 18:00:00
        let naive_now = chrono::NaiveDateTime::parse_from_str("20261015-180000", "%Y%m%d-%H%M%S").unwrap();
        let now = chrono::Local.from_local_datetime(&naive_now).unwrap();

        // Versions on Day D: all kept
        fs::write(v_dir.join("20261015-090000.txt"), "D 9am").unwrap();
        fs::write(v_dir.join("20261015-140000.txt"), "D 2pm").unwrap();

        // Versions on Day D-1 (2026-10-14): keep newest (16:00:00), remove older (10:00:00)
        fs::write(v_dir.join("20261014-100000.txt"), "D-1 10am").unwrap();
        fs::write(v_dir.join("20261014-160000.txt"), "D-1 4pm").unwrap();

        // Versions on Day D-2 (2026-10-13): keep newest (15:00:00), remove older (08:00:00)
        fs::write(v_dir.join("20261013-080000.txt"), "D-2 8am").unwrap();
        fs::write(v_dir.join("20261013-150000.txt"), "D-2 3pm").unwrap();

        // Version older than 30 days: removed
        fs::write(v_dir.join("20260901-120000.txt"), "Old >30d").unwrap();

        // Empty note folder in .chrononote-versions
        let empty_vdir = root.join(VERSIONS_DIRNAME).join("empty-note");
        fs::create_dir_all(&empty_vdir).unwrap();

        // Trash setup
        let trash_dir = root.join(TRASH_DIRNAME);
        fs::create_dir_all(&trash_dir).unwrap();
        // Recent trash (< 30 days)
        fs::write(trash_dir.join("20261010-120000_2026-10-10.txt"), "Recent trash").unwrap();
        // Old trash (> 30 days)
        fs::write(trash_dir.join("20260901-120000_2026-09-01.txt"), "Old trash").unwrap();

        clean_up_versions_and_trash_at(root, now).unwrap();

        // Day D versions both kept
        assert!(v_dir.join("20261015-090000.txt").exists());
        assert!(v_dir.join("20261015-140000.txt").exists());

        // Day D-1 newest kept, older removed
        assert!(v_dir.join("20261014-160000.txt").exists());
        assert!(!v_dir.join("20261014-100000.txt").exists());

        // Day D-2 newest kept, older removed
        assert!(v_dir.join("20261013-150000.txt").exists());
        assert!(!v_dir.join("20261013-080000.txt").exists());

        // Older than 30 days removed
        assert!(!v_dir.join("20260901-120000.txt").exists());

        // Empty folder removed
        assert!(!empty_vdir.exists());

        // Trash items older than 30 days removed, recent kept
        assert!(trash_dir.join("20261010-120000_2026-10-10.txt").exists());
        assert!(!trash_dir.join("20260901-120000_2026-09-01.txt").exists());
    }
}
