/** Training (GDD §6.2): weekly plan, team automatisms, individual training and progression. */
import { useState } from "react";
import {
  abilityTrend,
  naturalPosition,
  NEUTRAL_SHARPNESS,
  planOf,
  playerLevel,
  POSITION_LABEL_FR,
  POSITIONS,
  SHARPNESS_UNITS,
  sharpnessTarget,
  TRAINING_EFFECTS,
  TRAINING_FR,
  unitCoachQuality,
  type IndividualFocus,
  type PlayerState,
  type Position,
  type TrainingPlan,
} from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { ageIn, fmt1, fullName, POSITION_ORDER, POSITION_SHORT_FR } from "../game/format";
import { href } from "../game/router";
import { myClub, myClubId, squadOf } from "../game/selectors";
import { DataTable, PageHeader, Panel, Segmented, type Column } from "../ui/components";
import { Trend } from "../ui/human";

const FOCUS_HELP: Record<TrainingPlan["focus"], string> = {
  balanced: "Aucun secteur privilégié : automatismes neutres partout.",
  setPiece: "Mêlée, touche et maul : automatismes de conquête en hausse (jusqu'à +3,5 % en match), progression orientée avants.",
  attack: "Passes, offloads, appuis : automatismes offensifs en hausse.",
  defence: "Plaquage, placement, grattage : la défense s'affûte.",
  kicking: "Jeu au pied et buteurs : précision et occupation.",
  fitness: "Condition physique : les joueurs se fatiguent moins vite en match.",
  recovery: "Semaines chargées : +0,6 point de fraîcheur par jour, automatismes en légère baisse.",
};

