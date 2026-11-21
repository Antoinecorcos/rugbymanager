/**
 * Imports the real Top 14 and Pro D2 squads (season 2026-2027) into packages/data/raw/fr/.
 *
 * Sources:
 *  - official LNR websites (top14.lnr.fr / prod2.lnr.fr): squad list, height, weight, age,
 *    nationality, league career statistics; club president, stadium, capacity;
 *  - fr.wikipedia.org: birth dates, sporting nationality, caps, previous club, homegrown status,
 *    detailed positions (infobox), budgets, last season's ranking, head coach, club colours.
 *
 * Usage: pnpm --filter @ovalie/data import:fr [--refresh]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serialiseRawSquad } from "../../src/io.js";
import { rawSquadSchema, type RawClub, type RawPlayer, type RawSquad } from "../../src/raw.js";
import { FR_CLUBS } from "./clubs-fr.js";
import { mapLimit } from "./http.js";
import { clubInfo, player as lnrPlayer, squad as lnrSquad, type LnrPlayer, type LnrSquadEntry } from "./lnr.js";
import { assign } from "./match.js";
import { nameKey, slugify } from "./text.js";
import { parseClubSquad, parseParticipants, parsePlayerInfobox, squadColors, wikitext, wikitexts, type SeasonParticipant, type WikiSquadPlayer } from "./wikipedia-fr.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "raw/fr");
const SEASON = "2026-2027";
const TODAY = new Date().toISOString().slice(0, 10);
/** Reference date used to turn a published age into an approximate birth date. */
const AGE_REFERENCE = new Date(TODAY);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const participants = new Map<string, SeasonParticipant>();
  for (const title of [`Championnat de France de rugby à XV ${SEASON}`, `Championnat de France de rugby à XV de 2e division ${SEASON}`]) {
    for (const p of parseParticipants((await wikitext(title)) ?? "")) participants.set(p.article, p);
  }
  const clubPages = await wikitexts(FR_CLUBS.map((c) => c.wiki));
  const usedIds = new Set<string>();
  const summary: string[] = [];

  for (const ref of FR_CLUBS) {
    const info = await clubInfo(ref.site, ref.slug);
    const part = participants.get(ref.wiki);
    const page = clubPages.get(ref.wiki);
    if (!page) console.warn(`! no Wikipedia page for ${ref.wiki}`);
    const wikiSquad = page ? parseClubSquad(page.text, SEASON) : [];
    const lnr = await lnrSquad(ref.site, ref.slug);
    const details = await mapLimit(lnr, 4, (e) => lnrPlayer(e.url));

    // --- match LNR (legal names) with Wikipedia (usual names)
    const pairs = assign(
      lnr.map((e, i) => ({ name: `${details[i]!.firstName} ${details[i]!.lastName}`, birthYear: details[i]!.age ? AGE_REFERENCE.getFullYear() - details[i]!.age! : undefined })),
      wikiSquad.map((w) => ({ name: w.name, birthYear: w.birthDate ? Number(w.birthDate.slice(0, 4)) : undefined })),
    );
    // Allow a 1-year slack: the age reference may straddle the birthday.
    const infoboxTitles = [...pairs.values()].map((j) => wikiSquad[j]!.article).filter((t): t is string => !!t);
    const infoboxes = await wikitexts(infoboxTitles);

    const players: RawPlayer[] = lnr.map((entry, i) => {
      const d = details[i]!;
      const j = pairs.get(i);
      const w = j !== undefined ? wikiSquad[j] : undefined;
      const ib = w?.article ? infoboxes.get(w.article) : undefined;
      const box = ib ? parsePlayerInfobox(ib.text) : {};
      return buildPlayer(entry, d, w, box, ib?.title, ib?.qid, usedIds);
    });

    const club: RawClub = {
      id: ref.slug,
      name: ref.name,
      shortName: ref.shortName,
      league: ref.site === "top14" ? "TOP14" : "PROD2",
      country: "FRA",
      city: ref.city,
      stadium: {
        name: info.stadiumName ?? part?.stadium ?? "?",
        city: ref.city,
        capacity: info.stadiumCapacity ?? part?.capacity,
      },
      founded: info.founded,
      president: info.president,
      headCoach: part?.headCoach,
      budgetEur: part?.budgetEur,
      previousRank: part?.previousRank,
      colors: page ? squadColors(page.text, SEASON) : undefined,
      sources: { lnr: `https://${ref.site}.lnr.fr/club/${ref.slug}`, wikipedia: ref.wiki },
    };
    const squad: RawSquad = rawSquadSchema.parse({ club, importedAt: TODAY, players });
    writeFileSync(join(OUT, `${ref.slug}.json`), serialiseRawSquad(squad));

    const matched = pairs.size;
    const unmatchedWiki = wikiSquad.filter((_, j) => ![...pairs.values()].includes(j)).map((w) => w.name);
    const line = `${ref.slug.padEnd(16)} LNR ${String(lnr.length).padStart(2)} | wiki ${String(wikiSquad.length).padStart(2)} | appariés ${String(matched).padStart(2)} | taille ${players.filter((p) => p.heightCm).length} poids ${players.filter((p) => p.weightKg).length} naissance ${players.filter((p) => p.birthDate).length}${unmatchedWiki.length ? ` | wiki seuls: ${unmatchedWiki.join(", ")}` : ""}`;
    console.log(line);
    summary.push(line);
  }
  writeFileSync(join(OUT, "_import-report.txt"), `Import ${TODAY}\n\n${summary.join("\n")}\n`);
}

