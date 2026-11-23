/**
 * Season rollover (M6c): from the end of a season (30 June) to the first day of the next one
 * (1 July). In order:
 * 1. `closeSeason` (also run when the season ends in the career): the president's verdict, the JIFF
 *    sanction, the archive of the season, job offers;
 * 2. careers and caps of the players, promotions and relegations (Top 14 ⇄ Pro D2 ⇄ Nationale ⇄
 *    Nationale 2, whose clubs are fictional), budgets of the clubs that change league;
 * 3. retirements, then the moves agreed during the season (pre-contracts, buyouts), then the
 *    contracts that end without a deal (AI clubs renew part of them, the others become free agents);
 * 4. academies (youngsters who are too old leave or join the squad), AI squads completed with free
 *    agents or fictional players;
 * 5. the new calendar (World Cup 2027…), competitions, national pools, the manager's objectives,
 *    accounts and squad.
 * Everything is deterministic (seeded by the world seed and the season).
 */
import type { Position } from "../domain/positions.js";
import { generatePlayer } from "../gen/player-gen.js";
import { Rng } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import { newSeasonBoard, seasonVerdict } from "./board.js";
import { JIFF_RULE, jiffAverage, marketSalary, seasonEndYear } from "./contracts.js";
import { installCalendar } from "./create.js";
import { ageOn, type IsoDate } from "./dates.js";
import { ensureWorldExtensions } from "./extensions.js";
import { newSeasonFinances, seasonResult } from "./finances.js";
import { defaultStatuses, humanOf } from "./human.js";
import { receiveJobOffers } from "./jobs.js";
import { joinClub, preferredYears } from "./market.js";
import { buildNationPools, NATION_LEVEL, newPlayerState } from "./nations.js";
import { nextSeasonCalendar } from "./season-calendar.js";
import { seasonSummary } from "./summary.js";
import type { Contract, PlayerState, SeasonRecord, World, WorldClub } from "./types.js";

/** Competition id of each league. */
const LEAGUE_COMP: Record<string, string> = { TOP14: "top14", PROD2: "prod2", NATIONALE: "nationale", PREM: "prem", URC: "urc" };
/** Squad size AI clubs aim at, and the minimum at each position. */
const SQUAD_SIZE: Record<string, number> = { TOP14: 40, PROD2: 36, NATIONALE: 34, PREM: 40, URC: 40, OTHER: 32 };
const POSITION_MIN: Record<Position, number> = { LH: 3, HK: 3, TH: 3, LO: 5, BF: 3, OF: 2, N8: 2, SH: 3, FH: 2, IC: 3, OC: 2, WG: 4, FB: 2 };
/** Fictional Nationale 2 clubs (Nationale 2 is not in the database). */
const N2_NAMES: [string, string, [string, string]][] = [
  ["Ovalie Club Atlantique", "OC Atlantique", ["#1f4e79", "#ffffff"]],
  ["Ovalie Club Garonne", "OC Garonne", ["#7a1f2b", "#f2c14e"]],
  ["Ovalie Club Rhône", "OC Rhône", ["#2b6e3f", "#ffffff"]],
  ["Ovalie Club Loire", "OC Loire", ["#4b2a7b", "#e6e6e6"]],
  ["Ovalie Club Pyrénées", "OC Pyrénées", ["#c0392b", "#1c1c1c"]],
  ["Ovalie Club Normandie", "OC Normandie", ["#d4a017", "#1a2a4a"]],
  ["Ovalie Club Provence", "OC Provence", ["#0e7c86", "#f5e6c8"]],
  ["Ovalie Club Bretagne", "OC Bretagne", ["#111111", "#ffffff"]],
];
const NATIONALE_SIZE = 16;
/** French divisions, highest first. */
const LEVELS = ["TOP14", "PROD2", "NATIONALE", "NATIONALE2"];

const bestPosition = (ps: PlayerState): Position => (Object.entries(ps.player.positions).sort((a, b) => b[1] - a[1])[0]?.[0] as Position) ?? "LO";
const nameOf = (ps: PlayerState) => `${ps.player.firstName} ${ps.player.lastName}`;

/* ------------------------------------------------------------------ 1. end of season */

/**
 * End of the season (idempotent): verdict of the president, JIFF sanction, archive, job offers.
 * Called by "Continuer" when the season is over, and by `startNextSeason`.
 */
