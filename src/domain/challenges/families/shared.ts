import { percentileSubset, pickWeighted, type Rng } from "@/domain/shared/rng";
import type { ChallengeCandidateFilm } from "../types";

/**
 * Shared building blocks for individual challenge definitions (see
 * docs/product-spec.md, "Challenge Catalogue"). Kept separate from
 * `generate.ts` (slot-filling orchestration) and `registry.ts` (lookup) so
 * "candidate filtering" stays its own layer, per "Implementation Style":
 * selection, execution, filtering, and presentation are separate concerns.
 */

/**
 * Weighted random pick respecting `selectionWeight` (see
 * docs/product-spec.md, "Selection Weights") — the default for challenges
 * that pick "randomly" among an eligible pool with no single explicitly
 * defined winner (e.g. "a random film with rating < 3.0"). Challenges that
 * DO define an explicit winner (oldest, highest-rated, shortest, closest to
 * a target) should use `filterByExtreme` + `pickUniformFilm` instead, so a
 * tie among true winners isn't biased by weight — see the "unless the
 * challenge explicitly defines a winner" carve-out in the same spec section.
 */
export function pickWeightedFilm(
  films: readonly ChallengeCandidateFilm[],
  rng: Rng,
): ChallengeCandidateFilm {
  return pickWeighted(
    films.map((film) => ({ film, weight: film.selectionWeight })),
    rng,
  ).film;
}

export function toDecade(releaseYear: number): number {
  return Math.floor(releaseYear / 10) * 10;
}

export function groupBy<T, K>(
  items: readonly T[],
  keyFn: (item: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/** Films with a known (non-null) release year, narrowed so callers can read `releaseYear` as `number`. */
export function withKnownReleaseYear(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { releaseYear: number })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { releaseYear: number } =>
      film.releaseYear !== null,
  );
}

/** Films with a known (non-null) runtime, narrowed so callers can read `runtimeMinutes` as `number`. */
export function withKnownRuntime(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { runtimeMinutes: number })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { runtimeMinutes: number } =>
      film.runtimeMinutes !== null,
  );
}

/** Films with a known (non-null) average rating, narrowed so callers can read `averageRating` as `number`. */
export function withKnownRating(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { averageRating: number })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { averageRating: number } =>
      film.averageRating !== null,
  );
}

/** Films with a known (non-null) watch count, narrowed so callers can read `watchCount` as `number`. */
export function withKnownWatchCount(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { watchCount: number })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { watchCount: number } =>
      film.watchCount !== null,
  );
}

/** Films with a known (non-null) fans count, narrowed so callers can read `fansCount` as `number`. */
export function withKnownFansCount(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { fansCount: number })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { fansCount: number } =>
      film.fansCount !== null,
  );
}

/** Films with a known (non-null) list-appearances count, narrowed so callers can read `listAppearances` as `number`. */
export function withKnownListAppearances(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { listAppearances: number })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { listAppearances: number } =>
      film.listAppearances !== null,
  );
}

/** Films with a known (non-null) popularity score, narrowed so callers can read `popularity` as `number`. */
export function withKnownPopularity(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { popularity: number })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { popularity: number } =>
      film.popularity !== null,
  );
}

/** Films with a known (non-null, non-empty) genre list, narrowed so callers can read `genres` as `string[]`. */
export function withKnownGenres(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { genres: string[] })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { genres: string[] } =>
      film.genres !== null && film.genres.length > 0,
  );
}

/** Films with a known (non-null, non-empty) director list, narrowed so callers can read `directors` as `string[]`. */
export function withKnownDirectors(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { directors: string[] })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { directors: string[] } =>
      film.directors !== null && film.directors.length > 0,
  );
}

/** Films with a known (non-null, non-empty) country list, narrowed so callers can read `countries` as `string[]`. */
export function withKnownCountries(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { countries: string[] })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { countries: string[] } =>
      film.countries !== null && film.countries.length > 0,
  );
}

/** Films with a known (non-null, non-empty) language list, narrowed so callers can read `languages` as `string[]`. */
export function withKnownLanguages(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { languages: string[] })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { languages: string[] } =>
      film.languages !== null && film.languages.length > 0,
  );
}

/** Films with a known (non-null) primary/original language, narrowed so callers can read `primaryLanguage` as `string`. */
export function withKnownPrimaryLanguage(
  films: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { primaryLanguage: string })[] {
  return films.filter(
    (film): film is ChallengeCandidateFilm & { primaryLanguage: string } =>
      film.primaryLanguage !== null,
  );
}

/** Sorts by `keyFn` ascending, then takes the fractional head — e.g. "bottom 25% by watch count" (see "Cult Classic"). */
export function percentileSubsetAscendingBy<T>(
  items: readonly T[],
  keyFn: (item: T) => number,
  fraction: number,
): T[] {
  const sorted = [...items].sort((a, b) => keyFn(a) - keyFn(b));
  return percentileSubset(sorted, fraction);
}

/**
 * Tallies how many items carry each value of a multi-value field (genres,
 * directors, countries, ...). Not constrained to `ChallengeCandidateFilm` —
 * `lottery.ts` reuses this for `ChallengeWatchedFilmRecord` genre tallies too.
 */
export function countOccurrences<T>(
  items: readonly T[],
  valuesFn: (item: T) => string[] | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const value of valuesFn(item) ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** Items whose multi-value field (genres, directors, countries, ...) includes `value`. */
export function filmsContaining<T>(
  items: readonly T[],
  valuesFn: (item: T) => string[] | null,
  value: string,
): T[] {
  return items.filter((item) => (valuesFn(item) ?? []).includes(value));
}
