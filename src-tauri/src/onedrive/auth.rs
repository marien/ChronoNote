use super::{OneDriveAccount, OneDriveAdvancedConfig};
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

pub const DEFAULT_CLIENT_ID: &str = "9b008168-6c13-4f0f-9531-2313e7613ccb";
/// The generic multi-tenant + personal-account endpoint. A single-tenant
/// Entra app registration ("Accounts in this organizational directory
/// only") can reject sign-in through `/common/` outright — Settings'
/// Advanced override lets a real tenant ID or verified domain replace it,
/// same escape hatch the (parked) M365 calendar-import branch needed for
/// the exact same reason.
pub const DEFAULT_TENANT: &str = "common";
pub const SCOPES: &str = "Files.ReadWrite offline_access User.Read";
pub const AUTH_FILENAME: &str = ".onedrive-auth.json";

const KEYRING_SERVICE: &str = "chrononote";
const KEYRING_USER: &str = "onedrive-refresh-token";

/// The refresh token (long-lived, `offline_access` + `Files.ReadWrite`
/// scope — effectively standing access to the whole OneDrive) is
/// deliberately never written to `.onedrive-auth.json` in plain text; it
/// lives only in the OS keychain (Windows Credential Manager via
/// `keyring`'s `windows-native` feature). `StoredAuth` on disk carries
/// just the short-lived access token, its expiry, and the account
/// profile — none of that is sensitive enough on its own to need the
/// keychain.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoredAuth {
    pub access_token: String,
    pub expires_at: u64,
    #[serde(default)]
    pub account: Option<OneDriveAccount>,
}

impl StoredAuth {
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        // Refresh 60 seconds before actual expiration to avoid edge races
        now + 60 >= self.expires_at
    }
}

#[derive(Deserialize, Debug)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

/// Resolves the client ID to use: Settings' Advanced override when set,
/// otherwise the app's own registered (multi-tenant, personal-account)
/// client ID.
pub fn resolve_client_id(advanced: &OneDriveAdvancedConfig) -> String {
    advanced
        .client_id_override
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLIENT_ID)
        .to_string()
}

/// Resolves the tenant (or verified domain) to authenticate against:
/// Settings' Advanced override when set, otherwise `common`.
pub fn resolve_tenant(advanced: &OneDriveAdvancedConfig) -> String {
    advanced
        .tenant_id_override
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_TENANT)
        .to_string()
}

/// Builds a `login.microsoftonline.com/<tenant>/...` endpoint via `url`'s
/// path-segment API (which percent-encodes each segment) rather than raw
/// string formatting — `tenant` is arbitrary user input (Settings'
/// Advanced override) and must never be able to produce an unparseable
/// URL or panic no matter what's typed there.
fn microsoftonline_endpoint(tenant: &str, path: &[&str]) -> Url {
    let mut url = Url::parse("https://login.microsoftonline.com").expect("valid constant URL");
    url.path_segments_mut()
        .expect("an https URL with a host can always be a base")
        .push(tenant)
        .extend(path);
    url
}

fn authorize_endpoint(tenant: &str) -> Url {
    microsoftonline_endpoint(tenant, &["oauth2", "v2.0", "authorize"])
}

fn token_endpoint(tenant: &str) -> Url {
    microsoftonline_endpoint(tenant, &["oauth2", "v2.0", "token"])
}

/// Generates RFC 7636 PKCE code verifier and S256 code challenge.
pub fn generate_pkce() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash);
    (verifier, challenge)
}

/// Builds the Microsoft identity platform authorization URL.
pub fn build_authorize_url(tenant: &str, client_id: &str, redirect_uri: &str, challenge: &str) -> String {
    let mut url = authorize_endpoint(tenant);
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_mode", "query")
        .append_pair("scope", SCOPES)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256");
    url.to_string()
}

/// The outcome of a successful token exchange/refresh: the persistable
/// (non-sensitive) `StoredAuth`, plus the refresh token separately —
/// callers are responsible for putting the latter in the keychain, never
/// in a file.
pub struct TokenExchange {
    pub stored: StoredAuth,
    pub refresh_token: String,
}

