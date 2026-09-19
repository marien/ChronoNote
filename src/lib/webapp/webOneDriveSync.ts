import type {
  OneDriveAccount,
  OneDriveAdvancedConfig,
  OneDriveFolderConfig,
  OneDriveFolderItem,
  OneDriveLoginResult,
  OneDriveSyncResult,
  SyncConflict,
  SyncStatus,
} from "../types";
import type { SyncConflictResolution } from "../tauriCommands";
import { IDB_META_KEYS, IDB_STORES, idbDelete, idbGet, idbGetAllEntries, idbPut } from "./idb";
import {
  DEFAULT_CLIENT_ID,
  DEFAULT_TENANT,
  initiateLogin,
  isTokenExpired,
  loadPkceSession,
  refreshAccessToken,
  resolveClientId,
  resolveTenant,
  exchangeCode as authExchangeCode,
  type StoredAuth,
} from "./webOneDriveAuth";
import { OneDriveClient } from "./oneDriveClient";
import { merge3 } from "./lineMerge";

export interface FileCacheEntry {
  id: string;
  etag: string;
  localHash: string;
}

export interface PendingConflict {
  remoteContent: string;
  remoteId: string;
  remoteEtag: string;
}

export interface SyncCache {
  deltaLink?: string;
  files: Record<string, FileCacheEntry>;
  conflicts: Record<string, PendingConflict>;
}

export interface StoredNote {
  content: string;
  contentHash: string;
  modifiedMs: number;
}

import { isValidNoteFilename } from "../noteFilename";

export function isSyncableFile(name: string): boolean {
  return isValidNoteFilename(name) || name === ".agenda.json";
}

export async function computeSha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type RemoteChangeAction = "writeLocal" | "adoptRemote" | "divergent";

export function classifyRemoteChange(
  localHash: string | undefined,
  cached: FileCacheEntry | undefined,
  remoteHash: string,
): RemoteChangeAction {
  if (!localHash) return "writeLocal";
  if (localHash === remoteHash) return "adoptRemote";
  if (cached && cached.localHash === localHash) return "writeLocal";
  return "divergent";
}

export class WebOneDriveSyncEngine {
  private getDb: () => Promise<IDBDatabase>;
  private client: OneDriveClient;
  private currentStatus: SyncStatus = "offline";
  private isSyncing = false;

  constructor(getDb: () => Promise<IDBDatabase>, client?: OneDriveClient) {
    this.getDb = getDb;
    this.client = client ?? new OneDriveClient();
  }

  async getStatus(): Promise<SyncStatus> {
    const auth = await this.getStoredAuth();
    const folder = await this.getFolder();
    if (!auth || !folder) {
      return "offline";
    }
    return this.currentStatus;
  }

  setStatus(status: SyncStatus): void {
    this.currentStatus = status;
  }

  async getStoredAuth(): Promise<StoredAuth | null> {
    const db = await this.getDb();
    return (await idbGet<StoredAuth>(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_AUTH)) ?? null;
  }

