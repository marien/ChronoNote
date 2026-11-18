use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

// --- Path-parameterized cores ---------------------------------------------
//
// Every function below takes an explicit path instead of resolving one from
// an `AppHandle` itself — that's the only thing separating them from the
// public, Tauri-command-facing functions further down (each of which is
// just "resolve the real path, then call the `_at` version"). Splitting it
// out this way means the actual file-handling logic can be unit tested
// directly against a `tempfile::tempdir()`, without needing a running Tauri
// app (`AppHandle::path()` resolves real OS directories — `app_config_dir`/
// `document_dir` — which isn't something a plain `#[test]` can fake without
// either this split or standing up a full mock app pointed at a temp HOME).

// --- Durable, confined disk writes (§1) ----------------------------------

/// Errors from the workspace-confinement guard. The rest of this module
/// still surfaces failures as `String` (mapped at the Tauri-command
/// boundary); this dedicated type exists only where a caller or test
/// needs to tell "the requested path would escape the workspace" apart
/// from an ordinary I/O failure.
#[derive(Debug)]
pub(super) enum StorageError {
    /// The resolved path lies outside the canonical workspace root —
    /// `..` traversal, an absolute override, or a symlink pointing out.
    PathEscapesWorkspace,
    Io(std::io::Error),
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::PathEscapesWorkspace => write!(f, "path escapes the workspace root"),
            StorageError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        StorageError::Io(e)
    }
}

impl From<StorageError> for String {
    fn from(e: StorageError) -> Self {
        e.to_string()
    }
}

/// Resolve `rel` against `workspace` and guarantee the result stays
/// inside it, following symlinks (§1.1). `..` components, absolute
/// paths, and symlinks that escape the tree all fail with
/// `StorageError::PathEscapesWorkspace`. Daily-note filenames are already
/// shape-checked by `is_valid_note_filename` before any join reaches
/// here, so in practice this is defense-in-depth on the workspace root
/// itself — but it's the single chokepoint every note write now passes
/// through.
pub(super) fn resolve_workspace_path(workspace: &Path, rel: &Path) -> Result<PathBuf, StorageError> {
    // Canonicalize the root so the containment check compares like with
    // like. `dunce` keeps Windows paths as `C:\…` rather than the `\\?\`
    // verbatim form `std::fs::canonicalize` yields, which `starts_with`
    // wouldn't match against a plain root.
    let canonical_root = dunce::canonicalize(workspace)?;

    // Rebuild the path one component at a time, refusing anything that
    // could climb out lexically before we ever touch the filesystem.
    let mut resolved = canonical_root.clone();
    for comp in rel.components() {
        match comp {
            Component::Normal(c) => resolved.push(c),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(StorageError::PathEscapesWorkspace);
            }
        }
    }

    // Then defeat symlinks: canonicalize the target (or, if it doesn't
    // exist yet, its containing directory) and confirm it's still under
    // the root.
    let anchor = match dunce::canonicalize(&resolved) {
        Ok(p) => p,
        Err(_) => match resolved.parent() {
            Some(parent) => dunce::canonicalize(parent).unwrap_or_else(|_| resolved.clone()),
            None => resolved.clone(),
        },
    };
    if anchor.starts_with(&canonical_root) {
        Ok(resolved)
    } else {
        Err(StorageError::PathEscapesWorkspace)
    }
}

/// Serializes every `atomic_write` in the process. ChronoNote's own code
/// can fire two writes for the same note near-simultaneously (an autosave
/// timer and an Action-Drawer edit, say); on Windows the second one's
/// rename would then hit `ERROR_ACCESS_DENIED` because the target is
/// momentarily open. Writes are sub-millisecond and rare, so one global
/// lock is simpler and safer than per-path locking, and it makes the
/// rename retry below only about *external* interference.
static WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Held across a note's compare-and-swap check and the write or delete that follows, so two
/// guarded operations on notes can't interleave once commands run off the main thread.
/// Separate from `WRITE_LOCK`, which `atomic_write` takes itself (std mutexes aren't reentrant).
/// Lock order: `NOTE_LOCK` first, then `WRITE_LOCK` inside `atomic_write`; never the reverse.
pub(super) static NOTE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(windows)]
fn is_transient_rename_error(e: &std::io::Error) -> bool {
    // ERROR_ACCESS_DENIED (5) / ERROR_SHARING_VIOLATION (32) — the target
    // is briefly locked by an AV scanner, a cloud-sync client, or Explorer.
    matches!(e.raw_os_error(), Some(5) | Some(32))
}
#[cfg(not(windows))]
fn is_transient_rename_error(_e: &std::io::Error) -> bool {
    false
}

