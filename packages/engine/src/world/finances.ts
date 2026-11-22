/**
 * Club finances (GDD §6.5) for the manager's club. The real annual budget (French clubs) is split
 * into realistic income streams (partners, TV and league, ticketing and hospitality, local
 * authorities) and costs (payroll, staff, operations, travel). The season starts balanced:
 * results, attendances, knock-out bonuses and the transfer market make the difference.
 */
import { clamp } from "../rng.js";
import { payroll, salaryCap } from "./contracts.js";
import type { ClubFinances, ExpenseKind, Fixture, RevenueKind, World, WorldClub } from "./types.js";

export const REVENUE_FR: Record<RevenueKind, string> = {
  sponsors: "Partenaires et sponsoring",
  tv: "Droits TV et ligue",
  gate: "Billetterie et hospitalités",
  subsidies: "Collectivités",
  prizes: "Primes de compétition",
  other: "Autres recettes",
};
export const EXPENSE_FR: Record<ExpenseKind, string> = {
  wages: "Salaires des joueurs",
  staff: "Salaires du staff",
  operations: "Fonctionnement",
  travel: "Déplacements",
  transfers: "Recrutement (rachats, agents, indemnités)",
  other: "Autres dépenses",
};

/** Ticketing + hospitality per spectator, base filling rate, home matches per season (league + cups). */
const GATE: Record<string, { price: number; fill: number; homes: number; travel: number }> = {
  TOP14: { price: 46, fill: 0.86, homes: 16, travel: 28_000 },
  PROD2: { price: 21, fill: 0.62, homes: 16, travel: 14_000 },
  NATIONALE: { price: 12, fill: 0.5, homes: 14, travel: 7_000 },
  PREM: { price: 50, fill: 0.85, homes: 14, travel: 30_000 },
  URC: { price: 40, fill: 0.75, homes: 14, travel: 45_000 },
};

const budgetOf = (club: WorldClub): number => club.budgetEur ?? 8_000_000 + club.reputation * 150_000;

/** Yearly staff wages (estimated). */
export const staffWages = (club: WorldClub): number => (club.staff ?? []).reduce((s, m) => s + (m.wage ?? 0), 0);

const zero = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Share of the season's ticketing sold as season tickets (cashed in July). */
const SEASON_TICKETS = 0.45;
const expectedGate = (club: WorldClub, g: (typeof GATE)[string]) => g.homes * (club.capacity ?? 8000) * g.fill * g.price;

/** Monthly operating costs that make the planned season balanced. */
function plannedOperations(w: World, club: WorldClub): number {
  const b = budgetOf(club);
  const g = GATE[club.league] ?? GATE.PROD2!;
  const plannedIncome = b * (0.42 + 0.14 + 0.05) + g.homes * (club.capacity ?? 8000) * g.fill * g.price;
  return Math.max(b * 0.08, plannedIncome - payroll(w, club.id) - staffWages(club)) / 12;
}

/** Opens the manager club's accounts (idempotent). */
export function initFinances(w: World): void {
  const m = w.manager;
  if (!m) return;
  const club = w.clubs[m.clubId]!;
  if (club.finances) return;
  const b = budgetOf(club);
  const pay = payroll(w, club.id);
  const cap = salaryCap(w, club.id);
  club.finances = {
    balance: Math.round(b * 0.06),
    revenue: zero(["sponsors", "tv", "gate", "subsidies", "prizes", "other"] as const),
    expense: zero(["wages", "staff", "operations", "travel", "transfers", "other"] as const),
    ledger: [],
    wageBudget: Math.round(Math.min(cap, Math.max(pay * 1.02, pay + b * 0.01)) / 1000) * 1000,
    transferBudget: Math.round((b * 0.03) / 1000) * 1000,
  };
}

export function book(w: World, f: ClubFinances, label: string, amount: number, kind: RevenueKind | ExpenseKind): void {
  const a = Math.round(amount);
  f.balance += a;
  if (a >= 0 && kind in f.revenue) f.revenue[kind as RevenueKind] += a;
  else if (kind in f.expense) f.expense[kind as ExpenseKind] += -a;
  f.ledger.push({ date: w.date, label, amount: a, kind });
  if (f.ledger.length > 80) f.ledger.splice(0, f.ledger.length - 80);
}

