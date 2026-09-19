pub mod auth;
pub mod client;
pub mod merge;
pub mod sync;

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
    pub error: Option<String>,
    /// Android only: true means the system browser was opened and the
    /// real outcome will arrive later via the `onedrive-login-result`
    /// event, once Android delivers the `chrononote://auth` deep link
    /// back to the app — `success`/`account`/`error` above are all
    /// meaningless while this is true. Always `false` on desktop, where
    /// `login_interactive` already blocks until it has a real result.
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
    pub message: Option<String>,
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
