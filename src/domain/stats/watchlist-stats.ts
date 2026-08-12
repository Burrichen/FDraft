import { differenceInCalendarDays } from "date-fns";
import { parseCalendarDate } from "@/domain/time/calendar-date";
import { availableStat, unavailableStat, type Stat } from "./types";

/**
 * A flattened, provider-neutral view of one active watchlist film, just the
 * fields stats calculations need. Mirrors the nullable-everything contract
 * from domain/watchlist/film-view.ts — see docs/product-spec.md, "Data
 * Provider Rule": a field being null here means no provider ever supplied
 * it, and the corresponding stat must be omitted, never faked.
 */
export interface StatsFilmInput {
  title: string;
  /** ISO calendar date (YYYY-MM-DD). */
  dateAdded: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  genres: string[] | null;
  countries: string[] | null;
  languages: string[] | null;
  directors: string[] | null;
  averageRating: number | null;
}

export interface CalculateWatchlistStatsInput {
  /** Currently active watchlist films only — never inactive/watched ones. */
  activeFilms: StatsFilmInput[];
  /** Count of watchlist entries removed with reason 'watched' (see watchlist_entries.removed_reason). */
  watchedFromWatchlistCount: number;
  now: Date;
}

export interface DistributionEntry {
  key: string;
  count: number;
}

export interface DateAddedEntry {
  title: string;
  dateAdded: string;
}

export interface WatchlistStats {
  remainingCount: Stat<number>;
  watchedCount: Stat<number>;
  averageAgeDays: Stat<number>;
  oldestAdditions: Stat<DateAddedEntry[]>;
  newestAdditions: Stat<DateAddedEntry[]>;
  decadeDistribution: Stat<DistributionEntry[]>;
  averageRuntimeMinutes: Stat<number>;
  /** Sum of *known* runtimes only — a lower bound, not the true total, when any film's runtime is unknown. */
  totalRemainingRuntimeMinutes: Stat<number>;
  genreDistribution: Stat<DistributionEntry[]>;
  languageDistribution: Stat<DistributionEntry[]>;
  countryDistribution: Stat<DistributionEntry[]>;
  directorDistribution: Stat<DistributionEntry[]>;
  averageExternalRating: Stat<number>;
  ratingDistribution: Stat<DistributionEntry[]>;
}

const MAX_ADDITIONS_SHOWN = 5;
const MAX_DISTRIBUTION_ENTRIES = 8;

export function calculateWatchlistStats({
  activeFilms,
  watchedFromWatchlistCount,
  now,
}: CalculateWatchlistStatsInput): WatchlistStats {
  const hasActiveFilms = activeFilms.length > 0;

  return {
    remainingCount: availableStat(activeFilms.length),
    watchedCount: availableStat(watchedFromWatchlistCount),
    averageAgeDays: hasActiveFilms
      ? availableStat(averageAgeInDays(activeFilms, now))
      : unavailableStat(
          "Add films to your watchlist to see their average age.",
        ),
    oldestAdditions: hasActiveFilms
      ? availableStat(oldestOrNewest(activeFilms, "oldest"))
      : unavailableStat("No active watchlist films."),
    newestAdditions: hasActiveFilms
      ? availableStat(oldestOrNewest(activeFilms, "newest"))
      : unavailableStat("No active watchlist films."),
    decadeDistribution: distributionStat(
      activeFilms,
      (film) =>
        film.releaseYear !== null ? [decadeLabel(film.releaseYear)] : [],
      "No films have a known release year yet.",
    ),
    averageRuntimeMinutes: numericAverageStat(
      activeFilms.map((film) => film.runtimeMinutes),
      "No films have a known runtime yet.",
    ),
    totalRemainingRuntimeMinutes: totalStat(
      activeFilms.map((film) => film.runtimeMinutes),
      "No films have a known runtime yet.",
    ),
    genreDistribution: distributionStat(
      activeFilms,
      (film) => film.genres ?? [],
      "No films have known genres yet.",
    ),
    languageDistribution: distributionStat(
      activeFilms,
      (film) => film.languages ?? [],
      "No films have known languages yet.",
    ),
    countryDistribution: distributionStat(
      activeFilms,
      (film) => film.countries ?? [],
      "No films have known countries yet.",
    ),
    directorDistribution: distributionStat(
      activeFilms,
      (film) => film.directors ?? [],
      "No films have known directors yet.",
    ),
    averageExternalRating: numericAverageStat(
      activeFilms.map((film) => film.averageRating),
      "No films have a known rating yet.",
    ),
    ratingDistribution: distributionStat(
      activeFilms,
      (film) =>
        film.averageRating !== null
          ? [ratingBandLabel(film.averageRating)]
          : [],
      "No films have a known rating yet.",
    ),
  };
}

function averageAgeInDays(films: StatsFilmInput[], now: Date): number {
  const totalDays = films.reduce(
    (sum, film) =>
      sum + differenceInCalendarDays(now, parseCalendarDate(film.dateAdded)),
    0,
  );
  return Math.round(totalDays / films.length);
}

function oldestOrNewest(
  films: StatsFilmInput[],
  which: "oldest" | "newest",
): DateAddedEntry[] {
  const sorted = [...films].sort((a, b) => {
    const diff = a.dateAdded.localeCompare(b.dateAdded);
    return which === "oldest" ? diff : -diff;
  });
  return sorted
    .slice(0, MAX_ADDITIONS_SHOWN)
    .map((film) => ({ title: film.title, dateAdded: film.dateAdded }));
}

function decadeLabel(releaseYear: number): string {
  const decade = Math.floor(releaseYear / 10) * 10;
  return `${decade}s`;
}

/** Half-star rating rounded (external ratings may be un-quantized, e.g. a rescaled TMDB score), labeled like "4.5★". */
function ratingBandLabel(rating: number): string {
  const roundedToHalfStar = Math.round(rating * 2) / 2;
  return `${roundedToHalfStar.toFixed(1)}★`;
}

function distributionStat(
  films: StatsFilmInput[],
  extractKeys: (film: StatsFilmInput) => string[],
  unavailableReason: string,
): Stat<DistributionEntry[]> {
  const counts = new Map<string, number>();
  for (const film of films) {
    for (const key of extractKeys(film)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return unavailableStat(unavailableReason);
  }

  const entries = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, MAX_DISTRIBUTION_ENTRIES);

  return availableStat(entries);
}

function numericAverageStat(
  values: (number | null)[],
  unavailableReason: string,
): Stat<number> {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) {
    return unavailableStat(unavailableReason);
  }
  const average = known.reduce((sum, value) => sum + value, 0) / known.length;
  return availableStat(Math.round(average * 100) / 100);
}

function totalStat(
  values: (number | null)[],
  unavailableReason: string,
): Stat<number> {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) {
    return unavailableStat(unavailableReason);
  }
  return availableStat(known.reduce((sum, value) => sum + value, 0));
}
