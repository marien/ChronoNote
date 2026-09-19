/** Tiny promise wrapper around the callback-based `IndexedDB` API — just
 * enough for `webBackend.ts`'s three object stores (`notes`, `config`,
 * `session`), all addressed by an explicit out-of-line key (no
 * `keyPath`). Not a general-purpose IDB library; kept deliberately small
 * rather than pulling in a dependency for what amounts to a handful of
 * get/put/delete calls. */

export const IDB_STORES = {
  NOTES: "notes",
  NOTES_BROWSER: "notes_browser",
  NOTES_CLOUD: "notes_cloud",
  NOTES_ARCHIVE: "notes_archive",
  CONFLICTS: "conflicts",
  META: "meta",
} as const;

export const IDB_META_KEYS = {
  CONFIG: "config",
  SESSION: "session",
  SESSION_BROWSER: "session_browser",
  SESSION_CLOUD: "session_cloud",
  ACTIVE_WORKSPACE: "active_workspace",
  SCRATCHPAD_DRAFTS: "scratchpad_drafts",
  ONEDRIVE_AUTH: "onedrive_auth",
  ONEDRIVE_FOLDER: "onedrive_folder",
  ONEDRIVE_LAST_FOLDER: "onedrive_last_folder",
  ONEDRIVE_CACHE: "onedrive_cache",
  ONEDRIVE_BASES: "onedrive_bases",
  ONEDRIVE_TOMBSTONES: "onedrive_tombstones",
  ONEDRIVE_ADVANCED: "onedrive_advanced",
  ONEDRIVE_STATUS: "onedrive_status",
} as const;

export function openDb(name: string, version: number, storeNames: string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of storeNames) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB open failed: ${name}`));
  });
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

export function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readonly").get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB get failed: ${store}/${String(key)}`));
  });
}

export function idbPut(db: IDBDatabase, store: string, key: IDBValidKey, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readwrite").put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB put failed: ${store}/${String(key)}`));
  });
}

export function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readwrite").delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB delete failed: ${store}/${String(key)}`));
  });
}

export function idbGetAllKeys(db: IDBDatabase, store: string): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readonly").getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB getAllKeys failed: ${store}`));
  });
}

export function idbGetAllEntries<T>(db: IDBDatabase, store: string): Promise<[IDBValidKey, T][]> {
  return new Promise((resolve, reject) => {
    const s = tx(db, store, "readonly");
    const keysReq = s.getAllKeys();
    const valuesReq = s.getAll();
    let keys: IDBValidKey[] | null = null;
    let values: T[] | null = null;
    const settle = () => {
      if (keys && values) resolve(keys.map((k, i) => [k, values![i]]));
    };
    keysReq.onsuccess = () => {
      keys = keysReq.result;
      settle();
    };
    valuesReq.onsuccess = () => {
      values = valuesReq.result as T[];
      settle();
    };
    keysReq.onerror = () => reject(keysReq.error ?? new Error(`IndexedDB getAllKeys failed: ${store}`));
    valuesReq.onerror = () => reject(valuesReq.error ?? new Error(`IndexedDB getAll failed: ${store}`));
  });
}

export function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readwrite").clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB clear failed: ${store}`));
  });
}
