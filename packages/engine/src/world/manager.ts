/**
 * The human manager's career: club, tactical plans, match-day selection, match reports and the
 * "Continuer" loop (advance day by day until something needs the manager's attention).
 * Pure and deterministic, like the rest of the world simulation.
 */
import type { MatchTeam, TargetedInstructions, Weather } from "../domain/match-setup.js";
import type { PenaltyRule } from "./live.js";
import { initSquadRelations, type TeamTalk } from "./human.js";
import { initBoard, type BoardState } from "./board.js";
import { initFinances } from "./finances.js";
import { SHIRT_POSITION, type Position } from "../domain/positions.js";
import { DEFAULT_TACTICS, type Tactics } from "../domain/tactics.js";
import { BENCH_LAYOUT, type BenchSplit } from "../gen/team-gen.js";
import type { MatchEvent, MatchInjury, MatchResult, PlayerMatchStats, TeamStats } from "../match/types.js";
import { playerLevel, selectionScore, selectMatchTeam } from "../squad/selection.js";
import { addDays, type IsoDate } from "./dates.js";
import { advanceDay, clubPool, freshnessOf, fullName, isFit, isInjured, isOnDuty, isSuspended, type PlayedFixture } from "./simulate.js";
import type { Fixture, PlayerState, World } from "./types.js";

export type CareerStart = "noDiploma" | "bigClub";

export interface ManagerProfile {
  name: string;
  /** ISO 3166-1 alpha-3. */
  nationality: string;
  /** "Sans diplôme" (Nationale / Pro D2) or "Gros club" (Top 14). */
  start: CareerStart;
}

export interface TacticalPlan {
  name: string;
  tactics: Tactics;
}

export interface MatchdaySelection {
  /** true: the staff picks the 23 before each match, with the same rules as the AI clubs (rotation included). */
  auto: boolean;
  bench: BenchSplit;
  /** Player ids of shirts 1..23, used when `auto` is false. */
  lineup: string[];
  captainId?: string;
  goalKickerId?: string;
}

export interface ManagerState {
  profile: ManagerProfile;
  clubId: string;
  since: IsoDate;
  /** Saved tactical plans (plan A, plan B…). */
  plans: TacticalPlan[];
  activePlan: number;
  /** Plan chosen for one fixture during the match preparation (fixture id → plan index). */
  matchPlans: Record<string, number>;
  selection: MatchdaySelection;
  /** Number of news items already seen in the inbox (index in `world.news`). */
  newsRead: number;
  /** Targeted instructions chosen during the preparation of a fixture (fixture id → instructions). */
  matchTargets?: Record<string, TargetedInstructions>;
  /** Penalty decisions taken automatically during live matches (first matching rule wins). */
  penaltyRules?: PenaltyRule[];
  /** Live matches: the staff makes the planned substitutions (default) or the manager does them all. */
  autoSubs?: boolean;
  /** Pre-match team talk chosen in the preparation (fixture id → talk). */
  teamTalks?: Record<string, TeamTalk>;
  /** President and board (M6b). */
  board?: BoardState;
  /** Manager's reputation 1–100 (attracts players). */
  reputation?: number;
  /** Sacked by the board: the career is over. */
  dismissed?: { date: IsoDate; reason: string };
  /** Press conference answered before a fixture (fixture id → morale effect for the match). */
  press?: Record<string, number>;
}

export interface ReportTeam {
  id: string;
  name: string;
  shortName: string;
  /** Player ids of shirts 1..23. */
  lineup: string[];
  captainId: string;
  goalKickerId: string;
  tactics: Tactics;
}