/// Crash-atomic, durable file write (§1.2). Streams `contents` into a
/// sibling temp file in the *same* directory (so the commit is a
/// same-filesystem rename), forces it to physical media with `sync_all`,
/// then atomically renames it over `path`. A crash at any point leaves
/// either the complete old file or the complete new one — never the
/// truncated or zero-byte note `fs::write` can produce when it dies
/// mid-stream. `NamedTempFile` unlinks itself on drop, so a failure
/// before the rename leaves nothing behind.
pub(super) fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::Builder::new()
        .prefix(".chrono-")
        .suffix(".tmp")
        .tempfile_in(dir)?;
    tmp.write_all(contents)?;
    tmp.as_file().sync_all()?;

    // The global lock removes contention from *our* writes; a cloud-sync
    // client or an AV scanner can still hold the target open for a few
    // milliseconds. Retry the rename a handful of times before giving up.
    let mut attempt = 0u32;
    loop {
        match tmp.persist(path) {
            Ok(_) => break,
            Err(e) if attempt < 8 && is_transient_rename_error(&e.error) => {
                tmp = e.file; // persist hands the temp file back on failure
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(u64::from(attempt) * 15));
            }
            Err(e) => return Err(e.error),
        }
    }

    // Directory-entry durability: on Unix the rename isn't guaranteed
    // persisted until the containing directory is fsynced too. Opening a
    // directory for `sync_all` is a no-op / unsupported on Windows, where
    // `MoveFileEx` already commits the metadata.
    #[cfg(unix)]
    if let Ok(dir_handle) = fs::File::open(dir) {
        let _ = dir_handle.sync_all();
    }
    Ok(())
}

/// A JSON sidecar (`config.json`, `.chrononote-session.json`) that won't
/// parse is renamed aside as `<name>.corrupt-<unix-ms>` so the app can
/// fall back to a fresh default instead of refusing to boot — while the
/// bad bytes stay on disk for a post-mortem. Best-effort: a failed rename
/// just logs (the caller still falls back). The quarantine name is long
/// and un-dated-looking, so `is_valid_note_filename` never picks it up as
/// a note even when it lands in the notes folder.
pub(super) fn quarantine_corrupt_file(path: &Path) {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut aside = path.as_os_str().to_owned();
    aside.push(format!(".corrupt-{stamp}"));
    if let Err(e) = fs::rename(path, &aside) {
        crate::applog::write("WARN", &format!("could not quarantine corrupt {}: {e}", path.display()));
    } else {
        let old_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let new_name = Path::new(&aside).file_name().and_then(|n| n.to_str()).unwrap_or("");
        crate::applog::write("WARN", &format!("set aside {old_name} as {new_name}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    // --- atomic_write (§1.2) ---

    #[test]
    fn atomic_write_creates_and_reads_back() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("2026-09-07.txt");
        atomic_write(&path, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
    }

    #[test]
    fn atomic_write_replaces_existing_content_in_place() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("2026-09-07.txt");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
    }

    #[test]
    fn atomic_write_leaves_no_temp_files_behind() {
        let dir = tempdir().unwrap();
        atomic_write(&dir.path().join("2026-09-07.txt"), b"x").unwrap();
        let leftovers: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n != "2026-09-07.txt")
            .collect();
        assert!(leftovers.is_empty(), "unexpected files left behind: {leftovers:?}");
    }

    #[test]
    fn rapid_consecutive_writes_land_the_last_value() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("2026-09-07.txt");
        for i in 0..50 {
            atomic_write(&path, format!("rev {i}").as_bytes()).unwrap();
        }
        assert_eq!(fs::read_to_string(&path).unwrap(), "rev 49");
    }

    // --- resolve_workspace_path (§1.1) ---

    #[test]
    fn resolve_workspace_path_allows_a_direct_child() {
        let dir = tempdir().unwrap();
        let resolved = resolve_workspace_path(dir.path(), Path::new("2026-09-07.txt")).unwrap();
        assert!(resolved.starts_with(dunce::canonicalize(dir.path()).unwrap()));
        assert!(resolved.ends_with("2026-09-07.txt"));
    }

    #[test]
    fn resolve_workspace_path_rejects_parent_traversal() {
        let dir = tempdir().unwrap();
        assert!(matches!(
            resolve_workspace_path(dir.path(), Path::new("../outside.txt")),
            Err(StorageError::PathEscapesWorkspace),
        ));
        assert!(matches!(
            resolve_workspace_path(dir.path(), Path::new("sub/../../outside.txt")),
            Err(StorageError::PathEscapesWorkspace),
        ));
    }

    #[test]
    fn resolve_workspace_path_rejects_an_absolute_path() {
        let dir = tempdir().unwrap();
        #[cfg(windows)]
        let abs = Path::new(r"C:\Windows\System32\drivers\etc\hosts");
        #[cfg(unix)]
        let abs = Path::new("/etc/passwd");
        assert!(matches!(
            resolve_workspace_path(dir.path(), abs),
            Err(StorageError::PathEscapesWorkspace),
        ));
    }

    #[test]
    #[cfg(unix)]
    fn resolve_workspace_path_rejects_a_symlink_that_escapes() {
        use std::os::unix::fs::symlink;
        let workspace = tempdir().unwrap();
        let outside = tempdir().unwrap();
        symlink(outside.path(), workspace.path().join("link")).unwrap();
        assert!(matches!(
            resolve_workspace_path(workspace.path(), Path::new("link/x.txt")),
            Err(StorageError::PathEscapesWorkspace),
        ));
    }
}
