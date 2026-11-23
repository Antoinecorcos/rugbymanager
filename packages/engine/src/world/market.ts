/**
 * The rugby transfer market (GDD §6.4), French style:
 * - most moves are PRE-CONTRACTS signed during the season with players whose contract ends in
 *   June; they join on 1 July (applied by the season rollover, M6c);
 * - a player still under contract can be bought out (indemnité de rupture), also for next season;
 * - the only immediate signing is the MEDICAL JOKER, allowed when a player is out for 10+ weeks;
 * - the manager renews his own players.
 * Agents demand a salary on the destination league's scale; players weigh the league, the club's
 * standing, the playing time they can expect and — for some nations — their international
 * eligibility. AI clubs renew and sign players every week from October to May.
 * Also: scouting (knowledge of players) and fictional free agents.
 */
import type { Position } from "../domain/positions.js";
import { generatePlayer } from "../gen/player-gen.js";
import { clamp, Rng } from "../rng.js";
import { playerLevel } from "../squad/selection.js";
import { isJiff, marketSalary, nextSeasonPayroll, payroll, salaryCap, seasonEndYear } from "./contracts.js";
import { ageOn, addDays, daysBetween, type IsoDate } from "./dates.js";
import { book } from "./finances.js";
import { humanOf, STATUS_FR } from "./human.js";
import { newPlayerState } from "./nations.js";
import type { Contract, NegotiationState, PlayerState, SquadStatus, TransferDeal, TransferKind, World } from "./types.js";

/** How attractive each league is for a player (Top 14 first: the richest league). */
export const LEAGUE_APPEAL: Record<string, number> = { TOP14: 1, PREM: 0.82, URC: 0.75, PROD2: 0.45, NATIONALE: 0.22, OTHER: 0.3 };

/** Nations that (mostly) do not select players who leave their domestic league. */
const HOME_LEAGUE_ONLY: Record<string, string> = { ENG: "PREM", IRL: "URC", NZL: "OTHER", AUS: "OTHER", WAL: "URC", SCO: "URC", FRA: "TOP14" };

const STATUS_RANK: Record<SquadStatus, number> = { star: 4, starter: 3, rotation: 2, backup: 1, prospect: 0 };

const hash01 = (s: string): number => new Rng(`hash:${s}`).next();

const leagueOf = (w: World, ps: PlayerState): string => (ps.clubId ? (w.clubs[ps.clubId]?.league ?? "OTHER") : "OTHER");
const nameOf = (ps: PlayerState) => `${ps.player.firstName} ${ps.player.lastName}`;
const best = (ps: PlayerState): Position => (Object.entries(ps.player.positions).sort((a, b) => b[1] - a[1])[0]?.[0] as Position) ?? "LO";

/* ------------------------------------------------------------------ scouting */

/** What the manager knows about a player (0..1). */
export function knowledgeOf(w: World, playerId: string): number {
  const known = w.scouting?.[playerId]?.knowledge;
  if (known !== undefined) return known;
  const ps = w.players[playerId];
  const m = w.manager;
  if (!ps || !m) return 0;
  if (ps.clubId === m.clubId) return 1;
  if (ps.clubId && w.clubs[ps.clubId]?.league === w.clubs[m.clubId]?.league) return 0.6;
  if (ps.caps >= 5) return 0.5;
  return 0.25;
}

/** Level as the manager perceives it: the less he knows, the wider (and more biased) the estimate. */
export function perceivedLevel(w: World, playerId: string): { level: number; low: number; high: number; potential?: number; knowledge: number } {
  const ps = w.players[playerId]!;
  const k = knowledgeOf(w, playerId);
  const real = playerLevel(ps.player);
  const fuzz = (1 - k) * 2.4;
  const bias = (hash01(`${w.seed}:${playerId}:scout`) - 0.5) * fuzz;
  const level = Math.round((real + bias) * 10) / 10;
  const out: ReturnType<typeof perceivedLevel> = { level, low: Math.round((level - fuzz / 2) * 10) / 10, high: Math.round((level + fuzz / 2) * 10) / 10, knowledge: k };
  if (k >= 0.99) out.potential = (ps.player.potentialAbility ?? ps.player.currentAbility ?? 0) / 10;
  return out;
}

