import { useState } from "react";
import { AlertTriangle, Bandage, Info } from "lucide-react";
import { TEAM_TALK_FR, commentaryFr, formatClock, formatDateFr, POSITION_LABEL_FR, type MatchEvent, type MatchReport, type PlayerMatchStats, type TeamStats, type World } from "@ovalie/engine";
import { useWorld } from "../game/client";
import { fmt1, POSITION_SHORT_FR, shortName, stageFr, WEATHER_FR } from "../game/format";
import { href } from "../game/router";
import { competitionName, myClubId, teamName } from "../game/selectors";
import { Badge, ClubCrest, CompareLegend, CompareRow, DataTable, Empty, PageHeader, Panel, Tabs, type Column } from "../ui/components";
import { ClubLink, PlayerLink } from "../ui/widgets";
import { WeatherIcon } from "./Home";

const SCORING = new Set(["try", "conversion", "penaltyGoal", "dropGoal"]);

function scorers(rep: MatchReport, w: World, side: 0 | 1): string[] {
  const by = new Map<string, { tries: number[]; con: number; pen: number; drop: number }>();
  const get = (id: string) => by.get(id) ?? (by.set(id, { tries: [], con: 0, pen: 0, drop: 0 }), by.get(id)!);
  for (const e of rep.events) {
    if (e.side !== side || !e.playerId || !SCORING.has(e.type)) continue;
    const made = e.detail?.made !== false;
    if (e.type === "try" && e.detail?.how !== "penaltyTry") get(e.playerId).tries.push(Math.floor(e.t / 60) + 1);
    else if (e.type === "conversion" && made) get(e.playerId).con++;
    else if (e.type === "penaltyGoal" && made) get(e.playerId).pen++;
    else if (e.type === "dropGoal" && made) get(e.playerId).drop++;
  }
  return [...by].map(([id, s]) => {
    const n = w.players[id] ? shortName(w.players[id]!.player) : "?";
    const parts = [s.tries.length ? `E ${s.tries.map((m) => `${m}'`).join(", ")}` : "", s.con ? `${s.con} T` : "", s.pen ? `${s.pen} P` : "", s.drop ? `${s.drop} D` : ""].filter(Boolean);
    return `${n} (${parts.join(", ")})`;
  });
}

const STAT_ROWS: { label: string; get: (s: TeamStats, o: TeamStats) => number; fmt?: (v: number) => string; lowerBetter?: boolean; max?: number }[] = [
  { label: "Possession", get: (s, o) => (100 * s.possessionSeconds) / Math.max(1, s.possessionSeconds + o.possessionSeconds), fmt: (v) => `${Math.round(v)} %`, max: 100 },
  { label: "Occupation", get: (s, o) => (100 * s.territorySeconds) / Math.max(1, s.territorySeconds + o.territorySeconds), fmt: (v) => `${Math.round(v)} %`, max: 100 },
  { label: "Mètres gagnés", get: (s) => s.metres },
  { label: "Courses", get: (s) => s.carries },
  { label: "Franchissements", get: (s) => s.lineBreaks },
  { label: "Défenseurs battus", get: (s) => s.defendersBeaten },
  { label: "Offloads", get: (s) => s.offloads },
  { label: "Plaquages réussis", get: (s) => s.tacklesMade },
  { label: "Plaquages manqués", get: (s) => s.tacklesMissed, lowerBetter: true },
  { label: "Ballons grattés", get: (s) => s.turnoversWon },
  { label: "Rucks gagnés", get: (s) => s.rucksWon },
  { label: "Réussite en touche", get: (s) => (100 * s.lineoutsWon) / Math.max(1, s.lineoutsThrown), fmt: (v) => `${Math.round(v)} %`, max: 100 },
  { label: "Mêlées gagnées", get: (s) => s.scrumsWon },
  { label: "Pénalités concédées", get: (s) => s.penaltiesConceded, lowerBetter: true },
  { label: "Ballons perdus (en-avant…)", get: (s) => s.handlingErrors, lowerBetter: true },
  { label: "Entrées dans les 22", get: (s) => s.entries22 },
  { label: "Points par entrée dans les 22", get: (s) => s.pointsFrom22 / Math.max(1, s.entries22), fmt: fmt1 },
  { label: "Cartons", get: (s) => s.yellowCards + s.redCards, lowerBetter: true },
];

function Timeline({ rep, w, all }: { rep: MatchReport; w: World; all: boolean }) {
  const names = new Map<string, string>();
  for (const t of rep.teams) for (const id of t.lineup) if (w.players[id]) names.set(id, shortName(w.players[id]!.player));
  const ctx = { teamName: (s: 0 | 1) => rep.teams[s].name, playerName: (id?: string) => (id ? names.get(id) ?? "" : "") };
  const events = rep.events.filter((e) => all || e.importance >= 2 || e.type === "halfTime" || e.type === "fullTime");
  const lines = events.map((e) => ({ e, text: commentaryFr(e, ctx) })).filter((l): l is { e: MatchEvent; text: string } => !!l.text);
  if (!lines.length) return <Empty>Aucun fait marquant.</Empty>;
  const me = rep.teams[0].id === myClubId(w) ? 0 : 1;
  return (
    <ol className="timeline">
      {lines.map(({ e, text }, i) => (
        <li key={i} className={`timeline__item${e.side === undefined ? " is-neutral" : e.side === me ? " is-us" : " is-them"}${e.importance >= 2 ? " is-key" : ""}`}>
          <span className="timeline__clock num">{formatClock(e.t)}</span>
          <span className="timeline__text">{text}</span>
          <span className="timeline__score num faint">
            {e.score[0]}-{e.score[1]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PlayersTable({ rep, w, side }: { rep: MatchReport; w: World; side: 0 | 1 }) {
  const best = Math.max(...rep.playerStats[0].concat(rep.playerStats[1]).map((p) => p.rating));
  const cols: Column<PlayerMatchStats>[] = [
    { key: "shirt", label: "N°", render: (p) => <span className="faint">{p.shirt}</span>, sort: (p) => p.shirt, width: 36 },
    { key: "pos", label: "Poste", render: (p) => <span title={POSITION_LABEL_FR[p.position]}>{POSITION_SHORT_FR[p.position]}</span>, width: 50 },
    { key: "name", label: "Joueur", render: (p) => <PlayerLink w={w} id={p.playerId} short /> },
    { key: "min", label: "Min.", render: (p) => p.minutes, sort: (p) => p.minutes, align: "right" },
    { key: "car", label: "Courses", render: (p) => p.carries, sort: (p) => p.carries, align: "right" },
    { key: "m", label: "Mètres", render: (p) => p.metres, sort: (p) => p.metres, align: "right" },
    { key: "tk", label: "Plaq.", title: "Plaquages réussis / manqués", render: (p) => `${p.tacklesMade}/${p.tacklesMissed}`, sort: (p) => p.tacklesMade, align: "right" },
    { key: "to", label: "Grat.", title: "Ballons grattés", render: (p) => p.turnoversWon || "", sort: (p) => p.turnoversWon, align: "right" },
    { key: "pts", label: "Pts", render: (p) => p.points || "", sort: (p) => p.points, align: "right" },
    { key: "rating", label: "Note", render: (p) => <b className={p.rating === best ? "rating-best" : undefined} title={p.rating === best ? "Homme du match" : undefined}>{fmt1(p.rating)}</b>, sort: (p) => p.rating, align: "right" },
  ];
  return <DataTable rows={rep.playerStats[side].filter((p) => p.minutes > 0)} columns={cols} rowKey={(p) => p.playerId} defaultSort={{ key: "shirt", dir: 1 }} dense />;
}

type Tab = "key" | "all" | "stats" | "players";

export function MatchReportScreen({ fixtureId }: { fixtureId: string }) {
  const w = useWorld();
  const [tab, setTab] = useState<Tab>("key");
  const f = w.fixtures.find((x) => x.id === fixtureId);
  if (!f?.result) return <Empty>Match introuvable ou pas encore joué.</Empty>;
  const rep = w.reports?.[fixtureId];
  const r = f.result;
  const me = f.home === myClubId(w) ? 0 : f.away === myClubId(w) ? 1 : 0;
  const them = (1 - me) as 0 | 1;
  const others = w.fixtures.filter((x) => x.stage === f.stage && x.competitionId === f.competitionId && x.id !== f.id && x.result);
  const potm = r.playerOfTheMatch;

  return (
    <>
      <PageHeader kicker={`${competitionName(w, f.competitionId)} · ${stageFr(f.stage)} · ${formatDateFr(f.date)}`} title="Compte rendu" />
      <section className="scoreboard">
        {[0, 1].map((side) => {
          const id = side === 0 ? f.home : f.away;
          const c = w.clubs[id];
          return (
            <div key={side} className={`scoreboard__team scoreboard__team--${side}`}>
              <ClubCrest colors={c?.colors} label={c?.shortName ?? id} size={64} />
              <div>
                <div className="scoreboard__name">{teamName(w, id)}</div>
                <div className="faint">
                  {r.tries[side as 0 | 1]} essai{r.tries[side as 0 | 1] > 1 ? "s" : ""}
                  {r.bonus[side as 0 | 1].offensive && " · bonus offensif"}
                  {r.bonus[side as 0 | 1].defensive && " · bonus défensif"}
                </div>
                {rep && <div className="scoreboard__scorers" title="E : essai (minute) · T : transformation · P : pénalité · D : drop">{scorers(rep, w, side as 0 | 1).join(" · ") || <span className="faint">—</span>}</div>}
              </div>
            </div>
          );
        })}
        <div className="scoreboard__score display num">
          {r.score[0]}
          <span>-</span>
          {r.score[1]}
        </div>
        <div className="scoreboard__meta faint">
          {rep && (
            <span className="row">
              <WeatherIcon weather={rep.weather} /> {WEATHER_FR[rep.weather]}
            </span>
          )}
          {r.decidedBy && <Badge tone="warning">{r.decidedBy === "extraTime" ? "Après prolongation" : r.decidedBy === "tries" ? "Au nombre d'essais" : "Aux tirs au but"}</Badge>}
          {rep && <span>Plan : {rep.planName}</span>}
          {rep?.teamTalk && <span title={rep.teamTalk.reaction}>Causerie : {TEAM_TALK_FR[rep.teamTalk.talk].label} — {rep.teamTalk.reaction}</span>}
          {potm && (
            <span>
              Homme du match : <PlayerLink w={w} id={potm} />
            </span>
          )}
        </div>
      </section>

      {rep?.staffChanges.length ? (
        <div className="notice notice--warning">
          <Info size={16} />
          <span>{rep.staffChanges.join(" ")}</span>
        </div>
      ) : null}
      {rep?.injuries.filter((i) => i.side === me).map((i) => (
        <div key={i.playerId} className="notice notice--error">
          <Bandage size={16} />
          <span>
            <PlayerLink w={w} id={i.playerId} /> : {i.type.toLowerCase()}, environ {i.days < 14 ? `${i.days} jours` : `${Math.round(i.days / 7)} semaines`} d'absence.
          </span>
        </div>
      ))}

      {!rep ? (
        <Panel title="Résultat">
          <p>Le compte rendu détaillé n'est disponible que pour les matchs de votre club.</p>
        </Panel>
      ) : (
        <div className="grid grid--main-side">
          <div className="stack">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "key", label: "Temps forts" },
                { value: "all", label: "Tous les faits" },
                { value: "stats", label: "Statistiques" },
                { value: "players", label: "Joueurs" },
              ]}
            />
            {(tab === "key" || tab === "all") && (
              <Panel flush>
                <Timeline rep={rep} w={w} all={tab === "all"} />
              </Panel>
            )}
            {tab === "stats" && (
              <Panel>
                <CompareLegend ours={rep.teams[me].name} theirs={rep.teams[them].name} />
                {STAT_ROWS.map((s) => {
                  const a = s.get(rep.teamStats[me], rep.teamStats[them]);
                  const b = s.get(rep.teamStats[them], rep.teamStats[me]);
                  return (
                    <CompareRow
                      key={s.label}
                      label={s.label}
                      ours={a}
                      theirs={b}
                      format={s.fmt ?? ((v) => String(Math.round(v)))}
                      higherIsBetter={!s.lowerBetter}
                      {...(s.max ? { max: s.max } : {})}
                    />
                  );
                })}
              </Panel>
            )}
            {tab === "players" && (
              <div className="grid grid--2">
                <Panel title={rep.teams[me].name} flush>
                  <PlayersTable rep={rep} w={w} side={me} />
                </Panel>
                <Panel title={rep.teams[them].name} flush>
                  <PlayersTable rep={rep} w={w} side={them} />
                </Panel>
              </div>
            )}
          </div>
          <div className="stack">
            <Panel title="Autres résultats" subtitle={`${competitionName(w, f.competitionId)} · ${stageFr(f.stage)}`}>
              {others.length ? (
                <ul className="list">
                  {others.map((o) => (
                    <li key={o.id} className="other-result other-result--short">
                      <ClubLink w={w} id={o.home} />
                      <b className="num">
                        {o.result!.score[0]}-{o.result!.score[1]}
                      </b>
                      <ClubLink w={w} id={o.away} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Pas d'autre match de cette journée.</Empty>
              )}
              <a className="link" href={href("competitions", f.competitionId)}>
                Classement
              </a>
            </Panel>
            {rep.events.some((e) => e.type === "uncontestedScrums") && (
              <div className="notice notice--warning">
                <AlertTriangle size={16} /> Mêlées simulées pendant le match (plus assez de premières lignes).
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
