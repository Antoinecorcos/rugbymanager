/** Builds the initial world (1 July) from clubs, squads and the season calendar. */
import type { Player } from "../domain/player.js";
import type { SeasonCalendar } from "./calendar.js";
import { COMPETITION_INFO } from "./competitions.js";
import { buildNationPools, newPlayerState } from "./nations.js";
import type { CompetitionState, Fixture, World, WorldClub } from "./types.js";

export interface WorldSetup {
  seed: string;
  calendar: SeasonCalendar;
  clubs: (WorldClub & { squad: { player: Player; caps: number }[] })[];
}

export function createWorld(setup: WorldSetup): World {
  const cal = setup.calendar;
  const w: World = {
    seed: setup.seed,
    season: cal.season,
    date: cal.start,
    calendar: cal,
    clubs: {},
    players: {},
    squads: {},
    nationPools: {},
    competitions: {},
    fixtures: [],
    news: [],
  };
  for (const c of setup.clubs) {
    const { squad, ...club } = c;
    w.clubs[c.id] = club;
    w.squads[c.id] = squad.map((e) => e.player.id);
    for (const e of squad) w.players[e.player.id] = newPlayerState(e.player, c.id, e.caps);
  }

  const competition = (id: string, kind: CompetitionState["kind"], teams: string[], knockout: Record<string, string>, groups?: string[][]): CompetitionState => {
    const info = COMPETITION_INFO[id] ?? { name: id, bonus: { offensive: "tries4", defensiveMargin: 7 } as const };
    const c: CompetitionState = { id, name: info.name, kind, teams, bonus: info.bonus, knockout, generatedStages: [] };
    if (groups) c.groups = groups;
    w.competitions[id] = c;
    return c;
  };
  const push = (f: Fixture) => w.fixtures.push(f);

  for (const l of cal.leagues) {
    const teams = [...new Set(l.rounds.flatMap((r) => r.matches.flatMap((m) => [m.home, m.away])))].sort();
    competition(l.id, "league", teams, l.knockout);
    for (const r of l.rounds) for (const m of r.matches) push({ id: `${l.id}:J${r.round}:${m.home}-${m.away}`, competitionId: l.id, stage: `J${r.round}`, ...m });
  }
  for (const cup of cal.cups) {
    competition(cup.id, "cup", cup.pools.flat(), cup.knockout, cup.pools);
    for (const r of cup.rounds)
      for (const m of r.matches) {
        const pool = cup.pools.findIndex((p) => p.includes(m.home)) + 1;
        push({ id: `${cup.id}:poule-${pool}-J${r.round}:${m.home}-${m.away}`, competitionId: cup.id, stage: `poule-${pool}-J${r.round}`, ...m });
      }
  }
  for (const i of cal.internationals) {
    competition(i.id, "international", i.groups.flat(), {}, i.groups);
    for (const r of i.rounds) for (const m of r.matches) push({ id: `${i.id}:J${r.round}:${m.home}-${m.away}`, competitionId: i.id, stage: `J${r.round}`, ...m });
  }

  // Every club fixture must reference a known club.
  for (const f of w.fixtures) {
    if (w.competitions[f.competitionId]!.kind === "international") continue;
    for (const t of [f.home, f.away]) if (!w.clubs[t]) throw new Error(`Fixture ${f.id}: unknown club "${t}"`);
  }
  buildNationPools(w, [...new Set(cal.internationals.flatMap((i) => i.groups.flat()))], setup.seed);
  w.fixtures.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return w;
}