/** Sends a scout: full report in one to two weeks. At most six supervisions at a time. */
export function scoutPlayer(w: World, playerId: string): string | null {
  const ps = w.players[playerId];
  if (!ps || ps.virtual) return "Joueur introuvable.";
  if (knowledgeOf(w, playerId) >= 0.99) return "Ce joueur est déjà bien connu du staff.";
  w.scouting ??= {};
  if (w.scouting[playerId]?.reportOn) return "Une supervision est déjà en cours.";
  const active = Object.values(w.scouting).filter((s) => s.reportOn).length;
  if (active >= 6) return "Vos recruteurs suivent déjà six joueurs : attendez un rapport.";
  const far = leagueOf(w, ps) === "PREM" || leagueOf(w, ps) === "URC";
  w.scouting[playerId] = { knowledge: knowledgeOf(w, playerId), reportOn: addDays(w.date, far ? 14 : 8) };
  return null;
}

export function dailyScouting(w: World): void {
  if (!w.scouting || !w.manager) return;
  for (const [id, s] of Object.entries(w.scouting)) {
    if (!s.reportOn || s.reportOn > w.date) continue;
    delete s.reportOn;
    s.knowledge = 1;
    const ps = w.players[id];
    if (!ps) continue;
    const p = perceivedLevel(w, id);
    const verdict = (p.potential ?? p.level) - p.level >= 1.5 ? "un vrai potentiel de progression" : p.level >= 14 ? "un joueur de très haut niveau" : "un profil solide";
    w.news.push({ date: w.date, topic: "scouting", clubs: [w.manager.clubId], text: `Rapport de supervision : ${nameOf(ps)} (${ps.clubId ? (w.clubs[ps.clubId]?.name ?? "") : "libre"}), niveau ${p.level.toFixed(1).replace(".", ",")}/20 — ${verdict}.`, importance: 1 });
  }
}

/* ------------------------------------------------------------------ demands and interest */

/** Status a player can expect in a club: his rank at his position in that squad. */
export function expectedStatus(w: World, ps: PlayerState, clubId: string): SquadStatus {
  const pos = best(ps);
  const level = playerLevel(ps.player);
  const better = (w.squads[clubId] ?? []).filter((id) => id !== ps.player.id && best(w.players[id]!) === pos && playerLevel(w.players[id]!.player) > level).length;
  const slots = pos === "LO" || pos === "WG" ? 2 : 1;
  if (ageOn(ps.player.birthDate, w.date) <= 20 && better >= slots) return "prospect";
  return better < slots ? (level >= 15 ? "star" : "starter") : better < slots * 2 ? "rotation" : "backup";
}

/** Contract length the player wants (years). */
export const preferredYears = (ps: PlayerState, d: IsoDate): number => {
  const age = ageOn(ps.player.birthDate, d);
  return age >= 32 ? 1 : age >= 29 ? 2 : 3;
};

/** Salary the agent asks to join a club (destination league scale, ambition, losing his national team). */
export function askingSalary(w: World, ps: PlayerState, clubId: string): number {
  const dest = w.clubs[clubId]?.league ?? "OTHER";
  const from = leagueOf(w, ps);
  let v = marketSalary(ps, dest, w.date) * (1 + (ps.player.hidden.ambition - 10) * 0.015 + hash01(`${ps.player.id}:greed`) * 0.15);
  const drop = (LEAGUE_APPEAL[from] ?? 0.3) - (LEAGUE_APPEAL[dest] ?? 0.3);
  if (drop > 0) v *= 1 + drop * 0.6;
  if (losesSelection(w, ps, clubId)) v *= 1.35;
  if (ps.clubId === clubId && ps.contract) v = Math.max(v, ps.contract.salary * 1.03);
  return Math.round(v / 1000) * 1000;
}

