//! Windows spell checking service backed by the Windows Spell Checking API.
//!
//! Provides five Tauri commands for language discovery, multi-language spell
//! checking (intersection by exact range), suggestions, dictionary additions,
//! and session ignores.

#[cfg(windows)]
use std::sync::mpsc;
#[cfg(windows)]
use std::sync::OnceLock;
#[cfg(windows)]
use windows::core::{HSTRING, PWSTR};
#[cfg(windows)]
use windows::System::UserProfile::GlobalizationPreferences;
#[cfg(windows)]
use windows::Win32::Globalization::{
    GetUserPreferredUILanguages, ISpellChecker, ISpellCheckerFactory, ISpellingError,
    CORRECTIVE_ACTION_NONE, MUI_LANGUAGE_NAME, SpellCheckerFactory,
};
#[cfg(windows)]
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_MULTITHREADED,
};

/// Intersects error ranges across multiple languages.
/// Returns only ranges flagged by every language (exact UTF-16 offset match).
pub fn intersect_ranges(lang_ranges: &[Vec<(u32, u32)>]) -> Vec<(u32, u32)> {
    if lang_ranges.is_empty() {
        return Vec::new();
    }
    let mut result = lang_ranges[0].clone();
    for other in &lang_ranges[1..] {
        let set: std::collections::HashSet<(u32, u32)> = other.iter().copied().collect();
        result.retain(|r| set.contains(r));
    }
    let mut seen = std::collections::HashSet::new();
    result.retain(|r| seen.insert(*r));
    result
}

/// Deduplicates suggestions preserving order, keeping up to `limit` entries.
pub fn deduplicate_suggestions(suggestions: Vec<String>, limit: usize) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for s in suggestions {
        if seen.insert(s.clone()) {
            result.push(s);
            if result.len() >= limit {
                break;
            }
        }
    }
    result
}

/// Deduplicates language tags preserving first-seen order (case-insensitive deduplication).
pub fn deduplicate_language_tags(tags: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for tag in tags {
        if seen.insert(tag.to_lowercase()) {
            result.push(tag);
        }
    }
    result
}

// ---------------------------------------------------------------------------
// Windows Implementation
// ---------------------------------------------------------------------------

#[cfg(windows)]
struct ActiveChecker {
    tag: String,
    checker: ISpellChecker,
}

#[cfg(windows)]
type LineRanges = Vec<Vec<(u32, u32)>>;

#[cfg(windows)]
enum SpellRequest {
    Languages {
        reply: mpsc::Sender<Result<Vec<String>, String>>,
    },
    AvailableLanguages {
        reply: mpsc::Sender<Result<Vec<String>, String>>,
    },
    WindowsLanguages {
        reply: mpsc::Sender<Result<Vec<String>, String>>,
    },
    SetLanguages {
        tags: Vec<String>,
        reply: mpsc::Sender<Result<Vec<String>, String>>,
    },
    CheckLines {
        lines: Vec<String>,
        reply: mpsc::Sender<Result<LineRanges, String>>,
    },
    Suggest {
        word: String,
        reply: mpsc::Sender<Result<Vec<String>, String>>,
    },
    Add {
        word: String,
        reply: mpsc::Sender<Result<(), String>>,
    },
    Ignore {
        word: String,
        reply: mpsc::Sender<Result<(), String>>,
    },
}

#[cfg(windows)]
static SPELL_TX: OnceLock<Option<mpsc::Sender<SpellRequest>>> = OnceLock::new();

#[cfg(windows)]
fn get_sender() -> Option<&'static mpsc::Sender<SpellRequest>> {
    SPELL_TX
        .get_or_init(|| {
            let (tx, rx) = mpsc::channel::<SpellRequest>();
            let spawn_res = std::thread::Builder::new()
                .name("spell-checker".into())
                .spawn(move || {
                    run_spell_thread(rx);
                });
            match spawn_res {
                Ok(_) => Some(tx),
                Err(e) => {
                    crate::applog::write("ERROR", &format!("failed to spawn spell checking thread: {e}"));
                    None
                }
            }
        })
        .as_ref()
}

