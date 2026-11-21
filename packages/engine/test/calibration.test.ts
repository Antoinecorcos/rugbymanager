import { describe, expect, it } from "vitest";
import { runCalibration, TARGETS } from "../src/match/calibration.js";

describe("calibration against Top 14 averages", () => {
  const report = runCalibration(400, "ci-calibration");
  for (const [key, target] of Object.entries(TARGETS)) {
    it(`${target.label} within [${target.min}, ${target.max}]`, () => {
      const v = report[key as keyof typeof TARGETS];
      expect(v).toBeGreaterThanOrEqual(target.min);
      expect(v).toBeLessThanOrEqual(target.max);
    });
  }
});