/** Joining this club would cost him his place in his national team (England, Ireland…). */
export function losesSelection(w: World, ps: PlayerState, clubId: string): boolean {
  const home = HOME_LEAGUE_ONLY[ps.player.nationality];
  if (!home || ps.caps < 3) return false;
  return leagueOf(w, ps) === home && w.clubs[clubId]?.league !== home;
}

export interface Interest {
  /** 0..1 */
  score: number;
  reasons: string[];
}

/** How keen a player is to sign for a club (before money). */
export function interestIn(w: World, ps: PlayerState, clubId: string): Interest {
  const club = w.clubs[clubId]!;
  const reasons: string[] = [];
  const own = ps.clubId === clubId;
  let s = 0.55;
  if (!own) {
    const appeal = (LEAGUE_APPEAL[club.league] ?? 0.3) / Math.max(0.2, LEAGUE_APPEAL[leagueOf(w, ps)] ?? 0.3);
    s += clamp((appeal - 1) * 0.6, -0.5, 0.15);
    if (appeal < 0.8) reasons.push("le championnat est moins attractif que le sien");
    const level = playerLevel(ps.player);
    const repGap = club.reputation / 200 - (level - 8) / 10;
    s += clamp(repGap * 0.5, -0.25, 0.15);
    if (repGap < -0.15) reasons.push("le club manque de prestige à ses yeux");
    s -= (ps.player.hidden.loyalty - 10) * 0.012;
    // Players prefer to play in their own country (family, language, national team).
    const here = ps.clubId ? w.clubs[ps.clubId]?.country : undefined;
    const nat = ps.player.nationality;
    if (here === nat && club.country !== nat) {
      s -= 0.15;
      reasons.push("il préfère rester dans son pays");
    } else if (here !== nat && club.country === nat) s += 0.1;
    if (ps.player.hidden.loyalty >= 16) reasons.push("il est très attaché à son club");
    if (losesSelection(w, ps, clubId) && ageOn(ps.player.birthDate, w.date) < 31) {
      s -= 0.3;
      reasons.push("il perdrait sa place en sélection");
    }
    s += ((w.manager?.reputation ?? 50) - 50) / 500;
  } else {
    const h = ps.human;
    if (h) {
      s += (h.trust - 55) / 150 + (h.morale - 60) / 200;
      if (h.trust < 40) reasons.push("sa confiance en vous est entamée");
      if (h.morale < 40) reasons.push("il n'est pas heureux au club");
    }
  }
  return { score: clamp(s, 0, 1), reasons };
}

/* ------------------------------------------------------------------ offers */

export interface Offer {
  salary: number;
  years: number;
  status: SquadStatus;
}

export interface DealTerms {
  kind: TransferKind;
  fee: number;
  effective: IsoDate;
}

const nextSeasonStart = (w: World): IsoDate => `${seasonEndYear(w)}-07-01`;

/** Players agreed with a club for next season (not done yet). */
export const pendingDeal = (w: World, playerId: string): TransferDeal | undefined => (w.transfers ?? []).find((t) => !t.done && t.playerId === playerId && t.kind !== "renewal");

/** A long-term injury allows a medical joker (Top 14 rule: out for ten weeks or more). */
export function medicalJokerAllowed(w: World): boolean {
  const m = w.manager;
  if (!m) return false;
  const jokers = (w.transfers ?? []).filter((t) => t.kind === "medicalJoker" && t.to === m.clubId).length;
  const longInjuries = (w.squads[m.clubId] ?? []).filter((id) => {
    const inj = w.players[id]?.injury;
    return inj && daysBetween(w.date, inj.until) >= 70;
  }).length;
  return longInjuries > jokers;
}

/**
 * World Cup joker (M6c): during the World Cup, a club may sign a temporary player for each of its
 * players away with his country, until the end of the tournament.
 */
