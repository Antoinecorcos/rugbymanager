import { describe, expect, it } from "vitest";
import { Rng } from "../src/index.js";

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng("seed");
    const b = new Rng("seed");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("differs between seeds", () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it("produces values in [0,1) with a sane mean", () => {
    const r = new Rng("mean");
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });

  it("int() is inclusive and weighted() respects weights", () => {
    const r = new Rng("int");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    let a = 0;
    for (let i = 0; i < 5000; i++) if (r.weighted([["a", 3], ["b", 1]] as const) === "a") a++;
    expect(a / 5000).toBeGreaterThan(0.7);
    expect(a / 5000).toBeLessThan(0.8);
  });
});
