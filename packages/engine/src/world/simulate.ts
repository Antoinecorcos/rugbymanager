/** Day-by-day simulation: call-ups, matches, injuries, suspensions, fatigue, knock-out stages. */
import type { MatchSetup, MatchTeam, Weather } from "../domain/match-setup.js";
import type { Player } from "../domain/player.js";
import { isForward } from "../domain/positions.js";
import { simulateMatch } from "../match/engine.js";
import type { MatchResult } from "../match/types.js";
import { Rng } from "../rng.js";
import { playerLevel, selectMatchTeam } from "../squad/selection.js";
import type { InternationalWindow } from "./calendar.js";
import { NATION_NAME_FR, progressCompetitions } from "./competitions.js";
import { addDays, type IsoDate } from "./dates.js";
import { NATION_LEVEL } from "./nations.js";
import { managedTeam, recordReport } from "./manager.js";
import { fixtureReferee } from "./referees.js";
import { academyIntake, intakeDate } from "./academy.js";
import { afterClubMatch, captainTrust, teamMorale, teamTalkEffect, weeklyHuman, type TeamTalk } from "./human.js";
import { isFragile, recordInjury } from "./medical.js";
import { dailyTrainingRecovery, logMinutes, planOf, weeklyTraining } from "./training.js";
import { weekday } from "./dates.js";
import { boardAfterMatch, weeklyBoard } from "./board.js";
import { fixtureFinances, monthlyFinances } from "./finances.js";
import { contractReminders, dailyScouting, jiffCount, releaseWorldCupJokers, weeklyMarket } from "./market.js";
import type { Fixture, PlayerSeasonStats, PlayerState, World } from "./types.js";

/**
 * Freshness model: an 80-minute match costs ~30 points to a forward (~24 to a back), a day of rest
 * gives back ~2.2. A player used every weekend therefore loses freshness week after week and gets
 * rotated (see `fatiguePenalty`), like real squads that manage their internationals' workload.
 */
export const FATIGUE = { forward: 30, back: 24, dailyRecovery: 2.2 };

/**
 * Squad management rules applied by every (AI) coach outside knock-out matches:
 * a player is rested after `maxStreak` consecutive starts, below `minFreshness`,
 * and for `restAfterDutyDays` after an international window (FFR-LNR convention spirit).
 */
export const ROTATION = { maxStreak: 3, minFreshness: 55, restAfterDutyDays: 10 };

const emptyStats = (): PlayerSeasonStats => ({ appearances: 0, starts: 0, minutes: 0, tries: 0, points: 0, yellowCards: 0, redCards: 0, caps: 0 });

export const isInjured = (ps: PlayerState, d: IsoDate): boolean => !!ps.injury && ps.injury.until > d;
export const isSuspended = (ps: PlayerState, d: IsoDate): boolean => !!ps.suspension && ps.suspension.until > d;
export const isOnDuty = (ps: PlayerState, d: IsoDate): boolean => !!ps.duty && ps.duty.until >= d;
/** Fit and not suspended (regardless of international duty). */
export const isFit = (ps: PlayerState, d: IsoDate): boolean => !isInjured(ps, d) && !isSuspended(ps, d);

/**
 * Advances the world by one day. Returns the fixtures played that day.
 * `played`: fixtures already played live (by id), recorded instead of being simulated.
 */
export function advanceDay(w: World, played?: Record<string, PlayedFixture>): Fixture[] {
  const d = w.date;
  // Mondays: training week (automatisms, training injuries, development) and the squad's morale.
  monthlyFinances(w);
  dailyScouting(w);
  releaseWorldCupJokers(w);
  if (weekday(d) === 1) {
    weeklyTraining(w);
    weeklyHuman(w);
    weeklyMarket(w);
    contractReminders(w);
    weeklyBoard(w);
  }
  if (d === intakeDate(w)) academyIntake(w);
  for (const win of w.calendar.windows) if (win.start === d) callUps(w, win);
  progressCompetitions(w);
  const today = w.fixtures.filter((f) => f.date === d && !f.result);
  for (const f of today) playFixture(w, f, played?.[f.id]);
  progressCompetitions(w);
  dailyRecovery(w);
  w.date = addDays(d, 1);
  return today;
}

