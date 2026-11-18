use serde::Serialize;
use std::fs;
use std::path::Path;
use ts_rs::TS;
use super::disk::{NOTE_LOCK, atomic_write, resolve_workspace_path};
use super::versions::{
    TRASH_DIRNAME, keep_version_at_time, list_versions_at, read_version_at, should_keep_version_at,
};

/// Daily note filenames must be exactly `YYYY-MM-DD.txt`. This is both the
/// spec's naming scheme and a guard against path traversal, since the value
/// arrives from the frontend and is joined directly onto the notes root.
pub(super) fn is_valid_note_filename(filename: &str) -> bool {
    let b = filename.as_bytes();
    b.len() == 14
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..10].iter().all(u8::is_ascii_digit)
        && &filename[10..] == ".txt"
}

pub(super) fn list_note_files_at(root: &Path) -> Result<Vec<String>, String> {
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

pub(super) fn read_note_at(root: &Path, filename: &str) -> Result<Option<String>, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let path = root.join(filename);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path)
        .map(|s| Some(normalize_note_text(&s).into_owned()))
        .map_err(|e| e.to_string())
}

// --- External-modification detection (§2 / §94) -------------------------

/// The subdirectory `write_conflict_copy` drops "keep my version" copies
/// into when the on-disk note changed under the user's feet. Inside the
/// notes folder, hidden, and invisible to `list_note_files_at` /
/// `read_all_notes_at` because `is_valid_note_filename` rejects both the
/// directory name and the timestamped `.txt` files it holds.
const CONFLICTS_DIRNAME: &str = ".chrononote-conflicts";

/// Prefix on the error returned by `write_note_at` when an `expected_hash`
/// guard fails — the note on disk is no longer what the caller last saw.
/// The frontend matches on this to re-open the conflict prompt instead of
/// surfacing it as a generic save failure.
pub const CONFLICT_ERROR_PREFIX: &str = "conflict: note changed on disk";

/// What the frontend needs to tell whether a note file changed underneath
/// it: the SHA-256 of the current bytes (the authority — mtime is
/// unreliable across cloud-sync clients, which is the main case this
/// guards against), plus cheap corroborating signals.
#[derive(Serialize, Clone, PartialEq, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub exists: bool,
    /// SHA-256 hex of the file's bytes, or `None` when it doesn't exist.
    pub content_hash: Option<String>,
    pub size_bytes: Option<u64>,
    /// mtime in milliseconds since the Unix epoch, best-effort.
    pub modified_ms: Option<i64>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NoteWithMetadata {
    pub content: Option<String>,
    pub metadata: FileMetadata,
}

pub(super) fn hash_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Notes are handled as LF text without a byte-order mark. Files from other editors can have CRLF
/// line endings or a BOM, which the frontend's line rules don't expect. Reads normalize, writes
/// store the normalized text, and the content hash is taken over it, so a CRLF file nobody edited
/// still matches the tab showing it.
pub(crate) fn normalize_note_text(s: &str) -> std::borrow::Cow<'_, str> {
    let s = s.strip_prefix('\u{feff}').unwrap_or(s);
    if s.contains('\r') {
        std::borrow::Cow::Owned(s.replace("\r\n", "\n").replace('\r', "\n"))
    } else {
        std::borrow::Cow::Borrowed(s)
    }
}

/// Hash of a note file's bytes as the app sees them (normalized). Non-UTF-8 bytes are hashed as-is.
fn note_hash(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => hash_bytes(normalize_note_text(text).as_bytes()),
        Err(_) => hash_bytes(bytes),
    }
}

pub(super) fn file_metadata_at(root: &Path, filename: &str) -> Result<FileMetadata, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let path = root.join(filename);
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        // Only a genuine "not there" is `exists: false`. A transient
        // failure (a sync client or another editor holding the file
        // locked mid-write — the case §94 exists for) must surface as an
        // error so the frontend retries on its next trigger rather than
        // announcing a deletion.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(FileMetadata { exists: false, content_hash: None, size_bytes: None, modified_ms: None });
        }
        Err(e) => return Err(e.to_string()),
    };
    Ok(metadata_from_bytes(&path, &bytes))
}

/// Metadata for bytes already read from `path` (so text and hash always describe the same version).
fn metadata_from_bytes(path: &Path, bytes: &[u8]) -> FileMetadata {
    let modified_ms = fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    FileMetadata {
        exists: true,
        content_hash: Some(note_hash(bytes)),
        size_bytes: Some(bytes.len() as u64),
        modified_ms,
    }
}

pub(super) fn read_note_with_metadata_at(root: &Path, filename: &str) -> Result<NoteWithMetadata, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let path = root.join(filename);
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(NoteWithMetadata {
                content: None,
                metadata: FileMetadata { exists: false, content_hash: None, size_bytes: None, modified_ms: None },
            });
        }
        Err(e) => return Err(e.to_string()),
    };
    let metadata = metadata_from_bytes(&path, &bytes);
    let content = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    Ok(NoteWithMetadata { content: Some(normalize_note_text(&content).into_owned()), metadata })
}

/// Validates a conflict-copy filename from the frontend: a plain basename
/// ending `.txt`, no path separators or `..`. The timestamped name is
/// built frontend-side (it owns the local clock); this is the guard.
fn is_valid_conflict_filename(name: &str) -> bool {
    name.ends_with(".txt")
        && !name.is_empty()
        && name.len() <= 128
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && !name.contains("..")
}

pub(super) fn write_conflict_copy_at(root: &Path, name: &str, content: &str) -> Result<String, String> {
    if !is_valid_conflict_filename(name) {
        return Err(format!("Invalid conflict-copy filename: {name}"));
    }
    let dir = root.join(CONFLICTS_DIRNAME);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = resolve_workspace_path(&dir, Path::new(name)).map_err(String::from)?;
    atomic_write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

fn write_note_at_time_internal(
    root: &Path,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
    now: chrono::DateTime<chrono::Local>,
    keep_version: bool,
) -> Result<FileMetadata, String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let _guard = NOTE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let content = normalize_note_text(content);
    fs::create_dir_all(root).map_err(|e| e.to_string())?;

    // §94: compare-and-swap. When the caller passes the hash it last saw,
    // refuse the write if the file has since changed — a blind overwrite
    // there would silently lose whatever landed on disk in between.
    if let Some(expected) = expected_hash {
        // A file that doesn't exist holds no text, so it matches the hash of empty content: that is
        // the baseline of a tab opened for a day that has no note yet, and its first save must work.
        let current = file_metadata_at(root, filename)?.content_hash.unwrap_or_else(|| hash_bytes(b""));
        if current != expected {
            return Err(format!("{CONFLICT_ERROR_PREFIX}: {filename}"));
        }
    }

    let target = resolve_workspace_path(root, Path::new(filename)).map_err(String::from)?;
    if target.exists() {
        if let Ok(curr) = fs::read_to_string(&target) {
            if !curr.trim().is_empty() {
                let should_keep = keep_version || should_keep_version_at(root, filename, expected_hash, &content, now);
                if should_keep {
                    keep_version_at_time(root, filename, &curr, now)?;
                }
            }
        }
    }
    atomic_write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(FileMetadata {
        exists: true,
        content_hash: Some(hash_bytes(content.as_bytes())),
        size_bytes: Some(content.len() as u64),
        modified_ms: fs::metadata(&target)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64),
    })
}