export function worldCupJokerAllowed(w: World): { until: IsoDate } | undefined {
  const m = w.manager;
  const win = w.calendar.windows.find((x) => x.id === "coupe-du-monde" && x.start <= w.date && x.end >= w.date);
  if (!m || !win) return undefined;
  const away = (w.squads[m.clubId] ?? []).filter((id) => {
    const d = w.players[id]?.duty;
    return d && d.until >= w.date && w.competitions["world-cup"]?.teams.includes(d.nation);
  }).length;
  const jokers = (w.squads[m.clubId] ?? []).filter((id) => w.players[id]?.contract?.until).length;
  return away > jokers ? { until: win.end } : undefined;
}

/** World Cup jokers whose contract has ended leave the club (daily). */
export function releaseWorldCupJokers(w: World): void {
  for (const [clubId, ids] of Object.entries(w.squads)) {
    for (const id of [...ids]) {
      const ps = w.players[id];
      if (!ps?.contract?.until || ps.contract.until >= w.date) continue;
      ids.splice(ids.indexOf(id), 1);
      delete ps.clubId;
      delete ps.contract;
      delete ps.human;
      (w.freeAgents ??= []).push(id);
      if (clubId === w.manager?.clubId) w.news.push({ date: w.date, topic: "transfer", clubs: [clubId], text: `${nameOf(ps)}, joker Coupe du monde, quitte le club : son contrat est terminé.`, importance: 1 });
    }
  }
}

/** What kind of deal an offer to this player would be, and its fee. */
export function dealTerms(w: World, playerId: string): DealTerms | { error: string } {
  const m = w.manager;
  const ps = w.players[playerId];
  if (!m || !ps || ps.virtual) return { error: "Joueur introuvable." };
  const end = seasonEndYear(w);
  const pending = pendingDeal(w, playerId);
  if (pending) return { error: pending.to === m.clubId ? "Il a déjà signé chez vous pour la saison prochaine." : `Il s'est déjà engagé avec ${w.clubs[pending.to]?.name ?? pending.to} pour la saison prochaine.` };
  if (ps.academy) return { error: ps.clubId === m.clubId ? "Intégrez-le depuis le centre de formation." : "Les espoirs des autres centres de formation ne sont pas recrutables." };
  if (ps.clubId === m.clubId) return { kind: "renewal", fee: 0, effective: nextSeasonStart(w) };
  if (!ps.clubId) {
    if (medicalJokerAllowed(w)) return { kind: "medicalJoker", fee: 0, effective: w.date };
    if (worldCupJokerAllowed(w)) return { kind: "worldCupJoker", fee: 0, effective: w.date };
    return { kind: "preContract", fee: 0, effective: nextSeasonStart(w) };
  }
  const c = ps.contract;
  if (!c || c.expires <= end) return { kind: "preContract", fee: 0, effective: nextSeasonStart(w) };
  // Buyout: the club wants about half of the remaining salary, much more for a key player.
  const status = expectedStatus(w, ps, ps.clubId);
  const years = c.expires - end;
  const factor = status === "star" ? 2.5 : status === "starter" ? 1.6 : 1;
  if (status === "star" && (w.clubs[ps.clubId]?.league === "TOP14" || w.clubs[ps.clubId]?.league === "PREM")) return { error: `${w.clubs[ps.clubId]!.name} refuse de discuter : c'est un joueur essentiel.` };
  return { kind: "buyout", fee: Math.round((c.salary * years * 0.5 * factor) / 1000) * 1000, effective: nextSeasonStart(w) };
}

/** Payroll a new contract would bring the manager's club to (this season for a joker, next season otherwise). */
export function payrollWith(w: World, playerId: string, salary: number, kind: TransferKind): number {
  const m = w.manager!;
  if (kind === "medicalJoker" || kind === "worldCupJoker") return payroll(w, m.clubId) + salary;
  const ps = w.players[playerId];
  const base = nextSeasonPayroll(w, m.clubId);
  if (kind === "renewal" && ps?.contract && ps.contract.expires > seasonEndYear(w)) return base - ps.contract.salary + salary;
  return base + salary;
}

export interface NegotiationResult {
  outcome: "accepted" | "countered" | "rejected";
  text: string;
  demand?: NegotiationState["demand"];
  deal?: TransferDeal;
}

