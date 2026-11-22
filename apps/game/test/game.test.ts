import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readCalendar, readDatabase } from "@ovalie/data/node";
import { applyPatch, buildCatalogue, continueWithProgress, newCareer, playToday, saveInfoOf } from "../src/game/session";
import { clubAccent, contrast, levelStars, ordinal, stageFr } from "../src/game/format";
import { readSave, readSaveInfo, writeSave, deleteSave } from "../src/worker/save";

const db = readDatabase();
const calendar = readCalendar();
const PROFILE = { name: "Test", nationality: "FRA", start: "bigClub" as const };

describe("new game", () => {
  it("offers the Top 14, Pro D2 and Nationale clubs", () => {
    const cat = buildCatalogue(db);
    const count = (l: string) => cat.filter((c) => c.league === l).length;
    expect([count("TOP14"), count("PROD2"), count("NATIONALE")]).toEqual([14, 16, 14]);
    const toulouse = cat.find((c) => c.id === "toulouse")!;
    expect(toulouse.strength).toBeGreaterThan(cat.find((c) => c.id === "albi")!.strength);
  });

  it("gives every playable club a readable accent colour (≥ 3:1 on the dark surface)", () => {
    for (const c of buildCatalogue(db)) {
      const { accent, ink } = clubAccent(c.colors);
      expect(contrast(accent, "#161a20"), c.name).toBeGreaterThanOrEqual(3);
      expect(contrast(accent, ink), c.name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("career session", () => {
  it("continues to the first match day, plays it and keeps a report", () => {
    const w = newCareer(db, calendar, PROFILE, "toulouse", "test-session");
    expect(w.manager!.clubId).toBe("toulouse");
    expect(w.players["antoine-dupont"]?.profile?.rating?.level).toBeGreaterThan(15);
    expect(w.clubs.toulouse!.colors).toBeDefined();
    let stop = continueWithProgress(w, () => {});
    // Call-ups in July interrupt "Continuer" (news); keep going until the match day.
    let days = 0;
    while (stop.reason !== "matchDay" && days < 200) {
      days += stop.days;
      stop = continueWithProgress(w, () => {});
    }
    expect(stop.reason).toBe("matchDay");
    expect(w.date).toBe("2026-09-06");
    applyPatch(w, { selection: { ...w.manager!.selection, bench: "6-2" } });
    const id = playToday(w)!;
    expect(w.reports![id]!.teams.find((t) => t.id === "toulouse")!.lineup.slice(15).length).toBe(8);
    expect(saveInfoOf(w)).toMatchObject({ clubName: "Stade toulousain", date: "2026-09-07" });
  });

  it("reports progress day by day and stops after maxDays", () => {
    const w = newCareer(db, calendar, PROFILE, "albi", "progress");
    const seen: string[] = [];
    // Stops at the 5-day limit, or earlier on club news (summer call-ups).
    const r = continueWithProgress(w, (d) => seen.push(d), 5);
    expect(r.reason === "limit" || r.reason === "news").toBe(true);
    // The day that stops "Continuer" is not reported as progress.
    expect(seen.length).toBe(r.reason === "limit" ? r.days : r.days - 1);
  });
});

describe("autosave", () => {
  it("writes, reads and deletes the save slot", async () => {
    const w = newCareer(db, calendar, PROFILE, "pau", "save");
    await writeSave(saveInfoOf(w)!, w);
    expect((await readSaveInfo())?.clubName).toBe("Section paloise");
    expect((await readSave())!.world.manager!.clubId).toBe("pau");
    await deleteSave();
    expect(await readSaveInfo()).toBeNull();
  });
});

describe("labels", () => {
  it("formats stages, ordinals and stars", () => {
    expect(stageFr("J1")).toBe("1re journée");
    expect(stageFr("J12")).toBe("12e journée");
    expect(stageFr("poule-2-J3")).toBe("Poule 2 · J3");
    expect(stageFr("demi")).toBe("Demi-finale");
    expect([ordinal(1), ordinal(13)]).toEqual(["1er", "13e"]);
    expect(levelStars(17)).toBe(5);
    expect(levelStars(8)).toBe(0.5);
    expect(levelStars(13)).toBe(3);
  });
});
