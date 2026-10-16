import { vi } from "vitest";

export function installIdbStub(): Record<string, Map<string, any>> {
  const mockStores: Record<string, Map<string, any>> = {
    notes: new Map(),
    notes_browser: new Map(),
    notes_cloud: new Map(),
    notes_archive: new Map(),
    conflicts: new Map(),
    meta: new Map(),
  };

  const mockDb = {
    objectStoreNames: {
      contains: (s: string) => s in mockStores,
    },
    transaction: (storeName: string) => {
      const storeMap = mockStores[storeName] ?? new Map();
      return {
        objectStore: () => ({
          get: (key: string) => {
            const req: any = {};
            setTimeout(() => {
              req.result = storeMap.get(key);
              req.onsuccess?.();
            }, 0);
            return req;
          },
          put: (value: any, key: string) => {
            const req: any = {};
            setTimeout(() => {
              storeMap.set(key, value);
              req.onsuccess?.();
            }, 0);
            return req;
          },
          delete: (key: string) => {
            const req: any = {};
            setTimeout(() => {
              storeMap.delete(key);
              req.onsuccess?.();
            }, 0);
            return req;
          },
          getAllKeys: () => {
            const req: any = {};
            setTimeout(() => {
              req.result = Array.from(storeMap.keys());
              req.onsuccess?.();
            }, 0);
            return req;
          },
          getAll: () => {
            const req: any = {};
            setTimeout(() => {
              req.result = Array.from(storeMap.values());
              req.onsuccess?.();
            }, 0);
            return req;
          },
          clear: () => {
            const req: any = {};
            setTimeout(() => {
              storeMap.clear();
              req.onsuccess?.();
            }, 0);
            return req;
          },
        }),
      };
    },
  };

  vi.stubGlobal("indexedDB", {
    open: () => {
      const req: any = {};
      setTimeout(() => {
        req.result = mockDb;
        req.onsuccess?.();
      }, 0);
      return req;
    },
  });

  return mockStores;
}
