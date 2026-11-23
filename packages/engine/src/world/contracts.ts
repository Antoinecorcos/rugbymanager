/**
 * Contracts (M6b). Salaries of rugby players are not public: they are ESTIMATED from the level,
 * age and caps of each player on a league scale, then scaled so that each club's payroll fits its
 * budget and — in the Top 14 — the salary cap. Real contract ends are used when the club
 * publishes them. Also: salary cap and JIFF rules of the French leagues.
 */
import { clamp, Rng } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import { ageOn } from "./dates.js";
import type { Contract, PlayerState, World, WorldClub } from "./types.js";

/** Salary scale per league: salary of a player at the league's reference level, growth per level point. */
const SCALE: Record<string, { ref: number; mid: number; k: number; min: number }> = {
  TOP14: { ref: 230_000, mid: 12.6, k: 0.42, min: 45_000 },
  PREM: { ref: 190_000, mid: 12.2, k: 0.4, min: 40_000 },
  URC: { ref: 150_000, mid: 12, k: 0.4, min: 35_000 },
  PROD2: { ref: 75_000, mid: 11, k: 0.36, min: 28_000 },
  NATIONALE: { ref: 32_000, mid: 9.6, k: 0.3, min: 15_000 },
  OTHER: { ref: 60_000, mid: 11, k: 0.35, min: 20_000 },
};

/** Top 14 salary cap 2026-27 (LNR), and credits for clubs providing internationals (see docs/01). */
export const SALARY_CAP = { TOP14: 11_000_000, PREM: 7_500_000 } as const;
/** Extra cap per French international in the squad (estimate: Bordeaux-Bègles reaches 12.7 M€). */
export const CAP_CREDIT_PER_INTERNATIONAL = 120_000;
export const CAP_CREDIT_MAX = 1_700_000;

/** JIFF rule: average number of JIFF players per match sheet over the season (Top 14: 16; Pro D2: estimate). */
export const JIFF_RULE: Record<string, number> = { TOP14: 16, PROD2: 14 };

export const seasonEndYear = (w: World): number => Number(w.calendar.end.slice(0, 4));

/** Market salary of a player in a league (before club scaling). */
export function marketSalary(ps: PlayerState, league: string, onDate: string): number {
  const s = SCALE[league] ?? SCALE.OTHER!;
  const level = playerLevel(ps.player);
  const age = ageOn(ps.player.birthDate, onDate);
  let v = s.ref * Math.exp((level - s.mid) * s.k);
  if (age <= 21) v *= 0.6;
  else if (age <= 23) v *= 0.8;
  if (ps.caps >= 30) v *= 1.25;
  else if (ps.caps >= 10) v *= 1.12;
  return Math.round(clamp(v, s.min, s.ref * 8) / 1000) * 1000;
}

/** Payroll each club aims at (euros per year). */
function payrollTarget(w: World, club: WorldClub): number {
  // Clubs keep a little room under the cap (≈ 4 %) for jokers and arrivals.
  if (club.league === "TOP14") return Math.min(salaryCap(w, club.id) * 0.96, (club.budgetEur ?? 30_000_000) * 0.42);
  if (club.league === "PREM") return SALARY_CAP.PREM * (0.82 + (club.reputation / 200) * 0.15);
  if (club.budgetEur) return club.budgetEur * 0.45;
  return 2_000_000 + club.reputation * 40_000;
}

/** Salary cap of a club (Top 14: base + credits for French internationals). */
export function salaryCap(w: World, clubId: string): number {
  const club = w.clubs[clubId];
  if (!club) return Infinity;
  if (club.league === "PREM") return SALARY_CAP.PREM;
  if (club.league !== "TOP14") return Infinity;
  const internationals = (w.squads[clubId] ?? []).filter((id) => {
    const ps = w.players[id];
    return ps && ps.player.nationality === "FRA" && ps.caps > 0;
  }).length;
  return SALARY_CAP.TOP14 + Math.min(CAP_CREDIT_MAX, internationals * CAP_CREDIT_PER_INTERNATIONAL);
}

/** Yearly payroll of a club (current contracts). */
export function payroll(w: World, clubId: string): number {
  return (w.squads[clubId] ?? []).reduce((s, id) => s + (w.players[id]?.contract?.salary ?? 0), 0);
}