export function closeSeason(w: World): SeasonRecord {
  const existing = w.history?.find((h) => h.season === w.season);
  if (w.closedSeason === w.season && existing) return existing;
  const summary = seasonSummary(w, 1);
  const record: SeasonRecord = {
    season: w.season,
    honours: summary.competitions.filter((c) => c.champion).map((c) => ({ competitionId: c.id, name: c.name, champion: c.champion!, ...(c.runnerUp ? { runnerUp: c.runnerUp } : {}) })),
    movements: [],
  };
  const m = w.manager;
  if (m && !m.dismissed) {
    const club = w.clubs[m.clubId]!;
    const verdict = seasonVerdict(w);
    const rule = JIFF_RULE[club.league];
    const avg = jiffAverage(w);
    let penalty: number | undefined;
    if (rule && avg !== undefined && (w.jiffLog?.sheets ?? 0) >= 10 && avg < rule) {
      // Estimated scale: two points per missing JIFF on average, at most ten.
      penalty = Math.min(10, Math.ceil((rule - avg) * 2));
      w.news.push({ date: w.date, topic: "board", clubs: [club.id], text: `Règle JIFF non respectée (${avg.toFixed(1).replace(".", ",")} JIFF par feuille pour ${rule} exigés) : ${club.name} commencera la saison prochaine avec ${penalty} point${penalty > 1 ? "s" : ""} de pénalité.`, importance: 3 });
    }
    record.manager = {
      clubId: club.id,
      league: club.league,
      trophies: record.honours.filter((h) => h.champion === club.id).map((h) => h.name),
      ...(verdict?.rank !== undefined ? { rank: verdict.rank } : {}),
      ...(verdict?.objective ? { objective: verdict.objective } : {}),
      ...(verdict?.target !== undefined ? { target: verdict.target } : {}),
      ...(verdict ? { met: verdict.met, verdict: verdict.text } : {}),
      ...(m.board ? { confidence: m.board.confidence } : {}),
      ...(m.reputation !== undefined ? { reputation: m.reputation } : {}),
      ...(avg !== undefined ? { jiffAverage: Math.round(avg * 10) / 10 } : {}),
      ...(penalty ? { jiffPenalty: penalty } : {}),
    };
  }
  // A club relegated to Nationale 2 leaves the simulated leagues: the manager looks for a new club.
  if (m && !m.dismissed && w.competitions.nationale?.outcome?.relegated?.includes(m.clubId)) {
    m.dismissed = { date: w.date, reason: `${w.clubs[m.clubId]!.name} descend en Nationale 2, une division qui n'est pas simulée : vous cherchez un nouveau club.` };
  }
  w.history = [...(w.history ?? []).filter((h) => h.season !== w.season), record];
  w.closedSeason = w.season;
  if (m) receiveJobOffers(w);
  return record;
}

/* ------------------------------------------------------------------ 2. leagues */

interface Moves {
  /** Next season's members of each league (league code → club ids). */
  members: Record<string, string[]>;
  movements: SeasonRecord["movements"];
}

function leagueMoves(w: World, rng: Rng): Moves {
  const members: Record<string, string[]> = {};
  for (const c of Object.values(w.clubs)) (members[c.league] ??= []).push(c.id);
  const movements: Moves["movements"] = seasonSummary(w, 0).movements.map((m) => ({ ...m }));
  const nat = w.competitions.nationale?.outcome;
  for (const club of nat?.relegated ?? []) movements.push({ club, from: "NATIONALE", to: "NATIONALE2", reason: "relégué en Nationale 2" });
  const move = (club: string, from: string, to: string) => {
    members[from] = (members[from] ?? []).filter((c) => c !== club);
    (members[to] ??= []).push(club);
  };
  for (const mv of movements) move(mv.club, mv.from, mv.to);
  // Nationale 2 → Nationale: clubs relegated in earlier seasons first, otherwise fictional clubs.
  if (w.competitions.nationale) {
    const year = seasonEndYear(w);
    const justDown = new Set(nat?.relegated ?? []);
    let k = 0;
    while ((members.NATIONALE ?? []).length < NATIONALE_SIZE) {
      const back = (members.NATIONALE2 ?? []).filter((c) => !justDown.has(c)).sort((a, b) => w.clubs[b]!.reputation - w.clubs[a]!.reputation)[0];
      const id = back ?? createN2Club(w, year, k++, rng);
      if (!back) (members.NATIONALE2 ??= []).push(id);
      movements.push({ club: id, from: "NATIONALE2", to: "NATIONALE", reason: "promu de Nationale 2" });
      move(id, "NATIONALE2", "NATIONALE");
    }
  }
  return { members, movements };
}