/** The agent's demand for a club. */
export function agentDemand(w: World, ps: PlayerState, clubId: string): NonNullable<NegotiationState["demand"]> {
  return { salary: askingSalary(w, ps, clubId), years: preferredYears(ps, w.date), status: expectedStatus(w, ps, clubId) };
}

/**
 * The manager makes an offer. The agent accepts, counters (with his demand) or rejects; after three
 * unsuccessful rounds he stops talking for a month. Budget, salary cap and transfer budget are checked.
 */
export function makeOffer(w: World, playerId: string, offer: Offer): NegotiationResult | { error: string } {
  const m = w.manager;
  const ps = w.players[playerId];
  if (!m || !ps) return { error: "Joueur introuvable." };
  const terms = dealTerms(w, playerId);
  if ("error" in terms) return terms;
  const club = w.clubs[m.clubId]!;
  const fin = club.finances;
  w.negotiations ??= {};
  const neg = (w.negotiations[playerId] ??= { rounds: 0 });
  if (neg.blockedUntil && neg.blockedUntil > w.date) return { error: `Son agent ne veut plus discuter avant le ${neg.blockedUntil.split("-").reverse().join("/")}.` };
  if (offer.years < 1 || offer.years > 5 || offer.salary <= 0) return { error: "Offre invalide." };
  const total = payrollWith(w, playerId, offer.salary, terms.kind);
  const cap = salaryCap(w, m.clubId);
  if (total > cap) return { error: `Le salary cap serait dépassé (${Math.round(total / 1000).toLocaleString("fr-FR")} k€ pour ${Math.round(cap / 1000).toLocaleString("fr-FR")} k€ autorisés).` };
  if (fin && total > fin.wageBudget) return { error: `Hors budget salarial : ${Math.round(total / 1000).toLocaleString("fr-FR")} k€ pour ${Math.round(fin.wageBudget / 1000).toLocaleString("fr-FR")} k€ accordés par le président.` };
  const agentFee = Math.round((offer.salary * 0.08) / 1000) * 1000;
  if (fin && terms.fee + agentFee > fin.transferBudget) return { error: `Budget de recrutement insuffisant : ${Math.round((terms.fee + agentFee) / 1000)} k€ nécessaires (indemnité et commission de l'agent).` };

  const demand = agentDemand(w, ps, m.clubId);
  const interest = interestIn(w, ps, m.clubId);
  neg.rounds += 1;
  const fail = (text: string, outcome: NegotiationResult["outcome"]): NegotiationResult => {
    neg.demand = demand;
    if (neg.rounds >= 3) {
      neg.blockedUntil = addDays(w.date, 30);
      neg.rounds = 0;
      return { outcome: "rejected", text: `${text} Son agent met fin aux discussions pour un mois.`, demand };
    }
    return { outcome, text, demand };
  };
  if (interest.score < 0.25) return fail(`${nameOf(ps)} n'est pas intéressé : ${interest.reasons[0] ?? "le projet ne le convainc pas"}.`, "rejected");
  const salaryOk = offer.salary >= demand.salary * (1 - (interest.score - 0.5) * 0.2);
  const statusOk = STATUS_RANK[offer.status] >= STATUS_RANK[demand.status] - (interest.score >= 0.7 ? 1 : 0);
  const yearsOk = terms.kind === "medicalJoker" || terms.kind === "worldCupJoker" || Math.abs(offer.years - demand.years) <= 1;
  if (!salaryOk || !statusOk || !yearsOk) {
    const why = !salaryOk ? `il demande ${Math.round(demand.salary / 1000).toLocaleString("fr-FR")} k€ par an` : !statusOk ? `il veut le statut « ${STATUS_FR[demand.status]} »` : `il souhaite un contrat de ${demand.years} an${demand.years > 1 ? "s" : ""}`;
    return fail(`L'agent de ${nameOf(ps)} refuse : ${why}.`, "countered");
  }

  // Accepted.
  delete w.negotiations[playerId];
  const end = seasonEndYear(w);
  const contract: Contract = {
    clubId: m.clubId,
    salary: Math.round(offer.salary / 1000) * 1000,
    expires: terms.kind === "medicalJoker" || terms.kind === "worldCupJoker" ? end : (terms.kind === "renewal" ? Math.max(end, ps.contract?.expires ?? end) : end) + offer.years,
    estimated: false,
    status: offer.status,
    ...(terms.kind === "medicalJoker" || terms.kind === "worldCupJoker" ? { joker: true } : {}),
  };
  const wc = terms.kind === "worldCupJoker" ? worldCupJokerAllowed(w) : undefined;
  if (wc) contract.until = wc.until;
  if (terms.kind === "renewal") contract.expires = end + offer.years;
  const deal: TransferDeal = {
    id: `${terms.kind}:${playerId}:${w.date}`,
    playerId,
    to: m.clubId,
    kind: terms.kind,
    contract,
    fee: terms.fee,
    agentFee,
    agreedOn: w.date,
    effective: terms.effective,
  };
  if (ps.clubId) deal.from = ps.clubId;
  (w.transfers ??= []).push(deal);
  if (fin) {
    if (terms.fee) book(w, fin, `Rachat du contrat de ${nameOf(ps)}`, -terms.fee, "transfers");
    book(w, fin, `Commission d'agent (${nameOf(ps)})`, -agentFee, "transfers");
    fin.transferBudget -= terms.fee + agentFee;
  }
  let text: string;
  if (terms.kind === "renewal") {
    const h = humanOf(w, ps);
    h.morale = Math.min(100, h.morale + 8);
    h.trust = Math.min(100, h.trust + 6);
    h.status = offer.status;
    ps.contract = { ...contract };
    deal.done = true;
    text = `${nameOf(ps)} prolonge jusqu'en ${contract.expires} (${Math.round(contract.salary / 1000).toLocaleString("fr-FR")} k€ par an).`;
  } else if (terms.kind === "medicalJoker") {
    joinClub(w, ps, m.clubId, contract);
    deal.done = true;
    text = `${nameOf(ps)} arrive comme joker médical jusqu'à la fin de la saison.`;
  } else if (terms.kind === "worldCupJoker") {
    joinClub(w, ps, m.clubId, contract);
    deal.done = true;
    text = `${nameOf(ps)} arrive comme joker Coupe du monde jusqu'au ${contract.until!.split("-").reverse().join("/")}.`;
  } else {
    text = `${nameOf(ps)} s'engage pour la saison prochaine (${offer.years} an${offer.years > 1 ? "s" : ""}, ${Math.round(contract.salary / 1000).toLocaleString("fr-FR")} k€ par an)${terms.fee ? ` ; indemnité de ${Math.round(terms.fee / 1000).toLocaleString("fr-FR")} k€` : ""}. Il arrivera le 1er juillet.`;
  }
  w.news.push({ date: w.date, topic: "transfer", clubs: [m.clubId, ...(deal.from ? [deal.from] : [])], text, importance: 2 });
  return { outcome: "accepted", text, deal };
}

