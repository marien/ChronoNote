use super::auth::{
    build_authorize_url, clear_refresh_token, clear_stored_auth, exchange_code, generate_pkce,
    load_refresh_token, load_stored_auth, refresh_access_token, resolve_client_id, resolve_tenant,
    save_refresh_token, save_stored_auth, TokenExchange,
};
use super::client::{DeleteResult, OneDriveClient, UploadResult};
use super::{
    OneDriveAccount, OneDriveAdvancedConfig, OneDriveFolderConfig, OneDriveFolderItem,
    OneDriveLoginResult, OneDriveSyncResult, SyncConflict, SyncStatus,
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

/// The cloud's version of a note the user still has to reconcile with their
/// local one. While an entry exists the file is never uploaded or touched.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct PendingConflict {
    pub remote_content: String,
    pub remote_id: String,
    pub remote_etag: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct SyncCache {
    pub delta_link: Option<String>,
    pub files: HashMap<String, FileCacheEntry>,
    #[serde(default)]
    pub conflicts: std::collections::BTreeMap<String, PendingConflict>,
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
        // The sync cache is deliberately kept: it records which version of
        // each file was last synced. Wiping it made every local file look
        // "never synced" after signing back in, which is how a reconnect used
        // to overwrite newer cloud edits. Changing folder already resets it.
        self.set_status(SyncStatus::Idle);
        Ok(())
    }

    /// The app deleted this note locally (an empty dated note whose tab was
    /// closed). Remembers it so the next sync can delete the cloud copy too.
    /// A no-op unless OneDrive sync is set up, and for non-note files.
    pub fn record_local_delete(&self, data_dir: &Path, name: &str) {
        if !is_syncable_file(name) || self.get_folder(data_dir).is_none() {
            return;
        }
        let _guard = TOMBSTONE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut set = read_tombstones_unlocked(data_dir);
        if set.insert(name.to_string()) {
            let _ = write_tombstones_unlocked(data_dir, &set);
        }
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
        let same_folder = self.get_folder(data_dir).is_some_and(|old| old.folder_id == config.folder_id);
        let path = data_dir.join(FOLDER_CONFIG_FILENAME);
        let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(path, raw).map_err(|e| e.to_string())?;

        // A different folder means different remote items: the delta link
        // and every cached id/etag belong to the old one. Re-picking the
        // same folder keeps its cache (the delta link is just reset, which
        // costs one full listing but loses nothing).
        let mut cache = if same_folder { self.load_cache(data_dir) } else { SyncCache::default() };
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

    /// Notes whose local and cloud versions couldn't be merged automatically.
    pub fn conflicts(&self, data_dir: &Path, notes_dir: &Path) -> Vec<SyncConflict> {
        list_conflicts(notes_dir, &self.load_cache(data_dir))
    }

    /// Applies the user's choice (`mine` / `theirs` / `both`) to a held
    /// conflict. The caller triggers a sync afterwards to upload the result.
    pub fn resolve_conflict(
        &self,
        data_dir: &Path,
        notes_dir: &Path,
        name: &str,
        resolution: &str,
    ) -> Result<(), String> {
        // A sync in flight holds its own copy of the cache and would write it
        // back over this resolution.
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return Err("A sync is running — try again in a moment".to_string());
        }
        let mut cache = self.load_cache(data_dir);
        let result = resolve_conflict_files(notes_dir, data_dir, name, resolution, &mut cache)
            .and_then(|_| self.save_cache(data_dir, &cache));
        self.is_syncing.store(false, Ordering::SeqCst);
        result
    }

    /// Runs the sync and — crucially — persists whatever progress the cache
    /// made even when the sync itself fails partway (a dropped connection is
    /// routine on a phone). The cache used to be saved only on full success,
    /// so an interrupted sync left files already written to disk with a
    /// stale cache entry, and the next run mistook them for local edits.
    async fn execute_sync(&self, data_dir: &Path, notes_dir: &Path) -> Result<(), String> {
        let mut cache = self.load_cache(data_dir);
        let result = self.sync_inner(data_dir, notes_dir, &mut cache).await;
        let saved = self.save_cache(data_dir, &cache);
        result.and(saved)
    }

    async fn sync_inner(
        &self,
        data_dir: &Path,
        notes_dir: &Path,
        cache: &mut SyncCache,
    ) -> Result<(), String> {
        let folder_cfg = self
            .get_folder(data_dir)
            .ok_or_else(|| "No OneDrive folder chosen yet — pick one in Settings".to_string())?;

        let token = self.get_valid_access_token(data_dir).await?;

        fs::create_dir_all(notes_dir).map_err(|e| e.to_string())?;

        // 1. PULL: Fetch remote changes via delta query
        let delta_res = self
            .client
            .get_folder_delta(&token, &folder_cfg.folder_id, cache.delta_link.as_deref())
            .await?;

        // A listing that starts from scratch (no saved delta link) contains
        // every file that exists, but says nothing about the ones that are
        // gone — those are found below by what's missing from it.
        let full_listing = cache.delta_link.as_deref().map_or(true, str::is_empty);
        let mut seen_in_listing = std::collections::HashSet::new();

        for item in delta_res.changes {
            if item.is_deleted {
                // OneDrive may report a deletion by id alone.
                if let Some(name) = name_for_deleted_item(cache, &item.id, item.name.as_deref()) {
                    if is_syncable_file(&name) {
                        apply_remote_delete(notes_dir, &name, cache)?;
                    }
                }
                continue;
            }

            let Some(name) = item.name else { continue };
            if !is_syncable_file(&name) {
                continue;
            }
            seen_in_listing.insert(name.clone());

            // Our own upload (or a version we already pulled) comes back in
            // the change list too. Treating it as news would re-download it
            // and, if the note was deleted locally in the meantime, restore
            // it — undoing the delete.
            if already_have_version(cache, data_dir, &name, item.etag.as_deref()) {
                continue;
            }

            let remote_content = self.client.download_file_content(&token, &item.id).await?;
            apply_remote_change(
                notes_dir,
                data_dir,
                &name,
                &item.id,
                item.etag.as_deref().unwrap_or_default(),
                &remote_content,
                cache,
            )?;
        }

        if full_listing {
            for name in missed_remote_deletes(cache, &seen_in_listing) {
                apply_remote_delete(notes_dir, &name, cache)?;
            }
        }

        if let Some(link) = delta_res.delta_link {
            cache.delta_link = Some(link);
        }

        // 2. PUSH: Scan local files and upload new/modified ones
        let local_files = list_syncable_local_files(notes_dir)?;

        // One file that can't be uploaded (unreadable, rejected by OneDrive)
        // must not stop every other note from syncing: remember the first
        // failure, keep going, and report it once the pass is done.
        let mut first_error: Option<String> = None;

        // Notes the app deleted locally (an empty dated note whose tab was
        // closed): remove the cloud copy too, but only while it's still the
        // version we last synced. Runs after the pull, so a note that
        // someone edited elsewhere has already been restored by then and is
        // left alone.
        let tombstones = read_tombstones(data_dir);
        if !tombstones.is_empty() {
            let (plans, mut settled) = plan_remote_deletes(notes_dir, cache, &tombstones);
            for plan in plans {
                match self.client.delete_item(&token, &plan.id, Some(&plan.etag)).await {
                    Ok(DeleteResult::Deleted) => {
                        cache.files.remove(&plan.name);
                        let _ = fs::remove_file(base_path(data_dir, &plan.name));
                        settled.push(plan.name);
                    }
                    // Changed elsewhere: keep it. The next pull brings the
                    // newer version back, since the local file is gone.
                    Ok(DeleteResult::Changed) => settled.push(plan.name),
                    // Transient failure: keep the tombstone and retry next sync.
                    Err(e) => {
                        first_error.get_or_insert(format!("{}: {e}", plan.name));
                    }
                }
            }
            clear_tombstones(data_dir, &settled);
        }

        for filename in local_files {
            // Waiting on the user to resolve a conflict: uploading now would
            // overwrite the cloud version they haven't seen.
            if cache.conflicts.contains_key(&filename) {
                continue;
            }
            let file_path = notes_dir.join(&filename);
            let content = match fs::read_to_string(&file_path) {
                Ok(c) => c,
                Err(e) => {
                    first_error.get_or_insert(format!("Couldn't read {filename}: {e}"));
                    continue;
                }
            };
            let local_hash = compute_hash(content.as_bytes());

            // An empty note that was never synced isn't worth a cloud file
            // (the app makes plenty by just opening a date).
            if content.is_empty() && !cache.files.contains_key(&filename) {
                continue;
            }

            let needs_upload = match cache.files.get(&filename) {
                Some(cached) => cached.local_hash != local_hash,
                None => true,
            };

            if !needs_upload {
                continue;
            }

            let cached_etag = cache.files.get(&filename).map(|f| f.etag.as_str());

            let uploaded = match self
                .client
                .upload_file_content(
                    &token,
                    &folder_cfg.folder_id,
                    &filename,
                    &content,
                    cached_etag,
                )
                .await
            {
                Ok(u) => u,
                Err(e) => {
                    first_error.get_or_insert(format!("{filename}: {e}"));
                    continue;
                }
            };
            match uploaded {
                UploadResult::Success { id, etag } => {
                    save_base(data_dir, &filename, &content)?;
                    cache.files.insert(
                        filename,
                        FileCacheEntry {
                            id,
                            etag,
                            local_hash,
                        },
                    );
                }
                // Precondition failed: another device changed the file on
                // OneDrive after this sync's pull. Nothing is lost — the
                // local file is untouched, and the next sync's pull sees the
                // newer remote version and merges or holds it properly.
                UploadResult::Conflict => {}
            }
        }

        match first_error {
            Some(e) => Err(e),
            None => Ok(()),
        }
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

/// What to do with a remote create/update for a file we may also have
/// locally. Decided purely from content hashes so it can be unit-tested
/// without a network — the network-touching code only feeds it inputs.
#[derive(Debug, PartialEq, Eq)]
enum RemoteChangeAction {
    /// Local file is absent, or unchanged since the last sync: take remote.
    WriteLocal,
    /// Local already holds exactly the remote bytes (typically a sync that
    /// was interrupted after writing the file but before saving the cache):
    /// nothing to write, just record it. Treating this as a conflict used to
    /// spawn a spurious conflict copy plus a pointless upload.
    AdoptRemote,
    /// Both sides changed the file (or this device never synced it but a
    /// different version exists in the cloud). Resolved by a three-way merge
    /// when there's a stored base version, else held for the user.
    Divergent,
}

/// What `apply_remote_change` actually did.
#[derive(Debug, PartialEq, Eq)]
enum ChangeOutcome {
    /// Remote content is now the local file.
    TookRemote,
    /// Local already equalled remote.
    Adopted,
    /// Both sides' edits were combined into the local file; the push
    /// uploads the result.
    Merged,
    /// Genuine conflict: the local file is untouched, the remote version is
    /// stored in `SyncCache::conflicts`, and the push skips this file until
    /// the user resolves it.
    Held,
}

fn classify_remote_change(
    local_hash: Option<&str>,
    cached: Option<&FileCacheEntry>,
    remote_hash: &str,
) -> RemoteChangeAction {
    match local_hash {
        None => RemoteChangeAction::WriteLocal,
        Some(local) if local == remote_hash => RemoteChangeAction::AdoptRemote,
        Some(local) => match cached {
            Some(c) if c.local_hash == local => RemoteChangeAction::WriteLocal,
            _ => RemoteChangeAction::Divergent,
        },
    }
}

const BASES_DIRNAME: &str = ".onedrive-bases";

/// The last version of `name` both sides agreed on — the common ancestor a
/// three-way merge needs. Kept beside the sync cache (never in the notes
/// folder), one file per note.
fn base_path(data_dir: &Path, name: &str) -> std::path::PathBuf {
    data_dir.join(BASES_DIRNAME).join(name)
}

fn save_base(data_dir: &Path, name: &str, content: &str) -> Result<(), String> {
    let path = base_path(data_dir, name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

fn load_base(data_dir: &Path, name: &str) -> Option<String> {
    fs::read_to_string(base_path(data_dir, name)).ok()
}

fn apply_remote_change(
    notes_dir: &Path,
    data_dir: &Path,
    name: &str,
    id: &str,
    etag: &str,
    remote_content: &str,
    cache: &mut SyncCache,
) -> Result<ChangeOutcome, String> {
    let local_path = notes_dir.join(name);
    let local_hash = if local_path.exists() {
        Some(hash_file(&local_path)?)
    } else {
        None
    };
    let remote_hash = compute_hash(remote_content.as_bytes());
    let rebased = FileCacheEntry {
        id: id.to_string(),
        etag: etag.to_string(),
        local_hash: remote_hash.clone(),
    };

    // The user already made the two sides identical (or the remote moved on
    // to match): whatever was held is moot.
    if local_hash.as_deref() == Some(remote_hash.as_str()) {
        cache.conflicts.remove(name);
        save_base(data_dir, name, remote_content)?;
        cache.files.insert(name.to_string(), rebased);
        return Ok(ChangeOutcome::Adopted);
    }

    // A conflict is already waiting on the user: never touch the local file
    // again, just remember the newest remote version for them to see.
    if cache.conflicts.contains_key(name) {
        cache.conflicts.insert(
            name.to_string(),
            PendingConflict { remote_content: remote_content.to_string(), remote_id: id.to_string(), remote_etag: etag.to_string() },
        );
        return Ok(ChangeOutcome::Held);
    }

    let outcome = match classify_remote_change(local_hash.as_deref(), cache.files.get(name), &remote_hash) {
        RemoteChangeAction::WriteLocal => {
            fs::write(&local_path, remote_content.as_bytes()).map_err(|e| e.to_string())?;
            ChangeOutcome::TookRemote
        }
        RemoteChangeAction::AdoptRemote => ChangeOutcome::Adopted,
        RemoteChangeAction::Divergent => {
            let local_content = fs::read_to_string(&local_path).map_err(|e| e.to_string())?;
            // A blank local note has nothing to lose or conflict with (a fresh
            // install, or a day opened but never typed in): the cloud version
            // simply wins, instead of asking the user to "resolve" it.
            if local_content.trim().is_empty() {
                fs::write(&local_path, remote_content.as_bytes()).map_err(|e| e.to_string())?;
                save_base(data_dir, name, remote_content)?;
                cache.files.insert(name.to_string(), rebased);
                return Ok(ChangeOutcome::TookRemote);
            }
            // Merging needs the version both sides started from; a file with
            // no recorded ancestor (first contact, or synced before bases
            // were kept) can't be merged safely.
            let merged = match (cache.files.contains_key(name), load_base(data_dir, name)) {
                (true, Some(base)) => super::merge::merge3(&base, &local_content, remote_content),
                _ => super::merge::Merge::Conflict,
            };
            match merged {
                super::merge::Merge::Clean(text) => {
                    fs::write(&local_path, text.as_bytes()).map_err(|e| e.to_string())?;
                    // Rebase onto the remote version: local now differs from
                    // the cached hash, so the push uploads the merged text
                    // with If-Match = the remote etag.
                    save_base(data_dir, name, remote_content)?;
                    cache.files.insert(name.to_string(), rebased);
                    return Ok(ChangeOutcome::Merged);
                }
                super::merge::Merge::Conflict => {
                    cache.conflicts.insert(
                        name.to_string(),
                        PendingConflict {
                            remote_content: remote_content.to_string(),
                            remote_id: id.to_string(),
                            remote_etag: etag.to_string(),
                        },
                    );
                    return Ok(ChangeOutcome::Held);
                }
            }
        }
    };

    save_base(data_dir, name, remote_content)?;
    cache.files.insert(name.to_string(), rebased);
    Ok(outcome)
}

/// A note the user has to resolve, for the UI: both full texts side by side.
pub fn list_conflicts(notes_dir: &Path, cache: &SyncCache) -> Vec<SyncConflict> {
    cache
        .conflicts
        .iter()
        .map(|(name, pending)| SyncConflict {
            name: name.clone(),
            local: fs::read_to_string(notes_dir.join(name)).unwrap_or_default(),
            remote: pending.remote_content.clone(),
        })
        .collect()
}

/// Applies the user's choice for a held conflict.
///  - `mine`:   keep the local text; the next push overwrites the cloud copy.
///  - `theirs`: take the cloud text; the local text is discarded.
///  - `both`:   keep the local text and append the cloud text under a marker.
fn resolve_conflict_files(
    notes_dir: &Path,
    data_dir: &Path,
    name: &str,
    resolution: &str,
    cache: &mut SyncCache,
) -> Result<(), String> {
    let pending = cache
        .conflicts
        .get(name)
        .cloned()
        .ok_or_else(|| format!("{name} has no sync conflict to resolve"))?;
    let local_path = notes_dir.join(name);

    match resolution {
        "mine" => {}
        "theirs" => {
            fs::write(&local_path, pending.remote_content.as_bytes()).map_err(|e| e.to_string())?;
        }
        "both" => {
            let local = fs::read_to_string(&local_path).unwrap_or_default();
            let combined = format!(
                "{}\n\n--- other version (sync conflict) ---\n{}",
                local.trim_end(),
                pending.remote_content
            );
            fs::write(&local_path, combined.as_bytes()).map_err(|e| e.to_string())?;
        }
        other => return Err(format!("Unknown resolution: {other}")),
    }

    // Rebase onto the remote version. For "mine"/"both" the local text now
    // differs from the cached hash, so the push uploads it with
    // If-Match = the remote etag — a deliberate overwrite. For "theirs" the
    // hashes match and nothing is uploaded.
    save_base(data_dir, name, &pending.remote_content)?;
    cache.files.insert(
        name.to_string(),
        FileCacheEntry {
            id: pending.remote_id,
            etag: pending.remote_etag,
            local_hash: compute_hash(pending.remote_content.as_bytes()),
        },
    );
    cache.conflicts.remove(name);
    Ok(())
}

/// True when this delta entry is a version we already hold: same etag as the
/// cache, and a stored base so nothing is lost by not looking at it. (A note
/// synced before bases were kept still goes through the normal path once, so
/// it gets one.)
fn already_have_version(cache: &SyncCache, data_dir: &Path, name: &str, etag: Option<&str>) -> bool {
    match (cache.files.get(name), etag) {
        (Some(entry), Some(etag)) => entry.etag == etag && !cache.conflicts.contains_key(name) && load_base(data_dir, name).is_some(),
        _ => false,
    }
}

// --- local deletions (tombstones) ---------------------------------------

const TOMBSTONES_FILENAME: &str = ".onedrive-deleted.json";
/// `delete_note` (a command thread) and the sync both touch the file.
static TOMBSTONE_LOCK: Mutex<()> = Mutex::new(());

fn read_tombstones(data_dir: &Path) -> std::collections::BTreeSet<String> {
    let _guard = TOMBSTONE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    read_tombstones_unlocked(data_dir)
}

fn read_tombstones_unlocked(data_dir: &Path) -> std::collections::BTreeSet<String> {
    fs::read_to_string(data_dir.join(TOMBSTONES_FILENAME))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_tombstones_unlocked(data_dir: &Path, set: &std::collections::BTreeSet<String>) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string(set).map_err(|e| e.to_string())?;
    fs::write(data_dir.join(TOMBSTONES_FILENAME), raw).map_err(|e| e.to_string())
}

/// Forgets tombstones that have been dealt with. Re-reads the file so a note
/// deleted while the sync was running isn't lost.
fn clear_tombstones(data_dir: &Path, names: &[String]) {
    let _guard = TOMBSTONE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut set = read_tombstones_unlocked(data_dir);
    let before = set.len();
    for n in names {
        set.remove(n);
    }
    if set.len() != before {
        let _ = write_tombstones_unlocked(data_dir, &set);
    }
}

struct RemoteDeletePlan {
    name: String,
    id: String,
    etag: String,
}

/// Which tombstoned notes need a cloud delete, and which are already moot
/// (`settled`) and just need forgetting: the file is back locally (the pull
/// restored a newer cloud version, or it was recreated), the note is held in
/// a conflict, or it was never synced so there's nothing in the cloud.
fn plan_remote_deletes(
    notes_dir: &Path,
    cache: &SyncCache,
    tombstones: &std::collections::BTreeSet<String>,
) -> (Vec<RemoteDeletePlan>, Vec<String>) {
    let mut plans = Vec::new();
    let mut settled = Vec::new();
    for name in tombstones {
        if notes_dir.join(name).exists() || cache.conflicts.contains_key(name) {
            settled.push(name.clone());
            continue;
        }
        match cache.files.get(name) {
            Some(entry) => plans.push(RemoteDeletePlan { name: name.clone(), id: entry.id.clone(), etag: entry.etag.clone() }),
            None => settled.push(name.clone()),
        }
    }
    (plans, settled)
}

/// The note a delta "deleted" entry refers to: its own name when OneDrive
/// sent one, otherwise the cached note with that item id.
fn name_for_deleted_item(cache: &SyncCache, id: &str, name: Option<&str>) -> Option<String> {
    match name {
        Some(n) => Some(n.to_string()),
        None => cache.files.iter().find(|(_, e)| e.id == id).map(|(n, _)| n.clone()),
    }
}

/// After a from-scratch listing: cached notes the cloud no longer has.
/// (Only meaningful for a *complete* listing — never call it for an
/// incremental delta, which lists just what changed.)
fn missed_remote_deletes(cache: &SyncCache, seen: &std::collections::HashSet<String>) -> Vec<String> {
    let mut gone: Vec<String> = cache
        .files
        .keys()
        .filter(|n| is_syncable_file(n) && !seen.contains(*n))
        .cloned()
        .collect();
    gone.sort();
    gone
}

#[derive(Debug, PartialEq, Eq)]
enum RemoteDeleteAction {
    DeleteLocal,
    /// Local was edited since the last sync (or never synced): a remote
    /// deletion must not destroy unsynced work. The file stays, and losing
    /// its cache entry makes the push re-upload it as a new file.
    KeepLocal,
}

fn classify_remote_delete(local_hash: Option<&str>, cached: Option<&FileCacheEntry>) -> RemoteDeleteAction {
    match (local_hash, cached) {
        (None, _) => RemoteDeleteAction::DeleteLocal,
        (Some(local), Some(c)) if c.local_hash == local => RemoteDeleteAction::DeleteLocal,
        _ => RemoteDeleteAction::KeepLocal,
    }
}

fn apply_remote_delete(
    notes_dir: &Path,
    name: &str,
    cache: &mut SyncCache,
) -> Result<RemoteDeleteAction, String> {
    let local_path = notes_dir.join(name);
    let local_hash = if local_path.exists() {
        Some(hash_file(&local_path)?)
    } else {
        None
    };
    let action = classify_remote_delete(local_hash.as_deref(), cache.files.get(name));
    if action == RemoteDeleteAction::DeleteLocal && local_path.exists() {
        fs::remove_file(&local_path).map_err(|e| e.to_string())?;
    }
    cache.files.remove(name);
    // Whatever was waiting on the user is moot: the cloud version is gone,
    // and a kept local file is simply re-uploaded as a new file.
    cache.conflicts.remove(name);
    Ok(action)
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

    // --- sync decision logic (pure filesystem, no network) ----------------

    const NOTE: &str = "2026-09-18.txt";

    fn cache_with(name: &str, content: &str, etag: &str) -> SyncCache {
        let mut cache = SyncCache::default();
        cache.files.insert(
            name.to_string(),
            FileCacheEntry {
                id: "id-1".to_string(),
                etag: etag.to_string(),
                local_hash: compute_hash(content.as_bytes()),
            },
        );
        cache
    }

    /// (notes folder, app data folder) — separate, like on a device.
    fn dirs() -> (tempfile::TempDir, tempfile::TempDir) {
        (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap())
    }

    fn apply(
        notes: &Path,
        data: &Path,
        etag: &str,
        remote: &str,
        cache: &mut SyncCache,
    ) -> ChangeOutcome {
        apply_remote_change(notes, data, NOTE, "id-1", etag, remote, cache).unwrap()
    }

    #[test]
    fn a_new_remote_file_is_written_locally_cached_and_kept_as_the_base() {
        let (notes, data) = dirs();
        let mut cache = SyncCache::default();
        assert_eq!(apply(notes.path(), data.path(), "e1", "from phone", &mut cache), ChangeOutcome::TookRemote);
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "from phone");
        assert_eq!(cache.files[NOTE].etag, "e1");
        assert_eq!(cache.files[NOTE].local_hash, compute_hash(b"from phone"));
        assert_eq!(load_base(data.path(), NOTE).as_deref(), Some("from phone"));
    }

    #[test]
    fn a_remote_update_overwrites_a_local_file_that_has_not_changed_since_the_last_sync() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "v1").unwrap();
        let mut cache = cache_with(NOTE, "v1", "e1");
        assert_eq!(apply(notes.path(), data.path(), "e2", "v2", &mut cache), ChangeOutcome::TookRemote);
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "v2");
        assert!(cache.conflicts.is_empty());
    }

    #[test]
    fn edits_to_different_lines_on_both_sides_are_merged_and_queued_for_upload() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "ONE\ntwo\nthree\n").unwrap(); // local edit
        let mut cache = cache_with(NOTE, "one\ntwo\nthree\n", "e1");
        save_base(data.path(), NOTE, "one\ntwo\nthree\n").unwrap();

        let outcome = apply(notes.path(), data.path(), "e2", "one\ntwo\nTHREE\n", &mut cache);

        assert_eq!(outcome, ChangeOutcome::Merged);
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "ONE\ntwo\nTHREE\n");
        assert!(cache.conflicts.is_empty());
        // Rebased onto the remote: local != cached hash, so the push uploads
        // the merged text with the current etag.
        assert_eq!(cache.files[NOTE].etag, "e2");
        assert_ne!(cache.files[NOTE].local_hash, compute_hash(b"ONE\ntwo\nTHREE\n"));
        assert_eq!(load_base(data.path(), NOTE).as_deref(), Some("one\ntwo\nTHREE\n"));
    }

    #[test]
    fn both_sides_appending_a_line_keeps_both_lines() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "a\nb\nCONFLICT phone edit\n").unwrap();
        let mut cache = cache_with(NOTE, "a\nb\n", "e1");
        save_base(data.path(), NOTE, "a\nb\n").unwrap();

        let outcome = apply(notes.path(), data.path(), "e2", "a\nb\nCONFLICT pc edit\n", &mut cache);

        assert_eq!(outcome, ChangeOutcome::Merged);
        assert_eq!(
            fs::read_to_string(notes.path().join(NOTE)).unwrap(),
            "a\nb\nCONFLICT pc edit\nCONFLICT phone edit\n"
        );
    }

    #[test]
    fn editing_the_same_line_on_both_sides_is_held_and_leaves_the_local_file_alone() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "one\nphone\n").unwrap();
        let mut cache = cache_with(NOTE, "one\ntwo\n", "e1");
        save_base(data.path(), NOTE, "one\ntwo\n").unwrap();

        let outcome = apply(notes.path(), data.path(), "e2", "one\npc\n", &mut cache);

        assert_eq!(outcome, ChangeOutcome::Held);
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "one\nphone\n");
        assert_eq!(cache.conflicts[NOTE].remote_content, "one\npc\n");
        // Cache untouched: nothing may look like it needs uploading over the cloud copy.
        assert_eq!(cache.files[NOTE].etag, "e1");
        let listed = list_conflicts(notes.path(), &cache);
        assert_eq!(listed.len(), 1);
        assert_eq!((listed[0].local.as_str(), listed[0].remote.as_str()), ("one\nphone\n", "one\npc\n"));
    }

    #[test]
    fn a_never_synced_local_file_that_differs_from_remote_is_held_not_overwritten() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "local only").unwrap();
        let mut cache = SyncCache::default();
        assert_eq!(apply(notes.path(), data.path(), "e1", "remote", &mut cache), ChangeOutcome::Held);
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "local only");
        assert!(cache.conflicts.contains_key(NOTE));
        assert!(!cache.files.contains_key(NOTE));
    }

    #[test]
    fn a_blank_local_note_never_conflicts_the_cloud_version_just_wins() {
        // Fresh install: the phone has an empty note with the same name as a
        // real one in OneDrive. Nothing to lose, so no conflict prompt.
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "  \n").unwrap();
        let mut cache = SyncCache::default();
        assert_eq!(apply(notes.path(), data.path(), "e1", "real note\n", &mut cache), ChangeOutcome::TookRemote);
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "real note\n");
        assert!(cache.conflicts.is_empty());
        assert_eq!(load_base(data.path(), NOTE).as_deref(), Some("real note\n"));
    }

    #[test]
    fn a_synced_file_with_no_recorded_base_cannot_be_merged_and_is_held() {
        // Synced by an older build, before bases were kept.
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "a\nb\nphone\n").unwrap();
        let mut cache = cache_with(NOTE, "a\nb\n", "e1");
        assert_eq!(apply(notes.path(), data.path(), "e2", "a\nb\npc\n", &mut cache), ChangeOutcome::Held);
    }

    #[test]
    fn a_newer_remote_version_of_a_held_file_updates_what_the_user_will_see() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "local edit").unwrap();
        let mut cache = SyncCache::default();
        apply(notes.path(), data.path(), "e1", "remote v1", &mut cache);
        assert_eq!(apply(notes.path(), data.path(), "e2", "remote v2", &mut cache), ChangeOutcome::Held);
        assert_eq!(cache.conflicts[NOTE].remote_content, "remote v2");
        assert_eq!(cache.conflicts[NOTE].remote_etag, "e2");
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "local edit");
    }

    #[test]
    fn making_both_sides_identical_dissolves_a_held_conflict() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "local edit").unwrap();
        let mut cache = SyncCache::default();
        apply(notes.path(), data.path(), "e1", "remote", &mut cache);
        fs::write(notes.path().join(NOTE), "remote").unwrap(); // user made them match
        assert_eq!(apply(notes.path(), data.path(), "e1", "remote", &mut cache), ChangeOutcome::Adopted);
        assert!(cache.conflicts.is_empty());
    }

    #[test]
    fn identical_content_is_not_a_conflict_even_with_a_stale_cache() {
        // An earlier sync wrote this file, then died before saving the cache.
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "v2").unwrap();
        let mut cache = cache_with(NOTE, "v1", "e1");
        assert_eq!(apply(notes.path(), data.path(), "e2", "v2", &mut cache), ChangeOutcome::Adopted);
        assert!(cache.conflicts.is_empty());
        assert_eq!(cache.files[NOTE].etag, "e2");
        assert_eq!(cache.files[NOTE].local_hash, compute_hash(b"v2"));
    }

    // --- resolving a held conflict -----------------------------------------

    fn held(notes: &Path, data: &Path) -> SyncCache {
        fs::write(notes.join(NOTE), "phone version\n").unwrap();
        let mut cache = SyncCache::default();
        assert_eq!(apply(notes, data, "e7", "pc version\n", &mut cache), ChangeOutcome::Held);
        cache
    }

    #[test]
    fn resolving_with_mine_keeps_local_and_queues_an_overwrite_with_the_current_etag() {
        let (notes, data) = dirs();
        let mut cache = held(notes.path(), data.path());
        resolve_conflict_files(notes.path(), data.path(), NOTE, "mine", &mut cache).unwrap();
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "phone version\n");
        assert!(cache.conflicts.is_empty());
        assert_eq!(cache.files[NOTE].etag, "e7");
        assert_ne!(cache.files[NOTE].local_hash, compute_hash(b"phone version\n")); // -> uploads
        assert_eq!(load_base(data.path(), NOTE).as_deref(), Some("pc version\n"));
    }

    #[test]
    fn resolving_with_theirs_takes_the_cloud_text_and_uploads_nothing() {
        let (notes, data) = dirs();
        let mut cache = held(notes.path(), data.path());
        resolve_conflict_files(notes.path(), data.path(), NOTE, "theirs", &mut cache).unwrap();
        assert_eq!(fs::read_to_string(notes.path().join(NOTE)).unwrap(), "pc version\n");
        assert_eq!(cache.files[NOTE].local_hash, compute_hash(b"pc version\n"));
        assert!(cache.conflicts.is_empty());
    }

    #[test]
    fn resolving_with_both_keeps_both_texts_and_uploads_the_result() {
        let (notes, data) = dirs();
        let mut cache = held(notes.path(), data.path());
        resolve_conflict_files(notes.path(), data.path(), NOTE, "both", &mut cache).unwrap();
        let text = fs::read_to_string(notes.path().join(NOTE)).unwrap();
        assert!(text.starts_with("phone version\n"));
        assert!(text.contains("--- other version (sync conflict) ---"));
        assert!(text.ends_with("pc version\n"));
        assert_ne!(cache.files[NOTE].local_hash, compute_hash(text.as_bytes())); // -> uploads
    }

    #[test]
    fn resolving_rejects_an_unknown_choice_and_a_note_without_a_conflict() {
        let (notes, data) = dirs();
        let mut cache = held(notes.path(), data.path());
        assert!(resolve_conflict_files(notes.path(), data.path(), NOTE, "shrug", &mut cache).is_err());
        assert!(cache.conflicts.contains_key(NOTE)); // still waiting
        assert!(resolve_conflict_files(notes.path(), data.path(), "2000-01-01.txt", "mine", &mut cache).is_err());
    }

    #[test]
    fn a_remote_delete_removes_an_unchanged_local_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(NOTE), "v1").unwrap();
        let mut cache = cache_with(NOTE, "v1", "e1");
        let action = apply_remote_delete(dir.path(), NOTE, &mut cache).unwrap();
        assert_eq!(action, RemoteDeleteAction::DeleteLocal);
        assert!(!dir.path().join(NOTE).exists());
        assert!(!cache.files.contains_key(NOTE));
    }

    #[test]
    fn a_remote_delete_never_destroys_unsynced_local_edits() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(NOTE), "v1 + edits made offline").unwrap();
        let mut cache = cache_with(NOTE, "v1", "e1");
        let action = apply_remote_delete(dir.path(), NOTE, &mut cache).unwrap();
        assert_eq!(action, RemoteDeleteAction::KeepLocal);
        assert_eq!(fs::read_to_string(dir.path().join(NOTE)).unwrap(), "v1 + edits made offline");
        // No cache entry left, so the push re-uploads it as a new file.
        assert!(!cache.files.contains_key(NOTE));
    }

    #[test]
    fn a_remote_delete_keeps_a_local_file_that_was_never_synced() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(NOTE), "brand new").unwrap();
        let mut cache = SyncCache::default();
        assert_eq!(
            apply_remote_delete(dir.path(), NOTE, &mut cache).unwrap(),
            RemoteDeleteAction::KeepLocal
        );
        assert!(dir.path().join(NOTE).exists());
    }

    #[test]
    fn a_remote_delete_for_a_file_we_do_not_have_is_a_harmless_no_op() {
        let dir = tempfile::tempdir().unwrap();
        let mut cache = cache_with(NOTE, "v1", "e1");
        assert_eq!(
            apply_remote_delete(dir.path(), NOTE, &mut cache).unwrap(),
            RemoteDeleteAction::DeleteLocal
        );
        assert!(!cache.files.contains_key(NOTE));
    }

    // --- Android backup exclusion ------------------------------------------

    /// Everything OneDrive keeps in the app data folder must stay out of
    /// Google Auto Backup (tokens are credentials; the rest is meaningless
    /// without them). This fails when a new state file is added to the code
    /// but not to the rules in `android-overrides/res/xml/`.
    #[test]
    fn every_onedrive_state_file_is_excluded_from_android_backup() {
        let rules = [
            include_str!("../../android-overrides/res/xml/backup_rules.xml"),
            include_str!("../../android-overrides/res/xml/data_extraction_rules.xml"),
        ];
        let state = [
            super::super::auth::AUTH_FILENAME,
            super::super::auth::REFRESH_TOKEN_FILENAME,
            FOLDER_CONFIG_FILENAME,
            SYNC_CACHE_FILENAME,
            PENDING_PKCE_FILENAME,
            ADVANCED_CONFIG_FILENAME,
            TOMBSTONES_FILENAME,
            BASES_DIRNAME,
        ];
        for file in rules {
            for name in state {
                assert!(
                    file.contains(&format!("domain=\"root\" path=\"{name}\"")),
                    "{name} is missing from a backup exclusion file"
                );
            }
        }
    }

    // --- deleting an emptied note in the cloud too --------------------------

    fn tombs(names: &[&str]) -> std::collections::BTreeSet<String> {
        names.iter().map(|n| n.to_string()).collect()
    }

    #[test]
    fn our_own_upload_coming_back_in_the_change_list_is_not_treated_as_news() {
        let (_notes, data) = dirs();
        let cache = cache_with(NOTE, "v1", "e1");
        // No base stored yet: still goes through the normal path (to get one).
        assert!(!already_have_version(&cache, data.path(), NOTE, Some("e1")));
        save_base(data.path(), NOTE, "v1").unwrap();
        assert!(already_have_version(&cache, data.path(), NOTE, Some("e1")));
        assert!(!already_have_version(&cache, data.path(), NOTE, Some("e2"))); // a newer version
        assert!(!already_have_version(&cache, data.path(), "2026-02-02.txt", Some("e1"))); // unknown note
        assert!(!already_have_version(&cache, data.path(), NOTE, None));
    }

    #[test]
    fn a_held_conflict_never_skips_a_delta_entry() {
        let (notes, data) = dirs();
        fs::write(notes.path().join(NOTE), "local").unwrap();
        let mut cache = SyncCache::default();
        apply(notes.path(), data.path(), "e1", "remote", &mut cache); // held (first contact)
        save_base(data.path(), NOTE, "remote").unwrap();
        cache.files.insert(NOTE.into(), FileCacheEntry { id: "i".into(), etag: "e1".into(), local_hash: "h".into() });
        assert!(!already_have_version(&cache, data.path(), NOTE, Some("e1")));
    }

    #[test]
    fn a_synced_note_deleted_locally_is_planned_for_a_cloud_delete_with_its_last_etag() {
        let (notes, _data) = dirs();
        let cache = cache_with(NOTE, "", "e5"); // file is absent locally
        let (plans, settled) = plan_remote_deletes(notes.path(), &cache, &tombs(&[NOTE]));
        assert!(settled.is_empty());
        assert_eq!(plans.len(), 1);
        assert_eq!((plans[0].name.as_str(), plans[0].id.as_str(), plans[0].etag.as_str()), (NOTE, "id-1", "e5"));
    }

    #[test]
    fn a_note_that_is_back_on_disk_is_not_deleted_from_the_cloud() {
        // The pull restored a newer cloud version, or the note was recreated.
        let (notes, _data) = dirs();
        fs::write(notes.path().join(NOTE), "back again").unwrap();
        let cache = cache_with(NOTE, "old", "e5");
        let (plans, settled) = plan_remote_deletes(notes.path(), &cache, &tombs(&[NOTE]));
        assert!(plans.is_empty());
        assert_eq!(settled, vec![NOTE.to_string()]);
    }

    #[test]
    fn a_never_synced_or_conflicted_note_needs_no_cloud_delete() {
        let (notes, data) = dirs();
        let empty = SyncCache::default();
        let (plans, settled) = plan_remote_deletes(notes.path(), &empty, &tombs(&[NOTE]));
        assert!(plans.is_empty());
        assert_eq!(settled, vec![NOTE.to_string()]);

        let mut held = SyncCache::default();
        fs::write(notes.path().join("2026-01-05.txt"), "phone").unwrap();
        apply(notes.path(), data.path(), "e1", "cloud", &mut held); // held conflict on NOTE? (different name)
        held.conflicts.insert(
            NOTE.to_string(),
            PendingConflict { remote_content: "c".into(), remote_id: "i".into(), remote_etag: "e".into() },
        );
        held.files.insert(NOTE.to_string(), FileCacheEntry { id: "i".into(), etag: "e".into(), local_hash: "h".into() });
        let (plans, settled) = plan_remote_deletes(notes.path(), &held, &tombs(&[NOTE]));
        assert!(plans.is_empty());
        assert_eq!(settled, vec![NOTE.to_string()]);
    }

    #[test]
    fn deletions_are_only_remembered_when_onedrive_is_set_up_and_only_for_notes() {
        let data = tempfile::tempdir().unwrap();
        let mgr = OneDriveManager::new();

        mgr.record_local_delete(data.path(), NOTE); // no folder configured yet
        assert!(read_tombstones(data.path()).is_empty());

        mgr.set_folder(data.path(), &OneDriveFolderConfig { folder_id: "f".into(), folder_path: "/Notes".into() })
            .unwrap();
        mgr.record_local_delete(data.path(), NOTE);
        mgr.record_local_delete(data.path(), "notes.md"); // not a synced file
        assert_eq!(read_tombstones(data.path()), tombs(&[NOTE]));

        mgr.record_local_delete(data.path(), "2026-01-06.txt");
        clear_tombstones(data.path(), &[NOTE.to_string()]);
        assert_eq!(read_tombstones(data.path()), tombs(&["2026-01-06.txt"]));
    }

    #[test]
    fn a_deletion_recorded_during_a_sync_survives_the_sync_clearing_its_own() {
        let data = tempfile::tempdir().unwrap();
        let mgr = OneDriveManager::new();
        mgr.set_folder(data.path(), &OneDriveFolderConfig { folder_id: "f".into(), folder_path: "/N".into() }).unwrap();
        mgr.record_local_delete(data.path(), NOTE);
        let seen_by_sync = read_tombstones(data.path());
        mgr.record_local_delete(data.path(), "2026-01-07.txt"); // arrives mid-sync
        clear_tombstones(data.path(), &seen_by_sync.into_iter().collect::<Vec<_>>());
        assert_eq!(read_tombstones(data.path()), tombs(&["2026-01-07.txt"]));
    }

    #[test]
    fn a_deletion_reported_by_id_alone_is_mapped_back_to_the_cached_note() {
        let cache = cache_with(NOTE, "v1", "e1"); // cached under id "id-1"
        assert_eq!(name_for_deleted_item(&cache, "id-1", None).as_deref(), Some(NOTE));
        assert_eq!(name_for_deleted_item(&cache, "id-1", Some("x.txt")).as_deref(), Some("x.txt"));
        assert_eq!(name_for_deleted_item(&cache, "other-id", None), None);
    }

    #[test]
    fn a_full_listing_reveals_deletions_that_were_missed() {
        let mut cache = cache_with("2026-01-01.txt", "a", "e1");
        cache.files.insert("2026-01-02.txt".to_string(), cache.files["2026-01-01.txt"].clone());
        let seen: std::collections::HashSet<String> = ["2026-01-01.txt".to_string()].into_iter().collect();
        assert_eq!(missed_remote_deletes(&cache, &seen), vec!["2026-01-02.txt".to_string()]);
    }

    #[test]
    fn a_missed_delete_removes_an_unchanged_local_note_but_keeps_an_edited_one() {
        let (notes, _data) = dirs();
        // Unchanged since last sync -> removed.
        fs::write(notes.path().join("2026-01-01.txt"), "same").unwrap();
        let mut cache = cache_with("2026-01-01.txt", "same", "e1");
        // Edited since last sync -> kept, and no cache entry so it re-uploads.
        fs::write(notes.path().join("2026-01-02.txt"), "edited offline").unwrap();
        cache.files.insert(
            "2026-01-02.txt".to_string(),
            FileCacheEntry { id: "id-2".into(), etag: "e1".into(), local_hash: compute_hash(b"original") },
        );

        for name in missed_remote_deletes(&cache.clone(), &std::collections::HashSet::new()) {
            apply_remote_delete(notes.path(), &name, &mut cache).unwrap();
        }

        assert!(!notes.path().join("2026-01-01.txt").exists());
        assert!(notes.path().join("2026-01-02.txt").exists());
        assert!(cache.files.is_empty());
    }

    #[test]
    fn a_remote_delete_clears_a_held_conflict_for_that_note() {
        let (notes, data) = dirs();
        let mut cache = held(notes.path(), data.path());
        apply_remote_delete(notes.path(), NOTE, &mut cache).unwrap();
        assert!(cache.conflicts.is_empty());
        assert!(notes.path().join(NOTE).exists()); // local edit kept, re-uploaded as new
    }

    #[test]
    fn an_interrupted_pull_can_simply_be_replayed_without_creating_conflicts() {
        // Sync #1 applies the change, then the connection drops (cache lost
        // in the old code). Sync #2 receives the same delta item again.
        let (notes, data) = dirs();
        let mut first = SyncCache::default();
        apply(notes.path(), data.path(), "e1", "shared", &mut first);

        let mut replay = SyncCache::default(); // progress was lost
        assert_eq!(apply(notes.path(), data.path(), "e1", "shared", &mut replay), ChangeOutcome::Adopted);
        assert!(replay.conflicts.is_empty());
    }
}
