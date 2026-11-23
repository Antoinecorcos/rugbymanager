/** Editor (M8): find a player or a club and correct it; export the corrections to the real database. */
import { useMemo, useState } from "react";
import { Download, Pencil } from "lucide-react";
import { ageOn, editsAsOverrides, playerLevel, POSITION_LABEL_FR, type Position } from "@ovalie/engine";
import { useWorld } from "../game/client";
import { saveFile } from "../game/files";
import { fullName, LEAGUE_LABEL } from "../game/format";
import { Badge, Button, ClubCrest, Empty, PageHeader, Panel } from "../ui/components";
import { ClubEditor, PlayerEditor } from "../ui/editor";

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const best = (positions: Partial<Record<Position, number>>) => (Object.entries(positions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "LO") as Position;

export function EditorScreen() {
  const w = useWorld();
  const [q, setQ] = useState("");
  const [club, setClub] = useState("");
  const [league, setLeague] = useState(w.clubs[w.manager!.clubId]!.league);
  const [player, setPlayer] = useState<string | null>(null);
  const [clubEdit, setClubEdit] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const players = useMemo(() => {
    const needle = normal(q.trim());
    if (needle.length < 2 && !club) return [];
    return Object.values(w.players)
      .filter((ps) => !ps.virtual && (!club || ps.clubId === club) && (needle.length < 2 || normal(`${ps.player.firstName} ${ps.player.lastName}`).includes(needle)))
      .sort((a, b) => playerLevel(b.player) - playerLevel(a.player))
      .slice(0, 60);
  }, [w, q, club]);
  const clubs = Object.values(w.clubs)
    .filter((c) => c.league === league)
    .sort((a, b) => a.name.localeCompare(b.name));
  const leagues = [...new Set(Object.values(w.clubs).map((c) => c.league))].filter((l) => l !== "NATIONALE2");
  const fixes = w.edits ?? { players: {}, clubs: {} };
  const nPlayers = Object.keys(fixes.players).length;
  const nClubs = Object.keys(fixes.clubs).length;

  const exportFixes = async () => {
    const data = JSON.stringify({ format: "ovalie-manager-corrections", ...editsAsOverrides(w) }, null, 1);
    const done = await saveFile(`ovalie-corrections-${w.date}.json`, data, { name: "Corrections Ovalie Manager", extensions: ["json"] });
    if (done) setMsg(`${nPlayers} joueur${nPlayers > 1 ? "s" : ""} et ${nClubs} club${nClubs > 1 ? "s" : ""} exportés.`);
  };

  return (
    <>
      <PageHeader kicker="Outils" title="Éditeur">
        <p className="muted">
          Corrigez un joueur ou un club de votre partie : identité, niveau, attributs, postes, club, contrat, couleurs, budget… Les changements sont immédiats.
          {w.edited && (
            <>
              {" "}
              <Badge tone="warning" title="La sauvegarde est marquée comme éditée">
                ✎ Partie éditée
              </Badge>
            </>
          )}
        </p>
      </PageHeader>
      <div className="grid grid--main-side">
        <Panel
          flush
          title="Joueurs"
          subtitle="Tapez au moins deux lettres du nom, ou choisissez un club"
          actions={
            <div className="row">
              <input className="input" placeholder="Rechercher un joueur" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un joueur" />
              <select className="select" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club">
                <option value="">Tous les clubs</option>
                {Object.values(w.clubs)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          }
        >
          {players.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Joueur</th>
                    <th>Club</th>
                    <th>Poste</th>
                    <th style={{ textAlign: "right" }}>Âge</th>
                    <th style={{ textAlign: "right" }}>Niveau</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {players.map((ps) => (
                    <tr key={ps.player.id}>
                      <td>
                        <b>{fullName(ps.player)}</b> {fixes.players[ps.player.id] && <Badge tone="warning">✎ corrigé</Badge>}
                      </td>
                      <td>{ps.clubId ? w.clubs[ps.clubId]?.name : <span className="faint">libre</span>}</td>
                      <td>{POSITION_LABEL_FR[best(ps.player.positions)]}</td>
                      <td className="num" style={{ textAlign: "right" }}>{ageOn(ps.player.birthDate, w.date)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{playerLevel(ps.player).toFixed(1).replace(".", ",")}</td>
                      <td>
                        <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setPlayer(ps.player.id)}>
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Aucun joueur à afficher.</Empty>
          )}
        </Panel>
        <div className="stack">
          <Panel
            title="Clubs"
            actions={
              <select className="select" value={league} onChange={(e) => setLeague(e.target.value)} aria-label="Championnat">
                {leagues.map((l) => (
                  <option key={l} value={l}>
                    {LEAGUE_LABEL[l] ?? l}
                  </option>
                ))}
              </select>
            }
          >
            <ul className="list">
              {clubs.map((c) => (
                <li key={c.id} className="row">
                  <ClubCrest colors={c.colors} label={c.shortName} size={24} />
                  <span style={{ flex: 1 }}>
                    {c.name} {fixes.clubs[c.id] && <Badge tone="warning">✎</Badge>}
                  </span>
                  <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setClubEdit(c.id)}>
                    Modifier
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Corriger la base réelle" subtitle={msg ?? undefined}>
            <p className="muted">
              Vos corrections des joueurs et clubs réels (niveau, potentiel, postes, attributs, taille, poids, couleurs, réputation) peuvent enrichir la base du jeu : exportez-les, puis importez le fichier avec <code>pnpm --filter @ovalie/data import-edits</code> et reconstruisez la base.
            </p>
            <p>
              <b>{nPlayers}</b> joueur{nPlayers > 1 ? "s" : ""} et <b>{nClubs}</b> club{nClubs > 1 ? "s" : ""} corrigés.
            </p>
            <Button variant="secondary" icon={<Download size={15} />} disabled={!nPlayers && !nClubs} onClick={() => void exportFixes()}>
              Exporter les corrections
            </Button>
          </Panel>
        </div>
      </div>
      {player && <PlayerEditor w={w} playerId={player} onClose={() => setPlayer(null)} />}
      {clubEdit && <ClubEditor w={w} clubId={clubEdit} onClose={() => setClubEdit(null)} />}
    </>
  );
}