/** Moves a player into a club squad now (medical joker, and next season's arrivals in M6c). */
export function joinClub(w: World, ps: PlayerState, clubId: string, contract: Contract): void {
  if (ps.clubId) {
    const old = w.squads[ps.clubId];
    if (old) old.splice(old.indexOf(ps.player.id), 1);
  }
  w.freeAgents = (w.freeAgents ?? []).filter((id) => id !== ps.player.id);
  ps.clubId = clubId;
  ps.contract = contract;
  (w.squads[clubId] ??= []).push(ps.player.id);
  if (clubId === w.manager?.clubId) humanOf(w, ps).status = contract.status ?? "rotation";
}

/* ------------------------------------------------------------------ AI market */

const NEED: Partial<Record<Position, number>> = { LH: 2, HK: 2, TH: 2, LO: 4, BF: 2, OF: 2, N8: 1, SH: 2, FH: 2, IC: 2, OC: 2, WG: 3, FB: 2 };
const AI_LEAGUES = new Set(["TOP14", "PROD2", "PREM", "URC", "NATIONALE"]);

/** Players a club keeps next season at a position (contracts running beyond June, arrivals). */
function nextSeasonCount(w: World, clubId: string, pos: Position, pending: Set<string>, arrivals: Map<string, string[]>): number {
  const end = seasonEndYear(w);
  let n = (w.squads[clubId] ?? []).filter((id) => {
    const ps = w.players[id]!;
    return best(ps) === pos && (ps.contract?.expires ?? end) > end && !pending.has(id);
  }).length;
  n += (arrivals.get(clubId) ?? []).filter((id) => best(w.players[id]!) === pos).length;
  return n;
}