/** Everything the interface needs to show a played match of the manager's club. */
export interface MatchReport {
  fixtureId: string;
  teams: [ReportTeam, ReportTeam];
  weather: Weather;
  score: [number, number];
  tries: [number, number];
  teamStats: [TeamStats, TeamStats];
  playerStats: [PlayerMatchStats[], PlayerMatchStats[]];
  /** Events worth a commentary line (importance ≥ 1). */
  events: MatchEvent[];
  injuries: MatchInjury[];
  decidedBy?: MatchResult["decidedBy"];
  /** Name of the tactical plan used by the manager. */
  planName: string;
  /** Pre-match team talk and its reaction (M6a). */
  teamTalk?: { talk: TeamTalk; reaction: string };
  /** Changes the staff had to make to the manager's 23 (unavailable players replaced). */
  staffChanges: string[];
}

/** Leagues where a career can start (GDD §2.2). */
export const CAREER_LEAGUES: Record<CareerStart, string[]> = { noDiploma: ["NATIONALE", "PROD2"], bigClub: ["TOP14"] };

export const DEFAULT_PLANS: readonly TacticalPlan[] = [
  { name: "Plan A", tactics: { ...DEFAULT_TACTICS } },
  { name: "Plan B — pluie et occupation", tactics: { ...DEFAULT_TACTICS, attackShape: "tight", kickingGame: "territory", offloadRisk: "low", lineoutAttack: "maul" } },
];

/** Starts the manager's career at a club (from the game start date). */
export function startCareer(w: World, profile: ManagerProfile, clubId: string): ManagerState {
  const club = w.clubs[clubId];
  if (!club) throw new Error(`Club inconnu : ${clubId}`);
  if (!Object.values(CAREER_LEAGUES).flat().includes(club.league)) throw new Error(`${club.name} n'est pas un club jouable`);
  const m: ManagerState = {
    profile,
    clubId,
    since: w.date,
    plans: DEFAULT_PLANS.map((p) => ({ name: p.name, tactics: { ...p.tactics } })),
    activePlan: 0,
    matchPlans: {},
    selection: { auto: true, bench: "5-3", lineup: [] },
    newsRead: w.news.length,
  };
  w.manager = m;
  club.headCoach = profile.name;
  w.reports ??= {};
  w.news.push({ date: w.date, topic: "club", clubs: [clubId], text: `${profile.name} est nommé manager de ${club.name}. Bienvenue !`, importance: 3 });
  initSquadRelations(w);
  m.reputation = profile.start === "bigClub" ? 65 : 30;
  initFinances(w);
  initBoard(w);
  return m;
}

// ------------------------------------------------------------------ availability

export type AvailabilityStatus = "available" | "injured" | "suspended" | "duty" | "rest";

export interface Availability {
  status: AvailabilityStatus;
  /** Last unavailable day (exclusive end for injuries/suspensions, inclusive for duty). */
  until?: IsoDate;
  /** French label: "Blessé (ischios)", "Avec la France", "Suspendu (carton rouge)", "Repos (retour de sélection)". */
  label: string;
}

export function availability(ps: PlayerState, d: IsoDate): Availability {
  if (isInjured(ps, d)) return { status: "injured", until: ps.injury!.until, label: `Blessé (${ps.injury!.type.toLowerCase()})` };
  if (isSuspended(ps, d)) return { status: "suspended", until: ps.suspension!.until, label: `Suspendu (${ps.suspension!.reason})` };
  if (isOnDuty(ps, d)) return { status: "duty", until: ps.duty!.until, label: `En sélection (${ps.duty!.nation})` };
  if (ps.restUntil && ps.restUntil > d) return { status: "rest", until: ps.restUntil, label: "Repos conseillé (retour de sélection)" };
  return { status: "available", label: "Disponible" };
}

/** Can play for his club on that date (a rested player can still be picked by his manager). */
export const canPlay = (ps: PlayerState | undefined, d: IsoDate): boolean => !!ps && isFit(ps, d) && !isOnDuty(ps, d);

// ------------------------------------------------------------------ selection

/** Next unplayed fixture of a club (on or after the world date). */
export function nextFixture(w: World, clubId: string): Fixture | undefined {
  return w.fixtures.find((f) => !f.result && f.date >= w.date && (f.home === clubId || f.away === clubId));
}

