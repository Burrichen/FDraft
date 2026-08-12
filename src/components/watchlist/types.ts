/**
 * The flattened, presentation-ready shape both the watchlist grid and the
 * random film picker render — mapped once from the local repositories'
 * `WatchlistEntryRecord` + `mergeLocalFilmMetadata`'s merged metadata, so
 * client components never need to know the underlying local-db query shape.
 */
export interface WatchlistFilmCardView {
  entryId: string;
  filmId: string;
  title: string;
  /** ISO calendar date (YYYY-MM-DD) the film was added to the watchlist — the "Date Added" sort's key (see docs/product-spec.md, "WATCHLIST SORT / FILTER CONTROL"). */
  dateAdded: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  letterboxdUri: string | null;
  posterUrl: string | null;
  averageRating: number | null;
  genres: string[] | null;
  /** Whether any metadata provider has enriched this film at all — the "Metadata available/missing" filter's key (see docs/product-spec.md, "WATCHLIST SORT / FILTER CONTROL"). */
  hasMetadata: boolean;
}
