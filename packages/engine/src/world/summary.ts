/** End-of-season (or in-season) summary: honours, movements, best scorers, doublons, medical. */
import { NATION_NAME_FR } from "./competitions.js";
import type { World } from "./types.js";

export interface ScorerLine {
  playerId: string;
  name: string;
  team: string;
  value: number;
}

export interface CompetitionSummary {
  id: string;
  name: string;
  champion?: string;
  runnerUp?: string;
  relegated?: string[];
  notes?: string[];
  topTryScorers: ScorerLine[];
  topPointScorers: ScorerLine[];
}

export interface SeasonSummary {
  season: string;
  date: string;
  matchesPlayed: number;
  competitions: CompetitionSummary[];
  /** League changes for next season (France: Top 14 ⇄ Pro D2 ⇄ Nationale). */
  movements: { from: string; to: string; club: string; reason: string }[];
  /** Club matches played while players were away with their national team. */
  doublons: { matches: number; missingPlayers: number; byClub: Record<string, number> };
  injuries: { long: number };
}


export function seasonSummary(w: World, scorers = 3): SeasonSummary {
  const label = (id: string) => w.clubs[id]?.name ?? NATION_NAME_FR[id] ?? id;
  const competitions: CompetitionSummary[] = Object.values(w.competitions).map((c) => {
    const lines = (key: "tries" | "points"): ScorerLine[] =>
      Object.values(w.players)
        .filter((p) => (p.stats[c.id]?.[key] ?? 0) > 0)
        .map((p) => ({
          playerId: p.player.id,
          name: `${p.player.firstName} ${p.player.lastName}`,
          team: c.kind === "international" ? label(p.player.nationality) : label(p.clubId ?? ""),
          value: p.stats[c.id]![key],
        }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
        .slice(0, scorers);
    const s: CompetitionSummary = { id: c.id, name: c.name, topTryScorers: lines("tries"), topPointScorers: lines("points") };
    if (c.outcome?.champion) s.champion = c.outcome.champion;
    if (c.outcome?.runnerUp) s.runnerUp = c.outcome.runnerUp;
    if (c.outcome?.relegated?.length) s.relegated = c.outcome.relegated;
    if (c.outcome?.notes?.length) s.notes = c.outcome.notes;
    return s;
  });

  // Promotion / relegation between the French divisions.
  const movements: SeasonSummary["movements"] = [];
  const top14 = w.competitions.top14?.outcome;
  const prod2 = w.competitions.prod2?.outcome;
  const nat = w.competitions.nationale?.outcome;
  const accessWinner = (comp: string) => {
    const f = w.fixtures.find((x) => x.competitionId === comp && x.stage === "access" && x.result);
    return f ? (f.result!.winner === 1 ? f.away : f.home) : undefined;
  };
  if (top14 && prod2) {
    for (const club of top14.relegated ?? []) movements.push({ from: "TOP14", to: "PROD2", club, reason: club === top14.ranking?.at(-1) ? "14e du Top 14" : "battu en access match" });
    movements.push({ from: "PROD2", to: "TOP14", club: prod2.champion!, reason: "champion de Pro D2" });
    const aw = accessWinner("top14");
    if (aw && aw !== top14.ranking?.[12]) movements.push({ from: "PROD2", to: "TOP14", club: aw, reason: "vainqueur de l'access match" });
  }
  if (prod2 && nat) {
    for (const club of prod2.relegated ?? []) movements.push({ from: "PROD2", to: "NATIONALE", club, reason: club === prod2.ranking?.at(-1) ? "16e de Pro D2" : "battu en barrage d'accession" });
    movements.push({ from: "NATIONALE", to: "PROD2", club: nat.champion!, reason: "champion de Nationale" });
    const aw = accessWinner("prod2");
    if (aw && aw !== prod2.ranking?.[14]) movements.push({ from: "NATIONALE", to: "PROD2", club: aw, reason: "vainqueur du barrage d'accession" });
  }


  const byClub: Record<string, number> = {};
  let dMatches = 0;
  let dMissing = 0;
  for (const f of w.fixtures) {
    if (!f.result || w.competitions[f.competitionId]!.kind === "international") continue;
    const [a, b] = f.result.missingInternationals;
    if (a + b > 0) dMatches++;
    dMissing += a + b;
    if (a) byClub[f.home] = (byClub[f.home] ?? 0) + a;
    if (b) byClub[f.away] = (byClub[f.away] ?? 0) + b;
  }
  return {
    season: w.season,
    date: w.date,
    matchesPlayed: w.fixtures.filter((f) => f.result).length,
    competitions,
    movements,
    doublons: { matches: dMatches, missingPlayers: dMissing, byClub },
    injuries: { long: w.news.filter((n) => n.topic === "medical").length },
  };
}
