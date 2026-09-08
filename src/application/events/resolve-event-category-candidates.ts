import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { getEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import { pickRandomFilm } from "@/domain/watchlist/random-pick";
import type { Rng } from "@/domain/shared/rng";
import { createDefaultRng } from "@/domain/shared/rng";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type EventCategoryRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  history: HistoryRepository;
};

export interface EventCategoryCandidate {
  filmId: string;
  title: string;
  releaseYear: number | null;
}

/**
 * A category's full curated pool, resolved to real local films and
 * filtered to unwatched — the generic, event-id/category-key-parameterized
 * equivalent of `fetchHalloweenManifestCandidates`
 * (`halloween-fetch-context.ts`), reused by Halloween AND Christmas alike
 * (see docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING").
 * Deliberately does NOT run the richer `evaluateCandidateEligibility`
 * checks (unreleased/franchise-order/identity-mismatch) — same reasoning
 * as the Halloween original: these are curator-maintained one-off picks,
 * not a franchise-ordered watchlist.
 */
export async function fetchEventCategoryCandidates(
  repos: { films: FilmRepository; history: HistoryRepository },
  params: { eventId: string; categoryKey: string; profileId: string },
): Promise<EventCategoryCandidate[]> {
  const filmIds =
    getEventCategoryFilmIds(params.eventId)[params.categoryKey] ?? [];
  if (filmIds.length === 0) {
    return [];
  }
  const [films, watchedHistory] = await Promise.all([
    Promise.all(filmIds.map((id) => repos.films.getById(id))),
    repos.history.listWatchedHistory(params.profileId),
  ]);
  const watchedFilmIds = new Set(watchedHistory.map((entry) => entry.filmId));

  return films
    .filter((film): film is NonNullable<typeof film> => film !== null)
    .filter((film) => !watchedFilmIds.has(film.id))
    .map((film) => ({
      filmId: film.id,
      title: film.title,
      releaseYear: film.releaseYear,
    }));
}

export type PickEventCategoryRandomFilmOutcome =
  | {
      ok: true;
      film: EventCategoryCandidate & {
        posterUrl: string | null;
        runtimeMinutes: number | null;
        averageRating: number | null;
      };
    }
  | { ok: false; error: "nothing_available"; message: string };

/**
 * "Random" for a category-based Event (see docs/updates, "FDRAFT UPDATE 1
 * — EVENT ONE AT A TIME DRAFTING" §5/§7/§12) — the new "Prefer Watchlist"
 * logic: when `preferWatchlist` is on, intersects the category's curated
 * film ids with the profile's ACTIVE watchlist (by `filmId`); if that
 * intersection is non-empty, picks from it, weighted by each entry's real
 * `selectionWeight` (these ARE real watchlist rows); otherwise falls back
 * to the full category, weighted flat `1` each (matching the existing
 * off-watchlist convention `halloween-draft-service.ts` already uses for
 * Horror/Kitsch). `excludeFilmIds` covers every already-staged film in
 * this builder session, including the current candidate on a Reroll — the
 * caller decides that, exactly like the normal One At A Time flow's own
 * `pickOneAtATimeRandomFilm`.
 */
export async function pickEventCategoryRandomFilm(
  repos: EventCategoryRepos,
  params: {
    profileId: string;
    eventId: string;
    categoryKey: string;
    excludeFilmIds: readonly string[];
    preferWatchlist: boolean;
  },
  deps: { rng?: Rng } = {},
): Promise<PickEventCategoryRandomFilmOutcome> {
  const rng = deps.rng ?? createDefaultRng();
  const excluded = new Set(params.excludeFilmIds);

  const categoryCandidates = (
    await fetchEventCategoryCandidates(repos, {
      eventId: params.eventId,
      categoryKey: params.categoryKey,
      profileId: params.profileId,
    })
  ).filter((candidate) => !excluded.has(candidate.filmId));

  let pool = categoryCandidates.map((candidate) => ({
    id: candidate.filmId,
    weight: 1,
  }));

  if (params.preferWatchlist) {
    const activeEntries = await repos.watchlist.listActiveEntries(
      params.profileId,
    );
    const weightByFilmId = new Map(
      activeEntries.map((entry) => [entry.filmId, entry.selectionWeight]),
    );
    const intersected = categoryCandidates.filter((candidate) =>
      weightByFilmId.has(candidate.filmId),
    );
    if (intersected.length > 0) {
      pool = intersected.map((candidate) => ({
        id: candidate.filmId,
        weight: weightByFilmId.get(candidate.filmId)!,
      }));
    }
  }

  const pickedFilmId = pickRandomFilm(pool, rng);
  if (pickedFilmId === null) {
    return {
      ok: false,
      error: "nothing_available",
      message: "No more eligible films are available in this category.",
    };
  }

  const picked = categoryCandidates.find(
    (candidate) => candidate.filmId === pickedFilmId,
  )!;
  const metadata = mergeLocalFilmMetadata(
    await repos.films.getMetadataForFilm(picked.filmId),
  );
  return {
    ok: true,
    film: {
      ...picked,
      posterUrl: metadata.posterUrl,
      runtimeMinutes: metadata.runtimeMinutes,
      averageRating: metadata.averageRating,
    },
  };
}

export interface EventCategoryPickerCandidate {
  filmId: string;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
  posterUrl: string | null;
  categoryKey: string;
  /** Also on the profile's active watchlist — used to sort/highlight watchlist films first (see §6/§12: "Watchlist films highlighted/first"). */
  onWatchlist: boolean;
}

/**
 * The full "Choose My Own" candidate list for one category — every
 * unwatched curated film, tagged `onWatchlist` so the picker UI can sort/
 * highlight the intersection first, then the rest. `excludeFilmIds` is
 * this builder session's already-staged films (duplicate prevention, §13).
 */
export async function resolveEventCategoryPickerCandidates(
  repos: EventCategoryRepos,
  params: {
    profileId: string;
    eventId: string;
    categoryKey: string;
    excludeFilmIds: readonly string[];
  },
): Promise<EventCategoryPickerCandidate[]> {
  const excluded = new Set(params.excludeFilmIds);
  const [candidates, activeEntries] = await Promise.all([
    fetchEventCategoryCandidates(repos, params),
    repos.watchlist.listActiveEntries(params.profileId),
  ]);
  const watchlistFilmIds = new Set(activeEntries.map((entry) => entry.filmId));
  const filtered = candidates.filter(
    (candidate) => !excluded.has(candidate.filmId),
  );
  const metadataByFilmId = await repos.films.getMetadataForFilms(
    filtered.map((candidate) => candidate.filmId),
  );

  return filtered.map((candidate) => {
    const metadata = mergeLocalFilmMetadata(
      metadataByFilmId.get(candidate.filmId) ?? [],
    );
    return {
      filmId: candidate.filmId,
      title: candidate.title,
      releaseYear: candidate.releaseYear,
      runtimeMinutes: metadata.runtimeMinutes,
      averageRating: metadata.averageRating,
      posterUrl: metadata.posterUrl,
      categoryKey: params.categoryKey,
      onWatchlist: watchlistFilmIds.has(candidate.filmId),
    };
  });
}
