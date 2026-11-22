/**
 * Medical side (GDD §3.4, §6): injury records, escalating concussion stand-downs, injury risk,
 * and the option to rush a player back (shorter absence, higher risk for a few weeks).
 */
import { ageOn, addDays, daysBetween, type IsoDate } from "./dates.js";
import { medicalFactor } from "./staff.js";
import type { MedicalRecord, PlayerState, World } from "./types.js";

export const medicalOf = (ps: PlayerState): MedicalRecord => (ps.medical ??= { history: [], concussions: 0 });

/** Concussions in the 12 months before a date. */
export const recentConcussions = (ps: PlayerState, d: IsoDate): number =>
  (ps.medical?.history ?? []).filter((h) => h.concussion && daysBetween(h.from, d) <= 365).length;

/**
 * Records a new injury: the club's medical staff shortens (or lengthens) the absence, and every
 * recent concussion adds a week to the return-to-play protocol. Returns the final number of days.
 */
export function recordInjury(w: World, ps: PlayerState, d: IsoDate, type: string, days: number, concussion: boolean, training = false): number {
  const med = medicalOf(ps);
  const club = ps.clubId ? w.clubs[ps.clubId] : undefined;
  let out = Math.max(1, Math.round(days * medicalFactor(club)));
  if (concussion) {
    out += 7 * recentConcussions(ps, d);
    med.concussions += 1;
  }
  med.history.push({ type, from: d, days: out, concussion, ...(training ? { training: true } : {}) });
  if (med.history.length > 30) med.history.splice(0, med.history.length - 30);
  ps.injury = { type, until: addDays(d, out), concussion };
  if (concussion && med.concussions >= 3 && ps.clubId && ps.clubId === w.manager?.clubId) {
    w.news.push({
      date: d,
      topic: "medical",
      clubs: [ps.clubId],
      text: `Le médecin s'inquiète pour ${ps.player.firstName} ${ps.player.lastName} : ${med.concussions}e commotion de sa carrière. Il recommande la plus grande prudence${med.concussions >= 4 ? " et évoque l'arrêt de sa carrière" : ""}.`,
      importance: 2,
    });
  }
  return out;
}

export type RiskLevel = "low" | "moderate" | "high";

export const RISK_FR: Record<RiskLevel, string> = { low: "Faible", moderate: "Modéré", high: "Élevé" };

/** Injury risk of a player for the next match: freshness, injury-proneness, age, recent return, rushed return. */
export function injuryRisk(ps: PlayerState, d: IsoDate): { level: RiskLevel; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (ps.freshness < 60) {
    score += 0.35;
    reasons.push("très fatigué");
  } else if (ps.freshness < 75) {
    score += 0.15;
    reasons.push("fatigué");
  }
  const prone = ps.player.hidden.injuryProneness;
  if (prone >= 15) {
    score += 0.2;
    reasons.push("fragile physiquement");
  } else if (prone >= 12) score += 0.1;
  if (ageOn(ps.player.birthDate, d) >= 32) {
    score += 0.1;
    reasons.push("âge");
  }
  const last = ps.medical?.history[ps.medical.history.length - 1];
  if (last && daysBetween(addDays(last.from, last.days), d) < 21 && daysBetween(addDays(last.from, last.days), d) >= 0) {
    score += 0.15;
    reasons.push("revient de blessure");
  }
  if (ps.medical?.fragileUntil && ps.medical.fragileUntil > d) {
    score += 0.35;
    reasons.push("retour accéléré");
  }
  // One mild factor alone is not worth a warning: two factors, or a rushed return, are.
  return { level: score >= 0.5 ? "high" : score >= 0.3 ? "moderate" : "low", score, reasons };
}

/** Players whose rushed return still makes them fragile (for the match engine). */
export const isFragile = (ps: PlayerState, d: IsoDate): boolean => !!ps.medical?.fragileUntil && ps.medical.fragileUntil > d;

/**
 * Rushes an injured player back: about a third of the remaining absence is cut, and he stays
 * fragile (double injury risk in contact) for four weeks after his return. Not for concussions.
 * Returns an error message (French) or null.
 */
export function rushBack(w: World, playerId: string): string | null {
  const ps = w.players[playerId];
  if (!ps?.injury || ps.injury.until <= w.date) return "Ce joueur n'est pas blessé.";
  if (ps.injury.concussion) return "Impossible : le protocole commotion ne se raccourcit pas.";
  const left = daysBetween(w.date, ps.injury.until);
  if (left < 10) return "Retour trop proche pour être accéléré.";
  if (isFragile(ps, w.date)) return "Le staff médical refuse : il a déjà été pressé.";
  const until = addDays(w.date, Math.ceil(left * 0.65));
  ps.injury = { ...ps.injury, until };
  medicalOf(ps).fragileUntil = addDays(until, 28);
  return null;
}