#[cfg(windows)]
fn run_spell_thread(rx: mpsc::Receiver<SpellRequest>) {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            crate::applog::write("ERROR", &format!("CoInitializeEx failed: {hr:?}"));
            while let Ok(req) = rx.recv() {
                match req {
                    SpellRequest::Languages { reply }
                    | SpellRequest::AvailableLanguages { reply }
                    | SpellRequest::WindowsLanguages { reply }
                    | SpellRequest::SetLanguages { reply, .. } => {
                        let _ = reply.send(Ok(Vec::new()));
                    }
                    SpellRequest::CheckLines { lines, reply } => {
                        let _ = reply.send(Ok(lines.into_iter().map(|_| Vec::new()).collect()));
                    }
                    SpellRequest::Suggest { reply, .. } => {
                        let _ = reply.send(Ok(Vec::new()));
                    }
                    SpellRequest::Add { reply, .. } => {
                        let _ = reply.send(Ok(()));
                    }
                    SpellRequest::Ignore { reply, .. } => {
                        let _ = reply.send(Ok(()));
                    }
                }
            }
            return;
        }
    }

    let factory: Option<ISpellCheckerFactory> = match unsafe {
        CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER)
    } {
        Ok(f) => Some(f),
        Err(e) => {
            crate::applog::write("WARN", &format!("CoCreateInstance SpellCheckerFactory failed: {e}"));
            None
        }
    };

    let mut checkers = if let Some(ref f) = factory {
        create_checkers_from_tags(f, &get_user_languages())
    } else {
        Vec::new()
    };

    while let Ok(req) = rx.recv() {
        match req {
            SpellRequest::Languages { reply } => {
                let tags = checkers.iter().map(|c| c.tag.clone()).collect();
                let _ = reply.send(Ok(tags));
            }
            SpellRequest::AvailableLanguages { reply } => {
                let tags = factory.as_ref().map(get_available_languages).unwrap_or_default();
                let _ = reply.send(Ok(tags));
            }
            SpellRequest::WindowsLanguages { reply } => {
                let tags = factory.as_ref().map(get_supported_windows_languages).unwrap_or_default();
                let _ = reply.send(Ok(tags));
            }
            SpellRequest::SetLanguages { tags, reply } => {
                if let Some(ref f) = factory {
                    checkers = create_checkers_from_tags(f, &tags);
                }
                let active_tags = checkers.iter().map(|c| c.tag.clone()).collect();
                let _ = reply.send(Ok(active_tags));
            }
            SpellRequest::CheckLines { lines, reply } => {
                let res = check_lines(&checkers, lines);
                let _ = reply.send(res);
            }
            SpellRequest::Suggest { word, reply } => {
                let res = suggest(&checkers, &word);
                let _ = reply.send(res);
            }
            SpellRequest::Add { word, reply } => {
                let res = add(&checkers, &word);
                let _ = reply.send(res);
            }
            SpellRequest::Ignore { word, reply } => {
                let res = ignore(&checkers, &word);
                let _ = reply.send(res);
            }
        }
    }

    unsafe {
        CoUninitialize();
    }
}

#[cfg(windows)]
fn get_fallback_ui_languages() -> Vec<String> {
    unsafe {
        let mut count: u32 = 0;
        let mut buffer_len: u32 = 0;
        let res = GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            None,
            &mut buffer_len,
        );
        if res.is_err() || buffer_len == 0 {
            return Vec::new();
        }
        let mut buffer: Vec<u16> = vec![0; buffer_len as usize];
        let res = GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            Some(PWSTR(buffer.as_mut_ptr())),
            &mut buffer_len,
        );
        if res.is_err() {
            return Vec::new();
        }
        let mut languages = Vec::new();
        let mut start = 0;
        for i in 0..buffer.len() {
            if buffer[i] == 0 {
                if i > start {
                    let tag = String::from_utf16_lossy(&buffer[start..i]);
                    if !tag.is_empty() {
                        languages.push(tag);
                    }
                }
                start = i + 1;
            }
        }
        languages
    }
}

