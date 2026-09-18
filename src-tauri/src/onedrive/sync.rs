use super::auth::{
    build_authorize_url, clear_refresh_token, clear_stored_auth, exchange_code, generate_pkce,
    load_refresh_token, load_stored_auth, refresh_access_token, resolve_client_id, resolve_tenant,
    save_refresh_token, save_stored_auth, TokenExchange,
};
use super::client::{OneDriveClient, UploadResult};
use super::{
    OneDriveAccount, OneDriveAdvancedConfig, OneDriveFolderConfig, OneDriveFolderItem,
    OneDriveLoginResult, OneDriveSyncResult, SyncStatus,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
#[cfg(not(target_os = "android"))]
use std::io::{Read, Write};
#[cfg(not(target_os = "android"))]
use std::net::TcpListener;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
#[cfg(not(target_os = "android"))]
use std::time::Duration;

pub const FOLDER_CONFIG_FILENAME: &str = ".onedrive-folder.json";
pub const SYNC_CACHE_FILENAME: &str = ".onedrive-cache.json";
pub const PENDING_PKCE_FILENAME: &str = ".onedrive-pending-pkce.json";
pub const ADVANCED_CONFIG_FILENAME: &str = ".onedrive-advanced.json";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PendingPkce {
    pub verifier: String,
    pub redirect_uri: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct FileCacheEntry {
    pub id: String,
    pub etag: String,
    pub local_hash: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct SyncCache {
    pub delta_link: Option<String>,
    pub files: HashMap<String, FileCacheEntry>,
}

pub struct OneDriveManager {
    client: OneDriveClient,
    status: Arc<Mutex<SyncStatus>>,
    is_syncing: Arc<AtomicBool>,
}

impl OneDriveManager {
    pub fn new() -> Self {
        Self {
            client: OneDriveClient::new(),
            status: Arc::new(Mutex::new(SyncStatus::Idle)),
            is_syncing: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get_status(&self) -> SyncStatus {
        *self.status.lock().unwrap()
    }

    pub fn set_status(&self, status: SyncStatus) {
        let mut s = self.status.lock().unwrap();
        *s = status;
    }

    /// Loads the stored account profile, if authenticated.
    pub fn get_account(&self, data_dir: &Path) -> Option<OneDriveAccount> {
        load_stored_auth(data_dir).ok().flatten().and_then(|a| a.account)
    }

    /// Removes authentication tokens (including the keychain refresh
    /// token) and resets sync cache.
    pub fn logout(&self, data_dir: &Path) -> Result<(), String> {
        clear_stored_auth(data_dir)?;
        clear_refresh_token();
        let cache_file = data_dir.join(SYNC_CACHE_FILENAME);
        if cache_file.exists() {
            let _ = fs::remove_file(cache_file);
        }
        self.set_status(SyncStatus::Idle);
        Ok(())
    }

    /// Loads Settings' Advanced client-ID/tenant overrides, if any —
    /// defaults (both blank) when the file doesn't exist or is corrupt.
    pub fn get_advanced_config(&self, data_dir: &Path) -> OneDriveAdvancedConfig {
        let path = data_dir.join(ADVANCED_CONFIG_FILENAME);
        if !path.exists() {
            return OneDriveAdvancedConfig::default();
        }
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<OneDriveAdvancedConfig>(&s).ok())
            .unwrap_or_default()
    }

    /// Saves Settings' Advanced client-ID/tenant overrides.
    pub fn set_advanced_config(&self, data_dir: &Path, config: &OneDriveAdvancedConfig) -> Result<(), String> {
        fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let path = data_dir.join(ADVANCED_CONFIG_FILENAME);
        let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(path, raw).map_err(|e| e.to_string())
    }

    /// Loads the active OneDrive folder configuration.
    pub fn get_folder(&self, data_dir: &Path) -> Option<OneDriveFolderConfig> {
        let path = data_dir.join(FOLDER_CONFIG_FILENAME);
        if !path.exists() {
            return None;
        }
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<OneDriveFolderConfig>(&s).ok())
    }

    /// Saves the active OneDrive folder configuration.
    pub fn set_folder(&self, data_dir: &Path, config: &OneDriveFolderConfig) -> Result<(), String> {
        fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let path = data_dir.join(FOLDER_CONFIG_FILENAME);
        let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(path, raw).map_err(|e| e.to_string())?;

        // Reset delta query link when folder changes
        let mut cache = self.load_cache(data_dir);
        cache.delta_link = None;
        self.save_cache(data_dir, &cache)?;
        Ok(())
    }

    /// Lists folders under a parent item (or root if None).
    pub async fn list_folders(
        &self,
        data_dir: &Path,
        parent_id: Option<&str>,
    ) -> Result<Vec<OneDriveFolderItem>, String> {
        let token = self.get_valid_access_token(data_dir).await?;
        self.client.list_folders(&token, parent_id).await
    }

    /// Creates a new child folder under parent (or root if None).
    pub async fn create_folder(
        &self,
        data_dir: &Path,
        parent_id: Option<&str>,
        name: &str,
    ) -> Result<OneDriveFolderItem, String> {
        let token = self.get_valid_access_token(data_dir).await?;
        self.client.create_folder(&token, parent_id, name).await
    }

    /// Performs interactive OAuth 2.0 PKCE login using a local loopback
    /// listener. Desktop only — see the Android variant below for why a
    /// bare loopback isn't safe to rely on there.
    #[cfg(not(target_os = "android"))]
    pub async fn login_interactive(
        &self,
        app: &tauri::AppHandle,
        data_dir: &Path,
    ) -> OneDriveLoginResult {
        use tauri_plugin_opener::OpenerExt;

        let advanced = self.get_advanced_config(data_dir);
        let client_id = resolve_client_id(&advanced);
        let tenant = resolve_tenant(&advanced);

        let (verifier, challenge) = generate_pkce();

        let redirect_uri = "http://localhost:8765/auth";

        // Persist pending PKCE verifier so direct exchange or process relaunch can access it
        let pending = PendingPkce {
            verifier: verifier.clone(),
            redirect_uri: redirect_uri.to_string(),
        };
        let _ = fs::write(
            data_dir.join(PENDING_PKCE_FILENAME),
            serde_json::to_string(&pending).unwrap_or_default(),
        );

        // Bind loopback listener on port 8765
        let listener = match TcpListener::bind("127.0.0.1:8765") {
            Ok(l) => l,
            Err(e) => {
                return OneDriveLoginResult {
                    success: false,
                    account: None,
                    error: Some(format!("Could not bind local OAuth port 8765: {e}")),
                    pending: false,
                }
            }
        };

        // Set non-blocking with timeout
        let _ = listener.set_nonblocking(true);

        let auth_url = build_authorize_url(&tenant, &client_id, redirect_uri, &challenge);

        // Open in user's default browser (cross-platform via tauri-plugin-opener)
        if let Err(e) = app.opener().open_url(&auth_url, None::<&str>) {
            return OneDriveLoginResult {
                success: false,
                account: None,
                error: Some(format!("Failed to open system browser: {e}")),
                pending: false,
            };
        }

        // Poll for callback for up to 120 seconds
        let start = std::time::Instant::now();
        let mut auth_code = None;

        while start.elapsed() < Duration::from_secs(120) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buf = [0u8; 2048];
                    if let Ok(n) = stream.read(&mut buf) {
                        let request_str = String::from_utf8_lossy(&buf[..n]);
                        if let Some(code) = extract_code_from_http_request(&request_str) {
                            auth_code = Some(code);
                            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h2>ChronoNote authenticated successfully!</h2><p>You can close this tab and return to ChronoNote.</p></body></html>";
                            let _ = stream.write_all(response.as_bytes());
                            break;
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
                Err(e) => {
                    return OneDriveLoginResult {
                        success: false,
                        account: None,
                        error: Some(format!("Error accepting OAuth callback: {e}")),
                        pending: false,
                    };
                }
            }
        }

        let code = match auth_code {
            Some(c) => c,
            None => {
                return OneDriveLoginResult {
                    success: false,
                    account: None,
                    error: Some("Authentication timed out waiting for user approval".to_string()),
                    pending: false,
                }
            }
        };

        // Exchange code for tokens
        let exchange = match exchange_code(&self.client.client, &tenant, &client_id, redirect_uri, &code, &verifier).await
        {
            Ok(e) => e,
            Err(e) => {
                return OneDriveLoginResult {
                    success: false,
                    account: None,
                    error: Some(e),
                    pending: false,
                }
            }
        };

        self.finish_login(data_dir, exchange).await
    }

    /// Android variant: a bare loopback socket can't be relied on here —
    /// the OS can suspend or kill the app while the user is off in the
    /// system browser signing in, so blocking on `TcpListener::accept`
    /// the way desktop does would just time out in practice. Opens the
    /// browser against a `chrononote://auth` deep link instead (see the
    /// `deep-link` plugin config in `tauri.conf.json`) and returns
    /// immediately with `pending: true` — the real result arrives later
    /// via the `onedrive-login-result` event, emitted from `lib.rs`'s
    /// `on_open_url` handler once Android routes the redirect back to
    /// the app and it calls `exchange_code_direct` (the exact same
    /// function the manual-paste fallback UI already uses).
    #[cfg(target_os = "android")]
    pub async fn login_interactive(
        &self,
        app: &tauri::AppHandle,
        data_dir: &Path,
    ) -> OneDriveLoginResult {
        use tauri_plugin_opener::OpenerExt;

        let advanced = self.get_advanced_config(data_dir);
        let client_id = resolve_client_id(&advanced);
        let tenant = resolve_tenant(&advanced);

        let (verifier, challenge) = generate_pkce();
        let redirect_uri = super::auth::REDIRECT_URI_MOBILE;

        let pending = PendingPkce {
            verifier,
            redirect_uri: redirect_uri.to_string(),
        };
        if let Err(e) = fs::create_dir_all(data_dir).and_then(|_| {
            fs::write(
                data_dir.join(PENDING_PKCE_FILENAME),
                serde_json::to_string(&pending).unwrap_or_default(),
            )
        }) {
            return OneDriveLoginResult {
                success: false,
                account: None,
                error: Some(format!("Failed to save sign-in state: {e}")),
                pending: false,
            };
        }

        let auth_url = build_authorize_url(&tenant, &client_id, redirect_uri, &challenge);

        if let Err(e) = app.opener().open_url(&auth_url, None::<&str>) {
            return OneDriveLoginResult {
                success: false,
                account: None,
                error: Some(format!("Failed to open system browser: {e}")),
                pending: false,
            };
        }

        OneDriveLoginResult {
            success: false,
            account: None,
            error: None,
            pending: true,
        }
    }

    /// Exchange an authorization code or full redirect URL directly —
    /// the manual-paste fallback UI, and (on Android) the automatic
    /// deep-link handler in `lib.rs` both call this.
    pub async fn exchange_code_direct(
        &self,
        data_dir: &Path,
        code_or_url: &str,
    ) -> OneDriveLoginResult {
        let code = extract_code_from_string(code_or_url);
        if code.is_empty() {
            return OneDriveLoginResult {
                success: false,
                account: None,
                error: Some("No authorization code provided".to_string()),
                pending: false,
            };
        }

        let pending_path = data_dir.join(PENDING_PKCE_FILENAME);
        let pending: PendingPkce = match fs::read_to_string(&pending_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
        {
            Some(p) => p,
            None => {
                return OneDriveLoginResult {
                    success: false,
                    account: None,
                    error: Some("No pending login session found. Please tap 'Connect Microsoft Account' first.".to_string()),
                    pending: false,
                };
            }
        };

        let advanced = self.get_advanced_config(data_dir);
        let client_id = resolve_client_id(&advanced);
        let tenant = resolve_tenant(&advanced);

        let exchange = match exchange_code(
            &self.client.client,
            &tenant,
            &client_id,
            &pending.redirect_uri,
            &code,
            &pending.verifier,
        )
        .await
        {
            Ok(e) => e,
            Err(e) => {
                return OneDriveLoginResult {
                    success: false,
                    account: None,
                    error: Some(e),
                    pending: false,
                };
            }
        };

        let _ = fs::remove_file(&pending_path);

        self.finish_login(data_dir, exchange).await
    }

    /// Shared tail of both login paths: fetches the user profile, puts
    /// the refresh token in the keychain (never on disk), and persists
    /// the non-sensitive `StoredAuth` remainder.
    async fn finish_login(&self, data_dir: &Path, exchange: TokenExchange) -> OneDriveLoginResult {
        let TokenExchange { mut stored, refresh_token } = exchange;

        match self.client.get_user_profile(&stored.access_token).await {
            Ok(account) => {
                stored.account = Some(account.clone());
                if let Err(e) = save_refresh_token(&refresh_token) {
                    return OneDriveLoginResult {
                        success: false,
                        account: None,
                        error: Some(format!("Failed to save credentials to the OS keychain: {e}")),
                        pending: false,
                    };
                }
                if let Err(e) = save_stored_auth(data_dir, &stored) {
                    return OneDriveLoginResult {
                        success: false,
                        account: None,
                        error: Some(format!("Failed to save auth state: {e}")),
                        pending: false,
                    };
                }
                OneDriveLoginResult {
                    success: true,
                    account: Some(account),
                    error: None,
                    pending: false,
                }
            }
            Err(e) => OneDriveLoginResult {
                success: false,
                account: None,
                error: Some(format!("Failed to fetch user profile: {e}")),
                pending: false,
            },
        }
    }

    /// Bidirectional sync: Pull remote changes and push local edits.
    pub async fn sync_now(&self, data_dir: &Path, notes_dir: &Path) -> OneDriveSyncResult {
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return OneDriveSyncResult {
                success: false,
                message: Some("Sync already in progress".to_string()),
            };
        }

        self.set_status(SyncStatus::Syncing);
        let result = self.execute_sync(data_dir, notes_dir).await;
        self.is_syncing.store(false, Ordering::SeqCst);

        match result {
            Ok(_) => {
                self.set_status(SyncStatus::Idle);
                OneDriveSyncResult {
                    success: true,
                    message: None,
                }
            }
            Err(err) => {
                let status = if err.contains("offline") || err.contains("dns") || err.contains("connect") {
                    SyncStatus::Offline
                } else {
                    SyncStatus::Error
                };
                self.set_status(status);
                OneDriveSyncResult {
                    success: false,
                    message: Some(err),
                }
            }
        }
    }

    async fn execute_sync(&self, data_dir: &Path, notes_dir: &Path) -> Result<(), String> {
        let folder_cfg = self
            .get_folder(data_dir)
            .ok_or_else(|| "No OneDrive folder configured".to_string())?;

        let token = self.get_valid_access_token(data_dir).await?;
        let mut cache = self.load_cache(data_dir);

        fs::create_dir_all(notes_dir).map_err(|e| e.to_string())?;

        // 1. PULL: Fetch remote changes via delta query
        let delta_res = self
            .client
            .get_folder_delta(&token, &folder_cfg.folder_id, cache.delta_link.as_deref())
            .await?;

        for item in delta_res.changes {
            if !is_syncable_file(&item.name) {
                continue;
            }

            let local_path = notes_dir.join(&item.name);

            if item.is_deleted {
                if local_path.exists() {
                    let _ = fs::remove_file(&local_path);
                }
                cache.files.remove(&item.name);
                continue;
            }

            // Remote file created or updated
            let current_local_hash = if local_path.exists() {
                Some(hash_file(&local_path)?)
            } else {
                None
            };

            let cached_entry = cache.files.get(&item.name);

            // Check if local file was modified independently (Conflict!)
            let has_local_modification = match (current_local_hash.as_deref(), cached_entry) {
                (Some(curr), Some(cached)) => curr != cached.local_hash,
                (Some(_), None) => true,
                (None, _) => false,
            };

            let remote_content = self.client.download_file_content(&token, &item.id).await?;
            let remote_hash = compute_hash(remote_content.as_bytes());

            if has_local_modification {
                // Write remote copy to conflict file to ensure 100% zero data loss
                let conflict_name = format!(
                    ".chrononote-conflicts/{}.remote-{}",
                    item.name,
                    chrono_timestamp()
                );
                let conflict_path = notes_dir.join(&conflict_name);
                if let Some(parent) = conflict_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(conflict_path, remote_content);
            } else {
                // Update local file cleanly
                fs::write(&local_path, remote_content.as_bytes()).map_err(|e| e.to_string())?;
                cache.files.insert(
                    item.name.clone(),
                    FileCacheEntry {
                        id: item.id.clone(),
                        etag: item.etag.unwrap_or_default(),
                        local_hash: remote_hash,
                    },
                );
            }
        }

        if let Some(link) = delta_res.delta_link {
            cache.delta_link = Some(link);
        }

        // 2. PUSH: Scan local files and upload new/modified ones
        let local_files = list_syncable_local_files(notes_dir)?;

        for filename in local_files {
            let file_path = notes_dir.join(&filename);
            let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
            let local_hash = compute_hash(content.as_bytes());

            let needs_upload = match cache.files.get(&filename) {
                Some(cached) => cached.local_hash != local_hash,
                None => true,
            };

            if !needs_upload {
                continue;
            }

            let cached_etag = cache.files.get(&filename).map(|f| f.etag.as_str());

            match self
                .client
                .upload_file_content(
                    &token,
                    &folder_cfg.folder_id,
                    &filename,
                    &content,
                    cached_etag,
                )
                .await?
            {
                UploadResult::Success { id, etag } => {
                    cache.files.insert(
                        filename,
                        FileCacheEntry {
                            id,
                            etag,
                            local_hash,
                        },
                    );
                }
                UploadResult::Conflict => {
                    // CAS failed: another device touched this file on OneDrive
                    let conflict_name = format!(
                        ".chrononote-conflicts/{}.local-{}",
                        filename,
                        chrono_timestamp()
                    );
                    let conflict_path = notes_dir.join(&conflict_name);
                    if let Some(parent) = conflict_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let _ = fs::write(conflict_path, content.as_bytes());
                }
            }
        }

        self.save_cache(data_dir, &cache)?;
        Ok(())
    }

    async fn get_valid_access_token(&self, data_dir: &Path) -> Result<String, String> {
        let auth = load_stored_auth(data_dir)?
            .ok_or_else(|| "Not signed in to OneDrive".to_string())?;

        if !auth.is_expired() {
            return Ok(auth.access_token);
        }

        let refresh = load_refresh_token()
            .ok_or_else(|| "No refresh token available, please re-authenticate".to_string())?;

        let advanced = self.get_advanced_config(data_dir);
        let client_id = resolve_client_id(&advanced);
        let tenant = resolve_tenant(&advanced);

        let TokenExchange { mut stored, refresh_token } =
            refresh_access_token(&self.client.client, &tenant, &client_id, &refresh).await?;
        stored.account = auth.account;
        if refresh_token != refresh {
            save_refresh_token(&refresh_token)?;
        }
        save_stored_auth(data_dir, &stored)?;
        Ok(stored.access_token)
    }

    fn load_cache(&self, data_dir: &Path) -> SyncCache {
        let path = data_dir.join(SYNC_CACHE_FILENAME);
        if !path.exists() {
            return SyncCache::default();
        }
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<SyncCache>(&s).ok())
            .unwrap_or_default()
    }

    fn save_cache(&self, data_dir: &Path, cache: &SyncCache) -> Result<(), String> {
        fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let path = data_dir.join(SYNC_CACHE_FILENAME);
        let raw = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
        fs::write(path, raw).map_err(|e| e.to_string())
    }
}

/// Decodes `%XX` escapes in a query-string value. Deliberately does NOT
/// treat `+` as a space (that's the `application/x-www-form-urlencoded`
/// body convention, not how a URL query component is defined — an auth
/// code is opaque and may itself contain a literal `+`, which must be
/// left alone). Operates on raw bytes throughout so a malformed `%`
/// sequence can never panic on a UTF-8 char-boundary.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 3 <= bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Finds the `code` param in a query string (everything after the first
/// `?`, or the whole string if there's no `?`) and percent-decodes it —
/// the value came off the wire (an HTTP request line or a browser
/// address bar) still URL-encoded, and Microsoft's token endpoint needs
/// the exact original bytes, not the encoded form. A real code observed
/// in testing ended in a literal `$$`, transmitted as `%24%24`; sending
/// that percent-encoded form verbatim as the `code` parameter produces
/// Microsoft's AADSTS9002313 "malformed request" every time, since it
/// no longer matches the code actually issued. `splitn(2, '=')` (not a
/// bare `split`) so a code that happens to contain its own `=` isn't
/// truncated at the first one.
fn find_code_param(s: &str) -> Option<String> {
    let query = s.find('?').map(|i| &s[i + 1..]).unwrap_or(s);
    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
            if k == "code" {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

#[cfg(not(target_os = "android"))]
fn extract_code_from_http_request(req: &str) -> Option<String> {
    for line in req.lines() {
        if line.starts_with("GET ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Some(code) = find_code_param(parts[1]) {
                    return Some(code);
                }
            }
        }
    }
    None
}

/// Pulls a `code` value out of whatever the user pasted into the manual
/// auth-code field: a full redirect URL (`...?code=X&state=Y`), a bare
/// query fragment with no leading `?` (`code=X&state=Y` — what a browser's
/// address bar shows once it's stripped the scheme/host after a failed
/// loopback redirect), or just the raw code itself. Only falls back to
/// treating the whole input as the code when no `code=` key is found at
/// all, so a pasted `code=...` fragment never gets sent to Microsoft with
/// the literal `code=` prefix still attached (that previously produced a
/// real, reproduced AADSTS9002313 "malformed request" — the prefix isn't
/// part of the opaque code value).
fn extract_code_from_string(input: &str) -> String {
    let trimmed = input.trim();
    if let Some(code) = find_code_param(trimmed) {
        return code;
    }
    trimmed.to_string()
}

fn is_syncable_file(name: &str) -> bool {
    // Only daily note files (YYYY-MM-DD.txt) and the optional calendar agenda (.agenda.json)
    // sync across devices. UI session state (.chrononote-session.json) is deliberately
    // device-local so mobile and desktop do not fight over open tabs or generate OneDrive
    // conflict files (.chrononote-session-<LAPTOP>.json).
    (name.ends_with(".txt") && name.len() == 14) // YYYY-MM-DD.txt
        || name == ".agenda.json"
}

fn list_syncable_local_files(notes_dir: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    if !notes_dir.exists() {
        return Ok(files);
    }
    let entries = fs::read_dir(notes_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if let Ok(file_name) = entry.file_name().into_string() {
            if is_syncable_file(&file_name) {
                files.push(file_name);
            }
        }
    }
    Ok(files)
}

fn compute_hash(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    format!("{hash:x}")
}

fn hash_file(path: &Path) -> Result<String, String> {
    let content = fs::read(path).map_err(|e| e.to_string())?;
    Ok(compute_hash(&content))
}

fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_syncable_file_filtering() {
        assert!(is_syncable_file("2026-09-17.txt"));
        assert!(is_syncable_file("1999-01-01.txt"));
        assert!(is_syncable_file(".agenda.json"));

        // UI session state is strictly device-local and must not sync to prevent cross-device conflicts
        assert!(!is_syncable_file(".chrononote-session.json"));
        assert!(!is_syncable_file(".chrononote-session-LAPTOP-123.json"));
        assert!(!is_syncable_file(".chrononote-session-DESKTOP.json"));

        // Conflict files and non-notes must not sync
        assert!(!is_syncable_file("random.txt"));
        assert!(!is_syncable_file("2026-09-17.txt.bak"));
        assert!(!is_syncable_file(".DS_Store"));
        assert!(!is_syncable_file("config.json"));
    }

    #[test]
    fn advanced_config_defaults_when_no_file_exists_yet() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = OneDriveManager::new();
        let cfg = mgr.get_advanced_config(dir.path());
        assert_eq!(cfg, OneDriveAdvancedConfig::default());
    }

    #[test]
    fn advanced_config_round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = OneDriveManager::new();
        let cfg = OneDriveAdvancedConfig {
            client_id_override: Some("my-app-id".to_string()),
            tenant_id_override: Some("contoso.onmicrosoft.com".to_string()),
        };
        mgr.set_advanced_config(dir.path(), &cfg).unwrap();
        assert_eq!(mgr.get_advanced_config(dir.path()), cfg);
    }

    #[test]
    fn advanced_config_falls_back_to_default_for_corrupt_json() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(ADVANCED_CONFIG_FILENAME), "not json").unwrap();
        let mgr = OneDriveManager::new();
        assert_eq!(mgr.get_advanced_config(dir.path()), OneDriveAdvancedConfig::default());
    }

    #[test]
    fn extract_code_from_string_handles_a_full_redirect_url() {
        assert_eq!(
            extract_code_from_string("http://localhost:8765/auth?code=abc123&state=xyz"),
            "abc123"
        );
    }

    #[test]
    fn extract_code_from_string_handles_a_bare_query_fragment_with_no_leading_question_mark() {
        // Reproduces a real AADSTS9002313 "malformed request" report: a browser
        // that couldn't complete the loopback redirect shows the attempted URL
        // in its address bar, and copying just the query portion of it (no `?`)
        // used to be sent to Microsoft with the literal `code=` prefix still
        // attached to the value.
        assert_eq!(extract_code_from_string("code=M.C554_BAY.2.U.MsaArtifacts."), "M.C554_BAY.2.U.MsaArtifacts.");
        assert_eq!(extract_code_from_string("code=abc123&state=xyz"), "abc123");
    }

    #[test]
    fn extract_code_from_string_handles_a_bare_code_with_no_key_at_all() {
        assert_eq!(extract_code_from_string("M.C554_BAY.2.U.MsaArtifacts."), "M.C554_BAY.2.U.MsaArtifacts.");
    }

    #[test]
    fn extract_code_from_string_handles_surrounding_whitespace() {
        assert_eq!(extract_code_from_string("  code=abc123  "), "abc123");
    }

    #[test]
    fn percent_decode_decodes_percent_escapes_without_touching_plus() {
        assert_eq!(percent_decode("abc%24%24"), "abc$$");
        // A literal `+` must survive as-is — it's the form-encoding (not
        // URL-query) convention that treats `+` as a space, and an auth
        // code is opaque data, not a form field.
        assert_eq!(percent_decode("a+b"), "a+b");
        assert_eq!(percent_decode("no-escapes-here"), "no-escapes-here");
    }

    #[test]
    fn percent_decode_leaves_a_malformed_percent_sequence_alone_rather_than_panicking() {
        assert_eq!(percent_decode("100% done"), "100% done");
        assert_eq!(percent_decode("trailing%"), "trailing%");
        assert_eq!(percent_decode("trailing%2"), "trailing%2");
    }

    #[test]
    fn extract_code_from_string_percent_decodes_the_code_value() {
        // Reproduces a second real failure, found after the first fix: a
        // genuine MSA authorization code ending in a literal `$$` arrives
        // percent-encoded as `%24%24` in the redirect URL. Sending that
        // encoded form verbatim to Microsoft's token endpoint doesn't match
        // the code it actually issued — AADSTS9002313 again, even with the
        // `code=` prefix already stripped correctly.
        let encoded = "http://localhost:8765/auth?code=M.C554_SN1.2.U.MsaArtifacts.Dpn66%24%24&state=xyz";
        assert_eq!(extract_code_from_string(encoded), "M.C554_SN1.2.U.MsaArtifacts.Dpn66$$");
    }

    #[test]
    #[cfg(not(target_os = "android"))]
    fn extract_code_from_http_request_percent_decodes_the_code_value() {
        let req = "GET /auth?code=abc%24%24 HTTP/1.1\r\nHost: localhost:8765\r\n\r\n";
        assert_eq!(extract_code_from_http_request(req), Some("abc$$".to_string()));
    }

    #[test]
    #[cfg(not(target_os = "android"))]
    fn extract_code_from_http_request_does_not_truncate_a_code_containing_an_equals_sign() {
        // The original `split('=')` (not `splitn(2, '=')`) would have cut
        // the value off at the first internal `=`, silently truncating any
        // code containing one — checked here so a future refactor can't
        // reintroduce it even though today's real-world codes don't
        // (percent-encoded) contain a raw `=`.
        let req = "GET /auth?code=abc=def HTTP/1.1\r\nHost: localhost:8765\r\n\r\n";
        assert_eq!(extract_code_from_http_request(req), Some("abc=def".to_string()));
    }
}