export function TrainingScreen() {
  const w = useWorld();
  const club = myClub(w);
  const plan = planOf(club);
  const sharp = club.sharpness ?? NEUTRAL_SHARPNESS;
  const target = sharpnessTarget(plan);
  const [error, setError] = useState<string | null>(null);

  const setPlan = (patch: Partial<TrainingPlan>) => void game.act({ type: "training", plan: { ...plan, ...patch } });
  const setIndividual = async (ps: PlayerState, focus: IndividualFocus, learning?: Position) => {
    const r = await game.act(learning ? { type: "individual", playerId: ps.player.id, focus, learning } : { type: "individual", playerId: ps.player.id, focus });
    setError(r.error);
  };

  const columns: Column<PlayerState>[] = [
    { key: "pos", label: "Poste", render: (ps) => <b>{POSITION_SHORT_FR[naturalPosition(ps.player)]}</b>, sort: (ps) => POSITION_ORDER.indexOf(naturalPosition(ps.player)), width: 60 },
    { key: "name", label: "Joueur", render: (ps) => <a className="link" href={href("joueur", ps.player.id)}>{fullName(ps.player)}</a>, sort: (ps) => ps.player.lastName },
    { key: "age", label: "Âge", render: (ps) => ageIn(w, ps.player), sort: (ps) => ageIn(w, ps.player), align: "right" },
    { key: "level", label: "Niveau", render: (ps) => fmt1(playerLevel(ps.player)), sort: (ps) => playerLevel(ps.player), align: "right" },
    { key: "trend", label: "Sur un mois", render: (ps) => <Trend delta={abilityTrend(ps, w.date)} />, sort: (ps) => abilityTrend(ps, w.date) },
    {
      key: "focus",
      label: "Entraînement individuel",
      render: (ps) => {
        const focus = ps.dev?.focus ?? "none";
        return (
          <span className="row" onClick={(e) => e.stopPropagation()}>
            <select className="select" value={focus} aria-label={`Entraînement individuel de ${fullName(ps.player)}`} onChange={(e) => void setIndividual(ps, e.target.value as IndividualFocus, e.target.value === "position" ? (ps.dev?.learning ?? suggestPosition(ps)) : undefined)}>
              {(Object.keys(TRAINING_FR.individual) as IndividualFocus[]).map((f) => (
                <option key={f} value={f}>
                  {TRAINING_FR.individual[f]}
                </option>
              ))}
            </select>
            {focus === "position" && (
              <select className="select" value={ps.dev?.learning ?? ""} aria-label="Poste à apprendre" onChange={(e) => void setIndividual(ps, "position", e.target.value as Position)}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABEL_FR[p]} ({ps.player.positions[p] ?? 1}/20)
                  </option>
                ))}
              </select>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader kicker={club.name} title="Entraînement" />
      <div className="grid grid--main-side">
        <div className="stack">
          <Panel title="Programme de la semaine" subtitle="S'applique chaque jour ; les automatismes évoluent chaque lundi">
            <div className="stack">
              <div className="field">
                <span className="field__label">Intensité</span>
                <Segmented value={plan.intensity} onChange={(v) => setPlan({ intensity: v })} options={(["light", "normal", "intense"] as const).map((v) => ({ value: v, label: TRAINING_FR.intensity[v] }))} />
                <p className="option-help">{TRAINING_EFFECTS.intensity[plan.intensity]}</p>
              </div>
              <div className="field">
                <span className="field__label">Thème principal</span>
                <select className="select" value={plan.focus} onChange={(e) => setPlan({ focus: e.target.value as TrainingPlan["focus"] })}>
                  {(Object.keys(TRAINING_FR.focus) as TrainingPlan["focus"][]).map((f) => (
                    <option key={f} value={f}>
                      {TRAINING_FR.focus[f]}
                    </option>
                  ))}
                </select>
                <p className="option-help">{FOCUS_HELP[plan.focus]}</p>
              </div>
              <div className="field">
                <span className="field__label">Contacts à l'entraînement</span>
                <Segmented value={plan.contact} onChange={(v) => setPlan({ contact: v })} options={(["low", "normal", "high"] as const).map((v) => ({ value: v, label: TRAINING_FR.contact[v] }))} />
                <p className="option-help">{TRAINING_EFFECTS.contact[plan.contact]}</p>
              </div>
            </div>
          </Panel>

          <Panel flush title="Entraînement individuel et progression" subtitle={error ?? "Un axe de travail oriente la progression du joueur ; « Apprendre un poste » le rend peu à peu polyvalent (jusqu'à 16/20)"}>
            <DataTable rows={squadOf(w, myClubId(w))} columns={columns} rowKey={(ps) => ps.player.id} defaultSort={{ key: "pos", dir: 1 }} dense />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Automatismes" subtitle="Effet en match : de −5 % à +5 % sur les gestes du secteur (milieu = neutre). Le trait marque la cible du programme.">
            <div className="unit-bars">
              {SHARPNESS_UNITS.map((u) => (
                <div key={u} className="unit-bar">
                  <span>{TRAINING_FR.unit[u]}</span>
                  <div className="unit-bar__track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sharp[u] * 100)} aria-label={TRAINING_FR.unit[u]}>
                    <div className="unit-bar__fill" style={{ width: `${sharp[u] * 100}%` }} />
                    <div className="unit-bar__mid" />
                    <div className="unit-bar__target" style={{ left: `calc(${target[u] * 100}% - 1px)` }} />
                  </div>
                  <span className="num" style={{ textAlign: "right" }}>
                    {sharp[u] >= 0.5 ? "+" : "−"}
                    {fmt1(Math.abs(sharp[u] - 0.5) * 10)} %
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Encadrement" subtitle="La qualité des entraîneurs accélère la progression et les automatismes">
            <ul className="list">
              {SHARPNESS_UNITS.map((u) => (
                <li key={u} className="row" style={{ justifyContent: "space-between" }}>
                  <span>{TRAINING_FR.unit[u]}</span>
                  <b className="num">{unitCoachQuality(club, u)}/20</b>
                </li>
              ))}
              <li className="row" style={{ justifyContent: "space-between" }}>
                <span>Développement des joueurs</span>
                <b className="num">{unitCoachQuality(club, "development")}/20</b>
              </li>
            </ul>
            <a className="link" href={href("staff")}>Voir le staff</a>
          </Panel>
        </div>
      </div>
    </>
  );
}

/** Most useful position to learn: the closest secondary position not mastered yet. */
function suggestPosition(ps: PlayerState): Position {
  const entries = Object.entries(ps.player.positions).sort((a, b) => b[1] - a[1]) as [Position, number][];
  return entries.find(([, v]) => v < 16)?.[0] ?? (entries[0]?.[0] === "FH" ? "FB" : "WG");
}
