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
//! objects, all local wall-clock times, already filtered by the external
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

use serde::Deserialize;

use crate::storage;

const AGENDA_ERROR: &str =
    "The calendar file (.agenda.json) is missing, empty, or invalid — check whatever syncs it.";

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
    let meetings: Vec<AgendaMeeting> = serde_json::from_str(raw.trim()).map_err(|_| ())?;
    if meetings.is_empty() {
        return Err(());
    }
    Ok(meetings)
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
pub fn read_agenda_for_date(app: tauri::AppHandle, date: String) -> Result<Vec<String>, String> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    // A missing file reads as an empty string here, which `parse_agenda`
    // then rejects the same way it rejects any other blank/invalid
    // content — one error path for every "no confirmed-good data" case.
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = parse_agenda(&raw).map_err(|_| AGENDA_ERROR.to_string())?;
    Ok(titles_for_date(meetings, &date))
}

#[tauri::command]
pub fn read_agenda_removed_for_date(app: tauri::AppHandle, date: String) -> Result<Vec<String>, String> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = parse_agenda(&raw).map_err(|_| AGENDA_ERROR.to_string())?;
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
pub fn read_agenda_after(app: tauri::AppHandle, after_date: String) -> Result<Vec<(String, String)>, String> {
    let cfg = storage::load_config(&app)?;
    let path = std::path::Path::new(&cfg.notes_dir).join(".agenda.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let meetings = parse_agenda(&raw).map_err(|_| AGENDA_ERROR.to_string())?;
    Ok(titles_after_date(meetings, &after_date))
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
}
