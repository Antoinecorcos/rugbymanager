import {
  DEFAULT_REFEREE,
  generateMatchTeam,
  playerDisplayName,
  Rng,
  type MatchSetup,
  type MatchTeam,
  type Tactics,
} from "../src/index.js";

export function makeTeams(seed: string, levelHome = 13, levelAway = 13, tacticsHome?: Partial<Tactics>, tacticsAway?: Partial<Tactics>): [MatchTeam, MatchTeam] {
  const rng = new Rng(seed);
  return [
    generateMatchTeam(rng, { id: "home", name: "Stade Ovalien", shortName: "SOV", level: levelHome, tactics: tacticsHome }),
    generateMatchTeam(rng, { id: "away", name: "Union Sportive Gasconne", shortName: "USG", level: levelAway, tactics: tacticsAway }),
  ];
}

export function makeSetup(home: MatchTeam, away: MatchTeam, seed: string | number): MatchSetup {
  return { home, away, referee: DEFAULT_REFEREE, weather: "dry", seed };
}

export function nameResolver(teams: MatchTeam[]) {
  const map = new Map<string, string>();
  for (const t of teams) for (const p of t.players) map.set(p.id, playerDisplayName(p));
  return (id: string | undefined) => (id ? (map.get(id) ?? "?") : "");
}