/** Payroll next season: current contracts still running, minus departures, plus agreed arrivals and renewals. */
export function nextSeasonPayroll(w: World, clubId: string): number {
  const next = seasonEndYear(w);
  const leaving = new Set((w.transfers ?? []).filter((t) => !t.done && t.from === clubId && t.to !== clubId).map((t) => t.playerId));
  const renewals = new Map((w.transfers ?? []).filter((t) => !t.done && t.kind === "renewal" && t.to === clubId).map((t) => [t.playerId, t.contract.salary]));
  let total = 0;
  for (const id of w.squads[clubId] ?? []) {
    const c = w.players[id]?.contract;
    if (!c || leaving.has(id)) continue;
    if (renewals.has(id)) total += renewals.get(id)!;
    else if (c.expires > next && !c.joker) total += c.salary;
  }
  for (const t of w.transfers ?? []) if (!t.done && t.to === clubId && t.kind !== "renewal" && t.kind !== "medicalJoker" && t.kind !== "worldCupJoker") total += t.contract.salary;
  return total;
}

function estimatedExpiry(rng: Rng, age: number, endYear: number): number {
  const weights: [number, number][] =
    age >= 32 ? [[endYear, 6], [endYear + 1, 3]]
    : age >= 29 ? [[endYear, 3], [endYear + 1, 4], [endYear + 2, 2]]
    : age <= 22 ? [[endYear, 1], [endYear + 1, 3], [endYear + 2, 3], [endYear + 3, 2]]
    : [[endYear, 3], [endYear + 1, 3], [endYear + 2, 3], [endYear + 3, 1]];
  return rng.weighted(weights);
}

/** Gives every player of a club squad an estimated contract (idempotent), scaled to the club's payroll target. */
export function initContracts(w: World): void {
  const endYear = seasonEndYear(w);
  for (const [clubId, club] of Object.entries(w.clubs)) {
    const ids = (w.squads[clubId] ?? []).filter((id) => w.players[id] && !w.players[id]!.contract);
    if (!ids.length) continue;
    const rng = new Rng(`${w.seed}:contracts:${clubId}`);
    const raw = ids.map((id) => marketSalary(w.players[id]!, club.league, w.date));
    const existing = payroll(w, clubId);
    const target = Math.max(0, payrollTarget(w, club) - existing);
    const factor = clamp(target / Math.max(1, raw.reduce((a, b) => a + b, 0)), 0.5, 1.6);
    ids.forEach((id, i) => {
      const ps = w.players[id]!;
      const real = ps.profile?.contractExpires;
      const expires = real ? Number(real.slice(0, 4)) : estimatedExpiry(rng, ageOn(ps.player.birthDate, w.date), endYear);
      ps.contract = { clubId, salary: Math.round((raw[i]! * factor) / 1000) * 1000, expires: Math.max(endYear, expires), estimated: true };
    });
  }
}

export const formatEuros = (v: number): string =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2).replace(".", ",")} M€` : `${Math.round(v / 1000)} k€`;

/** JIFF status of a player (French homegrown rule). */
export const isJiff = (ps: PlayerState | undefined): boolean => !!ps?.profile?.jiff;

/** Average JIFF players per league match sheet of the manager this season. */
export const jiffAverage = (w: World): number | undefined => (w.jiffLog && w.jiffLog.sheets ? w.jiffLog.jiff / w.jiffLog.sheets : undefined);

/** Projected sanction if the season ended now (Top 14: points deducted below the required average). */
export function jiffProjection(w: World): { required: number; average?: number; ok: boolean; text: string } | undefined {
  const m = w.manager;
  if (!m) return undefined;
  const required = JIFF_RULE[w.clubs[m.clubId]!.league];
  if (!required) return undefined;
  const average = jiffAverage(w);
  if (average === undefined) return { required, ok: true, text: `Moyenne exigée : ${required} JIFF par feuille de match.` };
  const ok = average >= required;
  const missing = Math.ceil((required - average) * 2) / 2;
  return { required, average, ok, text: ok ? `Moyenne de ${average.toFixed(1).replace(".", ",")} JIFF par feuille : règle respectée.` : `Moyenne de ${average.toFixed(1).replace(".", ",")} JIFF par feuille : il en manque ${missing.toString().replace(".", ",")} en moyenne. Sanction en fin de saison : retrait de points.` };
}
