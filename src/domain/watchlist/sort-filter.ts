import { shuffle, type Rng } from "@/domain/shared/rng";
import { compareNullsLast } from "@/domain/shared/sort";

/**
 * The Watchlist page's "Sort & Filter" control (see docs/product-spec.md,
 * "WATCHLIST SORT / FILTER CONTROL"). Kept intentionally small — a fixed
 * set of genuinely useful sort orders plus a handful of lightweight
 * filters, not a query builder.
 */

export type WatchlistSortOption =
  | "date_added_desc"
  | "date_added_asc"
  | "title_asc"
  | "title_desc"
  | "release_year_desc"
  | "release_year_asc"
  | "runtime_asc"
  | "runtime_desc"
  | "rating_desc"
  | "rating_asc"
  | "shuffle";

export const DEFAULT_WATCHLIST_SORT: WatchlistSortOption = "date_added_desc";

export const WATCHLIST_SORT_OPTIONS: {
  value: WatchlistSortOption;
  label: string;
}[] = [
  { value: "date_added_desc", label: "Date Added — Newest First" },
  { value: "date_added_asc", label: "Date Added — Oldest First" },
  { value: "title_asc", label: "Title — A to Z" },
  { value: "title_desc", label: "Title — Z to A" },
  { value: "release_year_desc", label: "Release Year — Newest First" },
  { value: "release_year_asc", label: "Release Year — Oldest First" },
  { value: "runtime_asc", label: "Runtime — Shortest First" },
  { value: "runtime_desc", label: "Runtime — Longest First" },
  { value: "rating_desc", label: "Average Rating — Highest First" },
  { value: "rating_asc", label: "Average Rating — Lowest First" },
  { value: "shuffle", label: "Shuffle" },
];

export function isWatchlistSortOption(
  value: unknown,
): value is WatchlistSortOption {
  return (
    typeof value === "string" &&
    WATCHLIST_SORT_OPTIONS.some((option) => option.value === value)
  );
}

export interface SortableWatchlistFilm {
  /** ISO calendar date (YYYY-MM-DD) — always present, never sorted with a null case. */
  dateAdded: string;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
}

const numberAscending = (a: number, b: number) => a - b;

/**
 * Sorts a copy of `films`; never mutates the input. `shuffle` requires an
 * `rng` — callers control exactly when a fresh shuffle happens by
 * controlling when they call this with a new `rng`/recompute (see
 * `WatchlistView`'s `shuffleNonce`), not by this function's own behavior;
 * calling it twice with the same `rng` state naturally produces different
 * results each time; a stable rng under memoization is what keeps the
 * result stable across unrelated re-renders.
 */
export function sortWatchlistFilms<T extends SortableWatchlistFilm>(
  films: readonly T[],
  sort: WatchlistSortOption,
  rng?: Rng,
): T[] {
  if (sort === "shuffle") {
    if (!rng) {
      throw new Error("sortWatchlistFilms: 'shuffle' requires an rng");
    }
    return shuffle(films, rng);
  }

  const sorted = [...films];
  switch (sort) {
    case "date_added_desc":
      sorted.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
      break;
    case "date_added_asc":
      sorted.sort((a, b) => a.dateAdded.localeCompare(b.dateAdded));
      break;
    case "title_asc":
      sorted.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
      break;
    case "title_desc":
      sorted.sort((a, b) =>
        b.title.localeCompare(a.title, undefined, { sensitivity: "base" }),
      );
      break;
    case "release_year_desc":
      sorted.sort((a, b) =>
        compareNullsLast(a.releaseYear, b.releaseYear, "desc", numberAscending),
      );
      break;
    case "release_year_asc":
      sorted.sort((a, b) =>
        compareNullsLast(a.releaseYear, b.releaseYear, "asc", numberAscending),
      );
      break;
    case "runtime_asc":
      sorted.sort((a, b) =>
        compareNullsLast(
          a.runtimeMinutes,
          b.runtimeMinutes,
          "asc",
          numberAscending,
        ),
      );
      break;
    case "runtime_desc":
      sorted.sort((a, b) =>
        compareNullsLast(
          a.runtimeMinutes,
          b.runtimeMinutes,
          "desc",
          numberAscending,
        ),
      );
      break;
    case "rating_desc":
      sorted.sort((a, b) =>
        compareNullsLast(
          a.averageRating,
          b.averageRating,
          "desc",
          numberAscending,
        ),
      );
      break;
    case "rating_asc":
      sorted.sort((a, b) =>
        compareNullsLast(
          a.averageRating,
          b.averageRating,
          "asc",
          numberAscending,
        ),
      );
      break;
  }
  return sorted;
}

