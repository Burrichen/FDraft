import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import type {
  ChallengeCandidateFilm,
  ChallengeWatchedFilmRecord,
} from "@/domain/challenges/types";
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
 */
export async function fetchLocalChallengeCandidates(
  repos: { watchlist: WatchlistRepository; films: FilmRepository },
  profileId: string,
): Promise<ChallengeCandidateFilm[]> {
  const entries = await repos.watchlist.listActiveEntries(profileId);
  const films = await Promise.all(
    entries.map((entry) => repos.films.getById(entry.filmId)),
  );
  const metadataByFilmId = await repos.films.getMetadataForFilms(
    entries.map((entry) => entry.filmId),
  );

  return entries.map((entry, index) => {
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
    return candidate;
  });
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
