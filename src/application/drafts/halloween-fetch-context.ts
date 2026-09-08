import { getHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type HalloweenFetchRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  history: HistoryRepository;
};

export interface HalloweenPoolCandidate {
  filmId: string;
  title: string;
  releaseYear: number | null;
  /** The film's own active-watchlist `selectionWeight`, or `null` when it isn't on this profile's watchlist at all — see `preferWatchlist` in `createHalloweenLocalDraft`. */
  watchlistSelectionWeight: number | null;
  /** The profile's active watchlist entry id, or `null` for a curated film that isn't on it — persisted onto the Draft item so both watch paths work (see `createHalloweenLocalDraft`). */
  watchlistEntryId: string | null;
}

/**
 * The Horror or Kitsch pool (see docs/updates, "FDRAFT UPDATE 1 — EVENT
 * WATCHLIST PREFERENCE CLEANUP" §1): every film the global manifest has
 * resolved-or-created locally (see `halloween-manifest-overlay.ts`),
 * excluding anything the profile has already watched — the one universal
 * FDraft invariant worth preserving here. Deliberately does NOT run the
 * richer `evaluateCandidateEligibility` checks (unreleased/franchise-order/
 * identity-mismatch) — those exist for watchlist pool integrity; Horror/
 * Kitsch are curator-maintained one-off picks, not a franchise-ordered
 * watchlist, and don't need them.
 *
 * Also decorates each candidate with its active-watchlist context (the
 * same shape `fetchChristmasCategoryPool` already returns) — watchlist
 * membership is decoration here, never a filter: a curated film nobody has
 * imported is still a perfectly drawable candidate. This is what lets
 * `createHalloweenLocalDraft` honour "Prefer items from my Watchlist"
 * through the same shared `drawPreferringWatchlist` rule Christmas uses.
 */
export async function fetchHalloweenManifestCandidates(
  repos: HalloweenFetchRepos,
  profileId: string,
  filmIds: string[],
): Promise<HalloweenPoolCandidate[]> {
  if (filmIds.length === 0) {
    return [];
  }
  const [films, watchedHistory, activeEntries] = await Promise.all([
    Promise.all(filmIds.map((id) => repos.films.getById(id))),
    repos.history.listWatchedHistory(profileId),
    repos.watchlist.listActiveEntries(profileId),
  ]);
  const watchedFilmIds = new Set(watchedHistory.map((entry) => entry.filmId));
  const entryByFilmId = new Map(
    activeEntries.map((entry) => [entry.filmId, entry]),
  );

  return films
    .filter((film): film is NonNullable<typeof film> => film !== null)
    .filter((film) => !watchedFilmIds.has(film.id))
    .map((film) => {
      const entry = entryByFilmId.get(film.id);
      return {
        filmId: film.id,
        title: film.title,
        releaseYear: film.releaseYear,
        watchlistSelectionWeight: entry?.selectionWeight ?? null,
        watchlistEntryId: entry?.id ?? null,
      };
    });
}

export interface HalloweenPoolCapacity {
  horrorAvailable: number;
  kitschAvailable: number;
  /** How many of each pool are ALSO on the profile's active watchlist — shown alongside the totals so "Prefer items from my Watchlist" has a visible meaning before generating (matching `ChristmasPoolCapacity`). */
  horrorOnWatchlist: number;
  kitschOnWatchlist: number;
}

/**
 * "Horror 58 available (4 on your watchlist) / Kitsch 37 available (2 on
 * your watchlist)" — the Halloween counterpart of
 * `computeChristmasPoolCapacity`, and the same documented simplification:
 * each number is computed INDEPENDENTLY, not cross-pool-deduplicated, so a
 * film curated into both pools counts once in each display total. True
 * non-duplication is guaranteed only at generation time, by
 * `createHalloweenLocalDraft`'s sequential draw.
 */
export async function computeHalloweenPoolCapacity(
  repos: HalloweenFetchRepos,
  profileId: string,
): Promise<HalloweenPoolCapacity> {
  const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
  const [horror, kitsch] = await Promise.all([
    fetchHalloweenManifestCandidates(repos, profileId, horrorFilmIds),
    fetchHalloweenManifestCandidates(repos, profileId, kitschFilmIds),
  ]);
  const onWatchlist = (pool: HalloweenPoolCandidate[]) =>
    pool.filter((candidate) => candidate.watchlistEntryId !== null).length;
  return {
    horrorAvailable: horror.length,
    kitschAvailable: kitsch.length,
    horrorOnWatchlist: onWatchlist(horror),
    kitschOnWatchlist: onWatchlist(kitsch),
  };
}
