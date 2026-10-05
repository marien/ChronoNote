//! Local calendar agenda import — replaces the earlier Microsoft-365-via-
//! OAuth design (see `docs/design/m365-calendar-import-roadmap.md`'s status
//! note), parked after an org's Entra admin consent requirement turned out
//! to be a people problem, not a code one.
//!
//! ChronoNote reads a `.agenda.json` file from the root of the notes
//! folder, kept up to date by whatever external process the user already
//! has for syncing their real calendar (a script, another app, a cron job
//! — anything). ChronoNote never writes this file, only reads it, and
//! assumes whatever is on disk when a sync is requested is already current
//! — there is no polling, no file watcher, no staleness check.
//!
//! Schema: a JSON array of
//! `{ "date": "YYYY-MM-DD", "start": "HH:mm", "end": "HH:mm", "title": "…" }`
//! objects, wall-clock times in the machine's own time zone — or in another zone, by writing the file as an object
//! `{ "timezone": "GMT", "meetings": [ … ] }` (any IANA name: `GMT`, `UTC`, `Europe/London`, …; daylight saving is
//! applied). Dates and times are converted to local time the moment the file is read, so everything built on it (the
//! sync, the date picker, Peek's meeting that is on now) sees local times, already filtered by the external
//! process to meetings with at least one other participant — ChronoNote
//! does no attendee filtering of its own here, just date-scoping, sorting,
//! and de-duplication. The reconciliation engine (§2.4,
//! `src/lib/calendarReconcile.ts`) is unchanged by any of this — it only
//! ever sees the resulting ordered `Vec<String>` of titles for one day.
//!
//! A missing file, blank content, a bare `[]`, or anything that doesn't
//! parse as the expected array is a **hard error**, not an empty calendar
//! — none of those states are ever produced by a genuine, successful sync
//! of a real calendar, so none of them can be trusted as "you have no
//! meetings." (An earlier version of this module treated them leniently,
//! on the theory that an external syncer could be caught mid-write — that
//! was based on a misstated requirement and has been reverted: a day that
//! genuinely has no meetings is signaled by a non-empty array with no
//! entries for that date, not by an empty array.)

use chrono::{Local, NaiveDateTime, TimeZone};
use chrono_tz::Tz;
use serde::Deserialize;

use crate::error::AppError;
use crate::storage;

#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
struct AgendaMeeting {
    date: String,
    start: String,
    end: String,
    title: String,
}

/// Parses the file's raw content into meetings. Errors (rather than
/// falling back to an empty list) for anything that isn't a genuine,
/// non-empty array of well-formed meetings: unparseable JSON, a JSON value
/// that isn't an array, an array whose elements don't all match the
/// expected shape, or a bare `[]` — see the module doc comment for why an
/// empty array specifically doesn't count as "confirmed good data" here.
fn parse_agenda(raw: &str) -> Result<Vec<AgendaMeeting>, ()> {
    parse_agenda_in(raw, &Local)
}

/// The file is either the plain array (times in the machine's zone) or `{ "timezone": "…", "meetings": [...] }`.
#[derive(Deserialize)]
#[serde(untagged)]
enum AgendaFile {
    List(Vec<AgendaMeeting>),
    InZone { timezone: String, meetings: Vec<AgendaMeeting> },
}

/// `parse_agenda` with the machine's zone passed in (a test fixes it). An unknown time zone name is an error like any
/// other unusable file: guessing would put every meeting at the wrong time.
fn parse_agenda_in<L: TimeZone>(raw: &str, local: &L) -> Result<Vec<AgendaMeeting>, ()> {
    let file: AgendaFile = serde_json::from_str(raw.trim()).map_err(|_| ())?;
    let (zone, meetings) = match file {
        AgendaFile::List(meetings) => (None, meetings),
        AgendaFile::InZone { timezone, meetings } => (Some(parse_zone(&timezone)?), meetings),
    };
    if meetings.is_empty() {
        return Err(());
    }
    Ok(match zone {
        Some(zone) => meetings.into_iter().map(|m| to_local(m, zone, local)).collect(),
        None => meetings,
    })
}

