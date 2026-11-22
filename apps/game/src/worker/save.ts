/** Single autosave slot in IndexedDB (full save games come with M8). */
import type { World } from "@ovalie/engine";
import type { SaveInfo } from "../game/protocol";

const DB = "ovalie-manager";
const STORE = "saves";
const SLOT = "autosave";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => reject(t.error);
      }),
  );
}

interface Saved {
  info: SaveInfo;
  world: World;
}

export const writeSave = (info: SaveInfo, world: World): Promise<unknown> => tx("readwrite", (s) => s.put({ info, world } satisfies Saved, SLOT));
export const readSave = (): Promise<Saved | undefined> => tx("readonly", (s) => s.get(SLOT) as IDBRequest<Saved | undefined>);
export const readSaveInfo = async (): Promise<SaveInfo | null> => (await readSave())?.info ?? null;
export const deleteSave = (): Promise<unknown> => tx("readwrite", (s) => s.delete(SLOT));