/** Advances until `until` (exclusive): the world date becomes `until`. */
export function advanceTo(w: World, until: IsoDate): void {
  while (w.date < until) advanceDay(w);
}

/** Plays the whole season (until the day after the calendar's last day). */
export function playSeason(w: World): void {
  advanceTo(w, addDays(w.calendar.end, 1));
}

// ------------------------------------------------------------------ international call-ups

/** Squad sizes: nations playing a competition call 32 players, the others ~28 capped players. */
function callUps(w: World, win: InternationalWindow): void {
  const competing = new Set(
    w.calendar.internationals
      .filter((i) => i.rounds.some((r) => r.matches.some((m) => m.date >= win.start && m.date <= win.end)))
      .flatMap((i) => i.groups.flat()),
  );
  const nations = win.nations === "*" ? Object.keys(w.nationPools) : win.nations;
  for (const nation of nations) {
    const plays = competing.has(nation);
    const candidates = (w.nationPools[nation] ?? [])
      .map((id) => w.players[id]!)
      .filter((ps) => isFit(ps, addDays(win.start, 7)) && (plays || ps.caps > 0) && playerLevel(ps.player) >= (NATION_LEVEL[nation] ?? 11) - 3.5);
    if (!candidates.length) continue;
    const size = plays ? 32 : 28;
    let squad: PlayerState[];
    if (candidates.length > 23) {
      const xv = selectMatchTeam(candidates.map((c) => c.player), { id: nation, name: nation, shortName: nation });
      const chosen = new Set(xv.players.map((p) => p.id));
      const rest = candidates.filter((c) => !chosen.has(c.player.id)).sort((a, b) => playerLevel(b.player) - playerLevel(a.player));
      squad = [...xv.players.map((p) => w.players[p.id]!), ...rest.slice(0, size - 23)];
    } else squad = candidates;
    for (const ps of squad) ps.duty = { nation, until: win.end };
    const clubs = new Map<string, number>();
    for (const ps of squad) if (ps.clubId) clubs.set(ps.clubId, (clubs.get(ps.clubId) ?? 0) + 1);
    if (plays) {
      w.news.push({ date: w.date, topic: "international", clubs: [...clubs.keys()], text: `${NATION_NAME_FR[nation] ?? nation} (${win.name}) : ${squad.length} joueurs convoqués.`, importance: nation === "FRA" ? 3 : 1 });
    }
    for (const [club, n] of clubs) {
      const league = w.clubs[club]!.league;
      if (league === "TOP14" || league === "PROD2" || league === "NATIONALE")
        w.news.push({ date: w.date, topic: "international", clubs: [club], text: `${w.clubs[club]!.name} : ${n} joueur${n > 1 ? "s" : ""} retenu${n > 1 ? "s" : ""} par ${NATION_NAME_FR[nation] ?? nation} (${win.name}).`, importance: 1 });
    }
  }
}

// ------------------------------------------------------------------ matches

/**
 * Players a club can pick from on a date: fit, not with their country, and — outside knock-out
 * matches — not rested by the rotation rules (as long as 26 players remain).
 */
export function clubPool(w: World, id: string, d: IsoDate, knockout = false): { pool: PlayerState[]; missing: number; rested: PlayerState[] } {
  const squad = (w.squads[id] ?? []).map((p) => w.players[p]!);
  const missing = squad.filter((ps) => isOnDuty(ps, d)).length;
  const resting = (ps: PlayerState) =>
    !knockout && (ps.startStreak >= ROTATION.maxStreak || ps.freshness < ROTATION.minFreshness || (!!ps.restUntil && ps.restUntil > d));
  let pool = squad.filter((ps) => isFit(ps, d) && !isOnDuty(ps, d));
  // Rest the most tired first, as long as 26 players remain to pick a 23 from.
  const toRest = pool.filter(resting).sort((a, b) => a.freshness - b.freshness || b.startStreak - a.startStreak);
  const rested = new Set<string>();
  for (const ps of toRest) {
    if (pool.length - rested.size <= 26) break;
    rested.add(ps.player.id);
  }
  const restedList = pool.filter((ps) => rested.has(ps.player.id));
  pool = pool.filter((ps) => !rested.has(ps.player.id));
  // Emergency: too few players → internationals released, then injured players patched up.
  if (pool.length < 26) pool = [...pool, ...squad.filter((ps) => isFit(ps, d) && isOnDuty(ps, d))];
  if (pool.length < 23) pool = squad;
  return { pool, missing, rested: restedList };
}

