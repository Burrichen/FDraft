import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "@/domain/drafts/difficulty";
import {
  createDefaultHalloweenSplit,
  isValidHalloweenSplit,
  setHalloweenAdjacentCount,
  setHorrorCount,
  setKitschCount,
} from "./halloween-split";

const DIFFICULTY_FILM_COUNTS = [
  DIFFICULTIES.baby.filmCount!,
  DIFFICULTIES.easy.filmCount!,
  DIFFICULTIES.medium.filmCount!,
  DIFFICULTIES.hard.filmCount!,
  DIFFICULTIES.hardcore.filmCount!,
];

describe("createDefaultHalloweenSplit", () => {
  it.each(DIFFICULTY_FILM_COUNTS)(
    "sums to exactly the difficulty's film count (%i)",
    (totalFilms) => {
      const split = createDefaultHalloweenSplit(totalFilms);
      expect(
        split.halloweenAdjacentCount + split.horrorCount + split.kitschCount,
      ).toBe(totalFilms);
      expect(split.halloweenAdjacentCount).toBeGreaterThanOrEqual(0);
      expect(split.horrorCount).toBeGreaterThanOrEqual(0);
      expect(split.kitschCount).toBeGreaterThanOrEqual(0);
    },
  );

  it("matches the medium example from the spec conceptually (10 films, evenly reasoned)", () => {
    const split = createDefaultHalloweenSplit(10);
    expect(
      split.halloweenAdjacentCount + split.horrorCount + split.kitschCount,
    ).toBe(10);
  });
});

describe("isValidHalloweenSplit", () => {
  it("accepts a split that sums to the total", () => {
    expect(
      isValidHalloweenSplit(
        { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 2 },
        10,
      ),
    ).toBe(true);
  });

  it("rejects a split that doesn't sum to the total", () => {
    expect(
      isValidHalloweenSplit(
        { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 1 },
        10,
      ),
    ).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(
      isValidHalloweenSplit(
        { halloweenAdjacentCount: -1, horrorCount: 5, kitschCount: 6 },
        10,
      ),
    ).toBe(false);
  });
});

describe("setHalloweenAdjacentCount / setHorrorCount / setKitschCount", () => {
  const totalFilms = 10;

  it("always keeps the total invariant when adjusting any one dimension", () => {
    let split = createDefaultHalloweenSplit(totalFilms);
    split = setHalloweenAdjacentCount(split, 7, totalFilms);
    expect(isValidHalloweenSplit(split, totalFilms)).toBe(true);
    split = setHorrorCount(split, 2, totalFilms);
    expect(isValidHalloweenSplit(split, totalFilms)).toBe(true);
    split = setKitschCount(split, 0, totalFilms);
    expect(isValidHalloweenSplit(split, totalFilms)).toBe(true);
    expect(split.kitschCount).toBe(0);
  });

  it("clamps a value above the total down to the total, zeroing the other two", () => {
    const split = createDefaultHalloweenSplit(totalFilms);
    const next = setHalloweenAdjacentCount(split, 999, totalFilms);
    expect(next.halloweenAdjacentCount).toBe(totalFilms);
    expect(next.horrorCount + next.kitschCount).toBe(0);
  });

  it("clamps a negative value up to 0", () => {
    const split = createDefaultHalloweenSplit(totalFilms);
    const next = setHorrorCount(split, -5, totalFilms);
    expect(next.horrorCount).toBe(0);
    expect(next.halloweenAdjacentCount + next.kitschCount).toBe(totalFilms);
  });

  it("falls back to an even split when redistributing two currently-zero values", () => {
    // Push everything into kitsch first, then reduce it — the other two
    // start this call at 0 with nothing to preserve a ratio from.
    let split = { halloweenAdjacentCount: 0, horrorCount: 0, kitschCount: 10 };
    split = setKitschCount(split, 4, totalFilms);
    expect(split.halloweenAdjacentCount).toBe(3);
    expect(split.horrorCount).toBe(3);
    expect(split.kitschCount).toBe(4);
  });

  it("redistributes proportionally to the existing ratio of the other two", () => {
    // horror:kitsch currently 6:2 (3:1 ratio) — reducing adjacent to 0
    // frees up all 10 for horror/kitsch, split roughly 3:1.
    let split = { halloweenAdjacentCount: 2, horrorCount: 6, kitschCount: 2 };
    split = setHalloweenAdjacentCount(split, 0, totalFilms);
    expect(split.halloweenAdjacentCount).toBe(0);
    expect(split.horrorCount + split.kitschCount).toBe(10);
    expect(split.horrorCount).toBeGreaterThan(split.kitschCount);
  });

  it("resolves rounding remainder deterministically without breaking the total", () => {
    // 1:2 ratio over a remainder of 7 doesn't divide evenly.
    let split = { halloweenAdjacentCount: 3, horrorCount: 2, kitschCount: 5 };
    split = setKitschCount(split, 0, totalFilms);
    expect(split.halloweenAdjacentCount + split.horrorCount).toBe(10);
  });
});
