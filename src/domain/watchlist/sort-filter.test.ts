import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import {
  collectAvailableDecades,
  collectAvailableGenres,
  DEFAULT_WATCHLIST_FILTERS,
  decadeLabel,
  filterWatchlistFilms,
  isDefaultWatchlistFilterState,
  isWatchlistSortOption,
  sortWatchlistFilms,
  type FilterableWatchlistFilm,
  type SortableWatchlistFilm,
} from "./sort-filter";

function film(
  overrides: Partial<SortableWatchlistFilm> & { title: string },
): SortableWatchlistFilm {
  return {
    dateAdded: "2026-01-01",
    releaseYear: null,
    runtimeMinutes: null,
    averageRating: null,
    ...overrides,
  };
}

describe("isWatchlistSortOption", () => {
  it("accepts every known sort value", () => {
    expect(isWatchlistSortOption("date_added_desc")).toBe(true);
    expect(isWatchlistSortOption("shuffle")).toBe(true);
  });

  it("rejects anything else, including a stale/unknown persisted value", () => {
    expect(isWatchlistSortOption("date_added_descending")).toBe(false);
    expect(isWatchlistSortOption(null)).toBe(false);
    expect(isWatchlistSortOption(undefined)).toBe(false);
    expect(isWatchlistSortOption(42)).toBe(false);
  });
});

