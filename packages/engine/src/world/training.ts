/**
 * Training (GDD §6.2) and player development (GDD §3.3).
 *
 * - The weekly plan (intensity, focus, contact) builds the team's automatisms per unit
 *   ("sharpness", a small in-match effect), affects daily recovery and the risk of injury in training.
 * - Every Monday every player develops: young players move towards their potential, veterans
 *   decline (physical attributes first). Minutes played, training intensity, the relevant coach and
 *   professionalism speed it up. Attributes move by whole points through fractional progress.
 */
import { MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES, type AttributeKey } from "../domain/attributes.js";
import { isForward, isFrontRow, type Position } from "../domain/positions.js";
import { clamp, Rng } from "../rng.js";
import { ageOn, daysBetween, type IsoDate } from "./dates.js";
import { recordInjury } from "./medical.js";
import { unitCoachQuality } from "./staff.js";
import type { IndividualFocus, PlayerDevelopment, PlayerState, Sharpness, SharpnessUnit, TrainingFocus, TrainingPlan, World, WorldClub } from "./types.js";

export const DEFAULT_TRAINING: Readonly<TrainingPlan> = { intensity: "normal", focus: "balanced", contact: "normal" };
export const NEUTRAL_SHARPNESS: Readonly<Sharpness> = { setPiece: 0.5, attack: 0.5, defence: 0.5, kicking: 0.5, fitness: 0.5 };
export const SHARPNESS_UNITS: readonly SharpnessUnit[] = ["setPiece", "attack", "defence", "kicking", "fitness"];

export const TRAINING_FR = {
  intensity: { light: "Légère", normal: "Normale", intense: "Intense" },
  focus: { balanced: "Équilibré", setPiece: "Conquête (mêlée, touche, maul)", attack: "Attaque", defence: "Défense", kicking: "Jeu au pied", fitness: "Physique", recovery: "Récupération" },
  contact: { low: "Peu de contacts", normal: "Contacts normaux", high: "Beaucoup de contacts" },
  unit: { setPiece: "Conquête", attack: "Attaque", defence: "Défense", kicking: "Jeu au pied", fitness: "Condition physique" },
  individual: { none: "Aucun", technical: "Technique", mental: "Mental", physical: "Physique", position: "Apprendre un poste" },
} as const;

/** What each choice does (shown in the training screen). */
export const TRAINING_EFFECTS = {
  intensity: {
    light: "Récupération +0,6 point de fraîcheur par jour, progression ×0,85, moins de blessures.",
    normal: "Équilibre entre progression, fraîcheur et risque.",
    intense: "Progression ×1,15, mais récupération −0,6 point par jour et risque de blessure ×1,5.",
  },
  contact: {
    low: "Moins de blessures à l'entraînement (×0,5) ; automatismes de conquête et de défense en baisse.",
    normal: "Standard.",
    high: "Conquête et défense plus affûtées, mais risque de blessure ×1,8 à l'entraînement.",
  },
} as const;

export const planOf = (club: WorldClub | undefined): TrainingPlan => club?.training ?? DEFAULT_TRAINING;
export const sharpnessOf = (club: WorldClub | undefined): Sharpness => club?.sharpness ?? NEUTRAL_SHARPNESS;

/* ------------------------------------------------------------------ automatisms */

/** Target sharpness of each unit for a plan: the focused unit rises, the others ease off slightly. */
export function sharpnessTarget(plan: TrainingPlan): Sharpness {
  const t = { ...NEUTRAL_SHARPNESS };
  for (const u of SHARPNESS_UNITS) {
    if (plan.focus === u) t[u] = 0.85;
    else if (plan.focus !== "balanced") t[u] = 0.45;
    if (plan.focus === "recovery") t[u] = 0.42;
  }
  if (plan.contact === "high") {
    t.setPiece += 0.08;
    t.defence += 0.08;
  } else if (plan.contact === "low") {
    t.setPiece -= 0.08;
    t.defence -= 0.08;
  }
  const i = plan.intensity === "intense" ? 0.04 : plan.intensity === "light" ? -0.04 : 0;
  for (const u of SHARPNESS_UNITS) t[u] = clamp(t[u] + i, 0, 1);
  return t;
}

