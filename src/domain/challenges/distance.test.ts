import { describe, expect, it } from "vitest";
import {
  computeDistanceRanges,
  filmDistance,
  type DistanceComparable,
} from "./distance";

function film(overrides: Partial<DistanceComparable> = {}): DistanceComparable {
  return {
    releaseYear: 2000,
    runtimeMinutes: 100,
    genres: ["Drama"],
    ...overrides,
  };
}

describe("computeDistanceRanges", () => {
  it("computes the min-max spread of release years and runtimes", () => {
    const ranges = computeDistanceRanges([
      film({ releaseYear: 1980, runtimeMinutes: 90 }),
      film({ releaseYear: 2020, runtimeMinutes: 190 }),
    ]);
    expect(ranges).toEqual({ releaseYearRange: 40, runtimeRange: 100 });
  });

  it("returns a range of 0 when every film shares the same value", () => {
    const ranges = computeDistanceRanges([
      film({ releaseYear: 2000, runtimeMinutes: 100 }),
      film({ releaseYear: 2000, runtimeMinutes: 100 }),
    ]);
    expect(ranges).toEqual({ releaseYearRange: 0, runtimeRange: 0 });
  });

  it("returns a range of 0 for an empty input rather than dividing by zero", () => {
    expect(computeDistanceRanges([])).toEqual({
      releaseYearRange: 0,
      runtimeRange: 0,
    });
  });

  it("ignores films with unknown release year or runtime when computing the range", () => {
    const ranges = computeDistanceRanges([
      film({ releaseYear: null, runtimeMinutes: null }),
      film({ releaseYear: 1990, runtimeMinutes: 90 }),
      film({ releaseYear: 2010, runtimeMinutes: 110 }),
    ]);
    expect(ranges).toEqual({ releaseYearRange: 20, runtimeRange: 20 });
  });
});

describe("filmDistance", () => {
  it("is 0 for two identical films", () => {
    const ranges = computeDistanceRanges([film(), film()]);
    expect(filmDistance(film(), film(), ranges)).toBe(0);
  });

  it("increases with release-year distance, normalized by the pool's range", () => {
    const pool = [film({ releaseYear: 1980 }), film({ releaseYear: 2020 })];
    const ranges = computeDistanceRanges(pool);
    // 40-year range; a 20-year gap is exactly half that range.
    const distance = filmDistance(
      film({ releaseYear: 1980, runtimeMinutes: null, genres: null }),
      film({ releaseYear: 2000, runtimeMinutes: null, genres: null }),
      ranges,
    );
    expect(distance).toBeCloseTo(0.5);
  });

  it("increases with runtime distance, normalized by the pool's range", () => {
    const pool = [film({ runtimeMinutes: 80 }), film({ runtimeMinutes: 180 })];
    const ranges = computeDistanceRanges(pool);
    const distance = filmDistance(
      film({ releaseYear: null, runtimeMinutes: 80, genres: null }),
      film({ releaseYear: null, runtimeMinutes: 130, genres: null }),
      ranges,
    );
    expect(distance).toBeCloseTo(0.5);
  });

  it("computes genre distance as Jaccard distance", () => {
    const ranges = computeDistanceRanges([]);
    const distance = filmDistance(
      { releaseYear: null, runtimeMinutes: null, genres: ["Horror", "Comedy"] },
      { releaseYear: null, runtimeMinutes: null, genres: ["Horror", "Drama"] },
      ranges,
    );
    // intersection {Horror} = 1, union {Horror,Comedy,Drama} = 3 -> distance = 1 - 1/3
    expect(distance).toBeCloseTo(1 - 1 / 3);
  });

  it("scores 0 genre distance for identical genre sets regardless of order", () => {
    const ranges = computeDistanceRanges([]);
    const distance = filmDistance(
      { releaseYear: null, runtimeMinutes: null, genres: ["Comedy", "Horror"] },
      { releaseYear: null, runtimeMinutes: null, genres: ["Horror", "Comedy"] },
      ranges,
    );
    expect(distance).toBe(0);
  });

  it("scores maximal genre distance (1) for entirely disjoint genre sets", () => {
    const ranges = computeDistanceRanges([]);
    const distance = filmDistance(
      { releaseYear: null, runtimeMinutes: null, genres: ["Horror"] },
      { releaseYear: null, runtimeMinutes: null, genres: ["Comedy"] },
      ranges,
    );
    expect(distance).toBe(1);
  });

  it("treats two empty genre lists as zero distance (no evidence of difference)", () => {
    const ranges = computeDistanceRanges([]);
    const distance = filmDistance(
      { releaseYear: null, runtimeMinutes: null, genres: [] },
      { releaseYear: null, runtimeMinutes: null, genres: [] },
      ranges,
    );
    expect(distance).toBe(0);
  });

  it("skips a component (does not treat it as 0 or 1) when either side is missing that field", () => {
    const ranges = { releaseYearRange: 40, runtimeRange: 100 };
    // Only genres are comparable here — release year and runtime are both unknown on one side.
    const distanceA = filmDistance(
      { releaseYear: null, runtimeMinutes: 100, genres: ["Horror"] },
      { releaseYear: 2000, runtimeMinutes: null, genres: ["Comedy"] },
      ranges,
    );
    // Only the genre component (fully disjoint -> 1) is comparable, so the mean is exactly 1, not 1/3.
    expect(distanceA).toBe(1);
  });

  it("returns 0 when no dimension is comparable at all", () => {
    const ranges = { releaseYearRange: 40, runtimeRange: 100 };
    const distance = filmDistance(
      { releaseYear: null, runtimeMinutes: null, genres: null },
      { releaseYear: null, runtimeMinutes: null, genres: null },
      ranges,
    );
    expect(distance).toBe(0);
  });

  it("does not divide by zero when the pool's range is 0", () => {
    const ranges = { releaseYearRange: 0, runtimeRange: 0 };
    const distance = filmDistance(
      film({ releaseYear: 1999 }),
      film({ releaseYear: 2001 }),
      ranges,
    );
    // Year/runtime components both contribute 0 (range is 0); only genres (identical -> 0) remain.
    expect(distance).toBe(0);
  });

  it("normalizes so no single metric dominates purely due to scale", () => {
    // Runtime differences are numerically tiny (minutes) compared to unnormalized year
    // differences; after normalization, an equally-proportioned gap in either dimension
    // contributes equally.
    const ranges = { releaseYearRange: 100, runtimeRange: 10 };
    const yearOnlyDistance = filmDistance(
      { releaseYear: 1900, runtimeMinutes: null, genres: null },
      { releaseYear: 1950, runtimeMinutes: null, genres: null },
      ranges,
    );
    const runtimeOnlyDistance = filmDistance(
      { releaseYear: null, runtimeMinutes: 90, genres: null },
      { releaseYear: null, runtimeMinutes: 95, genres: null },
      ranges,
    );
    expect(yearOnlyDistance).toBeCloseTo(runtimeOnlyDistance);
  });

  it("is symmetric", () => {
    const ranges = computeDistanceRanges([
      film({ releaseYear: 1980 }),
      film({ releaseYear: 2020 }),
    ]);
    const a = film({
      releaseYear: 1990,
      runtimeMinutes: 90,
      genres: ["Horror"],
    });
    const b = film({
      releaseYear: 2010,
      runtimeMinutes: 150,
      genres: ["Comedy"],
    });
    expect(filmDistance(a, b, ranges)).toBeCloseTo(filmDistance(b, a, ranges));
  });
});
