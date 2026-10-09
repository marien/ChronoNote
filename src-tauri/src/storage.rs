use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use ts_rs::TS;

/// Editor glyph colouring. Two sets, sharing the same structural
/// `--glyph-*` CSS variables:
///  - `Color` — red open · amber deferred · green done · grey won't-do
///    (§328: the former `Legacy` palette, which replaced §105's cyan set).
///    The default (changed from `Grayscale` 2026-09-13). A config saved
///    with the old `"legacy"` value loads as `Color`.
///  - `Grayscale` — weight/opacity only, no hue.
///
/// Stored in `config.json`; deserialization rejects anything else (an
/// invalid value trips the §97 corrupt-config recovery instead of silently
/// passing through, as it did while this was a bare `String`).
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default, TS)]
#[serde(rename_all = "lowercase")]
pub enum ColorMode {
    #[default]
    #[serde(alias = "legacy")]
    Color,
    Grayscale,
}

/// Light/dark mode (#48) — independent of `ColorMode` above (that's the
/// glyph palette; this is the chrome's own light-vs-dark rendering).
/// `System` (the default) is today's only behaviour: the CSS follows
/// `prefers-color-scheme` with no override. `Light`/`Dark` pin it
/// regardless of the OS setting — see `app.css`'s `[data-theme]` blocks.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default, TS)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    #[default]
    System,
}

/// UI display language. `System` (the default) means "no override" —
/// the frontend resolves it from the webview's/browser's own reported
/// language (`navigator.language`), exactly like `ThemeMode::System`
/// defers to `prefers-color-scheme`. `En`/`Nl`/`De` pin it regardless of
/// the OS setting. Keyboard shortcuts are unaffected by this — they're
/// bound by physical key code (`shortcuts.ts`), never by displayed label.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default, TS)]
#[serde(rename_all = "lowercase")]
pub enum LanguageMode {
    En,
    Nl,
    De,
    Fr,
    Pl,
    Es,
    It,
    #[default]
    System,
}

/// Startup tab preference on the first launch of the day:
/// `Today` (default) opens today's note unconditionally.
/// `SmartLastActive` restores the last active note, unless today
/// already has content or scheduled meetings.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default, TS)]
#[serde(rename_all = "snake_case")]
pub enum StartupTabMode {
    #[default]
    Today,
    SmartLastActive,
}

/// How a dated tab is named in the tab strip: `Iso` (default) shows 2026-10-09,
/// `Friendly` shows Today / Yesterday / Tomorrow or a short weekday and date.
/// The ISO date stays the tab's tooltip either way.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default, TS)]
#[serde(rename_all = "lowercase")]
pub enum TabLabelStyle {
    #[default]
    Iso,
    Friendly,
}

/// Peek mode (compact see-through note window for calls): how much of the header strip shows.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default, TS)]
#[serde(rename_all = "snake_case")]
pub enum PeekHeader {
    #[default]
    Always,
    Hover,
    /// Only a thin strip (it still carries the past/today/future colour and works as the drag handle).
    Never,
}

/// Where the compact Peek window was last left, in physical pixels.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, TS)]
pub struct PeekGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Peek mode settings. One nested object so the feature adds a single field to `config.json`; every field has a
/// default, so a config written before Peek existed (or hand-edited) loads fine.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct PeekConfig {
    /// Height in lines; 0 = fit the whole section.
    pub lines: u32,
    /// Background opacity in percent while the pointer is away (text is never translucent).
    pub opacity: u32,
    /// Background opacity in percent while the window is "in focus": you are typing in it or moving the pointer over
    /// it (it fades to `opacity` after `fade_seconds` without either).
    pub opacity_hover: u32,
    /// Seconds without typing or pointer movement after which the window fades from `opacity_hover` to `opacity`;
    /// 0 = never fade.
    pub fade_seconds: u32,
    pub always_on_top: bool,
    pub header: PeekHeader,
    pub geometry: Option<PeekGeometry>,
    /// The "lines" setting changed since the window was last left: use it for the height, not the remembered one.
    pub use_lines_height: bool,
    /// Which generation of defaults these values were saved under (see `migrated`). A config saved before this
    /// field existed has none, which reads as 0.
    #[serde(default)]
    pub defaults_version: u32,
    /// The ONE global (system-wide) Peek shortcut: opens Peek on the meeting that is on now (or a new ad-hoc call
    /// section) and leaves Peek again. No function key (they need Fn on a laptop). Peek on the section the cursor is in
    /// is an in-app shortcut only (`Ctrl+Alt+P`, fixed like every other in-app shortcut).
    pub call_shortcut: String,
}

pub const PEEK_MAX_LINES: u32 = 15;
/// Bumped when Peek's defaults change; see `PeekConfig::migrated`.
pub const PEEK_DEFAULTS_VERSION: u32 = 5;
/// The call shortcut default has been J (v0.25, v0.26.0), N for a day (v0.26.1) and is J again: N types an n with a
/// tilde with AltGr on US-International (and Polish layouts), and a system-wide Ctrl+Alt+N blocks that letter in
/// every app. J types nothing with AltGr on the common layouts.
pub const PEEK_OLD_CALL_SHORTCUT: &str = "CommandOrControl+Alt+N";
pub const PEEK_DEFAULT_CALL_SHORTCUT: &str = "CommandOrControl+Alt+J";
pub const PEEK_MIN_OPACITY: u32 = 20;
pub const PEEK_MAX_FADE_SECONDS: u32 = 60;

impl Default for PeekConfig {
    fn default() -> Self {
        PeekConfig {
            lines: 6,
            opacity: 50,
            opacity_hover: 95,
            fade_seconds: 3,
            always_on_top: true,
            header: PeekHeader::default(),
            geometry: None,
            use_lines_height: false,
            defaults_version: PEEK_DEFAULTS_VERSION,
            call_shortcut: PEEK_DEFAULT_CALL_SHORTCUT.to_string(),
        }
    }
}

impl PeekConfig {
    /// v0.23.0 saved Peek's settings whole (the first time any of them changed), including its then-defaults: the
    /// header strip "never" (hidden) and opacity 70. Those defaults changed to "always" and 80, but a saved copy of the
    /// old ones would hide the change. Settings saved before the defaults were versioned get the new ones once; from
    /// then on the stored values are the user's own.
    pub fn migrated(mut self) -> Self {
        // Each step runs once, for configs saved before it existed: version 0 -> 1 moved the header and opacity
        // defaults. A value the user changed on purpose is kept.
        if self.defaults_version < 1 {
            if self.header == PeekHeader::Never {
                self.header = PeekHeader::Always;
            }
            if self.opacity == 70 {
                self.opacity = 80;
            }
        }
        // 2 -> 3: the in focus / out of focus / fade defaults became 95 / 50 / 3 s. A value that is still the old
        // default (never changed, only saved along with another setting) moves; one the user chose is kept.
        if self.defaults_version < 3 {
            if self.opacity == 80 {
                self.opacity = 50;
            }
            if self.opacity_hover == 100 {
                self.opacity_hover = 95;
            }
            if self.fade_seconds == 5 {
                self.fade_seconds = 3;
            }
        }
        // The toggle shortcut stopped being a setting in v0.26.1 (it is the fixed in-app Ctrl+Shift+P), so an old
        // `shortcut` field is ignored when loading. The call shortcut default is J again (N only lived in v0.26.1):
        // a config still on N moves once; any other key the user chose is kept.
        if self.defaults_version < 5 && self.call_shortcut == PEEK_OLD_CALL_SHORTCUT {
            self.call_shortcut = PEEK_DEFAULT_CALL_SHORTCUT.to_string();
        }
        self.defaults_version = PEEK_DEFAULTS_VERSION;
        self
    }

