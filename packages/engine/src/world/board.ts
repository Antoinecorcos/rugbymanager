/**
 * The president and the board (GDD §6.6): season objectives set from the squad's strength in its
 * league, a confidence that follows results, the league table, finances, the salary cap and the
 * JIFF rule — and, at the bottom, an ultimatum then the sack. The manager can ask for money.
 */
import { clamp } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import { JIFF_RULE, jiffAverage, payroll, salaryCap } from "./contracts.js";
import { jiffCount } from "./market.js";
import { daysBetween, type IsoDate } from "./dates.js";
import { leagueTable } from "./competitions.js";
import type { Fixture, World } from "./types.js";

export interface BoardObjective {
  id: "league" | "cap" | "jiff" | "finances";
  label: string;
  /** League objective: worst acceptable final position. */
  rank?: number;
}

export interface BoardRequest {
  date: IsoDate;
  kind: "wages" | "transfers";
  accepted: boolean;
}

export interface BoardState {
  president: string;
  objectives: BoardObjective[];
  /** Confidence 0..100. */
  confidence: number;
  /** Ultimatum given on this date (dismissal if confidence keeps falling). */
  ultimatum?: IsoDate;
  /** Last alert sent (to avoid repeating it). */
  lastAlert?: IsoDate;
  requests: BoardRequest[];
  /** Situation inherited by the manager: he is judged on what he changes. */
  baseline?: { payroll: number; jiff: number };
}

const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export const confidenceLabel = (c: number): string =>
  c >= 75 ? "Totale" : c >= 55 ? "Bonne" : c >= 40 ? "Mitigée" : c >= 25 ? "Inquiète" : "Au plus bas";

/** League rank of each club of a league by the strength of its best 23 (the board's expectation). */
export function strengthRanks(w: World, league: string): string[] {
  const clubs = Object.entries(w.clubs).filter(([, c]) => c.league === league).map(([id]) => id);
  const strength = (id: string) => {
    const lv = (w.squads[id] ?? []).map((p) => playerLevel(w.players[p]!.player)).sort((a, b) => b - a).slice(0, 23);
    return lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length);
  };
  return clubs.sort((a, b) => strength(b) - strength(a));
}

function leagueObjective(league: string, expected: number, size: number): BoardObjective {
  const tiers: [number, string][] =
    league === "TOP14" ? [[2, "Jouer le titre : atteindre les demi-finales"], [6, "Se qualifier pour les phases finales (top 6)"], [8, "Finir dans le top 8 (qualification européenne)"], [12, "Assurer le maintien sans barrage (12e ou mieux)"]]
    : league === "PROD2" ? [[2, "Viser la montée (top 2)"], [6, "Se qualifier pour les phases finales (top 6)"], [12, "Finir dans la première moitié"], [14, "Assurer le maintien"]]
    : [[2, "Viser la montée"], [6, "Se qualifier pour les phases finales"], [11, "Assurer le maintien"]];
  for (const [rank, label] of tiers) if (expected <= rank) return { id: "league", label, rank };
  const last = tiers[tiers.length - 1]!;
  return { id: "league", label: last[1], rank: Math.min(size - 1, last[0]) };
}

/** The board's objectives for the season (idempotent). */
export function initBoard(w: World): void {
  const m = w.manager;
  if (!m || m.board) return;
  const club = w.clubs[m.clubId]!;
  const ranks = strengthRanks(w, club.league);
  const expected = ranks.indexOf(club.id) + 1;
  const objectives: BoardObjective[] = [leagueObjective(club.league, expected, ranks.length)];
  // JIFF statuses are estimated: the board expects what the squad can realistically field (rule at most).
  const best23 = (w.squads[club.id] ?? []).slice().sort((a, b) => playerLevel(w.players[b]!.player) - playerLevel(w.players[a]!.player)).slice(0, 23);
  const jiffBase = jiffCount(w, best23);
  const rule = JIFF_RULE[club.league];
  if (club.league === "TOP14") objectives.push({ id: "cap", label: "Respecter le salary cap" });
  if (rule) {
    const target = Math.min(rule, Math.max(8, jiffBase));
    objectives.push({ id: "jiff", label: `Aligner au moins ${target} JIFF par feuille de match en moyenne (règle : ${rule})`, rank: target });
  }
  objectives.push({ id: "finances", label: "Garder des comptes à l'équilibre" });
  m.board = { president: club.president ?? "Le président", objectives, confidence: 60, requests: [], baseline: { payroll: payroll(w, club.id), jiff: jiffBase } };
  w.news.push({ date: w.date, topic: "board", clubs: [club.id], text: `${m.board.president} fixe les objectifs de la saison : ${objectives.map((o) => lcFirst(o.label)).join(" ; ")}.`, importance: 3 });
}

const adjust = (w: World, delta: number) => {
  const b = w.manager?.board;
  if (b) b.confidence = Math.round(clamp(b.confidence + delta, 0, 100) * 10) / 10;
};

