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

/** Gives every club of the main leagues its staff (idempotent). */
export function initStaff(w: World): void {
  for (const club of Object.values(w.clubs)) {
    if (club.staff || !STAFFED.has(club.league)) continue;
    club.staff = generateStaff(new Rng(`${w.seed}:staff:${club.id}`), club);
  }
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
