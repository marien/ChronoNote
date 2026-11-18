use std::fs;
use std::path::{Path, PathBuf};
use super::disk::atomic_write;
use super::notes::hash_bytes;

/// The phone companion's folder inside the notes folder: `outbox.json` (written here) and `inbox.json` (written by
/// the phone). Hidden, and invisible to the note listings for the same reason as the conflicts folder.
const MOBILE_DIRNAME: &str = ".chrononote-mobile";

pub(super) fn write_phone_meetings_at(root: &Path, content: &str) -> Result<(), String> {
    // Atomic, so the phone (through OneDrive) only ever sees the old file or the new one.
    atomic_write(&root.join(MOBILE_DIRNAME).join("meetings.json"), content.as_bytes()).map_err(|e| e.to_string())
}

pub(super) fn write_phone_outbox_at(root: &Path, content: &str) -> Result<(), String> {
    // Atomic, so the phone (through OneDrive) only ever sees the old file or the new one.
    atomic_write(&root.join(MOBILE_DIRNAME).join("outbox.json"), content.as_bytes()).map_err(|e| e.to_string())
}

/// The phone's requests are a few lines of JSON; anything bigger is not from the phone app.
const MAX_PHONE_INBOX_BYTES: u64 = 1024 * 1024;

const SAVED_SEARCHES_FILENAME: &str = ".chrononote-searches.txt";
const MAX_SAVED_SEARCHES_BYTES: u64 = 64 * 1024;

