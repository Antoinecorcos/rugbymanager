import { describe, expect, it } from "vitest";
import { assign, nameScore } from "../scripts/import/match.js";
import { splitLnrName } from "../scripts/import/lnr.js";
import { parseWikiDate, parseWikiTable, titleCaseSurname } from "../scripts/import/text.js";
import { parseClubSquad, parsePlayerInfobox } from "../scripts/import/wikipedia-fr.js";
import { ageAdjustment, clubLevel, internationalBonus, seasonUsage, type LevelContext } from "../src/rating/level.js";
import { resolvePositions } from "../src/rating/positions.js";
import type { CareerSeason } from "../src/raw.js";

describe("import: text helpers", () => {
  it("parses French Wikipedia date templates", () => {
    expect(parseWikiDate("{{date|15|9|1993|en rugby à XV|âge=oui}}")).toBe("1993-09-15");
    expect(parseWikiDate("{{date|1er|septembre|2006}}")).toBe("2006-09-01");
    expect(parseWikiDate("{{date|19 août 2006|en rugby à XV|âge=oui}}")).toBe("2006-08-19");
    expect(parseWikiDate("?")).toBeUndefined();
  });

  it("title-cases LNR surnames", () => {
    expect(titleCaseSurname("DE LA FUENTE")).toBe("de la Fuente");
    expect(titleCaseSurname("O'CONNOR")).toBe("O'Connor");
    expect(titleCaseSurname("MCLEOD")).toBe("McLeod");
    expect(titleCaseSurname("COLOMBE-REAZEL")).toBe("Colombe-Reazel");
    expect(splitLnrName("Malachi Shea HAWKES FAIMANIFO")).toEqual({ firstName: "Malachi Shea", lastName: "Hawkes Faimanifo" });
  });

  it("splits wikitables with inline and multi-line cells", () => {
    const rows = parseWikiTable(`{| class="wikitable"
! Nom !! Naissance
|-
! colspan="2" | [[Pilier (rugby à XV)|Piliers]]
|-
| [[A B|Ab]] || {{date|1|2|2000}}
|-
|[[C D]]
|{{date|3|4|1999}}
|}`);
    expect(rows.map((r) => r.cells.length)).toEqual([2, 1, 2, 2]);
    expect(rows[2]!.cells[0]).toBe("[[A B|Ab]]");
  });
});

describe("import: Wikipedia squads", () => {
  const page = `== Effectif 2026-2027 ==
{|class="wikitable sortable"
! style="background-color:#FF0000;color:#000000;" | Nom
! Naissance
! Nationalité sportive
! Sélections (points)
! Club précédent
! Arrivée au club
|-
! colspan="6"| [[Pilier (rugby à XV)|Piliers]]
|-
| [[Cyril Baille]] || {{date|15|9|1993|en rugby à XV|âge=oui}} || {{FRA}} || [[Équipe de France de rugby à XV|56 (25)]] || Formé au club || 2012
|-
| [[Tomás Rapetti]] || {{date|4|3|2005}} || {{ARG}} || {{ARG-d}} || {{ARG-d}} [[Pampas (rugby à XV)|Pampas]] || 2025
|}`;
  it("reads the current squad table", () => {
    const sq = parseClubSquad(page);
    expect(sq).toHaveLength(2);
    expect(sq[0]).toMatchObject({ name: "Cyril Baille", birthDate: "1993-09-15", nationality: "FRA", caps: 56, homegrown: true, sectionLabel: "Piliers" });
    expect(sq[1]).toMatchObject({ nationality: "ARG", capped: true, previousClub: "Pampas", arrivalYear: 2025 });
  });

  it("reads the player infobox", () => {
    const box = parsePlayerInfobox(`{{Infobox Rugbyman
 | taille = {{taille|m=1.82}}
 | poids = 113 kg
 | position (rugby à XV) = [[Pilier (rugby à XV)|Pilier gauche]]
 | équipe nationale = {{France -20 rugby}} <br />{{France rugby}}
 | matchs points nationale = 10 (0)<br />57 (25)
}}`);
    expect(box).toMatchObject({ heightCm: 182, weightKg: 113, position: "Pilier gauche", caps: 57 });
  });
});

