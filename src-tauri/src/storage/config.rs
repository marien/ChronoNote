use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use ts_rs::TS;
use super::disk::{atomic_write, quarantine_corrupt_file};

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
    /// §393 (experimental): Peek docks to the bottom of its screen as a reserved strip; other windows (a maximized
    /// call) fill the rest. Desktop app on Windows only.
    pub dock_bottom: bool,
    /// Height of the docked strip, logical pixels. Its top edge can be dragged; the new height is remembered.
    pub dock_height: u32,
    /// Where Peek was last docked (the strip, physical pixels): docking goes back to that screen while it is there,
    /// like the floating window goes back to `geometry` (#187).
    pub dock_geometry: Option<PeekGeometry>,
}

pub const PEEK_MAX_LINES: u32 = 15;
pub const PEEK_DEFAULT_DOCK_HEIGHT: u32 = 220;
pub const PEEK_MIN_DOCK_HEIGHT: u32 = 60;
pub const PEEK_MAX_DOCK_HEIGHT: u32 = 1200;
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
            dock_bottom: false,
            dock_height: PEEK_DEFAULT_DOCK_HEIGHT,
            dock_geometry: None,
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
        self.dock_height = self.dock_height.clamp(PEEK_MIN_DOCK_HEIGHT, PEEK_MAX_DOCK_HEIGHT);
        self
    }
}

/// Bump when a migration is added; migrations run in `load_config_at`.
pub const CONFIG_SCHEMA_VERSION: u32 = 1;

/// Persisted app configuration. Lives outside the notes folder, in the
/// OS-appropriate app config directory (e.g. %APPDATA%\com.chrononote.app on
/// Windows, ~/.config/com.chrononote.app on Linux, ~/Library/Application
/// Support/com.chrononote.app on macOS) as `config.json`.
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub schema_version: u32,
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
    /// Spell check in the editor (D2). Off by default. `#[serde(default)]` gives
    /// `false` for a config written before this field existed.
    #[serde(default)]
    pub spell_check: bool,
    /// Spell check languages override (L1). None = not chosen yet.
    #[serde(default)]
    pub spell_languages: Option<Vec<String>>,
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
    /// Share of the window width occupied by the History pane when docked.
    #[serde(default = "default_pane_share")]
    pub history_pane_share: f32,
    /// Share of the window width occupied by the Actions pane when docked.
    #[serde(default = "default_pane_share")]
    pub actions_pane_share: f32,
    /// Whether to check the early-updates channel (§F1). Off by default.
    #[serde(default)]
    pub early_updates: bool,
    /// Phone companion: keep `.chrononote-mobile/outbox.json` (the meeting index a phone app reads) up to date.
    /// Off by default; only one laptop should have it on (docs/design/mobile-companion-design.md).
    #[serde(default)]
    pub phone_companion: bool,
    /// Whether Calendar sync adds new meetings automatically (§F1).
    /// On by default; old configs without this field load as true.
    #[serde(default = "default_true")]
    pub calendar_auto_add: bool,
    /// User's display name shown as the owner of their own actions when copying a meeting as minutes.
    /// Trimmed and capped at 60 characters on save; empty by default.
    #[serde(default)]
    pub minutes_name: String,
    #[serde(flatten)]
    #[ts(skip)]
    pub extra: serde_json::Map<String, serde_json::Value>,
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
    pub spell_check: Option<bool>,
    #[ts(optional)]
    pub spell_languages: Option<Vec<String>>,
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
    pub history_pane_share: Option<f32>,
    #[ts(optional)]
    pub actions_pane_share: Option<f32>,
    #[ts(optional)]
    pub pure_black: Option<bool>,
    #[ts(optional)]
    pub peek: Option<PeekConfig>,
    #[ts(optional)]
    pub last_seen_version: Option<String>,
    #[ts(optional)]
    pub onboarding_completed: Option<bool>,
    #[ts(optional)]
    pub early_updates: Option<bool>,
    #[ts(optional)]
    pub phone_companion: Option<bool>,
    #[ts(optional)]
    pub calendar_auto_add: Option<bool>,
    #[ts(optional)]
    pub minutes_name: Option<String>,
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
        if let Some(v) = self.spell_check {
            cfg.spell_check = v;
        }
        if let Some(v) = self.spell_languages {
            cfg.spell_languages = Some(v);
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
        if let Some(v) = self.history_pane_share {
            cfg.history_pane_share = v.clamp(0.18, 0.60);
        }
        if let Some(v) = self.actions_pane_share {
            cfg.actions_pane_share = v.clamp(0.18, 0.60);
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
        if let Some(v) = self.early_updates {
            cfg.early_updates = v;
        }
        if let Some(v) = self.phone_companion {
            cfg.phone_companion = v;
        }
        if let Some(v) = self.calendar_auto_add {
            cfg.calendar_auto_add = v;
        }
        if let Some(v) = self.minutes_name {
            cfg.minutes_name = clamp_minutes_name(&v);
        }
    }
}

