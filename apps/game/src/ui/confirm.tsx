/**
 * Confirmation inside the game (replaces window.confirm, which some hosts refuse outright —
 * embedded pages — and which looks foreign in the desktop app).
 */
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "./components";

interface Pending {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Asks the player to confirm an action; resolves to true if confirmed. */
export function askConfirm(message: string, confirmLabel = "Confirmer"): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { message, confirmLabel, resolve };
    emit();
  });
}

function answer(ok: boolean): void {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

/** Mounted once at the root of the app. */
export function ConfirmHost() {
  const p = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
  );
  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
      if (e.key === "Enter") answer(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);
  if (!p) return null;
  return (
    <div className="dialog-backdrop confirm-backdrop" role="alertdialog" aria-modal="true" aria-label="Confirmation" onClick={() => answer(false)}>
      <div className="dialog confirm" onClick={(e) => e.stopPropagation()}>
        <p className="confirm__text">{p.message}</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => answer(false)}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => answer(true)}>
            {p.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
