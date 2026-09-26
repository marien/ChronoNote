# Multilanguage support (desktop + web app) — design

Origin: Marien's brief (2026-09-25) — *"Make a design for multilanguage
support for the desktop app and webapp. I want to be able support English,
Dutch and German to start with. Ideally the language is following the
system settings by default with a configuration option to override. Other
translations to follow later. Shortcuts stay the same across languages to
support people that work in different languages across different
devices."*

Status: **Shipped as v0.15.0 (§219–§242 in `docs/CHANGELOG.md`).** Phase 1
and Phase 2 are both complete — every Svelte component, every `.ts`
toast/message call site, all three deferred rich-text cases (§240, §242),
and the small set of Rust-authored error sentences all read from the
dictionary. `nl.ts`/`de.ts` shipped without a native-speaker review pass —
Marien's own call ("the translations look good enough") rather than the
review this doc originally called for; revisit if real usage surfaces
translation-quality issues. Phase 3 (the marketing website) remains out
of scope, not started, not designed. Fifteen batches swept
every `.svelte` file in the app (confirmed by listing all 26 and checking
the 3 untouched ones have no hardcoded strings at all); two further
batches (§234–§235) swept every remaining `showToast(...)` call site
across `.ts` modules, confirmed complete by an exhaustive final grep
across `src/lib/**/*.ts`. Two places use `Intl` instead of hand-translated
arrays/fragments: `date.ts`'s `monthName`/`weekdayAbbrev` (§227) and
`SyncHealthPopover`'s relative-time formatting via `Intl.
RelativeTimeFormat` (§231) — both verified against real output for all
three languages before wiring in. Non-component translation sites use
`get(t)(...)` (plain `.ts` modules) or a bare `$t(...)` read directly in
a template expression/event handler (Svelte components) — a real
distinction, not interchangeable: `$t` inside a plain function *body*
needs a reactivity fix (§225/§231) if that function is called from a
template expression, but needs none at all inside a click handler or
written straight into a template expression itself (§232, §235's
`UPDATE_AVAILABLE_TOAST_KEY` fix).

**What's left before any of this can ship**: a native-speaker review pass
on `nl.ts`/`de.ts` (Marien for Dutch, a separate German reviewer — not
something I can do myself). See below for how Phase 2 unfolded.

**Phase 2 started, first slice done (§236 in `docs/CHANGELOG.md`).** New
`src-tauri/src/error.rs`: `AppError`, a `#[serde(tag = "code")]` enum for
the small, deliberately slow-growing set of error conditions Rust
authors itself as *fixed* sentences (no interpolated raw text forming
the message's actual identity) — `impl From<String> for AppError` means
every existing `.map_err(|e| e.to_string())`/`?`-chain still converts
automatically at whichever boundary now returns `AppError`, so this
never required touching the vast majority of fallible code. New
`src/lib/apiError.ts`'s `describeApiError(e)` is the frontend's one
place that turns that shape into display text, falling back to the
pre-Phase-2 `instanceof Error`/`String(e)` behavior for anything not
shaped like an `AppError` (every call site not yet touched). Two codes
done so far: `AgendaInvalid` (`agenda.rs`'s one hardcoded sentence) and
`OneDriveSyncBusy` (unifying two previously-separate hand-written
busy-guard strings into one shared code/message). A real, previously-
invisible bug came out of this: on the real desktop app a Tauri
command's `Err(String)` rejects with a plain string, never an `Error`
instance, so `e instanceof Error` checks guarding a detailed fallback
message were **always false in production** — only ever true against
the mock's own `new Error(...)` throws — meaning some "detailed" error
text was silently replaced by a generic one on every real install until
now. Both the web app's own parallel TypeScript sync engine
(`webOneDriveSync.ts`) and its `.agenda.json` reader (`webBackend.ts`)
mirror both codes too, since `OneDriveSyncResult` is a *shared* type —
this wasn't optional, a stray plain string there is a `svelte-check`
type error now.

**Second slice done too (§237): the OneDrive sign-in flow's 13 fixed
sentences.** All of `onedrive::auth::exchange_code` (token request/
rejection/unparseable-response/missing-refresh-token-scope) and
`onedrive::sync`'s three login functions (loopback bind/browser-open/
callback-accept failures, auth timeout, no-auth-code, no-pending-
session, keychain/auth-state-save failures, profile-fetch failure) now
have real codes; `OneDriveLoginResult.error` is `Option<AppError>`.
`refresh_access_token` (background-sync token refresh, never surfaced
through `OneDriveLoginResult`) deliberately keeps a plain `String` —
its failures were always folding into `Other` regardless.
`webOneDriveAuth.ts::exchangeCode` throws these same codes directly
(not wrapped in `Error`) to mirror `auth.rs` variant-for-variant, via a
new shared `apiError.ts::toAppError(e)` that passes an already-coded
throw through unchanged. Two web-only edge cases (an OAuth `state`
mismatch, a missing PKCE session) were handled without inventing
web-only codes — one stays generic `Other`, the other reuses desktop's
`oneDriveNoPendingSession` since the underlying condition is identical.
**A second instance of the exact same previously-invisible bug from the
first slice**, found the same way (giving a field a real type turned
every remaining plain-string read into a `svelte-check` error):
`SettingsModal.svelte`'s manual OAuth-paste fallback had the identical
`instanceof Error` pattern. **A pre-existing, unrelated gap surfaced but
deliberately not fixed**: `SettingsModal.svelte`'s whole OneDrive/
Calendar section ("Connect Microsoft Account", "Connecting…", etc.) was
never translated at all in Phase 1's component sweep — flagged for its
own future pass, not folded into this error-code-focused batch.

**Third slice done (§238): `FolderSwitchResult`'s composed sentence
becomes structured data.** The last deferred item — `prepare_folder_
switch`'s "Couldn't sync {folder} before switching ({why}). Nothing was
changed." — is gone as a pre-composed English sentence. New `onedrive::
FolderSwitchBlocked` (`#[serde(tag = "reason")]`, two variants:
`SyncFailed { folder_path, detail: Option<AppError> }` / `HeldConflicts
{ folder_path, count }`) replaces `FolderSwitchResult.message: Option
<String>`; Rust reports *which* condition applies and the raw data, the
frontend (`apiError.ts::describeFolderSwitchBlocked`) composes and
translates the sentence, with the held-conflicts count now genuinely
pluralized in all three languages — something `format!("{held} note(s)
have...")` could never get right in Dutch/German. **A real serde gotcha
caught by new tests**: `rename_all` on an enum renames variant tags, not
each variant's own field names — every other tagged enum here happened
to use single-word fields, so this had no way to surface before.
`webOneDriveSync.ts`'s own duplicate composed-sentence logic was deleted
and replaced with the same shared, ts-rs-generated `FolderSwitchBlocked`
shape (its local `FolderSwitchResult` interface duplicate was deleted
too, in favor of importing the real one from `../types`).