fn clamp_minutes_name(name: &str) -> String {
    name.trim().chars().take(60).collect()
}

fn default_true() -> bool {
    true
}

fn default_pane_share() -> f32 {
    0.30
}

fn default_font_size() -> f32 {
    13.0
}

fn default_line_height() -> f32 {
    1.6
}

const MAX_RECENT_NOTES_DIRS: usize = 5;

pub(super) fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub(super) const SCRATCHPAD_DRAFTS_FILENAME: &str = ".scratchpads-drafts.json";

pub(super) fn scratchpad_drafts_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(SCRATCHPAD_DRAFTS_FILENAME))
}

pub(super) fn default_notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let doc_dir = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(doc_dir.join("Notes"))
}

pub(super) fn load_config_at(path: &Path, default_notes_dir: &Path) -> Result<AppConfig, String> {
    if path.exists() {
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        match serde_json::from_str::<AppConfig>(&raw) {
            Ok(mut cfg) => {
                if cfg.schema_version < 1 {
                    // nothing to migrate yet
                }
                if cfg.schema_version < CONFIG_SCHEMA_VERSION {
                    cfg.schema_version = CONFIG_SCHEMA_VERSION;
                }
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
        schema_version: CONFIG_SCHEMA_VERSION,
        notes_dir: default_notes_dir.to_string_lossy().to_string(),
        color_mode: ColorMode::default(),
        theme_mode: ThemeMode::default(),
        word_wrap: false,
        spell_check: false,
        spell_languages: None,
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
        history_pane_share: default_pane_share(),
        actions_pane_share: default_pane_share(),
        early_updates: false,
        phone_companion: false,
        calendar_auto_add: true,
        minutes_name: String::new(),
        extra: Default::default(),
    };
    save_config_at(path, &cfg)?;
    Ok(cfg)
}

pub(super) fn save_config_at(path: &Path, cfg: &AppConfig) -> Result<(), String> {
    let mut cfg = cfg.clone();
    cfg.minutes_name = clamp_minutes_name(&cfg.minutes_name);
    let raw = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

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
            schema_version: CONFIG_SCHEMA_VERSION,
            notes_dir: "/my/notes".to_string(),
            color_mode: ColorMode::Color,
            theme_mode: ThemeMode::Dark,
            word_wrap: true,
            spell_check: true,
            spell_languages: Some(vec!["nl-NL".to_string(), "en-US".to_string()]),
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
            history_pane_share: 0.35,
            actions_pane_share: 0.45,
            early_updates: false,
            phone_companion: false,
            calendar_auto_add: true,
            minutes_name: "Alice".to_string(),
            extra: Default::default(),
        };
        save_config_at(&path, &cfg).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.notes_dir, "/my/notes");
        assert_eq!(loaded.color_mode, ColorMode::Color);
        assert_eq!(loaded.theme_mode, ThemeMode::Dark);
        assert!(loaded.word_wrap);
        assert!(loaded.spell_check);
        assert_eq!(
            loaded.spell_languages,
            Some(vec!["nl-NL".to_string(), "en-US".to_string()])
        );
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
        assert_eq!(loaded.history_pane_share, 0.35);
        assert_eq!(loaded.actions_pane_share, 0.45);
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
                schema_version: CONFIG_SCHEMA_VERSION,
                notes_dir: "/n".to_string(),
                color_mode: ColorMode::default(),
                theme_mode: mode,
                word_wrap: false,
                spell_check: false,
                spell_languages: None,
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
                history_pane_share: default_pane_share(),
                actions_pane_share: default_pane_share(),
                early_updates: false,
                phone_companion: false,
                calendar_auto_add: true,
                minutes_name: String::new(),
                extra: Default::default(),
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
            dock_bottom: true,
            dock_height: 300,
            dock_geometry: Some(PeekGeometry { x: 0, y: 820, width: 1920, height: 220 }),
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
    fn phone_companion_is_off_by_default_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        assert!(!load_config_at(&path, dir.path()).unwrap().phone_companion);
        let mut cfg = load_config_at(&path, dir.path()).unwrap();
        ConfigPatch { phone_companion: Some(true), ..Default::default() }.apply(&mut cfg);
        save_config_at(&path, &cfg).unwrap();
        assert!(load_config_at(&path, dir.path()).unwrap().phone_companion);
    }

    #[test]
    fn calendar_auto_add_and_minutes_name_defaults_patch_and_truncate() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        let mut cfg = load_config_at(&path, dir.path()).unwrap();
        assert!(cfg.calendar_auto_add);
        assert_eq!(cfg.minutes_name, "");

        ConfigPatch {
            calendar_auto_add: Some(false),
            minutes_name: Some("  Marien  ".to_string()),
            ..Default::default()
        }
        .apply(&mut cfg);
        save_config_at(&path, &cfg).unwrap();
        let reloaded = load_config_at(&path, dir.path()).unwrap();
        assert!(!reloaded.calendar_auto_add);
        assert_eq!(reloaded.minutes_name, "Marien");

        let mut cfg_long = reloaded;
        let long_name = "a".repeat(80);
        ConfigPatch {
            minutes_name: Some(long_name),
            ..Default::default()
        }
        .apply(&mut cfg_long);
        save_config_at(&path, &cfg_long).unwrap();
        let reloaded_long = load_config_at(&path, dir.path()).unwrap();
        assert_eq!(reloaded_long.minutes_name.chars().count(), 60);
        assert_eq!(reloaded_long.minutes_name, "a".repeat(60));
    }

    #[test]
    fn early_updates_is_off_by_default_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        assert!(!load_config_at(&path, dir.path()).unwrap().early_updates);
        let mut cfg = load_config_at(&path, dir.path()).unwrap();
        cfg.early_updates = true;
        save_config_at(&path, &cfg).unwrap();
        assert!(load_config_at(&path, dir.path()).unwrap().early_updates);
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
        assert!(!loaded.spell_check);
        assert_eq!(loaded.spell_languages, None);
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
    fn config_patch_with_only_spell_check_changes_only_that_field() {
        let (before, after) = patched(r#"{"spellCheck": true}"#);
        let mut expected = before.clone();
        expected["spellCheck"] = serde_json::json!(true);
        assert_ne!(before, after);
        assert_eq!(after, expected);
    }

    #[test]
    fn config_without_spell_check_field_loads_with_default_false() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert!(!loaded.spell_check);
    }

    #[test]
    fn config_patch_with_only_spell_languages_changes_only_that_field() {
        let (before, after) = patched(r#"{"spellLanguages": ["nl-NL", "en-US"]}"#);
        let mut expected = before.clone();
        expected["spellLanguages"] = serde_json::json!(["nl-NL", "en-US"]);
        assert_ne!(before, after);
        assert_eq!(after, expected);
    }

    #[test]
    fn config_without_spell_languages_field_loads_with_default_none() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        let loaded = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(loaded.spell_languages, None);
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
    fn config_patch_with_only_early_updates_changes_only_that_field() {
        let (before, after) = patched(r#"{"earlyUpdates": true}"#);
        let mut expected = before.clone();
        expected["earlyUpdates"] = serde_json::json!(true);
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
    fn config_patch_clamps_pane_shares() {
        let (_, after) = patched(r#"{"historyPaneShare": 0.05, "actionsPaneShare": 0.95}"#);
        assert_eq!(after["historyPaneShare"].as_f64().unwrap() as f32, 0.18_f32);
        assert_eq!(after["actionsPaneShare"].as_f64().unwrap() as f32, 0.60_f32);
    }

    #[test]
    fn empty_config_patch_changes_nothing() {
        let (before, after) = patched("{}");
        assert_eq!(before, after);
    }

    #[test]
    fn config_json_with_unknown_key_preserves_it_on_save() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(
            &path,
            r#"{"notesDir":"/n","futureSetting":{"a":1}}"#,
        )
        .unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.schema_version, CONFIG_SCHEMA_VERSION);
        save_config_at(&path, &cfg).unwrap();
        let on_disk = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(parsed["futureSetting"]["a"], 1);
    }

    #[test]
    fn config_with_higher_schema_version_is_preserved() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(
            &path,
            r#"{"notesDir":"/n","schemaVersion":99}"#,
        )
        .unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.schema_version, 99);
        save_config_at(&path, &cfg).unwrap();
        let on_disk = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&on_disk).unwrap();
        assert_eq!(parsed["schemaVersion"], 99);
    }

    #[test]
    fn config_without_schema_version_loads_with_current_constant() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/n"}"#).unwrap();
        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.schema_version, CONFIG_SCHEMA_VERSION);
    }

    // --- upgrade fixtures (B4) ---

    #[test]
    fn upgrade_fixture_v0_20_0_config_roundtrips_without_data_loss() {
        let raw = include_str!("../../tests/fixtures/v0.20.0/config.json");
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, raw).unwrap();

        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();

        // Every value from the v0.20.0 fixture came through
        assert_eq!(cfg.notes_dir, "/test/fixtures/notes");
        assert_eq!(cfg.color_mode, ColorMode::Grayscale);
        assert_eq!(cfg.theme_mode, ThemeMode::Dark);
        assert!(cfg.word_wrap);
        assert!(cfg.readable_line_length);
        assert_eq!(
            cfg.recent_notes_dirs,
            vec!["/test/fixtures/notes-old", "/test/fixtures/notes-archive"]
        );
        assert!(!cfg.auto_check_updates);
        assert_eq!(cfg.last_seen_version.as_deref(), Some("0.20.0"));
        assert!(cfg.calendar_sync_enabled);
        assert_eq!(cfg.font_size, 14.5);
        assert_eq!(cfg.line_height, 1.7);
        assert!(cfg.pure_black);
        assert_eq!(cfg.language_mode, LanguageMode::Nl);
        assert!(cfg.onboarding_completed);

        // Later fields defaulted safely
        assert_eq!(cfg.schema_version, CONFIG_SCHEMA_VERSION);
        assert_eq!(cfg.startup_tab_mode, StartupTabMode::Today);
        assert!(!cfg.occurrence_hint);
        assert!(cfg.status_bar_visible);
        assert_eq!(cfg.tab_label_style, TabLabelStyle::Iso);
        assert!(!cfg.early_updates);
        assert!(!cfg.spell_check);
        assert_eq!(cfg.spell_languages, None);

        save_config_at(&path, &cfg).unwrap();

        // No key from the fixture was dropped
        let saved_str = fs::read_to_string(&path).unwrap();
        let orig: serde_json::Map<String, serde_json::Value> = serde_json::from_str(raw).unwrap();
        let saved: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&saved_str).unwrap();
        for (k, _) in &orig {
            assert!(saved.contains_key(k), "key {k} was dropped after save");
        }
    }

    #[test]
    fn upgrade_fixture_v0_25_0_config_roundtrips_without_data_loss() {
        let raw = include_str!("../../tests/fixtures/v0.25.0/config.json");
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, raw).unwrap();

        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();

        // Values from v0.25.0 fixture came through
        assert_eq!(cfg.notes_dir, "/test/fixtures/notes");
        assert_eq!(cfg.color_mode, ColorMode::Grayscale);
        assert_eq!(cfg.theme_mode, ThemeMode::Dark);
        assert!(cfg.word_wrap);
        assert!(cfg.readable_line_length);
        assert_eq!(
            cfg.recent_notes_dirs,
            vec!["/test/fixtures/notes-old", "/test/fixtures/notes-archive"]
        );
        assert!(!cfg.auto_check_updates);
        assert_eq!(cfg.last_seen_version.as_deref(), Some("0.25.0"));
        assert!(cfg.calendar_sync_enabled);
        assert_eq!(cfg.font_size, 14.5);
        assert_eq!(cfg.line_height, 1.7);
        assert!(cfg.pure_black);
        assert_eq!(cfg.language_mode, LanguageMode::Nl);
        assert!(cfg.onboarding_completed);
        assert_eq!(cfg.startup_tab_mode, StartupTabMode::SmartLastActive);
        assert!(cfg.occurrence_hint);
        assert!(!cfg.spell_check);
        assert_eq!(cfg.spell_languages, None);

        // Peek settings came through, with documented migration (shortcut dropped, defaultsVersion bumped)
        assert_eq!(cfg.peek.lines, 5);
        assert_eq!(cfg.peek.opacity, 60);
        assert!(!cfg.peek.always_on_top);
        assert_eq!(cfg.peek.header, PeekHeader::Hover);
        assert!(cfg.peek.use_lines_height);
        assert_eq!(cfg.peek.call_shortcut, "CommandOrControl+Alt+J");
        assert_eq!(cfg.peek.defaults_version, PEEK_DEFAULTS_VERSION);
        assert_eq!(
            cfg.peek.geometry,
            Some(PeekGeometry {
                x: 100,
                y: 150,
                width: 500,
                height: 280
            })
        );

        save_config_at(&path, &cfg).unwrap();

        // No top-level key from the fixture was dropped
        let saved_str = fs::read_to_string(&path).unwrap();
        let orig: serde_json::Map<String, serde_json::Value> = serde_json::from_str(raw).unwrap();
        let saved: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&saved_str).unwrap();
        for (k, _) in &orig {
            assert!(saved.contains_key(k), "key {k} was dropped after save");
        }
    }

    #[test]
    fn upgrade_fixture_v0_30_0_config_roundtrips_without_data_loss() {
        let raw = include_str!("../../tests/fixtures/v0.30.0/config.json");
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, raw).unwrap();

        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();

        assert_eq!(cfg.notes_dir, "/test/fixtures/notes");
        assert_eq!(cfg.color_mode, ColorMode::Grayscale);
        assert_eq!(cfg.theme_mode, ThemeMode::Dark);
        assert!(cfg.word_wrap);
        assert!(cfg.readable_line_length);
        assert_eq!(
            cfg.recent_notes_dirs,
            vec!["/test/fixtures/notes-old", "/test/fixtures/notes-archive"]
        );
        assert!(!cfg.auto_check_updates);
        assert_eq!(cfg.last_seen_version.as_deref(), Some("0.30.0"));
        assert!(cfg.calendar_sync_enabled);
        assert_eq!(cfg.font_size, 14.5);
        assert_eq!(cfg.line_height, 1.7);
        assert!(cfg.pure_black);
        assert_eq!(cfg.language_mode, LanguageMode::Nl);
        assert!(cfg.onboarding_completed);
        assert_eq!(cfg.startup_tab_mode, StartupTabMode::SmartLastActive);
        assert!(cfg.occurrence_hint);
        assert!(!cfg.status_bar_visible);
        assert_eq!(cfg.tab_label_style, TabLabelStyle::Friendly);
        assert_eq!(cfg.history_pane_share, 0.35);
        assert_eq!(cfg.actions_pane_share, 0.25);
        assert!(!cfg.spell_check);
        assert_eq!(cfg.spell_languages, None);

        // Peek settings
        assert_eq!(cfg.peek.lines, 5);
        assert_eq!(cfg.peek.opacity, 40);
        assert_eq!(cfg.peek.opacity_hover, 90);
        assert_eq!(cfg.peek.fade_seconds, 4);
        assert!(!cfg.peek.always_on_top);
        assert_eq!(cfg.peek.header, PeekHeader::Hover);
        assert!(cfg.peek.use_lines_height);
        assert_eq!(cfg.peek.call_shortcut, "CommandOrControl+Alt+J");
        assert_eq!(cfg.peek.defaults_version, 5);
        assert_eq!(
            cfg.peek.geometry,
            Some(PeekGeometry {
                x: 120,
                y: 180,
                width: 520,
                height: 300
            })
        );

        save_config_at(&path, &cfg).unwrap();

        // No key from the fixture was dropped
        let saved_str = fs::read_to_string(&path).unwrap();
        let orig: serde_json::Map<String, serde_json::Value> = serde_json::from_str(raw).unwrap();
        let saved: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&saved_str).unwrap();
        for (k, _) in &orig {
            assert!(saved.contains_key(k), "key {k} was dropped after save");
        }
    }

    #[test]
    fn upgrade_fixture_legacy_color_mode_migrates_to_color() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"notesDir":"/test/notes","colorMode":"legacy"}"#).unwrap();

        let cfg = load_config_at(&path, &dir.path().join("Notes")).unwrap();
        assert_eq!(cfg.color_mode, ColorMode::Color);
    }
}