describe("sortWatchlistFilms", () => {
  it("does not mutate the input array", () => {
    const films = [film({ title: "B" }), film({ title: "A" })];
    const original = [...films];
    sortWatchlistFilms(films, "title_asc");
    expect(films).toEqual(original);
  });

  it("sorts by date added, newest first", () => {
    const films = [
      film({ title: "Old", dateAdded: "2025-01-01" }),
      film({ title: "New", dateAdded: "2026-01-01" }),
      film({ title: "Mid", dateAdded: "2025-06-01" }),
    ];
    const result = sortWatchlistFilms(films, "date_added_desc");
    expect(result.map((f) => f.title)).toEqual(["New", "Mid", "Old"]);
  });

  it("sorts by date added, oldest first", () => {
    const films = [
      film({ title: "Old", dateAdded: "2025-01-01" }),
      film({ title: "New", dateAdded: "2026-01-01" }),
    ];
    const result = sortWatchlistFilms(films, "date_added_asc");
    expect(result.map((f) => f.title)).toEqual(["Old", "New"]);
  });

  it("sorts titles A to Z case-insensitively", () => {
    const films = [
      film({ title: "banana" }),
      film({ title: "Apple" }),
      film({ title: "cherry" }),
    ];
    const result = sortWatchlistFilms(films, "title_asc");
    expect(result.map((f) => f.title)).toEqual(["Apple", "banana", "cherry"]);
  });

  it("sorts titles Z to A", () => {
    const films = [film({ title: "Apple" }), film({ title: "banana" })];
    const result = sortWatchlistFilms(films, "title_desc");
    expect(result.map((f) => f.title)).toEqual(["banana", "Apple"]);
  });

  it("sorts release year newest first, grouping unknown years at the end", () => {
    const films = [
      film({ title: "Unknown", releaseYear: null }),
      film({ title: "Old", releaseYear: 1980 }),
      film({ title: "New", releaseYear: 2020 }),
    ];
    const result = sortWatchlistFilms(films, "release_year_desc");
    expect(result.map((f) => f.title)).toEqual(["New", "Old", "Unknown"]);
  });

  it("sorts release year oldest first, still grouping unknown years at the end", () => {
    const films = [
      film({ title: "Unknown", releaseYear: null }),
      film({ title: "New", releaseYear: 2020 }),
      film({ title: "Old", releaseYear: 1980 }),
    ];
    const result = sortWatchlistFilms(films, "release_year_asc");
    expect(result.map((f) => f.title)).toEqual(["Old", "New", "Unknown"]);
  });

  it("sorts runtime shortest first, grouping unknown runtimes at the end", () => {
    const films = [
      film({ title: "Unknown", runtimeMinutes: null }),
      film({ title: "Long", runtimeMinutes: 180 }),
      film({ title: "Short", runtimeMinutes: 80 }),
    ];
    const result = sortWatchlistFilms(films, "runtime_asc");
    expect(result.map((f) => f.title)).toEqual(["Short", "Long", "Unknown"]);
  });

  it("sorts runtime longest first, still grouping unknown runtimes at the end", () => {
    const films = [
      film({ title: "Unknown", runtimeMinutes: null }),
      film({ title: "Short", runtimeMinutes: 80 }),
      film({ title: "Long", runtimeMinutes: 180 }),
    ];
    const result = sortWatchlistFilms(films, "runtime_desc");
    expect(result.map((f) => f.title)).toEqual(["Long", "Short", "Unknown"]);
  });

  it("sorts rating highest first, grouping unknown ratings at the end", () => {
    const films = [
      film({ title: "Unrated", averageRating: null }),
      film({ title: "Low", averageRating: 2.1 }),
      film({ title: "High", averageRating: 4.8 }),
    ];
    const result = sortWatchlistFilms(films, "rating_desc");
    expect(result.map((f) => f.title)).toEqual(["High", "Low", "Unrated"]);
  });

  it("sorts rating lowest first, still grouping unknown ratings at the end", () => {
    const films = [
      film({ title: "Unrated", averageRating: null }),
      film({ title: "High", averageRating: 4.8 }),
      film({ title: "Low", averageRating: 2.1 }),
    ];
    const result = sortWatchlistFilms(films, "rating_asc");
    expect(result.map((f) => f.title)).toEqual(["Low", "High", "Unrated"]);
  });

  it("never produces NaN-driven ordering when every film is missing the sorted field", () => {
    const films = [
      film({ title: "A", runtimeMinutes: null }),
      film({ title: "B", runtimeMinutes: null }),
      film({ title: "C", runtimeMinutes: null }),
    ];
    const result = sortWatchlistFilms(films, "runtime_asc");
    expect(result).toHaveLength(3);
    expect(new Set(result.map((f) => f.title))).toEqual(
      new Set(["A", "B", "C"]),
    );
  });

  it("shuffles using the given rng, and throws if no rng is supplied", () => {
    const films = [
      film({ title: "A" }),
      film({ title: "B" }),
      film({ title: "C" }),
    ];
    expect(() => sortWatchlistFilms(films, "shuffle")).toThrow();
    const result = sortWatchlistFilms(films, "shuffle", createSeededRng(1));
    expect(result).toHaveLength(3);
    expect(new Set(result.map((f) => f.title))).toEqual(
      new Set(["A", "B", "C"]),
    );
  });

  it("shuffle produces a different order for a different rng state, proving a fresh invocation reshuffles", () => {
    const films = Array.from({ length: 10 }, (_, i) =>
      film({ title: `Film ${i}` }),
    );
    const first = sortWatchlistFilms(films, "shuffle", createSeededRng(1));
    const second = sortWatchlistFilms(films, "shuffle", createSeededRng(2));
    expect(first.map((f) => f.title)).not.toEqual(second.map((f) => f.title));
  });
});

describe("decadeLabel", () => {
  it("buckets a release year into its decade", () => {
    expect(decadeLabel(1994)).toBe("1990s");
    expect(decadeLabel(2000)).toBe("2000s");
    expect(decadeLabel(2023)).toBe("2020s");
  });
});

function filterableFilm(
  overrides: Partial<FilterableWatchlistFilm>,
): FilterableWatchlistFilm {
  return {
    releaseYear: null,
    runtimeMinutes: null,
    genres: null,
    hasMetadata: false,
    ...overrides,
  };
}

