import type { Rng } from "@/domain/shared/rng";
import { pickRandomFilms } from "@/domain/watchlist/random-pick";

export interface PreferWatchlistDrawCandidate {
  filmId: string;
  /** The profile's active-watchlist entry id for this film, or `null` when it isn't on the watchlist at all. */
  watchlistEntryId: string | null;
  /** The film's own active-watchlist `selectionWeight`, or `null` when it isn't on the watchlist. */
  watchlistSelectionWeight: number | null;
}

/**
 * The shared "Prefer items from my Watchlist" draw rule for every Event's
 * fixed-size automatic Draft builder (see docs/updates, "FDRAFT UPDATE 1 —
 * EVENT WATCHLIST PREFERENCE CLEANUP" §6/§10) — ONE generic algorithm
 * shared by Halloween and Christmas, not a per-Event reimplementation
 * (§10: "the preference algorithm remains generic"). Originally
 * Christmas-only (`christmas-draft-service.ts`'s own `drawFromPool`);
 * extracted here so Halloween's Horror/Kitsch pools — purely curated,
 * exactly like Christmas's Classic/Christmas Adjacent, now that the
 * watchlist-derived Halloween-adjacent pool is gone — can reuse the exact
 * same, already-tested rule instead of a second copy.
 *
 * `preferWatchlist` off: the whole pool draws in one flat-weighted pass.
 * `preferWatchlist` on: draws in two passes — first the intersection of
 * this pool and the profile's active watchlist, weighted by each entry's
 * real `selectionWeight` (these are real watchlist rows); then, only if
 * that intersection couldn't fill the requested count, tops up the
 * remaining slots from the rest of the pool, flat-weighted. Never fails
 * the Draft for lack of Watchlist overlap — a genuine preference, never a
 * requirement (§6: "Do not fail the Draft").
 *
 * Caller has already verified `pool.length >= count`, so this always
 * returns exactly `count` candidates.
 */
export function drawPreferringWatchlist<T extends PreferWatchlistDrawCandidate>(
  pool: T[],
  count: number,
  preferWatchlist: boolean,
  rng: Rng,
): T[] {
  if (count === 0) {
    return [];
  }
  const byFilmId = new Map(
    pool.map((candidate) => [candidate.filmId, candidate]),
  );
  const take = (candidates: T[], howMany: number, weighted: boolean): T[] =>
    pickRandomFilms(
      candidates.map((candidate) => ({
        id: candidate.filmId,
        weight: weighted ? (candidate.watchlistSelectionWeight ?? 1) : 1,
      })),
      howMany,
      rng,
    ).map((filmId) => byFilmId.get(filmId)!);

  if (!preferWatchlist) {
    return take(pool, count, false);
  }

  // Pass one: the pool ∩ the active watchlist, weighted by each entry's
  // real `selectionWeight`.
  const onWatchlist = pool.filter(
    (candidate) => candidate.watchlistEntryId !== null,
  );
  const preferred = take(
    onWatchlist,
    Math.min(count, onWatchlist.length),
    true,
  );
  if (preferred.length >= count) {
    return preferred;
  }

  // Pass two: top up the remaining slots from the rest of the pool,
  // flat-weighted — this is what keeps the toggle a preference rather
  // than a requirement.
  const chosenFilmIds = new Set(preferred.map((candidate) => candidate.filmId));
  const rest = pool.filter((candidate) => !chosenFilmIds.has(candidate.filmId));
  return [...preferred, ...take(rest, count - preferred.length, false)];
}