    /// Keeps hand-edited or out-of-range values usable.
    pub fn clamped(mut self) -> Self {
        self.lines = self.lines.min(PEEK_MAX_LINES);
        self.opacity = self.opacity.clamp(PEEK_MIN_OPACITY, 100);
        self.opacity_hover = self.opacity_hover.clamp(PEEK_MIN_OPACITY, 100);
        self.fade_seconds = self.fade_seconds.min(PEEK_MAX_FADE_SECONDS);
        self
    }
}

/// Persisted app configuration. Lives outside the notes folder, in the
/// OS-appropriate app config directory (e.g. %APPDATA%\com.chrononote.app on
/// Windows, ~/.config/com.chrononote.app on Linux, ~/Library/Application
/// Support/com.chrononote.app on macOS) as `config.json`.
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub notes_dir: String,
    #[serde(default)]
    pub color_mode: ColorMode,
    /// #48: light / dark / system. Defaults to `System` — unchanged
    /// behaviour for every config written before this field existed.
    #[serde(default)]
    pub theme_mode: ThemeMode,
    /// Soft word-wrap in the editor (§80). Off by default — the app's
    /// tabular-monospace-grid tenet assumes no wrapping; this is an
    /// opt-in for prose-heavy notes. `#[serde(default)]` gives `false`
    /// for a config written before this field existed.
    #[serde(default)]
    pub word_wrap: bool,
    /// §99/§110: a single opt-in that wraps lines *and* caps the column to
    /// a comfortable ~720px centred measure. Off by default (the app's
    /// monospace-grid tenet keeps the editor full-width and unwrapped);
    /// turning it on force-enables `word_wrap` and takes ownership of it.
    #[serde(default)]
    pub readable_line_length: bool,
    /// Up to 5 previously-used notes folders, most-recent-first, excluding
    /// whatever is current — spec §39. Maintained by `set_notes_dir`
    /// alone, so switching folders by hand-editing this file (as this
    /// project's own stress testing did) never adds spurious entries.
    #[serde(default)]
    pub recent_notes_dirs: Vec<String>,
    /// §update-check: silently check github.com for a newer release on
    /// launch. On by default (normal for a desktop app) — disclosed +
    /// toggleable in Settings. `#[serde(default = "default_true")]` (not
    /// the derived `Default`, which would be `false`) so a config written
    /// before this field existed opts in rather than silently staying off.
    #[serde(default = "default_true")]
    pub auto_check_updates: bool,
    /// #50: the app version this installation last recorded actually
    /// running — compared against the live version on boot to detect a
    /// first launch after an in-place update, so the frontend can show a
    /// one-time "Updated to vX.Y.Z" status-bar link to the release notes.
    /// `None` for a config written before this field existed, or a
    /// genuinely fresh install — either way there's no prior version to
    /// say we updated *from*, so nothing is shown; the current version is
    /// just recorded as seen.
    #[serde(default)]
    pub last_seen_version: Option<String>,
    /// Calendar sync's "Sync calendar for this day" button is opt-in and
    /// hidden entirely until turned on here — the feature reads an
    /// external file (`.agenda.json`) the user has to set up a separate
    /// process to maintain, so showing it unconditionally would just be a
    /// dead button for anyone who hasn't done that. `#[serde(default)]`
    /// (`false`) for every config written before this field existed.
    #[serde(default)]
    pub calendar_sync_enabled: bool,
    /// §v0.12.2: user-configurable editor canvas font size. Range 12–18px,
    /// 0.5px steps. Defaults to 13.0 — exactly matches the previous hardcoded
    /// `font-size: 13px !important` so existing users see no change.
    /// `#[serde(default = "default_font_size")]` so a config written before
    /// this field existed gets the same 13px value as the old hardcode.
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// §v0.12.2: user-configurable line spacing. Range 1.30–1.80, 0.05 steps.
    /// Default 1.6 — the current `.cm-line` value (§79 glyph box is pinned to
    /// this ratio; a different default would silently re-layout every user).
    #[serde(default = "default_line_height")]
    pub line_height: f32,
    /// §v0.12.2: pure black (#000000) OLED canvas mode. Only effective when
    /// the resolved theme is dark. Modelled as a toggle layered on dark
    /// (`data-pure-black` attribute on `<html>`), not a fourth `ThemeMode`
    /// value — avoids falling through every `[data-theme="dark"]`-keyed token
    /// block and the native anti-flash code in `show_window_without_flash`.
    #[serde(default)]
    pub pure_black: bool,
    /// i18n roadmap: UI display language override. `System` (default)
    /// means the frontend follows the webview/browser's own reported
    /// language. `#[serde(default)]` gives `System` for every config
    /// written before this field existed.
    #[serde(default)]
    pub language_mode: LanguageMode,
    /// First-time user onboarding (§onboarding): records whether the initial
    /// welcome / onboarding walkthrough has already completed or been dismissed.
    /// Strictly once per installation globally (stored in `config.json`,
    /// not per notes folder). Defaults to `false`.
    #[serde(default)]
    pub onboarding_completed: bool,
    /// Startup tab preference on the first launch of the day (§spec):
    /// `Today` (default) opens today's note unconditionally.
    /// `SmartLastActive` restores the last active note unless today has content or meetings.
    #[serde(default)]
    pub startup_tab_mode: StartupTabMode,
    /// Peek mode settings (compact see-through note window for calls).
    #[serde(default)]
    pub peek: PeekConfig,
    /// Experimental: show `< (X/Y) >` after a section's title in the editor when the section has other
    /// occurrences. The Alt+Left / Alt+Right shortcuts work regardless. Off by default.
    #[serde(default)]
    pub occurrence_hint: bool,
    /// Whether the status bar is visible at the bottom of the window (§B4).
    /// On by default; old configs without this field load as true.
    #[serde(default = "default_true")]
    pub status_bar_visible: bool,
    /// How dated tabs are labelled in the tab strip (§B3). Old configs load as ISO.
    #[serde(default)]
    pub tab_label_style: TabLabelStyle,
}

