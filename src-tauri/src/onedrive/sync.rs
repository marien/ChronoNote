use super::auth::{
    build_authorize_url, clear_stored_auth, exchange_code, generate_pkce, load_stored_auth,
    refresh_access_token, save_stored_auth, DEFAULT_CLIENT_ID,
};
use super::client::{OneDriveClient, UploadResult};
use super::{
    OneDriveAccount, OneDriveFolderConfig, OneDriveFolderItem, OneDriveLoginResult,
    OneDriveSyncResult, SyncStatus,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const FOLDER_CONFIG_FILENAME: &str = ".onedrive-folder.json";
pub const SYNC_CACHE_FILENAME: &str = ".onedrive-cache.json";
pub const PENDING_PKCE_FILENAME: &str = ".onedrive-pending-pkce.json";

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

    /// Removes authentication tokens and resets sync cache.
    pub fn logout(&self, data_dir: &Path) -> Result<(), String> {
        clear_stored_auth(data_dir)?;
        let cache_file = data_dir.join(SYNC_CACHE_FILENAME);
        if cache_file.exists() {
            let _ = fs::remove_file(cache_file);
        }
        self.set_status(SyncStatus::Idle);
        Ok(())
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

    /// Performs interactive OAuth 2.0 PKCE login using a local loopback listener.
    pub async fn login_interactive(
        &self,
        app: &tauri::AppHandle,
        data_dir: &Path,
    ) -> OneDriveLoginResult {
        use tauri_plugin_opener::OpenerExt;

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
                }
            }
        };

        // Set non-blocking with timeout
        let _ = listener.set_nonblocking(true);

        let auth_url = build_authorize_url(DEFAULT_CLIENT_ID, redirect_uri, &challenge);

        // Open in user's default browser (cross-platform via tauri-plugin-opener)
        if let Err(e) = app.opener().open_url(&auth_url, None::<&str>) {
            return OneDriveLoginResult {
                success: false,
                account: None,
                error: Some(format!("Failed to open system browser: {e}")),
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
                }
            }
        };

        // Exchange code for tokens
        let mut stored = match exchange_code(
            &self.client.client,
            DEFAULT_CLIENT_ID,
            redirect_uri,
            &code,
            &verifier,
        )
        .await
        {
            Ok(s) => s,
            Err(e) => {
                return OneDriveLoginResult {
                    success: false,
                    account: None,
                    error: Some(e),
                }
            }
        };

        // Fetch user profile
        match self.client.get_user_profile(&stored.access_token).await {
            Ok(account) => {
                stored.account = Some(account.clone());
                if let Err(e) = save_stored_auth(data_dir, &stored) {
                    return OneDriveLoginResult {
                        success: false,
                        account: None,
                        error: Some(format!("Failed to save auth state: {e}")),
                    };
                }
                OneDriveLoginResult {
                    success: true,
                    account: Some(account),
                    error: None,
                }
            }
            Err(e) => OneDriveLoginResult {
                success: false,
                account: None,
                error: Some(format!("Failed to fetch user profile: {e}")),
            },
        }
    }

    /// Exchange an authorization code or full redirect URL directly.
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
                };
            }
        };

        let mut stored = match exchange_code(
            &self.client.client,
            DEFAULT_CLIENT_ID,
            &pending.redirect_uri,
            &code,
            &pending.verifier,
        )
        .await
        {
            Ok(s) => s,
            Err(e) => {
                return OneDriveLoginResult {
                    success: false,
                    account: None,
                    error: Some(e),
                };
            }
        };

        let _ = fs::remove_file(&pending_path);

        match self.client.get_user_profile(&stored.access_token).await {
            Ok(account) => {
                stored.account = Some(account.clone());
                if let Err(e) = save_stored_auth(data_dir, &stored) {
                    return OneDriveLoginResult {
                        success: false,
                        account: None,
                        error: Some(format!("Failed to save auth state: {e}")),
                    };
                }
                OneDriveLoginResult {
                    success: true,
                    account: Some(account),
                    error: None,
                }
            }
            Err(e) => OneDriveLoginResult {
                success: false,
                account: None,
                error: Some(format!("Failed to fetch user profile: {e}")),
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

        let refresh = auth
            .refresh_token
            .as_deref()
            .ok_or_else(|| "No refresh token available, please re-authenticate".to_string())?;

        let mut refreshed = refresh_access_token(&self.client.client, DEFAULT_CLIENT_ID, refresh).await?;
        refreshed.account = auth.account;
        save_stored_auth(data_dir, &refreshed)?;
        Ok(refreshed.access_token)
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

fn extract_code_from_http_request(req: &str) -> Option<String> {
    for line in req.lines() {
        if line.starts_with("GET ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let path = parts[1];
                if let Some(query_idx) = path.find('?') {
                    let query = &path[query_idx + 1..];
                    for param in query.split('&') {
                        let mut kv = param.split('=');
                        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
                            if k == "code" {
                                return Some(v.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn extract_code_from_string(input: &str) -> String {
    let trimmed = input.trim();
    if let Some(query_idx) = trimmed.find('?') {
        let query = &trimmed[query_idx + 1..];
        for param in query.split('&') {
            let mut kv = param.split('=');
            if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
                if k == "code" {
                    return v.to_string();
                }
            }
        }
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
}
