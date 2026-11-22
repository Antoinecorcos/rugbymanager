/**
 * Analyst's report on an opponent (GDD §5): probable 23, strengths and weaknesses by sector
 * compared with the league average, key players, form, absences — and tactical advice the manager
 * can apply in one click, each tied to an actual mechanism of the match engine.
 */
import type { MatchTeam, Weather } from "../domain/match-setup.js";
import type { Tactics } from "../domain/tactics.js";
import { SECTORS, sectorRatings, type Sector, type SectorRatings } from "../squad/analysis.js";
import { playerLevel, positionalQuality } from "../squad/selection.js";
import { SHIRT_POSITION, type Position } from "../domain/positions.js";
import type { IsoDate } from "./dates.js";
import { availability, managedTeam, staffSelection } from "./manager.js";
import type { Fixture, World } from "./types.js";

export interface FormLine {
  fixtureId: string;
  competitionId: string;
  date: IsoDate;
  opponent: string;
  home: boolean;
  for: number;
  against: number;
  outcome: "V" | "N" | "D";
}

export interface ClubRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  triesAgainst: number;
}

export interface ScoutReport {
  clubId: string;
  date: IsoDate;
  /** Probable 23 on that date. */
  team: MatchTeam;
  sectors: SectorRatings;
  /** Average of the league's probable 23s. */
  leagueAverage: SectorRatings;
  strengths: Sector[];
  weaknesses: Sector[];
  keyPlayers: { playerId: string; position: Position; level: number }[];
  form: FormLine[];
  record: ClubRecord;
  absences: { playerId: string; label: string; until?: IsoDate }[];
  cards: { yellow: number; red: number };
}

/** Match-day 23 of a club for a fixture: the manager's own selection, or the staff's choice. */
export function teamForFixture(w: World, f: Fixture, clubId: string): MatchTeam {
  if (w.manager?.clubId === clubId) return managedTeam(w, f, []).team;
  return staffSelection(w, clubId, f.date, { knockout: f.knockout });
}

export function clubForm(w: World, clubId: string, n = 5): FormLine[] {
  const played = w.fixtures.filter((f) => f.result && (f.home === clubId || f.away === clubId) && w.competitions[f.competitionId]?.kind !== "international");
  return played.slice(-n).map((f) => {
    const home = f.home === clubId;
    const r = f.result!;
    const pf = r.score[home ? 0 : 1];
    const pa = r.score[home ? 1 : 0];
    const won = r.winner === (home ? 0 : 1);
    const outcome = r.winner === null ? "N" : won ? "V" : "D";
    return { fixtureId: f.id, competitionId: f.competitionId, date: f.date, opponent: home ? f.away : f.home, home, for: pf, against: pa, outcome };
  });
}

export function clubRecord(w: World, clubId: string): ClubRecord {
  const rec: ClubRecord = { played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, triesFor: 0, triesAgainst: 0 };
  for (const f of w.fixtures) {
    if (!f.result || (f.home !== clubId && f.away !== clubId)) continue;
    const s = f.home === clubId ? 0 : 1;
    rec.played++;
    rec.pointsFor += f.result.score[s];
    rec.pointsAgainst += f.result.score[1 - s]!;
    rec.triesFor += f.result.tries[s];
    rec.triesAgainst += f.result.tries[1 - s]!;
    if (f.result.winner === null) rec.drawn++;
    else if (f.result.winner === s) rec.won++;
    else rec.lost++;
  }
  return rec;
}

/** Average sector ratings of the probable 23s of a league on a date. */
export function leagueSectorAverage(w: World, league: string, d: IsoDate): SectorRatings {
  const clubs = Object.values(w.clubs).filter((c) => c.league === league);
  const sum = Object.fromEntries(SECTORS.map((s) => [s, 0])) as SectorRatings;
  for (const c of clubs) {
    const r = sectorRatings(staffSelection(w, c.id, d));
    for (const s of SECTORS) sum[s] += r[s] / clubs.length;
  }
  for (const s of SECTORS) sum[s] = Math.round(sum[s] * 10) / 10;
  return sum;
}