/// An IANA zone name (`GMT`, `UTC`, `Europe/London`, `America/New_York`, ...), or `Z`.
fn parse_zone(name: &str) -> Result<Tz, ()> {
    let name = name.trim();
    if name.eq_ignore_ascii_case("z") {
        return Ok(Tz::UTC);
    }
    name.parse::<Tz>().map_err(|_| ())
}

/// One wall-clock time in `zone` on `date` as local `(date, HH:mm)`. `None` when it is not a time (the meeting is then
/// left as it is) or does not exist in the zone (skipped by a clock change: the later reading is taken).
fn local_time<L: TimeZone>(date: &str, time: &str, zone: Tz, local: &L) -> Option<(String, String)> {
    let naive = NaiveDateTime::parse_from_str(&format!("{} {}", date.trim(), time.trim()), "%Y-%m-%d %H:%M").ok()?;
    let at = zone.from_local_datetime(&naive).earliest().or_else(|| zone.from_local_datetime(&(naive + chrono::Duration::hours(1))).earliest())?;
    let l = at.with_timezone(local).naive_local();
    Some((l.format("%Y-%m-%d").to_string(), l.format("%H:%M").to_string()))
}

/// A meeting from `zone` in local time. An end that falls on a later local day than the start becomes `24:00`, so it
/// still reads as "after the start".
fn to_local<L: TimeZone>(m: AgendaMeeting, zone: Tz, local: &L) -> AgendaMeeting {
    let Some((date, start)) = local_time(&m.date, &m.start, zone, local) else { return m };
    let end = match local_time(&m.date, &m.end, zone, local) {
        Some((end_date, end)) if end_date == date => end,
        Some((end_date, _)) if end_date > date => "24:00".to_string(),
        _ => m.end.clone(),
    };
    AgendaMeeting { date, start, end, title: m.title }
}

/// #74 / #78: prefixes an external calendar syncer stamps onto a meeting's own title to say it is
/// not a real, attending occurrence: a cancelled meeting (US "Canceled:" and UK "Cancelled:"), a
/// declined invite, or a forwarded copy of someone else's invite ("Following:", and "Followed:").
/// Such an entry is a *removed* meeting: the prefix is stripped, the rest is its real title, and it
/// never creates or matches a section (see `removed_titles_for_date`, which lets the sync review flag
/// the note's section for it). Case-sensitive, exact prefix at the very start: fixed,
/// syncer-generated text, not something a real title incidentally starts with.
const REMOVED_TITLE_PREFIXES: [&str; 5] = ["Canceled:", "Cancelled:", "Declined:", "Followed:", "Following:"];

/// #78: status words a calendar stamps in front of a meeting's real title, followed by a separator
/// (":", "-" or "--"). "Placeholder - Budget review" and "Confirmed: Budget review" are both the
/// meeting "Budget review". Without a separator the word is part of the title and is kept.
const STATUS_TITLE_WORDS: [&str; 2] = ["Placeholder", "Confirmed"];

fn strip_status_word(title: &str) -> String {
    for word in STATUS_TITLE_WORDS {
        if let Some(rest) = title.strip_prefix(word) {
            let rest = rest.trim_start();
            let rest = rest
                .strip_prefix("--")
                .or_else(|| rest.strip_prefix(':'))
                .or_else(|| rest.strip_prefix('-'));
            if let Some(rest) = rest {
                let rest = rest.trim();
                if !rest.is_empty() {
                    return rest.to_string();
                }
            }
        }
    }
    title.to_string()
}

/// A meeting title read from the agenda: its real title, and whether the calendar marks it as
/// removed (cancelled / declined / forwarded). `None` for a removed marker with no title left.
struct ClassifiedTitle {
    title: String,
    removed: bool,
}

fn classify_title(raw: &str) -> Option<ClassifiedTitle> {
    for prefix in REMOVED_TITLE_PREFIXES {
        if let Some(rest) = raw.strip_prefix(prefix) {
            let title = strip_status_word(rest.trim());
            return if title.is_empty() { None } else { Some(ClassifiedTitle { title, removed: true }) };
        }
    }
    Some(ClassifiedTitle { title: strip_status_word(raw.trim()), removed: false })
}

