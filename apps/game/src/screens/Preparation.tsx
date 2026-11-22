import { useMemo, useState } from "react";
import { Check, Crown, Lightbulb, Play, Shirt, Target } from "lucide-react";
import {
  analystAdvice,
  fixtureReferee,
  fixtureWeather,
  formatDateFr,
  leagueTable,
  TACTIC_LABEL_FR,
  lineupIssues,
  planFor,
  scoutReport,
  SECTOR_LABEL_FR,
  SECTORS,
  sectorRatings,
  SHIRT_POSITION,
  teamForFixture,
  type TacticalAdvice,
  type Tactics,
  type TargetedInstructions,
  type World,
} from "@ovalie/engine";
import { game, useWorld } from "../game/client";
import { dateShort, fmt1, ordinal, POSITION_SHORT_FR, shortName, stageFr, WEATHER_FR } from "../game/format";
import { href, navigate } from "../game/router";
import { competitionName, isMatchToday, manager, myClub, myClubId, myNextFixture, teamName, venueLabel, viewOf } from "../game/selectors";
import { Badge, Button, ClubCrest, CompareLegend, CompareRow, Empty, KeyValues, PageHeader, Panel, ResultChip, Segmented } from "../ui/components";
import { PlayerLink } from "../ui/widgets";
import { WeatherIcon } from "./Home";
import { TACTIC_INFO } from "./Tactics";
import { PenaltyRulesEditor, TargetsEditor } from "../ui/instructions";

const refereeText = (strictness: number) => (strictness >= 0.65 ? "sévère" : strictness <= 0.35 ? "tolérant" : "dans la moyenne");

export function PreparationScreen() {
  const w = useWorld();
  const f = myNextFixture(w);
  if (!f) return <Empty>Plus aucun match au calendrier cette saison.</Empty>;
  return <Preparation w={w} fixtureId={f.id} />;
}