/** Budget of a club that changes league (estimate). */
function newBudget(club: WorldClub, from: string, to: string): number | undefined {
  const b = club.budgetEur;
  if (!b) return undefined;
  const up = LEVELS.indexOf(to) < LEVELS.indexOf(from);
  const floor: Record<string, number> = { TOP14: 22_000_000, PROD2: 7_000_000, NATIONALE: 2_500_000, NATIONALE2: 800_000 };
  return Math.round((up ? Math.max(b * 1.45, floor[to] ?? b) : b * 0.68) / 100_000) * 100_000;
}

/** Creates a fictional club promoted from Nationale 2, with a squad at the level of the weakest Nationale clubs. */
function createN2Club(w: World, year: number, k: number, rng: Rng): string {
  const used = new Set(Object.values(w.clubs).map((c) => c.name));
  const pick = N2_NAMES.find(([n]) => !used.has(n)) ?? [`Ovalie Club ${year}-${k + 1}`, `OC ${k + 1}`, ["#555555", "#ffffff"] as [string, string]];
  const id = `n2-${year}-${k + 1}`;
  const nationale = Object.values(w.clubs).filter((c) => c.league === "NATIONALE");
  const strengths = nationale.map((c) => top23(w, c.id)).sort((a, b) => a - b);
  const level = (strengths[0] ?? 10) - 0.4;
  w.clubs[id] = {
    id,
    name: pick[0],
    shortName: pick[1],
    league: "NATIONALE2",
    country: "FRA",
    reputation: 28,
    stadium: "Stade municipal",
    colors: pick[2],
    capacity: 3500,
    budgetEur: 1_800_000,
    president: "Le président",
    headCoach: "Entraîneur (fictif)",
    generated: true,
  };
  w.squads[id] = [];
  let n = 0;
  for (const [pos, count] of Object.entries(POSITION_MIN) as [Position, number][]) {
    for (let i = 0; i < count; i++) addGenerated(w, id, pos, level + rng.normal(0, 0.6), rng, `${id}-${++n}`, year);
  }
  return id;
}

/* ------------------------------------------------------------------ 3. players */

/** Average level of a club's best 23. */
function top23(w: World, clubId: string): number {
  const lv = (w.squads[clubId] ?? []).map((id) => playerLevel(w.players[id]!.player)).sort((a, b) => b - a).slice(0, 23);
  return lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : 10;
}

/** Level of a club's n-th best player (the bar for its squad). */
function squadBar(w: World, clubId: string, n: number): number {
  const lv = (w.squads[clubId] ?? []).map((id) => playerLevel(w.players[id]!.player)).sort((a, b) => b - a);
  return lv[Math.min(n, lv.length - 1)] ?? 10;
}

function addGenerated(w: World, clubId: string, pos: Position, level: number, rng: Rng, id: string, year: number): PlayerState {
  const club = w.clubs[clubId]!;
  const french = club.country === "FRA";
  const player = generatePlayer(rng, {
    position: pos,
    level,
    id: `gen-${id}`,
    age: rng.int(20, 31),
    referenceDate: `${year}-07-01`,
    nationality: french ? (rng.chance(0.85) ? "FRA" : rng.weighted([["FIJ", 2], ["GEO", 2], ["ARG", 1], ["RSA", 1], ["TGA", 1]] as const)) : club.country === "RSA" ? "RSA" : club.country === "ITA" ? "ITA" : club.country === "WAL" ? "WAL" : club.country === "SCO" ? "SCO" : club.country === "IRL" ? "IRL" : "ENG",
  });
  player.potentialAbility = Math.max(player.potentialAbility ?? 0, (player.currentAbility ?? 0) + rng.int(0, 12));
  const ps = newPlayerState(player, clubId, 0);
  ps.profile = { generated: true, jiff: french && player.nationality === "FRA" && rng.chance(0.8) };
  ps.contract = { clubId, salary: Math.round((marketSalary(ps, club.league, `${year}-07-01`) * 0.9) / 1000) * 1000, expires: year + 1 + rng.int(0, 1), estimated: true };
  w.players[player.id] = ps;
  (w.squads[clubId] ??= []).push(player.id);
  return ps;
}