/** First day of each month: salaries, partners, TV, subsidies, operations. */
export function monthlyFinances(w: World): void {
  const m = w.manager;
  if (!m || Number(w.date.slice(8, 10)) !== 1) return;
  const club = w.clubs[m.clubId]!;
  const f = club.finances;
  if (!f) return;
  const b = budgetOf(club);
  // July: season tickets (a share of the season's expected ticketing is cashed before the first match).
  if (w.date.slice(5, 7) === "07") {
    const g = GATE[club.league] ?? GATE.PROD2!;
    book(w, f, "Abonnements de la saison", SEASON_TICKETS * expectedGate(club, g), "gate");
  }
  book(w, f, "Partenaires (mensualité)", (b * 0.42) / 12, "sponsors");
  book(w, f, "Droits TV et ligue (mensualité)", (b * 0.14) / 12, "tv");
  book(w, f, "Subventions des collectivités", (b * 0.05) / 12, "subsidies");
  book(w, f, "Salaires des joueurs", -payroll(w, club.id) / 12, "wages");
  book(w, f, "Salaires du staff", -staffWages(club) / 12, "staff");
  book(w, f, "Fonctionnement du club", -plannedOperations(w, club), "operations");
}

/** Attendance of a home match: base filling, boosted by form, big opponents and knock-out stakes. */
export function attendance(w: World, f: Fixture, homeClub: WorldClub): number {
  const g = GATE[homeClub.league] ?? GATE.PROD2!;
  const cap = homeClub.capacity ?? 8000;
  const opp = w.clubs[f.away];
  const morale = (homeClub.morale ?? 62) / 100;
  let fill = g.fill + (morale - 0.6) * 0.3 + ((opp?.reputation ?? 100) - 110) / 1000;
  if (f.knockout) fill += 0.12;
  if (f.neutral) return 0;
  return Math.round(cap * clamp(fill, 0.3, 1));
}

/** Matchday income and costs of the manager's club, and knock-out bonuses. */
export function fixtureFinances(w: World, f: Fixture, won: boolean | null): void {
  const m = w.manager;
  if (!m || (f.home !== m.clubId && f.away !== m.clubId)) return;
  const club = w.clubs[m.clubId]!;
  const fin = club.finances;
  if (!fin) return;
  const g = GATE[club.league] ?? GATE.PROD2!;
  const opp = w.clubs[f.home === m.clubId ? f.away : f.home];
  if (f.home === m.clubId && !f.neutral) {
    const crowd = attendance(w, f, club);
    const price = g.price * (f.knockout ? 1.3 : f.competitionId.endsWith("-cup") ? 1.1 : 1);
    // League home matches: season-ticket holders have already paid.
    const league = w.competitions[f.competitionId]?.kind === "league" && !f.knockout;
    book(w, fin, `Billetterie : ${crowd.toLocaleString("fr-FR")} spectateurs contre ${opp?.name ?? f.away}`, crowd * price * (league ? 1 - SEASON_TICKETS : 1), "gate");
  } else {
    const european = f.competitionId.endsWith("-cup");
    book(w, fin, `Déplacement${opp ? ` à ${opp.city ?? opp.name}` : ""}`, -(european ? g.travel * 2.2 : g.travel), "travel");
  }
  if (f.knockout && won) {
    const prize = f.stage === "finale" ? 1_200_000 : f.stage === "demi" ? 350_000 : f.stage === "quart" ? 250_000 : 150_000;
    book(w, fin, `Prime de qualification (${f.stage})`, prize * (f.competitionId === "champions-cup" ? 1.5 : 1), "prizes");
  }
}

/** Expected net result of the season (income so far + planned, minus costs so far + planned). */
export function seasonForecast(w: World): number | undefined {
  const m = w.manager;
  const club = m ? w.clubs[m.clubId] : undefined;
  const f = club?.finances;
  if (!club || !f) return undefined;
  const months = Math.max(0, 12 - monthsElapsed(w));
  const b = budgetOf(club);
  const income = Object.values(f.revenue).reduce((a, x) => a + x, 0) + months * ((b * 0.61) / 12);
  const g = GATE[club.league] ?? GATE.PROD2!;
  const gateLeft = Math.max(0, expectedGate(club, g) - f.revenue.gate);
  const expenses = Object.values(f.expense).reduce((a, x) => a + x, 0) + months * (payroll(w, club.id) / 12 + staffWages(club) / 12 + plannedOperations(w, club));
  return Math.round(income + gateLeft - expenses);
}

function monthsElapsed(w: World): number {
  const [y0, m0] = w.calendar.start.split("-").map(Number) as [number, number];
  const [y1, m1] = w.date.split("-").map(Number) as [number, number];
  // Months already booked (the 1st of the current month included).
  return clamp((y1 - y0) * 12 + (m1 - m0) + 1, 0, 12);
}
