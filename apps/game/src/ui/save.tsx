/** In-game save menu (M8): named copy of the career and export to a file. */
import { useState } from "react";
import { Download, Save } from "lucide-react";
import { formatDateFr, type World } from "@ovalie/engine";
import { game } from "../game/client";
import { saveFile } from "../game/files";
import { Button } from "./components";
import { Shell } from "./offer";

export function SaveDialog({ w, onClose }: { w: World; onClose: () => void }) {
  const club = w.clubs[w.manager!.clubId]!;
  const [name, setName] = useState(`${club.shortName} — ${formatDateFr(w.date)}`);
  const [msg, setMsg] = useState<{ tone: "good" | "critical"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    setBusy(true);
    try {
      await game.saveAs(name);
      setMsg({ tone: "good", text: `Copie « ${name.trim() || "Sauvegarde"} » enregistrée. Elle apparaît dans le menu principal.` });
    } catch (e) {
      setMsg({ tone: "critical", text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
  };
  const exportFile = async () => {
    setBusy(true);
    try {
      const f = await game.exportSave();
      const done = await saveFile(f.name, f.data, { name: "Sauvegarde Ovalie Manager", extensions: ["ovalie"] });
      if (done) setMsg({ tone: "good", text: `Fichier ${f.name} créé (${Math.round(f.data.byteLength / 1024).toLocaleString("fr-FR")} ko).` });
    } catch (e) {
      setMsg({ tone: "critical", text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
  };
  return (
    <Shell title="Sauvegarder" onClose={onClose}>
      <p className="muted">Votre carrière est sauvegardée automatiquement après chaque journée et chaque décision. Une copie garde l'état actuel : vous pourrez y revenir depuis le menu principal.</p>
      <div className="field">
        <label htmlFor="save-name">Nom de la copie</label>
        <input id="save-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={() => void exportFile()} disabled={busy} icon={<Download size={15} />}>
          Exporter un fichier
        </Button>
        <Button variant="primary" onClick={() => void copy()} disabled={busy} icon={<Save size={15} />}>
          Enregistrer une copie
        </Button>
      </div>
      {msg && (
        <div className={`banner banner--${msg.tone}`} role="status">
          {msg.text}
        </div>
      )}
    </Shell>
  );
}
