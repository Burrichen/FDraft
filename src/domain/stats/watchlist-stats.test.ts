import { describe, expect, it } from "vitest";
import {
  calculateWatchlistStats,
  type StatsFilmInput,
} from "./watchlist-stats";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function film(overrides: Partial<StatsFilmInput> = {}): StatsFilmInput {
  return {
    title: "Untitled",
    dateAdded: "2026-01-01",
    releaseYear: null,
    runtimeMinutes: null,
    genres: null,
    countries: null,
    languages: null,
    directors: null,
    averageRating: null,
    ...overrides,
  };
}

describe("calculateWatchlistStats — empty watchlist", () => {
  const stats = calculateWatchlistStats({
    activeFilms: [],
    watchedFromWatchlistCount: 0,
    now: NOW,
  });

  it("still reports a remaining count of zero (a valid answer, not missing data)", () => {
    expect(stats.remainingCount).toEqual({ available: true, value: 0 });
  });

  it("still reports a watched count even with nothing active", () => {
    expect(stats.watchedCount).toEqual({ available: true, value: 0 });
  });

  it("marks everything that requires at least one film as unavailable, not zero/NaN", () => {
    expect(stats.averageAgeDays.available).toBe(false);
    expect(stats.oldestAdditions.available).toBe(false);
    expect(stats.newestAdditions.available).toBe(false);
    expect(stats.decadeDistribution.available).toBe(false);
    expect(stats.averageRuntimeMinutes.available).toBe(false);
    expect(stats.totalRemainingRuntimeMinutes.available).toBe(false);
    expect(stats.genreDistribution.available).toBe(false);
    expect(stats.averageExternalRating.available).toBe(false);
    expect(stats.ratingDistribution.available).toBe(false);
  });
});

describe("calculateWatchlistStats — watchedCount independent of active films", () => {
  it("reports watched count even when the active watchlist is empty", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [],
      watchedFromWatchlistCount: 12,
      now: NOW,
    });
    expect(stats.watchedCount).toEqual({ available: true, value: 12 });
  });
});

describe("calculateWatchlistStats — average age", () => {
  it("averages calendar-day age across active films", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [
        film({ dateAdded: "2026-06-05" }), // 10 days old
        film({ dateAdded: "2026-05-16" }), // 30 days old
      ],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.averageAgeDays).toEqual({ available: true, value: 20 });
  });
});

describe("calculateWatchlistStats — oldest/newest additions", () => {
  const stats = calculateWatchlistStats({
    activeFilms: [
      film({ title: "Newest", dateAdded: "2026-06-10" }),
      film({ title: "Oldest", dateAdded: "2025-01-01" }),
      film({ title: "Middle", dateAdded: "2026-01-01" }),
    ],
    watchedFromWatchlistCount: 0,
    now: NOW,
  });

  it("orders oldest additions ascending by date added", () => {
    expect(stats.oldestAdditions).toEqual({
      available: true,
      value: [
        { title: "Oldest", dateAdded: "2025-01-01" },
        { title: "Middle", dateAdded: "2026-01-01" },
        { title: "Newest", dateAdded: "2026-06-10" },
      ],
    });
  });

  it("orders newest additions descending by date added", () => {
    expect(stats.newestAdditions).toEqual({
      available: true,
      value: [
        { title: "Newest", dateAdded: "2026-06-10" },
        { title: "Middle", dateAdded: "2026-01-01" },
        { title: "Oldest", dateAdded: "2025-01-01" },
      ],
    });
  });

  it("caps the list at 5 entries", () => {
    const many = calculateWatchlistStats({
      activeFilms: Array.from({ length: 10 }, (_, i) =>
        film({
          title: `Film ${i}`,
          dateAdded: `2026-01-${String(i + 1).padStart(2, "0")}`,
        }),
      ),
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(many.oldestAdditions.available).toBe(true);
    if (many.oldestAdditions.available) {
      expect(many.oldestAdditions.value).toHaveLength(5);
    }
  });
});

describe("calculateWatchlistStats — decade distribution", () => {
  it("groups films by release decade, ignoring films with no known year", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [
        film({ releaseYear: 1994 }),
        film({ releaseYear: 1999 }),
        film({ releaseYear: 2010 }),
        film({ releaseYear: null }),
      ],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.decadeDistribution).toEqual({
      available: true,
      value: [
        { key: "1990s", count: 2 },
        { key: "2010s", count: 1 },
      ],
    });
  });

  it("is unavailable when no film has a known release year", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [film({ releaseYear: null })],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.decadeDistribution.available).toBe(false);
  });
});

describe("calculateWatchlistStats — runtime", () => {
  it("averages and totals only films with a known runtime", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [
        film({ runtimeMinutes: 90 }),
        film({ runtimeMinutes: 120 }),
        film({ runtimeMinutes: null }),
      ],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.averageRuntimeMinutes).toEqual({
      available: true,
      value: 105,
    });
    expect(stats.totalRemainingRuntimeMinutes).toEqual({
      available: true,
      value: 210,
    });
  });

  it("is unavailable when no film has a known runtime", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [film({ runtimeMinutes: null })],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.averageRuntimeMinutes.available).toBe(false);
    expect(stats.totalRemainingRuntimeMinutes.available).toBe(false);
  });
});

describe("calculateWatchlistStats — genre/country/language/director distributions", () => {
  it("counts multi-value fields per film, most common first", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [
        film({ genres: ["Drama", "Thriller"] }),
        film({ genres: ["Drama"] }),
        film({ genres: null }),
      ],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.genreDistribution).toEqual({
      available: true,
      value: [
        { key: "Drama", count: 2 },
        { key: "Thriller", count: 1 },
      ],
    });
  });

  it("caps distributions at 8 entries", () => {
    const stats = calculateWatchlistStats({
      activeFilms: Array.from({ length: 12 }, (_, i) =>
        film({ genres: [`Genre ${i}`] }),
      ),
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.genreDistribution.available).toBe(true);
    if (stats.genreDistribution.available) {
      expect(stats.genreDistribution.value).toHaveLength(8);
    }
  });

  it("is unavailable when no film has that field", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [film({ countries: null }), film({ countries: null })],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.countryDistribution.available).toBe(false);
  });
});

describe("calculateWatchlistStats — ratings", () => {
  it("averages known external ratings", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [
        film({ averageRating: 4 }),
        film({ averageRating: 3 }),
        film({ averageRating: null }),
      ],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.averageExternalRating).toEqual({
      available: true,
      value: 3.5,
    });
  });

  it("buckets ratings into rounded half-star bands", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [
        film({ averageRating: 4.1 }), // rounds to 4.0
        film({ averageRating: 4.24 }), // rounds to 4.0 (nearest half star)
        film({ averageRating: 4.3 }), // rounds to 4.5
      ],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.ratingDistribution).toEqual({
      available: true,
      value: [
        { key: "4.0★", count: 2 },
        { key: "4.5★", count: 1 },
      ],
    });
  });

  it("is unavailable when no film has a known rating", () => {
    const stats = calculateWatchlistStats({
      activeFilms: [film({ averageRating: null })],
      watchedFromWatchlistCount: 0,
      now: NOW,
    });
    expect(stats.averageExternalRating.available).toBe(false);
    expect(stats.ratingDistribution.available).toBe(false);
  });
});