export const planFor = (m: ManagerState, fixtureId?: string): TacticalPlan => m.plans[(fixtureId !== undefined ? m.matchPlans[fixtureId] : undefined) ?? m.activePlan] ?? m.plans[0]!;

/** The staff's 23 for a club on a date (same rules as the AI clubs: availability, rotation, freshness). */
export function staffSelection(w: World, clubId: string, d: IsoDate, opts: { bench?: BenchSplit; knockout?: boolean; tactics?: Tactics } = {}): MatchTeam {
  const { pool } = clubPool(w, clubId, d, opts.knockout);
  const club = w.clubs[clubId]!;
  const sel: Parameters<typeof selectMatchTeam>[1] = { id: clubId, name: club.name, shortName: club.shortName, freshness: freshnessOf(pool), bench: opts.bench ?? "5-3" };
  if (opts.tactics) sel.tactics = opts.tactics;
  return selectMatchTeam(pool.map((p) => p.player), sel);
}

/** Position of a match-day shirt (1..23) for a bench split. */
export const slotPosition = (shirt: number, bench: BenchSplit): Position => (shirt <= 15 ? SHIRT_POSITION[shirt]! : BENCH_LAYOUT[bench][shirt - 16]!);

const bestCaptain = (starters: PlayerState[]) => starters.reduce((a, b) => (b.player.attributes.leadership + playerLevel(b.player) * 0.5 > a.player.attributes.leadership + playerLevel(a.player) * 0.5 ? b : a));
const bestKicker = (starters: PlayerState[]) => starters.reduce((a, b) => (b.player.attributes.goalKicking > a.player.attributes.goalKicking ? b : a));

/**
 * The manager's team for a fixture. With a manual selection, unavailable players are replaced by
 * the best available player for the slot (reported in `staffChanges`).
 */
export function managedTeam(w: World, f: Fixture, staffChanges: string[]): { team: MatchTeam; missing: number } {
  const m = w.manager!;
  const id = m.clubId;
  const d = f.date;
  const tactics = { ...planFor(m, f.id).tactics };
  const sel = m.selection;
  const missing = (w.squads[id] ?? []).filter((p) => isOnDuty(w.players[p]!, d)).length;
  if (sel.auto || sel.lineup.length !== 23) {
    const team = staffSelection(w, id, d, { bench: sel.bench, knockout: f.knockout, tactics });
    team.controller = "ai";
    const targets = m.matchTargets?.[f.id];
    if (targets) team.targets = { ...targets };
    return { team, missing };
  }
  const squad = new Set(w.squads[id] ?? []);
  const used = new Set<string>();
  const shirts: PlayerState[] = [];
  const replace: number[] = [];
  sel.lineup.forEach((pid, i) => {
    const ps = w.players[pid];
    if (squad.has(pid) && canPlay(ps, d) && !used.has(pid)) {
      shirts[i] = ps!;
      used.add(pid);
    } else replace.push(i);
  });
  if (replace.length) {
    const pool = (w.squads[id] ?? []).map((p) => w.players[p]!).filter((ps) => canPlay(ps, d) && !used.has(ps.player.id));
    for (const i of replace) {
      const pos = slotPosition(i + 1, sel.bench);
      let best: PlayerState | undefined;
      let bestQ = -Infinity;
      for (const ps of pool) {
        if (used.has(ps.player.id)) continue;
        const q = selectionScore(ps.player, pos) - Math.max(0, 85 - ps.freshness) * 0.05;
        if (q > bestQ) {
          bestQ = q;
          best = ps;
        }
      }
      if (!best) best = (w.squads[id] ?? []).map((p) => w.players[p]!).find((ps) => !used.has(ps.player.id))!;
      used.add(best.player.id);
      shirts[i] = best;
      const out = w.players[sel.lineup[i]!];
      staffChanges.push(`N° ${i + 1} : ${out ? fullName(out.player) : "joueur absent"} remplacé par ${fullName(best.player)}${out ? ` (${availability(out, d).label.toLowerCase()})` : ""}.`);
    }
  }
  const starters = shirts.slice(0, 15);
  const inXv = (pid?: string) => !!pid && starters.some((s) => s.player.id === pid);
  const club = w.clubs[id]!;
  const team: MatchTeam = {
    id,
    name: club.name,
    shortName: club.shortName,
    players: shirts.map((s) => s.player),
    tactics,
    captainId: inXv(sel.captainId) ? sel.captainId! : bestCaptain(starters).player.id,
    goalKickerId: inXv(sel.goalKickerId) ? sel.goalKickerId! : bestKicker(starters).player.id,
    captainTrust: 0.7,
    controller: "ai",
    morale: 0.5,
  };
  const targets = m.matchTargets?.[f.id];
  if (targets) team.targets = { ...targets };
  return { team, missing };
}