/** Freshness map used by the selection (tired players are penalised). */
export const freshnessOf = (pool: readonly PlayerState[]): Map<string, number> => new Map(pool.map((ps) => [ps.player.id, ps.freshness]));

function teamFor(w: World, f: Fixture, side: 0 | 1, staffChanges: string[]): { team: MatchTeam; missing: number } {
  const id = side === 0 ? f.home : f.away;
  const d = f.date;
  const comp = w.competitions[f.competitionId]!;
  if (comp.kind === "international") {
    let pool = Object.values(w.players).filter((ps) => ps.duty?.nation === id && isOnDuty(ps, d) && isFit(ps, d));
    if (pool.length < 23) pool = (w.nationPools[id] ?? []).map((p) => w.players[p]!).filter((ps) => isFit(ps, d));
    const name = NATION_NAME_FR[id] ?? id;
    return { team: selectMatchTeam(pool.map((p) => p.player), { id, name, shortName: id, freshness: freshnessOf(pool) }), missing: 0 };
  }
  if (w.manager?.clubId === id) return managedTeam(w, f, staffChanges);
  const { pool, missing } = clubPool(w, id, d, f.knockout);
  const club = w.clubs[id]!;
  return { team: selectMatchTeam(pool.map((p) => p.player), { id, name: club.name, shortName: club.shortName, freshness: freshnessOf(pool) }), missing };
}

/** Weather of a fixture: drawn from the fixture seed, so it can be forecast before the match. */
export function fixtureWeather(w: World, f: Fixture): Weather {
  const rng = new Rng(`${w.seed}:${f.id}:weather`);
  const month = Number(f.date.slice(5, 7));
  const winter = month >= 11 || month <= 2;
  return rng.weighted([["dry", winter ? 50 : 77], ["wet", winter ? 35 : 15], ["windy", winter ? 15 : 8]] as const);
}

/** A fixture ready to be simulated: both 23s and the match setup (used by the live match too). */
export interface PreparedFixture {
  setup: MatchSetup;
  missing: [number, number];
  staffChanges: string[];
  /** Pre-match team talk of the manager and the dressing-room reaction. */
  teamTalk?: { talk: TeamTalk; reaction: string };
}

export function prepareFixture(w: World, f: Fixture): PreparedFixture {
  const comp = w.competitions[f.competitionId]!;
  const staffChanges: string[] = [];
  const home = teamFor(w, f, 0, staffChanges);
  const away = teamFor(w, f, 1, staffChanges);
  if (comp.kind !== "international") {
    decorate(w, home.team, f.date);
    decorate(w, away.team, f.date);
  }
  let teamTalk: PreparedFixture["teamTalk"];
  const talk = w.manager?.teamTalks?.[f.id];
  if (talk && talk !== "none" && w.manager) {
    const mine = f.home === w.manager.clubId ? home.team : away.team;
    const theirs = mine === home.team ? away.team : home.team;
    const avg = (t: MatchTeam) => t.players.reduce((s, p) => s + playerLevel(p), 0) / t.players.length;
    const xv = mine.players.slice(0, 15);
    const effect = teamTalkEffect(talk, { favourite: Math.max(-1, Math.min(1, (avg(mine) - avg(theirs)) / 1.2)), temperament: xv.reduce((s, p) => s + p.hidden.temperament, 0) / xv.length });
    mine.morale = Math.max(0, Math.min(1, (mine.morale ?? 0.5) + effect.delta));
    teamTalk = { talk, reaction: effect.reaction };
  }
  const press = w.manager?.press?.[f.id];
  if (press && w.manager) {
    const mine = f.home === w.manager.clubId ? home.team : away.team;
    mine.morale = Math.max(0, Math.min(1, (mine.morale ?? 0.5) + press));
  }
  const setup: MatchSetup = {
    home: home.team,
    away: away.team,
    referee: fixtureReferee(w, f),
    weather: fixtureWeather(w, f),
    seed: `${w.seed}:${f.id}`,
    knockout: f.knockout,
    neutral: f.neutral,
    bonus: comp.bonus,
  };
  const out: PreparedFixture = { setup, missing: [home.missing, away.missing], staffChanges };
  if (teamTalk) out.teamTalk = teamTalk;
  return out;
}

