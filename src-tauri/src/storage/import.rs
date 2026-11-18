use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use ts_rs::TS;
use super::notes::{is_valid_note_filename, list_note_files_at, write_note_at};
use super::versions::keep_version_at;

// --- Bundle import (web-app design doc, "Closing the loop") --------------
//
// Shared by the desktop app's own "Import notes from a file" Settings
// entry and the web app's IndexedDB-backed importer — both hand this the
// same `{filename -> content}` map parsed frontend-side from an export
// JSON file (`docs/design/webapp-roadmap.md`'s export format). Desktop
// writes through the existing atomic `write_note_at`; nothing here is new
// storage logic, just a loop over it.

/// `merge` never touches an existing filename; `replace` clears every
/// existing note first. Mirrors the two choices the export/import design
/// doc settled on — merge is the safe default, replace is the explicit,
/// more clearly destructive "restore a backup" path.
#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug, TS)]
#[serde(rename_all = "lowercase")]
pub enum ImportMode {
    Merge,
    Replace,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: u32,
    pub skipped: u32,
}

/// An entry is skipped (not an error) when its filename isn't a valid
/// `YYYY-MM-DD.txt` note name, or (in `Merge` mode) a note with that name
/// already exists — an import file is trusted no more than any other
/// input, since it could have been hand-edited or come from a future
/// schema version.
pub(super) fn import_notes_bundle_at(
    root: &Path,
    notes: &std::collections::HashMap<String, String>,
    mode: ImportMode,
) -> Result<ImportResult, String> {
    let mut imported = 0u32;
    let mut skipped = 0u32;
    for (filename, content) in notes {
        if !is_valid_note_filename(filename) {
            skipped += 1;
            continue;
        }
        if mode == ImportMode::Merge && root.join(filename).exists() {
            skipped += 1;
            continue;
        }
        write_note_at(root, filename, content, None)?;
        imported += 1;
    }
    if mode == ImportMode::Replace {
        // Only after every note from the file is written: a failure part-way leaves the old notes in place.
        for f in list_note_files_at(root)? {
            if !notes.contains_key(&f) {
                if let Ok(curr) = fs::read_to_string(root.join(&f)) {
                    if !curr.trim().is_empty() {
                        let _ = keep_version_at(root, &f, &curr);
                    }
                }
                fs::remove_file(root.join(&f)).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(ImportResult { imported, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[test]
    fn import_replace_writes_before_removing_old_notes() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("2026-01-01.txt"), "old one").unwrap();
        fs::write(dir.path().join("2026-01-02.txt"), "old two").unwrap();
        let mut notes = HashMap::new();
        notes.insert("2026-01-02.txt".to_string(), "new two".to_string());
        let r = import_notes_bundle_at(dir.path(), &notes, ImportMode::Replace).unwrap();
        assert_eq!(r.imported, 1);
        assert!(!dir.path().join("2026-01-01.txt").exists());
        assert_eq!(fs::read_to_string(dir.path().join("2026-01-02.txt")).unwrap(), "new two");
    }

    #[test]
    fn import_skips_invalid_filenames_rather_than_erroring() {
        let dir = tempdir().unwrap();
        let mut notes = HashMap::new();
        notes.insert("not-a-date.txt".to_string(), "x".to_string());
        notes.insert("../escape.txt".to_string(), "x".to_string());
        notes.insert("2026-09-03.txt".to_string(), "valid".to_string());
        let result = import_notes_bundle_at(dir.path(), &notes, ImportMode::Merge).unwrap();
        assert_eq!(result.imported, 1);
        assert_eq!(result.skipped, 2);
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-03.txt"]);
    }
}