pub fn write_note_at_time(
    root: &Path,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
    now: chrono::DateTime<chrono::Local>,
) -> Result<FileMetadata, String> {
    write_note_at_time_internal(root, filename, content, expected_hash, now, false)
}

pub fn write_note_keeping_version_at_time(
    root: &Path,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
    now: chrono::DateTime<chrono::Local>,
) -> Result<FileMetadata, String> {
    write_note_at_time_internal(root, filename, content, expected_hash, now, true)
}

pub(super) fn write_note_at(
    root: &Path,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
) -> Result<FileMetadata, String> {
    write_note_at_time(root, filename, content, expected_hash, chrono::Local::now())
}

pub fn write_note_keeping_version_at(
    root: &Path,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
) -> Result<FileMetadata, String> {
    write_note_keeping_version_at_time(root, filename, content, expected_hash, chrono::Local::now())
}

/// #63: deletes a note file from disk — used when a dated tab closes
/// with empty content, so ChronoNote doesn't leave an empty file behind
/// forever just because a day's note was opened and never actually
/// written into. A missing file is **not** an error (idempotent): the
/// common case is a tab that was never edited at all, so no file was
/// ever written for it in the first place — deleting it "succeeds"
/// trivially rather than surfacing a spurious failure toast for what is,
/// from the caller's point of view, already the desired end state.
pub(super) fn delete_note_at(root: &Path, filename: &str, expected_hash: Option<&str>) -> Result<(), String> {
    if !is_valid_note_filename(filename) {
        return Err(format!("Invalid note filename: {filename}"));
    }
    let _guard = NOTE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    // Same compare-and-swap rule as `write_note_at`: when the caller passes the hash it last saw,
    // a file that changed since then (another device synced a new version in) is kept, not deleted.
    if let Some(expected) = expected_hash {
        let current = file_metadata_at(root, filename)?;
        if !current.exists {
            return Ok(());
        }
        if current.content_hash.as_deref() != Some(expected) {
            return Err(format!("{CONFLICT_ERROR_PREFIX}: {filename}"));
        }
    }
    let target = resolve_workspace_path(root, Path::new(filename)).map_err(String::from)?;
    let content = match fs::read_to_string(&target) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    if content.trim().is_empty() {
        // When the file is empty (or missing) but the note has a kept version,
        // copy the NEWEST version's text into the trash as <UTC stamp>_<filename>
        let versions = list_versions_at(root, filename).unwrap_or_default();
        if let Some(newest) = versions.first() {
            if let Ok(vtext) = read_version_at(root, filename, &newest.name) {
                if !vtext.trim().is_empty() {
                    let trash_dir = root.join(TRASH_DIRNAME);
                    fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
                    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
                    let trash_filename = format!("{stamp}_{filename}");
                    let trash_target = resolve_workspace_path(&trash_dir, Path::new(&trash_filename)).map_err(String::from)?;
                    if trash_target.exists() {
                        let _ = fs::remove_file(&trash_target);
                    }
                    atomic_write(&trash_target, vtext.as_bytes()).map_err(|e| e.to_string())?;
                }
            }
        }
        if target.exists() {
            match fs::remove_file(&target) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e.to_string()),
            }
        } else {
            Ok(())
        }
    } else {
        let trash_dir = root.join(TRASH_DIRNAME);
        fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
        let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let trash_filename = format!("{stamp}_{filename}");
        let trash_target = resolve_workspace_path(&trash_dir, Path::new(&trash_filename)).map_err(String::from)?;
        if trash_target.exists() {
            let _ = fs::remove_file(&trash_target);
        }
        if fs::rename(&target, &trash_target).is_err() {
            atomic_write(&trash_target, content.as_bytes()).map_err(|e| e.to_string())?;
            let _ = fs::remove_file(&target);
        }
        Ok(())
    }
}

