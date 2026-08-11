import type { FilmMetadataRecord } from "@/repositories/records";

/**
 * A film's metadata merged across every provider that has enriched it (see
 * docs/product-spec.md, "Data Provider Rule" — `film_metadata` keeps one
 * record per (film, provider) so no provider's data ever overwrites
 * another's). Every field stays nullable: a field null here means no
 * provider has ever supplied it, not that it was fabricated as empty. Most
 * recently enriched provider wins, field by field, when more than one has
 * supplied the same one — there is no hardcoded provider priority order.
 *
 * Formerly two near-identical implementations existed — one against a
 * Supabase row, one against `FilmMetadataRecord` — until Prompt 9.5B
 * removed the Supabase-backed app entirely; this is the one that's left.
 */
export interface MergedFilmMetadata {
  posterUrl: string | null;
  runtimeMinutes: number | null;
  genres: string[] | null;
  directors: string[] | null;
  countries: string[] | null;
  languages: string[] | null;
  collectionId: string | null;
  collectionName: string | null;
  collectionOrder: number | null;
  averageRating: number | null;
  popularity: number | null;
  watchCount: number | null;
  fansCount: number | null;
  listAppearances: number | null;
}

const EMPTY_MERGED_METADATA: MergedFilmMetadata = {
  posterUrl: null,
  runtimeMinutes: null,
  genres: null,
  directors: null,
  countries: null,
  languages: null,
  collectionId: null,
  collectionName: null,
  collectionOrder: null,
  averageRating: null,
  popularity: null,
  watchCount: null,
  fansCount: null,
  listAppearances: null,
};

export function mergeLocalFilmMetadata(
  records: FilmMetadataRecord[],
): MergedFilmMetadata {
  const byRecency = [...records].sort(
    (a, b) =>
      new Date(b.lastEnrichedAt).getTime() -
      new Date(a.lastEnrichedAt).getTime(),
  );

  const merged = { ...EMPTY_MERGED_METADATA };
  for (const record of byRecency) {
    if (merged.posterUrl === null) merged.posterUrl = record.posterUrl;
    if (merged.runtimeMinutes === null)
      merged.runtimeMinutes = record.runtimeMinutes;
    if (merged.genres === null) merged.genres = record.genres;
    if (merged.directors === null) merged.directors = record.directors;
    if (merged.countries === null) merged.countries = record.countries;
    if (merged.languages === null) merged.languages = record.languages;
    if (merged.collectionId === null) merged.collectionId = record.collectionId;
    if (merged.collectionName === null)
      merged.collectionName = record.collectionName;
    if (merged.collectionOrder === null)
      merged.collectionOrder = record.collectionOrder;
    if (merged.averageRating === null)
      merged.averageRating = record.averageRating;
    if (merged.popularity === null) merged.popularity = record.popularity;
    if (merged.watchCount === null) merged.watchCount = record.watchCount;
    if (merged.fansCount === null) merged.fansCount = record.fansCount;
    if (merged.listAppearances === null)
      merged.listAppearances = record.listAppearances;
  }
  return merged;
}
