use super::OneDriveAccount;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const DEFAULT_CLIENT_ID: &str = "9b008168-6c13-4f0f-9531-2313e7613ccb";
pub const AUTH_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
pub const TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
pub const SCOPES: &str = "Files.ReadWrite offline_access User.Read";
#[allow(dead_code)]
pub const REDIRECT_URI_MOBILE: &str = "chrononote://auth";
pub const AUTH_FILENAME: &str = ".onedrive-auth.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoredAuth {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
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
pub fn build_authorize_url(client_id: &str, redirect_uri: &str, challenge: &str) -> String {
    format!(
        "{}?client_id={}&response_type=code&redirect_uri={}&response_mode=query&scope={}&code_challenge={}&code_challenge_method=S256",
        AUTH_URL,
        urlencoding(client_id),
        urlencoding(redirect_uri),
        urlencoding(SCOPES),
        urlencoding(challenge),
    )
}

fn urlencoding(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

/// Exchanges an authorization code for access and refresh tokens.
pub async fn exchange_code(
    client: &reqwest::Client,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    verifier: &str,
) -> Result<StoredAuth, String> {
    let params = [
        ("client_id", client_id),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("code_verifier", verifier),
    ];

    let resp = client
        .post(TOKEN_URL)
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

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(StoredAuth {
        access_token: token_data.access_token,
        refresh_token: token_data.refresh_token,
        expires_at: now + token_data.expires_in,
        account: None,
    })
}

/// Refreshes an expired access token using the stored refresh token.
pub async fn refresh_access_token(
    client: &reqwest::Client,
    client_id: &str,
    refresh_token: &str,
) -> Result<StoredAuth, String> {
    let params = [
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("scope", SCOPES),
    ];

    let resp = client
        .post(TOKEN_URL)
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

    Ok(StoredAuth {
        access_token: token_data.access_token,
        // If a new refresh token is issued, use it; otherwise preserve the existing one
        refresh_token: token_data.refresh_token.or_else(|| Some(refresh_token.to_string())),
        expires_at: now + token_data.expires_in,
        account: None,
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
