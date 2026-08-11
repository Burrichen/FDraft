/**
 * The flattened, presentation-ready shape both the watchlist grid and the
 * random film picker render — mapped once at the server-component boundary
 * from the raw Supabase row + domain/watchlist/film-view.ts's merged
 * metadata, so client components never need to know the DB query shape.
 */
export interface WatchlistFilmCardView {
  entryId: string;
  filmId: string;
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
  posterUrl: string | null;
  averageRating: number | null;
  genres: string[] | null;
}