/// Exchanges an authorization code for access and refresh tokens.
pub async fn exchange_code(
    client: &reqwest::Client,
    tenant: &str,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    verifier: &str,
) -> Result<TokenExchange, String> {
    let params = [
        ("client_id", client_id),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("code_verifier", verifier),
    ];

    let resp = client
        .post(token_endpoint(tenant))
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to send token request: {e}"))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("OAuth token exchange failed: {err_text}"));
    }

    let token_data: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    let refresh_token = token_data.refresh_token.ok_or_else(|| {
        "Microsoft didn't return a refresh token — check the app registration requests the offline_access scope.".to_string()
    })?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(TokenExchange {
        stored: StoredAuth {
            access_token: token_data.access_token,
            expires_at: now + token_data.expires_in,
            account: None,
        },
        refresh_token,
    })
}

/// Refreshes an expired access token using the stored refresh token.
/// Returns the refreshed token alongside whichever refresh token should
/// now be kept in the keychain — Microsoft doesn't always issue a new
/// one, in which case the existing one stays valid and is passed through
/// unchanged.
pub async fn refresh_access_token(
    client: &reqwest::Client,
    tenant: &str,
    client_id: &str,
    refresh_token: &str,
) -> Result<TokenExchange, String> {
    let params = [
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("scope", SCOPES),
    ];

    let resp = client
        .post(token_endpoint(tenant))
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to send token refresh request: {e}"))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("OAuth token refresh failed: {err_text}"));
    }

    let token_data: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(TokenExchange {
        stored: StoredAuth {
            access_token: token_data.access_token,
            expires_at: now + token_data.expires_in,
            account: None,
        },
        // If a new refresh token is issued, use it; otherwise preserve the existing one.
        refresh_token: token_data.refresh_token.unwrap_or_else(|| refresh_token.to_string()),
    })
}

pub fn auth_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(AUTH_FILENAME)
}

pub fn load_stored_auth(data_dir: &Path) -> Result<Option<StoredAuth>, String> {
    let path = auth_file_path(data_dir);
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str::<StoredAuth>(&content) {
        Ok(auth) => Ok(Some(auth)),
        Err(_) => {
            let _ = fs::remove_file(&path);
            Ok(None)
        }
    }
}

