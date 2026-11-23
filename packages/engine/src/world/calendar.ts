/**
 * Season calendar: the fixtures known before the season starts (real 2026-27 calendar, or a
 * generated one for later seasons). Knock-out pairings are computed by the world simulation.
 */
import { addDays, nextWeekday, type IsoDate } from "./dates.js";

export interface ScheduledMatch {
  date: IsoDate;
  home: string;
  away: string;
  /** Neutral venue (finals, Nations Championship finals at Twickenham…). */
  neutral?: boolean;
  venue?: string;
}

export interface ScheduledRound {
  round: number;
  matches: ScheduledMatch[];
}

/** League (round robin + playoffs). */
export interface LeagueSchedule {
  /** Competition id (top14, prod2, nationale, prem, urc). */
  id: string;
  rounds: ScheduledRound[];
  /** Date of each knock-out stage, e.g. { barrages: "2027-06-05", demiFinales: …, finale: …, access: … }. */
  knockout: Record<string, IsoDate>;
}

/** European cup: pools + knock-out. */
export interface CupSchedule {
  id: string;
  pools: string[][];
  rounds: ScheduledRound[];
  knockout: Record<string, IsoDate>;
  /** Venue of the final. */
  finalVenue?: string;
}

/** International competition between nations (codes FRA, ENG…). */
export interface InternationalSchedule {
  id: string;
  /** Nations Championship: the two conferences; Six Nations: a single group. */
  groups: string[][];
  rounds: ScheduledRound[];
  /** Placement finals (Nations Championship): one date per placement match, best first. */
  finals?: IsoDate[];
  finalsVenue?: string;
  /** Knock-out stage dates (World Cup: huitiemes, quarts, demiFinales, petiteFinale, finale). */
  knockout?: Record<string, IsoDate>;
}

/** International window: players of these nations leave their clubs. */
export interface InternationalWindow {
  id: string;
  name: string;
  start: IsoDate;
  end: IsoDate;
  /** Nations calling players up; "*" = every nation (July and November windows). */
  nations: string[] | "*";
}

export interface SeasonCalendar {
  season: string;
  start: IsoDate;
  end: IsoDate;
  leagues: LeagueSchedule[];
  cups: CupSchedule[];
  internationals: InternationalSchedule[];
  windows: InternationalWindow[];
}

/**
 * Double round robin ("circle method"): every team meets every other team home and away.
 * Second half mirrors the first with venues swapped. Deterministic for a given team order.
 */
export function roundRobin(teams: readonly string[]): [string, string][][] {
  const list = [...teams];
  if (list.length % 2) list.push("");
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]!;
      const b = list[n - 1 - i]!;
      if (!a || !b) continue;
      // Alternate home advantage between rounds (and for the fixed team).
      pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return [...rounds, ...rounds.map((p) => p.map(([h, a]) => [a, h] as [string, string]))];
}

/**
 * Generates a league schedule on Saturdays from `firstRound`, skipping the given weekends
 * (international windows, European rounds…).
 */
export function generateLeagueSchedule(id: string, teams: readonly string[], firstRound: IsoDate, skip: readonly IsoDate[] = []): LeagueSchedule {
  const pairs = roundRobin(teams);
  const blocked = new Set(skip);
  const rounds: ScheduledRound[] = [];
  let date = nextWeekday(firstRound, 6);
  for (let r = 0; r < pairs.length; r++) {
    while (blocked.has(date)) date = addDays(date, 7);
    rounds.push({ round: r + 1, matches: pairs[r]!.map(([home, away]) => ({ date, home, away })) });
    date = addDays(date, 7);
  }
  const last = addDays(date, -7);
  return {
    id,
    rounds,
    knockout: { barrages: addDays(last, 14), demiFinales: addDays(last, 21), finale: addDays(last, 28), access: addDays(last, 35) },
  };
}