/** Every Monday from October to May: AI clubs renew some of their players and sign pre-contracts. */
export function weeklyMarket(w: World): void {
  const month = Number(w.date.slice(5, 7));
  if (month >= 6 && month <= 9) return;
  const end = seasonEndYear(w);
  const rng = new Rng(`${w.seed}:${w.date}:market`);
  const m = w.manager;
  const pending = new Set<string>();
  const arrivals = new Map<string, string[]>();
  for (const t of w.transfers ?? []) {
    if (t.done || t.kind === "renewal") continue;
    pending.add(t.playerId);
    arrivals.set(t.to, [...(arrivals.get(t.to) ?? []), t.playerId]);
  }
  const expiring = Object.values(w.players).filter((ps) => !ps.virtual && !ps.academy && ps.clubId && ps.contract && ps.contract.expires <= end && !ps.contract.joker && !pending.has(ps.player.id));

  // 1. AI renewals (about two thirds of the expiring players over the season).
  for (const ps of expiring) {
    if (ps.clubId === m?.clubId || !AI_LEAGUES.has(w.clubs[ps.clubId!]!.league)) continue;
    const age = ageOn(ps.player.birthDate, w.date);
    if (rng.chance(age >= 33 ? 0.015 : 0.035)) {
      ps.contract = { ...ps.contract!, expires: end + preferredYears(ps, w.date), salary: Math.round((ps.contract!.salary * rng.range(0.95, 1.15)) / 1000) * 1000 };
    }
  }

  // 2. AI pre-contracts.
  const pool = expiring.filter((ps) => (ps.contract?.expires ?? 0) <= end);
  for (const [clubId, club] of Object.entries(w.clubs)) {
    if (clubId === m?.clubId || !AI_LEAGUES.has(club.league) || !rng.chance(0.16)) continue;
    const needs = (Object.keys(NEED) as Position[]).filter((p) => nextSeasonCount(w, clubId, p, pending, arrivals) < NEED[p]!);
    if (!needs.length) continue;
    const pos = rng.pick(needs);
    const levels = (w.squads[clubId] ?? []).map((id) => playerLevel(w.players[id]!.player)).sort((a, b) => b - a);
    const ref = levels[Math.min(20, levels.length - 1)] ?? 11;
    const candidates = pool
      .filter((ps) => ps.clubId !== clubId && best(ps) === pos && !pending.has(ps.player.id) && (ps.contract?.expires ?? 0) <= end)
      .filter((ps) => Math.abs(playerLevel(ps.player) - ref) <= 1.6 && ageOn(ps.player.birthDate, w.date) <= 34 && interestIn(w, ps, clubId).score >= 0.45)
      .sort((a, b) => playerLevel(b.player) - playerLevel(a.player));
    const target = candidates[rng.int(0, Math.min(2, candidates.length - 1))];
    if (!target) continue;
    if (target.clubId === m?.clubId) {
      // The manager's player: first an approach (news), a signature three weeks later at the earliest.
      w.approaches ??= {};
      const ap = w.approaches[target.player.id];
      if (!ap) {
        w.approaches[target.player.id] = { club: clubId, date: w.date };
        w.news.push({ date: w.date, topic: "transfer", clubs: [m!.clubId], text: `${club.name} s'intéresse à ${nameOf(target)}, dont le contrat se termine en juin. Prolongez-le si vous voulez le garder.`, importance: 2 });
        continue;
      }
      if (daysBetween(ap.date, w.date) < 21 || (w.negotiations?.[target.player.id] && rng.chance(0.5))) continue;
    }
    const contract: Contract = { clubId, salary: askingSalary(w, target, clubId), expires: end + preferredYears(target, w.date), estimated: true };
    const deal: TransferDeal = { id: `preContract:${target.player.id}:${w.date}`, playerId: target.player.id, from: target.clubId!, to: clubId, kind: "preContract", contract, fee: 0, agentFee: 0, agreedOn: w.date, effective: nextSeasonStart(w) };
    (w.transfers ??= []).push(deal);
    pending.add(target.player.id);
    arrivals.set(clubId, [...(arrivals.get(clubId) ?? []), target.player.id]);
    const mine = target.clubId === m?.clubId;
    if (mine || playerLevel(target.player) >= 14.5) {
      w.news.push({ date: w.date, topic: "transfer", clubs: [target.clubId!, clubId], text: `${nameOf(target)} (${w.clubs[target.clubId!]!.name}) s'engage avec ${club.name} pour la saison prochaine.${mine ? " Il quittera le club en fin de saison." : ""}`, importance: mine ? 3 : 1 });
    }
  }
}

