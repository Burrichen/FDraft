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
 * released, no metadata identity mismatch), with only the one extra field
 * (`posterUrl`) DIY's own UI needs added on top. A future recommendation
 * question, or a future DIY surface, automatically inherits every
 * protection here for free just by consuming this function's result — it
 * never needs to re-implement or loosen any of it.
 *
 * Deliberately passes `applyFranchiseOrderingRule: false` — see
 * docs/updates, v1.1.2, "Fix DIY Draft missing watchlist films": unlike a
 * generated/random draft, DIY is manual selection, so a later entry in a
 * franchise (e.g. a third or seventh Mission: Impossible film) must stay
 * selectable even when an earlier, unwatched entry is also on the
 * watchlist — that rule exists to stop the ENGINE handing someone a sequel
 * out of order, not to stop a user picking one on purpose.
 */
export async function getDiyEligibleFilms(
  repos: {
    watchlist: WatchlistRepository;
    films: FilmRepository;
    history: HistoryRepository;
  },
  profileId: string,
): Promise<DiySelectableFilmView[]> {
  const candidates = await fetchLocalChallengeCandidates(repos, profileId, {
    applyFranchiseOrderingRule: false,
  });
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