describe("import: name matching", () => {
  it("matches legal names with usual names", () => {
    expect(nameScore("Joel Merkler Perez", "Joel Merkler")).toBeGreaterThanOrEqual(80);
    expect(nameScore("Antoine Dupont", "Antoine Dupont")).toBe(100);
    expect(nameScore("Antoine Dupont", "Thomas Ramos")).toBe(0);
  });

  it("uses birth years to accept a different first name and to reject homonyms", () => {
    const m = assign(
      [{ name: "Daniel Tupou", birthYear: 1996 }, { name: "Thomas Martin", birthYear: 2004 }],
      [{ name: "Taniela Tupou", birthYear: 1996 }, { name: "Thomas Martin", birthYear: 1990 }],
    );
    expect(m.get(0)).toBe(0);
    expect(m.has(1)).toBe(false);
  });
});

describe("rating: positions", () => {
  it("uses hints inside the league position group", () => {
    expect(resolvePositions({ positionGroup: "1ère ligne", positionHints: ["Pilier gauche", "Piliers"], weightKg: 118 }).primary).toBe("LH");
    expect(resolvePositions({ positionGroup: "1ère ligne", positionHints: ["Talonneurs"], weightKg: 110 }).primary).toBe("HK");
    const fb = resolvePositions({ positionGroup: "Arrière", positionHints: ["Arrière, demi d'ouverture"] });
    expect(fb.primary).toBe("FB");
    expect(fb.familiarity.FH).toBeGreaterThanOrEqual(13);
  });

  it("falls back on morphology for props and centres", () => {
    expect(resolvePositions({ positionGroup: "1ère ligne", positionHints: ["Piliers"], weightKg: 128 }).primary).toBe("TH");
    expect(resolvePositions({ positionGroup: "Centre", positionHints: [], weightKg: 102 }).primary).toBe("IC");
  });
});

describe("rating: level", () => {
  const ctx: LevelContext = { league: "TOP14", clubBudgetZ: 0, season: "2026-2027", roundsSoFar: { "TOP 14": 10 }, referenceDate: "2026-11-21" };
  const row = (season: string, matches: number, minutes: number, competition = "TOP 14"): CareerSeason => ({
    season, competition, club: "X", matches, minutes, points: 0, tries: 0, penalties: 0, drops: 0, yellowCards: 0, redCards: 0,
  });

  it("rewards regular starters over fringe players", () => {
    const starter = clubLevel([row("2025-2026", 24, 1700), row("2024-2025", 22, 1500), row("2026-2027", 9, 650)], ctx)!;
    const fringe = clubLevel([row("2025-2026", 5, 120), row("2026-2027", 1, 20)], ctx)!;
    expect(starter.level).toBeGreaterThan(fringe.level + 1.5);
    expect(starter.evidence).toBeGreaterThan(fringe.evidence);
  });

  it("does not mistake internationals (few but full club games) for fringe players", () => {
    expect(seasonUsage(row("2025-2026", 10, 700), 26)).toBeGreaterThan(0.5);
  });

  it("values Pro D2 minutes below Top 14 minutes", () => {
    const top = clubLevel([row("2025-2026", 24, 1700)], ctx)!;
    const pro = clubLevel([row("2025-2026", 28, 2000, "PRO D2")], ctx)!;
    expect(top.level).toBeGreaterThan(pro.level + 1);
  });

  it("weights caps by nation tier and handles age", () => {
    expect(internationalBonus({ caps: 50, nationality: "FRA" })).toBeGreaterThan(internationalBonus({ caps: 50, nationality: "POR" }));
    expect(internationalBonus({ nationality: "FRA" })).toBe(0);
    expect(ageAdjustment(19, "TH")).toBeLessThan(ageAdjustment(19, "SH"));
    expect(ageAdjustment(27, "FH")).toBe(0);
    expect(ageAdjustment(35, "WG")).toBeLessThan(0);
  });
});
