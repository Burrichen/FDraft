import { describe, expect, it } from "vitest";
import { calculateFreeformRank } from "./freeform";

describe("calculateFreeformRank", () => {
  it.each([
    [0, "below_baby"],
    [4, "below_baby"],
    [5, "baby"],
    [7, "baby"],
    [8, "easy"],
    [9, "easy"],
    [10, "medium"],
    [11, "medium"],
    [12, "hard"],
    [19, "hard"],
    [20, "hardcore"],
    [35, "hardcore"],
  ] as const)("%i completed films -> %s", (completed, expected) => {
    expect(calculateFreeformRank(completed)).toBe(expected);
  });

  it("rejects negative counts", () => {
    expect(() => calculateFreeformRank(-1)).toThrow();
  });

  it("rejects non-integer counts", () => {
    expect(() => calculateFreeformRank(5.5)).toThrow();
  });
});
