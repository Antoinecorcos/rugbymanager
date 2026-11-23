/**
 * Club staff (GDD §6.3). The database only knows the head coaches: the assistants, physios and
 * academy managers are fictional, generated from the seed with a quality that follows the club's
 * standing. Their attributes drive training (development, automatisms), recovery from injuries and
 * the quality of the academy intake.
 */
import { NAME_POOLS } from "../gen/names.js";
import { clamp, Rng } from "../rng.js";
import type { SharpnessUnit, StaffAttributes, StaffMember, StaffRole, World, WorldClub } from "./types.js";

export const STAFF_ROLE_FR: Record<StaffRole, string> = {
  assistant: "Entraîneur adjoint",
  forwards: "Entraîneur des avants",
  backs: "Entraîneur des trois-quarts",
  defence: "Entraîneur de la défense",
  fitness: "Préparateur physique",
  physio: "Kinésithérapeute",
  doctor: "Médecin",
  analyst: "Analyste vidéo",
  youth: "Responsable du centre de formation",
};

export const STAFF_ATTRIBUTE_FR: Record<keyof StaffAttributes, string> = {
  coaching: "Entraînement",
  tactics: "Tactique",
  motivation: "Motivation",
  fitness: "Préparation physique",
  medical: "Médical",
  youth: "Formation",
  analysis: "Analyse",
};

/** Key attribute(s) of each role. */
const KEY: Record<StaffRole, (keyof StaffAttributes)[]> = {
  assistant: ["coaching", "tactics", "motivation"],
  forwards: ["coaching"],
  backs: ["coaching", "tactics"],
  defence: ["coaching", "tactics"],
  fitness: ["fitness"],
  physio: ["medical"],
  doctor: ["medical"],
  analyst: ["analysis", "tactics"],
  youth: ["youth", "coaching"],
};

const ROLES: StaffRole[] = ["assistant", "forwards", "backs", "defence", "fitness", "physio", "doctor", "analyst", "youth"];

/** Leagues whose clubs get a full staff (the others only need neutral quality). */
const STAFFED = new Set(["TOP14", "PROD2", "NATIONALE", "PREM", "URC"]);

const POOL_BY_COUNTRY: Record<string, string> = { FRA: "FRA", RSA: "RSA", NZL: "NZL", AUS: "NZL", GEO: "GEO", ARG: "ARG", FIJ: "FIJ" };

function generateStaff(rng: Rng, club: WorldClub): StaffMember[] {
  // Reputation 1–200 → base quality ≈ 8 (small Nationale club) to ≈ 15 (Toulouse, Leinster).
  const base = clamp(6.5 + (club.reputation / 200) * 9.5, 5, 16);
  const pool = NAME_POOLS[POOL_BY_COUNTRY[club.country] ?? "FRA"] ?? NAME_POOLS.FRA!;
  return ROLES.map((role) => {
    const attributes = {} as StaffAttributes;
    for (const k of Object.keys(STAFF_ATTRIBUTE_FR) as (keyof StaffAttributes)[]) {
      const key = KEY[role].includes(k);
      attributes[k] = Math.round(clamp(rng.normal(base + (key ? 2.5 : -2.5), 1.8), 1, 20));
    }
    return {
      id: `staff-${club.id}-${role}`,
      name: `${rng.pick(pool.first)} ${rng.pick(pool.last)}`,
      role,
      nationality: POOL_BY_COUNTRY[club.country] ?? club.country,
      age: Math.round(clamp(rng.normal(44, 8), 29, 66)),
      attributes,
      generated: true,
    } satisfies StaffMember;
  });
}

/** Gives every club of the main leagues its staff (idempotent), with estimated wages. */
export function initStaff(w: World): void {
  for (const club of Object.values(w.clubs)) {
    if (!club.staff && STAFFED.has(club.league)) club.staff = generateStaff(new Rng(`${w.seed}:staff:${club.id}`), club);
    for (const s of club.staff ?? []) s.wage ??= staffWage(s, club.league);
  }
}

/** Key attribute value of a staff member for his role. */
export const staffQuality = (s: StaffMember): number => Math.max(...KEY[s.role].map((k) => s.attributes[k]));