/// A partial update of `AppConfig` for the `update_config` command: only the
/// fields present are changed. `notes_dir`/`recent_notes_dirs` are not here on
/// purpose (`set_notes_dir` maintains the recent list).
#[derive(Deserialize, Default, Clone, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct ConfigPatch {
    #[ts(optional)]
    pub color_mode: Option<ColorMode>,
    #[ts(optional)]
    pub theme_mode: Option<ThemeMode>,
    #[ts(optional)]
    pub language_mode: Option<LanguageMode>,
    #[ts(optional)]
    pub startup_tab_mode: Option<StartupTabMode>,
    #[ts(optional)]
    pub word_wrap: Option<bool>,
    #[ts(optional)]
    pub readable_line_length: Option<bool>,
    #[ts(optional)]
    pub auto_check_updates: Option<bool>,
    #[ts(optional)]
    pub calendar_sync_enabled: Option<bool>,
    #[ts(optional)]
    pub font_size: Option<f32>,
    #[ts(optional)]
    pub line_height: Option<f32>,
    #[ts(optional)]
    pub occurrence_hint: Option<bool>,
    #[ts(optional)]
    pub status_bar_visible: Option<bool>,
    #[ts(optional)]
    pub tab_label_style: Option<TabLabelStyle>,
    #[ts(optional)]
    pub pure_black: Option<bool>,
    #[ts(optional)]
    pub peek: Option<PeekConfig>,
    #[ts(optional)]
    pub last_seen_version: Option<String>,
    #[ts(optional)]
    pub onboarding_completed: Option<bool>,
}

impl ConfigPatch {
    /// Sets every present field, with the clamps the old per-field setters had.
    pub fn apply(self, cfg: &mut AppConfig) {
        if let Some(v) = self.color_mode {
            cfg.color_mode = v;
        }
        if let Some(v) = self.theme_mode {
            cfg.theme_mode = v;
        }
        if let Some(v) = self.language_mode {
            cfg.language_mode = v;
        }
        if let Some(v) = self.startup_tab_mode {
            cfg.startup_tab_mode = v;
        }
        if let Some(v) = self.word_wrap {
            cfg.word_wrap = v;
        }
        if let Some(v) = self.readable_line_length {
            cfg.readable_line_length = v;
        }
        if let Some(v) = self.auto_check_updates {
            cfg.auto_check_updates = v;
        }
        if let Some(v) = self.calendar_sync_enabled {
            cfg.calendar_sync_enabled = v;
        }
        if let Some(v) = self.font_size {
            cfg.font_size = v.clamp(12.0, 18.0);
        }
        if let Some(v) = self.line_height {
            cfg.line_height = v.clamp(1.3, 1.8);
        }
        if let Some(v) = self.occurrence_hint {
            cfg.occurrence_hint = v;
        }
        if let Some(v) = self.status_bar_visible {
            cfg.status_bar_visible = v;
        }
        if let Some(v) = self.tab_label_style {
            cfg.tab_label_style = v;
        }
        if let Some(v) = self.pure_black {
            cfg.pure_black = v;
        }
        if let Some(v) = self.peek {
            cfg.peek = v.clamped();
        }
        if let Some(v) = self.last_seen_version {
            cfg.last_seen_version = Some(v);
        }
        if let Some(v) = self.onboarding_completed {
            cfg.onboarding_completed = v;
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_font_size() -> f32 {
    13.0
}

fn default_line_height() -> f32 {
    1.6
}

const MAX_RECENT_NOTES_DIRS: usize = 5;

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

const SCRATCHPAD_DRAFTS_FILENAME: &str = ".scratchpads-drafts.json";

fn scratchpad_drafts_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(SCRATCHPAD_DRAFTS_FILENAME))
}

fn default_notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let doc_dir = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(doc_dir.join("Notes"))
}

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
enum StorageError {
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
fn resolve_workspace_path(workspace: &Path, rel: &Path) -> Result<PathBuf, StorageError> {
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
static NOTE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

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
fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
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
fn quarantine_corrupt_file(path: &Path) {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut aside = path.as_os_str().to_owned();
    aside.push(format!(".corrupt-{stamp}"));
    if let Err(e) = fs::rename(path, &aside) {
        eprintln!("chrononote: could not quarantine corrupt {}: {e}", path.display());
    }
}

fn load_config_at(path: &Path, default_notes_dir: &Path) -> Result<AppConfig, String> {
    if path.exists() {
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        match serde_json::from_str::<AppConfig>(&raw) {
            Ok(mut cfg) => {
                cfg.peek = cfg.peek.migrated();
                return Ok(cfg);
            }
            // Corrupt or truncated (a mid-write crash from before atomic
            // writes, disk rot, a botched hand-edit). Set it aside and
            // rebuild a default rather than leave the app unbootable.
            Err(_) => quarantine_corrupt_file(path),
        }
    }
    let cfg = AppConfig {
        notes_dir: default_notes_dir.to_string_lossy().to_string(),
        color_mode: ColorMode::default(),
        theme_mode: ThemeMode::default(),
        word_wrap: false,
        readable_line_length: false,
        recent_notes_dirs: Vec::new(),
        auto_check_updates: true,
        last_seen_version: None,
        calendar_sync_enabled: false,
        font_size: default_font_size(),
        line_height: default_line_height(),
        pure_black: false,
        language_mode: LanguageMode::default(),
        onboarding_completed: false,
        startup_tab_mode: StartupTabMode::default(),
        peek: PeekConfig::default(),
        occurrence_hint: false,
        status_bar_visible: true,
        tab_label_style: TabLabelStyle::default(),
    };
    save_config_at(path, &cfg)?;
    Ok(cfg)
}

fn save_config_at(path: &Path, cfg: &AppConfig) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    atomic_write(path, raw.as_bytes()).map_err(|e| e.to_string())
}

/// Records `old_path` (the folder just switched away from) into the
/// recent-folders list, and removes `new_path` from it — `new_path` is
/// about to become current, so it shouldn't also appear as "other folders
/// to switch to". Deduped and capped at `MAX_RECENT_NOTES_DIRS`,
/// most-recent-first.
pub fn push_recent_notes_dir(recent: &mut Vec<String>, old_path: &str, new_path: &str) {
    recent.retain(|p| p != new_path && p != old_path);
    recent.insert(0, old_path.to_string());
    recent.truncate(MAX_RECENT_NOTES_DIRS);
}

/// Daily note filenames must be exactly `YYYY-MM-DD.txt`. This is both the
/// spec's naming scheme and a guard against path traversal, since the value
/// arrives from the frontend and is joined directly onto the notes root.
fn is_valid_note_filename(filename: &str) -> bool {
    let b = filename.as_bytes();
    b.len() == 14
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..10].iter().all(u8::is_ascii_digit)
        && &filename[10..] == ".txt"
}

