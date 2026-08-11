import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { pickRandomFilm, pickRandomFilms } from "./random-pick";

describe("pickRandomFilm", () => {
  it("returns null for an empty watchlist rather than throwing", () => {
    expect(pickRandomFilm([], createSeededRng(1))).toBeNull();
  });

  it("returns the only candidate when there is exactly one", () => {
    const result = pickRandomFilm(
      [{ id: "film-1", weight: 1 }],
      createSeededRng(1),
    );
    expect(result).toBe("film-1");
  });

  it("only ever returns an id from the candidate list", () => {
    const candidates = [
      { id: "a", weight: 1 },
      { id: "b", weight: 2 },
      { id: "c", weight: 1 },
    ];
    const rng = createSeededRng(42);
    for (let i = 0; i < 30; i++) {
      expect(candidates.map((c) => c.id)).toContain(
        pickRandomFilm(candidates, rng),
      );
    }
  });

  it("respects selection-weight boosts — a much heavier film is picked far more often", () => {
    const candidates = [
      { id: "boosted", weight: 50 },
      { id: "normal", weight: 1 },
    ];
    const rng = createSeededRng(7);
    let boostedCount = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      if (pickRandomFilm(candidates, rng) === "boosted") boostedCount++;
    }
    expect(boostedCount / trials).toBeGreaterThan(0.9);
  });

  describe("rerolling (excludeId)", () => {
    it("never repeats the excluded film when other candidates exist", () => {
      const candidates = [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
        { id: "c", weight: 1 },
      ];
      const rng = createSeededRng(3);
      for (let i = 0; i < 30; i++) {
        expect(pickRandomFilm(candidates, rng, "a")).not.toBe("a");
      }
    });

    it("falls back to the excluded film when it is the only candidate left", () => {
      const result = pickRandomFilm(
        [{ id: "only", weight: 1 }],
        createSeededRng(1),
        "only",
      );
      expect(result).toBe("only");
    });

    it("ignores excludeId when it does not match any candidate", () => {
      const candidates = [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
      ];
      const rng = createSeededRng(9);
      for (let i = 0; i < 10; i++) {
        expect(["a", "b"]).toContain(
          pickRandomFilm(candidates, rng, "not-in-list"),
        );
      }
    });
  });

  it("is deterministic for a given seed", () => {
    const candidates = [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
      { id: "c", weight: 1 },
    ];
    const first = pickRandomFilm(candidates, createSeededRng(123));
    const second = pickRandomFilm(candidates, createSeededRng(123));
    expect(first).toBe(second);
  });
});

describe("pickRandomFilms", () => {
  it("returns an empty array for an empty watchlist", () => {
    expect(pickRandomFilms([], 5, createSeededRng(1))).toEqual([]);
  });

  it("returns exactly `count` distinct ids when enough candidates exist", () => {
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      id: `film-${i}`,
      weight: 1,
    }));
    const result = pickRandomFilms(candidates, 5, createSeededRng(1));
    expect(result).toHaveLength(5);
    expect(new Set(result).size).toBe(5);
  });

  it("returns fewer than count when the watchlist doesn't have enough films, not an error", () => {
    const candidates = [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
    ];
    const result = pickRandomFilms(candidates, 5, createSeededRng(1));
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(["a", "b"]));
  });

  it("never selects the same film twice", () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      id: `film-${i}`,
      weight: i + 1,
    }));
    const result = pickRandomFilms(candidates, 8, createSeededRng(42));
    expect(new Set(result).size).toBe(8);
  });

  it("is deterministic for a given seed", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      id: `film-${i}`,
      weight: 1,
    }));
    const first = pickRandomFilms(candidates, 5, createSeededRng(2024));
    const second = pickRandomFilms(candidates, 5, createSeededRng(2024));
    expect(first).toEqual(second);
  });
});