export interface LineupIssue {
  level: "error" | "warning";
  shirt?: number;
  text: string;
}

/** Checks a manual 23 before a match (shown in the composition and preparation screens). */
export function lineupIssues(w: World, clubId: string, sel: MatchdaySelection, d: IsoDate): LineupIssue[] {
  const issues: LineupIssue[] = [];
  if (sel.auto) return issues;
  const squad = new Set(w.squads[clubId] ?? []);
  const seen = new Set<string>();
  for (let shirt = 1; shirt <= 23; shirt++) {
    const pid = sel.lineup[shirt - 1];
    const ps = pid ? w.players[pid] : undefined;
    if (!pid || !ps || !squad.has(pid)) {
      issues.push({ level: "error", shirt, text: `N° ${shirt} : aucun joueur.` });
      continue;
    }
    if (seen.has(pid)) issues.push({ level: "error", shirt, text: `${fullName(ps.player)} figure deux fois sur la feuille.` });
    seen.add(pid);
    const av = availability(ps, d);
    if (av.status !== "available" && av.status !== "rest") issues.push({ level: "error", shirt, text: `${fullName(ps.player)} : ${av.label.toLowerCase()}. Le staff le remplacera.` });
    const pos = slotPosition(shirt, sel.bench);
    const fam = ps.player.positions[pos] ?? 1;
    if (shirt <= 3 && fam < 10) issues.push({ level: "error", shirt, text: `${fullName(ps.player)} n'est pas un spécialiste du poste de ${shirt === 2 ? "talonneur" : "pilier"} : mêlées simulées.` });
    else if (shirt <= 15 && fam < 12) issues.push({ level: "warning", shirt, text: `${fullName(ps.player)} joue hors de son poste (familiarité ${fam}/20).` });
    if (ps.freshness < 60) issues.push({ level: "warning", shirt, text: `${fullName(ps.player)} est fatigué (fraîcheur ${Math.round(ps.freshness)} %).` });
  }
  const bench = sel.lineup.slice(15).map((p) => w.players[p]).filter((p): p is PlayerState => !!p);
  for (const [pos, label] of [["HK", "talonneur"], ["LH", "pilier gauche"], ["TH", "pilier droit"]] as const) {
    if (!bench.some((ps) => (ps.player.positions[pos] ?? 1) >= 12)) issues.push({ level: "warning", text: `Aucun ${label} spécialiste sur le banc : risque de mêlées simulées en cas de blessure.` });
  }
  const starters = new Set(sel.lineup.slice(0, 15));
  if (sel.captainId && !starters.has(sel.captainId)) issues.push({ level: "warning", text: "Le capitaine n'est pas titulaire : le staff désignera le capitaine." });
  if (sel.goalKickerId && !starters.has(sel.goalKickerId)) issues.push({ level: "warning", text: "Le buteur n'est pas titulaire : le staff désignera le buteur." });
  return issues;
}

