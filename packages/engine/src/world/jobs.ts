/**
 * Job offers (M6c): at the end of a season, or after a dismissal, clubs of the playable leagues
 * whose standing matches the manager's reputation offer him their bench. Accepting an offer moves
 * the career to that club (immediately after a dismissal, for next season at the end of a season).
 */
import { Rng } from "../rng.js";
import { addDays } from "./dates.js";
import { initBoard, strengthRanks } from "./board.js";
import { initFinances } from "./finances.js";
import { initSquadRelations } from "./human.js";
import { CAREER_LEAGUES, type JobOffer } from "./manager.js";
import type { World } from "./types.js";


/** Reputation (1–100) a club expects from its manager. */
export const requiredReputation = (clubReputation: number): number => Math.round(clubReputation * 0.48);

const OBJECTIVE: Record<string, [number, string][]> = {
  TOP14: [[2, "Jouer le titre"], [6, "Se qualifier pour les phases finales"], [10, "Finir dans le top 8"], [14, "Assurer le maintien"]],
  PROD2: [[3, "Viser la montée"], [8, "Se qualifier pour les phases finales"], [16, "Assurer le maintien"]],
  NATIONALE: [[3, "Viser la montée"], [8, "Se qualifier pour les phases finales"], [16, "Assurer le maintien"]],
};

/** Offers from clubs whose standing fits the manager's reputation (0 to 3 offers). */
export function makeJobOffers(w: World): JobOffer[] {
  const m = w.manager;
  if (!m) return [];
  const rep = m.reputation ?? 40;
  const rng = new Rng(`${w.seed}:jobs:${w.date}`);
  const playable = new Set(Object.values(CAREER_LEAGUES).flat());
  const candidates = Object.values(w.clubs).filter((c) => {
    if (c.id === m.clubId || !playable.has(c.league)) return false;
    const need = requiredReputation(c.reputation);
    return need <= rep + 6 && need >= rep - 30;
  });
  // Ambitious clubs first, with a little luck; a few of them have just changed their coach.
  const scored = candidates
    .map((c) => ({ c, s: c.reputation + rng.normal(0, 18) }))
    .filter(() => rng.chance(0.45))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);
  return scored.map(({ c }) => {
    const ranks = strengthRanks(w, c.league);
    const expected = ranks.indexOf(c.id) + 1;
    const tiers = OBJECTIVE[c.league] ?? OBJECTIVE.NATIONALE!;
    const objective = (tiers.find(([r]) => expected <= r) ?? tiers[tiers.length - 1]!)[1];
    return { clubId: c.id, date: w.date, objective, until: addDays(w.date, m.dismissed ? 60 : 45) };
  });
}

/** Offers the manager receives now (news in the inbox). */
export function receiveJobOffers(w: World): void {
  const m = w.manager;
  if (!m) return;
  m.offers = makeJobOffers(w);
  for (const o of m.offers) {
    const club = w.clubs[o.clubId]!;
    w.news.push({ date: w.date, topic: "job", clubs: [m.clubId], text: `${club.president ?? "Le président"} (${club.name}) vous propose de devenir son manager. Objectif : ${o.objective.toLowerCase()}.`, importance: 2 });
  }
}

/**
 * Accepts an offer: the manager leaves his club (its former coach takes over again) and takes charge
 * of the new club, with new objectives, accounts and squad relationships.
 */
export function acceptJob(w: World, clubId: string): string | null {
  const m = w.manager;
  const offer = m?.offers?.find((o) => o.clubId === clubId);
  if (!m || !offer) return "Cette offre n'existe pas.";
  if (offer.until < w.date) return "Cette offre a expiré.";
  const old = w.clubs[m.clubId]!;
  const club = w.clubs[clubId]!;
  old.headCoach = old.formerHeadCoach ?? "Entraîneur intérimaire";
  delete old.formerHeadCoach;
  delete old.finances;
  for (const id of w.squads[old.id] ?? []) if (w.players[id]) delete w.players[id]!.human;
  const spell = m.spells?.find((s) => s.clubId === old.id && !s.to);
  if (spell) spell.to = w.date;
  if (club.headCoach) club.formerHeadCoach = club.headCoach;
  w.news.push({ date: w.date, topic: "club", clubs: [old.id, clubId], text: `${m.profile.name} quitte ${old.name} et devient le manager de ${club.name}${club.formerHeadCoach ? ` à la place de ${club.formerHeadCoach}` : ""}.`, importance: 3 });
  club.headCoach = m.profile.name;
  m.clubId = clubId;
  m.since = w.date;
  (m.spells ??= []).push({ clubId, from: w.date });
  delete m.dismissed;
  delete m.board;
  m.offers = [];
  m.matchPlans = {};
  m.matchTargets = {};
  m.teamTalks = {};
  m.press = {};
  m.selection = { ...m.selection, auto: true, lineup: [] };
  delete m.selection.captainId;
  delete m.selection.goalKickerId;
  w.negotiations = {};
  w.approaches = {};
  delete w.jiffLog;
  initSquadRelations(w);
  initFinances(w);
  initBoard(w);
  return null;
}