/** Estimated yearly wage of a staff member (quality and league). */
export function staffWage(s: StaffMember, league: string): number {
  const q = staffQuality(s);
  const scale = league === "TOP14" || league === "PREM" ? 1 : league === "URC" ? 0.85 : league === "PROD2" ? 0.45 : 0.25;
  return Math.round(((35_000 + q * q * 650) * scale) / 1000) * 1000;
}

/** Free staff looking for a club (idempotent): a few candidates per role, of every level. */
export function initStaffMarket(w: World): void {
  if (w.staffMarket) return;
  // A new market every season (the first season keeps the original seed).
  const rng = new Rng(`${w.seed}:staff-market${w.season === "2026-2027" ? "" : `:${w.season}`}`);
  const out: StaffMember[] = [];
  for (const role of ROLES) {
    for (let i = 0; i < 4; i++) {
      const fake = { id: `free-${i}`, reputation: rng.int(40, 190), country: rng.pick(["FRA", "FRA", "FRA", "NZL", "RSA", "ARG"]) } as WorldClub;
      const [member] = generateStaff(rng, fake).filter((m) => m.role === role);
      if (!member) continue;
      member.id = `staff-free-${role}-${i}`;
      member.wage = staffWage(member, "TOP14");
      out.push(member);
    }
  }
  w.staffMarket = out;
}

/**
 * Hires a free staff member for the manager's club: he replaces the current holder of the role,
 * whose contract is settled with three months of wages. Returns an error (French) or null.
 */
export function hireStaff(w: World, staffId: string, pay: (label: string, amount: number) => boolean): string | null {
  const m = w.manager;
  const club = m ? w.clubs[m.clubId] : undefined;
  const cand = w.staffMarket?.find((s) => s.id === staffId);
  if (!m || !club || !cand) return "Candidat introuvable.";
  const current = club.staff?.find((s) => s.role === cand.role);
  const wage = staffWage(cand, club.league);
  const compensation = current ? Math.round((current.wage ?? 0) / 4) : 0;
  if (compensation && !pay(`Indemnité de départ : ${current!.name}`, compensation)) return "Budget de recrutement insuffisant pour indemniser le titulaire actuel.";
  club.staff = [...(club.staff ?? []).filter((s) => s !== current), { ...cand, id: `staff-${club.id}-${cand.role}`, wage }];
  w.staffMarket = w.staffMarket!.filter((s) => s.id !== staffId);
  if (current) w.staffMarket.push({ ...current, id: `staff-free-${current.role}-${w.date}` });
  w.news.push({ date: w.date, topic: "club", clubs: [club.id], text: `${cand.name} rejoint le staff (${STAFF_ROLE_FR[cand.role].toLowerCase()})${current ? ` et remplace ${current.name}` : ""}.`, importance: 1 });
  return null;
}

export const staffOf = (club: WorldClub | undefined, role: StaffRole): StaffMember | undefined => club?.staff?.find((s) => s.role === role);

/** Quality (1–20) of the staff responsible for a training unit; 10 when the club has no staff. */
export function unitCoachQuality(club: WorldClub | undefined, unit: SharpnessUnit | "development"): number {
  const get = (role: StaffRole, attr: keyof StaffAttributes) => staffOf(club, role)?.attributes[attr];
  const q =
    unit === "setPiece" ? get("forwards", "coaching")
    : unit === "attack" ? get("backs", "coaching")
    : unit === "defence" ? get("defence", "coaching")
    : unit === "kicking" ? get("backs", "tactics")
    : unit === "fitness" ? get("fitness", "fitness")
    : get("assistant", "coaching");
  return q ?? 10;
}

/** Recovery from injury: days are multiplied by this factor (good physios and doctors shorten them). */
export function medicalFactor(club: WorldClub | undefined): number {
  const physio = staffOf(club, "physio")?.attributes.medical ?? 10;
  const doctor = staffOf(club, "doctor")?.attributes.medical ?? 10;
  return clamp(1.12 - ((physio + doctor) / 2) * 0.012, 0.85, 1.12);
}

export const youthQuality = (club: WorldClub | undefined): number => staffOf(club, "youth")?.attributes.youth ?? 10;