  async saveStoredAuth(auth: StoredAuth): Promise<void> {
    const db = await this.getDb();
    await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_AUTH, auth);
  }

  async clearStoredAuth(): Promise<void> {
    const db = await this.getDb();
    await idbDelete(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_AUTH);
  }

  async getAccount(): Promise<OneDriveAccount | null> {
    const auth = await this.getStoredAuth();
    return auth?.account ?? null;
  }

  async getFolder(): Promise<OneDriveFolderConfig | null> {
    const db = await this.getDb();
    return (await idbGet<OneDriveFolderConfig>(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_FOLDER)) ?? null;
  }

  async setFolder(config: OneDriveFolderConfig): Promise<void> {
    const db = await this.getDb();
    const current = await this.getFolder();
    const sameFolder = current && current.folderId === config.folderId;

    await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_FOLDER, config);
    await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ACTIVE_WORKSPACE, "onedrive");

    let cache = sameFolder ? await this.loadCache() : this.defaultCache();
    cache.deltaLink = undefined;
    await this.saveCache(cache);
    this.setStatus("idle");
  }

  async getAdvancedConfig(): Promise<OneDriveAdvancedConfig> {
    const db = await this.getDb();
    return (await idbGet<OneDriveAdvancedConfig>(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_ADVANCED)) ?? {};
  }

  async setAdvancedConfig(config: OneDriveAdvancedConfig): Promise<void> {
    const db = await this.getDb();
    await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_ADVANCED, config);
  }

  async logout(): Promise<void> {
    await this.clearStoredAuth();
    const db = await this.getDb();
    await idbDelete(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_FOLDER);
    await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ACTIVE_WORKSPACE, "browser");
    this.setStatus("offline");
  }

  async login(): Promise<OneDriveLoginResult> {
    try {
      const advanced = await this.getAdvancedConfig();
      await initiateLogin(advanced);
      return { success: false, pending: true };
    } catch (e) {
      return {
        success: false,
        pending: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async exchangeCodeDirect(code: string, state?: string): Promise<OneDriveLoginResult> {
    try {
      const pkce = loadPkceSession();
      if (pkce && pkce.state !== state) {
        return {
          success: false,
          pending: false,
          error: "Sign-in response did not match this browser's request. Please sign in again.",
        };
      }
      const advanced = await this.getAdvancedConfig();
      const clientId = pkce?.clientId || resolveClientId(advanced);
      const tenant = pkce?.tenant || resolveTenant(advanced);
      const redirectUri = pkce?.redirectUri || `${window.location.origin}${window.location.pathname}`;
      const verifier = pkce?.verifier || "";

      if (!verifier) {
        return {
          success: false,
          pending: false,
          error: "No pending login session found. Please sign in again.",
        };
      }

      const tokens = await authExchangeCode({
        tenant,
        clientId,
        redirectUri,
        code,
        verifier,
      });

      const profile = await this.client.getUserProfile(tokens.accessToken);
      const stored: StoredAuth = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        account: profile,
      };

      await this.saveStoredAuth(stored);
      this.setStatus("idle");

      return {
        success: true,
        account: profile,
        pending: false,
      };
    } catch (e) {
      return {
        success: false,
        pending: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async getValidAccessToken(): Promise<string> {
    const auth = await this.getStoredAuth();
    if (!auth) {
      throw new Error("Not signed in to OneDrive");
    }

    if (!isTokenExpired(auth.expiresAt)) {
      return auth.accessToken;
    }

    const advanced = await this.getAdvancedConfig();
    const clientId = resolveClientId(advanced);
    const tenant = resolveTenant(advanced);

    const refreshed = await refreshAccessToken({
      tenant,
      clientId,
      refreshToken: auth.refreshToken,
    });

    const updated: StoredAuth = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      account: auth.account,
    };

    await this.saveStoredAuth(updated);
    return updated.accessToken;
  }

  async listFolders(parentId?: string | null): Promise<OneDriveFolderItem[]> {
    const token = await this.getValidAccessToken();
    return this.client.listFolders(token, parentId);
  }

  async createFolder(parentId: string | null | undefined, name: string): Promise<OneDriveFolderItem> {
    const token = await this.getValidAccessToken();
    return this.client.createFolder(token, parentId, name);
  }

  async recordLocalDelete(name: string): Promise<void> {
    if (!isSyncableFile(name)) return;
    const folder = await this.getFolder();
    if (!folder) return;

    const db = await this.getDb();
    const tombstones = (await idbGet<string[]>(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_TOMBSTONES)) ?? [];
    if (!tombstones.includes(name)) {
      tombstones.push(name);
      await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_TOMBSTONES, tombstones);
    }
  }

  private defaultCache(): SyncCache {
    return {
      files: {},
      conflicts: {},
    };
  }

  private async loadCache(): Promise<SyncCache> {
    const db = await this.getDb();
    const cache = await idbGet<SyncCache>(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_CACHE);
    return (
      cache ?? {
        files: {},
        conflicts: {},
      }
    );
  }

  private async saveCache(cache: SyncCache): Promise<void> {
    const db = await this.getDb();
    await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_CACHE, cache);
  }

  private async loadBases(): Promise<Record<string, string>> {
    const db = await this.getDb();
    return (await idbGet<Record<string, string>>(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_BASES)) ?? {};
  }

  private async saveBases(bases: Record<string, string>): Promise<void> {
    const db = await this.getDb();
    await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_BASES, bases);
  }

  async listConflicts(): Promise<SyncConflict[]> {
    const db = await this.getDb();
    const cache = await this.loadCache();
    const result: SyncConflict[] = [];

    for (const [name, pending] of Object.entries(cache.conflicts)) {
      const note = await idbGet<StoredNote>(db, IDB_STORES.NOTES_CLOUD, name);
      result.push({
        name,
        local: note?.content ?? "",
        remote: pending.remoteContent,
      });
    }

    return result;
  }

  async resolveConflict(name: string, resolution: SyncConflictResolution): Promise<void> {
    if (this.isSyncing) {
      throw new Error("A sync is running — try again in a moment");
    }

    const db = await this.getDb();
    const cache = await this.loadCache();
    const pending = cache.conflicts[name];
    if (!pending) {
      throw new Error(`${name} has no sync conflict to resolve`);
    }

    const localNote = await idbGet<StoredNote>(db, IDB_STORES.NOTES_CLOUD, name);
    const localContent = localNote?.content ?? "";
    const bases = await this.loadBases();

    if (resolution === "mine") {
      // Rebase onto the remote version we held the conflict against, so the
      // next push carries its etag (If-Match). Left stale, the upload gets a
      // 412 that the delta feed never re-reports and the choice never lands.
      cache.files[name] = {
        id: pending.remoteId,
        etag: pending.remoteEtag,
        localHash: cache.files[name]?.localHash ?? "",
      };
      bases[name] = pending.remoteContent;
      delete cache.conflicts[name];
    } else if (resolution === "theirs") {
      const hash = await computeSha256Hex(pending.remoteContent);
      await idbPut(db, IDB_STORES.NOTES_CLOUD, name, {
        content: pending.remoteContent,
        contentHash: hash,
        modifiedMs: Date.now(),
      });
      bases[name] = pending.remoteContent;
      cache.files[name] = {
        id: pending.remoteId,
        etag: pending.remoteEtag,
        localHash: hash,
      };
      delete cache.conflicts[name];
    } else if (resolution === "both") {
      const both = `${localContent}\n\n---\n# OneDrive version\n\n${pending.remoteContent}`;
      const hash = await computeSha256Hex(both);
      await idbPut(db, IDB_STORES.NOTES_CLOUD, name, {
        content: both,
        contentHash: hash,
        modifiedMs: Date.now(),
      });
      bases[name] = pending.remoteContent;
      cache.files[name] = {
        id: pending.remoteId,
        etag: pending.remoteEtag,
        localHash: cache.files[name]?.localHash ?? "",
      };
      delete cache.conflicts[name];
    }

    await this.saveCache(cache);
    await this.saveBases(bases);
  }

  /**
   * Main bi-directional synchronization entry point, wrapped in Web Locks API.
   */
  async syncNow(): Promise<OneDriveSyncResult> {
    if (typeof navigator !== "undefined" && navigator.locks) {
      try {
        const result = await navigator.locks.request(
          "onedrive-sync-lock",
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              return { success: false, message: "Sync already in progress in another tab" };
            }
            return await this.executeSync();
          },
        );
        return result;
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Fallback if Web Locks not supported
    if (this.isSyncing) {
      return { success: false, message: "Sync already in progress" };
    }
    return this.executeSync();
  }

  private async executeSync(): Promise<OneDriveSyncResult> {
    this.isSyncing = true;
    this.setStatus("syncing");

    try {
      const db = await this.getDb();
      const folderCfg = await this.getFolder();
      if (!folderCfg) {
        throw new Error("No OneDrive folder chosen yet — pick one in Settings");
      }

      const token = await this.getValidAccessToken();
      const cache = await this.loadCache();
      const bases = await this.loadBases();

      // Phase 1: Replay Local Tombstones
      const tombstones = (await idbGet<string[]>(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_TOMBSTONES)) ?? [];
      if (tombstones.length > 0) {
        const settled: string[] = [];
        for (const name of tombstones) {
          const entry = cache.files[name];
          if (entry) {
            try {
              const res = await this.client.deleteItem(token, entry.id, entry.etag);
              if (res === "deleted" || res === "changed") {
                delete cache.files[name];
                delete bases[name];
                settled.push(name);
              }
            } catch {
              // Retry on next sync
            }
          } else {
            settled.push(name);
          }
        }
        const remaining = tombstones.filter((t) => !settled.includes(t));
        await idbPut(db, IDB_STORES.META, IDB_META_KEYS.ONEDRIVE_TOMBSTONES, remaining);
      }

      // Phase 2: Pull Remote Changes via delta query
      const deltaRes = await this.client.getFolderDelta(token, folderCfg.folderId, cache.deltaLink);
      const isFullListing = !cache.deltaLink;
      const seenInListing = new Set<string>();

      for (const item of deltaRes.changes) {
        if (item.isDeleted) {
          let name = item.name;
          if (!name) {
            for (const [filename, f] of Object.entries(cache.files)) {
              if (f.id === item.id) {
                name = filename;
                break;
              }
            }
          }
          if (name && isSyncableFile(name)) {
            const localNote = await idbGet<StoredNote>(db, IDB_STORES.NOTES_CLOUD, name);
            const cached = cache.files[name];
            if (!localNote || (cached && cached.localHash === localNote.contentHash)) {
              await idbDelete(db, IDB_STORES.NOTES_CLOUD, name);
              delete cache.files[name];
              delete bases[name];
            } else {
              delete cache.files[name];
            }
          }
          continue;
        }

        if (!item.name || !isSyncableFile(item.name)) continue;
        const filename = item.name;
        seenInListing.add(filename);

        const cached = cache.files[filename];
        if (cached && item.etag && cached.etag === item.etag) {
          continue;
        }

        const remoteContent = await this.client.downloadFileContent(token, item.id);
        const remoteHash = await computeSha256Hex(remoteContent);
        const localNote = await idbGet<StoredNote>(db, IDB_STORES.NOTES_CLOUD, filename);
        const localHash = localNote?.contentHash;

        const rebased: FileCacheEntry = {
          id: item.id,
          etag: item.etag ?? "",
          localHash: remoteHash,
        };

        if (localHash === remoteHash) {
          delete cache.conflicts[filename];
          bases[filename] = remoteContent;
          cache.files[filename] = rebased;
          continue;
        }

        if (cache.conflicts[filename]) {
          cache.conflicts[filename] = {
            remoteContent,
            remoteId: item.id,
            remoteEtag: item.etag ?? "",
          };
          continue;
        }

        const action = classifyRemoteChange(localHash, cached, remoteHash);

        if (action === "writeLocal") {
          await idbPut(db, IDB_STORES.NOTES_CLOUD, filename, {
            content: remoteContent,
            contentHash: remoteHash,
            modifiedMs: Date.now(),
          });
          bases[filename] = remoteContent;
          cache.files[filename] = rebased;
          delete cache.conflicts[filename];
        } else if (action === "adoptRemote") {
          bases[filename] = remoteContent;
          cache.files[filename] = rebased;
          delete cache.conflicts[filename];
        } else {
          // Divergent
          const localText = localNote?.content ?? "";
          if (localText.trim() === "") {
            await idbPut(db, IDB_STORES.NOTES_CLOUD, filename, {
              content: remoteContent,
              contentHash: remoteHash,
              modifiedMs: Date.now(),
            });
            bases[filename] = remoteContent;
            cache.files[filename] = rebased;
            delete cache.conflicts[filename];
          } else {
            const baseContent = bases[filename];
            const mergeResult =
              cached && baseContent !== undefined
                ? merge3(baseContent, localText, remoteContent)
                : { type: "conflict" as const };

            if (mergeResult.type === "clean") {
              const mergedHash = await computeSha256Hex(mergeResult.content);
              await idbPut(db, IDB_STORES.NOTES_CLOUD, filename, {
                content: mergeResult.content,
                contentHash: mergedHash,
                modifiedMs: Date.now(),
              });
              bases[filename] = remoteContent;
              cache.files[filename] = rebased;
              delete cache.conflicts[filename];
            } else {
              cache.conflicts[filename] = {
                remoteContent,
                remoteId: item.id,
                remoteEtag: item.etag ?? "",
              };
            }
          }
        }
      }

      if (isFullListing) {
        for (const [filename, cached] of Object.entries(cache.files)) {
          if (!seenInListing.has(filename)) {
            const localNote = await idbGet<StoredNote>(db, IDB_STORES.NOTES_CLOUD, filename);
            if (!localNote || localNote.contentHash === cached.localHash) {
              await idbDelete(db, IDB_STORES.NOTES_CLOUD, filename);
              delete cache.files[filename];
              delete bases[filename];
            } else {
              delete cache.files[filename];
            }
          }
        }
      }

      if (deltaRes.deltaLink) {
        cache.deltaLink = deltaRes.deltaLink;
      }

      // Phase 3: Push Local Modifications
      const allNotes = await idbGetAllEntries<StoredNote>(db, IDB_STORES.NOTES_CLOUD);
      let firstPushError: string | null = null;

      for (const [key, note] of allNotes) {
        const filename = String(key);
        if (!isSyncableFile(filename)) continue;
        if (cache.conflicts[filename]) continue;

        if (note.content === "" && !cache.files[filename]) {
          continue;
        }

        const cached = cache.files[filename];
        const needsUpload = !cached || cached.localHash !== note.contentHash;
        if (!needsUpload) continue;

        try {
          const uploadRes = await this.client.uploadFileContent(
            token,
            folderCfg.folderId,
            filename,
            note.content,
            cached?.etag,
          );

          if (uploadRes.type === "success") {
            bases[filename] = note.content;
            cache.files[filename] = {
              id: uploadRes.id,
              etag: uploadRes.etag,
              localHash: note.contentHash,
            };
          }
        } catch (err) {
          if (!firstPushError) {
            firstPushError = `${filename}: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      }

      // Phase 4: Finalize Cache & Status
      await this.saveCache(cache);
      await this.saveBases(bases);

      if (firstPushError) {
        throw new Error(firstPushError);
      }

      this.setStatus("idle");
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isOffline =
        msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("offline");

      this.setStatus(isOffline ? "offline" : "error");
      return { success: false, message: msg };
    } finally {
      this.isSyncing = false;
    }
  }
}