function Preparation({ w, fixtureId }: { w: World; fixtureId: string }) {
  const f = w.fixtures.find((x) => x.id === fixtureId)!;
  const m = manager(w);
  const v = viewOf(w, f);
  const opp = w.clubs[v.opponent]!;
  const club = myClub(w);
  const today = isMatchToday(w)?.id === f.id;
  const weather = fixtureWeather(w, f);
  const [playing, setPlaying] = useState(false);

  const scout = useMemo(() => scoutReport(w, v.opponent, f), [w, f.id]);
  const ourTeam = useMemo(() => teamForFixture(w, f, myClubId(w)), [w, f.id]);
  const ours = useMemo(() => sectorRatings(ourTeam), [ourTeam]);
  const advice = useMemo(() => analystAdvice(ours, scout.sectors, weather, scout.leagueAverage), [ours, scout, weather]);
  const issues = lineupIssues(w, myClubId(w), m.selection, f.date);
  const planIndex = m.matchPlans[f.id] ?? m.activePlan;
  const plan = planFor(m, f.id);

  const apply = (a: TacticalAdvice) => {
    if (!a.tactic) return;
    const plans = m.plans.map((p, i) => (i === planIndex ? { ...p, tactics: { ...p.tactics, [a.tactic!.key]: a.tactic!.value } as Tactics } : p));
    void game.updateManager({ plans });
  };
  const applied = (a: TacticalAdvice) => !!a.tactic && plan.tactics[a.tactic.key] === a.tactic.value;
  const play = async () => {
    setPlaying(true);
    const r = await game.playMatch().catch(() => undefined);
    setPlaying(false);
    if (r?.playedFixtureId) navigate("match", r.playedFixtureId);
  };
  const referee = useMemo(() => fixtureReferee(w, f), [w, f.id]);
  const opponentTeam = useMemo(() => teamForFixture(w, f, v.opponent), [w, f.id]);
  const opponents = opponentTeam.players.slice(0, 15).map((player, i) => ({ player, shirt: i + 1 }));
  const setTargets = (t: TargetedInstructions | undefined) => {
    const matchTargets = { ...(m.matchTargets ?? {}) };
    if (t) matchTargets[f.id] = t;
    else delete matchTargets[f.id];
    void game.updateManager({ matchTargets });
  };

  return (
    <>
      <PageHeader
        kicker={`${competitionName(w, f.competitionId)} · ${stageFr(f.stage)} · ${formatDateFr(f.date)}`}
        title={`Préparation : ${opp.name}`}
        actions={
          today ? (
            <div className="row">
              <Button variant="secondary" size="lg" onClick={play} disabled={playing} title="Le match est simulé d'un coup : le staff prend les décisions">
                {playing ? "Simulation…" : "Résultat immédiat"}
              </Button>
              <Button variant="primary" size="lg" icon={<Play size={18} />} onClick={() => navigate("direct")} disabled={playing}>
                Match en direct
              </Button>
            </div>
          ) : (
            <span className="muted">Le match se joue le {dateShort(f.date)} : « Continuer » s'arrêtera ce jour-là.</span>
          )
        }
      >
        <div className="row row--wrap muted" style={{ marginTop: 6 }}>
          <span>{venueLabel(v)}{f.venue ? ` · ${f.venue}` : ""}</span>
          <span className="row">
            <WeatherIcon weather={weather} /> {WEATHER_FR[weather]} annoncé
          </span>
          {f.knockout && <Badge tone="warning">Match à élimination directe</Badge>}
        </div>
      </PageHeader>

      <div className="grid grid--main-side">
        <div className="stack">
          <Panel title="Rapport de force" subtitle="Notes par secteur des deux 23 probables (sur 20)">
            <CompareLegend ours={club.name} theirs={opp.name} />
            {SECTORS.map((s) => (
              <CompareRow key={s} label={SECTOR_LABEL_FR[s]} ours={ours[s]} theirs={scout.sectors[s]} format={fmt1} max={20} />
            ))}
          </Panel>

          <Panel title="Conseils de l'analyste" subtitle={`Appliqués au plan « ${plan.name} »`}>
            {advice.length === 0 ? (
              <Empty>Pas d'écart net entre les deux équipes : le plan actuel convient.</Empty>
            ) : (
              <ul className="list advice">
                {advice.map((a) => (
                  <li key={a.id}>
                    <Lightbulb size={16} className="advice__icon" />
                    <div className="advice__text">
                      <b>{a.observation}</b>
                      <span className="muted">{a.suggestion}</span>
                      {a.tactic && (
                        <span className="faint">
                          {TACTIC_INFO[a.tactic.key].title} → {labelOf(a.tactic.key, a.tactic.value)}
                        </span>
                      )}
                    </div>
                    {a.tactic &&
                      (applied(a) ? (
                        <Badge tone="good">
                          <Check size={12} /> Appliqué
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => apply(a)}>
                          Appliquer
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Rapport sur ${opp.name}`}>
            <div className="grid grid--2">
              <div className="stack">
                <div>
                  <h3 className="attr-col__title">Forme</h3>
                  <div className="row">
                    {scout.form.length ? (
                      scout.form.map((l) => <ResultChip key={l.fixtureId} outcome={l.outcome} title={`${l.home ? "vs" : "à"} ${teamName(w, l.opponent)} ${l.for}-${l.against} (${dateShort(l.date)})`} />)
                    ) : (
                      <span className="faint">Pas encore de match officiel.</span>
                    )}
                  </div>
                </div>
                <KeyValues
                  items={[
                    ["Bilan de la saison", `${scout.record.won} V · ${scout.record.drawn} N · ${scout.record.lost} D`],
                    ["Points marqués / encaissés par match", scout.record.played ? `${fmt1(scout.record.pointsFor / scout.record.played)} / ${fmt1(scout.record.pointsAgainst / scout.record.played)}` : "—"],
                    ["Essais marqués / encaissés", scout.record.played ? `${scout.record.triesFor} / ${scout.record.triesAgainst}` : "—"],
                    ["Cartons (jaunes / rouges)", `${scout.cards.yellow} / ${scout.cards.red}`],
                  ]}
                />
              </div>
              <div className="stack">
                <div>
                  <h3 className="attr-col__title">Points forts (vs moyenne du championnat)</h3>
                  <div className="row row--wrap">{scout.strengths.length ? scout.strengths.map((s) => <Badge key={s} tone="outline">{SECTOR_LABEL_FR[s]} +{fmt1(scout.sectors[s] - scout.leagueAverage[s])}</Badge>) : <span className="faint">Aucun secteur au-dessus de la moyenne</span>}</div>
                </div>
                <div>
                  <h3 className="attr-col__title">Points faibles</h3>
                  <div className="row row--wrap">{scout.weaknesses.length ? scout.weaknesses.map((s) => <Badge key={s} tone="outline">{SECTOR_LABEL_FR[s]} −{fmt1(scout.leagueAverage[s] - scout.sectors[s])}</Badge>) : <span className="faint">Pas de faiblesse marquée</span>}</div>
                </div>
                <div>
                  <h3 className="attr-col__title">Joueurs clés</h3>
                  <ul className="list">
                    {scout.keyPlayers.map((k) => (
                      <li key={k.playerId} className="row">
                        <Badge>{POSITION_SHORT_FR[k.position]}</Badge>
                        <PlayerLink w={w} id={k.playerId} />
                        <span className="faint" style={{ marginLeft: "auto" }}>
                          {fmt1(k.level)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {scout.absences.length > 0 && (
                  <div>
                    <h3 className="attr-col__title">Absents ({scout.absences.length})</h3>
                    <div className="muted">
                      {scout.absences.slice(0, 6).map((a, i) => (
                        <span key={a.playerId}>
                          {i > 0 && ", "}
                          <PlayerLink w={w} id={a.playerId} short /> <span className="faint">({a.label.toLowerCase()})</span>
                        </span>
                      ))}
                      {scout.absences.length > 6 && ` et ${scout.absences.length - 6} autres`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Plan de jeu pour ce match">
            <Segmented value={String(planIndex)} onChange={(i) => void game.updateManager({ matchPlans: { ...m.matchPlans, [f.id]: Number(i) } })} options={m.plans.map((p, i) => ({ value: String(i), label: p.name }))} />
            <ul className="list plan-summary">
              {(Object.keys(TACTIC_INFO) as (keyof Tactics)[]).map((k) => (
                <li key={k}>
                  <span className="faint">{TACTIC_INFO[k].title}</span>
                  <b>{labelOf(k, plan.tactics[k])}</b>
                </li>
              ))}
            </ul>
            <a className="link" href={`${href("tactique")}?plan=${planIndex}`}>
              Modifier le plan
            </a>
          </Panel>

          <Panel title="Composition" actions={<a className="link" href={href("composition")}>{m.selection.auto ? "Choisir" : "Modifier"}</a>}>
            <p className="muted" style={{ marginTop: 0 }}>
              {m.selection.auto ? "Le staff choisit le 23 (rotation, fatigue, absences)." : "Votre 23 :"}
              {!m.selection.auto && issues.some((i) => i.level === "error") && <Badge tone="critical">{issues.filter((i) => i.level === "error").length} problème(s)</Badge>}
            </p>
            <ol className="xv-list">
              {ourTeam.players.slice(0, 15).map((p, i) => (
                <li key={p.id}>
                  <span className="faint num">{i + 1}</span>
                  <span className="faint">{POSITION_SHORT_FR[SHIRT_POSITION[i + 1]!]}</span>
                  <PlayerLink w={w} id={p.id} short />
                  {p.id === ourTeam.captainId && <Crown size={12} aria-label="capitaine" />}
                  {p.id === ourTeam.goalKickerId && <Target size={12} aria-label="buteur" />}
                </li>
              ))}
            </ol>
            <div className="faint">
              Banc ({m.selection.bench}) : {ourTeam.players.slice(15).map((p) => shortName(p)).join(", ")}
            </div>
            <div style={{ marginTop: 10 }}>
              <Button size="sm" icon={<Shirt size={14} />} onClick={() => navigate("composition")}>
                Ouvrir la composition
              </Button>
            </div>
          </Panel>

          <Panel title="Arbitre">
            <p style={{ marginTop: 0 }}>
              <b>{referee.name}</b> : {refereeText(referee.breakdownStrictness)} au sol, {refereeText(referee.scrumStrictness)} en mêlée, {refereeText(referee.cardStrictness)} sur les cartons.
            </p>
            <p className="faint" style={{ marginBottom: 0 }}>
              Profil estimé (aucune donnée publique ne mesure ces tendances de façon fiable) ; son effet sur le match reste léger.
            </p>
          </Panel>

          <Panel title="Consignes ciblées" subtitle="Viser une faiblesse de l'adversaire (modifiable pendant le match)">
            <TargetsEditor opponents={opponents} value={m.matchTargets?.[f.id]} onChange={setTargets} />
          </Panel>

          <Panel title="Décisions sur pénalité">
            <PenaltyRulesEditor rules={m.penaltyRules} onChange={(penaltyRules) => void game.updateManager({ penaltyRules })} />
          </Panel>

          <Panel title="Face à face">
            <div className="h2h">
              <ClubCrest colors={club.colors} label={club.shortName} size={40} />
              <span className="display">{v.home || f.neutral ? "vs" : "@"}</span>
              <ClubCrest colors={opp.colors} label={opp.shortName} size={40} />
            </div>
            <div className="faint" style={{ textAlign: "center" }}>
              Classement : {rankText(w, myClubId(w), f.competitionId)} · {rankText(w, opp.id, f.competitionId)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

const labelOf = (k: keyof Tactics, v: string) => (TACTIC_LABEL_FR[k] as Record<string, string>)[v] ?? v;

function rankText(w: World, club: string, comp: string): string {
  const c = w.competitions[comp];
  if (!c || c.kind !== "league") return teamName(w, club);
  const i = leagueTable(w, comp).findIndex((r) => r.team === club);
  return `${w.clubs[club]?.shortName ?? club} ${ordinal(i + 1)}`;
}
