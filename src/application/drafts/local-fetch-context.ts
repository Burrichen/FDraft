import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import type {
  ChallengeCandidateFilm,
  ChallengeWatchedFilmRecord,
} from "@/domain/challenges/types";
import {
  evaluateCandidateEligibility,
  type CandidateEligibilityFilm,
} from "@/domain/watchlist/candidate-eligibility";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

/**
 * Local equivalent of `src/lib/challenges/fetch-context.ts` +
 * `src/lib/challenges/candidate-mapper.ts` — assembles the exact same
 * provider-neutral `ChallengeCandidateFilm[]`/`ChallengeWatchedFilmRecord[]`
 * shapes the challenge engine (`src/domain/challenges`) already consumes,
 * just sourced from the local repositories instead of Supabase joins. The
 * engine itself (77 challenges, `generateChallengeFilms`,
 * `attemptChosenChallenges`) needed zero changes to work against this —
 * proof that Phase 1's "flat, provider-neutral shape, not a raw DB row"
 * decision paid off exactly as intended for this migration.
 *
 * As of v1.1.0 ("DRAFT CANDIDATE INTEGRITY"), this is also the ONE place
 * `evaluateCandidateEligibility` runs — every candidate returned here has
 * already passed the unreleased/later-series-entry/metadata-identity
 * checks, so every caller (random rolls, Freeform batches, missing-
 * metadata rerolls, and the DIY selection screen) benefits without
 * re-implementing the checks itself. `ChallengeCandidateFilm`'s own shape
 * is deliberately left untouched — the extra fields the eligibility check
 * needs (`releaseDate`/`releaseStatus`/`providerTitle`) are read here and
 * discarded once each candidate has been judged, not threaded through to
 * every existing challenge-family function that already destructures this
 * type.
 *
 * As of v1.1.2, the later-series-entry check is the one piece of this
 * that's opt-out (`options.applyFranchiseOrderingRule`, default `true`) —
 * see docs/updates, v1.1.2, "Fix DIY Draft missing watchlist films": DIY
 * Draft and the "Pick Your Own" Challenge Film picker pass `false` so a
 * user manually picking their own films can select any sequel directly,
 * while every generated/random draft path keeps the default.
 */
export async function fetchLocalChallengeCandidates(
  repos: {
    watchlist: WatchlistRepository;
    films: FilmRepository;
    history: HistoryRepository;
  },
  profileId: string,
  options: {
    /**
     * Defaults to `true` (every generated/random draft path). Pass `false`
     * for DIY/manual-selection callers (see docs/updates, v1.1.2, "Fix DIY
     * Draft missing watchlist films") — a franchise's later entries must
     * stay selectable there even when an earlier, unwatched entry is also
     * on the watchlist.
     */
    applyFranchiseOrderingRule?: boolean;
  } = {},
): Promise<ChallengeCandidateFilm[]> {
  const entries = await repos.watchlist.listActiveEntries(profileId);
  const films = await Promise.all(
    entries.map((entry) => repos.films.getById(entry.filmId)),
  );
  const metadataByFilmId = await repos.films.getMetadataForFilms(
    entries.map((entry) => entry.filmId),
  );

  const { watchedReleaseYearsByCollectionId, watchedFilmIds } =
    await buildWatchedFilmContext(repos, profileId);

  const candidatesWithEligibility = entries.map((entry, index) => {
    const film = films[index];
    const metadata = mergeLocalFilmMetadata(
      metadataByFilmId.get(entry.filmId) ?? [],
    );
    const candidate: ChallengeCandidateFilm = {
      watchlistEntryId: entry.id,
      filmId: entry.filmId,
      title: film?.title ?? "Untitled",
      releaseYear: film?.releaseYear ?? null,
      dateAdded: entry.dateAdded,
      position: entry.position,
      selectionWeight: entry.selectionWeight,
      runtimeMinutes: metadata.runtimeMinutes,
      genres: metadata.genres,
      directors: metadata.directors,
      countries: metadata.countries,
      languages: metadata.languages,
      primaryLanguage: null,
      collectionId: metadata.collectionId,
      collectionOrder: metadata.collectionOrder,
      averageRating: metadata.averageRating,
      popularity: metadata.popularity,
      watchCount: metadata.watchCount,
      fansCount: metadata.fansCount,
      listAppearances: metadata.listAppearances,
    };
    const eligibilityFilm: CandidateEligibilityFilm = {
      filmId: candidate.filmId,
      title: candidate.title,
      releaseYear: candidate.releaseYear,
      releaseDate: metadata.releaseDate,
      releaseStatus: metadata.releaseStatus,
      collectionId: metadata.collectionId,
      providerTitle: metadata.providerTitle,
    };
    return { candidate, eligibilityFilm };
  });

  // The "later series entry" check needs every OTHER pool member's
  // release year per collection — computed from the full, unfiltered set
  // so one ineligible film's presence can't hide behind another's.
  const poolReleaseYearsByCollectionId = new Map<string, number[]>();
  for (const { eligibilityFilm } of candidatesWithEligibility) {
    if (!eligibilityFilm.collectionId || eligibilityFilm.releaseYear === null) {
      continue;
    }
    const years =
      poolReleaseYearsByCollectionId.get(eligibilityFilm.collectionId) ?? [];
    years.push(eligibilityFilm.releaseYear);
    poolReleaseYearsByCollectionId.set(eligibilityFilm.collectionId, years);
  }

  const now = new Date();
  return candidatesWithEligibility
    .filter(({ eligibilityFilm }) => {
      const result = evaluateCandidateEligibility(eligibilityFilm, {
        now,
        watchedReleaseYearsByCollectionId,
        poolReleaseYearsByCollectionId,
        watchedFilmIds,
        applyFranchiseOrderingRule: options.applyFranchiseOrderingRule,
      });
      return result.eligible;
    })
    .map(({ candidate }) => candidate);
}