/** Morale, automatisms, captain's trust and fragile players of a club's 23 (M6a). */
function decorate(w: World, team: MatchTeam, d: IsoDate): void {
  const club = w.clubs[team.id];
  if (!club) return;
  team.morale = teamMorale(w, team.id, team.players.map((p) => p.id));
  if (club.sharpness) team.sharpness = { ...club.sharpness };
  const fragile = team.players.filter((p) => w.players[p.id] && isFragile(w.players[p.id]!, d)).map((p) => p.id);
  if (fragile.length) team.fragile = fragile;
  if (team.id === w.manager?.clubId) team.captainTrust = captainTrust(w, team.captainId);
}

/** A match already played outside the daily loop (live match of the manager), to be recorded. */
export interface PlayedFixture {
  prepared: PreparedFixture;
  result: MatchResult;
}

export function playFixture(w: World, f: Fixture, played?: PlayedFixture): void {
  const prepared = played?.prepared ?? prepareFixture(w, f);
  const res = played?.result ?? simulateMatch(prepared.setup);
  recordFixtureResult(w, f, prepared, res);
}

/** Records a played fixture: result, report, player statistics, fatigue, cards, injuries, news. */
export function recordFixtureResult(w: World, f: Fixture, prepared: PreparedFixture, res: MatchResult): void {
  const comp = w.competitions[f.competitionId]!;
  const { setup, staffChanges } = prepared;
  const home = { team: setup.home, missing: prepared.missing[0] };
  const away = { team: setup.away, missing: prepared.missing[1] };
  const weather = setup.weather;
  const all = [...res.playerStats[0], ...res.playerStats[1]];
  const best = all.reduce((a, b) => (b.rating > a.rating ? b : a), all[0]!);
  f.result = {
    score: res.score,
    tries: res.tries,
    winner: res.winner,
    competitionPoints: res.competitionPoints,
    bonus: res.bonus,
    missingInternationals: [home.missing, away.missing],
    playerOfTheMatch: best?.playerId,
  };
  if (res.decidedBy) f.result.decidedBy = res.decidedBy;
  if (w.manager && (f.home === w.manager.clubId || f.away === w.manager.clubId)) recordReport(w, f, [home.team, away.team], res, weather, staffChanges, prepared.teamTalk);

  const d = f.date;
  for (const ps of all) {
    if (ps.minutes <= 0) continue;
    const st = w.players[ps.playerId];
    if (!st) continue;
    const s = (st.stats[comp.id] ??= emptyStats());
    s.appearances++;
    if (ps.started) s.starts++;
    s.minutes += ps.minutes;
    s.tries += ps.tries;
    s.points += ps.points;
    s.yellowCards += ps.yellowCards;
    s.redCards += ps.redCards;
    logMinutes(st, d, ps.minutes);
    if (comp.kind === "international") s.caps++;
    else st.startStreak = ps.started ? st.startStreak + 1 : 0;
    // Contacts tire forwards more; stamina softens it.
    const load = (ps.minutes / 80) * (isForward(ps.position) ? FATIGUE.forward : FATIGUE.back) * (1.15 - st.player.attributes.stamina / 40);
    st.freshness = Math.max(0, st.freshness - load);
    st.yellowCount += ps.yellowCards;
    if (st.yellowCount >= 3) {
      st.yellowCount = 0;
      st.suspension = { until: addDays(d, 8), reason: "3 cartons jaunes" };
    }
  }
  if (comp.kind !== "international") {
    // Squad players who did not start this club match have had their rest.
    const starters = new Set(all.filter((p) => p.started).map((p) => p.playerId));
    for (const club of [f.home, f.away]) for (const pid of w.squads[club] ?? []) if (!starters.has(pid)) w.players[pid]!.startStreak = 0;
  }
  for (const e of res.events) {
    if (e.type !== "redCard" || !e.playerId) continue;
    const st = w.players[e.playerId];
    if (!st) continue;
    const twenty = !!(e.detail as { twentyMinutes?: boolean } | undefined)?.twentyMinutes;
    st.suspension = { until: addDays(d, twenty ? 15 : 29), reason: twenty ? "carton rouge (20 min)" : "carton rouge" };
    if (st.clubId) w.news.push({ date: d, topic: "discipline", clubs: [st.clubId], text: `${fullName(st.player)} (${w.clubs[st.clubId]!.name}) suspendu ${twenty ? "2" : "4"} semaines après son carton rouge.`, importance: 1 });
  }
  for (const inj of res.injuries) {
    const st = w.players[inj.playerId];
    if (!st) continue;
    const days = recordInjury(w, st, d, inj.type, inj.days, inj.concussion);
    if (st.clubId && days >= 28) {
      w.news.push({ date: d, topic: "medical", clubs: [st.clubId], text: `${fullName(st.player)} (${w.clubs[st.clubId]!.name}) : ${inj.type.toLowerCase()}, environ ${Math.round(days / 7)} semaines d'absence.`, importance: 2 });
    }
  }
  const m = w.manager;
  if (m && (f.home === m.clubId || f.away === m.clubId)) {
    const side = f.home === m.clubId ? 0 : 1;
    fixtureFinances(w, f, res.winner === null ? null : res.winner === side);
    boardAfterMatch(w, f);
    if (m.press) delete m.press[f.id];
    if (comp.kind === "league") {
      const sheet = (side === 0 ? setup.home : setup.away).players.map((p) => p.id);
      w.jiffLog = { sheets: (w.jiffLog?.sheets ?? 0) + 1, jiff: (w.jiffLog?.jiff ?? 0) + jiffCount(w, sheet) };
    }
  }
  if (comp.kind !== "international") {
    const margin = Math.abs(res.score[0] - res.score[1]);
    ([0, 1] as const).forEach((side) => {
      const club = side === 0 ? f.home : f.away;
      const played = res.playerStats[side].map((p) => ({ playerId: p.playerId, started: p.started, minutes: p.minutes, rating: p.rating }));
      afterClubMatch(w, f, club, played, res.winner === null ? null : res.winner === side, margin);
    });
  }
  if (f.knockout && /finale|demi|access/.test(f.stage)) {
    const n = (id: string) => w.clubs[id]?.name ?? NATION_NAME_FR[id] ?? id;
    w.news.push({ date: d, topic: comp.id, clubs: [f.home, f.away], text: `${comp.name}, ${stageLabel(f.stage)} : ${n(f.home)} ${res.score[0]}-${res.score[1]} ${n(f.away)}${res.decidedBy ? ` (${res.decidedBy === "extraTime" ? "après prolongation" : "aux tirs au but"})` : ""}.`, importance: f.stage === "finale" ? 3 : 2 });
  }
}

export const stageLabel = (stage: string): string =>
  ({ barrage: "barrage", demi: "demi-finale", finale: "finale", access: "match d'accession", huitieme: "huitième de finale", quart: "quart de finale", "petite-finale": "match pour la 3e place" })[stage] ?? stage;

export const fullName = (p: Pick<Player, "firstName" | "lastName">): string => `${p.firstName} ${p.lastName}`;

function dailyRecovery(w: World): void {
  const d = w.date;
  for (const ps of Object.values(w.players)) {
    const plan = planOf(ps.clubId ? w.clubs[ps.clubId] : undefined);
    if (ps.freshness < 100) ps.freshness = Math.max(0, Math.min(100, ps.freshness + FATIGUE.dailyRecovery + (ps.player.attributes.recovery - 10) * 0.1 + dailyTrainingRecovery(plan)));
    if (ps.injury && ps.injury.until <= d) delete ps.injury;
    if (ps.suspension && ps.suspension.until <= d) delete ps.suspension;
    if (ps.duty && ps.duty.until < d) {
      delete ps.duty;
      ps.restUntil = addDays(d, ROTATION.restAfterDutyDays);
    }
    if (ps.restUntil && ps.restUntil <= d) delete ps.restUntil;
  }
}