export type WatchlistRuntimeRange = "under_90" | "90_to_120" | "over_120";

export const WATCHLIST_RUNTIME_RANGE_OPTIONS: {
  value: WatchlistRuntimeRange;
  label: string;
}[] = [
  { value: "under_90", label: "Under 90 min" },
  { value: "90_to_120", label: "90–120 min" },
  { value: "over_120", label: "Over 120 min" },
];

export type WatchlistMetadataAvailability = "any" | "available" | "missing";

export interface WatchlistFilterState {
  /** `null` means "Any". */
  genre: string | null;
  /** A decade label, e.g. `"1990s"`. `null` means "Any". */
  decade: string | null;
  runtimeRange: WatchlistRuntimeRange | null;
  metadataAvailability: WatchlistMetadataAvailability;
}

export const DEFAULT_WATCHLIST_FILTERS: WatchlistFilterState = {
  genre: null,
  decade: null,
  runtimeRange: null,
  metadataAvailability: "any",
};

export function isDefaultWatchlistFilterState(
  filters: WatchlistFilterState,
): boolean {
  return (
    filters.genre === null &&
    filters.decade === null &&
    filters.runtimeRange === null &&
    filters.metadataAvailability === "any"
  );
}

/** `"1990s"`, `"2000s"`, etc. */
export function decadeLabel(releaseYear: number): string {
  const decade = Math.floor(releaseYear / 10) * 10;
  return `${decade}s`;
}

function matchesRuntimeRange(
  runtimeMinutes: number | null,
  range: WatchlistRuntimeRange,
): boolean {
  // A film with no known runtime can't be said to match a specific runtime
  // range — filtering it out here (never crashing, never guessing) is what
  // "Metadata available/missing" is for instead.
  if (runtimeMinutes === null) return false;
  switch (range) {
    case "under_90":
      return runtimeMinutes < 90;
    case "90_to_120":
      return runtimeMinutes >= 90 && runtimeMinutes <= 120;
    case "over_120":
      return runtimeMinutes > 120;
  }
}

export interface FilterableWatchlistFilm {
  releaseYear: number | null;
  runtimeMinutes: number | null;
  genres: string[] | null;
  /** Whether ANY metadata provider has enriched this film at all — drives the "Metadata available/missing" filter. */
  hasMetadata: boolean;
}

/** Filters a copy of `films`; never mutates the input. */
export function filterWatchlistFilms<T extends FilterableWatchlistFilm>(
  films: readonly T[],
  filters: WatchlistFilterState,
): T[] {
  return films.filter((film) => {
    if (
      filters.genre !== null &&
      !(film.genres ?? []).includes(filters.genre)
    ) {
      return false;
    }
    if (filters.decade !== null) {
      if (film.releaseYear === null) return false;
      if (decadeLabel(film.releaseYear) !== filters.decade) return false;
    }
    if (
      filters.runtimeRange !== null &&
      !matchesRuntimeRange(film.runtimeMinutes, filters.runtimeRange)
    ) {
      return false;
    }
    if (filters.metadataAvailability === "available" && !film.hasMetadata) {
      return false;
    }
    if (filters.metadataAvailability === "missing" && film.hasMetadata) {
      return false;
    }
    return true;
  });
}

/**
 * The Watchlist page's title search (see docs/updates, "WATCHLIST
 * SEARCH") — a separate, simple pass from `filterWatchlistFilms`'s
 * discrete dropdown filters, composed alongside them rather than folded
 * in: free-text search and "Genre is X" are different kinds of narrowing,
 * and keeping them as two small functions is clearer than one that does
 * both. Case-insensitive substring match on title only; a blank/
 * whitespace-only query matches everything, restoring the normal
 * Watchlist.
 */
export function searchWatchlistFilms<T extends { title: string }>(
  films: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return films.slice();
  }
  return films.filter((film) => film.title.toLowerCase().includes(needle));
}

/** Every genre present across `films`, alphabetized — the "Genre" filter's dynamic option list. */
export function collectAvailableGenres(
  films: readonly { genres: string[] | null }[],
): string[] {
  const genres = new Set<string>();
  for (const film of films) {
    for (const genre of film.genres ?? []) {
      genres.add(genre);
    }
  }
  return Array.from(genres).sort((a, b) => a.localeCompare(b));
}

/** Every decade present across `films`, oldest first — the "Decade" filter's dynamic option list. */
export function collectAvailableDecades(
  films: readonly { releaseYear: number | null }[],
): string[] {
  const decades = new Set<string>();
  for (const film of films) {
    if (film.releaseYear !== null) {
      decades.add(decadeLabel(film.releaseYear));
    }
  }
  return Array.from(decades).sort();
}