/** After a match of the manager's club: confidence moves with the result and the stake. */
export function boardAfterMatch(w: World, f: Fixture): void {
  const m = w.manager;
  const b = m?.board;
  if (!m || !b || !f.result || (f.home !== m.clubId && f.away !== m.clubId)) return;
  const side = f.home === m.clubId ? 0 : 1;
  const won = f.result.winner === side;
  const drawn = f.result.winner === null;
  const club = w.clubs[m.clubId]!;
  const oppId = side === 0 ? f.away : f.home;
  const opp = w.clubs[oppId];
  const sameLeague = opp?.league === club.league;
  let gap = 0;
  if (sameLeague) {
    const ranks = strengthRanks(w, club.league);
    gap = ranks.indexOf(club.id) - ranks.indexOf(oppId); // > 0: the opponent is stronger
  }
  const stake = f.knockout ? (f.stage === "finale" ? 3 : 2) : 1;
  let delta = won ? 1.5 + Math.max(0, gap) * 0.25 : drawn ? 0 : -1.5 - Math.max(0, -gap) * 0.3;
  if (f.knockout && won && f.stage === "finale") delta += 10;
  adjust(w, delta * stake);
  m.reputation = Math.round(clamp((m.reputation ?? 50) + (won ? 0.4 : drawn ? 0 : -0.3) * stake, 1, 100) * 10) / 10;
}

/** Monday review: league position against the objective, finances, salary cap, JIFF; alerts and the sack. */
export function weeklyBoard(w: World): void {
  const m = w.manager;
  const b = m?.board;
  if (!m || !b || m.dismissed) return;
  const club = w.clubs[m.clubId]!;
  const league = club.league.toLowerCase();
  const table = w.competitions[league] ? leagueTable(w, league) : [];
  const me = table.findIndex((r) => r.team === m.clubId);
  const played = me >= 0 ? table[me]!.played : 0;
  const target = b.objectives.find((o) => o.id === "league")?.rank;
  if (target && played >= 4 && me >= 0) {
    const pos = me + 1;
    adjust(w, pos <= target ? 0.4 : pos > target + 3 ? -1.4 : -0.4);
  }
  if (Number(w.date.slice(8, 10)) <= 7) {
    if ((club.finances?.balance ?? 0) < 0) adjust(w, -1.5);
    const pay = payroll(w, club.id);
    if (pay > salaryCap(w, club.id) && pay > (b.baseline?.payroll ?? 0)) adjust(w, -4);
    const jiffTarget = b.objectives.find((o) => o.id === "jiff")?.rank;
    const avg = jiffAverage(w);
    if (jiffTarget && avg !== undefined && (w.jiffLog?.sheets ?? 0) >= 8 && avg < jiffTarget - 0.5) adjust(w, -1.5);
  }
  // Alerts, ultimatum, dismissal.
  const recently = b.lastAlert && daysBetween(b.lastAlert, w.date) < 28;
  if (b.confidence < 12 && b.ultimatum && daysBetween(b.ultimatum, w.date) >= 21 && played >= 8) {
    m.dismissed = { date: w.date, reason: `${b.president} a perdu confiance : résultats en dessous des objectifs (${lcFirst(b.objectives[0]?.label ?? "")}).` };
    w.news.push({ date: w.date, topic: "board", clubs: [m.clubId], text: `${m.profile.name} est démis de ses fonctions de manager de ${club.name}.`, importance: 3 });
    return;
  }
  if (b.confidence < 25 && !b.ultimatum) {
    b.ultimatum = w.date;
    b.lastAlert = w.date;
    w.news.push({ date: w.date, topic: "board", clubs: [m.clubId], text: `Ultimatum : ${b.president} exige une réaction immédiate. Sans amélioration dans les prochaines semaines, vous serez remercié.`, importance: 3 });
  } else if (b.confidence < 40 && !recently && !b.ultimatum) {
    b.lastAlert = w.date;
    w.news.push({ date: w.date, topic: "board", clubs: [m.clubId], text: `${b.president} s'inquiète des résultats et attend mieux de l'équipe.`, importance: 2 });
  } else if (b.ultimatum && b.confidence >= 40) {
    delete b.ultimatum;
    w.news.push({ date: w.date, topic: "board", clubs: [m.clubId], text: `${b.president} lève son ultimatum : l'équipe a réagi.`, importance: 2 });
  }
}

/** Ask the president for more money. Returns his answer (French). */
export function boardRequest(w: World, kind: BoardRequest["kind"]): { accepted: boolean; text: string } {
  const m = w.manager;
  const b = m?.board;
  const f = m ? w.clubs[m.clubId]!.finances : undefined;
  if (!m || !b || !f) return { accepted: false, text: "Aucune carrière en cours." };
  const last = [...b.requests].reverse().find((r) => r.kind === kind);
  if (last && daysBetween(last.date, w.date) < 60) return { accepted: false, text: `${b.president} : « Nous en avons parlé il y a peu. Revenez dans quelques semaines. »` };
  const accepted = b.confidence >= 60 && f.balance > 0;
  b.requests.push({ date: w.date, kind, accepted });
  if (!accepted) {
    adjust(w, -1);
    return { accepted, text: `${b.president} refuse : « ${b.confidence < 60 ? "Les résultats doivent d'abord suivre." : "Les comptes ne le permettent pas."} »` };
  }
  const club = w.clubs[m.clubId]!;
  if (kind === "wages") {
    const cap = salaryCap(w, club.id);
    const before = f.wageBudget;
    f.wageBudget = Math.round(Math.min(cap, f.wageBudget * 1.05) / 1000) * 1000;
    if (f.wageBudget === before) return { accepted: false, text: `${b.president} : « Le budget salarial est déjà au niveau du salary cap. »` };
    return { accepted, text: `${b.president} accepte : le budget salarial passe à ${Math.round(f.wageBudget / 1000).toLocaleString("fr-FR")} k€.` };
  }
  f.transferBudget += Math.round((club.budgetEur ?? 10_000_000) * 0.01);
  return { accepted, text: `${b.president} accepte : le budget de recrutement passe à ${Math.round(f.transferBudget / 1000).toLocaleString("fr-FR")} k€.` };
}