/**
 * Every filmId this profile has ever watched, plus (derived from the same
 * watched-history query) every collectionId it's watched an entry in,
 * mapped to those entries' release years — the "has an earlier entry
 * already been watched" half of the later-series-entry check, and the
 * redundant "unwatched" guard `evaluateCandidateEligibility` applies to
 * every candidate (see docs/updates, v1.1.1).
 */
async function buildWatchedFilmContext(
  repos: {
    films: FilmRepository;
    history: HistoryRepository;
  },
  profileId: string,
): Promise<{
  watchedFilmIds: Set<string>;
  watchedReleaseYearsByCollectionId: Map<string, number[]>;
}> {
  const historyEntries = await repos.history.listWatchedHistory(profileId);
  const watchedFilmIds = new Set(historyEntries.map((entry) => entry.filmId));
  const filmIds = [...watchedFilmIds];
  const films = await Promise.all(
    filmIds.map((filmId) => repos.films.getById(filmId)),
  );
  const metadataByFilmId = await repos.films.getMetadataForFilms(filmIds);

  const watchedReleaseYearsByCollectionId = new Map<string, number[]>();
  filmIds.forEach((filmId, index) => {
    const film = films[index];
    const metadata = mergeLocalFilmMetadata(metadataByFilmId.get(filmId) ?? []);
    if (!metadata.collectionId || film?.releaseYear == null) {
      return;
    }
    const years =
      watchedReleaseYearsByCollectionId.get(metadata.collectionId) ?? [];
    years.push(film.releaseYear);
    watchedReleaseYearsByCollectionId.set(metadata.collectionId, years);
  });
  return { watchedFilmIds, watchedReleaseYearsByCollectionId };
}

export async function fetchLocalChallengeWatchedFilms(
  repos: { history: HistoryRepository; films: FilmRepository },
  profileId: string,
): Promise<ChallengeWatchedFilmRecord[]> {
  const historyEntries = await repos.history.listWatchedHistory(profileId);
  const ratings = await repos.history.listRatings(profileId);
  const ratingByFilmId = new Map(
    ratings.map((rating) => [rating.filmId, rating.rating]),
  );

  const films = await Promise.all(
    historyEntries.map((entry) => repos.films.getById(entry.filmId)),
  );
  const metadataByFilmId = await repos.films.getMetadataForFilms(
    historyEntries.map((entry) => entry.filmId),
  );

  return historyEntries.map((entry, index) => {
    const film = films[index];
    const metadata = mergeLocalFilmMetadata(
      metadataByFilmId.get(entry.filmId) ?? [],
    );
    const record: ChallengeWatchedFilmRecord = {
      filmId: entry.filmId,
      directors: metadata.directors,
      genres: metadata.genres,
      releaseYear: film?.releaseYear ?? null,
      collectionId: metadata.collectionId,
      userRating: ratingByFilmId.get(entry.filmId) ?? null,
      watchedAt: entry.watchedDate,
    };
    return record;
  });
}