/** Removes a player from the game (retirement, released youngster, free agent who goes abroad). */
function removePlayer(w: World, id: string): void {
  const ps = w.players[id];
  if (ps?.clubId) {
    const sq = w.squads[ps.clubId];
    if (sq?.includes(id)) sq.splice(sq.indexOf(id), 1);
  }
  for (const list of Object.values(w.academies ?? {})) if (list.includes(id)) list.splice(list.indexOf(id), 1);
  if (w.freeAgents?.includes(id)) w.freeAgents = w.freeAgents.filter((x) => x !== id);
  delete w.players[id];
  delete w.scouting?.[id];
  delete w.negotiations?.[id];
}

/** Season statistics go to the player's career; caps are added up. */
function archivePlayers(w: World): void {
  for (const ps of Object.values(w.players)) {
    if (ps.virtual) continue;
    const all = Object.values(ps.stats);
    const caps = all.reduce((s, x) => s + x.caps, 0);
    ps.caps += caps;
    const apps = all.reduce((s, x) => s + x.appearances, 0);
    if (apps > 0) {
      const line = { season: w.season, appearances: apps, tries: all.reduce((s, x) => s + x.tries, 0), points: all.reduce((s, x) => s + x.points, 0), caps, ...(ps.clubId ? { clubId: ps.clubId } : {}) };
      ps.career = [...(ps.career ?? []), line].slice(-12);
    }
    ps.stats = {};
    ps.yellowCount = 0;
    ps.startStreak = 0;
    ps.freshness = 100;
    delete ps.duty;
    delete ps.restUntil;
    if (ps.human) {
      ps.human.promises = [];
      delete ps.human.lastComplaint;
    }
  }
}

function retirements(w: World, rng: Rng, start: IsoDate, end: number, pending: Set<string>): string[] {
  const out: string[] = [];
  for (const ps of Object.values(w.players)) {
    if (ps.virtual || ps.academy || pending.has(ps.player.id)) continue;
    const age = ageOn(ps.player.birthDate, start);
    const expiring = !ps.contract || ps.contract.expires <= end;
    const weak = ps.clubId ? playerLevel(ps.player) < squadBar(w, ps.clubId, 22) : true;
    const p =
      age >= 38 ? 1
      : !expiring ? (age >= 36 ? 0.25 : 0)
      : age >= 36 ? 0.75
      : age >= 34 ? 0.3 + (weak ? 0.2 : 0)
      : age >= 33 ? 0.1 + (weak ? 0.1 : 0)
      : 0;
    if (p > 0 && rng.chance(p)) out.push(ps.player.id);
  }
  return out;
}

/* ------------------------------------------------------------------ 4. squads */

/** An AI club completes its squad: free agents first, then fictional players. */
function completeSquad(w: World, clubId: string, rng: Rng, size: number, year: number): string[] {
  const club = w.clubs[clubId]!;
  const signed: string[] = [];
  const bar = squadBar(w, clubId, 26);
  const count = (pos: Position) => (w.squads[clubId] ?? []).filter((id) => bestPosition(w.players[id]!) === pos).length;
  let n = 0;
  for (let guard = 0; guard < 60 && (w.squads[clubId] ?? []).length < size; guard++) {
    const needs = (Object.keys(POSITION_MIN) as Position[]).map((p) => [p, count(p) - POSITION_MIN[p]] as const).sort((a, b) => a[1] - b[1]);
    const pos = needs[0]![0];
    const fa = (w.freeAgents ?? [])
      .map((id) => w.players[id]!)
      .filter((ps) => ps && bestPosition(ps) === pos && Math.abs(playerLevel(ps.player) - bar) <= 1.5 && ageOn(ps.player.birthDate, `${year}-07-01`) <= 33)
      .sort((a, b) => playerLevel(b.player) - playerLevel(a.player))[0];
    if (fa) {
      const contract: Contract = { clubId, salary: Math.round((marketSalary(fa, club.league, `${year}-07-01`) * 0.9) / 1000) * 1000, expires: year + 1 + rng.int(0, 1), estimated: true };
      joinClub(w, fa, clubId, contract);
      signed.push(fa.player.id);
    } else {
      signed.push(addGenerated(w, clubId, pos, bar + rng.normal(0, 0.5), rng, `${clubId}-${year}-${++n}`, year).player.id);
    }
  }
  return signed;
}