pub(super) fn read_saved_searches_at(root: &Path) -> Result<Option<String>, String> {
    let path = root.join(SAVED_SEARCHES_FILENAME);
    let meta = match fs::metadata(&path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    if meta.len() > MAX_SAVED_SEARCHES_BYTES {
        return Err("saved searches too large".to_string());
    }
    match fs::read(&path) {
        // Checked again on what was read: the file can grow between the two calls (OneDrive).
        Ok(bytes) if bytes.len() as u64 > MAX_SAVED_SEARCHES_BYTES => Err("saved searches too large".to_string()),
        Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub(super) fn write_saved_searches_at(root: &Path, content: &str) -> Result<(), String> {
    atomic_write(&root.join(SAVED_SEARCHES_FILENAME), content.as_bytes()).map_err(|e| e.to_string())
}

pub(super) fn read_phone_inbox_at(root: &Path) -> Result<Option<String>, String> {
    let path = root.join(MOBILE_DIRNAME).join("inbox.json");
    let meta = match fs::metadata(&path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    if meta.len() > MAX_PHONE_INBOX_BYTES {
        return Err("inbox too large".to_string());
    }
    match fs::read(&path) {
        // Checked again on what was read: the file can grow between the two calls (OneDrive).
        Ok(bytes) if bytes.len() as u64 > MAX_PHONE_INBOX_BYTES => Err("inbox too large".to_string()),
        Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// The ledger of handled phone requests lives in the app's data dir, one file per notes folder (the
/// first 16 hex digits of the SHA-256 of the folder's path), outside OneDrive on purpose: a second
/// machine syncing the same notes must not inherit what this one handled.
fn phone_ledger_path_at(data_dir: &Path, notes_dir: &Path) -> PathBuf {
    let key = hash_bytes(notes_dir.to_string_lossy().as_bytes());
    data_dir.join("phone-companion").join(format!("{}.json", &key[..16]))
}

pub(super) fn read_phone_ledger_at(data_dir: &Path, notes_dir: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(phone_ledger_path_at(data_dir, notes_dir)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub(super) fn write_phone_ledger_at(data_dir: &Path, notes_dir: &Path, content: &str) -> Result<(), String> {
    atomic_write(&phone_ledger_path_at(data_dir, notes_dir), content.as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::notes::{list_note_files_at, read_all_notes_at};

    #[test]
    fn the_phone_meetings_file_is_written_and_replaced_in_its_hidden_folder_and_stays_out_of_the_note_list() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("2026-10-29.txt"), "x").unwrap();
        write_phone_meetings_at(dir.path(), "{\"format\":1}").unwrap();
        write_phone_meetings_at(dir.path(), "{\"format\":1,\"meetings\":[]}").unwrap();
        let out = dir.path().join(".chrononote-mobile").join("meetings.json");
        assert_eq!(fs::read_to_string(out).unwrap(), "{\"format\":1,\"meetings\":[]}");
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-10-29.txt".to_string()]);
        assert_eq!(read_all_notes_at(dir.path()).unwrap().len(), 1);
    }

    #[test]
    fn the_phone_outbox_is_written_and_replaced_in_its_hidden_folder_and_stays_out_of_the_note_list() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("2026-10-29.txt"), "x").unwrap();
        write_phone_outbox_at(dir.path(), "{\"format\":1}").unwrap();
        write_phone_outbox_at(dir.path(), "{\"format\":2}").unwrap();
        let out = dir.path().join(".chrononote-mobile").join("outbox.json");
        assert_eq!(fs::read_to_string(out).unwrap(), "{\"format\":2}");
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-10-29.txt".to_string()]);
        assert_eq!(read_all_notes_at(dir.path()).unwrap().len(), 1);
    }

    #[test]
    fn the_phone_inbox_is_none_when_missing_and_read_back_as_text() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_phone_inbox_at(dir.path()).unwrap(), None);
        let folder = dir.path().join(".chrononote-mobile");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("inbox.json"), "{\"format\":1,\"requests\":[]}").unwrap();
        assert_eq!(read_phone_inbox_at(dir.path()).unwrap().as_deref(), Some("{\"format\":1,\"requests\":[]}"));
    }

    #[test]
    fn a_phone_inbox_over_one_megabyte_is_an_error_but_exactly_one_megabyte_is_read() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join(".chrononote-mobile");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("inbox.json"), vec![b' '; 1024 * 1024]).unwrap();
        assert_eq!(read_phone_inbox_at(dir.path()).unwrap().unwrap().len(), 1024 * 1024);
        fs::write(folder.join("inbox.json"), vec![b' '; 1024 * 1024 + 1]).unwrap();
        assert_eq!(read_phone_inbox_at(dir.path()).unwrap_err(), "inbox too large");
    }

    #[test]
    fn saved_searches_is_none_when_missing_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_saved_searches_at(dir.path()).unwrap(), None);
        write_saved_searches_at(dir.path(), "has:@dana is:open\n").unwrap();
        assert_eq!(
            read_saved_searches_at(dir.path()).unwrap().as_deref(),
            Some("has:@dana is:open\n")
        );
    }

    #[test]
    fn saved_searches_over_64_kb_is_an_error_but_exactly_64_kb_is_read() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SAVED_SEARCHES_FILENAME), vec![b'a'; 64 * 1024]).unwrap();
        assert_eq!(read_saved_searches_at(dir.path()).unwrap().unwrap().len(), 64 * 1024);
        fs::write(dir.path().join(SAVED_SEARCHES_FILENAME), vec![b'a'; 64 * 1024 + 1]).unwrap();
        assert_eq!(read_saved_searches_at(dir.path()).unwrap_err(), "saved searches too large");
    }

    #[test]
    fn the_phone_ledger_is_missing_then_read_back_and_replaced() {
        let data = tempfile::tempdir().unwrap();
        let notes = Path::new("/notes/a");
        assert_eq!(read_phone_ledger_at(data.path(), notes).unwrap(), None);
        write_phone_ledger_at(data.path(), notes, "{\"format\":1}").unwrap();
        write_phone_ledger_at(data.path(), notes, "{\"format\":1,\"handled\":{}}").unwrap();
        assert_eq!(
            read_phone_ledger_at(data.path(), notes).unwrap().as_deref(),
            Some("{\"format\":1,\"handled\":{}}")
        );
    }

    #[test]
    fn the_phone_ledger_path_differs_per_notes_folder_and_is_a_16_hex_digit_key() {
        let data = Path::new("/data");
        let a = phone_ledger_path_at(data, Path::new("/notes/a"));
        let b = phone_ledger_path_at(data, Path::new("/notes/b"));
        assert_ne!(a, b);
        assert_eq!(a, phone_ledger_path_at(data, Path::new("/notes/a")));
        assert_eq!(a.parent().unwrap(), data.join("phone-companion"));
        let stem = a.file_stem().unwrap().to_string_lossy().into_owned();
        assert_eq!(stem.len(), 16);
        assert!(stem.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_eq!(a.extension().unwrap(), "json");

        // Another notes folder does not see this one's ledger.
        let tmp = tempfile::tempdir().unwrap();
        write_phone_ledger_at(tmp.path(), Path::new("/notes/a"), "x").unwrap();
        assert_eq!(read_phone_ledger_at(tmp.path(), Path::new("/notes/b")).unwrap(), None);
    }
}