export function scoutReport(w: World, clubId: string, f?: Fixture): ScoutReport {
  const d = f?.date ?? w.date;
  const team = f ? teamForFixture(w, f, clubId) : staffSelection(w, clubId, d);
  const sectors = sectorRatings(team);
  const leagueAverage = leagueSectorAverage(w, w.clubs[clubId]!.league, d);
  const gap = (s: Sector) => sectors[s] - leagueAverage[s];
  const ranked = [...SECTORS].sort((a, b) => gap(b) - gap(a));
  const keyPlayers = team.players
    .slice(0, 15)
    .map((p, i) => ({ playerId: p.id, position: SHIRT_POSITION[i + 1]!, level: Math.round(positionalQuality(p, SHIRT_POSITION[i + 1]!) * 10) / 10 }))
    .sort((a, b) => b.level - a.level)
    .slice(0, 3);
  const absences = (w.squads[clubId] ?? [])
    .map((pid) => w.players[pid]!)
    .map((ps) => ({ ps, av: availability(ps, d) }))
    .filter(({ av }) => av.status === "injured" || av.status === "suspended" || av.status === "duty")
    .sort((a, b) => playerLevel(b.ps.player) - playerLevel(a.ps.player))
    .map(({ ps, av }) => (av.until ? { playerId: ps.player.id, label: av.label, until: av.until } : { playerId: ps.player.id, label: av.label }));
  const cards = { yellow: 0, red: 0 };
  for (const pid of w.squads[clubId] ?? [])
    for (const [comp, st] of Object.entries(w.players[pid]!.stats)) {
      if (w.competitions[comp]?.kind === "international") continue;
      cards.yellow += st.yellowCards;
      cards.red += st.redCards;
    }
  return {
    clubId,
    date: d,
    team,
    sectors,
    leagueAverage,
    strengths: ranked.filter((s) => gap(s) >= 0.6).slice(0, 4),
    weaknesses: ranked.filter((s) => gap(s) <= -0.6).reverse().slice(0, 4),
    keyPlayers,
    form: clubForm(w, clubId),
    record: clubRecord(w, clubId),
    absences,
    cards,
  };
}

// ------------------------------------------------------------------ analyst's advice

export interface TacticalAdvice {
  id: string;
  /** What the analyst sees ("Notre mêlée domine : 14,1 contre 12,3"). */
  observation: string;
  /** What he suggests, and why it works in the match engine. */
  suggestion: string;
  /** Tactic to apply (absent for a simple remark). */
  tactic?: { [K in keyof Tactics]: { key: K; value: Tactics[K] } }[keyof Tactics];
}

const f1 = (v: number) => v.toFixed(1).replace(".", ",");

/**
 * Advice from the comparison of the two 23s. Thresholds are deliberately high: the analyst only
 * speaks when the gap is clear (≈ 1 point on the 1–20 scale). Cross-sector duels (our attack
 * against their defence) compare gaps to a reference — the league average, or by default the
 * average of the two teams — because sectors are not on the same scale.
 */
