use super::{OneDriveAccount, OneDriveFolderItem};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, IF_MATCH};
use reqwest::{Client, StatusCode};
use serde::Deserialize;

pub const GRAPH_BASE_URL: &str = "https://graph.microsoft.com/v1.0";

#[derive(Clone)]
pub struct OneDriveClient {
    pub client: Client,
}

impl OneDriveClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder().build().unwrap_or_default(),
        }
    }

    fn auth_headers(access_token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {access_token}")) {
            headers.insert(AUTHORIZATION, val);
        }
        headers
    }

    /// Fetches the user profile (displayName and email/UPN) from Graph API.
    pub async fn get_user_profile(&self, access_token: &str) -> Result<OneDriveAccount, String> {
        let url = format!("{GRAPH_BASE_URL}/me?$select=displayName,mail,userPrincipalName");
        let resp = self
            .client
            .get(&url)
            .headers(Self::auth_headers(access_token))
            .send()
            .await
            .map_err(|e| format!("Graph /me request failed: {e}"))?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("Graph /me error: {err}"));
        }

        #[derive(Deserialize)]
        struct ProfileResponse {
            #[serde(rename = "displayName")]
            display_name: Option<String>,
            mail: Option<String>,
            #[serde(rename = "userPrincipalName")]
            user_principal_name: Option<String>,
        }

        let p: ProfileResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse /me response: {e}"))?;

        let email = p
            .mail
            .or(p.user_principal_name)
            .unwrap_or_else(|| "unknown@microsoft.com".to_string());
        let display_name = p.display_name.unwrap_or_else(|| "ChronoNote User".to_string());

        Ok(OneDriveAccount { email, display_name })
    }

    /// Lists child folders inside root or inside a specific parent folder.
    pub async fn list_folders(
        &self,
        access_token: &str,
        parent_id: Option<&str>,
    ) -> Result<Vec<OneDriveFolderItem>, String> {
        let url = match parent_id {
            Some(id) if !id.trim().is_empty() => {
                format!("{GRAPH_BASE_URL}/me/drive/items/{id}/children?$filter=folder%20ne%20null&$select=id,name,folder")
            }
            _ => {
                format!("{GRAPH_BASE_URL}/me/drive/root/children?$filter=folder%20ne%20null&$select=id,name,folder")
            }
        };

        let resp = self
            .client
            .get(&url)
            .headers(Self::auth_headers(access_token))
            .send()
            .await
            .map_err(|e| format!("Graph list folders failed: {e}"))?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("Graph list folders error: {err}"));
        }

        #[derive(Deserialize)]
        struct FolderResponse {
            value: Vec<FolderValue>,
        }
        #[derive(Deserialize)]
        struct FolderValue {
            id: String,
            name: String,
        }

        let body: FolderResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse list folders response: {e}"))?;

        Ok(body
            .value
            .into_iter()
            .map(|f| OneDriveFolderItem {
                id: f.id,
                name: f.name,
            })
            .collect())
    }

    /// Creates a new child folder in OneDrive.
    pub async fn create_folder(
        &self,
        access_token: &str,
        parent_id: Option<&str>,
        name: &str,
    ) -> Result<OneDriveFolderItem, String> {
        let url = match parent_id {
            Some(id) if !id.trim().is_empty() => {
                format!("{GRAPH_BASE_URL}/me/drive/items/{id}/children")
            }
            _ => {
                format!("{GRAPH_BASE_URL}/me/drive/root/children")
            }
        };

        let body = serde_json::json!({
            "name": name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "rename"
        });

        let resp = self
            .client
            .post(&url)
            .headers(Self::auth_headers(access_token))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Graph create folder failed: {e}"))?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("Graph create folder error: {err}"));
        }

        #[derive(Deserialize)]
        struct CreateFolderResponse {
            id: String,
            name: String,
        }

        let item: CreateFolderResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse create folder response: {e}"))?;

        Ok(OneDriveFolderItem {
            id: item.id,
            name: item.name,
        })
    }

    /// Executes a delta query against the chosen OneDrive folder, collecting changed
    /// or deleted files, and returns the next delta token link.
    pub async fn get_folder_delta(
        &self,
        access_token: &str,
        folder_id: &str,
        delta_link: Option<&str>,
    ) -> Result<DeltaQueryResult, String> {
        let mut next_url = match delta_link {
            Some(link) if !link.is_empty() => link.to_string(),
            _ => format!("{GRAPH_BASE_URL}/me/drive/items/{folder_id}/delta?$select=id,name,file,eTag,deleted"),
        };

        let mut changes = Vec::new();
        let mut final_delta_link = None;

        #[derive(Deserialize)]
        struct RawDeltaResponse {
            #[serde(rename = "@odata.nextLink")]
            next_link: Option<String>,
            #[serde(rename = "@odata.deltaLink")]
            delta_link: Option<String>,
            #[serde(default)]
            value: Vec<RawDeltaItem>,
        }

        #[derive(Deserialize)]
        struct RawDeltaItem {
            id: String,
            name: Option<String>,
            #[serde(rename = "eTag")]
            etag: Option<String>,
            file: Option<serde_json::Value>,
            deleted: Option<serde_json::Value>,
        }

        loop {
            let resp = self
                .client
                .get(&next_url)
                .headers(Self::auth_headers(access_token))
                .send()
                .await
                .map_err(|e| format!("Graph delta query failed: {e}"))?;

            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                return Err(format!("Graph delta query error: {err}"));
            }

            let page: RawDeltaResponse = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse delta response: {e}"))?;

            for item in page.value {
                let is_deleted = item.deleted.is_some();
                let is_file = item.file.is_some();
                // A deletion is kept even without a name; a live item is
                // only useful when it's a file with one.
                if is_deleted || (is_file && item.name.is_some()) {
                    changes.push(DeltaItem {
                        id: item.id,
                        name: item.name,
                        etag: item.etag,
                        is_deleted,
                    });
                }
            }

            if let Some(dl) = page.delta_link {
                final_delta_link = Some(dl);
            }

            match page.next_link {
                Some(next) => next_url = next,
                None => break,
            }
        }

        Ok(DeltaQueryResult {
            changes,
            delta_link: final_delta_link,
        })
    }

    /// Downloads the text content of a note file from OneDrive.
    pub async fn download_file_content(
        &self,
        access_token: &str,
        item_id: &str,
    ) -> Result<String, String> {
        let url = format!("{GRAPH_BASE_URL}/me/drive/items/{item_id}/content");
        let resp = self
            .client
            .get(&url)
            .headers(Self::auth_headers(access_token))
            .send()
            .await
            .map_err(|e| format!("Graph download failed: {e}"))?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("Graph download error: {err}"));
        }

        resp.text()
            .await
            .map_err(|e| format!("Failed to read downloaded content: {e}"))
    }

    /// Uploads content to a file in the OneDrive folder using Compare-And-Swap (CAS).
    /// If `etag` is provided, sends `If-Match: "{etag}"`.
    /// Deletes an item, but only while it still has the version we last
    /// saw (`If-Match`): a note someone else edited in the meantime is left
    /// alone and reported as `Changed`.
    pub async fn delete_item(
        &self,
        access_token: &str,
        item_id: &str,
        etag: Option<&str>,
    ) -> Result<DeleteResult, String> {
        let url = format!("{GRAPH_BASE_URL}/me/drive/items/{item_id}");
        let mut req = self.client.delete(&url).headers(Self::auth_headers(access_token));
        if let Some(e) = etag {
            if let Ok(v) = HeaderValue::from_str(e) {
                req = req.header(IF_MATCH, v);
            }
        }
        let resp = req.send().await.map_err(|e| format!("Graph delete failed: {e}"))?;
        let status = resp.status();
        if status == StatusCode::PRECONDITION_FAILED {
            return Ok(DeleteResult::Changed);
        }
        if status == StatusCode::NOT_FOUND || status.is_success() {
            return Ok(DeleteResult::Deleted);
        }
        let err = resp.text().await.unwrap_or_default();
        Err(format!("Graph delete error ({status}): {err}"))
    }

    pub async fn upload_file_content(
        &self,
        access_token: &str,
        folder_id: &str,
        filename: &str,
        content: &str,
        etag: Option<&str>,
    ) -> Result<UploadResult, String> {
        let url = format!("{GRAPH_BASE_URL}/me/drive/items/{folder_id}:/{filename}:/content");
        let mut req = self
            .client
            .put(&url)
            .headers(Self::auth_headers(access_token))
            // Explicit: without it an empty body goes out with no
            // Content-Length at all and OneDrive answers 411.
            .header(reqwest::header::CONTENT_LENGTH, content.len())
            .body(content.to_string());

        if let Some(e) = etag {
            if let Ok(v) = HeaderValue::from_str(e) {
                req = req.header(IF_MATCH, v);
            }
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("Graph upload failed: {e}"))?;

        let status = resp.status();
        if status == StatusCode::PRECONDITION_FAILED {
            return Ok(UploadResult::Conflict);
        }

        if !status.is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("Graph upload error ({status}): {err}"));
        }

        #[derive(Deserialize)]
        struct UploadResponse {
            id: String,
            #[serde(rename = "eTag")]
            etag: Option<String>,
        }

        let item: UploadResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse upload response: {e}"))?;

        Ok(UploadResult::Success {
            id: item.id,
            etag: item.etag.unwrap_or_default(),
        })
    }
}

pub struct DeltaQueryResult {
    pub changes: Vec<DeltaItem>,
    pub delta_link: Option<String>,
}

pub struct DeltaItem {
    pub id: String,
    /// Absent for some deleted items: OneDrive may report a deletion by id
    /// alone, so the caller has to map it back to a name itself.
    pub name: Option<String>,
    pub etag: Option<String>,
    pub is_deleted: bool,
}

pub enum DeleteResult {
    /// Gone from OneDrive (including "was already gone").
    Deleted,
    /// The item changed after the etag we hold: nothing was deleted.
    Changed,
}

pub enum UploadResult {
    Success { id: String, etag: String },
    Conflict,
}