function buildPlayer(
  entry: LnrSquadEntry,
  d: LnrPlayer,
  w: WikiSquadPlayer | undefined,
  box: ReturnType<typeof parsePlayerInfobox>,
  wikiTitle: string | undefined,
  qid: string | undefined,
  usedIds: Set<string>,
): RawPlayer {
  // Usual name: Wikipedia's when matched (LNR publishes full legal names).
  let firstName = d.firstName;
  let lastName = d.lastName;
  if (w) {
    const words = w.name.split(" ");
    let k = 1;
    for (let n = 1; n < words.length; n++) if (nameKey(words.slice(0, n).join(" ")) === nameKey(d.firstName)) k = n;
    firstName = words.slice(0, k).join(" ");
    lastName = words.slice(k).join(" ") || d.lastName;
  }
  let id = slugify(`${firstName} ${lastName}`);
  for (let n = 2; usedIds.has(id); n++) id = `${slugify(`${firstName} ${lastName}`)}-${n}`;
  usedIds.add(id);

  const hints = [box.position, w?.sectionLabel, d.position].filter((x): x is string => !!x && x.length > 0);
  const p: RawPlayer = {
    id,
    firstName,
    lastName,
    birthDate: w?.birthDate ?? box.birthDate,
    age: d.age,
    nationality: w?.nationality ?? d.nationality ?? "FRA",
    heightCm: d.heightCm ?? box.heightCm,
    weightKg: d.weightKg ?? box.weightKg,
    positionGroup: entry.positionGroup,
    positionHints: [...new Set(hints)],
    caps: w?.caps ?? box.caps,
    capped: w?.capped || (w?.caps ?? box.caps ?? 0) > 0 || undefined,
    sevens: w?.sevens,
    homegrown: w?.homegrown,
    jiff: w?.jiff,
    contractUntil: w?.contractUntil,
    previousClub: w?.previousClub,
    arrivalYear: w?.arrivalYear,
    backFromLoan: w?.onLoan || undefined,
    career: d.career,
    sources: { lnr: entry.url, wikipedia: wikiTitle, wikidata: qid },
  };
  // Drop undefined keys for compact, stable JSON.
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as RawPlayer;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