/* ------------------------------------------------------------------ the rollover */

export interface RolloverReport {
  season: string;
  retired: number;
  transfers: number;
  released: number;
  renewed: number;
  generated: number;
  movements: SeasonRecord["movements"];
}

/** Moves the world from the end of its season to 1 July of the next one. */
export function startNextSeason(w: World): RolloverReport {
  if (w.date <= w.calendar.end) throw new Error("La saison n'est pas terminée.");
  const record = closeSeason(w);
  const end = seasonEndYear(w);
  const start: IsoDate = `${end}-07-01`;
  const rng = new Rng(`${w.seed}:rollover:${end}`);
  const m = w.manager;
  const mine = m?.clubId;
  const news: { text: string; importance: 1 | 2 | 3; clubs: string[] }[] = [];
  const report: RolloverReport = { season: `${end}-${end + 1}`, retired: 0, transfers: 0, released: 0, renewed: 0, generated: 0, movements: [] };

  // 2. Careers, league moves and budgets.
  for (const c of Object.values(w.clubs)) {
    const comp = w.competitions[LEAGUE_COMP[c.league] ?? ""];
    const rank = comp?.outcome?.ranking?.indexOf(c.id) ?? -1;
    if (rank >= 0) c.previousRank = { league: c.league, rank: rank + 1 };
  }
  archivePlayers(w);
  const moves = leagueMoves(w, rng);
  for (const mv of moves.movements) {
    const club = w.clubs[mv.club]!;
    const budget = newBudget(club, mv.from, mv.to);
    if (budget) club.budgetEur = budget;
    club.league = mv.to;
    const up = LEVELS.indexOf(mv.to) < LEVELS.indexOf(mv.from);
    if (mv.club === mine) news.push({ clubs: [mv.club], importance: 3, text: up ? `${club.name} évolue désormais en ${leagueName(mv.to)} (${mv.reason}) !` : `${club.name} est relégué en ${leagueName(mv.to)} (${mv.reason}).` });
  }
  record.movements = moves.movements;
  report.movements = moves.movements;

  // 3a. Retirements (players with an agreed move keep playing).
  const pending = new Set((w.transfers ?? []).filter((t) => !t.done).map((t) => t.playerId));
  for (const id of retirements(w, rng, start, end, pending)) {
    const ps = w.players[id]!;
    const notable = ps.clubId === mine || playerLevel(ps.player) >= 15 || ps.caps >= 50;
    if (notable) news.push({ clubs: ps.clubId ? [ps.clubId] : [], importance: ps.clubId === mine ? 2 : 1, text: `${nameOf(ps)}${ps.clubId ? ` (${w.clubs[ps.clubId]!.name})` : ""} met un terme à sa carrière à ${ageOn(ps.player.birthDate, start)} ans${ps.caps ? ` (${ps.caps} sélections)` : ""}.` });
    removePlayer(w, id);
    report.retired++;
  }

  // 3b. Agreed moves take effect on 1 July.
  for (const t of w.transfers ?? []) {
    if (t.done || t.kind === "renewal") continue;
    const ps = w.players[t.playerId];
    t.done = true;
    if (!ps) continue;
    const from = ps.clubId;
    joinClub(w, ps, t.to, { ...t.contract });
    report.transfers++;
    if (t.to === mine) news.push({ clubs: [t.to], importance: 2, text: `${nameOf(ps)} rejoint officiellement le club${from ? ` (en provenance de ${w.clubs[from]?.name ?? from})` : ""}.` });
    else if (from && from === mine) news.push({ clubs: [from], importance: 2, text: `${nameOf(ps)} quitte le club pour ${w.clubs[t.to]?.name ?? t.to}.` });
  }

  // 3c. Contracts ending without a deal.
  for (const [clubId, ids] of Object.entries(w.squads)) {
    const club = w.clubs[clubId]!;
    const core = new Set([...ids].sort((a, b) => playerLevel(w.players[b]!.player) - playerLevel(w.players[a]!.player)).slice(0, 28));
    for (const id of [...ids]) {
      const ps = w.players[id]!;
      const c = ps.contract;
      if (c && c.expires > end && !c.until) continue;
      const age = ageOn(ps.player.birthDate, start);
      const keep = clubId !== mine && !c?.joker && rng.chance(age >= 35 ? (core.has(id) ? 0.3 : 0) : age >= 33 ? (core.has(id) ? 0.6 : 0.15) : core.has(id) ? 0.85 : 0.4);
      if (keep) {
        ps.contract = { clubId, salary: Math.round(((c?.salary ?? marketSalary(ps, club.league, start)) * rng.range(0.95, 1.12)) / 1000) * 1000, expires: end + preferredYears(ps, start), estimated: true };
        report.renewed++;
        continue;
      }
      ids.splice(ids.indexOf(id), 1);
      delete ps.clubId;
      delete ps.contract;
      delete ps.human;
      (w.freeAgents ??= []).push(id);
      report.released++;
      if (clubId === mine) news.push({ clubs: [clubId], importance: 2, text: `${nameOf(ps)} quitte le club : ${c?.joker ? "fin de son contrat de joker" : "son contrat est arrivé à échéance sans prolongation"}.` });
    }
  }

  // 4a. Academies: youngsters of 21 join the squad (AI clubs, if good enough) or leave.
  for (const [clubId, list] of Object.entries(w.academies ?? {})) {
    for (const id of [...list]) {
      const ps = w.players[id];
      if (!ps || ageOn(ps.player.birthDate, start) < 21) continue;
      const club = w.clubs[clubId]!;
      const good = clubId !== mine && playerLevel(ps.player) >= squadBar(w, clubId, 30) - 0.3 && (w.squads[clubId] ?? []).length < (SQUAD_SIZE[club.league] ?? 34) + 2;
      if (good) {
        list.splice(list.indexOf(id), 1);
        delete ps.academy;
        (w.squads[clubId] ??= []).push(id);
        ps.contract = { clubId, salary: marketSalary(ps, club.league, start), expires: end + 2, estimated: true, status: "prospect" };
      } else {
        if (clubId === mine) news.push({ clubs: [clubId], importance: 1, text: `${nameOf(ps)} quitte le centre de formation (limite d'âge) sans contrat professionnel.` });
        removePlayer(w, id);
      }
    }
  }

  // 4b. AI squads completed; the manager's staff only signs to reach 28 players.
  for (const [clubId, club] of Object.entries(w.clubs)) {
    if (club.league === "NATIONALE2") continue;
    const target = clubId === mine ? 28 : (SQUAD_SIZE[club.league] ?? 34) - 2;
    const signed = completeSquad(w, clubId, rng, target, end);
    report.generated += signed.filter((id) => id.startsWith("gen-")).length;
    if (clubId === mine && signed.length) news.push({ clubs: [clubId], importance: 2, text: `Effectif trop court : le staff a recruté ${signed.length} joueur${signed.length > 1 ? "s" : ""} pour atteindre 28 (${signed.map((id) => nameOf(w.players[id]!)).join(", ")}).` });
  }

  // 4c. Free agents: the oldest retire, the pool keeps its best 140, fictional players top it up.
  const fa = (w.freeAgents ?? []).filter((id) => w.players[id]);
  for (const id of fa) if (ageOn(w.players[id]!.player.birthDate, start) >= 35) removePlayer(w, id);
  const kept = (w.freeAgents ?? []).filter((id) => w.players[id]).sort((a, b) => playerLevel(w.players[b]!.player) - playerLevel(w.players[a]!.player));
  for (const id of kept.slice(140)) removePlayer(w, id);
  w.freeAgents = kept.slice(0, 140);
  topUpFreeAgents(w, end, rng);

  // 5. New calendar and competitions.
  const levels = { ...NATION_LEVEL };
  const teams: Record<string, string[]> = {};
  for (const [code, comp] of Object.entries(LEAGUE_COMP)) teams[comp] = Object.values(w.clubs).filter((c) => c.league === code).map((c) => c.id);
  const calendar = nextSeasonCalendar(w, { leagues: teams }, levels);
  installCalendar(w, calendar);
  w.date = calendar.start;
  const penalty = record.manager?.jiffPenalty;
  if (penalty && record.manager) {
    const comp = w.competitions[LEAGUE_COMP[w.clubs[record.manager.clubId]!.league] ?? ""];
    if (comp) comp.adjustments = { ...(comp.adjustments ?? {}), [record.manager.clubId]: -penalty };
  }

  // National pools: virtual players are generated again for the new season's competitions.
  for (const [id, ps] of Object.entries(w.players)) if (ps.virtual) delete w.players[id];
  w.nationPools = {};
  buildNationPools(w, [...new Set(calendar.internationals.flatMap((i) => i.groups.flat()))], `${w.seed}:${calendar.season}`);

  // Season state.
  const lastResult = mine && w.clubs[mine]!.finances ? seasonResult(w.clubs[mine]!.finances!) : 0;
  w.reports = {};
  w.news = [];
  w.transfers = [];
  w.negotiations = {};
  w.approaches = {};
  delete w.jiffLog;
  for (const club of Object.values(w.clubs)) for (const s of club.staff ?? []) s.age += 1;
  delete w.staffMarket;
  ensureWorldExtensions(w);

  if (m) {
    m.newsRead = 0;
    m.matchPlans = {};
    m.matchTargets = {};
    m.teamTalks = {};
    m.press = {};
    if (!m.selection.auto) m.selection = { ...m.selection, auto: true, lineup: [] };
    if (!m.dismissed) {
      const statuses = defaultStatuses(w, m.clubId);
      for (const id of w.squads[m.clubId] ?? []) {
        const ps = w.players[id]!;
        const h = humanOf(w, ps);
        if (!ps.contract?.status) h.status = statuses[id] ?? h.status;
      }
      newSeasonFinances(w, lastResult);
      newSeasonBoard(w);
    }
    // Offers not taken during the summer lapse with the new season.
    m.offers = [];
  }
  const champions = record.honours.filter((h) => ["top14", "champions-cup", "world-cup"].includes(h.competitionId));
  w.news.unshift({
    date: w.date,
    topic: "season",
    clubs: mine ? [mine] : [],
    text: `Début de la saison ${w.season}. ${champions.map((h) => `${h.name} ${record.season} : ${w.clubs[h.champion ?? ""]?.name ?? h.champion}`).join(" ; ")}${champions.length ? "." : ""} ${report.transfers} transferts prennent effet, ${report.retired} joueurs ont pris leur retraite.`,
    importance: 2,
  });
  for (const n of news) w.news.push({ date: w.date, topic: n.importance >= 2 ? "club" : "transfer", clubs: n.clubs, text: n.text, importance: n.importance });
  if (w.competitions["world-cup"]) w.news.push({ date: w.date, topic: "international", clubs: mine ? [mine] : [], text: `Coupe du monde ${end} en ${end === 2027 ? "Australie" : "terrain neutre"} du ${formatShort(w.calendar.internationals.find((i) => i.id === "world-cup")!.rounds[0]!.matches[0]!.date)} au ${formatShort(w.competitions["world-cup"].knockout.finale!)} : les internationaux quitteront leurs clubs dès le 2 août. Des jokers Coupe du monde pourront les remplacer.`, importance: 2 });
  return report;
}

