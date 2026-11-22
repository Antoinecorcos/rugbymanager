/** Builds the game world (engine) from the bundled database and the season calendar. */
import { createWorld, type SeasonCalendar, type World } from "@ovalie/engine";
import type { ClubDatabase } from "./schemas.js";

export function worldFromDatabase(db: ClubDatabase[], calendar: SeasonCalendar, seed: string): World {
  return createWorld({
    seed,
    calendar,
    clubs: db.map((d) => ({
      id: d.club.id,
      name: d.club.name,
      shortName: d.club.shortName,
      league: d.club.league,
      country: d.club.country,
      reputation: d.club.reputation,
      stadium: d.club.stadium.name,
      squad: d.squad.map((e) => ({ player: e.player, caps: e.info?.caps ?? 0 })),
    })),
  });
}