/** Turns the staff's 23 into a manual selection the manager can edit. */
export function staffLineup(w: World, clubId: string, d: IsoDate, bench: BenchSplit, knockout = false): MatchdaySelection {
  const t = staffSelection(w, clubId, d, { bench, knockout });
  return { auto: false, bench, lineup: t.players.map((p) => p.id), captainId: t.captainId, goalKickerId: t.goalKickerId };
}

// ------------------------------------------------------------------ reports

export function recordReport(w: World, f: Fixture, teams: [MatchTeam, MatchTeam], res: MatchResult, weather: Weather, staffChanges: string[], teamTalk?: MatchReport["teamTalk"]): void {
  const m = w.manager!;
  const rt = (t: MatchTeam): ReportTeam => ({ id: t.id, name: t.name, shortName: t.shortName, lineup: t.players.map((p) => p.id), captainId: t.captainId, goalKickerId: t.goalKickerId, tactics: { ...t.tactics } });
  const report: MatchReport = {
    fixtureId: f.id,
    teams: [rt(teams[0]), rt(teams[1])],
    weather,
    score: res.score,
    tries: res.tries,
    teamStats: res.teamStats,
    playerStats: res.playerStats,
    events: res.events.filter((e) => e.importance >= 1),
    injuries: res.injuries,
    planName: planFor(m, f.id).name,
    staffChanges,
  };
  if (res.decidedBy) report.decidedBy = res.decidedBy;
  if (teamTalk) report.teamTalk = teamTalk;
  (w.reports ??= {})[f.id] = report;
  if (m.teamTalks) delete m.teamTalks[f.id];
  if (staffChanges.length) w.news.push({ date: f.date, topic: "club", clubs: [m.clubId], text: `Composition modifiée par le staff : ${staffChanges.join(" ")}`, importance: 2 });
  delete m.matchPlans[f.id];
  if (m.matchTargets) delete m.matchTargets[f.id];
}

// ------------------------------------------------------------------ continue

export type StopReason = "matchDay" | "news" | "seasonEnd" | "limit" | "dismissed";

export interface ContinueResult {
  reason: StopReason;
  /** Days simulated. */
  days: number;
  /** Fixture of the manager's club to play today (reason "matchDay"). */
  fixture?: Fixture;
  /** New important news for the manager (reason "news"). */
  news?: number;
}

/** A news item that interrupts "Continuer": important news of the club, or call-ups of its players. */
const interrupts = (clubId: string) => (n: World["news"][number]) => n.clubs.includes(clubId) && (n.importance >= 2 || n.topic === "international");

/**
 * "Continuer": advances day by day and stops on the morning of a match of the manager's club
 * (the match is not played: see `playMatchDay`), after a day with important news, or at the end of the season.
 */
export function continueCareer(w: World, maxDays = 60): ContinueResult {
  const m = w.manager;
  if (!m) throw new Error("Aucune carrière en cours");
  const end = addDays(w.calendar.end, 1);
  let days = 0;
  for (;;) {
    if (m.dismissed) return { reason: "dismissed", days };
    if (w.date >= end) return { reason: "seasonEnd", days };
    const today = w.fixtures.find((f) => f.date === w.date && !f.result && (f.home === m.clubId || f.away === m.clubId));
    if (today) return { reason: "matchDay", days, fixture: today };
    if (days >= maxDays) return { reason: "limit", days };
    const before = w.news.length;
    advanceDay(w);
    days++;
    const fresh = w.news.slice(before).filter(interrupts(m.clubId)).length;
    if (fresh) return { reason: "news", days, news: fresh };
  }
}

/** Plays the current day (the manager's match included) and returns the manager's fixture played, if any. */
export function playMatchDay(w: World, live?: Record<string, PlayedFixture>): Fixture | undefined {
  const m = w.manager;
  const played = advanceDay(w, live);
  return m ? played.find((f) => f.home === m.clubId || f.away === m.clubId) : undefined;
}
