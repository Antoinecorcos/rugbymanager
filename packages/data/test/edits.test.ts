import { describe, expect, it } from "vitest";
import { editClub, editPlayer, editsAsOverrides } from "@ovalie/engine";
import { editsFileSchema, mergeEdits } from "../src/edits.js";
import { readCalendar, readDatabase } from "../src/io.js";
import { worldFromDatabase } from "../src/world.js";

describe("editor corrections → overrides", () => {
  it("exports corrections the override schemas accept, and merges them field by field", () => {
    const w = worldFromDatabase(readDatabase(), readCalendar(), "edits");
    expect(editPlayer(w, "antoine-dupont", { level: 17.2, heightCm: 175 })).toBeNull();
    expect(editClub(w, "toulouse", { reputation: 180, colors: ["#e30613", "#000000"] })).toBeNull();
    const file = { format: "ovalie-manager-corrections", ...editsAsOverrides(w) };
    const parsed = editsFileSchema.parse(file);
    expect(parsed.players["antoine-dupont"]).toMatchObject({ level: 17.2, heightCm: 175 });
    expect(parsed.clubs.toulouse).toMatchObject({ reputation: 180 });
    const merged = mergeEdits({ $comment: "x", "antoine-dupont": { level: 16.6, note: "Meilleur joueur du monde 2021" } }, parsed.players);
    expect(merged.$comment).toBe("x");
    expect(merged["antoine-dupont"]).toMatchObject({ level: 17.2, heightCm: 175 });
  });
});
