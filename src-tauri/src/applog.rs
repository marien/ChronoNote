use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();
static WRITE_LOCK: Mutex<()> = Mutex::new(());

const MAX_LOG_SIZE: u64 = 1024 * 1024; // 1 MB

/// The flight recorder (§404): detailed lines (every window move while Peek is docked, each step of entering and
/// leaving Peek) are kept in memory only, the last `FLIGHT_CAP`, and written to the log only when something looks wrong
/// or the user copies diagnostics. Events (dock, float, leave, a screen change) go to the log at once with `write`.
static FLIGHT: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
const FLIGHT_CAP: usize = 400;

fn timestamp() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f UTC").to_string()
}

/// Keeps a detail line in the flight recorder (memory only).
pub fn detail(msg: &str) {
    let line = format!("{}  {}", timestamp(), sanitize_message(msg));
    if let Ok(mut f) = FLIGHT.lock() {
        if f.len() >= FLIGHT_CAP {
            f.pop_front();
        }
        f.push_back(line);
    }
}

/// Writes the flight recorder to the log (oldest first, level TRACE) and empties it. Each kept line still carries the
/// time it was recorded.
pub fn dump(reason: &str) {
    let lines: Vec<String> = FLIGHT.lock().map(|mut f| f.drain(..).collect()).unwrap_or_default();
    if lines.is_empty() {
        return;
    }
    let Some(dir) = LOG_DIR.get() else { return };
    let mut all = vec![format!("flight recorder ({reason}): {} line(s) follow", lines.len())];
    all.extend(lines.into_iter().map(|l| format!("  {l}")));
    // One rotation check and one file open for the whole dump (§404).
    write_many_at(dir, "TRACE", &all, MAX_LOG_SIZE);
}

/// Appends several lines at once (one rotation check, one open).
pub fn write_many_at(dir: &Path, level: &str, msgs: &[String], max_bytes: u64) {
    let _lock = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    rotate_if_needed(dir, max_bytes);
    let ts = timestamp();
    let text: String = msgs.iter().map(|m| format!("{ts}  {level}  {}\n", sanitize_message(m))).collect();
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(dir.join("app.log")) {
        let _ = f.write_all(text.as_bytes());
    }
}

fn rotate_if_needed(dir: &Path, max_bytes: u64) {
    let log_file = dir.join("app.log");
    if let Ok(meta) = fs::metadata(&log_file) {
        if meta.len() > max_bytes {
            let log_1 = dir.join("app.log.1");
            let log_2 = dir.join("app.log.2");
            let _ = fs::remove_file(&log_2);
            let _ = fs::rename(&log_1, &log_2);
            let _ = fs::remove_file(&log_1);
            let _ = fs::rename(&log_file, &log_1);
        }
    }
}

/// Whether the run before this one wrote an exit line after its start line. Called at start-up, before the new start
/// line. `None` when the log has no start line to judge by.
pub fn previous_run_exited(tail: &str) -> Option<bool> {
    let last = tail
        .lines()
        .rev()
        .find(|l| l.contains("  start ChronoNote ") || l.contains("  exit: "))?;
    Some(last.contains("  exit: "))
}

/// Initializes the log directory once per process. Creates the directory if missing.
pub fn init(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    let _ = LOG_DIR.set(dir);
}

/// Sanitizes a log message: newlines become ` | `, and the string is cut to 2000 chars.
pub fn sanitize_message(msg: &str) -> String {
    let flat = msg.replace("\r\n", " | ").replace(['\n', '\r'], " | ");
    flat.chars().take(2000).collect()
}

/// Appends a log line to `app.log` in the given directory, rotating if exceeding `max_bytes`.
pub fn write_at(dir: &Path, level: &str, msg: &str, max_bytes: u64) {
    let _lock = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    rotate_if_needed(dir, max_bytes);
    let log_file = dir.join("app.log");

    let sanitized = sanitize_message(msg);
    // Milliseconds: the window steps of a docking change happen within a few ms of each other (§404).
    let line = format!("{}  {level}  {sanitized}\n", timestamp());

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

    for name in ["app.log.1", "app.log"] {
        if let Ok(f) = fs::File::open(dir.join(name)) {
            // Raw lines, decoded leniently: a line with invalid UTF-8 still shows; a read error ends the file.
            for line in BufReader::new(f).split(b'\n').map_while(Result::ok) {
                all_lines.push(String::from_utf8_lossy(&line).trim_end_matches('\r').to_string());
            }
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
    fn test_tail_keeps_lines_after_invalid_utf8_and_strips_crlf() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("app.log"), b"first\r\nbad \xff byte\nlast\n").unwrap();
        let lines: Vec<String> = tail_at(dir, 10).lines().map(String::from).collect();
        assert_eq!(lines, vec!["first".to_string(), "bad \u{fffd} byte".to_string(), "last".to_string()]);
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

    #[test]
    fn lines_carry_milliseconds() {
        let tmp = tempfile::tempdir().unwrap();
        write_at(tmp.path(), "INFO", "x", 1000);
        let content = fs::read_to_string(tmp.path().join("app.log")).unwrap();
        // 2026-10-21 07:01:02.345 UTC  INFO  x
        let ts = content.split("  ").next().unwrap();
        assert!(ts.ends_with(" UTC") && ts.contains('.'), "{ts}");
        assert_eq!(ts.split('.').nth(1).unwrap().len(), "345 UTC".len());
    }

    #[test]
    fn previous_run_exit_is_judged_from_the_last_start_or_exit_line() {
        let start = "2026-10-21 07:00:00.000 UTC  INFO  start ChronoNote 0.32.5-3 (windows x86_64)";
        let exit = "2026-10-21 08:00:00.000 UTC  INFO  exit: window destroyed";
        let other = "2026-10-21 07:30:00.000 UTC  PEEK  dock ...";
        assert_eq!(previous_run_exited(&[start, other, exit].join("\n")), Some(true));
        assert_eq!(previous_run_exited(&[exit, start, other].join("\n")), Some(false));
        assert_eq!(previous_run_exited(other), None);
    }
}