pub(super) fn read_all_notes_at(root: &Path) -> Result<Vec<(String, String)>, String> {
    let files = list_note_files_at(root)?;
    let mut out = vec![];
    for f in files {
        match fs::read_to_string(root.join(&f)) {
            Ok(content) => out.push((f, normalize_note_text(&content).into_owned())),
            // Left out rather than reported as empty: callers treat each entry as the note's real text.
            Err(e) => eprintln!("chrononote: skipped unreadable note {f}: {e}"),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::collections::HashMap;
    use tempfile::tempdir;
    use crate::storage::config::CONFIG_SCHEMA_VERSION;
    use crate::storage::import::{ImportMode, import_notes_bundle_at};
    use crate::storage::phone::{read_saved_searches_at, write_saved_searches_at};
    use crate::storage::session::{SESSION_FILENAME, TabSession, read_tab_session_at, write_tab_session_at};
    use crate::storage::versions::{
        VERSIONS_DIRNAME, clean_up_versions_and_trash_at, keep_version_at, list_trash_at,
        restore_from_trash_at, restore_version_at,
    };

    /// The frontend hashes the same text with WebCrypto (`src/lib/hash.ts`) and compares it with this hash to tell
    /// whether a file changed on disk, so the output must stay standard SHA-256 in lowercase hex whatever the `sha2`
    /// version (pinned when moving to sha2 0.11).
    #[test]
    fn hash_bytes_is_standard_sha256_hex() {
        assert_eq!(hash_bytes(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(hash_bytes(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

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
        write_note_at(dir.path(), "2026-09-07.txt", "hello world", None).unwrap();
        let content = read_note_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(content, Some("hello world".to_string()));
    }

    #[test]
    fn delete_note_at_removes_an_existing_file() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "content", None).unwrap();
        assert!(dir.path().join("2026-09-07.txt").exists());
        delete_note_at(dir.path(), "2026-09-07.txt", None).unwrap();
        assert!(!dir.path().join("2026-09-07.txt").exists());
    }

    #[test]
    fn delete_note_at_a_missing_file_succeeds_rather_than_erroring() {
        // #63: the common case — a tab that was opened but never actually
        // written to, so no file exists for it in the first place.
        let dir = tempdir().unwrap();
        assert!(delete_note_at(dir.path(), "2026-09-07.txt", None).is_ok());
    }

    #[test]
    fn delete_note_at_rejects_an_invalid_filename() {
        let dir = tempdir().unwrap();
        assert!(delete_note_at(dir.path(), "../escape.txt", None).is_err());
    }

    #[test]
    fn delete_note_at_with_the_current_hash_deletes() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("2026-09-07.txt"), "").unwrap();
        let hash = hash_bytes(b"");
        delete_note_at(dir.path(), "2026-09-07.txt", Some(&hash)).unwrap();
        assert!(!dir.path().join("2026-09-07.txt").exists());
    }

    #[test]
    fn delete_note_at_keeps_a_file_that_changed() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("2026-09-07.txt"), "synced in from another device").unwrap();
        let stale = hash_bytes(b"");
        let err = delete_note_at(dir.path(), "2026-09-07.txt", Some(&stale)).unwrap_err();
        assert!(err.starts_with(CONFLICT_ERROR_PREFIX));
        assert!(dir.path().join("2026-09-07.txt").exists());
    }

    #[test]
    fn delete_note_at_with_a_hash_and_no_file_succeeds() {
        let dir = tempdir().unwrap();
        assert!(delete_note_at(dir.path(), "2026-09-07.txt", Some("abc")).is_ok());
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
        write_note_at(&root, "2026-09-07.txt", "content", None).unwrap();
        assert!(root.join("2026-09-07.txt").exists());
    }

    #[test]
    fn read_and_write_note_reject_an_invalid_filename() {
        let dir = tempdir().unwrap();
        assert!(read_note_at(dir.path(), "not-a-date.txt").is_err());
        assert!(write_note_at(dir.path(), "../escape.txt", "x", None).is_err());
    }

    #[test]
    fn read_all_notes_returns_every_valid_file_with_its_content() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "first", None).unwrap();
        write_note_at(dir.path(), "2026-09-02.txt", "second", None).unwrap();
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

    #[test]
    fn concurrent_writes_to_one_note_never_interleave_or_leave_litter() {
        // Two ChronoNote paths (autosave + a drawer action, say) can call
        // write_note_at for the same file near-simultaneously. Each write
        // must land whole — the reader must never see a mix of two
        // writers' bytes — and no `.chrono-*.tmp` may survive.
        let dir = tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let handles: Vec<_> = (0..6)
            .map(|w| {
                let root = root.clone();
                std::thread::spawn(move || {
                    let body = format!("writer {w}\n").repeat(40);
                    for _ in 0..25 {
                        write_note_at(&root, "2026-09-07.txt", &body, None).unwrap();
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        let content = read_note_at(&root, "2026-09-07.txt").unwrap().unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 40);
        assert!(lines.iter().all(|l| *l == lines[0]), "content interleaved: {content}");
        let stray: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n != "2026-09-07.txt" && n != VERSIONS_DIRNAME)
            .collect();
        assert!(stray.is_empty(), "stray temp files after concurrent writes: {stray:?}");
    }

    #[test]
    fn guarded_concurrent_writes_let_exactly_one_win() {
        // Commands run off the main thread now, so check + write must not interleave: of 8
        // writers all holding the starting hash, one wins and the other 7 get the conflict error.
        let dir = tempdir().unwrap();
        let root = dir.path().to_path_buf();
        write_note_at(&root, "2026-09-07.txt", "start", None).unwrap();
        let h0 = hash_bytes(b"start");
        let barrier = std::sync::Barrier::new(8);
        let results: Vec<(usize, Result<FileMetadata, String>)> = std::thread::scope(|s| {
            let handles: Vec<_> = (0..8)
                .map(|w| {
                    let (root, h0, barrier) = (&root, &h0, &barrier);
                    s.spawn(move || {
                        barrier.wait();
                        (w, write_note_at(root, "2026-09-07.txt", &format!("writer {w}"), Some(h0)))
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });
        let winners: Vec<usize> = results.iter().filter(|(_, r)| r.is_ok()).map(|(w, _)| *w).collect();
        assert_eq!(winners.len(), 1, "expected exactly one winner: {results:?}");
        for (_, r) in results.iter().filter(|(_, r)| r.is_err()) {
            assert!(r.as_ref().unwrap_err().starts_with(CONFLICT_ERROR_PREFIX));
        }
        assert_eq!(
            read_note_at(&root, "2026-09-07.txt").unwrap(),
            Some(format!("writer {}", winners[0])),
        );
    }

    #[test]
    fn write_note_at_round_trips_through_the_atomic_path() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "content", None).unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "updated", None).unwrap();
        assert_eq!(
            read_note_at(dir.path(), "2026-09-07.txt").unwrap(),
            Some("updated".to_string()),
        );
        // No stray temp files in the notes dir after repeated writes.
        let mut names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n != VERSIONS_DIRNAME)
            .collect();
        names.sort();
        assert_eq!(names, vec!["2026-09-07.txt"]);
    }

    // --- external-modification detection (§94) ---

    #[test]
    fn file_metadata_reports_absent_for_a_missing_note() {
        let dir = tempdir().unwrap();
        let m = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert!(!m.exists);
        assert_eq!(m.content_hash, None);
    }

    #[test]
    fn file_metadata_hash_changes_iff_content_changes() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "one", None).unwrap();
        let a = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "one", None).unwrap();
        let a2 = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "two", None).unwrap();
        let b = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(a.content_hash, a2.content_hash);
        assert_ne!(a.content_hash, b.content_hash);
        assert_eq!(a.size_bytes, Some(3));
    }

    #[test]
    fn write_note_returns_the_hash_it_wrote() {
        let dir = tempdir().unwrap();
        let meta = write_note_at(dir.path(), "2026-09-07.txt", "hello", None).unwrap();
        let read = file_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(meta.content_hash, read.content_hash);
    }

    #[test]
    fn read_note_with_metadata_agrees_with_get_file_metadata() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "body", None).unwrap();
        let r = read_note_with_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(r.content, Some("body".to_string()));
        assert_eq!(r.metadata.content_hash, file_metadata_at(dir.path(), "2026-09-07.txt").unwrap().content_hash);
    }

    #[test]
    fn read_note_with_metadata_hash_matches_the_content_it_returned() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("2026-09-07.txt"), "abc").unwrap();
        let r = read_note_with_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(r.content, Some("abc".to_string()));
        assert_eq!(r.metadata.content_hash, Some(hash_bytes(b"abc")));
    }

    #[test]
    fn normalize_note_text_strips_bom_and_converts_line_endings() {
        assert_eq!(normalize_note_text("\u{feff}a\r\nb\rc"), "a\nb\nc");
        assert!(matches!(normalize_note_text("a\nb"), std::borrow::Cow::Borrowed("a\nb")));
    }

    #[test]
    fn crlf_file_reads_as_lf_and_hashes_as_lf() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("2026-09-07.txt"), "# task\r\nmore\r\n").unwrap();
        assert_eq!(read_note_at(dir.path(), "2026-09-07.txt").unwrap(), Some("# task\nmore\n".to_string()));
        assert_eq!(
            file_metadata_at(dir.path(), "2026-09-07.txt").unwrap().content_hash,
            Some(hash_bytes(b"# task\nmore\n")),
        );
        let r = read_note_with_metadata_at(dir.path(), "2026-09-07.txt").unwrap();
        assert_eq!(r.content, Some("# task\nmore\n".to_string()));
        assert_eq!(r.metadata.content_hash, Some(hash_bytes(b"# task\nmore\n")));
    }

    #[test]
    fn write_note_at_stores_lf_text() {
        let dir = tempdir().unwrap();
        let m = write_note_at(dir.path(), "2026-09-07.txt", "a\r\nb", None).unwrap();
        assert_eq!(fs::read(dir.path().join("2026-09-07.txt")).unwrap(), b"a\nb");
        assert_eq!(m.content_hash, Some(hash_bytes(b"a\nb")));
    }

    #[test]
    fn read_note_with_metadata_of_a_missing_file_is_none_and_not_exists() {
        let dir = tempdir().unwrap();
        let r = read_note_with_metadata_at(dir.path(), "2026-09-08.txt").unwrap();
        assert_eq!(r.content, None);
        assert!(!r.metadata.exists);
    }

    #[test]
    fn write_note_with_a_matching_expected_hash_succeeds() {
        let dir = tempdir().unwrap();
        let m = write_note_at(dir.path(), "2026-09-07.txt", "v1", None).unwrap();
        let hash = m.content_hash.unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "v2", Some(&hash)).unwrap();
        assert_eq!(read_note_at(dir.path(), "2026-09-07.txt").unwrap(), Some("v2".to_string()));
    }

    #[test]
    fn a_missing_file_matches_the_empty_content_hash() {
        // A tab for a day with no note yet carries the empty-content baseline; its first guarded
        // save must create the file, and any other expected hash must still be refused.
        let dir = tempdir().unwrap();
        assert!(write_note_at(dir.path(), "2026-09-08.txt", "x", Some(&hash_bytes(b"other"))).is_err());
        write_note_at(dir.path(), "2026-09-08.txt", "first line", Some(&hash_bytes(b""))).unwrap();
        assert_eq!(read_note_at(dir.path(), "2026-09-08.txt").unwrap(), Some("first line".to_string()));
    }

    #[test]
    fn write_note_with_a_stale_expected_hash_is_rejected_as_a_conflict() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "v1", None).unwrap();
        // Someone else changed the file since we last read it.
        write_note_at(dir.path(), "2026-09-07.txt", "external edit", None).unwrap();
        let err = write_note_at(dir.path(), "2026-09-07.txt", "our edit", Some("deadbeef")).unwrap_err();
        assert!(err.starts_with(CONFLICT_ERROR_PREFIX));
        // The file was NOT overwritten.
        assert_eq!(read_note_at(dir.path(), "2026-09-07.txt").unwrap(), Some("external edit".to_string()));
    }

    #[test]
    fn read_all_notes_skips_a_file_that_is_not_valid_utf8() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("2026-01-01.txt"), "ok").unwrap();
        fs::write(dir.path().join("2026-01-02.txt"), [0xffu8, 0xfe, 0x41]).unwrap();
        assert_eq!(
            read_all_notes_at(dir.path()).unwrap(),
            vec![("2026-01-01.txt".to_string(), "ok".to_string())],
        );
    }

    #[test]
    fn write_conflict_copy_lands_in_the_hidden_subdir_and_stays_invisible() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-07.txt", "real note", None).unwrap();
        let path = write_conflict_copy_at(dir.path(), "2026-09-07-143022.txt", "my unsaved version").unwrap();
        assert!(path.contains(CONFLICTS_DIRNAME));
        assert_eq!(
            fs::read_to_string(dir.path().join(CONFLICTS_DIRNAME).join("2026-09-07-143022.txt")).unwrap(),
            "my unsaved version",
        );
        // The conflicts dir and its files never show up as notes.
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-07.txt"]);
        assert_eq!(read_all_notes_at(dir.path()).unwrap().len(), 1);
    }

    #[test]
    fn write_conflict_copy_rejects_a_path_traversal_name() {
        let dir = tempdir().unwrap();
        assert!(write_conflict_copy_at(dir.path(), "../escape.txt", "x").is_err());
        assert!(write_conflict_copy_at(dir.path(), "sub/nested.txt", "x").is_err());
        assert!(write_conflict_copy_at(dir.path(), "no-extension", "x").is_err());
    }

    #[test]
    fn the_session_file_is_never_picked_up_by_list_note_files() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "note", None).unwrap();
        write_tab_session_at(dir.path(), &TabSession::default()).unwrap();
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-01.txt"]);
    }

    // --- import_notes_bundle (web-app design doc) ---

    #[test]
    fn import_merge_writes_new_notes_and_skips_existing_filenames() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "original", None).unwrap();
        let mut notes = HashMap::new();
        notes.insert("2026-09-01.txt".to_string(), "would overwrite".to_string());
        notes.insert("2026-09-02.txt".to_string(), "new note".to_string());
        let result = import_notes_bundle_at(dir.path(), &notes, ImportMode::Merge).unwrap();
        assert_eq!(result.imported, 1);
        assert_eq!(result.skipped, 1);
        assert_eq!(read_note_at(dir.path(), "2026-09-01.txt").unwrap(), Some("original".to_string()));
        assert_eq!(read_note_at(dir.path(), "2026-09-02.txt").unwrap(), Some("new note".to_string()));
    }

    #[test]
    fn import_replace_clears_existing_notes_first() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-08-15.txt", "stale, not in the import", None).unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "will be overwritten", None).unwrap();
        let mut notes = HashMap::new();
        notes.insert("2026-09-01.txt".to_string(), "restored".to_string());
        let result = import_notes_bundle_at(dir.path(), &notes, ImportMode::Replace).unwrap();
        assert_eq!(result.imported, 1);
        assert_eq!(result.skipped, 0);
        assert_eq!(read_note_at(dir.path(), "2026-09-01.txt").unwrap(), Some("restored".to_string()));
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-01.txt"]);
    }

    #[test]
    fn deleting_note_with_text_moves_it_to_trash() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-10.txt";
        write_note_at(root, filename, "Hello trash", None).unwrap();
        assert!(root.join(filename).exists());

        delete_note_at(root, filename, None).unwrap();
        assert!(!root.join(filename).exists());

        let trash = list_trash_at(root).unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].original_filename, filename);
        assert_eq!(trash[0].preview, "Hello trash");
        assert!(root.join(TRASH_DIRNAME).join(&trash[0].name).exists());
    }

    #[test]
    fn deleting_empty_note_is_just_removed() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-10.txt";
        write_note_at(root, filename, "   \n\n  ", None).unwrap();
        assert!(root.join(filename).exists());

        delete_note_at(root, filename, None).unwrap();
        assert!(!root.join(filename).exists());

        let trash = list_trash_at(root).unwrap();
        assert!(trash.is_empty());
    }

    #[test]
    fn listing_trash_returns_right_original_filename_and_preview() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-11.txt";
        write_note_at(root, filename, "\n\nFirst real line of text that has content\nSecond line", None).unwrap();
        delete_note_at(root, filename, None).unwrap();

        let trash = list_trash_at(root).unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].original_filename, filename);
        assert_eq!(trash[0].preview, "First real line of text that has content");
    }

    #[test]
    fn restore_puts_it_back_and_removes_it_from_trash() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-10.txt";
        write_note_at(root, filename, "Restore me please", None).unwrap();
        delete_note_at(root, filename, None).unwrap();

        let trash = list_trash_at(root).unwrap();
        assert_eq!(trash.len(), 1);
        let trash_name = &trash[0].name;

        let restored_filename = restore_from_trash_at(root, trash_name).unwrap();
        assert_eq!(restored_filename, filename);
        assert!(root.join(filename).exists());
        assert_eq!(read_note_at(root, filename).unwrap().unwrap(), "Restore me please");

        let trash_after = list_trash_at(root).unwrap();
        assert!(trash_after.is_empty());
        assert!(!root.join(TRASH_DIRNAME).join(trash_name).exists());
    }

    #[test]
    fn restore_refuses_when_note_has_text() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-10.txt";
        write_note_at(root, filename, "Original text", None).unwrap();
        delete_note_at(root, filename, None).unwrap();

        let trash = list_trash_at(root).unwrap();
        assert_eq!(trash.len(), 1);
        let trash_name = &trash[0].name;

        // Create the note again with text
        write_note_at(root, filename, "New existing text", None).unwrap();

        let err = restore_from_trash_at(root, trash_name).unwrap_err();
        assert_eq!(err, "note-exists");

        // The trash item should still be in trash
        let trash_still = list_trash_at(root).unwrap();
        assert_eq!(trash_still.len(), 1);
    }

    #[test]
    fn items_older_than_30_days_are_pruned() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let trash_dir = root.join(TRASH_DIRNAME);
        fs::create_dir_all(&trash_dir).unwrap();

        // Write an old file (e.g. from 2020)
        let old_name = "20200101-120000_2020-01-01.txt";
        fs::write(trash_dir.join(old_name), "Very old note").unwrap();

        // Write a fresh file
        let filename = "2026-10-10.txt";
        write_note_at(root, filename, "Fresh note", None).unwrap();
        delete_note_at(root, filename, None).unwrap();

        assert!(trash_dir.join(old_name).exists());

        // Clean-up removes old trash items
        clean_up_versions_and_trash_at(root, chrono::Local::now()).unwrap();

        let trash = list_trash_at(root).unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].original_filename, filename);

        // Old file should be deleted from disk
        assert!(!trash_dir.join(old_name).exists());
    }

    #[test]
    fn deleting_emptied_note_puts_last_version_in_trash() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-11.txt";

        // Write note with content
        let m1 = write_note_at(root, filename, "Important text", None).unwrap();
        // Empty note (keeps previous text as version)
        write_note_at(root, filename, "   ", m1.content_hash.as_deref()).unwrap();

        // Note file on disk is empty
        assert!(root.join(filename).exists());
        assert_eq!(fs::read_to_string(root.join(filename)).unwrap().trim(), "");

        // Delete the emptied note
        delete_note_at(root, filename, None).unwrap();
        assert!(!root.join(filename).exists());

        // Last version's text was copied into trash
        let trash = list_trash_at(root).unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].original_filename, filename);
        assert_eq!(trash[0].preview, "Important text");

        // Can restore it from trash
        let restored = restore_from_trash_at(root, &trash[0].name).unwrap();
        assert_eq!(restored, filename);
        assert_eq!(read_note_at(root, filename).unwrap().unwrap(), "Important text");
    }

    // --- Earlier Versions of a Note ---

    #[test]
    fn version_saves_five_minute_rule_and_exceptions() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-11.txt";

        let naive_base = chrono::NaiveDateTime::parse_from_str("20261011-100000", "%Y%m%d-%H%M%S").unwrap();
        let t0 = chrono::Local.from_local_datetime(&naive_base).unwrap();

        // Initial creation of note (target did not exist before, so no previous version to keep)
        let m0 = write_note_at_time(root, filename, "Draft 0", None, t0).unwrap();
        assert_eq!(list_versions_at(root, filename).unwrap().len(), 0);

        // Three saves 1 minute apart:
        // Save 1 at t0 + 1m: keeps Draft 0 as version
        let t1 = t0 + chrono::Duration::minutes(1);
        let m1 = write_note_at_time(root, filename, "Draft 1", m0.content_hash.as_deref(), t1).unwrap();
        let vers1 = list_versions_at(root, filename).unwrap();
        assert_eq!(vers1.len(), 1);
        assert_eq!(read_version_at(root, filename, &vers1[0].name).unwrap(), "Draft 0");

        // Save 2 at t0 + 2m (1 min after last version): within 5 min, does not keep a version
        let t2 = t0 + chrono::Duration::minutes(2);
        let m2 = write_note_at_time(root, filename, "Draft 2", m1.content_hash.as_deref(), t2).unwrap();
        assert_eq!(list_versions_at(root, filename).unwrap().len(), 1);

        // Save 3 at t0 + 3m (2 min after last version): within 5 min, does not keep a version
        let t3 = t0 + chrono::Duration::minutes(3);
        let m3 = write_note_at_time(root, filename, "Draft 3", m2.content_hash.as_deref(), t3).unwrap();
        assert_eq!(list_versions_at(root, filename).unwrap().len(), 1);

        // A save 6 minutes after the last version (t1 + 6m = t0 + 7m) keeps a second version
        let t4 = t0 + chrono::Duration::minutes(7);
        let m4 = write_note_at_time(root, filename, "Draft 4", m3.content_hash.as_deref(), t4).unwrap();
        let vers2 = list_versions_at(root, filename).unwrap();
        assert_eq!(vers2.len(), 2);
        assert_eq!(read_version_at(root, filename, &vers2[0].name).unwrap(), "Draft 3");

        // Emptying the note keeps a version even within 5 minutes (at t0 + 8m, 1 min after last version)
        let t5 = t0 + chrono::Duration::minutes(8);
        write_note_at_time(root, filename, "   ", m4.content_hash.as_deref(), t5).unwrap();
        let vers3 = list_versions_at(root, filename).unwrap();
        assert_eq!(vers3.len(), 3);
        assert_eq!(read_version_at(root, filename, &vers3[0].name).unwrap(), "Draft 4");

        // A no-hash write always keeps one (deliberate overwrite)
        let t6 = t0 + chrono::Duration::minutes(9);
        write_note_at_time(root, filename, "Draft 5", None, t6).unwrap();
        let t7 = t0 + chrono::Duration::minutes(10);
        write_note_at_time(root, filename, "Draft 6", None, t7).unwrap();
        let vers4 = list_versions_at(root, filename).unwrap();
        assert_eq!(vers4.len(), 4);
        assert_eq!(read_version_at(root, filename, &vers4[0].name).unwrap(), "Draft 5");
    }

    #[test]
    fn version_keep_version_true_keeps_version_within_cooldown_and_refused_keeps_nothing() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-11.txt";

        let naive_base = chrono::NaiveDateTime::parse_from_str("20261011-100000", "%Y%m%d-%H%M%S").unwrap();
        let t0 = chrono::Local.from_local_datetime(&naive_base).unwrap();

        // Initial creation of note
        let m0 = write_note_at_time(root, filename, "Draft 0", None, t0).unwrap();
        assert_eq!(list_versions_at(root, filename).unwrap().len(), 0);

        // Save 1 at t0 + 1m: keeps Draft 0 as version
        let t1 = t0 + chrono::Duration::minutes(1);
        let m1 = write_note_at_time(root, filename, "Draft 1", m0.content_hash.as_deref(), t1).unwrap();
        let vers1 = list_versions_at(root, filename).unwrap();
        assert_eq!(vers1.len(), 1);
        assert_eq!(read_version_at(root, filename, &vers1[0].name).unwrap(), "Draft 0");

        // The same write without keep_version 1 minute later keeps none (today's rule, unchanged)
        let t2 = t1 + chrono::Duration::minutes(1);
        let m2 = write_note_at_time(root, filename, "Draft 2", m1.content_hash.as_deref(), t2).unwrap();
        let vers2 = list_versions_at(root, filename).unwrap();
        assert_eq!(vers2.len(), 1);
        assert_eq!(read_version_at(root, filename, &vers2[0].name).unwrap(), "Draft 0");

        // A write with keep_version=true whose hash does not match is refused and keeps nothing
        let t3 = t2 + chrono::Duration::minutes(1);
        let stale_hash = "deadbeef";
        let err = write_note_keeping_version_at_time(root, filename, "Refused Edit", Some(stale_hash), t3);
        assert!(err.is_err());
        let vers_refused = list_versions_at(root, filename).unwrap();
        assert_eq!(vers_refused.len(), 1);
        assert_eq!(read_version_at(root, filename, &vers_refused[0].name).unwrap(), "Draft 0");

        // With a version saved 1 minute ago (within 5 min cooldown), a write with keep_version=true
        // and a matching hash keeps the replaced text as the newest version
        let _m3 = write_note_keeping_version_at_time(root, filename, "Draft 3", m2.content_hash.as_deref(), t3).unwrap();
        let vers3 = list_versions_at(root, filename).unwrap();
        assert_eq!(vers3.len(), 2);
        assert_eq!(read_version_at(root, filename, &vers3[0].name).unwrap(), "Draft 2");
        assert_eq!(read_version_at(root, filename, &vers3[1].name).unwrap(), "Draft 0");
    }

    #[test]
    fn version_deliberate_overwrite_always_keeps_version() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-11.txt";

        write_note_at(root, filename, "Version 0", None).unwrap();
        // expected_hash: None is a deliberate overwrite
        write_note_at(root, filename, "Version 1", None).unwrap();
        write_note_at(root, filename, "Version 2", None).unwrap();

        let vers = list_versions_at(root, filename).unwrap();
        assert_eq!(vers.len(), 2);
        assert_eq!(read_version_at(root, filename, &vers[0].name).unwrap(), "Version 1");
        assert_eq!(read_version_at(root, filename, &vers[1].name).unwrap(), "Version 0");
    }

    #[test]
    fn version_identical_content_not_kept_twice() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-11.txt";

        write_note_at(root, filename, "Same content", None).unwrap();
        write_note_at(root, filename, "Different content", None).unwrap();
        let vers = list_versions_at(root, filename).unwrap();
        assert_eq!(vers.len(), 1);
        assert_eq!(read_version_at(root, filename, &vers[0].name).unwrap(), "Same content");

        // Try to keep "Same content" again directly
        keep_version_at(root, filename, "Same content").unwrap();
        let vers_after = list_versions_at(root, filename).unwrap();
        assert_eq!(vers_after.len(), 1);
    }

    #[test]
    fn version_import_replace_keeps_existing_content() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file1 = "2026-10-11.txt";
        let file2 = "2026-10-12.txt";

        write_note_at(root, file1, "Existing file 1", None).unwrap();
        write_note_at(root, file2, "Existing file 2", None).unwrap();

        let mut bundle = std::collections::HashMap::new();
        bundle.insert(file1.to_string(), "Overwritten file 1".to_string());
        // file2 is omitted from bundle, so Replace mode will delete file2

        let res = import_notes_bundle_at(root, &bundle, ImportMode::Replace).unwrap();
        assert_eq!(res.imported, 1);

        // file1 was overwritten: check its old content was kept as a version
        let vers1 = list_versions_at(root, file1).unwrap();
        assert_eq!(vers1.len(), 1);
        assert_eq!(read_version_at(root, file1, &vers1[0].name).unwrap(), "Existing file 1");

        // file2 was deleted: check its content was kept as a version in .chrononote-versions/2026-10-12/
        let vers2 = list_versions_at(root, file2).unwrap();
        assert_eq!(vers2.len(), 1);
        assert_eq!(read_version_at(root, file2, &vers2[0].name).unwrap(), "Existing file 2");
    }

    #[test]
    fn version_restore_keeps_current_content_and_returns_metadata() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let filename = "2026-10-11.txt";

        write_note_at(root, filename, "Original text", None).unwrap();
        write_note_at(root, filename, "Current modified text", None).unwrap();

        let vers = list_versions_at(root, filename).unwrap();
        assert_eq!(vers.len(), 1);
        let original_version_name = vers[0].name.clone();

        // Restore the original text
        let meta = restore_version_at(root, filename, &original_version_name).unwrap();
        assert!(meta.exists);

        // Disk content should now be original text
        let content = fs::read_to_string(root.join(filename)).unwrap();
        assert_eq!(content, "Original text");
        assert_eq!(meta.content_hash, Some(hash_bytes(b"Original text")));

        // Versions list should now include the text prior to restore ("Current modified text")
        let vers_after = list_versions_at(root, filename).unwrap();
        assert_eq!(vers_after.len(), 2);
        assert_eq!(read_version_at(root, filename, &vers_after[0].name).unwrap(), "Current modified text");
    }

    #[test]
    fn upgrade_fixture_notes_folder_lists_and_normalizes() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let notes_dir = manifest_dir.join("tests/fixtures/notes");

        // 1. Listing returns exactly the three dated notes, ignoring .chrononote-conflicts and .agenda.json
        let mut notes = list_note_files_at(&notes_dir).unwrap();
        notes.sort();
        assert_eq!(
            notes,
            vec!["2026-09-01.txt", "2026-09-02.txt", "2026-09-03.txt"]
        );

        // 2. Reading LF note
        let lf_note = read_note_at(&notes_dir, "2026-09-01.txt").unwrap().unwrap();
        assert_eq!(lf_note, "# 2026-09-01\n\nDaily log with LF line endings.\n");

        // 3. Reading CRLF note returns normalized text (no \r)
        let crlf_note = read_note_at(&notes_dir, "2026-09-02.txt").unwrap().unwrap();
        assert_eq!(crlf_note, "# 2026-09-02\n\nDaily log with CRLF line endings.\n");
        assert!(!crlf_note.contains('\r'));

        // 4. Reading UTF-8 BOM note returns normalized text (no BOM)
        let bom_note = read_note_at(&notes_dir, "2026-09-03.txt").unwrap().unwrap();
        assert_eq!(bom_note, "# 2026-09-03\n\nDaily log with UTF-8 BOM.\n");
        assert!(!bom_note.starts_with('\u{feff}'));
    }

    // --- Conformance cases runner ---

    fn substitute_args(
        val: &mut serde_json::Value,
        vars: &std::collections::HashMap<String, serde_json::Value>,
    ) {
        match val {
            serde_json::Value::String(s) => {
                if let Some(var_name) = s.strip_prefix('$') {
                    // An unknown name would otherwise stay a literal and make an "error" step pass vacuously.
                    let replacement = vars.get(var_name).unwrap_or_else(|| panic!("unknown capture variable ${var_name}"));
                    *val = replacement.clone();
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr {
                    substitute_args(item, vars);
                }
            }
            serde_json::Value::Object(map) => {
                for (_, v) in map {
                    substitute_args(v, vars);
                }
            }
            _ => {}
        }
    }

    fn extract_path(val: &serde_json::Value, path: &str) -> Option<serde_json::Value> {
        let mut curr = val;
        for part in path.split('.') {
            if let Ok(idx) = part.parse::<usize>() {
                curr = curr.get(idx)?;
            } else {
                curr = curr.get(part)?;
            }
        }
        Some(curr.clone())
    }

    fn check_fields_rust(
        actual: &serde_json::Value,
        expected_fields: &serde_json::Map<String, serde_json::Value>,
        case_name: &str,
        step_idx: usize,
        cmd: &str,
    ) -> Result<(), String> {
        if let Some(arr) = actual.as_array() {
            if let Some(len_val) = expected_fields.get("length") {
                let expected_len = len_val.as_u64().ok_or_else(|| {
                    format!("Case '{case_name}', step {step_idx} ({cmd}): length must be an integer")
                })? as usize;
                if arr.len() != expected_len {
                    return Err(format!(
                        "Case '{case_name}', step {step_idx} ({cmd}): array length mismatch. Expected {expected_len}, got {}",
                        arr.len()
                    ));
                }
            }
            if let Some(contains_val) = expected_fields.get("contains") {
                let found = arr.iter().any(|item| item == contains_val);
                if !found {
                    return Err(format!(
                        "Case '{case_name}', step {step_idx} ({cmd}): array does not contain {contains_val:?}"
                    ));
                }
            }
            return Ok(());
        }

        let Some(obj) = actual.as_object() else {
            return Err(format!(
                "Case '{case_name}', step {step_idx} ({cmd}): expected object or array for fields check, got {actual:?}"
            ));
        };

        for (k, expected_v) in expected_fields {
            let Some(actual_v) = obj.get(k) else {
                return Err(format!(
                    "Case '{case_name}', step {step_idx} ({cmd}): missing field '{k}' in result {actual:?}"
                ));
            };
            if let Some(expected_sub) = expected_v.as_object() {
                if actual_v.is_object() {
                    check_fields_rust(actual_v, expected_sub, case_name, step_idx, cmd)?;
                } else {
                    return Err(format!(
                        "Case '{case_name}', step {step_idx} ({cmd}): field '{k}' expected object, got {actual_v:?}"
                    ));
                }
            } else if actual_v != expected_v {
                return Err(format!(
                    "Case '{case_name}', step {step_idx} ({cmd}): field '{k}' mismatch. Expected {expected_v:?}, got {actual_v:?}"
                ));
            }
        }
        Ok(())
    }

    #[test]
    fn conformance_cases() {
        let raw_json = include_str!("../../../src/lib/conformance/storage-cases.json");
        let cases: serde_json::Value =
            serde_json::from_str(raw_json).expect("valid json in storage-cases.json");
        let cases_arr = cases.as_array().expect("storage-cases.json root must be array");

        let mut failures = Vec::new();

        for case in cases_arr {
            let case_name = case.get("name").and_then(|n| n.as_str()).unwrap_or("unnamed");
            if case.get("skip").and_then(|s| s.get("rust")).is_some() {
                continue;
            }

            let dir = tempdir().expect("tempdir creation");
            let root = dir.path();
            let mut vars = std::collections::HashMap::new();

            let Some(steps) = case.get("steps").and_then(|s| s.as_array()) else {
                failures.push(format!("Case '{case_name}': missing or invalid 'steps' array"));
                continue;
            };

            for (step_idx, step) in steps.iter().enumerate() {
                let Some(cmd) = step.get("cmd").and_then(|c| c.as_str()) else {
                    failures.push(format!("Case '{case_name}', step {step_idx}: missing 'cmd'"));
                    break;
                };

                let mut args = step.get("args").cloned().unwrap_or(serde_json::json!({}));
                substitute_args(&mut args, &vars);

                let call_res = match cmd {
                    "read_note" => {
                        let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("");
                        read_note_at(root, filename).map(|opt| serde_json::to_value(&opt).unwrap())
                    }
                    "write_note" => {
                        let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("");
                        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        let expected_hash = args.get("expectedHash").and_then(|v| v.as_str());
                        let keep_version = args.get("keepVersion").and_then(|v| v.as_bool()).unwrap_or(false);
                        if keep_version {
                            write_note_keeping_version_at(root, filename, content, expected_hash)
                        } else {
                            write_note_at(root, filename, content, expected_hash)
                        }
                        .map(|meta| serde_json::to_value(&meta).unwrap())
                    }
                    "delete_note" => {
                        let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("");
                        let expected_hash = args.get("expectedHash").and_then(|v| v.as_str());
                        delete_note_at(root, filename, expected_hash).map(|()| serde_json::Value::Null)
                    }
                    "list_note_files" => {
                        list_note_files_at(root).map(|files| serde_json::to_value(&files).unwrap())
                    }
                    "get_file_metadata" => {
                        let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("");
                        file_metadata_at(root, filename).map(|meta| serde_json::to_value(&meta).unwrap())
                    }
                    "read_note_with_metadata" => {
                        let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("");
                        read_note_with_metadata_at(root, filename)
                            .map(|res| serde_json::to_value(&res).unwrap())
                    }
                    "read_tab_session" => {
                        read_tab_session_at(root).map(|opt| serde_json::to_value(&opt).unwrap())
                    }
                    "write_tab_session" => {
                        let open_tabs: Vec<String> = serde_json::from_value(
                            args.get("openTabs").cloned().unwrap_or(serde_json::json!([])),
                        )
                        .unwrap_or_default();
                        let active_tab = args.get("activeTab").and_then(|v| v.as_str().map(String::from));
                        let last_opened_date =
                            args.get("lastOpenedDate").and_then(|v| v.as_str().map(String::from));
                        let auto_added_meetings: Option<std::collections::BTreeMap<String, Vec<String>>> = args
                            .get("autoAddedMeetings")
                            .filter(|v| !v.is_null())
                            .map(|v| serde_json::from_value(v.clone()))
                            .transpose()
                            .map_err(|e| e.to_string())
                            .unwrap();
                        let session = TabSession {
                            schema_version: CONFIG_SCHEMA_VERSION,
                            open_tabs,
                            active_tab,
                            last_opened_date,
                            auto_added_meetings,
                            extra: Default::default(),
                        };
                        write_tab_session_at(root, &session).map(|()| serde_json::Value::Null)
                    }
                    "list_trash" => {
                        list_trash_at(root).map(|items| serde_json::to_value(&items).unwrap())
                    }
                    "restore_from_trash" => {
                        let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        restore_from_trash_at(root, name).map(|orig| serde_json::to_value(&orig).unwrap())
                    }
                    "read_saved_searches" => {
                        read_saved_searches_at(root).map(|opt| serde_json::to_value(&opt).unwrap())
                    }
                    "write_saved_searches" => {
                        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        write_saved_searches_at(root, content).map(|()| serde_json::Value::Null)
                    }
                    other => {
                        failures.push(format!("Case '{case_name}', step {step_idx}: unknown cmd '{other}'"));
                        break;
                    }
                };

                let expect_spec = step.get("expect");
                let expect_error = expect_spec
                    .and_then(|e| e.get("error"))
                    .and_then(|e| e.as_bool())
                    .unwrap_or(false);

                let actual_val = match call_res {
                    Ok(val) => {
                        if expect_error {
                            failures.push(format!(
                                "Case '{case_name}', step {step_idx} ({cmd}): expected error, but call succeeded with {val:?}"
                            ));
                            break;
                        }
                        val
                    }
                    Err(err) => {
                        if !expect_error {
                            failures.push(format!(
                                "Case '{case_name}', step {step_idx} ({cmd}): call failed unexpectedly with error: {err}"
                            ));
                            break;
                        }
                        serde_json::Value::Null
                    }
                };

                if let Some(expect) = expect_spec {
                    if let Some(expected_result) = expect.get("result") {
                        if &actual_val != expected_result {
                            failures.push(format!(
                                "Case '{case_name}', step {step_idx} ({cmd}): result mismatch.\nExpected: {expected_result}\nActual:   {actual_val}"
                            ));
                            break;
                        }
                    } else if let Some(expected_fields) = expect.get("fields").and_then(|f| f.as_object()) {
                        if let Err(err) =
                            check_fields_rust(&actual_val, expected_fields, case_name, step_idx, cmd)
                        {
                            failures.push(err);
                            break;
                        }
                    }
                }

                if let Some(capture) = step.get("capture").and_then(|c| c.as_object()) {
                    for (var_name, path_val) in capture {
                        if let Some(path_str) = path_val.as_str() {
                            if let Some(extracted) = extract_path(&actual_val, path_str) {
                                vars.insert(var_name.clone(), extracted);
                            } else {
                                failures.push(format!(
                                    "Case '{case_name}', step {step_idx} ({cmd}): capture path '{path_str}' not found in {actual_val:?}"
                                ));
                                break;
                            }
                        }
                    }
                }
            }
        }

        if !failures.is_empty() {
            panic!("Conformance failures ({}):\n{}", failures.len(), failures.join("\n"));
        }
    }
}
