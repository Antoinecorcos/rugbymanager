import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readCalendar, readDatabase } from "@ovalie/data/node";
import { applyPatch, buildCatalogue, continueWithProgress, newCareer, playToday, saveInfoOf } from "../src/game/session";
import { clubAccent, contrast, levelStars, ordinal, stageFr } from "../src/game/format";
import { decodeSaveFile, deleteSave, encodeSaveFile, LEGACY_SLOT, listSaves, readSave, writeSave } from "../src/worker/save";

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
    expect(saveInfoOf(w, "x")).toMatchObject({ slot: "x", kind: "auto", clubName: "Stade toulousain", date: "2026-09-07", season: "2026-2027" });
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

describe("save games", () => {
  it("migrates the single autosave of version 1 into a slot", async () => {
    await new Promise((r) => {
      const del = indexedDB.deleteDatabase("ovalie-manager");
      del.onsuccess = del.onerror = r;
    });
    const w = newCareer(db, calendar, PROFILE, "albi", "legacy");
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("ovalie-manager", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("saves");
      req.onsuccess = () => {
        const t = req.result.transaction("saves", "readwrite");
        t.objectStore("saves").put({ info: { clubName: "SC Albi", managerName: "Test", date: w.date, savedAt: "2026-11-01T10:00:00Z" }, world: w }, "autosave");
        t.oncomplete = () => (req.result.close(), resolve());
        t.onerror = () => reject(t.error);
      };
    });
    const saves = await listSaves();
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ slot: LEGACY_SLOT, kind: "auto", clubName: "SC Albi" });
    expect((await readSave(LEGACY_SLOT))!.world.manager!.clubId).toBe("albi");
    await deleteSave(LEGACY_SLOT);
  });

  it("keeps several slots, most recent first, and deletes one", async () => {
    const pau = newCareer(db, calendar, PROFILE, "pau", "save");
    const albi = newCareer(db, calendar, { ...PROFILE, start: "noDiploma" }, "albi", "save");
    await writeSave({ ...saveInfoOf(pau, "carriere-1")!, savedAt: "2026-11-01T10:00:00Z" }, pau);
    await writeSave({ ...saveInfoOf(albi, "copie-2", "manual", "Avant la finale")!, savedAt: "2026-11-02T10:00:00Z" }, albi);
    const saves = await listSaves();
    expect(saves.map((x) => x.slot)).toEqual(["copie-2", "carriere-1"]);
    expect(saves[0]).toMatchObject({ kind: "manual", name: "Avant la finale", clubName: "SC Albi" });
    expect((await readSave("carriere-1"))!.world.manager!.clubId).toBe("pau");
    await deleteSave("copie-2");
    expect((await listSaves()).map((x) => x.slot)).toEqual(["carriere-1"]);
    await deleteSave("carriere-1");
  });

  it("exports a compressed file and reads it back, refusing other files", async () => {
    const w = newCareer(db, calendar, PROFILE, "toulouse", "file");
    const data = await encodeSaveFile(saveInfoOf(w, "s")!, w);
    const json = JSON.stringify(w).length;
    expect(data.byteLength).toBeLessThan(json / 4);
    const back = await decodeSaveFile(data);
    expect(back.world.manager!.clubId).toBe("toulouse");
    expect(back.world.players["antoine-dupont"]!.contract!.salary).toBe(w.players["antoine-dupont"]!.contract!.salary);
    await expect(decodeSaveFile(new TextEncoder().encode("{}").buffer as ArrayBuffer)).rejects.toThrow(/pas une sauvegarde/);
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
