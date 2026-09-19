import type { OneDriveAccount, OneDriveFolderItem } from "../types";

export const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export interface DeltaItem {
  id: string;
  name?: string;
  etag?: string;
  isDeleted: boolean;
}

export interface DeltaQueryResult {
  changes: DeltaItem[];
  deltaLink?: string;
}

export type DeleteResult = "deleted" | "changed";

export type UploadResult =
  | { type: "success"; id: string; etag: string }
  | { type: "conflict" };

export class OneDriveClient {
  private authHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  /**
   * Fetches the user profile (displayName and email/UPN) from Graph API /me.
   */
  async getUserProfile(accessToken: string): Promise<OneDriveAccount> {
    const url = `${GRAPH_BASE_URL}/me?$select=displayName,mail,userPrincipalName`;
    const resp = await fetch(url, {
      headers: this.authHeaders(accessToken),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Graph /me error (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    const email = data.mail || data.userPrincipalName || "unknown@microsoft.com";
    const displayName = data.displayName || "ChronoNote User";

    return { email, displayName };
  }

  /**
   * Lists child folders inside root or inside a specific parent folder.
   */
  async listFolders(
    accessToken: string,
    parentId?: string | null,
  ): Promise<OneDriveFolderItem[]> {
    const url =
      parentId && parentId.trim().length > 0
        ? `${GRAPH_BASE_URL}/me/drive/items/${encodeURIComponent(parentId)}/children?$filter=folder%20ne%20null&$select=id,name,folder`
        : `${GRAPH_BASE_URL}/me/drive/root/children?$filter=folder%20ne%20null&$select=id,name,folder`;

    const resp = await fetch(url, {
      headers: this.authHeaders(accessToken),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Graph list folders error (${resp.status}): ${err}`);
    }

    const body = await resp.json();
    const items = body.value || [];
    return items.map((f: { id: string; name: string }) => ({
      id: f.id,
      name: f.name,
    }));
  }

  /**
   * Creates a new child folder in OneDrive.
   */
  async createFolder(
    accessToken: string,
    parentId: string | null | undefined,
    name: string,
  ): Promise<OneDriveFolderItem> {
    const url =
      parentId && parentId.trim().length > 0
        ? `${GRAPH_BASE_URL}/me/drive/items/${encodeURIComponent(parentId)}/children`
        : `${GRAPH_BASE_URL}/me/drive/root/children`;

    const body = {
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...this.authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Graph create folder error (${resp.status}): ${err}`);
    }

    const item = await resp.json();
    return {
      id: item.id,
      name: item.name,
    };
  }

  /**
   * Executes a delta query against the chosen OneDrive folder, collecting changed
   * or deleted files, and returns the next delta token link.
   */
  async getFolderDelta(
    accessToken: string,
    folderId: string,
    deltaLink?: string | null,
  ): Promise<DeltaQueryResult> {
    let nextUrl =
      deltaLink && deltaLink.trim().length > 0
        ? deltaLink
        : `${GRAPH_BASE_URL}/me/drive/items/${encodeURIComponent(folderId)}/delta?$select=id,name,file,eTag,deleted`;

    const changes: DeltaItem[] = [];
    let finalDeltaLink: string | undefined = undefined;

    while (nextUrl) {
      const resp = await fetch(nextUrl, {
        headers: this.authHeaders(accessToken),
      });

      if (!resp.ok) {
        const err = await resp.text().catch(() => "");
        throw new Error(`Graph delta query error (${resp.status}): ${err}`);
      }

      const page = await resp.json();
      const items = page.value || [];

      for (const item of items) {
        const isDeleted = Boolean(item.deleted);
        const isFile = Boolean(item.file);
        if (isDeleted || (isFile && item.name)) {
          changes.push({
            id: item.id,
            name: item.name,
            etag: item.eTag,
            isDeleted,
          });
        }
      }

      if (page["@odata.deltaLink"]) {
        finalDeltaLink = page["@odata.deltaLink"];
      }

      nextUrl = page["@odata.nextLink"];
    }

    return {
      changes,
      deltaLink: finalDeltaLink,
    };
  }

  /**
   * Downloads the text content of a note file from OneDrive.
   */
  async downloadFileContent(
    accessToken: string,
    itemId: string,
  ): Promise<string> {
    const url = `${GRAPH_BASE_URL}/me/drive/items/${encodeURIComponent(itemId)}/content`;
    const resp = await fetch(url, {
      headers: this.authHeaders(accessToken),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Graph download error (${resp.status}): ${err}`);
    }

    return resp.text();
  }

  /**
   * Deletes an item, with optional Compare-And-Swap (If-Match) checking.
   */
  async deleteItem(
    accessToken: string,
    itemId: string,
    etag?: string | null,
  ): Promise<DeleteResult> {
    const url = `${GRAPH_BASE_URL}/me/drive/items/${encodeURIComponent(itemId)}`;
    const headers: Record<string, string> = {
      ...this.authHeaders(accessToken),
    };
    if (etag) {
      headers["If-Match"] = etag;
    }

    const resp = await fetch(url, {
      method: "DELETE",
      headers,
    });

    if (resp.status === 412) {
      return "changed";
    }

    if (resp.status === 404 || resp.ok) {
      return "deleted";
    }

    const err = await resp.text().catch(() => "");
    throw new Error(`Graph delete error (${resp.status}): ${err}`);
  }

  /**
   * Uploads content to a file in the OneDrive folder using Compare-And-Swap (CAS).
   * If `etag` is provided, sends `If-Match: "{etag}"`.
   */
  async uploadFileContent(
    accessToken: string,
    folderId: string,
    filename: string,
    content: string,
    etag?: string | null,
  ): Promise<UploadResult> {
    const encodedFilename = encodeURIComponent(filename);
    const url = `${GRAPH_BASE_URL}/me/drive/items/${encodeURIComponent(folderId)}:/${encodedFilename}:/content`;

    const headers: Record<string, string> = {
      ...this.authHeaders(accessToken),
      "Content-Type": "text/plain; charset=utf-8",
    };
    if (etag) {
      headers["If-Match"] = etag;
    }

    const resp = await fetch(url, {
      method: "PUT",
      headers,
      body: content,
    });

    if (resp.status === 412) {
      return { type: "conflict" };
    }

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`Graph upload error (${resp.status}): ${err}`);
    }

    const item = await resp.json();
    return {
      type: "success",
      id: item.id,
      etag: item.eTag || "",
    };
  }
}
