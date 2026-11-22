/** Minimal hash router: "#/effectif", "#/joueur/antoine-dupont"… (back/forward work as expected). */
import { useSyncExternalStore } from "react";

export interface Route {
  screen: string;
  params: string[];
  query: URLSearchParams;
}

const parse = (): Route => {
  const [path = "", search = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { screen: parts[0] ?? "accueil", params: parts.slice(1), query: new URLSearchParams(search) };
};

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener("hashchange", () => {
  current = parse();
  for (const l of listeners) l();
  document.querySelector("main")?.scrollTo({ top: 0 });
});

export const useRoute = (): Route =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );

export const href = (...parts: string[]): string => "#/" + parts.map(encodeURIComponent).join("/");
export const navigate = (...parts: string[]): void => {
  location.hash = href(...parts);
};