function updateSharpness(club: WorldClub): void {
  const plan = planOf(club);
  const target = sharpnessTarget(plan);
  const cur = { ...sharpnessOf(club) };
  for (const u of SHARPNESS_UNITS) {
    // A good coach builds automatisms faster (18 % to 32 % of the gap per week).
    const speed = 0.18 + (unitCoachQuality(club, u) / 20) * 0.14;
    cur[u] = Math.round((cur[u] + (target[u] - cur[u]) * speed) * 1000) / 1000;
  }
  club.sharpness = cur;
}

/** Daily freshness adjustment of the training plan. */
export function dailyTrainingRecovery(plan: TrainingPlan): number {
  return (plan.intensity === "light" ? 0.6 : plan.intensity === "intense" ? -0.6 : 0) + (plan.focus === "recovery" ? 0.6 : 0);
}

/* ------------------------------------------------------------------ development */

const devOf = (ps: PlayerState): PlayerDevelopment => (ps.dev ??= { progress: {}, caAcc: 0, history: [], minutes: [] });

const UNIT_ATTRS: Record<Exclude<TrainingFocus, "balanced" | "recovery">, AttributeKey[]> = {
  setPiece: ["scrummaging", "lineoutThrowing", "lineoutJumping", "maul", "strength"],
  attack: ["passing", "handling", "offloading", "footwork", "decisions", "vision", "flair"],
  defence: ["tackling", "positioning", "jackal", "anticipation", "rucking", "concentration"],
  kicking: ["kicking", "tacticalKicking", "goalKicking", "highBall"],
  fitness: ["stamina", "strength", "pace", "acceleration", "recovery", "contactResilience"],
};
const DECLINE_ATTRS = new Set<AttributeKey>(["pace", "acceleration", "agility", "stamina", "recovery", "jumping", "balance"]);
const EXPERIENCE_ATTRS = new Set<AttributeKey>(["decisions", "composure", "positioning", "leadership", "anticipation", "communication"]);
const GROUP: Record<Exclude<IndividualFocus, "none" | "position">, readonly AttributeKey[]> = {
  technical: TECHNICAL_ATTRIBUTES,
  mental: MENTAL_ATTRIBUTES,
  physical: PHYSICAL_ATTRIBUTES,
};

