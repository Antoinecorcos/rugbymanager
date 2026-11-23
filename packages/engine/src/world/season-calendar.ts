/**
 * Calendar of the next season (M6c), generated from the season that ends:
 * - leagues: the same weekends one year later (52 weeks), new fixtures for the new line-ups
 *   (double round robin; URC: single round robin + return legs within each shield);
 * - European cups: the qualified clubs (top 8 of the Top 14, PREM and URC), pools of six
 *   with two clubs of each league, four rounds on the same weekends as the year before;
 * - internationals: Six Nations every year (venues swapped), Rugby World Cup in 2027, 2031…
 *   (Australia 2027: the real pools), Nations Championship in even years, tests otherwise.
 * Dates beyond 2026-27 are generated, not official.
 */
import { Rng } from "../rng.js";
import { roundRobin, type CupSchedule, type InternationalSchedule, type InternationalWindow, type LeagueSchedule, type ScheduledRound, type SeasonCalendar } from "./calendar.js";
import { addDays, nextWeekday, type IsoDate } from "./dates.js";
import type { World } from "./types.js";

/** 52 weeks: the same weekday one year later. */
export const YEAR_SHIFT = 364;

/** Rugby World Cup 2027 in Australia (1 October – 13 November 2027), draw of 3 December 2025. */
export const WORLD_CUP_2027 = {
  pools: [
    ["AUS", "NZL", "CHI", "HKG"],
    ["RSA", "ITA", "GEO", "ROU"],
    ["ARG", "FIJ", "ESP", "CAN"],
    ["IRL", "SCO", "URU", "POR"],
    ["FRA", "JPN", "USA", "SAM"],
    ["ENG", "WAL", "TGA", "ZIM"],
  ],
  venue: "Stadium Australia, Sydney",
  host: "Australie",
};

export const isWorldCupYear = (year: number): boolean => year >= 2027 && (year - 2027) % 4 === 0;

const shift = (d: IsoDate, n = YEAR_SHIFT): IsoDate => addDays(d, n);

/** Seeded shuffle (Fisher–Yates). */
function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/* ------------------------------------------------------------------ leagues */

/**
 * Dates of `needed` rounds from last year's round dates shifted by a year: free weekends are used
 * when more rounds are needed, extra weeks are added at the end as a last resort.
 */
export function fitRoundDates(previous: readonly IsoDate[], needed: number): { dates: IsoDate[]; extraWeeks: number } {
  const old = previous.map((d) => shift(d)).sort();
  if (needed <= old.length) return { dates: old.slice(0, needed), extraWeeks: 0 };
  const used = new Set(old);
  const free: IsoDate[] = [];
  for (let d = old[0]!; d < old[old.length - 1]!; d = addDays(d, 7)) if (!used.has(d) && !old.some((o) => Math.abs(Date.parse(o) - Date.parse(d)) < 4 * 86400000)) free.push(d);
  const missing = needed - old.length;
  const picked: IsoDate[] = [];
  // Spread the extra rounds over the free weekends.
  for (let k = 0; k < Math.min(missing, free.length); k++) picked.push(free[Math.floor(((k + 0.5) * free.length) / Math.min(missing, free.length))]!);
  let extraWeeks = 0;
  let last = old[old.length - 1]!;
  while (picked.length < missing) {
    last = addDays(last, 7);
    picked.push(last);
    extraWeeks++;
  }
  return { dates: [...old, ...picked].sort(), extraWeeks };
}

/** URC: single round robin of the 16 teams, then the return legs within each shield (4 × 4). */
function urcPairs(teams: readonly string[], shields: string[][]): [string, string][][] {
  const single = roundRobin(teams).slice(0, teams.length - 1);
  const firstLeg = new Map<string, boolean>();
  for (const r of single) for (const [h, a] of r) firstLeg.set(`${h}|${a}`, true);
  const returns: [string, string][][] = [[], [], []];
  for (const shield of shields) {
    roundRobin(shield).slice(0, 3).forEach((r, k) => {
      for (const [h, a] of r) returns[k]!.push(firstLeg.has(`${h}|${a}`) ? [a, h] : [h, a]);
    });
  }
  // Derby rounds spread over the season (rounds 6, 12 and 18).
  return [...single.slice(0, 5), returns[0]!, ...single.slice(5, 10), returns[1]!, ...single.slice(10), returns[2]!];
}

