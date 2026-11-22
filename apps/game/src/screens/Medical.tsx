/** Medical centre (GDD §3.4): injured players, injury risk, concussions, rushed returns. */
import { useState } from "react";
import { Brain } from "lucide-react";
import { daysBetween, injuryRisk, medicalFactor, naturalPosition, recentConcussions, staffOf, type PlayerState } from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { dateMedium, fmt1, fullName, POSITION_SHORT_FR } from "../game/format";
import { href } from "../game/router";
import { myClub, myClubId, squadOf } from "../game/selectors";
import { Badge, Button, DataTable, Empty, Freshness, KeyValues, PageHeader, Panel, type Column } from "../ui/components";
import { RiskBadge } from "../ui/human";

export function MedicalScreen() {
  const w = useWorld();
  const club = myClub(w);
  const squad = squadOf(w, myClubId(w));
  const injured = squad.filter((ps) => ps.injury && ps.injury.until > w.date);
  const atRisk = squad.filter((ps) => !injured.includes(ps)).map((ps) => ({ ps, risk: injuryRisk(ps, w.date) })).filter((r) => r.risk.level !== "low");
  const concussed = squad.filter((ps) => (ps.medical?.concussions ?? 0) > 0);
  const [msg, setMsg] = useState<string | null>(null);
  const physio = staffOf(club, "physio");
  const doctor = staffOf(club, "doctor");
  const factor = medicalFactor(club);

  const rush = async (ps: PlayerState) => {
    if (!window.confirm(`Accélérer le retour de ${fullName(ps.player)} ? Il reviendra plus tôt mais restera fragile (risque de blessure doublé) pendant 4 semaines.`)) return;
    const r = await game.act({ type: "rushBack", playerId: ps.player.id });
    setMsg(r.error ?? `${fullName(ps.player)} : retour accéléré.`);
  };

  const injuredCols: Column<PlayerState>[] = [
    { key: "name", label: "Joueur", render: (ps) => <a className="link" href={href("joueur", ps.player.id)}><b>{fullName(ps.player)}</b> <span className="faint">{POSITION_SHORT_FR[naturalPosition(ps.player)]}</span></a>, sort: (ps) => ps.player.lastName },
    { key: "type", label: "Blessure", render: (ps) => <span className="row">{ps.injury!.concussion && <Brain size={14} aria-label="Commotion" />}{ps.injury!.type}</span>, sort: (ps) => ps.injury!.type },
    { key: "back", label: "Retour prévu", render: (ps) => dateMedium(ps.injury!.until), sort: (ps) => ps.injury!.until },
    { key: "days", label: "Jours", render: (ps) => daysBetween(w.date, ps.injury!.until), sort: (ps) => daysBetween(w.date, ps.injury!.until), align: "right" },
    {
      key: "act",
      label: "",
      render: (ps) =>
        ps.injury!.concussion ? <span className="faint">Protocole commotion</span>
        : ps.medical?.fragileUntil && ps.medical.fragileUntil > w.date ? <Badge tone="warning">Retour déjà accéléré</Badge>
        : daysBetween(w.date, ps.injury!.until) >= 10 ? <Button size="sm" variant="secondary" onClick={() => void rush(ps)}>Accélérer le retour</Button>
        : <span className="faint">Retour proche</span>,
    },
  ];

  return (
    <>
      <PageHeader kicker={club.name} title="Médical" />
      {msg && <div className="banner" role="status">{msg}</div>}
      <div className="grid grid--main-side">
        <div className="stack">
          <Panel flush title={`Infirmerie : ${injured.length} joueur${injured.length > 1 ? "s" : ""}`}>
            {injured.length ? <DataTable rows={injured} columns={injuredCols} rowKey={(ps) => ps.player.id} defaultSort={{ key: "days", dir: -1 }} /> : <Empty>Aucun blessé. Le staff médical se tourne les pouces.</Empty>}
          </Panel>
          <Panel flush title="Joueurs à surveiller" subtitle="Risque de blessure au prochain match : fatigue, fragilité, âge, retour récent ou accéléré">
            {atRisk.length ? (
              <DataTable
                rows={atRisk}
                rowKey={(r) => r.ps.player.id}
                defaultSort={{ key: "risk", dir: -1 }}
                columns={[
                  { key: "name", label: "Joueur", render: (r) => <a className="link" href={href("joueur", r.ps.player.id)}>{fullName(r.ps.player)}</a>, sort: (r) => r.ps.player.lastName },
                  { key: "risk", label: "Risque", render: (r) => <RiskBadge level={r.risk.level} reasons={r.risk.reasons} />, sort: (r) => r.risk.score },
                  { key: "why", label: "Raisons", render: (r) => <span className="muted">{r.risk.reasons.join(", ")}</span> },
                  { key: "fresh", label: "Fraîcheur", render: (r) => <Freshness value={r.ps.freshness} />, sort: (r) => r.ps.freshness },
                ]}
              />
            ) : (
              <Empty>Aucun joueur à risque élevé ou modéré.</Empty>
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Staff médical">
            <KeyValues
              items={[
                ["Kinésithérapeute", physio ? `${physio.name} (${physio.attributes.medical}/20)` : "—"],
                ["Médecin", doctor ? `${doctor.name} (${doctor.attributes.medical}/20)` : "—"],
                ["Durée des absences", `${factor < 1 ? "−" : "+"}${fmt1(Math.abs(1 - factor) * 100)} % par rapport à un staff moyen`],
              ]}
            />
          </Panel>
          <Panel title="Commotions" subtitle="Chaque commotion récente (12 mois) allonge le protocole d'une semaine">
            {concussed.length ? (
              <ul className="list">
                {concussed.map((ps) => (
                  <li key={ps.player.id} className="row" style={{ justifyContent: "space-between" }}>
                    <a className="link" href={href("joueur", ps.player.id)}>{fullName(ps.player)}</a>
                    <span>
                      {ps.medical!.concussions} au total · {recentConcussions(ps, w.date)} sur 12 mois {ps.medical!.concussions >= 3 && <Badge tone="critical">Vigilance</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucune commotion enregistrée cette saison.</Empty>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
