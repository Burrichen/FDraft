import { describe, expect, it } from "vitest";
import {
  createDefaultSplit,
  isValidSplit,
  setChallengeCount,
  setRandomCount,
} from "./split";

describe("createDefaultSplit", () => {
  it("splits an even total in half", () => {
    expect(createDefaultSplit(10)).toEqual({
      randomCount: 5,
      challengeCount: 5,
    });
  });

  it("biases the odd film toward challenge", () => {
    expect(createDefaultSplit(5)).toEqual({
      randomCount: 2,
      challengeCount: 3,
    });
  });

  it("always satisfies the total invariant", () => {
    for (const total of [5, 8, 10, 12, 20]) {
      expect(isValidSplit(total, createDefaultSplit(total))).toBe(true);
    }
  });
});

describe("setRandomCount / setChallengeCount", () => {
  it("moving the random slider derives the challenge count for Medium (10)", () => {
    expect(setRandomCount(10, 4)).toEqual({
      randomCount: 4,
      challengeCount: 6,
    });
  });

  it("moving the challenge slider derives the random count for Medium (10)", () => {
    expect(setChallengeCount(10, 6)).toEqual({
      randomCount: 4,
      challengeCount: 6,
    });
  });

  it("clamps random count above the total down to the total", () => {
    expect(setRandomCount(10, 15)).toEqual({
      randomCount: 10,
      challengeCount: 0,
    });
  });

  it("clamps a negative random count up to zero", () => {
    expect(setRandomCount(10, -3)).toEqual({
      randomCount: 0,
      challengeCount: 10,
    });
  });

  it("clamps challenge count above the total down to the total", () => {
    expect(setChallengeCount(8, 100)).toEqual({
      randomCount: 0,
      challengeCount: 8,
    });
  });

  it("rounds fractional input", () => {
    expect(setRandomCount(10, 4.6)).toEqual({
      randomCount: 5,
      challengeCount: 5,
    });
  });

  it("never produces a total other than totalFilms, across the whole valid range", () => {
    const total = 12;
    for (let requested = -5; requested <= 20; requested++) {
      const split = setRandomCount(total, requested);
      expect(isValidSplit(total, split)).toBe(true);
    }
  });

  it("rejects a negative total", () => {
    expect(() => setRandomCount(-1, 0)).toThrow();
  });
});

describe("isValidSplit", () => {
  it("rejects a split that does not sum to the total", () => {
    expect(isValidSplit(10, { randomCount: 4, challengeCount: 5 })).toBe(false);
  });

  it("rejects a negative component even if the sum happens to match", () => {
    expect(isValidSplit(10, { randomCount: -2, challengeCount: 12 })).toBe(
      false,
    );
  });
});
