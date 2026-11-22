/** Builds the game world (engine) from the bundled database and the season calendar. */
import { createWorld, type PlayerProfile, type SeasonCalendar, type World } from "@ovalie/engine";
import type { ClubDatabase, SquadEntry } from "./schemas.js";

/** Facts shown by the interface (fiche joueur): JIFF, origin, explainable rating. */
function profileOf(e: SquadEntry): PlayerProfile {
  const p: PlayerProfile = {};
  if (e.shirtNumber) p.shirtNumber = e.shirtNumber;
  if (e.contract.jiff !== undefined) p.jiff = e.contract.jiff;
  if (e.info?.estimated.includes("jiff")) p.jiffEstimated = true;
  if (e.info?.estimated.length) p.estimated = e.info.estimated;
  if (e.info?.homegrown) p.homegrown = true;
  if (e.info?.previousClub) p.previousClub = e.info.previousClub;
  if (e.info?.arrivalYear) p.arrivalYear = e.info.arrivalYear;
  if (e.info?.generated) p.generated = true;
  if (e.info?.rating) p.rating = Object.fromEntries(Object.entries(e.info.rating).filter((x): x is [string, number] => typeof x[1] === "number"));
  return p;
}

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
      colors: d.club.colors,
      ...(d.club.city ? { city: d.club.city } : {}),
      capacity: d.club.stadium.capacity,
      ...(d.club.budgetEur ? { budgetEur: d.club.budgetEur } : {}),
      ...(d.club.president ? { president: d.club.president } : {}),
      ...(d.club.headCoach ? { headCoach: d.club.headCoach } : {}),
      ...(d.club.founded ? { founded: d.club.founded } : {}),
      ...(d.club.previousRank ? { previousRank: d.club.previousRank } : {}),
      squad: d.squad.map((e) => ({ player: e.player, caps: e.info?.caps ?? 0, profile: profileOf(e) })),
    })),
  });
}