/// Every rule the file format's own contract calls for, given meetings
/// already known to come from a valid, non-empty agenda file: scoped to
/// `date`, removed (declined/cancelled/forwarded) entries dropped and status words stripped
/// (#74/#78), sorted by start (then end, then title, for total determinism when two meetings
/// start at the same minute), de-duplicated on the exact
/// `(start, end, title)` tuple — a genuine repeated entry, not two distinct
/// meetings that happen to share a title at different times, which are
/// kept as separate entries. A day with no matching entries in an
/// otherwise-valid file legitimately has no meetings — that's a normal,
/// non-error empty result, unlike the whole file being empty/invalid.
fn titles_for_date(meetings: Vec<AgendaMeeting>, date: &str) -> Vec<String> {
    let mut day: Vec<(String, String, String)> = meetings
        .into_iter()
        .filter(|m| m.date == date)
        .filter_map(|m| classify_title(&m.title).filter(|c| !c.removed).map(|c| (m.start, m.end, c.title)))
        .collect();
    day.sort();
    day.dedup();
    day.into_iter().map(|(_, _, title)| title).collect()
}

/// The day's real meetings WITH their times, for Peek's "notes for the meeting that is on now" shortcut:
/// `(start, end, title)`, `HH:mm` local wall-clock times, removed meetings dropped, sorted and de-duplicated exactly
/// like `titles_for_date`.
fn entries_for_date(meetings: Vec<AgendaMeeting>, date: &str) -> Vec<(String, String, String)> {
    let mut day: Vec<(String, String, String)> = meetings
        .into_iter()
        .filter(|m| m.date == date)
        .filter_map(|m| classify_title(&m.title).filter(|c| !c.removed).map(|c| (m.start, m.end, c.title)))
        .collect();
    day.sort();
    day.dedup();
    day
}

/// #78: the real titles of the day's *removed* meetings (cancelled, declined, forwarded), sorted and
/// de-duplicated. The sync review treats a section with one of these titles as a meeting that is gone.
fn removed_titles_for_date(meetings: Vec<AgendaMeeting>, date: &str) -> Vec<String> {
    let mut removed: Vec<String> = meetings
        .into_iter()
        .filter(|m| m.date == date)
        .filter_map(|m| classify_title(&m.title).filter(|c| c.removed).map(|c| c.title))
        .collect();
    removed.sort();
    removed.dedup();
    removed
}

#[tauri::command]
pub fn read_agenda_for_date(app: tauri::AppHandle, date: String) -> Result<Vec<String>, AppError> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    // A missing file reads as an empty string here, which `parse_agenda`
    // then rejects the same way it rejects any other blank/invalid
    // content — one error path for every "no confirmed-good data" case.
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = parse_agenda(&raw).map_err(|_| AppError::AgendaInvalid)?;
    Ok(titles_for_date(meetings, &date))
}

#[tauri::command]
pub fn read_agenda_entries_for_date(
    app: tauri::AppHandle,
    date: String,
) -> Result<Vec<(String, String, String)>, AppError> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = parse_agenda(&raw).map_err(|_| AppError::AgendaInvalid)?;
    Ok(entries_for_date(meetings, &date))
}

#[tauri::command]
pub fn read_agenda_removed_for_date(app: tauri::AppHandle, date: String) -> Result<Vec<String>, AppError> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = parse_agenda(&raw).map_err(|_| AppError::AgendaInvalid)?;
    Ok(removed_titles_for_date(meetings, &date))
}

/// #66: every `(date, title)` pair for a date strictly after `after_date`,
/// sorted and de-duplicated the same way `titles_for_date` is (just scoped
/// to a range instead of one day) — title *matching* against a section
/// header (`normalizeHeaderTitle`/`titleForMatching`) stays a frontend
/// concern, same division of labor as the reconciliation engine
/// (`calendarReconcile.ts`) and Section History already use, so this
/// just filters by date and hands back raw titles for the caller to match.
fn titles_after_date(meetings: Vec<AgendaMeeting>, after_date: &str) -> Vec<(String, String)> {
    let mut future: Vec<(String, String, String, String)> = meetings
        .into_iter()
        .filter(|m| m.date.as_str() > after_date)
        .filter_map(|m| classify_title(&m.title).filter(|c| !c.removed).map(|c| (m.date, m.start, m.end, c.title)))
        .collect();
    future.sort();
    future.dedup();
    future.into_iter().map(|(date, _, _, title)| (date, title)).collect()
}

