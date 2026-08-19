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
  /** See `FilmMetadataRecord.releaseDate`'s doc comment — deliberately excluded from `hasNoUsableMetadata`'s check below: a film can have full, genuinely usable metadata without a known release date. */
  releaseDate: string | null;
  releaseStatus: string | null;
  providerTitle: string | null;
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
  releaseDate: null,
  releaseStatus: null,
  providerTitle: null,
};

/** The fields `hasNoUsableMetadata` actually checks — display-relevant fields only. `releaseDate`/`releaseStatus`/`providerTitle` are eligibility/validation-only signals, not "usable metadata" in the sense that feature cares about (a film can be fully watchable/displayable without a known release date). */
const USABLE_METADATA_KEYS: (keyof MergedFilmMetadata)[] = [
  "posterUrl",
  "runtimeMinutes",
  "genres",
  "directors",
  "countries",
  "languages",
  "collectionId",
  "collectionName",
  "collectionOrder",
  "averageRating",
  "popularity",
  "watchCount",
  "fansCount",
  "listAppearances",
];

/**
 * Whether a film genuinely has no usable metadata at all — every field
 * `mergeLocalFilmMetadata` can populate is null (see docs/updates,
 * "MISSING-METADATA REROLL": "use the project's existing metadata
 * structure to determine whether a film genuinely has no metadata rather
 * than checking only one arbitrary field"). A film with, say, only a
 * poster but nothing else still counts as having usable metadata — this
 * is specifically for the "nothing came back from any provider at all"
 * case a reroll exists for.
 */
export function hasNoUsableMetadata(metadata: MergedFilmMetadata): boolean {
  return USABLE_METADATA_KEYS.every((key) => metadata[key] === null);
}

/**
 * Whether two records' `externalIds` give any POSITIVE evidence of
 * pointing at different real-world entities — agreeing (or one/both
 * having no evidence either way) returns `true`. Only a genuine, shared
 * key (e.g. both reporting an `imdb` id) that actually DISAGREES counts
 * as a conflict; a key present in only one of the two proves nothing.
 */
function externalIdsAgree(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (!a || !b) return true;
  return Object.keys(a).every((key) => !(key in b) || a[key] === b[key]);
}

export function mergeLocalFilmMetadata(
  records: FilmMetadataRecord[],
): MergedFilmMetadata {
  const byRecency = [...records].sort(
    (a, b) =>
      new Date(b.lastEnrichedAt).getTime() -
      new Date(a.lastEnrichedAt).getTime(),
  );
  // The most-recently-enriched record is this film's authoritative
  // identity — see docs/updates, v1.1.1, "Metadata integrity": "prefer
  // stable provider/media IDs" / "do not merge metadata from similarly
  // titled media." A field-by-field merge across every provider's record
  // is only safe when they all agree on WHICH real-world entity they're
  // describing; an older record whose `externalIds` conflict with the
  // primary one is excluded from the merge entirely rather than letting
  // its fields blend in under the wrong identity. In today's
  // single-provider (TMDB) app this only matters for a genuine re-match
  // race (`film-repository.ts`'s `upsertMetadata` read-then-write isn't
  // atomic) or a future second provider disagreeing about the match —
  // it's a no-op whenever every record already agrees, which is every
  // case observed so far.
  const primary = byRecency[0] ?? null;

  const merged = { ...EMPTY_MERGED_METADATA };
  for (const record of byRecency) {
    if (
      record !== primary &&
      !externalIdsAgree(primary?.externalIds ?? null, record.externalIds)
    ) {
      continue;
    }
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
    if (merged.releaseDate === null)
      merged.releaseDate = record.releaseDate ?? null;
    if (merged.releaseStatus === null)
      merged.releaseStatus = record.releaseStatus ?? null;
    if (merged.providerTitle === null)
      merged.providerTitle = record.providerTitle ?? null;
  }
  return merged;
}
