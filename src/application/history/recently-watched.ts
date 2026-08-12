import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { DraftDifficulty } from "@/repositories/records";

/**
 * The History page's "Recently Watched" section (see docs/product-spec.md,
 * "HISTORY PAGE REDESIGN", "SECTION ONE — RECENTLY WATCHED"). Built
 * entirely from `WatchedHistoryRecord`/`FilmRecord`/`FilmMetadataRecord` —
 * never the current watchlist — so it satisfies "HISTORY DATA INTEGRITY"
 * (see that section) by construction: a film later removed from, or
 * re-imported into, the watchlist cannot change what this reports about
 * when it was actually watched.
 */
export const RECENTLY_WATCHED_LIMIT = 5;

export interface RecentlyWatchedDraftOrigin {
  draftId: string;
  difficulty: DraftDifficulty;
  /** The challenge slot's display name, or `null` if this was a random pick. */
  challengeName: string | null;
}

export interface RecentlyWatchedFilmView {
  historyId: string;
  filmId: string;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  /** ISO calendar date (YYYY-MM-DD), in the profile's own timezone — see docs/product-spec.md, "WATCHED DATE FORMAT". `null` only for a pre-existing record from before this field was tracked. */
  watchedDate: string | null;
  /** The exact instant this was recorded — what "most recently watched first" actually sorts by, since `watchedDate` alone (a calendar day) can't break ties between same-day watches. */
  watchedAt: string;
  /** Which draft (and challenge slot, if any) this specific watch action completed, or `null` if it was watched outside any draft — "optional challenge/draft origin where relevant" (see docs/product-spec.md). */
  draftOrigin: RecentlyWatchedDraftOrigin | null;
}

async function findDraftOrigin(
  drafts: DraftRepository,
  profileId: string,
  watchlistEntryId: string,
  watchedHistoryId: string,
): Promise<RecentlyWatchedDraftOrigin | null> {
  const items = await drafts.findItemsByWatchlistEntryId(watchlistEntryId);
  const match = items.find(
    (item) => item.watchedHistoryId === watchedHistoryId,
  );
  if (!match) {
    return null;
  }
  const draft = await drafts.getById(profileId, match.draftId);
  if (!draft) {
    return null;
  }
  return {
    draftId: draft.id,
    difficulty: draft.difficulty,
    challengeName: match.challengeId
      ? (challengeRegistry.getById(match.challengeId)?.name ??
        match.challengeId)
      : null,
  };
}

/**
 * The most recently watched films across the whole profile, newest first,
 * capped at `RECENTLY_WATCHED_LIMIT` — see docs/product-spec.md: "Maximum
 * visible records: 5. If fewer exist, show however many exist."
 */
export async function listRecentlyWatchedFilms(
  repos: {
    history: HistoryRepository;
    films: FilmRepository;
    drafts: DraftRepository;
  },
  profileId: string,
): Promise<RecentlyWatchedFilmView[]> {
  const allHistory = await repos.history.listWatchedHistory(profileId);
  const mostRecentFirst = [...allHistory].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const top = mostRecentFirst.slice(0, RECENTLY_WATCHED_LIMIT);

  const films = await Promise.all(
    top.map((entry) => repos.films.getById(entry.filmId)),
  );
  const metadataByFilmId = await repos.films.getMetadataForFilms(
    top.map((entry) => entry.filmId),
  );

  return Promise.all(
    top.map(async (entry, index) => {
      const film = films[index];
      const metadata = mergeLocalFilmMetadata(
        metadataByFilmId.get(entry.filmId) ?? [],
      );
      const draftOrigin = entry.watchlistEntryId
        ? await findDraftOrigin(
            repos.drafts,
            profileId,
            entry.watchlistEntryId,
            entry.id,
          )
        : null;

      return {
        historyId: entry.id,
        filmId: entry.filmId,
        title: film?.title ?? "Untitled",
        releaseYear: film?.releaseYear ?? null,
        runtimeMinutes: metadata.runtimeMinutes,
        posterUrl: metadata.posterUrl,
        watchedDate: entry.watchedDate,
        watchedAt: entry.createdAt,
        draftOrigin,
      };
    }),
  );
}