const bestPosition = (ps: PlayerState): Position =>
  (Object.entries(ps.player.positions) as [Position, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "LO";

/** Age at which a player stops progressing and starts declining (forwards, front row last longer). */
export function peakAge(pos: Position): number {
  return isFrontRow(pos) ? 31 : isForward(pos) ? 30 : pos === "WG" ? 28 : 29;
}

/** Minutes played in the last 28 days (match experience). */
export const recentMinutes = (ps: PlayerState, d: IsoDate): number =>
  (ps.dev?.minutes ?? []).filter((m) => daysBetween(m.date, d) <= 28).reduce((s, m) => s + m.minutes, 0);

export function logMinutes(ps: PlayerState, d: IsoDate, minutes: number): void {
  const dev = devOf(ps);
  dev.minutes.push({ date: d, minutes });
  dev.minutes = dev.minutes.filter((m) => daysBetween(m.date, d) <= 35);
}

/**
 * Weekly change of current ability (1–200 scale) for a player, before it is spread over the
 * attributes. Positive while young and below potential, negative after the peak age.
 */
export function weeklyAbilityChange(ps: PlayerState, d: IsoDate, club: WorldClub | undefined): number {
  const p = ps.player;
  const ca = p.currentAbility ?? 100;
  const pa = Math.max(ca, p.potentialAbility ?? ca);
  const age = ageOn(p.birthDate, d);
  const pos = bestPosition(ps);
  const peak = peakAge(pos);
  const plan = planOf(club);
  const injured = !!ps.injury && ps.injury.until > d;
  if (age >= peak + 1) {
    // Decline: −0.05 CA/week one year after the peak, −0.25 five years after.
    const years = age - peak;
    const pro = p.hidden.professionalism;
    return -clamp(0.02 + years * 0.045, 0.02, 0.32) * (1.15 - pro / 50) * (injured ? 1.4 : 1);
  }
  if (injured) return -0.02;
  const gap = pa - ca;
  if (gap <= 0) return 0;
  const rate = age <= 20 ? 0.012 : age <= 23 ? 0.009 : age <= 26 ? 0.005 : 0.002;
  const minutes = recentMinutes(ps, d);
  const experience = 0.6 + 0.8 * Math.min(1, minutes / 200);
  const intensity = plan.intensity === "intense" ? 1.15 : plan.intensity === "light" ? 0.85 : 1;
  const coach = 0.8 + (unitCoachQuality(club, "development") / 20) * 0.4;
  const pro = 0.75 + (p.hidden.professionalism / 20) * 0.5;
  // Elite level (14.5+ on the 1–20 scale): every tenth of a point is harder to gain (M8 balancing,
  // otherwise most young internationals reached their estimated potential within three seasons).
  const elite = ca > 145 ? clamp(1 - (ca - 145) / 20, 0.15, 1) : 1;
  // Academy players: the academy manager matters more than the first-team staff.
  return gap * rate * experience * intensity * coach * pro * elite;
}

/** Spreads a change of ability over the attributes (key attributes and the training focus first). */
function applyAbility(ps: PlayerState, delta: number, focusUnit: TrainingFocus, rng: Rng): void {
  const p = ps.player;
  const dev = devOf(ps);
  dev.caAcc += delta;
  while (Math.abs(dev.caAcc) >= 1) {
    const step = Math.sign(dev.caAcc);
    p.currentAbility = clamp((p.currentAbility ?? 100) + step, 1, 200);
    dev.caAcc -= step;
  }
  // One CA point ≈ 0.1 of the mean attribute over 37 attributes ≈ 3.7 attribute points.
  const points = delta * 3.7;
  const focus = dev.focus && dev.focus !== "none" && dev.focus !== "position" ? new Set(GROUP[dev.focus]) : null;
  const unit = focusUnit !== "balanced" && focusUnit !== "recovery" ? new Set(UNIT_ATTRS[focusUnit]) : null;
  const keys = Object.keys(p.attributes) as AttributeKey[];
  const weights = keys.map((k) => {
    const v = p.attributes[k];
    let wgt: number;
    if (points >= 0) {
      wgt = Math.pow(v, 1.5) * (focus?.has(k) ? 2.2 : 1) * (unit?.has(k) ? 1.6 : 1) * (v >= 20 ? 0 : 1);
    } else {
      wgt = (DECLINE_ATTRS.has(k) ? 3 : 0.25) * (v <= 1 ? 0 : 1);
    }
    return wgt * (0.85 + rng.next() * 0.3);
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  keys.forEach((k, i) => {
    const share = (points * weights[i]!) / total;
    const acc = (dev.progress[k] ?? 0) + share;
    const whole = acc >= 1 ? Math.floor(acc) : acc <= -1 ? Math.ceil(acc) : 0;
    if (whole !== 0) p.attributes[k] = clamp(p.attributes[k] + whole, 1, 20);
    const rest = acc - whole;
    if (Math.abs(rest) > 1e-4) dev.progress[k] = Math.round(rest * 1000) / 1000;
    else delete dev.progress[k];
  });
}

/** Veterans keep learning the game while their body declines. */
function experienceGain(ps: PlayerState, d: IsoDate): void {
  const age = ageOn(ps.player.birthDate, d);
  if (age < 27 || recentMinutes(ps, d) < 80) return;
  const dev = devOf(ps);
  for (const k of EXPERIENCE_ATTRS) {
    const acc = (dev.progress[k] ?? 0) + 0.012;
    if (acc >= 1 && ps.player.attributes[k] < 20) {
      ps.player.attributes[k] += 1;
      dev.progress[k] = acc - 1;
    } else dev.progress[k] = Math.round(acc * 1000) / 1000;
  }
}

function learnPosition(ps: PlayerState): void {
  const dev = devOf(ps);
  if (dev.focus !== "position" || !dev.learning) return;
  const cur = ps.player.positions[dev.learning] ?? 1;
  if (cur >= 16) return;
  dev.learningAcc = (dev.learningAcc ?? 0) + 0.3 + (ps.player.hidden.adaptability / 20) * 0.3;
  while ((dev.learningAcc ?? 0) >= 1 && (ps.player.positions[dev.learning] ?? 1) < 16) {
    ps.player.positions[dev.learning] = (ps.player.positions[dev.learning] ?? 1) + 1;
    dev.learningAcc! -= 1;
  }
}

/* ------------------------------------------------------------------ training injuries */

const TRAINING_INJURIES: readonly (readonly [readonly [string, number, number], number])[] = [
  [["Contusion à l'entraînement", 3, 8], 35],
  [["Lésion aux ischio-jambiers", 10, 28], 20],
  [["Entorse de la cheville", 7, 24], 18],
  [["Lésion au mollet", 8, 21], 15],
  [["Blessure à l'épaule", 14, 45], 7],
  [["Commotion cérébrale", 10, 14], 5],
];

function trainingInjuries(w: World, clubId: string, rng: Rng, d: IsoDate): void {
  const club = w.clubs[clubId];
  const plan = planOf(club);
  const contactF = plan.contact === "high" ? 1.8 : plan.contact === "low" ? 0.5 : 1;
  const intensityF = plan.intensity === "intense" ? 1.5 : plan.intensity === "light" ? 0.6 : 1;
  for (const pid of w.squads[clubId] ?? []) {
    const ps = w.players[pid];
    if (!ps || (ps.injury && ps.injury.until > d) || (ps.duty && ps.duty.until >= d)) continue;
    const p = 0.003 * contactF * intensityF * (0.6 + ps.player.hidden.injuryProneness / 25) * (ps.freshness < 60 ? 1.5 : 1);
    if (!rng.chance(p)) continue;
    const [type, min, max] = rng.weighted(TRAINING_INJURIES);
    const concussion = type.startsWith("Commotion");
    if (concussion && plan.contact === "low") continue;
    const days = recordInjury(w, ps, d, type, rng.int(min, max), concussion, true);
    if (clubId === w.manager?.clubId) {
      w.news.push({ date: d, topic: "medical", clubs: [clubId], text: `${ps.player.firstName} ${ps.player.lastName} s'est blessé à l'entraînement (${type.toLowerCase().replace(" à l'entraînement", "")}) : environ ${days} jours d'absence.`, importance: days >= 14 ? 2 : 1 });
    }
  }
}

/* ------------------------------------------------------------------ weekly */

/** Every Monday: automatisms, training injuries, development of every player. */
export function weeklyTraining(w: World): void {
  const d = w.date;
  const rng = new Rng(`${w.seed}:${d}:training`);
  for (const [id, club] of Object.entries(w.clubs)) {
    if (!club.staff) continue;
    updateSharpness(club);
    trainingInjuries(w, id, rng, d);
  }
  const monthStart = Number(d.slice(8, 10)) <= 7;
  for (const ps of Object.values(w.players)) {
    if (ps.virtual) continue;
    const club = ps.clubId ? w.clubs[ps.clubId] : undefined;
    const delta = weeklyAbilityChange(ps, d, club);
    if (delta !== 0) applyAbility(ps, delta, planOf(club).focus, rng);
    experienceGain(ps, d);
    learnPosition(ps);
    if (monthStart && (ps.clubId === w.manager?.clubId || ps.academy)) {
      const dev = devOf(ps);
      if (!dev.history.length || dev.history[dev.history.length - 1]!.date !== d) {
        dev.history.push({ date: d, ca: ps.player.currentAbility ?? 0 });
        if (dev.history.length > 24) dev.history.shift();
      }
    }
  }
}

/** Individual training of a player of the manager's club. */
export function setIndividualTraining(w: World, playerId: string, focus: IndividualFocus, learning?: Position): string | null {
  const ps = w.players[playerId];
  if (!ps || (ps.clubId !== w.manager?.clubId)) return "Joueur introuvable dans votre club.";
  const dev = devOf(ps);
  dev.focus = focus;
  if (focus === "position") {
    if (!learning) return "Choisissez le poste à apprendre.";
    dev.learning = learning;
    dev.learningAcc ??= 0;
  } else delete dev.learning;
  return null;
}

/** Current ability one month ago (progress arrow in the interface). */
export function abilityTrend(ps: PlayerState, d: IsoDate): number {
  const h = ps.dev?.history ?? [];
  const ref = [...h].reverse().find((x) => daysBetween(x.date, d) >= 28);
  return ref ? (ps.player.currentAbility ?? 0) - ref.ca : 0;
}