#[cfg(windows)]
fn get_user_languages() -> Vec<String> {
    if let Ok(languages) = GlobalizationPreferences::Languages() {
        if let Ok(size) = languages.Size() {
            let mut tags = Vec::with_capacity(size as usize);
            for i in 0..size {
                if let Ok(hstring) = languages.GetAt(i) {
                    let s = hstring.to_string();
                    if !s.is_empty() {
                        tags.push(s);
                    }
                }
            }
            if !tags.is_empty() {
                return tags;
            }
        }
    }

    get_fallback_ui_languages()
}

#[cfg(windows)]
fn read_enum_strings(enum_strings: &windows::Win32::System::Com::IEnumString) -> Vec<String> {
    let mut strings = Vec::new();
    let mut pwstr = [PWSTR::null()];
    loop {
        pwstr[0] = PWSTR::null();
        let mut fetched: u32 = 0;
        let hr = unsafe { enum_strings.Next(&mut pwstr, Some(&mut fetched)) };
        if hr.is_err() || hr != windows::core::HRESULT(0) || fetched == 0 {
            break;
        }
        let ptr = pwstr[0];
        if !ptr.is_null() {
            if let Ok(s) = unsafe { ptr.to_string() } {
                strings.push(s);
            }
            unsafe {
                CoTaskMemFree(Some(ptr.as_ptr() as *const std::ffi::c_void));
            }
        }
    }
    strings
}

#[cfg(windows)]
fn get_available_languages(factory: &ISpellCheckerFactory) -> Vec<String> {
    match unsafe { factory.SupportedLanguages() } {
        Ok(enum_strings) => {
            let mut langs = read_enum_strings(&enum_strings);
            langs.sort();
            langs
        }
        Err(e) => {
            crate::applog::write("WARN", &format!("SupportedLanguages failed: {e}"));
            Vec::new()
        }
    }
}

#[cfg(windows)]
fn get_supported_windows_languages(factory: &ISpellCheckerFactory) -> Vec<String> {
    let user_langs = get_user_languages();
    let deduped = deduplicate_language_tags(user_langs);
    let mut supported = Vec::new();
    for tag in deduped {
        let wide_tag = HSTRING::from(tag.as_str());
        match unsafe { factory.IsSupported(&wide_tag) } {
            Ok(is_sup) if is_sup.as_bool() => {
                supported.push(tag);
            }
            _ => {}
        }
    }
    supported
}

#[cfg(windows)]
fn create_checkers_from_tags(factory: &ISpellCheckerFactory, tags: &[String]) -> Vec<ActiveChecker> {
    let deduped = deduplicate_language_tags(tags.to_vec());
    let mut checkers = Vec::new();
    for tag in deduped {
        let wide_tag = HSTRING::from(tag.as_str());
        match unsafe { factory.IsSupported(&wide_tag) } {
            Ok(is_sup) if is_sup.as_bool() => {
                match unsafe { factory.CreateSpellChecker(&wide_tag) } {
                    Ok(checker) => {
                        checkers.push(ActiveChecker { tag, checker });
                    }
                    Err(e) => {
                        crate::applog::write("WARN", &format!("CreateSpellChecker failed for {tag}: {e}"));
                    }
                }
            }
            Ok(_) => {
                // Not supported
            }
            Err(e) => {
                crate::applog::write("WARN", &format!("IsSupported failed for {tag}: {e}"));
            }
        }
    }
    checkers
}

#[cfg(windows)]
fn check_lines(checkers: &[ActiveChecker], lines: Vec<String>) -> Result<Vec<Vec<(u32, u32)>>, String> {
    if checkers.is_empty() {
        return Ok(lines.into_iter().map(|_| Vec::new()).collect());
    }

    let mut result = Vec::with_capacity(lines.len());
    let mut logged = false;
    for line in lines {
        // ISpellChecker::Check rejects an empty string with E_INVALIDARG; one such line used to fail the whole batch,
        // so a note with an empty line on screen showed no marks at all (0.32.0-3, English-only Windows).
        if line.trim().is_empty() {
            result.push(Vec::new());
            continue;
        }
        match check_line(checkers, &line) {
            Ok(ranges) => result.push(ranges),
            Err(e) => {
                // A failing line gets no marks; the rest of the batch is still checked.
                if !logged {
                    crate::applog::write("WARN", &format!("spell check of a line failed: {e}"));
                    logged = true;
                }
                result.push(Vec::new());
            }
        }
    }

    Ok(result)
}