fn list_note_files_at(root: &Path) -> Result<Vec<String>, String> {
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

fn read_note_at(root: &Path, filename: &str) -> Result<Option<String>, String> {
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

fn hash_bytes(bytes: &[u8]) -> String {
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

fn file_metadata_at(root: &Path, filename: &str) -> Result<FileMetadata, String> {
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

fn read_note_with_metadata_at(root: &Path, filename: &str) -> Result<NoteWithMetadata, String> {
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

fn write_conflict_copy_at(root: &Path, name: &str, content: &str) -> Result<String, String> {
    if !is_valid_conflict_filename(name) {
        return Err(format!("Invalid conflict-copy filename: {name}"));
    }
    let dir = root.join(CONFLICTS_DIRNAME);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = resolve_workspace_path(&dir, Path::new(name)).map_err(String::from)?;
    atomic_write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

fn write_note_at(
    root: &Path,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
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

/// #63: deletes a note file from disk — used when a dated tab closes
/// with empty content, so ChronoNote doesn't leave an empty file behind
/// forever just because a day's note was opened and never actually
/// written into. A missing file is **not** an error (idempotent): the
/// common case is a tab that was never edited at all, so no file was
/// ever written for it in the first place — deleting it "succeeds"
/// trivially rather than surfacing a spurious failure toast for what is,
/// from the caller's point of view, already the desired end state.
fn delete_note_at(root: &Path, filename: &str, expected_hash: Option<&str>) -> Result<(), String> {
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
    match fs::remove_file(&target) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn read_all_notes_at(root: &Path) -> Result<Vec<(String, String)>, String> {
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
fn import_notes_bundle_at(
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
                fs::remove_file(root.join(&f)).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(ImportResult { imported, skipped })
}

/// Which tabs were open, and which was active, last time this specific
/// notes folder was used — spec §34. Deliberately stored *inside* the
/// notes folder itself (rather than alongside `notes_dir`/`color_mode` in
/// the global `config.json`) so the state travels with the folder if it's
/// ever moved or copied, and so switching between folders doesn't need a
/// growing map of every folder ever opened. `is_valid_note_filename`
/// already restricts the daily-note scan to exactly `YYYY-MM-DD.txt`, so
/// this file is never picked up as a note.
const SESSION_FILENAME: &str = ".chrononote-session.json";

#[derive(Serialize, Deserialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct TabSession {
    #[serde(default)]
    pub open_tabs: Vec<String>,
    #[serde(default)]
    pub active_tab: Option<String>,
    /// ISO date (`YYYY-MM-DD`) this folder was last opened on, as reported
    /// by the frontend. `None` for sessions written before #23 / for a
    /// folder never opened. Used at boot to detect the first launch of a
    /// new day and force today's note active regardless of `active_tab`.
    #[serde(default)]
    #[ts(optional = nullable)]
    pub last_opened_date: Option<String>,
}

fn read_tab_session_at(root: &Path) -> Result<Option<TabSession>, String> {
    let path = root.join(SESSION_FILENAME);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&raw) {
        Ok(session) => Ok(Some(session)),
        // Corrupt / truncated session — quarantine it and boot as if this
        // folder had no saved session (fresh today's-tab bootstrap).
        Err(_) => {
            quarantine_corrupt_file(&path);
            Ok(None)
        }
    }
}

fn write_tab_session_at(root: &Path, session: &TabSession) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    atomic_write(&root.join(SESSION_FILENAME), raw.as_bytes()).map_err(|e| e.to_string())
}

fn read_scratchpad_drafts_at(
    path: &Path,
) -> Result<std::collections::HashMap<String, String>, String> {
    if !path.exists() {
        return Ok(std::collections::HashMap::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&raw) {
        Ok(drafts) => Ok(drafts),
        Err(_) => {
            quarantine_corrupt_file(path);
            Ok(std::collections::HashMap::new())
        }
    }
}

fn write_scratchpad_drafts_at(
    path: &Path,
    drafts: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(drafts).map_err(|e| e.to_string())?;
    atomic_write(path, raw.as_bytes()).map_err(|e| e.to_string())
}

// --- Public, Tauri-command-facing functions --------------------------------
// Each just resolves the real path via `AppHandle`, then delegates to the
// path-parameterized core above. Behavior is unchanged from before this was
// split out — only where the path comes from moved.

fn notes_root(app: &AppHandle) -> Result<PathBuf, String> {
    let cfg = load_config(app)?;
    Ok(PathBuf::from(cfg.notes_dir))
}

pub fn load_config(app: &AppHandle) -> Result<AppConfig, String> {
    load_config_at(&config_path(app)?, &default_notes_dir(app)?)
}

pub fn save_config(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    save_config_at(&config_path(app)?, cfg)
}

pub fn list_note_files(app: &AppHandle) -> Result<Vec<String>, String> {
    list_note_files_at(&notes_root(app)?)
}

pub fn read_note(app: &AppHandle, filename: &str) -> Result<Option<String>, String> {
    read_note_at(&notes_root(app)?, filename)
}

pub fn write_note(
    app: &AppHandle,
    filename: &str,
    content: &str,
    expected_hash: Option<&str>,
) -> Result<FileMetadata, String> {
    write_note_at(&notes_root(app)?, filename, content, expected_hash)
}

pub fn delete_note(app: &AppHandle, filename: &str, expected_hash: Option<&str>) -> Result<(), String> {
    delete_note_at(&notes_root(app)?, filename, expected_hash)
}

pub fn get_file_metadata(app: &AppHandle, filename: &str) -> Result<FileMetadata, String> {
    file_metadata_at(&notes_root(app)?, filename)
}

pub fn read_note_with_metadata(app: &AppHandle, filename: &str) -> Result<NoteWithMetadata, String> {
    read_note_with_metadata_at(&notes_root(app)?, filename)
}

pub fn write_conflict_copy(app: &AppHandle, name: &str, content: &str) -> Result<String, String> {
    write_conflict_copy_at(&notes_root(app)?, name, content)
}

pub fn read_all_notes(app: &AppHandle) -> Result<Vec<(String, String)>, String> {
    read_all_notes_at(&notes_root(app)?)
}

pub fn read_tab_session(app: &AppHandle) -> Result<Option<TabSession>, String> {
    read_tab_session_at(&notes_root(app)?)
}

pub fn write_tab_session(app: &AppHandle, session: &TabSession) -> Result<(), String> {
    write_tab_session_at(&notes_root(app)?, session)
}

pub fn import_notes_bundle(
    app: &AppHandle,
    notes: &std::collections::HashMap<String, String>,
    mode: ImportMode,
) -> Result<ImportResult, String> {
    import_notes_bundle_at(&notes_root(app)?, notes, mode)
}

pub fn load_scratchpad_drafts(
    app: &AppHandle,
) -> Result<std::collections::HashMap<String, String>, String> {
    read_scratchpad_drafts_at(&scratchpad_drafts_path(app)?)
}

pub fn save_scratchpad_drafts(
    app: &AppHandle,
    drafts: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    write_scratchpad_drafts_at(&scratchpad_drafts_path(app)?, drafts)
}

// --- TS binding generation (§98) ---------------------------------------
//
// The Rust payload structs are the single source of truth for their
// TypeScript shapes. This test (re)writes `src/lib/generated/
// tauri-types.ts` from the `#[derive(TS)]` types; CI fails if the checked-
// in file is stale (`git diff --exit-code`). Kept out of the `tests`
// module below so it runs even when that module is filtered.

#[cfg(test)]
#[test]
fn generate_typescript_bindings() {
    // `u64`/`i64` -> `number` (not `bigint`): our sizes are KB and mtimes
    // ~1.8e12 ms, both well inside a JS safe integer, and the frontend +
    // mock treat these as plain numbers.
    let cfg = ts_rs::Config::default().with_large_int("number");
    // Emitted deps-first so intra-file references resolve.
    let decls = [
        ColorMode::decl(&cfg),
        ThemeMode::decl(&cfg),
        LanguageMode::decl(&cfg),
        StartupTabMode::decl(&cfg),
        TabLabelStyle::decl(&cfg),
        PeekHeader::decl(&cfg),
        PeekGeometry::decl(&cfg),
        PeekConfig::decl(&cfg),
        FileMetadata::decl(&cfg),
        AppConfig::decl(&cfg),
        ConfigPatch::decl(&cfg),
        TabSession::decl(&cfg),
        NoteWithMetadata::decl(&cfg),
        ImportMode::decl(&cfg),
        ImportResult::decl(&cfg),
        // i18n Phase 2 (docs/design/i18n-roadmap.md): the small, stable
        // error-code shape a few commands/result fields return instead of
        // a bare `String`, so the frontend can translate the ones we
        // author ourselves.
        crate::error::AppError::decl(&cfg),
        // OneDrive wire types (Settings, folder picker, sync + conflict screen).
        crate::onedrive::OneDriveAccount::decl(&cfg),
        crate::onedrive::OneDriveLoginResult::decl(&cfg),
        crate::onedrive::OneDriveFolderItem::decl(&cfg),
        crate::onedrive::OneDriveFolderConfig::decl(&cfg),
        crate::onedrive::FolderSwitchBlocked::decl(&cfg),
        crate::onedrive::FolderSwitchResult::decl(&cfg),
        crate::onedrive::OneDriveSyncResult::decl(&cfg),
        crate::onedrive::SyncConflict::decl(&cfg),
        crate::onedrive::SyncHealth::decl(&cfg),
        crate::onedrive::SyncStatus::decl(&cfg),
        crate::onedrive::OneDriveAdvancedConfig::decl(&cfg),
    ];
    // ts-rs inlines each Rust doc comment as a `/* … */` block mid-decl,
    // which reads badly on one line. Strip those and collapse whitespace
    // so every type is a single tidy line — the `// GENERATED …` header
    // and `storage.rs` already point a reader at the source of truth.
    let body = decls
        .iter()
        .map(|d| format!("export {}\n", tidy_decl(d)))
        .collect::<Vec<_>>()
        .join("\n");
    let contents = format!(
        "// GENERATED by `cd src-tauri && cargo test` from the `#[derive(TS)]` structs\n\
         // in `src-tauri/src/storage.rs` (§98). Do not edit by hand — the Rust\n\
         // definitions are the source of truth, and CI fails if this file is stale.\n\
         \n{body}"
    );
    let out = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("src")
        .join("lib")
        .join("generated")
        .join("tauri-types.ts");
    fs::create_dir_all(out.parent().unwrap()).unwrap();
    // Only rewrite on a real change so an unrelated test run doesn't churn
    // the file's mtime.
    if fs::read_to_string(&out).ok().as_deref() != Some(&contents) {
        fs::write(&out, &contents).unwrap();
    }
}

/// Drop `/* … */` blocks (ts-rs emits doc comments as these) and collapse
/// every whitespace run — including newlines — to a single space, so a
/// `TS::decl` string becomes one clean line.
#[cfg(test)]
fn tidy_decl(decl: &str) -> String {
    let mut out = String::with_capacity(decl.len());
    let mut chars = decl.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut prev = '\0';
            for c2 in chars.by_ref() {
                if prev == '*' && c2 == '/' {
                    break;
                }
                prev = c2;
            }
        } else {
            out.push(c);
        }
    }
    out.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace(", }", " }")
        .replace("{  ", "{ ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

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

    // --- push_recent_notes_dir ---

    #[test]
    fn push_recent_notes_dir_inserts_the_old_path_first() {
        let mut recent = vec![];
        push_recent_notes_dir(&mut recent, "/old", "/new");
        assert_eq!(recent, vec!["/old"]);
    }

    #[test]
    fn push_recent_notes_dir_dedupes_and_removes_the_new_path() {
        let mut recent = vec!["/a".to_string(), "/new".to_string(), "/old".to_string()];
        push_recent_notes_dir(&mut recent, "/old", "/new");
        // "/old" moves back to the front rather than appearing twice;
        // "/new" is gone since it's about to become current.
        assert_eq!(recent, vec!["/old", "/a"]);
    }

    #[test]
    fn push_recent_notes_dir_caps_at_five_most_recent() {
        let mut recent = vec![];
        for i in 0..5 {
            push_recent_notes_dir(&mut recent, &format!("/folder{i}"), "/current");
        }
        assert_eq!(recent.len(), 5);
        assert_eq!(recent[0], "/folder4");
        assert_eq!(recent[4], "/folder0");
    }

    // --- config load/save ---

    #[test]
    fn load_config_creates_a_default_when_none_exists() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        let default_dir = dir.path().join("Notes");
        let cfg = load_config_at(&path, &default_dir).unwrap();
        assert_eq!(cfg.notes_dir, default_dir.to_string_lossy());
        assert_eq!(cfg.color_mode, ColorMode::Color);
        assert!(cfg.recent_notes_dirs.is_empty());
        // The default is also persisted, not just returned in memory.
        assert!(path.exists());
    }

    #[test]
    fn a_config_written_before_the_typography_fields_loads_with_the_old_look() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        // Write a current config, then remove the three new keys: exactly what an older release wrote.
        let base = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        save_config_at(&path, &AppConfig { notes_dir: "/my/notes".to_string(), font_size: 17.0, line_height: 1.7, pure_black: true, ..base }).unwrap();
        let mut json: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        for key in ["font_size", "fontSize", "line_height", "lineHeight", "pure_black", "pureBlack"] {
            json.as_object_mut().unwrap().remove(key);
        }
        fs::write(&path, json.to_string()).unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.notes_dir, "/my/notes");
        assert_eq!(cfg.font_size, 13.0);
        assert_eq!(cfg.line_height, 1.6);
        assert!(!cfg.pure_black);
        // ...and the file wasn't quarantined as corrupt.
        assert!(!fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().contains(".corrupt-")));
    }

    #[test]
    fn load_config_round_trips_a_saved_config() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        let cfg = AppConfig {
            notes_dir: "/my/notes".to_string(),
            color_mode: ColorMode::Color,
            theme_mode: ThemeMode::Dark,
            word_wrap: true,
            readable_line_length: false,
            recent_notes_dirs: vec!["/old1".to_string(), "/old2".to_string()],
            auto_check_updates: false,
            last_seen_version: Some("0.7.4".to_string()),
            calendar_sync_enabled: false,
            font_size: 14.5,
            line_height: 1.7,
            pure_black: true,
            language_mode: LanguageMode::Nl,
            onboarding_completed: true,
            startup_tab_mode: StartupTabMode::SmartLastActive,
            peek: PeekConfig::default(),
            occurrence_hint: false,
            status_bar_visible: true,
            tab_label_style: TabLabelStyle::default(),
        };
        save_config_at(&path, &cfg).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.notes_dir, "/my/notes");
        assert_eq!(loaded.color_mode, ColorMode::Color);
        assert_eq!(loaded.theme_mode, ThemeMode::Dark);
        assert!(loaded.word_wrap);
        assert!(!loaded.readable_line_length);
        assert_eq!(loaded.recent_notes_dirs, vec!["/old1", "/old2"]);
        assert!(!loaded.auto_check_updates);
        assert_eq!(loaded.last_seen_version, Some("0.7.4".to_string()));
        assert_eq!(loaded.font_size, 14.5);
        assert_eq!(loaded.line_height, 1.7);
        assert!(loaded.pure_black);
        assert_eq!(loaded.language_mode, LanguageMode::Nl);
        assert!(loaded.onboarding_completed);
        assert_eq!(loaded.startup_tab_mode, StartupTabMode::SmartLastActive);
    }

    #[test]
    fn a_saved_legacy_color_mode_loads_as_color_and_is_written_back_as_color() {
        // §328: the Legacy palette became Color; old configs still say "legacy".
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n","colorMode":"legacy"}"#).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.color_mode, ColorMode::Color);
        save_config_at(&path, &loaded).unwrap();
        let on_disk = fs::read_to_string(&path).unwrap();
        assert!(on_disk.contains("\"color\""), "color token not written: {on_disk}");
        assert!(!on_disk.contains("\"legacy\""), "legacy token kept: {on_disk}");
    }

    #[test]
    fn theme_mode_round_trips_through_json_for_every_variant() {
        // #48: each of the three theme-mode tokens serializes lowercase
        // and loads back unchanged.
        for (mode, token) in [
            (ThemeMode::Light, "light"),
            (ThemeMode::Dark, "dark"),
            (ThemeMode::System, "system"),
        ] {
            let dir = tempdir().unwrap();
            let path = dir.path().join("config.json");
            let cfg = AppConfig {
                notes_dir: "/n".to_string(),
                color_mode: ColorMode::default(),
                theme_mode: mode,
                word_wrap: false,
                readable_line_length: false,
                recent_notes_dirs: vec![],
                auto_check_updates: true,
                last_seen_version: None,
                calendar_sync_enabled: false,
                font_size: default_font_size(),
                line_height: default_line_height(),
                pure_black: false,
                language_mode: LanguageMode::default(),
                onboarding_completed: false,
                startup_tab_mode: StartupTabMode::default(),
                peek: PeekConfig::default(),
                occurrence_hint: false,
                status_bar_visible: true,
                tab_label_style: TabLabelStyle::default(),
            };
            save_config_at(&path, &cfg).unwrap();
            let on_disk = fs::read_to_string(&path).unwrap();
            assert!(on_disk.contains(&format!("\"{token}\"")), "{token} token not serialized: {on_disk}");
            let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
            assert_eq!(loaded.theme_mode, mode);
        }
    }

    #[test]
    fn language_mode_round_trips_through_json_for_every_variant() {
        // i18n roadmap: each of the four language tokens serializes
        // lowercase and loads back unchanged, same contract as theme_mode.
        for (mode, token) in [
            (LanguageMode::En, "en"),
            (LanguageMode::Nl, "nl"),
            (LanguageMode::De, "de"),
            (LanguageMode::Fr, "fr"),
            (LanguageMode::Pl, "pl"),
            (LanguageMode::Es, "es"),
            (LanguageMode::It, "it"),
            (LanguageMode::System, "system"),
        ] {
            let dir = tempdir().unwrap();
            let path = dir.path().join("config.json");
            let base = load_config_at(&path, &dir.path().join("Notes")).unwrap();
            save_config_at(&path, &AppConfig { language_mode: mode, ..base }).unwrap();
            let on_disk = fs::read_to_string(&path).unwrap();
            assert!(on_disk.contains(&format!("\"{token}\"")), "{token} token not serialized: {on_disk}");
            let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
            assert_eq!(loaded.language_mode, mode);
        }
    }

    #[test]
    fn load_config_defaults_language_mode_when_omitted() {
        // A config written before this field existed (or hand-edited down
        // to just notesDir) should still load, defaulting to `System`.
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir": "/hand/edited"}"#).unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.language_mode, LanguageMode::System);
    }

    #[test]
    fn startup_tab_mode_round_trips_through_json() {
        for (mode, token) in [
            (StartupTabMode::Today, "today"),
            (StartupTabMode::SmartLastActive, "smart_last_active"),
        ] {
            let dir = tempdir().unwrap();
            let path = dir.path().join("config.json");
            let base = load_config_at(&path, &dir.path().join("Notes")).unwrap();
            save_config_at(&path, &AppConfig { startup_tab_mode: mode, ..base }).unwrap();
            let on_disk = fs::read_to_string(&path).unwrap();
            assert!(on_disk.contains(&format!("\"{token}\"")), "{token} token not serialized: {on_disk}");
            let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
            assert_eq!(loaded.startup_tab_mode, mode);
        }
    }

    #[test]
    fn peek_settings_round_trip_through_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        let base = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        let peek = PeekConfig {
            lines: 3,
            opacity: 40,
            opacity_hover: 90,
            fade_seconds: 12,
            always_on_top: false,
            header: PeekHeader::Hover,
            geometry: Some(PeekGeometry { x: -20, y: 471, width: 523, height: 113 }),
            use_lines_height: true,
            defaults_version: PEEK_DEFAULTS_VERSION,
            call_shortcut: "Ctrl+Alt+K".to_string(),
        };
        save_config_at(&path, &AppConfig { peek: peek.clone(), ..base }).unwrap();
        let on_disk = fs::read_to_string(&path).unwrap();
        assert!(on_disk.contains("\"alwaysOnTop\""), "camelCase keys expected: {on_disk}");
        assert!(on_disk.contains("\"hover\""), "header token not serialized: {on_disk}");
        assert_eq!(load_config_at(&path, &dir.path().join("Notes")).unwrap().peek, peek);
    }

    #[test]
    fn load_config_defaults_peek_when_omitted_or_partial() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir": "/hand/edited"}"#).unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.peek, PeekConfig::default());

        fs::write(&path, r#"{"notesDir": "/hand/edited", "peek": {"opacity": 55}}"#).unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.peek.opacity, 55);
        assert_eq!(cfg.peek.lines, 6);
        assert!(cfg.peek.always_on_top);
    }

    #[test]
    fn a_config_saved_while_peek_was_optional_still_loads() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir": "/n", "peek": {"enabled": false, "lines": 4, "opacity": 65, "defaultsVersion": 3}}"#).unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!((cfg.peek.lines, cfg.peek.opacity), (4, 65));
        // the retired field is not written back
        save_config_at(&path, &cfg).unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("\"enabled\""));
    }

    #[test]
    fn peek_has_the_header_shown_by_default() {
        assert_eq!(PeekConfig::default().header, PeekHeader::Always);
        assert_eq!(PeekHeader::default(), PeekHeader::Always);
    }

    #[test]
    fn occurrence_hint_is_off_by_default_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        assert!(!load_config_at(&path, dir.path()).unwrap().occurrence_hint);
        let mut cfg = load_config_at(&path, dir.path()).unwrap();
        cfg.occurrence_hint = true;
        save_config_at(&path, &cfg).unwrap();
        assert!(load_config_at(&path, dir.path()).unwrap().occurrence_hint);
    }

    #[test]
    fn status_bar_visible_is_on_by_default_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        assert!(load_config_at(&path, dir.path()).unwrap().status_bar_visible);
        let mut cfg = load_config_at(&path, dir.path()).unwrap();
        cfg.status_bar_visible = false;
        save_config_at(&path, &cfg).unwrap();
        assert!(!load_config_at(&path, dir.path()).unwrap().status_bar_visible);
    }

    #[test]
    fn tab_label_style_is_iso_by_default_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        assert_eq!(load_config_at(&path, dir.path()).unwrap().tab_label_style, TabLabelStyle::Iso);
        let mut cfg = load_config_at(&path, dir.path()).unwrap();
        cfg.tab_label_style = TabLabelStyle::Friendly;
        save_config_at(&path, &cfg).unwrap();
        let on_disk: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(on_disk["tabLabelStyle"], serde_json::json!("friendly"));
        assert_eq!(
            load_config_at(&path, dir.path()).unwrap().tab_label_style,
            TabLabelStyle::Friendly
        );
    }

    #[test]
    fn peek_settings_saved_with_the_old_defaults_get_the_new_ones_once() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        // What v0.23.0 wrote: no defaultsVersion, header hidden, opacity 70, other values the user's.
        fs::write(
            &path,
            r#"{"notesDir": "/n", "peek": {"enabled": true, "lines": 4, "opacity": 70, "header": "never"}}"#,
        )
        .unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.peek.header, PeekHeader::Always);
        // 70 -> 80 (version 1) -> 50 (version 3): it was never the user's own choice.
        assert_eq!(cfg.peek.opacity, 50);
        assert_eq!(cfg.peek.lines, 4); // untouched
        assert_eq!(cfg.peek.defaults_version, PEEK_DEFAULTS_VERSION);

        // Once saved under the new version, a deliberate "hidden" / 70 is the user's own and stays.
        save_config_at(&path, &cfg).unwrap();
        let mut again = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        again.peek.header = PeekHeader::Never;
        again.peek.opacity = 70;
        save_config_at(&path, &again).unwrap();
        let kept = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(kept.peek.header, PeekHeader::Never);
        assert_eq!(kept.peek.opacity, 70);
    }

    #[test]
    fn peek_focus_defaults_move_to_95_50_3_only_when_they_were_the_old_defaults() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        let notes = dir.path().join("Notes");
        // Saved by 0.25.x with the old defaults (80 / 100 / 5): moves once.
        fs::write(
            &path,
            r#"{"notesDir": "/n", "peek": {"enabled": true, "opacity": 80, "opacityHover": 100, "fadeSeconds": 5, "defaultsVersion": 2}}"#,
        )
        .unwrap();
        let cfg = load_config_at(&path, &notes).unwrap();
        assert_eq!((cfg.peek.opacity, cfg.peek.opacity_hover, cfg.peek.fade_seconds), (50, 95, 3));
        // Values the user chose are kept, whatever their version.
        fs::write(
            &path,
            r#"{"notesDir": "/n", "peek": {"enabled": true, "opacity": 65, "opacityHover": 90, "fadeSeconds": 0, "defaultsVersion": 2}}"#,
        )
        .unwrap();
        let kept = load_config_at(&path, &notes).unwrap();
        assert_eq!((kept.peek.opacity, kept.peek.opacity_hover, kept.peek.fade_seconds), (65, 90, 0));
        // On version 3 the old numbers are the user's own again.
        fs::write(
            &path,
            r#"{"notesDir": "/n", "peek": {"enabled": true, "opacity": 80, "opacityHover": 100, "fadeSeconds": 5, "defaultsVersion": 3}}"#,
        )
        .unwrap();
        let own = load_config_at(&path, &notes).unwrap();
        assert_eq!((own.peek.opacity, own.peek.opacity_hover, own.peek.fade_seconds), (80, 100, 5));
        // A fresh config has the new defaults.
        let d = PeekConfig::default();
        assert_eq!((d.opacity, d.opacity_hover, d.fade_seconds), (50, 95, 3));
    }

    #[test]
    fn the_call_shortcut_default_is_j_a_saved_n_default_moves_back_once_and_a_retired_toggle_shortcut_is_ignored() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        let notes = dir.path().join("Notes");
        // v0.26.1 saved the N default (and a toggle shortcut that is no longer a setting): back to J.
        fs::write(
            &path,
            r#"{"notesDir": "/n", "peek": {"shortcut": "CommandOrControl+Alt+Space", "callShortcut": "CommandOrControl+Alt+N", "defaultsVersion": 4}}"#,
        )
        .unwrap();
        let cfg = load_config_at(&path, &notes).unwrap();
        assert_eq!(cfg.peek.call_shortcut, "CommandOrControl+Alt+J");
        assert_eq!(cfg.peek.defaults_version, PEEK_DEFAULTS_VERSION);
        // A call shortcut on J (0.25.x / 0.26.0) simply stays J.
        fs::write(&path, r#"{"notesDir": "/n", "peek": {"callShortcut": "CommandOrControl+Alt+J", "defaultsVersion": 3}}"#).unwrap();
        assert_eq!(load_config_at(&path, &notes).unwrap().peek.call_shortcut, "CommandOrControl+Alt+J");
        // A call shortcut the user chose themselves is never replaced.
        fs::write(&path, r#"{"notesDir": "/n", "peek": {"callShortcut": "Ctrl+Shift+Y", "defaultsVersion": 4}}"#).unwrap();
        assert_eq!(load_config_at(&path, &notes).unwrap().peek.call_shortcut, "Ctrl+Shift+Y");
        // On version 5, choosing N on purpose stays.
        fs::write(&path, r#"{"notesDir": "/n", "peek": {"callShortcut": "CommandOrControl+Alt+N", "defaultsVersion": 5}}"#).unwrap();
        assert_eq!(load_config_at(&path, &notes).unwrap().peek.call_shortcut, "CommandOrControl+Alt+N");
        // A fresh config: J, and no function key.
        assert_eq!(PeekConfig::default().call_shortcut, "CommandOrControl+Alt+J");
        assert!(!PeekConfig::default().call_shortcut.contains("F1"));
        // The retired field is not written back.
        let saved = load_config_at(&path, &notes).unwrap();
        save_config_at(&path, &saved).unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("\"shortcut\""));
    }

    #[test]
    fn peek_clamped_keeps_values_in_range() {
        let wild = PeekConfig { lines: 999, opacity: 1, ..PeekConfig::default() }.clamped();
        assert_eq!(wild.lines, PEEK_MAX_LINES);
        assert_eq!(wild.opacity, PEEK_MIN_OPACITY);
        assert_eq!(PeekConfig { opacity: 500, ..PeekConfig::default() }.clamped().opacity, 100);
    }

    #[test]
    fn load_config_defaults_startup_tab_mode_when_omitted() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir": "/hand/edited"}"#).unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.startup_tab_mode, StartupTabMode::Today);
    }

    #[test]
    fn load_config_defaults_color_mode_and_recent_dirs_when_omitted() {
        // An older config.json (or one hand-edited down to just
        // `notesDir`) should still load, defaulting the newer fields.
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir": "/hand/edited"}"#).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.notes_dir, "/hand/edited");
        assert_eq!(loaded.color_mode, ColorMode::Color);
        assert_eq!(loaded.theme_mode, ThemeMode::System);
        assert!(!loaded.word_wrap);
        // Omitted from an older config → off (§110: it's an opt-in).
        assert!(!loaded.readable_line_length);
        assert!(loaded.recent_notes_dirs.is_empty());
        assert_eq!(loaded.last_seen_version, None);
        // Unlike the above, this one's omitted-default is *on* (§update-check).
        assert!(loaded.auto_check_updates);
        assert!(!loaded.onboarding_completed);
    }

    #[test]
    fn load_config_defaults_onboarding_completed_when_omitted() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir": "/n"}"#).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert!(!loaded.onboarding_completed);
    }

    #[test]
    fn load_config_recovers_from_a_corrupt_or_truncated_file() {
        for bad in [r#"{ not json at all"#, r#"{"notesDir": "/x", "colorMo"#, ""] {
            let dir = tempdir().unwrap();
            let path = dir.path().join("config.json");
            fs::write(&path, bad).unwrap();
            // Falls back to a fresh default rather than erroring...
            let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
            assert_eq!(loaded.notes_dir, dir.path().join("Notes").to_string_lossy());
            // ...the rebuilt config is now valid on disk...
            assert!(load_config_at(&path, &dir.path().join("Notes")).is_ok());
            // ...and the bad bytes were set aside, not deleted.
            let quarantined: Vec<_> = fs::read_dir(dir.path())
                .unwrap()
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| n.starts_with("config.json.corrupt-"))
                .collect();
            assert_eq!(quarantined.len(), 1, "expected one quarantine file, got {quarantined:?}");
            assert_eq!(fs::read_to_string(dir.path().join(&quarantined[0])).unwrap(), bad);
        }
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
            .filter(|n| n != "2026-09-07.txt")
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
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["2026-09-07.txt"]);
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

    // --- tab session ---

    #[test]
    fn read_tab_session_returns_none_when_no_session_file_exists() {
        let dir = tempdir().unwrap();
        assert!(read_tab_session_at(dir.path()).unwrap().is_none());
    }

    #[test]
    fn read_tab_session_recovers_from_a_corrupt_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(SESSION_FILENAME);
        fs::write(&path, r#"{"openTabs": ["2026-09-01.txt"], "activeTab"#).unwrap(); // truncated
        // Boots as if there were no session, rather than erroring.
        assert!(read_tab_session_at(dir.path()).unwrap().is_none());
        assert!(!path.exists()); // the bad file was moved aside
        let quarantined: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with(&format!("{SESSION_FILENAME}.corrupt-")))
            .collect();
        assert_eq!(quarantined.len(), 1);
        // A quarantine file in the notes folder is never seen as a note.
        fs::write(dir.path().join("2026-09-05.txt"), "note").unwrap();
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-05.txt"]);
    }

    #[test]
    fn write_then_read_tab_session_round_trips() {
        let dir = tempdir().unwrap();
        let session = TabSession {
            open_tabs: vec!["2026-09-01.txt".to_string(), "2026-09-02.txt".to_string()],
            active_tab: Some("2026-09-02.txt".to_string()),
            last_opened_date: Some("2026-09-02".to_string()),
        };
        write_tab_session_at(dir.path(), &session).unwrap();
        let loaded = read_tab_session_at(dir.path()).unwrap().unwrap();
        assert_eq!(loaded.open_tabs, session.open_tabs);
        assert_eq!(loaded.active_tab, session.active_tab);
        assert_eq!(loaded.last_opened_date, session.last_opened_date);
    }

    #[test]
    fn tab_session_defaults_fields_when_omitted() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join(SESSION_FILENAME), "{}").unwrap();
        let loaded = read_tab_session_at(dir.path()).unwrap().unwrap();
        assert!(loaded.open_tabs.is_empty());
        assert_eq!(loaded.active_tab, None);
        assert_eq!(loaded.last_opened_date, None);
    }

    #[test]
    fn the_session_file_is_never_picked_up_by_list_note_files() {
        let dir = tempdir().unwrap();
        write_note_at(dir.path(), "2026-09-01.txt", "note", None).unwrap();
        write_tab_session_at(dir.path(), &TabSession::default()).unwrap();
        assert_eq!(list_note_files_at(dir.path()).unwrap(), vec!["2026-09-01.txt"]);
    }

    // --- import_notes_bundle (web-app design doc) ---

    use std::collections::HashMap;

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

    #[test]
    fn scratchpad_drafts_roundtrip_and_missing_file_handling() {
        let dir = tempdir().unwrap();
        let file = dir.path().join(SCRATCHPAD_DRAFTS_FILENAME);
        let empty = read_scratchpad_drafts_at(&file).unwrap();
        assert!(empty.is_empty());

        let mut drafts = HashMap::new();
        drafts.insert("scratchpad-1".to_string(), "hello mobile".to_string());
        write_scratchpad_drafts_at(&file, &drafts).unwrap();

        let loaded = read_scratchpad_drafts_at(&file).unwrap();
        assert_eq!(loaded.get("scratchpad-1").map(String::as_str), Some("hello mobile"));
    }

    fn patched(json: &str) -> (serde_json::Value, serde_json::Value) {
        let dir = tempdir().unwrap();
        let base = load_config_at(&dir.path().join("config.json"), &dir.path().join("Notes")).unwrap();
        let before = serde_json::to_value(&base).unwrap();
        let mut cfg = base;
        serde_json::from_str::<ConfigPatch>(json).unwrap().apply(&mut cfg);
        (before, serde_json::to_value(&cfg).unwrap())
    }

    #[test]
    fn config_patch_with_only_word_wrap_changes_only_that_field() {
        let (before, after) = patched(r#"{"wordWrap": true}"#);
        let mut expected = before.clone();
        expected["wordWrap"] = serde_json::json!(true);
        assert_ne!(before, after);
        assert_eq!(after, expected);
    }

    #[test]
    fn config_patch_with_only_status_bar_visible_changes_only_that_field() {
        let (before, after) = patched(r#"{"statusBarVisible": false}"#);
        let mut expected = before.clone();
        expected["statusBarVisible"] = serde_json::json!(false);
        assert_ne!(before, after);
        assert_eq!(after, expected);
    }

    #[test]
    fn config_patch_with_only_tab_label_style_changes_only_that_field() {
        let (before, after) = patched(r#"{"tabLabelStyle": "friendly"}"#);
        let mut expected = before.clone();
        expected["tabLabelStyle"] = serde_json::json!("friendly");
        assert_ne!(before, after);
        assert_eq!(after, expected);
    }

    #[test]
    fn config_patch_clamps_font_size_line_height_and_peek() {
        let (_, after) = patched(r#"{"fontSize": 30.0, "lineHeight": 0.5}"#);
        assert_eq!(after["fontSize"], serde_json::json!(18.0));
        assert_eq!(after["lineHeight"].as_f64().unwrap() as f32, 1.3_f32);
        let (_, after) = patched(r#"{"peek": {"opacity": 1, "lines": 999}}"#);
        assert_eq!(after["peek"]["opacity"], serde_json::json!(PEEK_MIN_OPACITY));
        assert_eq!(after["peek"]["lines"], serde_json::json!(PEEK_MAX_LINES));
    }

    #[test]
    fn empty_config_patch_changes_nothing() {
        let (before, after) = patched("{}");
        assert_eq!(before, after);
    }
}
