/**
 * Sector ratings of a match-day 23 (1–20 scale), built from the same attributes the match engine
 * uses for each phase. They feed the analyst's report and the match preparation screen.
 */
import type { MatchTeam } from "../domain/match-setup.js";
import type { Player } from "../domain/player.js";
import type { AttributeKey } from "../domain/attributes.js";
import { playerLevel } from "./selection.js";

export const SECTORS = ["scrum", "lineout", "maul", "breakdown", "carrying", "backAttack", "defence", "kicking", "goalKicking", "aerial", "discipline", "bench"] as const;
export type Sector = (typeof SECTORS)[number];
export type SectorRatings = Record<Sector, number>;

export const SECTOR_LABEL_FR: Record<Sector, string> = {
  scrum: "Mêlée",
  lineout: "Touche",
  maul: "Maul",
  breakdown: "Grattage et rucks",
  carrying: "Avancée des avants",
  backAttack: "Attaque des trois-quarts",
  defence: "Défense",
  kicking: "Jeu au pied",
  goalKicking: "Buteur",
  aerial: "Jeu aérien (fond de terrain)",
  discipline: "Discipline",
  bench: "Banc",
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Body weight and height as 1–20 scores (forwards' scale). */
const weightScore = (kg: number) => clamp((kg - 80) / 2.8, 1, 20);
const heightScore = (cm: number) => clamp((cm - 178) / 1.6, 1, 20);
const mix = (p: Player, w: Partial<Record<AttributeKey, number>>) => {
  let s = 0;
  let t = 0;
  for (const [k, v] of Object.entries(w) as [AttributeKey, number][]) {
    s += p.attributes[k] * v;
    t += v;
  }
  return s / t;
};
const weighted = (items: [number, number][]) => items.reduce((a, [v, w]) => a + v * w, 0) / items.reduce((a, [, w]) => a + w, 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function sectorRatings(team: MatchTeam): SectorRatings {
  const s = (shirt: number) => team.players[shirt - 1]!;
  const fwd = [1, 2, 3, 4, 5, 6, 7, 8].map(s);
  const backs = [9, 10, 11, 12, 13, 14, 15].map(s);
  const xv = team.players.slice(0, 15);

  const scrum = weighted(fwd.map((p, i) => [mix(p, { scrummaging: 5, strength: 3 }) * 0.8 + weightScore(p.weightKg) * 0.2, i < 3 ? 2.2 : i < 5 ? 1.2 : 0.6]));
  const jumpers = [4, 5, 6, 8].map(s).map((p) => mix(p, { lineoutJumping: 6, jumping: 2 }) * 0.8 + heightScore(p.heightCm) * 0.2).sort((a, b) => b - a);
  const lineout = s(2).attributes.lineoutThrowing * 0.45 + ((jumpers[0]! + jumpers[1]! + jumpers[2]!) / 3) * 0.55;
  const maul = weighted(fwd.map((p) => [mix(p, { maul: 5, strength: 3 }) * 0.8 + weightScore(p.weightKg) * 0.2, 1]));
  const breakdown = weighted([6, 7, 8, 2, 4, 5].map((n, i) => [mix(s(n), { jackal: 4, rucking: 3, strength: 2, workRate: 1 }), [1.4, 2.2, 1.2, 1, 0.6, 0.6][i]!]));
  const carrying = weighted(fwd.map((p) => [mix(p, { strength: 3, contactResilience: 3, handling: 2, offloading: 1, balance: 1 }), 1]));
  const backAttack = weighted(backs.map((p, i) => [mix(p, i < 2 ? { passing: 3, vision: 3, decisions: 2, footwork: 1, handling: 1 } : { pace: 3, footwork: 3, acceleration: 2, handling: 2, passing: 1 }), 1]));
  const defence = weighted(xv.map((p) => [mix(p, { tackling: 5, positioning: 2, anticipation: 2, strength: 1 }), 1]));
  const kicking = Math.max(...[9, 10, 15].map((n) => mix(s(n), { kicking: 3, tacticalKicking: 3 })));
  const kicker = team.players.find((p) => p.id === team.goalKickerId) ?? s(10);
  const aerial = weighted([11, 14, 15].map((n) => [mix(s(n), { highBall: 4, jumping: 1 }), n === 15 ? 1.6 : 1]));
  const discipline = weighted(xv.map((p) => [p.attributes.discipline, 1]));
  const bench = team.players.length > 15 ? weighted(team.players.slice(15).map((p) => [playerLevel(p), 1])) : 0;
  return {
    scrum: r1(scrum),
    lineout: r1(lineout),
    maul: r1(maul),
    breakdown: r1(breakdown),
    carrying: r1(carrying),
    backAttack: r1(backAttack),
    defence: r1(defence),
    kicking: r1(kicking),
    goalKicking: r1(kicker.attributes.goalKicking),
    aerial: r1(aerial),
    discipline: r1(discipline),
    bench: r1(bench),
  };
}