/* ------------------------------------------------------------------ free agents */

const FA_POSITIONS: Position[] = ["LH", "HK", "TH", "LO", "LO", "BF", "OF", "N8", "SH", "FH", "IC", "OC", "WG", "WG", "FB"];

/** Fictional unattached players (released, back from abroad): the pool for medical jokers. */
export function initFreeAgents(w: World): void {
  if (w.freeAgents) return;
  const rng = new Rng(`${w.seed}:free-agents`);
  const ids: string[] = [];
  for (let i = 0; i < 45; i++) {
    const position = FA_POSITIONS[i % FA_POSITIONS.length]!;
    const player = generatePlayer(rng, { position, level: rng.range(9.5, 13.6), age: rng.int(24, 34), id: `libre-${i}`, referenceDate: w.date, nationality: rng.weighted([["FRA", 6], ["FIJ", 2], ["RSA", 1], ["GEO", 1], ["ARG", 1], ["NZL", 1]] as const) });
    player.potentialAbility = player.currentAbility;
    const ps = newPlayerState(player, undefined, rng.chance(0.2) ? rng.int(1, 15) : 0);
    ps.profile = { generated: true, jiff: player.nationality === "FRA" && rng.chance(0.7) };
    w.players[player.id] = ps;
    ids.push(player.id);
  }
  w.freeAgents = ids;
}

/** JIFF count of a match sheet (for the JIFF rule). */
export const jiffCount = (w: World, playerIds: readonly string[]): number => playerIds.filter((id) => isJiff(w.players[id])).length;

/**
 * Reminders (first Monday of January, March, May and June): the manager's players whose contract
 * ends in June without a renewal or a move, best first.
 */
export function contractReminders(w: World): void {
  const m = w.manager;
  if (!m || Number(w.date.slice(8, 10)) > 7 || !["01", "03", "05", "06"].includes(w.date.slice(5, 7))) return;
  const end = seasonEndYear(w);
  const pending = new Set((w.transfers ?? []).filter((t) => !t.done).map((t) => t.playerId));
  const expiring = (w.squads[m.clubId] ?? [])
    .map((id) => w.players[id]!)
    .filter((ps) => ps.contract && ps.contract.expires <= end && !ps.contract.joker && !pending.has(ps.player.id))
    .sort((a, b) => playerLevel(b.player) - playerLevel(a.player));
  if (!expiring.length) return;
  const names = expiring.slice(0, 5).map(nameOf).join(", ");
  w.news.push({
    date: w.date,
    topic: "transfer",
    clubs: [m.clubId],
    text: `Fins de contrat : ${expiring.length} joueur${expiring.length > 1 ? "s" : ""} de l'effectif ${expiring.length > 1 ? "seront libres" : "sera libre"} le 1er juillet sans prolongation (${names}${expiring.length > 5 ? "…" : ""}). Prolongez ceux que vous voulez garder depuis l'écran Recrutement.`,
    importance: 2,
  });
}
