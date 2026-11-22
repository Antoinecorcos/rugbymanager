/**
 * Referees (GDD §4.1, §5: a small effect). Names are real officials of the 2025-26 panels;
 * their tendencies are ESTIMATES drawn deterministically around the average (no public data
 * measures them consistently), so the league averages — and the calibration — stay unchanged.
 */
import type { RefereeProfile } from "../domain/match-setup.js";
import { Rng } from "../rng.js";
import type { Fixture, World } from "./types.js";

export interface Referee extends RefereeProfile {
  /** Union of the referee (ISO 3166-1 alpha-3, ENG/SCO/WAL for the home nations). */
  nation: string;
  /** Domestic panels: competition ids where he/she referees. */
  panels: string[];
  /** Tendencies are estimated, not measured. */
  estimated: true;
}

const FRENCH = ["Mathieu Raynal", "Pierre Brousset", "Luc Ramos", "Tual Trainini", "Ludovic Cayre", "Adrien Marbot", "Thomas Charabas", "Cédric Marchat", "Kévin Bralley", "Jérémy Rozier", "Laurent Millotte", "Pierre-Baptiste Nucci"];
const ENGLISH = ["Karl Dickson", "Matthew Carley", "Luke Pearce", "Christophe Ridley", "Tom Foley", "Ian Tempest", "Anthony Woodthorpe", "Craig Maxwell-Keys"];
const URC: [string, string][] = [
  ["Andrew Brace", "IRL"], ["Chris Busby", "IRL"], ["Frank Murphy", "IRL"], ["Eoghan Cross", "IRL"],
  ["Craig Evans", "WAL"], ["Ben Whitehouse", "WAL"], ["Mike Adamson", "SCO"], ["Sam Grove-White", "SCO"],
  ["Hollie Davidson", "SCO"], ["Andrea Piardi", "ITA"], ["Federico Vedovelli", "ITA"], ["AJ Jacobs", "RSA"], ["Griffin Colby", "RSA"],
];
const SOUTHERN: [string, string][] = [
  ["Nika Amashukeli", "GEO"], ["Angus Gardner", "AUS"], ["Nic Berry", "AUS"], ["Damon Murphy", "AUS"],
  ["Ben O'Keeffe", "NZL"], ["James Doleman", "NZL"], ["Paul Williams", "NZL"],
];

/** Tendency around 0.5 (0.3–0.7), deterministic from the name. */
function tendencies(name: string): Pick<RefereeProfile, "breakdownStrictness" | "scrumStrictness" | "cardStrictness"> {
  const rng = new Rng(`referee:${name}`);
  const t = () => Math.round((0.3 + rng.next() * 0.4) * 100) / 100;
  return { breakdownStrictness: t(), scrumStrictness: t(), cardStrictness: t() };
}

const slug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "-");

const make = (name: string, nation: string, panels: string[]): Referee => ({ id: `ref-${slug(name)}`, name, nation, panels, estimated: true, ...tendencies(name) });

export const REFEREES: readonly Referee[] = [
  ...FRENCH.map((n) => make(n, "FRA", ["top14", "prod2", "nationale"])),
  ...ENGLISH.map((n) => make(n, "ENG", ["prem"])),
  ...URC.map(([n, c]) => make(n, c, ["urc"])),
  ...SOUTHERN.map(([n, c]) => make(n, c, [])),
];

export const refereeById = (id: string): Referee | undefined => REFEREES.find((r) => r.id === id);

/** Union of a team (club country, or the nation code itself for national teams). */
const unionOf = (w: World, team: string): string => w.clubs[team]?.country ?? team;

/**
 * Referee appointed to a fixture: a member of the competition's panel, or — for European cups and
 * internationals — a neutral referee (not from either team's union). Deterministic, so the
 * preparation screen can announce him before the match.
 */
export function fixtureReferee(w: World, f: Fixture): Referee {
  const rng = new Rng(`${w.seed}:${f.id}:referee`);
  let pool = REFEREES.filter((r) => r.panels.includes(f.competitionId));
  if (pool.length === 0) {
    const unions = new Set([unionOf(w, f.home), unionOf(w, f.away)]);
    pool = REFEREES.filter((r) => !unions.has(r.nation));
  }
  // Knock-out matches go to the most experienced (first listed) referees of the panel.
  if (f.knockout && pool.length > 4) pool = pool.slice(0, 4);
  return rng.pick(pool);
}