const leagueName = (code: string): string => ({ TOP14: "Top 14", PROD2: "Pro D2", NATIONALE: "Nationale", NATIONALE2: "Nationale 2" })[code] ?? code;
const formatShort = (d: IsoDate): string => d.split("-").reverse().slice(0, 2).join("/");

/** Fictional free agents for the new season (at least 45 in the pool). */
function topUpFreeAgents(w: World, year: number, rng: Rng): void {
  const positions: Position[] = ["LH", "HK", "TH", "LO", "LO", "BF", "OF", "N8", "SH", "FH", "IC", "OC", "WG", "WG", "FB"];
  let i = 0;
  while ((w.freeAgents ?? []).length < 45) {
    const position = positions[i % positions.length]!;
    const player = generatePlayer(rng, { position, level: rng.range(9.5, 13.4), age: rng.int(24, 33), id: `libre-${year}-${i++}`, referenceDate: `${year}-07-01`, nationality: rng.weighted([["FRA", 6], ["FIJ", 2], ["RSA", 1], ["GEO", 1], ["ARG", 1], ["NZL", 1]] as const) });
    player.potentialAbility = player.currentAbility;
    const ps = newPlayerState(player, undefined, 0);
    ps.profile = { generated: true, jiff: player.nationality === "FRA" && rng.chance(0.7) };
    w.players[player.id] = ps;
    (w.freeAgents ??= []).push(player.id);
  }
}