**Fourth slice done (§239): the rest of `SettingsModal.svelte` — the
newly-surfaced gap from §237 is now closed.** ~100 new keys cover the
whole OneDrive Cloud Sync UI, Calendar, Notes Location, Data, and
Updates tabs, plus bits of Appearance (glyphs, pure black) and the tab
labels themselves that batch 1 (§219) had missed entirely. Heavy reuse
of `about.*` keys for the Updates tab (mirrors `AboutModal`'s own
update-status block field for field, per #64) surfaced a genuine gap in
`AboutModal.svelte` itself too — its "Download & install" button was
still hardcoded, missed by §225's original sweep — fixed there as well.
A translated-tab-label-collides-with-translated-section-label regression
in `i18n-locales.spec.ts` was caught by the full suite and fixed by
scoping those assertions to `.settings-section-label`.

**Phase 2 is now feature-complete** for the OneDrive/agenda/sign-in error
surface, and the Settings modal is fully translated — every `.svelte`
component (Phase 1) and every user-facing error/toast/settings string
this project intends to translate now reads from the dictionary. Every
other fallible operation (`std::io::Error`, network/Graph-API responses)
stays permanently untranslated raw diagnostic text by design, not as an
interim gap — see `error.rs`'s doc comment for why. **What's left before
any of this can ship**: the `nl.ts`/`de.ts` native-speaker review pass
(Marien for Dutch, a separate reviewer for German — not something I can
do myself) and Phase 3 (website translation — not started, not designed,
a different-shaped problem per this doc's own Non-goals section).

Two reusable lessons accumulated so far, worth checking before any
future batch:
1. **Logic-vs-display coupling** — before translating any value also
   compared for CSS/behavior logic (a `group` field, a status string),
   check every comparison site first (`SHORTCUT_LABEL_KEYS`/
   `COMMAND_PALETTE_GROUP_KEYS` are the two examples so far).
2. **Off-screen measurement clones** — a translated icon-label that also
   has a hidden width-measurement clone (§161-style) must reuse the
   exact same key at every occurrence, or the measured width drifts from
   what's actually on screen once the string length differs from
   English.
3. **A plain helper function's own `$t` reference doesn't make its
   caller reactive** — Svelte only tracks `$store` references written
   directly in a template expression or a `$:` block. Two fixes, pick
   whichever fits: move the logic into a `$:` block (`AboutModal.svelte`'s
   `agoText`), or pass `$t`/`$locale` in as explicit arguments at the
   template call site (`SyncHealthPopover.svelte`'s `formatRelativeTime`)
   if the function is a pure formatter with no other reason to become
   component state.
4. **Prefer `Intl` over a hand-translated array/fragment set whenever
   the content is inherently locale-shaped** — month/weekday names
   (`date.ts`) and relative-time phrases (`SyncHealthPopover.svelte`)
   both moved to `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat`, cutting
   translation surface and getting correct grammar for free. Verify
   against real `Intl` output for all three languages before wiring it
   in, the same way both of these were. The
`LanguageMode` plumbing, the `src/lib/i18n/` mechanism, and five real UI
surfaces are done: Settings (§219, plus its own modal title/aria-label
retroactively fixed in §222), the Shortcuts & Symbols drawer (§220), the
Action Drawer (§221), Section History including its `history.ts`
destination labels (§222 — the first translation key computed outside a
Svelte component, via `get(t)(...)`), and the Command Palette (§223 —
the same outside-a-component pattern reused twice more, plus a
display-vs-logic split for `PaletteItem.group`, mirroring `shortcuts.ts`'s
`SHORTCUT_LABEL_KEYS`). Several `common.*`/cross-batch reuse keys exist
now (`common.closeDialog`, `common.loading`, `settings.modal.title`,
several `shortcuts.*` labels) found by checking for cross-modal reuse
rather than assuming each surface's strings were unique — §223 alone
reused seven keys from earlier batches instead of duplicating identical
text. The mechanical sweep continues a few components at a time —
remaining: ~21 Svelte components, ~55 toast messages, TopBar/StatusBar/
About's own separately-hardcoded tooltip strings (confirmed in §220 to
not route through `shortcuts.ts` the way its header comment claimed).
Two strings in the Shortcuts drawer ("Delegated", the section-headers
hint) are deliberately left English — they weave `<kbd>` examples
mid-sentence, which needs either `{@html}` (not used anywhere else in
this codebase) or a richer schema, punted to a dedicated later pass
rather than decided in passing.

**A second reusable lesson from §223, alongside §222's aria-label/
Playwright gotcha:** before translating any list/grid whose *category*
values double as CSS-styling or logic keys (like `PaletteItem.group`
here), check every comparison site first — translating the value itself
would silently break that logic under a non-English language. Keep the
internal value untranslated and add a display-only lookup map instead
(`SHORTCUT_LABEL_KEYS` and `COMMAND_PALETTE_GROUP_KEYS` are the two
examples so far).

**A real testing gotcha, worth knowing before translating the next
modal's own dialog `aria-label`:** `tests/e2e/helpers.ts`'s
`MODAL_LABELS`/`modalCard()` locate every modal in the whole suite by
its *English* aria-label. Every ordinary spec is unaffected (they all
run under English), but this project's own `i18n-locales.spec.ts`
deliberately seeds other languages — translating a modal's dialog
`aria-label` (not just its content) means that spec needs a
locale-independent way to find it too (a stable CSS class, e.g.
`.history-modal-card`), or it silently breaks the moment that modal's
turn comes up in the sweep. Not yet released (no version bump);
`nl.ts`/`de.ts` need a native/fluent review pass before that happens
(see "Translation content" below).

---

## Goals

- English, Dutch, German at launch; the mechanism must make adding a 4th+
  language later a pure content addition, not a rework.
- Default: follow the OS/browser language. Override: an explicit Settings
  choice, persisted, that beats the system default.
- Keyboard shortcuts are **already** language-independent (see below) —
  this is a design constraint to preserve, not a gap to close.
- Cover both build targets that are actually "the app": the desktop Tauri
  shell and the browser-storage web app. They already share one Svelte
  frontend behind a typed backend interface (`TauriCommands`), so this is
  naturally one piece of work, not two.

## Non-goals (this doc)

- **The marketing website** (`website/index.html`, `guide.html`,
  `demo.html`) is separate static HTML with its own hand-ported CSS
  variables and no build step shared with the app (`website/README.md`).
  Translating it is a legitimate future ask but a different shaped project
  (no Svelte components, no store, nothing to hang a `locale` on without
  inventing a second mechanism) — flagged as a decision for later, not
  designed here.
- **Rust-originated error text.** Some backend commands return
  `Result<T, String>` with a hardcoded English message, and a few frontend
  call sites surface that string verbatim in a toast (e.g.
  `calendarSyncActions.ts`: `e.message` on a read failure). Translating
  those means changing the error *shape* (a code, not a string) across
  every Tauri command and both mocks — a real, separable piece of work.
  Phase 1 below ships with those specific error paths still in English;
  Phase 2 (not started) covers the rest.
- **The literal token vocabulary** (`# `, `v `, `> `, `x `, `- `/`* `,
  `=> `, `! `). These are ASCII bytes in a plain-text file format, not
  natural-language words — translating them would silently break the
  "the file on disk is portable plain text" contract this app is built
  on. Only their *explanations* (Shortcuts & Symbols drawer, glyph
  tooltips) are natural-language UI text and are in scope.

## Why keyboard shortcuts are already safe

`shortcuts.ts` binds every combo by `KeyboardEvent.code` (the physical key)
plus `mod`/`shift`/`alt` flags — never by the character a key produces:

```ts
export interface ComboSpec {
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  code: string;              // physical key, not the shifted/localized character
  platforms?: ("mac" | "other")[];
}
```

`App.svelte`'s dispatcher matches against `event.code`, so `Ctrl+Shift+H`
fires from the same physical keys regardless of the OS's configured
*keyboard layout* (already true today across US/UK/AZERTY/QWERTZ, per the
existing platform-aware — Mac vs. Win/Linux — design) and, by the same
mechanism, regardless of the *display language* this doc adds. The only
thing that changes per-language is `ShortcutDef.label` — the description
string shown in the Shortcuts & Symbols drawer, in the command palette
hint text, and in tooltips. That's a translatable string like any other;
the combo it describes never moves. Nothing else needs to change here —
this requirement is already met by the existing architecture and this doc
just needs to not regress it (i.e. `label` gets translated, `combos`
never does).

## Architecture

### The AppConfig pattern this reuses wholesale

`theme_mode`/`color_mode` already establish the exact shape needed: a
Rust enum with a `System`-like default, a persisted `AppConfig` field, a
`set_*` command, and four synchronized frontend surfaces (the real Tauri
bridge, the Playwright mock, the web app's IndexedDB-backed config, and
the Svelte store). Language follows the identical pattern — nothing new
to invent at the plumbing layer, only new files at the content layer.

**Rust (`src-tauri/src/storage.rs`):**

```rust
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, TS, Default)]
#[serde(rename_all = "camelCase")]
pub enum LanguageMode {
    En,
    Nl,
    De,
    #[default]
    System,
}
```

```rust
// AppConfig, alongside theme_mode:
/// UI display language. `System` (default) means "no override" — the
/// frontend resolves it from the browser/webview's own reported
/// language, exactly like `ThemeMode::System` defers to
/// `prefers-color-scheme`. `#[serde(default)]` gives `System` for every
/// config written before this field existed.
#[serde(default)]
pub language_mode: LanguageMode,
```

```rust
// lib.rs, alongside set_theme_mode:
#[tauri::command]
fn set_language_mode(app: AppHandle, mode: storage::LanguageMode) -> Result<storage::AppConfig, String> {
    let mut cfg = storage::load_config(&app)?;
    cfg.language_mode = mode;
    storage::save_config(&app, &cfg)?;
    Ok(cfg)
}
```

`#[derive(TS)]` means the existing `ts-rs` codegen step
(`src/lib/generated/tauri-types.ts`) picks up `LanguageMode` automatically
— no separate TypeScript type to hand-maintain, same as every other
config enum today.

**Frontend wiring** (mirrors `themeMode` exactly across all four
surfaces — `tauriApi.ts`, `tauriCommands.ts`, `testing/mockBackend.ts`,
`webapp/webBackend.ts` — each gets a `language_mode`/`setLanguageMode`
entry alongside their existing `theme_mode`/`set_theme_mode` one):

```ts
// stores.ts
export const languageMode = writable<LanguageMode>("system");

// resolves "system" -> a real supported locale using the browser's own
// reported language; an explicit override always wins.
export const locale = derived([languageMode, systemLocale], ([$mode, $sys]) =>
  $mode === "system" ? $sys : $mode,
);
```

`systemLocale` is detected once at boot from `navigator.language` /
`navigator.languages` (see below) and doesn't change while the app is
running — Tauri's WebView2/WKWebView/webkit2gtk webview and every real
browser already report the OS/browser-configured language through it, so
no extra Tauri plugin or OS permission is needed for either build target.
If that ever proves unreliable on some platform, `tauri-plugin-os`'s
`locale()` command is the documented, purpose-built fallback — not needed
to start.

```ts
function detectSystemLocale(): SupportedLocale {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0]; // "nl-NL" -> "nl"
    if (SUPPORTED_LOCALES.includes(base as SupportedLocale)) return base as SupportedLocale;
  }
  return "en";
}
```

### Dictionary shape: hand-rolled, not a library

Recommendation: **no new runtime dependency.** A few hundred short UI
strings across 3 languages is small (well under the size of one already-
vendored icon set), and this project consistently hand-rolls its own UI
infrastructure rather than reaching for a library where a plain
TypeScript module does the job just as well (the command palette, the
`Segmented` control, the Shortcuts drawer, the whole mock-backend test
harness). A library like `svelte-i18n` or `typesafe-i18n` would add build
tooling (extraction CLIs, `.po`/`.json` loaders, sometimes a Vite plugin)
for a problem this size doesn't need solved generically. The one thing
worth borrowing from that world — compile-time completeness checking — is
available for free from TypeScript itself:

```ts
// src/lib/i18n/schema.ts
export type TranslationParams = {
  "common.cancel": undefined;
  "common.close": undefined;
  "settings.appearance.theme.label": undefined;
  "history.linesSelected": { n: number };
  "updates.updatedToVersion": { version: string };
  // ...one entry per translatable string, grouped by feature area
};

export type TranslationKey = keyof TranslationParams;
type Dictionary = { [K in TranslationKey]: (params: TranslationParams[K]) => string };
```

```ts
// src/lib/i18n/locales/en.ts — the canonical source of truth
export const en: Dictionary = {
  "common.cancel": () => "Cancel",
  "common.close": () => "Close",
  "settings.appearance.theme.label": () => "Theme",
  "history.linesSelected": ({ n }) => (n === 1 ? "1 line selected" : `${n} lines selected`),
  "updates.updatedToVersion": ({ version }) => `Updated to v${version}`,
} satisfies Dictionary;
```

```ts
// src/lib/i18n/locales/nl.ts / de.ts — same `satisfies Dictionary`
export const nl: Dictionary = {
  "common.cancel": () => "Annuleren",
  "common.close": () => "Sluiten",
  "settings.appearance.theme.label": () => "Thema",
  "history.linesSelected": ({ n }) => (n === 1 ? "1 regel geselecteerd" : `${n} regels geselecteerd`),
  "updates.updatedToVersion": ({ version }) => `Bijgewerkt naar v${version}`,
} satisfies Dictionary;
```

Because `nl`/`de` both have to satisfy the exact same `Dictionary` type
`en` does, **`svelte-check` fails the moment a key is missing or a
param shape drifts** in any locale file — for the initial three languages
that's the right bar (Marien is authoring/reviewing all three, so 100%
coverage is the expectation, not partial-with-fallback). A future
community-contributed 4th language can loosen this to `Partial<Dictionary>`
with an English-fallback lookup — a one-line change to the lookup
function, not a redesign — but nothing here needs to build that yet.

English/Dutch/German all use simple singular/plural (no CLDR "few/many"
categories like Polish or Arabic need), so a plain `n === 1 ? ... : ...`
inside the dictionary function is enough — no pluralization library
needed either.

```ts
// src/lib/i18n/index.ts
export const t = derived(locale, ($locale) => {
  const dict = DICTIONARIES[$locale];
  return <K extends TranslationKey>(key: K, params: TranslationParams[K]) => dict[key](params);
});
```

Used in a Svelte template exactly like the app's other stores:

```svelte
<span class="settings-inline-label">{$t("settings.appearance.theme.label")}</span>
```

`t` being a **store** (not a plain function) is what makes this reactive
— a component that reads `$t(...)` in its template automatically
subscribes to `locale` and re-renders when the language changes, the same
mechanism `$themeMode`/`$colorMode` already rely on. This fits the
existing codebase idiom directly (Svelte 5 here still uses
`writable`/`derived` stores for cross-cutting app state, not a rune
rewrite) — no migration needed to adopt it.

### Locale-aware dates instead of hand-translated arrays

`date.ts` currently hardcodes English month names, and
`DatePickerModal.svelte` hardcodes English weekday abbreviations:

```ts
// date.ts — today
export const MONTH_NAMES = ["January", "February", ..., "December"];
```
```ts
// DatePickerModal.svelte — today
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
```

Both should switch to `Intl.DateTimeFormat($locale, {...}).format(date)`
rather than gaining Dutch/German translated arrays by hand — it's less
translation surface, gets grammatically correct forms for free (some
languages need different month-name forms depending on context, which a
flat array can't express), and needs zero maintenance when a new locale
is added later:

```ts
export function monthName(locale: SupportedLocale, month: number): string {
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, month, 1));
}
export function weekdayAbbrev(locale: SupportedLocale, weekdayIndex0Sunday: number): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(/* a date on that weekday */);
}
```

## Settings UI

Mirrors the existing Theme control exactly (`SettingsModal.svelte`,
Appearance & Editor tab, right under Theme) — a `Segmented` control whose
options are **labelled in their own language**, the standard convention
for a language picker (so someone who ends up on the wrong language can
still find their way back without reading English):

```svelte
<div class="settings-toggle-row" style="margin-top: 12px;">
  <span class="settings-inline-label">{$t("settings.appearance.language.label")}</span>
  <Segmented
    options={[
      { value: "system", label: "System" },
      { value: "en", label: "English" },
      { value: "nl", label: "Nederlands" },
      { value: "de", label: "Deutsch" },
    ]}
    value={$languageMode}
    onChange={(v) => controller.setLanguageMode(v as LanguageMode)}
  />
</div>
<div class="settings-hint">{$t("settings.appearance.language.hint")}</div>
```

Available identically on desktop and web (both already render this exact
tab; nothing here is `backendKind`-gated).

One more small, real win from having a resolved `locale`: set
`document.documentElement.lang` on boot and on every change (`boot.ts`,
alongside `applyThemeModeToDom`) — a genuine accessibility/correctness
fix (screen readers and the browser's own spell-checker pick the right
language) that costs one line and falls straight out of this design.

## Scope inventory — where translatable text actually lives

| Area | Files | Notes |
| --- | --- | --- |
| Svelte component templates | 26 files under `src/lib/components/` (Settings, Shortcuts, History, Action Drawer, Command Palette, Search, Sync Review/Conflicts, Date Picker, Status Bar, Top Bar, About, Migrate/Drop-notes/Unsaved-scratchpad dialogs, …) | The bulk of the work — buttons, headings, tooltips, placeholders, `aria-label`s |
| Shortcut descriptions | `shortcuts.ts` (`label` field only — ~20 entries) | `combos` never touched (see above) |
| Toast messages | `actions.ts`, `boot.ts`, `calendarSyncActions.ts`, `exportImport.ts`, `updates.ts`, and others — ~55 `showToast(...)` call sites | A handful pass through a Rust-originated `err.message` — see Non-goals |
| Command palette entries | `commandPalette.ts` | Command names/descriptions |
| Date formatting | `date.ts` (`MONTH_NAMES`), `DatePickerModal.svelte` (`WEEKDAYS`) | Switch to `Intl.DateTimeFormat`, not translated arrays |
| Glyph/token *explanations* | Shortcuts & Symbols drawer's legend text | The tokens themselves (`# `, `v `, …) stay literal — see Non-goals |
| Website | `website/*.html` | Explicitly out of scope for this doc |

Rough sizing: several hundred distinct short strings, concentrated most
heavily in `SettingsModal.svelte`, `ShortcutsModal.svelte`,
`HistoryModal.svelte`, `ActionDrawerModal.svelte`, and
`CommandPaletteModal.svelte` — the app's five most text-dense surfaces.

## Testing & enforcement

- **Vitest**: a dictionary-completeness test as defense in depth beyond
  the TypeScript `satisfies` check (catches the case where a future
  refactor loosens the type):
  ```ts
  test("en/nl/de dictionaries have identical key sets", () => {
    const keys = (d: Dictionary) => Object.keys(d).sort();
    expect(keys(nl)).toEqual(keys(en));
    expect(keys(de)).toEqual(keys(en));
  });
  ```
- **`svelte-check`** is the primary gate — a missing/mistyped key in any
  locale file is a real type error, same as a mock command mismatch is
  today for `tauriCommands.ts`.
- **Playwright**: extend `seedApp`'s mock seed with a `languageMode`
  field (mirroring how `colorMode`/`themeMode` are already seedable), and
  add a small smoke-test spec that loads each of the 3 languages and
  asserts a handful of known strings render in the right language, *and*
  that a shortcut (e.g. `Ctrl+Shift+H`) still opens the right drawer
  regardless of language — turning "shortcuts stay the same across
  languages" from a design claim into something CI actually checks.

## Phased plan

1. **Phase 1 (this doc's scope):** i18n infrastructure
   (`src/lib/i18n/`), `LanguageMode` end-to-end plumbing (Rust + all four
   frontend surfaces), the Settings UI control, `document.lang` wiring,
   `Intl`-based date formatting, and full English/Dutch/German coverage
   of every Svelte component + shortcut label + command-palette entry +
   frontend-authored toast. Ships as a real, testable feature on both
   build targets.
2. **Phase 2 (not started, separable):** Rust command errors move from
   `Result<T, String>` to `Result<T, ErrorCode>` for the handful of paths
   that currently leak an English message into a toast, so those are
   translated too. Touches every affected command plus both mocks —
   worth its own review pass rather than folding into Phase 1.
3. **Phase 3 (not started, needs a decision, not designed here):**
   whether/how to translate the marketing website. Different shape of
   problem (static HTML, no shared build step) — a separate brief if
   wanted.

## Translation content

For the initial three languages, Claude can draft `nl.ts`/`de.ts` from
the English source directly during implementation. Both should get a
native/fluent read-through before shipping — Marien can review the Dutch
file directly; the German file will need a separate native-or-fluent
reviewer for tone/register, since a machine-drafted translation of UI
copy reads noticeably stiffer than one written by a speaker. Flagging
this now rather than assuming a first draft ships as final.

## Judgment calls made here (flagging, not silently deciding)

1. **Hand-rolled dictionaries over an i18n library** — recommended for
   fit with this project's existing style and the small string count;
   revisit if the string count grows enormously or a 4th/5th language
   with real plural-category complexity (e.g. Polish, Arabic) gets added.
2. **`navigator.language` for system-locale detection**, not a Tauri
   plugin — zero new dependency, works identically across desktop/demo/
   web; `tauri-plugin-os` is the documented fallback if this proves
   unreliable on some platform in practice.
3. **Website translation is out of scope for this doc** — a separate
   future decision, not assumed either way.
4. **Rust error strings ship untranslated in Phase 1** — an accepted
   interim gap (a handful of toast messages stay English until Phase 2),
   not a blocker for shipping the rest.
