/**
 * Save games in IndexedDB (M8): one slot per career (autosaved) plus named copies made by the
 * manager. Each slot has its metadata in a light "meta" store (listed on the title screen without
 * loading the worlds) and its world in the "saves" store. Version 1 of the database had a single
 * "autosave" record: it becomes a slot like the others.
 *
 * Files (.ovalie): gzip of a JSON envelope { format, version, info, world }.
 */
import type { World } from "@ovalie/engine";
import type { SaveInfo } from "../game/protocol";

const DB = "ovalie-manager";
const SAVES = "saves";
const META = "meta";
export const LEGACY_SLOT = "autosave";
export const SAVE_FORMAT = "ovalie-manager-save";

interface Saved {
  info: SaveInfo;
  world: World;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAVES)) db.createObjectStore(SAVES);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      // Version 1 → 2: the single autosave gets its metadata entry.
      if (ev.oldVersion === 1) {
        const t = req.transaction!;
        const get = t.objectStore(SAVES).get(LEGACY_SLOT);
        get.onsuccess = () => {
          const old = get.result as Saved | undefined;
          if (old?.info) t.objectStore(META).put({ ...old.info, slot: LEGACY_SLOT, kind: "auto" } satisfies SaveInfo, LEGACY_SLOT);
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(stores: string[], mode: IDBTransactionMode, body: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const req = body(t);
        t.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("Sauvegarde annulée (espace disque insuffisant ?)"));
      }),
  );
}

export async function writeSave(info: SaveInfo, world: World): Promise<void> {
  await run([SAVES, META], "readwrite", (t) => {
    t.objectStore(SAVES).put({ info, world } satisfies Saved, info.slot);
    t.objectStore(META).put(info, info.slot);
  });
}

export async function readSave(slot: string): Promise<Saved | undefined> {
  return run<Saved>([SAVES], "readonly", (t) => t.objectStore(SAVES).get(slot) as IDBRequest<Saved>);
}

/** Every save, most recent first. */
export async function listSaves(): Promise<SaveInfo[]> {
  const all = (await run<SaveInfo[]>([META], "readonly", (t) => t.objectStore(META).getAll() as IDBRequest<SaveInfo[]>)) ?? [];
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function deleteSave(slot: string): Promise<void> {
  await run([SAVES, META], "readwrite", (t) => {
    t.objectStore(SAVES).delete(slot);
    t.objectStore(META).delete(slot);
  });
}

/* ------------------------------------------------------------------ files */

async function pipe(data: BufferSource, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  const out = new Blob([data]).stream().pipeThrough(stream);
  return new Response(out).arrayBuffer();
}

/** Compressed file of a save (about a tenth of its JSON size). */
export async function encodeSaveFile(info: SaveInfo, world: World): Promise<ArrayBuffer> {
  const json = JSON.stringify({ format: SAVE_FORMAT, version: 1, info, world });
  return pipe(new TextEncoder().encode(json), new CompressionStream("gzip"));
}

/** Reads a save file (compressed or plain JSON). Throws a French message when it is not a save. */
export async function decodeSaveFile(data: ArrayBuffer): Promise<Saved> {
  const bytes = new Uint8Array(data);
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = new TextDecoder().decode(gz ? await pipe(bytes, new DecompressionStream("gzip")) : bytes);
  let parsed: { format?: string; info?: SaveInfo; world?: World };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde d'Ovalie Manager.");
  }
  if (parsed.format !== SAVE_FORMAT || !parsed.world?.manager || !parsed.world.calendar) throw new Error("Ce fichier n'est pas une sauvegarde d'Ovalie Manager.");
  return { info: parsed.info!, world: parsed.world };
}
