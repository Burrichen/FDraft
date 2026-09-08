import { describe, expect, it } from "vitest";
import {
  createDefaultChristmasSplit,
  isValidChristmasSplit,
  setAdjacentCount,
  setClassicCount,
} from "./christmas-split";
import { CREATABLE_DIFFICULTY_ORDER, DIFFICULTIES } from "./difficulty";

/** Every fixed-size difficulty's real film count, straight from the shared config. */
const FIXED_DIFFICULTY_COUNTS = CREATABLE_DIFFICULTY_ORDER.map(
  (id) => DIFFICULTIES[id].filmCount,
).filter((count): count is number => count !== null);

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES +
 * VISUAL POLISH" §4 — "Their total must equal selected difficulty."
 */
describe("christmas-split", () => {
  it("always sums to the selected difficulty's real film count, for every fixed difficulty", () => {
    expect(FIXED_DIFFICULTY_COUNTS.length).toBeGreaterThanOrEqual(5);
    for (const total of FIXED_DIFFICULTY_COUNTS) {
      const split = createDefaultChristmasSplit(total);
      expect(split.classicCount + split.adjacentCount).toBe(total);
      expect(isValidChristmasSplit(total, split)).toBe(true);
    }
  });

  it("keeps the total no matter which slider moves, across its whole range", () => {
    for (const total of FIXED_DIFFICULTY_COUNTS) {
      for (let value = 0; value <= total; value++) {
        const byClassic = setClassicCount(total, value);
        expect(byClassic.classicCount).toBe(value);
        expect(byClassic.classicCount + byClassic.adjacentCount).toBe(total);

        const byAdjacent = setAdjacentCount(total, value);
        expect(byAdjacent.adjacentCount).toBe(value);
        expect(byAdjacent.classicCount + byAdjacent.adjacentCount).toBe(total);
      }
    }
  });

  it("clamps a request beyond either end rather than producing an invalid total", () => {
    expect(setClassicCount(10, 99)).toEqual({
      classicCount: 10,
      adjacentCount: 0,
    });
    expect(setClassicCount(10, -5)).toEqual({
      classicCount: 0,
      adjacentCount: 10,
    });
    expect(setAdjacentCount(10, 99)).toEqual({
      classicCount: 0,
      adjacentCount: 10,
    });
    expect(setAdjacentCount(10, -5)).toEqual({
      classicCount: 10,
      adjacentCount: 0,
    });
  });

  it("biases the odd film toward Classic, the headline category", () => {
    expect(createDefaultChristmasSplit(5)).toEqual({
      classicCount: 3,
      adjacentCount: 2,
    });
    expect(createDefaultChristmasSplit(10)).toEqual({
      classicCount: 5,
      adjacentCount: 5,
    });
  });

  it("rejects a split that doesn't add up, or carries a negative count", () => {
    expect(
      isValidChristmasSplit(10, { classicCount: 5, adjacentCount: 4 }),
    ).toBe(false);
    expect(
      isValidChristmasSplit(10, { classicCount: 11, adjacentCount: -1 }),
    ).toBe(false);
  });
});
