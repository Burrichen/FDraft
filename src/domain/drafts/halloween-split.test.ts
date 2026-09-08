import { describe, expect, it } from "vitest";
import {
  createDefaultHalloweenSplit,
  isValidHalloweenSplit,
  setHorrorCount,
  setKitschCount,
} from "./halloween-split";
import { CREATABLE_DIFFICULTY_ORDER, DIFFICULTIES } from "./difficulty";

/** Every fixed-size difficulty's real film count, straight from the shared config. */
const FIXED_DIFFICULTY_COUNTS = CREATABLE_DIFFICULTY_ORDER.map(
  (id) => DIFFICULTIES[id].filmCount,
).filter((count): count is number => count !== null);

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE
 * CLEANUP" §1/§2 — Halloween-adjacent is gone; Horror and Kitsch are the
 * only two categories, and their total must equal the selected difficulty.
 */
describe("halloween-split", () => {
  it("always sums to the selected difficulty's real film count, for every fixed difficulty", () => {
    expect(FIXED_DIFFICULTY_COUNTS.length).toBeGreaterThanOrEqual(5);
    for (const total of FIXED_DIFFICULTY_COUNTS) {
      const split = createDefaultHalloweenSplit(total);
      expect(split.horrorCount + split.kitschCount).toBe(total);
      expect(isValidHalloweenSplit(total, split)).toBe(true);
    }
  });

  it("keeps the total no matter which slider moves, across its whole range", () => {
    for (const total of FIXED_DIFFICULTY_COUNTS) {
      for (let value = 0; value <= total; value++) {
        const byHorror = setHorrorCount(total, value);
        expect(byHorror.horrorCount).toBe(value);
        expect(byHorror.horrorCount + byHorror.kitschCount).toBe(total);

        const byKitsch = setKitschCount(total, value);
        expect(byKitsch.kitschCount).toBe(value);
        expect(byKitsch.horrorCount + byKitsch.kitschCount).toBe(total);
      }
    }
  });

  it("clamps a request beyond either end rather than producing an invalid total", () => {
    expect(setHorrorCount(10, 99)).toEqual({
      horrorCount: 10,
      kitschCount: 0,
    });
    expect(setHorrorCount(10, -5)).toEqual({
      horrorCount: 0,
      kitschCount: 10,
    });
    expect(setKitschCount(10, 99)).toEqual({
      horrorCount: 0,
      kitschCount: 10,
    });
    expect(setKitschCount(10, -5)).toEqual({
      horrorCount: 10,
      kitschCount: 0,
    });
  });

  it("biases the odd film toward Horror, the headline category", () => {
    expect(createDefaultHalloweenSplit(5)).toEqual({
      horrorCount: 3,
      kitschCount: 2,
    });
    expect(createDefaultHalloweenSplit(8)).toEqual({
      horrorCount: 4,
      kitschCount: 4,
    });
  });

  it("rejects a split that doesn't add up, or carries a negative count", () => {
    expect(isValidHalloweenSplit(10, { horrorCount: 5, kitschCount: 4 })).toBe(
      false,
    );
    expect(
      isValidHalloweenSplit(10, { horrorCount: 11, kitschCount: -1 }),
    ).toBe(false);
  });
});
