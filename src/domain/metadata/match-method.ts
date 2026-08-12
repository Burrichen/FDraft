/**
 * Distinguishes a `FilmMetadataRecord` the enrichment queue picked
 * automatically (confidence-scored, no human involved) from one a user
 * deliberately chose on the Unresolved Metadata screen (see
 * docs/product-spec.md, "UNRESOLVED METADATA RESOLUTION", "MANUAL
 * OVERRIDE SAFETY"). A manual pick must never be silently overwritten by
 * a later routine "Refresh Old Metadata" pass — see
 * `classifyActiveWatchlistFilms` in `local-metadata-service.ts`, which
 * reads this field to exclude manually-matched films from that bucket.
 */
export type MetadataMatchMethod = "automatic" | "manual";

/**
 * Normalizes a possibly-legacy `FilmMetadataRecord.matchMethod` value.
 * Records written before this field existed have no such property at
 * all — always safe to treat as "automatic" (that's what every one of
 * them actually was), never as "manual" (which would incorrectly shield
 * them from routine refresh forever).
 */
export function resolveMatchMethod(value: unknown): MetadataMatchMethod {
  return value === "manual" ? "manual" : "automatic";
}