function nextLeague(prev: LeagueSchedule, teams: string[], rng: Rng, shields?: string[][]): LeagueSchedule {
  const order = shuffled([...teams].sort(), rng);
  const pairs = prev.id === "urc" && shields && teams.length === 16 ? urcPairs(order, shields) : roundRobin(order);
  // One date per round: the most common date of last year's round.
  const roundDates = prev.rounds.map((r) => {
    const count = new Map<string, number>();
    for (const m of r.matches) count.set(m.date, (count.get(m.date) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  });
  const { dates, extraWeeks } = fitRoundDates(roundDates, pairs.length);
  const rounds: ScheduledRound[] = pairs.map((p, i) => ({ round: i + 1, matches: p.map(([home, away]) => ({ date: dates[i]!, home, away })) }));
  const knockout = Object.fromEntries(Object.entries(prev.knockout).map(([k, d]) => [k, shift(d, YEAR_SHIFT + extraWeeks * 7)]));
  return { id: prev.id, rounds, knockout };
}

/* ------------------------------------------------------------------ European cups */

/**
 * Four rounds in a pool of six made of three pairs (0-1, 2-3, 4-5) of clubs of the same league:
 * every club meets the four clubs of the other leagues, twice at home and twice away.
 */
export const POOL_OF_SIX: [number, number][][] = [
  [[0, 2], [4, 1], [5, 3]],
  [[3, 0], [1, 5], [2, 4]],
  [[0, 4], [3, 1], [2, 5]],
  [[5, 0], [1, 2], [4, 3]],
];

function nextCup(prev: CupSchedule, pools: string[][]): CupSchedule {
  const rounds: ScheduledRound[] = POOL_OF_SIX.map((pattern, r) => {
    const old = prev.rounds[r]?.matches ?? [];
    const matches = pools.flatMap((pool, p) =>
      pattern.map(([h, a], k) => {
        const date = shift(old[(p * 3 + k) % Math.max(1, old.length)]?.date ?? prev.rounds[0]!.matches[0]!.date);
        return { date, home: pool[h]!, away: pool[a]! };
      }),
    );
    return { round: r + 1, matches };
  });
  const knockout = Object.fromEntries(Object.entries(prev.knockout).map(([k, d]) => [k, shift(d)]));
  const out: CupSchedule = { id: prev.id, pools, rounds, knockout };
  if (prev.finalVenue) out.finalVenue = prev.finalVenue;
  return out;
}

/** Top 8 of each league for the Champions Cup, the other clubs of these leagues (and guests) in the Challenge Cup. */
export function europeanPools(w: World, leagues: Record<string, string[]>, rng: Rng): { champions: string[][]; challenge: string[][] } {
  const ranked = (id: string): string[] => {
    const members = leagues[id] ?? [];
    const prevRanking = w.competitions[id]?.outcome?.ranking ?? [];
    const known = prevRanking.filter((t) => members.includes(t));
    return [...known, ...members.filter((t) => !known.includes(t)).sort()];
  };
  const t14 = ranked("top14");
  const prem = ranked("prem");
  const urc = ranked("urc");
  const guests = Object.values(w.clubs).filter((c) => c.league === "OTHER" && (w.calendar.cups.some((cup) => cup.pools.flat().includes(c.id)))).map((c) => c.id).sort();
  // Champions Cup: pool p gets the clubs ranked p+1 and 8-p of each league.
  const champions = [0, 1, 2, 3].map((p) => {
    const pairs = [t14, prem, urc].map((l) => [l[p]!, l[7 - p]!]);
    return shuffled(pairs, rng).flat();
  });
  const rest = [...t14.slice(8), ...urc.slice(8), ...prem.slice(8), ...guests];
  const pairs: string[][] = [];
  for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i]!, rest[i + 1]!]);
  const nPools = Math.floor(pairs.length / 3);
  const challenge = Array.from({ length: nPools }, (_, p) => shuffled([pairs[p]!, pairs[p + nPools]!, pairs[p + 2 * nPools]!], rng).flat());
  return { champions, challenge };
}

/* ------------------------------------------------------------------ internationals */

const firstSaturday = (year: number, month: number): IsoDate => nextWeekday(`${year}-${String(month).padStart(2, "0")}-01`, 6);

function worldCup(year: number, pools: string[][]): { schedule: InternationalSchedule; window: InternationalWindow } {
  const start = firstSaturday(year, 10);
  const rr = pools.map((pool) => roundRobin(pool));
  // Pools A and D on Fridays, B and E on Saturdays, C and F on Sundays.
  const rounds: ScheduledRound[] = [0, 1, 2].map((r) => ({
    round: r + 1,
    matches: pools.flatMap((_, p) => rr[p]![r]!.map(([home, away]) => ({ date: addDays(start, r * 7 + (p % 3) - 1), home, away, neutral: true }))),
  }));
  const r16 = addDays(start, 21);
  const schedule: InternationalSchedule = {
    id: "world-cup",
    groups: pools,
    rounds,
    knockout: { huitiemes: r16, quarts: addDays(r16, 7), demiFinales: addDays(r16, 14), petiteFinale: addDays(r16, 20), finale: addDays(r16, 21) },
    finalsVenue: year === 2027 ? WORLD_CUP_2027.venue : "Terrain neutre",
  };
  const window: InternationalWindow = { id: "coupe-du-monde", name: `Coupe du monde ${year}`, start: `${year}-08-02`, end: addDays(r16, 22), nations: pools.flat() };
  return { schedule, window };
}

/** Pools of a generated World Cup (after 2027): four bands of six by strength. */
export function generatedWorldCupPools(levels: Record<string, number>, rng: Rng): string[][] {
  const nations = Object.entries(levels).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 24);
  const bands = [0, 1, 2, 3].map((b) => shuffled(nations.slice(b * 6, b * 6 + 6), rng));
  return [0, 1, 2, 3, 4, 5].map((p) => bands.map((band) => band[p]!).filter(Boolean));
}

