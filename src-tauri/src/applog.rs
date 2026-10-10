use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();
static WRITE_LOCK: Mutex<()> = Mutex::new(());

const MAX_LOG_SIZE: u64 = 1024 * 1024; // 1 MB

/// Initializes the log directory once per process. Creates the directory if missing.
pub fn init(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    let _ = LOG_DIR.set(dir);
}

/// Sanitizes a log message: newlines become ` | `, and the string is cut to 2000 chars.
pub fn sanitize_message(msg: &str) -> String {
    let flat = msg.replace("\r\n", " | ").replace('\n', " | ").replace('\r', " | ");
    flat.chars().take(2000).collect()
}

/// Appends a log line to `app.log` in the given directory, rotating if exceeding `max_bytes`.
pub fn write_at(dir: &Path, level: &str, msg: &str, max_bytes: u64) {
    let _lock = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let log_file = dir.join("app.log");
    let log_1 = dir.join("app.log.1");
    let log_2 = dir.join("app.log.2");

    if let Ok(meta) = fs::metadata(&log_file) {
        if meta.len() > max_bytes {
            let _ = fs::remove_file(&log_2);
            let _ = fs::rename(&log_1, &log_2);
            let _ = fs::remove_file(&log_1);
            let _ = fs::rename(&log_file, &log_1);
        }
    }

    let sanitized = sanitize_message(msg);
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC");
    let line = format!("{now}  {level}  {sanitized}\n");

    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_file) {
        let _ = f.write_all(line.as_bytes());
    }
}

/// Appends a log line to `app.log`. No-op before `init`.
pub fn write(level: &str, msg: &str) {
    let Some(dir) = LOG_DIR.get() else { return };
    write_at(dir, level, msg, MAX_LOG_SIZE);
}

/// Returns the last `lines` across `app.log.1` and `app.log` (oldest first).
pub fn tail_at(dir: &Path, lines: usize) -> String {
    if lines == 0 {
        return String::new();
    }
    let mut all_lines = Vec::new();

    let log_1 = dir.join("app.log.1");
    if let Ok(f) = fs::File::open(&log_1) {
        let reader = BufReader::new(f);
        for line in reader.lines().flatten() {
            all_lines.push(line);
        }
    }

    let log_file = dir.join("app.log");
    if let Ok(f) = fs::File::open(&log_file) {
        let reader = BufReader::new(f);
        for line in reader.lines().flatten() {
            all_lines.push(line);
        }
    }

    let start = all_lines.len().saturating_sub(lines);
    all_lines[start..].join("\n")
}

/// Returns the last `lines` across `app.log.1` and `app.log` (oldest first).
pub fn tail(lines: usize) -> String {
    let Some(dir) = LOG_DIR.get() else { return String::new() };
    tail_at(dir, lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rotation_at_size_limit() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        // Write first message that exceeds 40 bytes
        write_at(dir, "INFO", "first long message that exceeds forty bytes", 40);
        assert!(dir.join("app.log").exists());
        assert!(!dir.join("app.log.1").exists());

        // Second write triggers rotation because app.log is larger than 40 bytes
        write_at(dir, "INFO", "second message", 40);
        assert!(dir.join("app.log").exists());
        assert!(dir.join("app.log.1").exists());

        let content_1 = fs::read_to_string(dir.join("app.log.1")).unwrap();
        assert!(content_1.contains("first long message"));
        let content_current = fs::read_to_string(dir.join("app.log")).unwrap();
        assert!(content_current.contains("second message"));
    }

    #[test]
    fn test_at_most_three_files() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        // Perform 6 writes with a very small max_bytes so each rotates
        for i in 1..=6 {
            write_at(dir, "INFO", &format!("message number {i} to trigger rotation"), 20);
        }

        assert!(dir.join("app.log").exists());
        assert!(dir.join("app.log.1").exists());
        assert!(dir.join("app.log.2").exists());
        assert!(!dir.join("app.log.3").exists());

        // Count all files in directory: should only be app.log, app.log.1, app.log.2
        let file_count = fs::read_dir(dir).unwrap().count();
        assert_eq!(file_count, 3);
    }

    #[test]
    fn test_tail_across_two_files() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        write_at(dir, "INFO", "msg1", 30);
        write_at(dir, "INFO", "msg2", 30);
        // At this point msg1 is in app.log.1, msg2 is in app.log
        write_at(dir, "INFO", "msg3", 1000); // no rotation, msg3 appended to app.log

        let tail_all = tail_at(dir, 10);
        let lines: Vec<&str> = tail_all.lines().collect();
        assert_eq!(lines.len(), 3);
        assert!(lines[0].contains("msg1"));
        assert!(lines[1].contains("msg2"));
        assert!(lines[2].contains("msg3"));

        let tail_last_two = tail_at(dir, 2);
        let lines_two: Vec<&str> = tail_last_two.lines().collect();
        assert_eq!(lines_two.len(), 2);
        assert!(lines_two[0].contains("msg2"));
        assert!(lines_two[1].contains("msg3"));
    }

    #[test]
    fn test_newline_flattening() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        write_at(dir, "WARN", "multi\nline\r\nmessage\rhere", 1000);
        let content = fs::read_to_string(dir.join("app.log")).unwrap();
        assert_eq!(content.lines().count(), 1);
        assert!(content.contains("multi | line | message | here"));
    }
}