export function analystAdvice(ours: SectorRatings, theirs: SectorRatings, weather?: Weather, reference?: SectorRatings): TacticalAdvice[] {
  const out: TacticalAdvice[] = [];
  const d = (a: Sector) => ours[a] - theirs[a];
  const ref = (s: Sector) => reference?.[s] ?? (ours[s] + theirs[s]) / 2;
  /** Edge of our sector `a` over their sector `b`. */
  const duel = (x: SectorRatings, a: Sector, y: SectorRatings, b: Sector) => x[a] - ref(a) - (y[b] - ref(b));

  if (d("scrum") >= 0.9)
    out.push({ id: "scrum-penalty", observation: `Notre mêlée domine : ${f1(ours.scrum)} contre ${f1(theirs.scrum)}.`, suggestion: "Pousser pour la pénalité : plus de pénalités obtenues en mêlée, au prix de ballons moins rapides.", tactic: { key: "scrumIntent", value: "penalty" } });
  else if (d("scrum") <= -0.9)
    out.push({ id: "scrum-quick", observation: `Leur mêlée est plus forte : ${f1(theirs.scrum)} contre ${f1(ours.scrum)}.`, suggestion: "Sortir vite le ballon de nos mêlées pour limiter les pénalités concédées.", tactic: { key: "scrumIntent", value: "quickBall" } });

  if (d("maul") >= 0.8)
    out.push({ id: "maul-attack", observation: `Notre maul est plus puissant : ${f1(ours.maul)} contre ${f1(theirs.maul)}.`, suggestion: "Privilégier le maul après nos touches, surtout dans leurs 22 mètres.", tactic: { key: "lineoutAttack", value: "maul" } });
  if (d("maul") <= -0.8)
    out.push({ id: "maul-sack", observation: `Leur maul est redoutable : ${f1(theirs.maul)} contre ${f1(ours.maul)}.`, suggestion: "Ne pas sauter sur leurs touches et défendre le maul au sol : on perd moins de terrain.", tactic: { key: "lineoutDefence", value: "sack" } });
  else if (d("lineout") >= 1)
    out.push({ id: "lineout-contest", observation: `Nos sauteurs dominent les leurs : ${f1(ours.lineout)} contre ${f1(theirs.lineout)}.`, suggestion: "Contester tous leurs lancers : chaque ballon volé est une munition.", tactic: { key: "lineoutDefence", value: "contest" } });

  if (duel(ours, "backAttack", theirs, "defence") >= 0.8)
    out.push({ id: "attack-wide", observation: `Nos trois-quarts (${f1(ours.backAttack)}) peuvent déborder leur défense (${f1(theirs.defence)}).`, suggestion: "Jouer au large : plus de franchissements sur les extérieurs.", tactic: { key: "attackShape", value: "wide" } });
  else if (duel(ours, "carrying", theirs, "defence") >= 0.8)
    out.push({ id: "attack-tight", observation: `Nos avants (${f1(ours.carrying)}) gagnent les collisions face à leur défense (${f1(theirs.defence)}).`, suggestion: "Jouer au près pour user leur défense et gagner la ligne d'avantage.", tactic: { key: "attackShape", value: "tight" } });

  if (duel(theirs, "backAttack", ours, "defence") >= 0.8)
    out.push({ id: "defence-drift", observation: `Leurs trois-quarts sont dangereux (${f1(theirs.backAttack)}) face à notre défense (${f1(ours.defence)}).`, suggestion: "Défense glissée : elle réduit les franchissements au large et les hors-jeu.", tactic: { key: "defenceSystem", value: "drift" } });
  else if (duel(ours, "defence", theirs, "backAttack") >= 0.8)
    out.push({ id: "defence-rush", observation: `Leur attaque (${f1(theirs.backAttack)}) manque de solutions face à notre défense (${f1(ours.defence)}).`, suggestion: "Monter vite (rush) : plus de plaquages offensifs et d'interceptions, mais attention aux hors-jeu.", tactic: { key: "defenceSystem", value: "rush" } });

  if (d("breakdown") >= 1)
    out.push({ id: "ruck-commit", observation: `Nos gratteurs sont meilleurs : ${f1(ours.breakdown)} contre ${f1(theirs.breakdown)}.`, suggestion: "Contester chaque ruck : plus de turnovers, mais plus de pénalités possibles.", tactic: { key: "breakdownContest", value: "commit" } });
  else if (d("breakdown") <= -1)
    out.push({ id: "ruck-fill", observation: `Ils dominent au sol : ${f1(theirs.breakdown)} contre ${f1(ours.breakdown)}.`, suggestion: "Ne pas s'engager dans les rucks défensifs et remplir la ligne : moins de pénalités, une défense mieux organisée.", tactic: { key: "breakdownContest", value: "fillLine" } });

  if (duel(ours, "kicking", theirs, "aerial") >= 1)
    out.push({ id: "kick-pressure", observation: `Leur fond de terrain est fragile sous les ballons hauts (${f1(theirs.aerial)}) face à notre jeu au pied (${f1(ours.kicking)}).`, suggestion: "Jeu au pied de pression : chandelles et box kicks pour les mettre sous pression.", tactic: { key: "kickingGame", value: "pressure" } });

  if (weather === "wet")
    out.push({ id: "weather-wet", observation: "Pluie annoncée : le ballon sera glissant.", suggestion: "Limiter les offloads, qui provoquent plus d'en-avant sous la pluie.", tactic: { key: "offloadRisk", value: "low" } });

  if (theirs.discipline <= 10.5 && ours.goalKicking >= 13)
    out.push({ id: "discipline", observation: `Ils sont indisciplinés (${f1(theirs.discipline)}) et notre buteur est fiable (${f1(ours.goalKicking)}).`, suggestion: "Les pénalités dans leur moitié de terrain seront des points : privilégier les tentatives au but." });
  if (theirs.bench - ours.bench >= 1)
    out.push({ id: "bench", observation: `Leur banc est plus fort : ${f1(theirs.bench)} contre ${f1(ours.bench)}.`, suggestion: "Il faudra faire la différence avant l'heure de jeu : un banc 6-2 peut rééquilibrer le pack." });
  return out;
}
