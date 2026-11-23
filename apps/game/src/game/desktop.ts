/** Desktop application (Tauri, M8): native file dialogs. In the browser, nothing here is used. */

/** Running inside the desktop application? */
export const desktop = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function desktopSaveFile(name: string, data: ArrayBuffer | string, filter: { name: string; extensions: string[] }): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
  const path = await save({ defaultPath: name, filters: [filter] });
  if (!path) return false;
  if (typeof data === "string") await writeTextFile(path, data);
  else await writeFile(path, new Uint8Array(data));
  return true;
}

export async function desktopOpenFile(filter: { name: string; extensions: string[] }): Promise<ArrayBuffer | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const path = await open({ multiple: false, directory: false, filters: [filter] });
  if (!path || Array.isArray(path)) return null;
  const bytes = await readFile(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
