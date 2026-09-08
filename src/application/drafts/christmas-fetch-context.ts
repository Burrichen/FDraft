import { fetchEventCategoryCandidates } from "@/application/events/resolve-event-category-candidates";
import { getEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import { CHRISTMAS_EVENT_ID } from "@/domain/events/event-registry";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

/** Christmas's two curated category keys — matching `public/events/christmas/films.json` and `EventDefinition.contentPools`. */
export const CHRISTMAS_CATEGORY_KEYS = ["classic", "adjacent"] as const;
export type ChristmasCategoryKey = (typeof CHRISTMAS_CATEGORY_KEYS)[number];

export interface ChristmasPoolCandidate {
  filmId: string;
  title: string;
  releaseYear: number | null;
  /** The film's own active-watchlist `selectionWeight`, or `null` when it isn't on this profile's watchlist at all — see `preferWatchlist` in `createChristmasLocalDraft`. */
  watchlistSelectionWeight: number | null;
  /** The profile's active watchlist entry id, or `null` for a curated film that isn't on it — persisted onto the Draft item so both watch paths work (see `createChristmasLocalDraft`). */
  watchlistEntryId: string | null;
}

type ChristmasFetchRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  history: HistoryRepository;
};

/**
 * One Christmas category's full drawable pool (see docs/updates, "FDRAFT
 * UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §4/§5).
 *
 * Deliberately built on the ALREADY-GENERIC `fetchEventCategoryCandidates`
 * (`resolve-event-category-candidates.ts`) rather than a Christmas copy of
 * `fetchHalloweenManifestCandidates` — that generic function is the one
 * Christmas's own One At A Time flow already draws from, so bulk
 * generation and One At A Time can never disagree about what is in a
 * Christmas pool. All this layer adds is the per-candidate watchlist
 * context bulk generation needs and a single pick does not: the
 * `selectionWeight` to weight by, and the entry id to persist.
 *
 * Watchlist membership is decoration here, never a filter — §5's "No
 * Watchlist requirement". A curated film nobody has imported is still a
 * perfectly drawable candidate, exactly like Halloween's Horror/Kitsch.
 */
export async function fetchChristmasCategoryPool(
  repos: ChristmasFetchRepos,
  params: { profileId: string; categoryKey: ChristmasCategoryKey },
): Promise<ChristmasPoolCandidate[]> {
  const [candidates, activeEntries] = await Promise.all([
    fetchEventCategoryCandidates(repos, {
      eventId: CHRISTMAS_EVENT_ID,
      categoryKey: params.categoryKey,
      profileId: params.profileId,
    }),
    repos.watchlist.listActiveEntries(params.profileId),
  ]);
  const entryByFilmId = new Map(
    activeEntries.map((entry) => [entry.filmId, entry]),
  );

  return candidates.map((candidate) => {
    const entry = entryByFilmId.get(candidate.filmId);
    return {
      filmId: candidate.filmId,
      title: candidate.title,
      releaseYear: candidate.releaseYear,
      watchlistSelectionWeight: entry?.selectionWeight ?? null,
      watchlistEntryId: entry?.id ?? null,
    };
  });
}

export interface ChristmasPoolCapacity {
  classicAvailable: number;
  adjacentAvailable: number;
  /** How many of each pool are ALSO on the profile's active watchlist — shown alongside the totals so "Prefer Watchlist" has a visible meaning before generating (see §5). */
  classicOnWatchlist: number;
  adjacentOnWatchlist: number;
}

/**
 * "Classic 41 available (6 on your watchlist) / Christmas Adjacent 28
 * available (3 on your watchlist)" — the Christmas counterpart of
 * `computeHalloweenPoolCapacity`, and the same documented simplification:
 * each number is computed INDEPENDENTLY, not cross-pool-deduplicated, so a
 * film curated into both categories counts once in each display total.
 * True non-duplication is guaranteed only at generation time, by
 * `createChristmasLocalDraft`'s sequential draw.
 */
export async function computeChristmasPoolCapacity(
  repos: ChristmasFetchRepos,
  profileId: string,
): Promise<ChristmasPoolCapacity> {
  const [classic, adjacent] = await Promise.all([
    fetchChristmasCategoryPool(repos, { profileId, categoryKey: "classic" }),
    fetchChristmasCategoryPool(repos, { profileId, categoryKey: "adjacent" }),
  ]);
  const onWatchlist = (pool: ChristmasPoolCandidate[]) =>
    pool.filter((candidate) => candidate.watchlistEntryId !== null).length;
  return {
    classicAvailable: classic.length,
    adjacentAvailable: adjacent.length,
    classicOnWatchlist: onWatchlist(classic),
    adjacentOnWatchlist: onWatchlist(adjacent),
  };
}

/** Whether Christmas's curated content has resolved into any local films at all yet — used to tell "still loading at app start" apart from "genuinely empty pools". */
export function hasResolvedChristmasContent(): boolean {
  const pools = getEventCategoryFilmIds(CHRISTMAS_EVENT_ID);
  return CHRISTMAS_CATEGORY_KEYS.some((key) => (pools[key] ?? []).length > 0);
}