#[tauri::command]
pub fn read_agenda_after(app: tauri::AppHandle, after_date: String) -> Result<Vec<(String, String)>, AppError> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = parse_agenda(&raw).map_err(|_| AppError::AgendaInvalid)?;
    Ok(titles_after_date(meetings, &after_date))
}

fn active_agenda_dates(meetings: Vec<AgendaMeeting>) -> Vec<String> {
    let mut dates: Vec<String> = meetings
        .into_iter()
        .filter_map(|m| classify_title(&m.title).filter(|c| !c.removed).map(|_| m.date))
        .collect();
    dates.sort();
    dates.dedup();
    dates
}

/// Reads all distinct dates having at least one active (non-cancelled / non-declined)
/// meeting in `.agenda.json`. Used by the date picker to display placeholder boxes
/// for upcoming agenda days. If `.agenda.json` does not exist or has no meetings,
/// returns an empty list without error.
#[tauri::command]
pub fn read_agenda_dates(app: tauri::AppHandle) -> Result<Vec<String>, AppError> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = match parse_agenda(&raw) {
        Ok(m) => m,
        Err(_) => return Ok(Vec::new()),
    };
    Ok(active_agenda_dates(meetings))
}

/// A cheap existence check the frontend uses to gray out the "Sync
/// calendar for this day" button before the user ever clicks it —
/// deliberately just `Path::exists`, not the fuller `parse_agenda`
/// validation `read_agenda_for_date` does: the button greys out for a
/// *missing* file specifically, while an existing-but-invalid one still
/// surfaces its own real error message on click rather than a silent gray
/// button (which would look identical to "file not found" and hide a
/// genuine problem the user should see).
#[tauri::command]
pub fn agenda_file_exists(app: tauri::AppHandle) -> Result<bool, String> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    Ok(path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(raw: &str, date: &str) -> Result<Vec<String>, ()> {
        parse_agenda(raw).map(|meetings| titles_for_date(meetings, date))
    }

    #[test]
    fn entries_carry_their_times_and_skip_removed_meetings() {
        let json = r#"[
            {"date":"2026-09-14","start":"11:00","end":"11:30","title":"Design Review"},
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-14","start":"10:00","end":"10:30","title":"Cancelled: Planning"},
            {"date":"2026-09-15","start":"09:00","end":"09:30","title":"Tomorrow"}
        ]"#;
        let entries = parse_agenda(json).map(|m| entries_for_date(m, "2026-09-14")).unwrap();
        assert_eq!(
            entries,
            vec![
                ("09:00".to_string(), "09:30".to_string(), "Standup".to_string()),
                ("11:00".to_string(), "11:30".to_string(), "Design Review".to_string()),
            ]
        );
    }

    #[test]
    fn scopes_to_the_requested_date_only() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-15","start":"09:00","end":"09:30","title":"Tomorrow's meeting"}
        ]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["Standup".to_string()]));
    }

    #[test]
    fn sorts_by_start_time() {
        let json = r#"[
            {"date":"2026-09-14","start":"11:00","end":"11:30","title":"Design Review"},
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"}
        ]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["Standup".to_string(), "Design Review".to_string()]));
    }

    #[test]
    fn drops_an_exact_duplicate_entry() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"}
        ]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["Standup".to_string()]));
    }

    #[test]
    fn keeps_the_same_title_at_two_different_times_as_separate_meetings() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"1:1"},
            {"date":"2026-09-14","start":"14:00","end":"14:30","title":"1:1"}
        ]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["1:1".to_string(), "1:1".to_string()]));
    }

    #[test]
    fn excludes_declined_cancelled_and_following_titles_74() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-14","start":"10:00","end":"10:30","title":"Declined: 1:1"},
            {"date":"2026-09-14","start":"11:00","end":"11:30","title":"Cancelled: All Hands"},
            {"date":"2026-09-14","start":"12:00","end":"12:30","title":"Following: Design Review"}
        ]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["Standup".to_string()]));
    }

    #[test]
    fn only_matches_the_excluded_prefixes_at_the_start_of_the_title() {
        // A real meeting that merely mentions one of these words mid-title
        // is not excluded — only an external syncer's own leading prefix is.
        let json = r#"[{"date":"2026-09-14","start":"09:00","end":"09:30","title":"Re: Declined: 1:1"}]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["Re: Declined: 1:1".to_string()]));
    }

    #[test]
    fn a_valid_file_with_no_entries_for_the_requested_date_is_an_empty_calendar_not_an_error() {
        let json = r#"[{"date":"2099-01-01","start":"09:00","end":"09:30","title":"Someday"}]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec![]));
    }

    #[test]
    fn a_bare_empty_array_is_an_error_not_an_empty_calendar() {
        assert_eq!(read("[]", "2026-09-14"), Err(()));
    }

    #[test]
    fn a_blank_file_is_an_error() {
        assert_eq!(read("", "2026-09-14"), Err(()));
        assert_eq!(read("   \n", "2026-09-14"), Err(()));
    }

    #[test]
    fn malformed_json_is_an_error() {
        assert_eq!(read("not json", "2026-09-14"), Err(()));
        assert_eq!(read("{", "2026-09-14"), Err(()));
    }

    #[test]
    fn a_missing_field_on_any_entry_is_an_error_for_the_whole_file() {
        // serde's default (non-lenient) `Vec<AgendaMeeting>` deserialization
        // fails the whole array if even one element doesn't match the
        // struct shape — documented here as current behavior rather than
        // silently relying on it.
        let json = r#"[{"date":"2026-09-14","start":"09:00","title":"Missing end"}]"#;
        assert_eq!(read(json, "2026-09-14"), Err(()));
    }

    #[test]
    fn a_missing_agenda_file_is_an_error() {
        // `read_agenda_for_date` turns a missing file into `""` before
        // calling `parse_agenda` — covered at that boundary instead of
        // here, since `parse_agenda` itself has no notion of "missing".
        assert_eq!(parse_agenda(""), Err(()));
    }

    fn read_after(raw: &str, after_date: &str) -> Result<Vec<(String, String)>, ()> {
        parse_agenda(raw).map(|meetings| titles_after_date(meetings, after_date))
    }

    #[test]
    fn read_agenda_after_excludes_the_boundary_date_itself() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-15","start":"09:00","end":"09:30","title":"Standup"}
        ]"#;
        assert_eq!(
            read_after(json, "2026-09-14"),
            Ok(vec![("2026-09-15".to_string(), "Standup".to_string())])
        );
    }

    #[test]
    fn read_agenda_after_sorts_by_date_first_then_start_time() {
        let json = r#"[
            {"date":"2026-09-20","start":"09:00","end":"09:30","title":"Later"},
            {"date":"2026-09-16","start":"11:00","end":"11:30","title":"Design Review"},
            {"date":"2026-09-16","start":"09:00","end":"09:30","title":"Standup"}
        ]"#;
        assert_eq!(
            read_after(json, "2026-09-15"),
            Ok(vec![
                ("2026-09-16".to_string(), "Standup".to_string()),
                ("2026-09-16".to_string(), "Design Review".to_string()),
                ("2026-09-20".to_string(), "Later".to_string()),
            ])
        );
    }

    #[test]
    fn read_agenda_after_drops_an_exact_duplicate_entry() {
        let json = r#"[
            {"date":"2026-09-16","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-16","start":"09:00","end":"09:30","title":"Standup"}
        ]"#;
        assert_eq!(
            read_after(json, "2026-09-15"),
            Ok(vec![("2026-09-16".to_string(), "Standup".to_string())])
        );
    }

    #[test]
    fn read_agenda_after_excludes_declined_cancelled_and_following_titles_74() {
        let json = r#"[
            {"date":"2026-09-16","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-16","start":"10:00","end":"10:30","title":"Declined: 1:1"}
        ]"#;
        assert_eq!(
            read_after(json, "2026-09-15"),
            Ok(vec![("2026-09-16".to_string(), "Standup".to_string())])
        );
    }

    fn removed(raw: &str, date: &str) -> Result<Vec<String>, ()> {
        parse_agenda(raw).map(|meetings| removed_titles_for_date(meetings, date))
    }

    #[test]
    fn canceled_followed_and_declined_prefixes_are_removed_meetings_with_the_rest_as_their_title_78() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Standup"},
            {"date":"2026-09-14","start":"10:00","end":"10:30","title":"Canceled: 1:1 with Sam"},
            {"date":"2026-09-14","start":"11:00","end":"11:30","title":"Cancelled: All Hands"},
            {"date":"2026-09-14","start":"12:00","end":"12:30","title":"Followed: Design Review"},
            {"date":"2026-09-14","start":"13:00","end":"13:30","title":"Declined: Budget"}
        ]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["Standup".to_string()]));
        assert_eq!(
            removed(json, "2026-09-14"),
            Ok(vec![
                "1:1 with Sam".to_string(),
                "All Hands".to_string(),
                "Budget".to_string(),
                "Design Review".to_string()
            ])
        );
    }

    #[test]
    fn placeholder_and_confirmed_are_stripped_after_a_separator_78() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Placeholder: Budget review"},
            {"date":"2026-09-14","start":"10:00","end":"10:30","title":"Confirmed - Design sync"},
            {"date":"2026-09-14","start":"11:00","end":"11:30","title":"Placeholder -- Offsite"},
            {"date":"2026-09-14","start":"12:00","end":"12:30","title":"Confirmed attendees review"},
            {"date":"2026-09-14","start":"13:00","end":"13:30","title":"Placeholder"},
            {"date":"2026-09-14","start":"14:00","end":"14:30","title":"Confirmed:"}
        ]"#;
        assert_eq!(
            read(json, "2026-09-14"),
            Ok(vec![
                "Budget review".to_string(),
                "Design sync".to_string(),
                "Offsite".to_string(),
                "Confirmed attendees review".to_string(),
                "Placeholder".to_string(),
                "Confirmed:".to_string(),
            ])
        );
    }

    #[test]
    fn a_removed_meeting_can_also_carry_a_status_word_78() {
        let json = r#"[{"date":"2026-09-14","start":"09:00","end":"09:30","title":"Canceled: Placeholder - Offsite"}]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec![]));
        assert_eq!(removed(json, "2026-09-14"), Ok(vec!["Offsite".to_string()]));
    }

    #[test]
    fn a_placeholder_and_a_plain_entry_with_the_same_title_and_time_are_one_meeting_78() {
        let json = r#"[
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Placeholder: Budget"},
            {"date":"2026-09-14","start":"09:00","end":"09:30","title":"Budget"}
        ]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec!["Budget".to_string()]));
    }

    #[test]
    fn a_removed_marker_with_no_title_left_is_ignored_78() {
        let json = r#"[{"date":"2026-09-14","start":"09:00","end":"09:30","title":"Declined:   "}]"#;
        assert_eq!(read(json, "2026-09-14"), Ok(vec![]));
        assert_eq!(removed(json, "2026-09-14"), Ok(vec![]));
    }

    #[test]
    fn read_agenda_after_strips_status_words_and_skips_removed_meetings_78() {
        let json = r#"[
            {"date":"2026-09-16","start":"09:00","end":"09:30","title":"Confirmed: Standup"},
            {"date":"2026-09-16","start":"10:00","end":"10:30","title":"Canceled: 1:1"}
        ]"#;
        assert_eq!(
            read_after(json, "2026-09-15"),
            Ok(vec![("2026-09-16".to_string(), "Standup".to_string())])
        );
    }

    #[test]
    fn read_agenda_after_with_nothing_in_range_is_an_empty_result_not_an_error() {
        let json = r#"[{"date":"2026-09-01","start":"09:00","end":"09:30","title":"Old"}]"#;
        assert_eq!(read_after(json, "2026-09-15"), Ok(vec![]));
    }

    #[test]
    fn active_agenda_dates_returns_sorted_deduplicated_dates_excluding_removed_meetings() {
        let json = r#"[
            {"date":"2026-10-14","start":"09:00","end":"09:30","title":"Confirmed: Standup"},
            {"date":"2026-10-14","start":"11:00","end":"11:30","title":"1:1 with Alice"},
            {"date":"2026-10-21","start":"10:00","end":"10:30","title":"Canceled: Team Retrospective"},
            {"date":"2026-10-07","start":"14:00","end":"15:00","title":"Planning"}
        ]"#;
        let meetings = parse_agenda(json).unwrap();
        let dates = active_agenda_dates(meetings);
        // 2026-10-21 is only a canceled meeting, so it must not be included.
        // 2026-10-14 has 2 meetings on the same day, so it must only appear once.
        assert_eq!(dates, vec!["2026-10-07".to_string(), "2026-10-14".to_string()]);
    }

    // --- time zone of the file ---
    use chrono_tz::Europe::Amsterdam;

    fn in_amsterdam(raw: &str) -> Vec<(String, String, String, String)> {
        parse_agenda_in(raw, &Amsterdam)
            .unwrap()
            .into_iter()
            .map(|m| (m.date, m.start, m.end, m.title))
            .collect()
    }
    fn row(d: &str, s: &str, e: &str, t: &str) -> (String, String, String, String) {
        (d.to_string(), s.to_string(), e.to_string(), t.to_string())
    }

    #[test]
    fn a_plain_array_is_left_in_local_time() {
        let raw = r#"[{"date":"2026-10-05","start":"09:00","end":"09:30","title":"A"}]"#;
        assert_eq!(in_amsterdam(raw), vec![row("2026-10-05", "09:00", "09:30", "A")]);
    }

    #[test]
    fn gmt_times_are_converted_with_daylight_saving() {
        // 5 Oct 2026 is summer time in Amsterdam (GMT+2): 09:00 GMT is 11:00 local.
        let raw = r#"{"timezone":"GMT","meetings":[{"date":"2026-10-05","start":"09:00","end":"09:30","title":"A"}]}"#;
        assert_eq!(in_amsterdam(raw), vec![row("2026-10-05", "11:00", "11:30", "A")]);
        // 5 Dec 2026 is winter time (GMT+1).
        let raw = r#"{"timezone":"UTC","meetings":[{"date":"2026-12-05","start":"09:00","end":"09:30","title":"A"}]}"#;
        assert_eq!(in_amsterdam(raw), vec![row("2026-12-05", "10:00", "10:30", "A")]);
    }

    #[test]
    fn the_date_follows_the_conversion() {
        // 23:30 GMT in summer is 01:30 the next day locally; its end is past midnight too.
        let raw = r#"{"timezone":"GMT","meetings":[{"date":"2026-10-05","start":"23:30","end":"23:59","title":"Late"}]}"#;
        assert_eq!(in_amsterdam(raw), vec![row("2026-10-06", "01:30", "01:59", "Late")]);
        // A meeting that crosses local midnight ends at 24:00.
        let raw = r#"{"timezone":"GMT","meetings":[{"date":"2026-10-05","start":"21:30","end":"22:30","title":"X"}]}"#;
        assert_eq!(in_amsterdam(raw), vec![row("2026-10-05", "23:30", "24:00", "X")]);
    }

    #[test]
    fn another_zone_and_a_z_are_understood() {
        let raw = r#"{"timezone":"America/New_York","meetings":[{"date":"2026-10-05","start":"09:00","end":"10:00","title":"A"}]}"#;
        assert_eq!(in_amsterdam(raw), vec![row("2026-10-05", "15:00", "16:00", "A")]);
        let raw = r#"{"timezone":"Z","meetings":[{"date":"2026-10-05","start":"9:00","end":"9:30","title":"A"}]}"#;
        assert_eq!(in_amsterdam(raw), vec![row("2026-10-05", "11:00", "11:30", "A")]);
    }

    #[test]
    fn an_unknown_zone_or_an_empty_object_file_is_an_error() {
        let raw = r#"{"timezone":"Mars/Olympus","meetings":[{"date":"2026-10-05","start":"09:00","end":"09:30","title":"A"}]}"#;
        assert_eq!(parse_agenda_in(raw, &Amsterdam), Err(()));
        let raw = r#"{"timezone":"GMT","meetings":[]}"#;
        assert_eq!(parse_agenda_in(raw, &Amsterdam), Err(()));
    }

    #[test]
    fn everything_built_on_the_file_sees_the_converted_day() {
        let raw = r#"{"timezone":"GMT","meetings":[
            {"date":"2026-10-05","start":"09:00","end":"10:00","title":"Design review"},
            {"date":"2026-10-05","start":"23:30","end":"23:59","title":"Late"}]}"#;
        let meetings = parse_agenda_in(raw, &Amsterdam).unwrap();
        assert_eq!(titles_for_date(meetings.clone(), "2026-10-05"), vec!["Design review".to_string()]);
        assert_eq!(titles_for_date(meetings, "2026-10-06"), vec!["Late".to_string()]);
    }
}