describe("filterWatchlistFilms", () => {
  it("with the default filter state, returns everything unchanged", () => {
    const films = [filterableFilm({}), filterableFilm({ hasMetadata: true })];
    expect(filterWatchlistFilms(films, DEFAULT_WATCHLIST_FILTERS)).toEqual(
      films,
    );
  });

  it("filters by genre", () => {
    const films = [
      filterableFilm({ genres: ["Horror"] }),
      filterableFilm({ genres: ["Comedy"] }),
      filterableFilm({ genres: null }),
    ];
    const result = filterWatchlistFilms(films, {
      ...DEFAULT_WATCHLIST_FILTERS,
      genre: "Horror",
    });
    expect(result).toEqual([films[0]]);
  });

  it("filters by decade, excluding films with no known release year", () => {
    const films = [
      filterableFilm({ releaseYear: 1994 }),
      filterableFilm({ releaseYear: 2020 }),
      filterableFilm({ releaseYear: null }),
    ];
    const result = filterWatchlistFilms(films, {
      ...DEFAULT_WATCHLIST_FILTERS,
      decade: "1990s",
    });
    expect(result).toEqual([films[0]]);
  });

  it("filters by runtime range, excluding films with no known runtime", () => {
    const films = [
      filterableFilm({ runtimeMinutes: 75 }),
      filterableFilm({ runtimeMinutes: 150 }),
      filterableFilm({ runtimeMinutes: null }),
    ];
    const result = filterWatchlistFilms(films, {
      ...DEFAULT_WATCHLIST_FILTERS,
      runtimeRange: "under_90",
    });
    expect(result).toEqual([films[0]]);
  });

  it("filters to only films with metadata available", () => {
    const films = [
      filterableFilm({ hasMetadata: true }),
      filterableFilm({ hasMetadata: false }),
    ];
    const result = filterWatchlistFilms(films, {
      ...DEFAULT_WATCHLIST_FILTERS,
      metadataAvailability: "available",
    });
    expect(result).toEqual([films[0]]);
  });

  it("filters to only films with metadata missing", () => {
    const films = [
      filterableFilm({ hasMetadata: true }),
      filterableFilm({ hasMetadata: false }),
    ];
    const result = filterWatchlistFilms(films, {
      ...DEFAULT_WATCHLIST_FILTERS,
      metadataAvailability: "missing",
    });
    expect(result).toEqual([films[1]]);
  });

  it("combines multiple active filters (AND, not OR)", () => {
    const films = [
      filterableFilm({ genres: ["Horror"], releaseYear: 1994 }),
      filterableFilm({ genres: ["Horror"], releaseYear: 2020 }),
      filterableFilm({ genres: ["Comedy"], releaseYear: 1994 }),
    ];
    const result = filterWatchlistFilms(films, {
      ...DEFAULT_WATCHLIST_FILTERS,
      genre: "Horror",
      decade: "1990s",
    });
    expect(result).toEqual([films[0]]);
  });

  it("does not mutate the input array", () => {
    const films = [filterableFilm({ genres: ["Horror"] })];
    const original = [...films];
    filterWatchlistFilms(films, {
      ...DEFAULT_WATCHLIST_FILTERS,
      genre: "Horror",
    });
    expect(films).toEqual(original);
  });
});

describe("isDefaultWatchlistFilterState", () => {
  it("is true for the default state", () => {
    expect(isDefaultWatchlistFilterState(DEFAULT_WATCHLIST_FILTERS)).toBe(true);
  });

  it("is false once any single filter is set", () => {
    expect(
      isDefaultWatchlistFilterState({
        ...DEFAULT_WATCHLIST_FILTERS,
        genre: "Horror",
      }),
    ).toBe(false);
    expect(
      isDefaultWatchlistFilterState({
        ...DEFAULT_WATCHLIST_FILTERS,
        metadataAvailability: "missing",
      }),
    ).toBe(false);
  });
});

describe("collectAvailableGenres", () => {
  it("returns every distinct genre, alphabetized, ignoring nulls", () => {
    const films = [
      { genres: ["Horror", "Thriller"] },
      { genres: ["Comedy"] },
      { genres: null },
    ];
    expect(collectAvailableGenres(films)).toEqual([
      "Comedy",
      "Horror",
      "Thriller",
    ]);
  });
});

describe("collectAvailableDecades", () => {
  it("returns every distinct decade, oldest first, ignoring unknown years", () => {
    const films = [
      { releaseYear: 2023 },
      { releaseYear: 1994 },
      { releaseYear: 1998 },
      { releaseYear: null },
    ];
    expect(collectAvailableDecades(films)).toEqual(["1990s", "2020s"]);
  });
});
