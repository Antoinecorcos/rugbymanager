/**
 * Academies (centres de formation, GDD §6.7). The real academies are not in the database: each
 * French club gets fictional youngsters (JIFF, mostly French), generated from the seed, whose level
 * and potential follow the league and the academy manager. A new intake arrives every March.
 * The manager can promote a youngster to the professional squad or release him.
 */
import type { Position } from "../domain/positions.js";
import { generatePlayer } from "../gen/player-gen.js";
import { clamp, Rng } from "../rng.js";
import { ageOn, type IsoDate } from "./dates.js";
import { humanOf } from "./human.js";
import { newPlayerState } from "./nations.js";
import { youthQuality } from "./staff.js";
import { marketSalary, seasonEndYear } from "./contracts.js";
import type { PlayerState, World } from "./types.js";

/** Leagues with an academy, and the starting level (1–20) of their youngsters. */
const ACADEMY_LEVEL: Record<string, number> = { TOP14: 9.2, PROD2: 8.6, NATIONALE: 8.0 };

const POSITIONS: Position[] = ["LH", "HK", "TH", "LO", "LO", "BF", "OF", "N8", "SH", "FH", "IC", "OC", "WG", "WG", "FB"];

/** Date of the yearly intake (journée des espoirs) of a season. */
export const intakeDate = (w: World): IsoDate => `${w.calendar.end.slice(0, 4)}-03-16`;

function makeYouth(w: World, clubId: string, n: number, rng: Rng, age?: number): PlayerState {
  const club = w.clubs[clubId]!;
  const base = ACADEMY_LEVEL[club.league] ?? 8;
  const quality = youthQuality(club);
  const position = POSITIONS[(n + rng.int(0, POSITIONS.length - 1)) % POSITIONS.length]!;
  const youthAge = age ?? rng.int(17, 20);
  const level = base + (youthAge - 18) * 0.35 + rng.normal(0, 0.7);
  const player = generatePlayer(rng, {
    position,
    level,
    nationality: rng.chance(0.9) ? "FRA" : rng.weighted([["FIJ", 3], ["GEO", 2], ["ARG", 1], ["RSA", 1]] as const),
    age: youthAge,
    id: `aca-${clubId}-${w.date.slice(0, 4)}-${n}`,
    referenceDate: w.date,
  });
  // Potential: most youngsters stay at Pro D2 / Nationale level, a few become internationals.
  const talent = rng.normal(0, 1) + (quality - 10) * 0.08;
  const potentialLevel = clamp(level + 2.5 + talent * 1.6 + (youthAge <= 18 ? 0.8 : 0), level + 0.5, 18.5);
  player.currentAbility = Math.round(clamp(level * 10, 40, 200));
  player.potentialAbility = Math.round(potentialLevel * 10);
  const ps = newPlayerState(player, clubId, 0);
  ps.academy = true;
  ps.profile = { generated: true, jiff: true, homegrown: true };
  return ps;
}

/** Gives every French club its academy (idempotent). */
export function initAcademies(w: World): void {
  w.academies ??= {};
  for (const [id, club] of Object.entries(w.clubs)) {
    if (w.academies[id] || !(club.league in ACADEMY_LEVEL)) continue;
    const rng = new Rng(`${w.seed}:academy:${id}`);
    const count = rng.int(9, 12);
    const ids: string[] = [];
    for (let n = 0; n < count; n++) {
      const ps = makeYouth(w, id, n, rng);
      w.players[ps.player.id] = ps;
      ids.push(ps.player.id);
    }
    w.academies[id] = ids;
  }
}

/** Yearly intake: 3 to 6 new 17-year-olds per academy, with the academy manager's report. */
export function academyIntake(w: World): void {
  if (!w.academies) return;
  for (const [id, ids] of Object.entries(w.academies)) {
    const rng = new Rng(`${w.seed}:${w.date}:intake:${id}`);
    const count = rng.int(3, 6);
    const fresh: PlayerState[] = [];
    for (let n = 0; n < count; n++) {
      const ps = makeYouth(w, id, 100 + n, rng, 17);
      w.players[ps.player.id] = ps;
      ids.push(ps.player.id);
      fresh.push(ps);
    }
    if (id === w.manager?.clubId) {
      const gems = fresh.filter((ps) => (ps.player.potentialAbility ?? 0) >= 140).length;
      const verdict =
        gems >= 2 ? `Il est enthousiaste : ${gems} joueurs ont un potentiel de très haut niveau.`
        : gems === 1 ? "Un joueur sort du lot et pourrait devenir un joueur important."
        : "Une promotion correcte, sans pépite évidente.";
      w.news.push({ date: w.date, topic: "academy", clubs: [id], text: `Journée des espoirs : ${count} jeunes rejoignent le centre de formation. ${verdict}`, importance: 2 });
    }
  }
}

/** Promotes an academy player to the professional squad. */
export function promoteYouth(w: World, playerId: string): string | null {
  const m = w.manager;
  const ps = w.players[playerId];
  const list = m ? w.academies?.[m.clubId] : undefined;
  if (!m || !ps || !list?.includes(playerId)) return "Ce joueur n'est pas dans votre centre de formation.";
  list.splice(list.indexOf(playerId), 1);
  delete ps.academy;
  (w.squads[m.clubId] ??= []).push(playerId);
  // First professional contract: three seasons on the league's scale for his level.
  const league = w.clubs[m.clubId]!.league;
  ps.contract = { clubId: m.clubId, salary: marketSalary(ps, league, w.date), expires: seasonEndYear(w) + 3, estimated: false, status: "prospect" };
  humanOf(w, ps).status = "prospect";
  ps.human!.morale = Math.min(100, ps.human!.morale + 12);
  w.news.push({ date: w.date, topic: "academy", clubs: [m.clubId], text: `${ps.player.firstName} ${ps.player.lastName} (${ageOn(ps.player.birthDate, w.date)} ans) intègre l'effectif professionnel.`, importance: 1 });
  return null;
}

/** Releases an academy player (he leaves the game). */
export function releaseYouth(w: World, playerId: string): string | null {
  const m = w.manager;
  const list = m ? w.academies?.[m.clubId] : undefined;
  if (!m || !list?.includes(playerId)) return "Ce joueur n'est pas dans votre centre de formation.";
  list.splice(list.indexOf(playerId), 1);
  delete w.players[playerId];
  return null;
}
