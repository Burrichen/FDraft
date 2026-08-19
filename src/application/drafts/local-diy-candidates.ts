import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import type { DiySelectableFilmView } from "@/components/drafts/diy/diy-film-card";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";
import { fetchLocalChallengeCandidates } from "./local-fetch-context";

/**
 * THE canonical eligible-candidate set for every DIY surface — the DIY
 * Draft selection grid, its "Need ideas?" recommendation questions, and
 * the DIY Challenge Film slot picker (see docs/updates, v1.1.1,
 * "Centralise DIY recommendation eligibility"). Every one of them must
 * call this function rather than re-deriving its own film list: it's a
 * thin wrapper around `fetchLocalChallengeCandidates` (the same
 * eligibility every random roll, Freeform batch, and reroll already goes
 * through — active profile, on that profile's watchlist, unwatched,
 * released, not an unstarted later series entry, no metadata identity
 * mismatch), with only the one extra field (`posterUrl`) DIY's own UI
 * needs added on top. A future recommendation question, or a future DIY
 * surface, automatically inherits every protection here for free just by
 * consuming this function's result — it never needs to re-implement or
 * loosen any of it.
 */
export async function getDiyEligibleFilms(
  repos: {
    watchlist: WatchlistRepository;
    films: FilmRepository;
    history: HistoryRepository;
  },
  profileId: string,
): Promise<DiySelectableFilmView[]> {
  const candidates = await fetchLocalChallengeCandidates(repos, profileId);
  const metadataByFilmId = await repos.films.getMetadataForFilms(
    candidates.map((candidate) => candidate.filmId),
  );

  return candidates.map((candidate) => {
    const metadata = mergeLocalFilmMetadata(
      metadataByFilmId.get(candidate.filmId) ?? [],
    );
    return {
      entryId: candidate.watchlistEntryId,
      filmId: candidate.filmId,
      title: candidate.title,
      releaseYear: candidate.releaseYear,
      runtimeMinutes: candidate.runtimeMinutes,
      posterUrl: metadata.posterUrl,
      averageRating: candidate.averageRating,
      dateAdded: candidate.dateAdded,
      genres: candidate.genres,
    };
  });
}