pub fn save_stored_auth(data_dir: &Path, auth: &StoredAuth) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let path = auth_file_path(data_dir);
    let json = serde_json::to_string_pretty(auth).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn clear_stored_auth(data_dir: &Path) -> Result<(), String> {
    let path = auth_file_path(data_dir);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

/// Stores the refresh token in the OS keychain (Windows Credential
/// Manager). Never persisted to a file — see `StoredAuth`'s own comment.
pub fn save_refresh_token(token: &str) -> Result<(), String> {
    keyring_entry()?.set_password(token).map_err(|e| e.to_string())
}

pub fn load_refresh_token() -> Option<String> {
    keyring_entry().ok()?.get_password().ok()
}

/// Best-effort: an already-missing keychain entry isn't an error here —
/// the goal is "not signed in afterward" either way.
pub fn clear_refresh_token() {
    if let Ok(entry) = keyring_entry() {
        let _ = entry.delete_credential();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_client_id_defaults_to_the_built_in_registration() {
        let advanced = OneDriveAdvancedConfig::default();
        assert_eq!(resolve_client_id(&advanced), DEFAULT_CLIENT_ID);
    }

    #[test]
    fn resolve_client_id_uses_a_trimmed_override_when_set() {
        let advanced = OneDriveAdvancedConfig {
            client_id_override: Some("  my-app-id  ".to_string()),
            tenant_id_override: None,
        };
        assert_eq!(resolve_client_id(&advanced), "my-app-id");
    }

    #[test]
    fn resolve_client_id_falls_back_to_default_for_a_blank_override() {
        let advanced = OneDriveAdvancedConfig {
            client_id_override: Some("   ".to_string()),
            tenant_id_override: None,
        };
        assert_eq!(resolve_client_id(&advanced), DEFAULT_CLIENT_ID);
    }

    #[test]
    fn resolve_tenant_defaults_to_common() {
        let advanced = OneDriveAdvancedConfig::default();
        assert_eq!(resolve_tenant(&advanced), "common");
    }

    #[test]
    fn resolve_tenant_uses_a_trimmed_override_when_set() {
        let advanced = OneDriveAdvancedConfig {
            client_id_override: None,
            tenant_id_override: Some("  contoso.onmicrosoft.com  ".to_string()),
        };
        assert_eq!(resolve_tenant(&advanced), "contoso.onmicrosoft.com");
    }

    #[test]
    fn resolve_tenant_falls_back_to_common_for_a_blank_override() {
        let advanced = OneDriveAdvancedConfig {
            client_id_override: None,
            tenant_id_override: Some("   ".to_string()),
        };
        assert_eq!(resolve_tenant(&advanced), "common");
    }

    #[test]
    fn authorize_url_uses_the_common_endpoint_by_default_and_carries_every_pkce_parameter() {
        let url = build_authorize_url("common", "client-1", "http://localhost:5000/auth", "challenge-1");
        assert!(url.starts_with("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"));
        for pair in [
            "client_id=client-1",
            "response_type=code",
            "redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fauth",
            "response_mode=query",
            "code_challenge=challenge-1",
            "code_challenge_method=S256",
        ] {
            assert!(url.contains(pair), "missing `{pair}` in {url}");
        }
    }

    #[test]
    fn authorize_url_uses_a_specific_tenant_instead_of_common_when_given_one() {
        let url = build_authorize_url("contoso.onmicrosoft.com", "client-1", "http://localhost:5000/auth", "challenge-1");
        assert!(url.starts_with("https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize"));
    }

    #[test]
    fn token_endpoint_matches_the_tenant_the_authorize_endpoint_used() {
        assert_eq!(
            token_endpoint("contoso.onmicrosoft.com").as_str(),
            "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token"
        );
    }

    #[test]
    fn microsoftonline_endpoint_cannot_panic_on_a_malformed_tenant_string() {
        // Settings' Advanced field is free text — a stray space, slash, or
        // query-like fragment must degrade to a weird-but-valid URL
        // Microsoft will reject cleanly, never a panic.
        for weird in ["", "has space", "a/b", "a?b=c", "a#b", "%%"] {
            let _ = authorize_endpoint(weird).to_string();
            let _ = token_endpoint(weird).to_string();
        }
    }

    #[test]
    fn generate_pkce_produces_a_verifier_and_matching_s256_challenge() {
        let (verifier, challenge) = generate_pkce();
        assert!(!verifier.is_empty());
        assert!(!challenge.is_empty());
        assert_ne!(verifier, challenge);
        // Regenerating must not reuse the same verifier.
        let (verifier2, _) = generate_pkce();
        assert_ne!(verifier, verifier2);
    }

    #[test]
    fn stored_auth_round_trips_through_disk_without_a_refresh_token_field() {
        let dir = tempfile::tempdir().unwrap();
        let auth = StoredAuth {
            access_token: "at-1".to_string(),
            expires_at: 12345,
            account: Some(OneDriveAccount {
                email: "a@example.com".to_string(),
                display_name: "A B".to_string(),
            }),
        };
        save_stored_auth(dir.path(), &auth).unwrap();

        // The refresh token must never appear anywhere in the file that
        // gets written to disk — it belongs in the OS keychain only.
        let raw = fs::read_to_string(auth_file_path(dir.path())).unwrap();
        assert!(!raw.contains("refreshToken"));
        assert!(!raw.contains("refresh_token"));

        let loaded = load_stored_auth(dir.path()).unwrap().unwrap();
        assert_eq!(loaded.access_token, "at-1");
        assert_eq!(loaded.expires_at, 12345);
        assert_eq!(loaded.account.unwrap().email, "a@example.com");
    }

    #[test]
    fn is_expired_is_true_once_within_sixty_seconds_of_expiry() {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let almost_expired = StoredAuth {
            access_token: String::new(),
            expires_at: now + 30,
            account: None,
        };
        assert!(almost_expired.is_expired());

        let still_valid = StoredAuth {
            access_token: String::new(),
            expires_at: now + 3600,
            account: None,
        };
        assert!(!still_valid.is_expired());
    }
}
