/**
 * A documented, reusable "how different are these two films" score (see
 * docs/product-spec.md, "Palette Cleanser": "Use a documented distance score
 * combining release year distance, runtime distance, genre dissimilarity.
 * Normalise numeric components so one metric cannot dominate solely due to
 * scale.").
 *
 * ## The formula
 *
 * For a pair of films, up to three component distances are computed, each
 * scaled to roughly `[0, 1]`:
 *
 * 1. **Release year distance** — `|yearA - yearB| / releaseYearRange`, where
 *    `releaseYearRange` is the spread (max - min) of release years across
 *    the *relevant comparison pool* (computed once via
 *    `computeDistanceRanges`, not per pair) — a 20-year gap means something
 *    different in a watchlist spanning 1920-2020 than one spanning
 *    2015-2025, so the range is what makes the two comparable.
 * 2. **Runtime distance** — the same min-max normalization, over
 *    `runtimeRange` instead.
 * 3. **Genre dissimilarity** — Jaccard *distance* between the two genre
 *    sets: `1 - |intersection| / |union|`. Already naturally bounded to
 *    `[0, 1]`, so no normalization is needed. Two films sharing every genre
 *    score 0; two films sharing none score 1. Two films that both have no
 *    genre data score 0 (treated as "no evidence of difference" — see below).
 *
 * The final distance is the **mean of whichever components both films
 * actually have data for**. A component is skipped for a pair — not
 * counted as 0, not treated as maximal — whenever either film is missing
 * that field, so missing metadata never invents a value (see
 * docs/product-spec.md, "Data Provider Rule"). If a pair has no comparable
 * dimension at all, distance is defined as 0 (no evidence either way).
 *
 * `releaseYearRange`/`runtimeRange` of 0 (every film in the pool shares the
 * same year or runtime) make that component's distance 0 for every pair,
 * rather than dividing by zero.
 */

export interface DistanceComparable {
  releaseYear: number | null;
  runtimeMinutes: number | null;
  genres: string[] | null;
}

export interface DistanceRanges {
  releaseYearRange: number;
  runtimeRange: number;
}

/** Computes the normalization ranges once over the full relevant pool — see the module doc comment. */
export function computeDistanceRanges(
  films: readonly DistanceComparable[],
): DistanceRanges {
  const years = films
    .map((film) => film.releaseYear)
    .filter((year): year is number => year !== null);
  const runtimes = films
    .map((film) => film.runtimeMinutes)
    .filter((r): r is number => r !== null);
  return {
    releaseYearRange:
      years.length > 0 ? Math.max(...years) - Math.min(...years) : 0,
    runtimeRange:
      runtimes.length > 0 ? Math.max(...runtimes) - Math.min(...runtimes) : 0,
  };
}

/** Jaccard distance between two genre sets — see the module doc comment, component 3. */
function genreJaccardDistance(
  genresA: readonly string[],
  genresB: readonly string[],
): number {
  if (genresA.length === 0 && genresB.length === 0) {
    return 0;
  }
  const setA = new Set(genresA);
  const setB = new Set(genresB);
  const intersectionSize = [...setA].filter((genre) => setB.has(genre)).length;
  const unionSize = new Set([...genresA, ...genresB]).size;
  return 1 - intersectionSize / unionSize;
}

/** The documented distance score between two films — see the module doc comment for the full formula. */
export function filmDistance(
  a: DistanceComparable,
  b: DistanceComparable,
  ranges: DistanceRanges,
): number {
  const components: number[] = [];

  if (a.releaseYear !== null && b.releaseYear !== null) {
    components.push(
      ranges.releaseYearRange > 0
        ? Math.abs(a.releaseYear - b.releaseYear) / ranges.releaseYearRange
        : 0,
    );
  }
  if (a.runtimeMinutes !== null && b.runtimeMinutes !== null) {
    components.push(
      ranges.runtimeRange > 0
        ? Math.abs(a.runtimeMinutes - b.runtimeMinutes) / ranges.runtimeRange
        : 0,
    );
  }
  if (a.genres !== null && b.genres !== null) {
    components.push(genreJaccardDistance(a.genres, b.genres));
  }

  if (components.length === 0) {
    return 0;
  }
  return (
    components.reduce((sum, component) => sum + component, 0) /
    components.length
  );
}