#[cfg(windows)]
fn check_line(checkers: &[ActiveChecker], line: &str) -> Result<Vec<(u32, u32)>, String> {
    let wide_line = HSTRING::from(line);
    let mut per_lang_errors = Vec::with_capacity(checkers.len());

    for active in checkers {
        let enum_errors = unsafe { active.checker.Check(&wide_line) }
            .map_err(|e| format!("Check failed for {}: {e}", active.tag))?;

        let mut lang_errors = Vec::new();
        let mut current: Option<ISpellingError> = None;
        loop {
            let hr = unsafe { enum_errors.Next(&mut current) };
            if hr.is_err() {
                return Err(format!("Next spelling error failed: {hr}"));
            }
            if hr != windows::core::HRESULT(0) {
                break;
            }
            let Some(error) = current.take() else {
                break;
            };
            let action = unsafe { error.CorrectiveAction() }
                .map_err(|e| format!("CorrectiveAction failed: {e}"))?;
            if action == CORRECTIVE_ACTION_NONE {
                continue;
            }
            let start = unsafe { error.StartIndex() }
                .map_err(|e| format!("StartIndex failed: {e}"))?;
            let length = unsafe { error.Length() }
                .map_err(|e| format!("Length failed: {e}"))?;
            lang_errors.push((start, start + length));
        }
        per_lang_errors.push(lang_errors);
    }

    Ok(intersect_ranges(&per_lang_errors))
}

#[cfg(windows)]
fn suggest(checkers: &[ActiveChecker], word: &str) -> Result<Vec<String>, String> {
    if checkers.is_empty() {
        return Ok(Vec::new());
    }

    let mut raw_suggestions = Vec::new();
    let wide_word = HSTRING::from(word);

    for active in checkers {
        let enum_strings = unsafe { active.checker.Suggest(&wide_word) }
            .map_err(|e| format!("Suggest failed for {}: {e}", active.tag))?;

        let mut pwstr = [PWSTR::null()];
        loop {
            pwstr[0] = PWSTR::null();
            let mut fetched: u32 = 0;
            let hr = unsafe { enum_strings.Next(&mut pwstr, Some(&mut fetched)) };
            if hr.is_err() {
                return Err(format!("Next suggestion failed: {hr}"));
            }
            if hr != windows::core::HRESULT(0) || fetched == 0 {
                break;
            }
            let ptr = pwstr[0];
            if !ptr.is_null() {
                if let Ok(s) = unsafe { ptr.to_string() } {
                    raw_suggestions.push(s);
                }
                unsafe {
                    CoTaskMemFree(Some(ptr.as_ptr() as *const std::ffi::c_void));
                }
            }
        }
    }

    Ok(deduplicate_suggestions(raw_suggestions, 8))
}

