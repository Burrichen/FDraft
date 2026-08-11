import {
  pickWeighted,
  weightedSampleWithoutReplacement,
  type Rng,
} from "@/domain/shared/rng";

/**
 * See docs/product-spec.md, "Random Watchlist Film": selection must respect
 * persistent selection-weight boosts and must never select an inactive
 * film. Callers are responsible for only ever passing active watchlist
 * candidates — this function has no way to know "active" on its own.
 */
export interface RandomFilmCandidate {
  id: string;
  weight: number;
}

/**
 * Weighted-random pick among the given candidates. Returns null for an
 * empty list rather than throwing, so a caller can render an empty state
 * (e.g. "your watchlist is empty") instead of crashing — see
 * docs/product-spec.md edge cases: "never get stuck on an empty watchlist".
 *
 * When `excludeId` is given (rerolling) and more than one candidate exists,
 * that film is removed from the pool first so a reroll doesn't just show
 * the same film again. With only one candidate left, excluding it would
 * leave nothing to pick, so it stays eligible — rerolling a one-film
 * watchlist deterministically reselects that film, which is correct, not "stuck".
 */
export function pickRandomFilm(
  candidates: RandomFilmCandidate[],
  rng: Rng,
  excludeId?: string | null,
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const pool =
    excludeId != null && candidates.length > 1
      ? candidates.filter((candidate) => candidate.id !== excludeId)
      : candidates;

  return pickWeighted(pool, rng).id;
}

/**
 * Weighted-random pick of up to `count` *distinct* films — used to fill a
 * Monthly Watchlist Draft's random slots and to generate a Freeform batch
 * (see docs/product-spec.md, "Monthly Watchlist Drafts" and "Freeform
 * Mode"). Returns fewer than `count` ids when the watchlist doesn't have
 * enough active candidates, rather than throwing — a draft with fewer
 * films than requested is a real, handled state, not an error (see
 * docs/product-spec.md edge cases: "fewer watchlist films than difficulty
 * requires").
 */
export function pickRandomFilms(
  candidates: RandomFilmCandidate[],
  count: number,
  rng: Rng,
): string[] {
  return weightedSampleWithoutReplacement(candidates, count, rng).map(
    (candidate) => candidate.id,
  );
}
