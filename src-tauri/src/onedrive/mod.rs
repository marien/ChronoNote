pub mod auth;
pub mod client;
pub mod merge;
pub mod sync;

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveAccount {
    pub email: String,
    pub display_name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveLoginResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub account: Option<OneDriveAccount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error: Option<AppError>,
    /// True when the sign-in flow has been handed off to a real page
    /// redirect and the actual outcome will only be known later, once the
    /// redirect comes back — `success`/`account`/`error` above are all
    /// meaningless while this is true. Desktop's `login_interactive`
    /// blocks until it has a real result, so this is always `false` on
    /// the Rust side; the web app's own TypeScript login (which reloads
    /// the page to sign in) sets it `true` for exactly the same reason.
    #[serde(default)]
    pub pending: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveFolderItem {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveFolderConfig {
    pub folder_id: String,
    pub folder_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveSyncResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub message: Option<AppError>,
}

/// i18n Phase 2 (docs/design/i18n-roadmap.md): why `prepare_folder_switch`
/// couldn't go ahead — structured, not a pre-composed English sentence, so
/// the frontend can translate it (`apiError.ts::describeFolderSwitchBlocked`)
/// including a real pluralized count for `HeldConflicts`, which a flat
/// `format!("{held} note(s) have...")` string could never get right in
/// Dutch/German. `folder_path` is duplicated across variants rather than
/// hoisted into a wrapper struct — ts-rs has no good answer for a Rust
/// `#[serde(flatten)]` field, and duplicating one `String` is cheap.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum FolderSwitchBlocked {
    /// The one last sync before switching failed. `detail` is `None` only
    /// if `OneDriveSyncResult.message` itself was `None` on a failed sync —
    /// not a state the real sync engine produces today, but the type
    /// doesn't rule it out, so the frontend still needs a fallback string.
    // `rename_all` on the enum itself only renames the variant tag values
    // ("syncFailed"/"heldConflicts") — each variant needs its own
    // `rename_all` to camelCase its *own* fields (`folder_path` here).
    #[serde(rename_all = "camelCase")]
    SyncFailed {
        folder_path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        detail: Option<AppError>,
    },
    /// The sync itself succeeded, but the old folder has notes still
    /// held with an unresolved conflict.
    #[serde(rename_all = "camelCase")]
    HeldConflicts {
        folder_path: String,
        #[ts(type = "number")]
        count: usize,
    },
}

/// The outcome of `prepare_folder_switch` (see sync.rs): whether choosing the
/// new OneDrive folder may go ahead, and what happened to the local notes.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct FolderSwitchResult {
    pub ready: bool,
    /// The local notes belonged to a different folder, so they were cleared
    /// (or there was nothing in them).
    pub switched: bool,
    /// Notes copied to the archive because the old folder couldn't be synced.
    #[ts(type = "number")]
    pub archived_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub blocked: Option<FolderSwitchBlocked>,
}

/// A note whose local and cloud versions diverged in a way that couldn't be
/// merged automatically. Both texts are included for the resolve screen.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub name: String,
    pub local: String,
    pub remote: String,
}

/// What the status bar's sync-health popover shows (v0.12 Area 9): the engine's
/// status, when it last finished a sync successfully, and how many synced notes
/// the device holds / are still waiting to be uploaded. Same shape as the web
/// app's `WebOneDriveSyncEngine::getSyncHealth`.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SyncHealth {
    pub status: SyncStatus,
    /// Unix milliseconds of the last successful sync this session, or `null` if none yet.
    #[ts(type = "number | null")]
    pub last_sync_success_ms: Option<i64>,
    #[ts(type = "number")]
    pub local_note_count: usize,
    #[ts(type = "number")]
    pub pending_upload_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default, TS)]
#[serde(rename_all = "lowercase")]
pub enum SyncStatus {
    #[default]
    Idle,
    Syncing,
    Offline,
    Error,
}

/// Settings' Advanced overrides for work/school Entra tenants that can't
/// use the default multi-tenant client ID and/or the generic `/common`
/// endpoint (a locked-down corporate tenant may require its own app
/// registration and reject `/common` outright — see `auth::resolve_client_id`/
/// `resolve_tenant`). Both blank by default, meaning "use the built-in
/// personal-account defaults."
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveAdvancedConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub client_id_override: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tenant_id_override: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// i18n Phase 2 (docs/design/i18n-roadmap.md): `prepare_folder_switch`
    /// itself isn't unit-tested (it calls `sync_now`, which makes a real
    /// network request with no mockable HTTP layer in this codebase — the
    /// same reason `auth::exchange_code` has no direct test either) — these
    /// cover the wire shape `sync.rs` constructs and the frontend consumes.
    #[test]
    fn sync_failed_with_a_detail_serializes_with_the_folder_path_alongside_it() {
        let v = serde_json::to_value(FolderSwitchBlocked::SyncFailed {
            folder_path: "/Notes".to_string(),
            detail: Some(AppError::OneDriveSyncBusy),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "reason": "syncFailed", "folderPath": "/Notes", "detail": { "code": "oneDriveSyncBusy" } })
        );
    }

    #[test]
    fn sync_failed_with_no_detail_omits_the_field_entirely() {
        let v = serde_json::to_value(FolderSwitchBlocked::SyncFailed { folder_path: "/Notes".to_string(), detail: None })
            .unwrap();
        assert_eq!(v, serde_json::json!({ "reason": "syncFailed", "folderPath": "/Notes" }));
    }

    #[test]
    fn held_conflicts_serializes_the_count_alongside_the_folder_path() {
        let v = serde_json::to_value(FolderSwitchBlocked::HeldConflicts { folder_path: "/Notes".to_string(), count: 3 })
            .unwrap();
        assert_eq!(v, serde_json::json!({ "reason": "heldConflicts", "folderPath": "/Notes", "count": 3 }));
    }
}