/** Nations Championship (even years): north v south, three rounds in July (south) and three in November (north). */
function nationsChampionship(year: number, groups: string[][]): { schedule: InternationalSchedule; windows: InternationalWindow[] } {
  const [north, south] = groups as [string[], string[]];
  const july = firstSaturday(year, 7);
  const november = firstSaturday(year, 11);
  const rounds: ScheduledRound[] = [0, 1, 2, 3, 4, 5].map((r) => {
    const date = r < 3 ? addDays(july, r * 7) : addDays(november, (r - 3) * 7);
    return {
      round: r + 1,
      matches: north.map((n, i) => {
        const s = south[(i + r) % south.length]!;
        return r < 3 ? { date, home: s, away: n } : { date, home: n, away: s };
      }),
    };
  });
  const finalsDay = addDays(november, 21);
  const schedule: InternationalSchedule = {
    id: "nations-championship",
    groups,
    rounds,
    finals: [finalsDay, addDays(finalsDay, -1), addDays(finalsDay, -2), finalsDay, addDays(finalsDay, -1), addDays(finalsDay, -2)],
    finalsVenue: "Twickenham Stadium",
  };
  return {
    schedule,
    windows: [
      { id: "tests-juillet", name: "Tests de juillet", start: `${year}-07-01`, end: addDays(july, 15), nations: "*" },
      { id: "tests-novembre", name: "Tests de novembre", start: addDays(november, -7), end: addDays(finalsDay, 1), nations: "*" },
    ],
  };
}

/** Six Nations: same weekends one year later, venues swapped. */
function nextSixNations(prev: InternationalSchedule): InternationalSchedule {
  return {
    ...prev,
    rounds: prev.rounds.map((r) => ({ round: r.round, matches: r.matches.map((m) => ({ ...m, date: shift(m.date), home: m.away, away: m.home })) })),
  };
}

/* ------------------------------------------------------------------ the calendar */

export interface NextSeasonTeams {
  /** Members of each league next season (competition id → club ids). */
  leagues: Record<string, string[]>;
}

/** Calendar of the season after the world's current one. */
export function nextSeasonCalendar(w: World, teams: NextSeasonTeams, levels: Record<string, number>): SeasonCalendar {
  const prev = w.calendar;
  const year = Number(prev.end.slice(0, 4));
  const rng = new Rng(`${w.seed}:calendar:${year}`);
  const shields = (() => {
    const urc = teams.leagues.urc ?? [];
    const by = new Map<string, string[]>();
    for (const id of urc) {
      const c = w.clubs[id]!.country;
      const key = c === "ITA" ? "SCO" : c;
      by.set(key, [...(by.get(key) ?? []), id]);
    }
    const s = [...by.values()];
    return s.length === 4 && s.every((x) => x.length === 4) ? s : undefined;
  })();
  const leagues = prev.leagues.filter((l) => teams.leagues[l.id]?.length).map((l) => nextLeague(l, teams.leagues[l.id]!, rng, shields));

  const cups: CupSchedule[] = [];
  const cc = prev.cups.find((c) => c.id === "champions-cup");
  const ch = prev.cups.find((c) => c.id === "challenge-cup");
  if (cc && ch) {
    const pools = europeanPools(w, teams.leagues, rng);
    cups.push(nextCup(cc, pools.champions), nextCup(ch, pools.challenge));
  }

  const internationals: InternationalSchedule[] = [];
  const windows: InternationalWindow[] = [];
  if (isWorldCupYear(year)) {
    const pools = year === 2027 ? WORLD_CUP_2027.pools : generatedWorldCupPools(levels, rng);
    const wc = worldCup(year, pools);
    internationals.push(wc.schedule);
    windows.push(wc.window);
  } else if (year % 2 === 0) {
    const groups = [
      ["ENG", "FRA", "IRL", "ITA", "SCO", "WAL"],
      ["ARG", "AUS", "FIJ", "JPN", "NZL", "RSA"],
    ];
    const nc = nationsChampionship(year, groups);
    internationals.push(nc.schedule);
    windows.push(...nc.windows);
  } else {
    windows.push({ id: "tests-juillet", name: "Tests de juillet", start: `${year}-07-01`, end: addDays(firstSaturday(year, 7), 15), nations: "*" });
    windows.push({ id: "tests-novembre", name: "Tests de novembre", start: addDays(firstSaturday(year, 11), -7), end: addDays(firstSaturday(year, 11), 22), nations: "*" });
  }
  const sixNations = prev.internationals.find((i) => i.id === "six-nations");
  if (sixNations) internationals.push(nextSixNations(sixNations));
  const sixWindow = prev.windows.find((x) => x.id === "six-nations");
  if (sixWindow) windows.push({ ...sixWindow, start: shift(sixWindow.start), end: shift(sixWindow.end) });

  return { season: `${year}-${year + 1}`, start: `${year}-07-01`, end: `${year + 1}-06-30`, leagues, cups, internationals, windows };
}
