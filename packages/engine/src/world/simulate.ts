/** Day-by-day simulation: call-ups, matches, injuries, suspensions, fatigue, knock-out stages. */
import { DEFAULT_REFEREE, type MatchTeam, type Weather } from "../domain/match-setup.js";
import type { Player } from "../domain/player.js";
import { isForward } from "../domain/positions.js";
import { simulateMatch } from "../match/engine.js";
import { Rng } from "../rng.js";
import { playerLevel, selectMatchTeam } from "../squad/selection.js";
import type { InternationalWindow } from "./calendar.js";
import { NATION_NAME_FR, progressCompetitions } from "./competitions.js";
import { addDays, type IsoDate } from "./dates.js";
import { NATION_LEVEL } from "./nations.js";
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

/** Advances the world by one day. Returns the fixtures played that day. */
export function advanceDay(w: World): Fixture[] {
  const d = w.date;
  for (const win of w.calendar.windows) if (win.start === d) callUps(w, win);
  progressCompetitions(w);
  const today = w.fixtures.filter((f) => f.date === d && !f.result);
  for (const f of today) playFixture(w, f);
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

function teamFor(w: World, f: Fixture, side: 0 | 1): { team: MatchTeam; missing: number } {
  const id = side === 0 ? f.home : f.away;
  const d = f.date;
  const comp = w.competitions[f.competitionId]!;
  const freshness = new Map<string, number>();
  if (comp.kind === "international") {
    let pool = Object.values(w.players).filter((ps) => ps.duty?.nation === id && isOnDuty(ps, d) && isFit(ps, d));
    if (pool.length < 23) pool = (w.nationPools[id] ?? []).map((p) => w.players[p]!).filter((ps) => isFit(ps, d));
    for (const ps of pool) freshness.set(ps.player.id, ps.freshness);
    const name = NATION_NAME_FR[id] ?? id;
    return { team: selectMatchTeam(pool.map((p) => p.player), { id, name, shortName: id, freshness }), missing: 0 };
  }
  const squad = (w.squads[id] ?? []).map((p) => w.players[p]!);
  const missing = squad.filter((ps) => isOnDuty(ps, d)).length;
  const resting = (ps: PlayerState) =>
    !f.knockout && (ps.startStreak >= ROTATION.maxStreak || ps.freshness < ROTATION.minFreshness || (!!ps.restUntil && ps.restUntil > d));
  let pool = squad.filter((ps) => isFit(ps, d) && !isOnDuty(ps, d));
  // Rest the most tired first, as long as 26 players remain to pick a 23 from.
  const toRest = pool.filter(resting).sort((a, b) => a.freshness - b.freshness || b.startStreak - a.startStreak);
  const rested = new Set<string>();
  for (const ps of toRest) {
    if (pool.length - rested.size <= 26) break;
    rested.add(ps.player.id);
  }
  pool = pool.filter((ps) => !rested.has(ps.player.id));
  // Emergency: too few players → internationals released, then injured players patched up.
  if (pool.length < 26) pool = [...pool, ...squad.filter((ps) => isFit(ps, d) && isOnDuty(ps, d))];
  if (pool.length < 23) pool = squad;
  for (const ps of pool) freshness.set(ps.player.id, ps.freshness);
  const club = w.clubs[id]!;
  return { team: selectMatchTeam(pool.map((p) => p.player), { id, name: club.name, shortName: club.shortName, freshness }), missing };
}

function weatherFor(f: Fixture, rng: Rng): Weather {
  const month = Number(f.date.slice(5, 7));
  const winter = month >= 11 || month <= 2;
  return rng.weighted([["dry", winter ? 50 : 77], ["wet", winter ? 35 : 15], ["windy", winter ? 15 : 8]] as const);
}

export function playFixture(w: World, f: Fixture): void {
  const comp = w.competitions[f.competitionId]!;
  const home = teamFor(w, f, 0);
  const away = teamFor(w, f, 1);
  const seed = `${w.seed}:${f.id}`;
  const res = simulateMatch({
    home: home.team,
    away: away.team,
    referee: DEFAULT_REFEREE,
    weather: weatherFor(f, new Rng(`${seed}:weather`)),
    seed,
    knockout: f.knockout,
    neutral: f.neutral,
    bonus: comp.bonus,
  });
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
    st.injury = { type: inj.type, until: addDays(d, inj.days), concussion: inj.concussion };
    if (st.clubId && inj.days >= 28) {
      w.news.push({ date: d, topic: "medical", clubs: [st.clubId], text: `${fullName(st.player)} (${w.clubs[st.clubId]!.name}) : ${inj.type.toLowerCase()}, environ ${Math.round(inj.days / 7)} semaines d'absence.`, importance: 2 });
    }
  }
  if (f.knockout && /finale|demi|access/.test(f.stage)) {
    const n = (id: string) => w.clubs[id]?.name ?? NATION_NAME_FR[id] ?? id;
    w.news.push({ date: d, topic: comp.id, clubs: [f.home, f.away], text: `${comp.name}, ${stageLabel(f.stage)} : ${n(f.home)} ${res.score[0]}-${res.score[1]} ${n(f.away)}${res.decidedBy ? ` (${res.decidedBy === "extraTime" ? "après prolongation" : "aux tirs au but"})` : ""}.`, importance: f.stage === "finale" ? 3 : 2 });
  }
}

export const stageLabel = (stage: string): string =>
  ({ barrage: "barrage", demi: "demi-finale", finale: "finale", access: "match d'accession", huitieme: "huitième de finale", quart: "quart de finale" })[stage] ?? stage;

export const fullName = (p: Pick<Player, "firstName" | "lastName">): string => `${p.firstName} ${p.lastName}`;

function dailyRecovery(w: World): void {
  const d = w.date;
  for (const ps of Object.values(w.players)) {
    if (ps.freshness < 100) ps.freshness = Math.min(100, ps.freshness + FATIGUE.dailyRecovery + (ps.player.attributes.recovery - 10) * 0.1);
    if (ps.injury && ps.injury.until <= d) delete ps.injury;
    if (ps.suspension && ps.suspension.until <= d) delete ps.suspension;
    if (ps.duty && ps.duty.until < d) {
      delete ps.duty;
      ps.restUntil = addDays(d, ROTATION.restAfterDutyDays);
    }
    if (ps.restUntil && ps.restUntil <= d) delete ps.restUntil;
  }
}

