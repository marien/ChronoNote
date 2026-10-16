//! Multilanguage support, Phase 2 (`docs/design/i18n-roadmap.md`) — a
//! stable, language-independent identifier for the small, deliberately
//! slow-growing set of error conditions this app authors itself as fixed
//! English sentences and surfaces in a user-facing toast.
//!
//! Everything else — the overwhelming majority of fallible operations in
//! this codebase (`fs::write`, a network request, a JSON parse) — stays a
//! plain `String` carrying the OS's or a remote API's own raw diagnostic
//! text, folded into `AppError::Other` at whichever boundary needs to
//! return `AppError`. Translating that text would mean either reinventing
//! generic buckets that throw away real diagnostic detail (a permission
//! error's exact path, a network error's exact cause), or translating a
//! remote server's own English response body — neither is worth doing.
//! Only add a new named variant here when there is a *fixed, Rust-
//! authored sentence* (no interpolated raw error text forming the actual
//! identity of the message) that a real user is likely to see. The
//! frontend maps each variant to an `error.<code>` translation key
//! (`src/lib/apiError.ts`); `Other`'s `detail` is never translated, the
//! same "translated headline, untranslated diagnostic tail" shape Phase
//! 1's toast sweep already used throughout for exactly this reason.
//!
//! Deliberately not covered yet (see the design doc's Phase 2 note for
//! why): `FolderSwitchResult`'s composed "couldn't sync before switching"
//! sentence — real, queued as a follow-up batch rather than folded into
//! this one, given its own pluralization opportunity and a parallel
//! implementation in the web app's `webOneDriveSync.ts` to keep in sync.
//!
//! The `OneDrive*` codes are produced only by the web app
//! (`webOneDriveAuth.ts`/`webOneDriveSync.ts`); the desktop app has no
//! OneDrive engine. They live here so the shared `AppError` type
//! (generated to TypeScript via ts-rs) covers them. Codes from the removed
//! Rust OAuth flow (loopback listener, keychain, ...) were deleted in
//! October 2026 (`docs/design/refactoring-review-oct16-2026.md`); add a
//! code back only when something actually produces it.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum AppError {
    /// `agenda.rs`: `.agenda.json` is missing, empty, or malformed — none
    /// of those states are ever produced by a genuine successful sync, so
    /// none can be trusted as "no meetings today" (see that module's own
    /// doc comment).
    AgendaInvalid,
    /// `webOneDriveSync.ts`: a sync was already running when another
    /// sync-affecting operation (a further sync, or resolving a held
    /// conflict) was attempted. One shared code for both guards — the
    /// user-facing meaning ("try again in a moment") is identical either way.
    OneDriveSyncBusy,
    /// `webOneDriveSync.ts`: the sign-in redirect came back with no
    /// matching PKCE session to exchange its code against.
    OneDriveNoPendingSession,
    /// `webOneDriveAuth.ts`: Microsoft's token endpoint didn't include a
    /// refresh token in its response — almost always a missing
    /// `offline_access` scope on the app registration.
    OneDriveMissingRefreshTokenScope,
    /// `webOneDriveAuth.ts`: the HTTP request to Microsoft's token endpoint
    /// itself failed (DNS, connection, TLS — before any response body
    /// exists to inspect).
    OneDriveTokenRequestFailed { detail: String },
    /// `webOneDriveAuth.ts`: Microsoft's token endpoint responded, but
    /// rejected the exchange (a non-2xx status) — `detail` is whatever
    /// error body it returned, Microsoft's own English text.
    OneDriveTokenExchangeRejected { detail: String },
    /// Anything else: a raw, untranslated diagnostic string — usually a
    /// `std::io::Error`/network error's own `Display` text, or a lower-
    /// level `String` error propagated up through a `?` chain. See the
    /// module doc comment for why this isn't given its own code.
    Other { detail: String },
}

/// Lets every existing `?`-chain of plain `String` errors (the vast
/// majority of this codebase) convert automatically at a function
/// boundary that now returns `Result<_, AppError>` — no need to touch
/// each individual `.map_err(|e| e.to_string())` call along the way.
impl From<String> for AppError {
    fn from(detail: String) -> Self {
        AppError::Other { detail }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::AgendaInvalid => {
                write!(f, "The calendar file (.agenda.json) is missing, empty, or invalid — check whatever syncs it.")
            }
            AppError::OneDriveSyncBusy => write!(f, "A sync is running — try again in a moment"),
            AppError::OneDriveNoPendingSession => {
                write!(f, "No pending login session found. Please tap 'Connect Microsoft Account' first.")
            }
            AppError::OneDriveMissingRefreshTokenScope => write!(
                f,
                "Microsoft didn't return a refresh token — check the app registration requests the offline_access scope."
            ),
            AppError::OneDriveTokenRequestFailed { detail } => write!(f, "Failed to send token request: {detail}"),
            AppError::OneDriveTokenExchangeRejected { detail } => write!(f, "OAuth token exchange failed: {detail}"),
            AppError::Other { detail } => write!(f, "{detail}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agenda_invalid_serializes_to_a_stable_code_with_no_extra_fields() {
        let v = serde_json::to_value(AppError::AgendaInvalid).unwrap();
        assert_eq!(v, serde_json::json!({ "code": "agendaInvalid" }));
    }

    #[test]
    fn one_drive_sync_busy_serializes_to_a_stable_code() {
        let v = serde_json::to_value(AppError::OneDriveSyncBusy).unwrap();
        assert_eq!(v, serde_json::json!({ "code": "oneDriveSyncBusy" }));
    }

    #[test]
    fn a_unit_sign_in_code_serializes_with_no_extra_fields() {
        let v = serde_json::to_value(AppError::OneDriveMissingRefreshTokenScope).unwrap();
        assert_eq!(v, serde_json::json!({ "code": "oneDriveMissingRefreshTokenScope" }));
    }

    #[test]
    fn a_sign_in_code_with_a_detail_field_serializes_it_alongside_the_code() {
        let v = serde_json::to_value(AppError::OneDriveTokenExchangeRejected { detail: "invalid_grant".to_string() })
            .unwrap();
        assert_eq!(v, serde_json::json!({ "code": "oneDriveTokenExchangeRejected", "detail": "invalid_grant" }));
    }

    #[test]
    fn other_carries_its_detail_alongside_the_code() {
        let v = serde_json::to_value(AppError::Other { detail: "disk full".to_string() }).unwrap();
        assert_eq!(v, serde_json::json!({ "code": "other", "detail": "disk full" }));
    }

    #[test]
    fn any_plain_string_error_converts_to_other() {
        let e: AppError = "boom".to_string().into();
        assert_eq!(e, AppError::Other { detail: "boom".to_string() });
    }

    #[test]
    fn display_matches_the_original_hardcoded_english_sentences() {
        assert_eq!(
            AppError::AgendaInvalid.to_string(),
            "The calendar file (.agenda.json) is missing, empty, or invalid — check whatever syncs it."
        );
        assert_eq!(AppError::OneDriveSyncBusy.to_string(), "A sync is running — try again in a moment");
        assert_eq!(AppError::Other { detail: "boom".to_string() }.to_string(), "boom");
    }
}
