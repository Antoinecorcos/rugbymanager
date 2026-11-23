/**
 * Files chosen or written by the player (save export and import, editor corrections). In the
 * browser: a download and a file picker. In the desktop application (Tauri), native dialogs.
 */
import { desktop } from "./desktop";

/** Offers a file to save. Returns false if the player cancelled. */
export async function saveFile(name: string, data: ArrayBuffer | string, filter: { name: string; extensions: string[] }): Promise<boolean> {
  if (desktop()) return (await import("./desktop")).desktopSaveFile(name, data, filter);
  const blob = new Blob([data], { type: typeof data === "string" ? "application/json" : "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/** Lets the player pick a file. Returns its content, or null if cancelled. */
export async function openFile(filter: { name: string; extensions: string[] }): Promise<ArrayBuffer | null> {
  if (desktop()) return (await import("./desktop")).desktopOpenFile(filter);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = filter.extensions.map((e) => `.${e}`).join(",");
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      void f.arrayBuffer().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
