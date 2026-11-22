/** Read-only views of the world for the screens. */
import { NATION_NAME_FR, nextFixture, type Fixture, type ManagerState, type NewsItem, type World } from "@ovalie/engine";
import { COMPETITION_SHORT } from "./format";

export const manager = (w: World): ManagerState => w.manager!;
export const myClubId = (w: World): string => w.manager!.clubId;
export const myClub = (w: World) => w.clubs[w.manager!.clubId]!;

export const teamName = (w: World, id: string): string => w.clubs[id]?.name ?? NATION_NAME_FR[id] ?? id;
export const teamShort = (w: World, id: string): string => w.clubs[id]?.shortName ?? id;
export const competitionName = (w: World, id: string): string => w.competitions[id]?.name ?? id;
export const competitionShort = (id: string): string => COMPETITION_SHORT[id] ?? id;

export const myFixtures = (w: World): Fixture[] => {
  const id = myClubId(w);
  return w.fixtures.filter((f) => f.home === id || f.away === id);
};
export const myNextFixture = (w: World): Fixture | undefined => nextFixture(w, myClubId(w));
export const isMatchToday = (w: World): Fixture | undefined => {
  const f = myNextFixture(w);
  return f && f.date === w.date ? f : undefined;
};

export interface FixtureView {
  fixture: Fixture;
  home: boolean;
  opponent: string;
  /** Our score first. */
  score?: [number, number];
  outcome?: "V" | "N" | "D";
}

export function viewOf(w: World, f: Fixture, clubId = myClubId(w)): FixtureView {
  const home = f.home === clubId;
  const v: FixtureView = { fixture: f, home, opponent: home ? f.away : f.home };
  if (f.result) {
    const s = home ? 0 : 1;
    v.score = [f.result.score[s], f.result.score[1 - s]!];
    v.outcome = f.result.winner === null ? "N" : f.result.winner === s ? "V" : "D";
  }
  return v;
}

/** "D" home, "E" away, "N" neutral. */
export const venueLetter = (v: FixtureView): string => (v.fixture.neutral ? "N" : v.home ? "D" : "E");
export const venueLabel = (v: FixtureView): string => (v.fixture.neutral ? "Terrain neutre" : v.home ? "Domicile" : "Extérieur");

/** News of the manager's club (inbox) and the big stories of the rugby world. */
export const inboxItems = (w: World): { item: NewsItem; index: number }[] => {
  const id = myClubId(w);
  return w.news.map((item, index) => ({ item, index })).filter(({ item }) => item.clubs.includes(id) || item.importance === 3);
};
export const unreadCount = (w: World): number => inboxItems(w).filter(({ index }) => index >= manager(w).newsRead).length;

/** League of the manager's club as competition id. */
export const myLeagueId = (w: World): string => myClub(w).league.toLowerCase();

/** Squad player states of a club. */
export const squadOf = (w: World, clubId: string) => (w.squads[clubId] ?? []).map((id) => w.players[id]!).filter(Boolean);
