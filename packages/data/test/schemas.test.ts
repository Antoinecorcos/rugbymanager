import { generatePlayer, POSITIONS, Rng } from "@ovalie/engine";
import { describe, expect, it } from "vitest";
import { clubSchema, playerSchema } from "../src/index.js";

describe("schemas", () => {
  it("accepts every generated player", () => {
    const rng = new Rng("schema");
    for (const position of POSITIONS) {
      for (let i = 0; i < 20; i++) {
        const p = generatePlayer(rng, { position, level: 8 + i * 0.5 });
        const res = playerSchema.safeParse(p);
        if (!res.success) throw new Error(JSON.stringify(res.error.issues));
      }
    }
  });

  it("rejects out-of-range attributes", () => {
    const p = generatePlayer(new Rng("bad"), { position: "FH", level: 13 });
    p.attributes.passing = 25;
    expect(playerSchema.safeParse(p).success).toBe(false);
  });

  it("validates a club", () => {
    const club = {
      id: "demo",
      name: "Club Démo",
      shortName: "DEM",
      country: "FRA",
      league: "TOP14",
      colors: ["#c8102e", "#000000"],
      stadium: { name: "Stade Démo", city: "Démo", capacity: 18000 },
      reputation: 120,
    };
    expect(clubSchema.parse(club).honours).toEqual([]);
  });
});