#[cfg(windows)]
fn add(checkers: &[ActiveChecker], word: &str) -> Result<(), String> {
    let wide_word = HSTRING::from(word);
    for active in checkers {
        unsafe {
            active
                .checker
                .Add(&wide_word)
                .map_err(|e| format!("Add failed for {}: {e}", active.tag))?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn ignore(checkers: &[ActiveChecker], word: &str) -> Result<(), String> {
    let wide_word = HSTRING::from(word);
    for active in checkers {
        unsafe {
            active
                .checker
                .Ignore(&wide_word)
                .map_err(|e| format!("Ignore failed for {}: {e}", active.tag))?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands (Windows)
// ---------------------------------------------------------------------------

#[cfg(windows)]
#[tauri::command]
pub async fn spell_languages() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(Vec::new());
        };
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::Languages { reply }).is_err() {
            return Ok(Vec::new());
        }
        rx.recv().unwrap_or_else(|_| Ok(Vec::new()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn spell_available_languages() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(Vec::new());
        };
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::AvailableLanguages { reply }).is_err() {
            return Ok(Vec::new());
        }
        rx.recv().unwrap_or_else(|_| Ok(Vec::new()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn spell_windows_languages() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(Vec::new());
        };
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::WindowsLanguages { reply }).is_err() {
            return Ok(Vec::new());
        }
        rx.recv().unwrap_or_else(|_| Ok(Vec::new()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn spell_set_languages(tags: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(Vec::new());
        };
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::SetLanguages { tags, reply }).is_err() {
            return Ok(Vec::new());
        }
        rx.recv().unwrap_or_else(|_| Ok(Vec::new()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn spell_check_lines(lines: Vec<String>) -> Result<Vec<Vec<(u32, u32)>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(lines.into_iter().map(|_| Vec::new()).collect());
        };
        let fallback_len = lines.len();
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::CheckLines { lines, reply }).is_err() {
            return Ok((0..fallback_len).map(|_| Vec::new()).collect());
        }
        rx.recv().unwrap_or_else(|_| Ok((0..fallback_len).map(|_| Vec::new()).collect()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn spell_suggest(word: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(Vec::new());
        };
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::Suggest { word, reply }).is_err() {
            return Ok(Vec::new());
        }
        rx.recv().unwrap_or_else(|_| Ok(Vec::new()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn spell_add(word: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(());
        };
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::Add { word, reply }).is_err() {
            return Ok(());
        }
        rx.recv().unwrap_or(Ok(()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub async fn spell_ignore(word: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(sender) = get_sender() else {
            return Ok(());
        };
        let (reply, rx) = mpsc::channel();
        if sender.send(SpellRequest::Ignore { word, reply }).is_err() {
            return Ok(());
        }
        rx.recv().unwrap_or(Ok(()))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Non-Windows Stubs
// ---------------------------------------------------------------------------

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_languages() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_available_languages() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_windows_languages() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_set_languages(_tags: Vec<String>) -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_check_lines(lines: Vec<String>) -> Result<Vec<Vec<(u32, u32)>>, String> {
    Ok(lines.into_iter().map(|_| Vec::new()).collect())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_suggest(_word: String) -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_add(_word: String) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn spell_ignore(_word: String) -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_intersect_ranges_empty() {
        let empty: Vec<Vec<(u32, u32)>> = Vec::new();
        assert_eq!(intersect_ranges(&empty), Vec::<(u32, u32)>::new());
    }

    #[test]
    fn test_intersect_ranges_single_language() {
        let lang1 = vec![(0, 3), (5, 10)];
        assert_eq!(intersect_ranges(&[lang1.clone()]), lang1);
    }

    #[test]
    fn test_intersect_ranges_multiple_languages() {
        let lang1 = vec![(0, 3), (5, 10)];
        let lang2 = vec![(0, 3), (12, 15)];
        assert_eq!(intersect_ranges(&[lang1, lang2]), vec![(0, 3)]);
    }

    #[test]
    fn test_intersect_ranges_no_overlap() {
        let lang1 = vec![(0, 3)];
        let lang2 = vec![(4, 8)];
        assert_eq!(intersect_ranges(&[lang1, lang2]), Vec::<(u32, u32)>::new());
    }

    #[test]
    fn test_intersect_ranges_one_language_accepts_all() {
        let lang1 = vec![(0, 3), (5, 10)];
        let lang2 = Vec::new();
        assert_eq!(intersect_ranges(&[lang1, lang2]), Vec::<(u32, u32)>::new());
    }

    #[test]
    fn test_deduplicate_suggestions_empty() {
        let empty: Vec<String> = Vec::new();
        assert_eq!(deduplicate_suggestions(empty, 8), Vec::<String>::new());
    }

    #[test]
    fn test_deduplicate_suggestions_removes_duplicates_in_order() {
        let input = vec![
            "word".to_string(),
            "woord".to_string(),
            "word".to_string(),
            "sword".to_string(),
        ];
        assert_eq!(
            deduplicate_suggestions(input, 8),
            vec!["word".to_string(), "woord".to_string(), "sword".to_string()]
        );
    }

    #[test]
    fn test_deduplicate_suggestions_caps_at_limit() {
        let input: Vec<String> = (0..15).map(|i| format!("suggestion_{i}")).collect();
        let result = deduplicate_suggestions(input, 8);
        assert_eq!(result.len(), 8);
        assert_eq!(result[0], "suggestion_0");
        assert_eq!(result[7], "suggestion_7");
    }

    #[test]
    fn test_deduplicate_language_tags() {
        let input = vec![
            "nl-NL".to_string(),
            "en-US".to_string(),
            "nl-NL".to_string(),
            "de-DE".to_string(),
            "en-us".to_string(),
        ];
        let result = deduplicate_language_tags(input);
        assert_eq!(result, vec!["nl-NL".to_string(), "en-US".to_string(), "de-DE".to_string()]);
    }

    #[test]
    #[ignore]
    #[cfg(windows)]
    fn test_smoke_spell_check_teh_wrods() {
        let avail = tauri::async_runtime::block_on(spell_available_languages()).expect("spell_available_languages failed");
        println!("Available spell languages: {:?}", avail);

        let langs = tauri::async_runtime::block_on(spell_languages()).expect("spell_languages failed");
        println!("Active spell languages: {:?}", langs);

        let has_nl = avail.iter().any(|l| l.eq_ignore_ascii_case("nl-nl"));
        let has_en = avail.iter().any(|l| l.eq_ignore_ascii_case("en-us"));
        if has_nl && has_en {
            let active = tauri::async_runtime::block_on(spell_set_languages(vec!["nl-NL".to_string(), "en-US".to_string()]))
                .expect("spell_set_languages failed");
            println!("Active spell languages after setting nl-NL and en-US: {:?}", active);
            let res = tauri::async_runtime::block_on(spell_check_lines(vec!["the wrods".to_string()]))
                .expect("spell_check_lines failed");
            assert_eq!(res.len(), 1);
            assert_eq!(
                res[0],
                vec![(4, 9)],
                "Expected only 'wrods' to be flagged for 'the wrods', got {:?}",
                res[0]
            );
        } else if langs.iter().any(|l| l.to_lowercase().starts_with("en")) {
            let res = tauri::async_runtime::block_on(spell_check_lines(vec!["teh wrods".to_string()]))
                .expect("spell_check_lines failed");
            assert_eq!(res.len(), 1);
            assert_eq!(
                res[0],
                vec![(0, 3), (4, 9)],
                "Expected 2 ranges for 'teh wrods', got {:?}",
                res[0]
            );
        } else if !langs.is_empty() {
            let res = tauri::async_runtime::block_on(spell_check_lines(vec!["teh wrods".to_string()]))
                .expect("spell_check_lines failed");
            println!("Misspelled ranges for 'teh wrods' in {:?}: {:?}", langs, res);
            assert_eq!(res.len(), 1);
            assert_eq!(
                res[0],
                vec![(0, 3), (4, 9)],
                "Expected 2 ranges for 'teh wrods', got {:?}",
                res[0]
            );
        } else {
            println!("Skipping smoke test: no spell checker available");
        }

        // An empty or blank line in the batch must not fail the whole batch (E_INVALIDARG from ISpellChecker::Check).
        if !langs.is_empty() {
            let batch = vec!["teh wrods".to_string(), String::new(), "   ".to_string(), "wrods".to_string()];
            let res = tauri::async_runtime::block_on(spell_check_lines(batch)).expect("batch with empty lines failed");
            assert_eq!(res.len(), 4);
            assert!(res[1].is_empty() && res[2].is_empty(), "blank lines have no marks: {res:?}");
            assert!(!res[0].is_empty() && !res[3].is_empty(), "the other lines are still checked: {res:?}");
        }
    }
}
