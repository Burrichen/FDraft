import type { DataCapability } from "@/domain/shared/data-capability";

/**
 * What we know about a film before asking a provider to enrich it. Providers
 * should use whichever identifying fields they support (a Letterboxd slug,
 * for instance, is far more reliable than title+year alone).
 */
export interface FilmMetadataLookupInput {
  letterboxdSlug?: string | null;
  letterboxdUri?: string | null;
  title: string;
  releaseYear?: number | null;
}

/**
 * A single provider's enrichment for one film. Every field is optional and
 * nullable: a provider only returns what it actually supports, and this
 * result is stored as one row in `film_metadata` keyed by `provider` — see
 * docs/product-spec.md, "Data Provider Rule". Nothing here should ever be
 * invented to fill a gap.
 */
export interface FilmMetadataResult {
  posterUrl?: string | null;
  runtimeMinutes?: number | null;
  genres?: string[] | null;
  directors?: string[] | null;
  countries?: string[] | null;
  languages?: string[] | null;
  collectionId?: string | null;
  collectionName?: string | null;
  collectionOrder?: number | null;
  averageRating?: number | null;
  popularity?: number | null;
  watchCount?: number | null;
  fansCount?: number | null;
  listAppearances?: number | null;
  externalIds?: Record<string, string> | null;
  /** Full raw provider payload, kept for fields not yet modeled and for debugging. */
  raw?: unknown;
}

/**
 * Adapter boundary between the import pipeline and any external film
 * metadata source. Concrete providers (TMDB, OMDb, a future licensed
 * Letterboxd API, ...) implement this; the import pipeline and challenge
 * engine only ever depend on this interface, never on a specific API (see
 * docs/product-spec.md, "Do not couple challenge logic directly to a
 * particular metadata API").
 *
 * `lookup` keeps its original two-outcome contract — a result, or `null`
 * for "genuinely not found" — for the common case, but a provider may also
 * throw one of the typed errors below for the outcomes that aren't a
 * clean yes/no: `FilmMetadataAmbiguousError` when it found several
 * equally-plausible candidates rather than one confident match, or
 * `FilmMetadataProviderError` for a transient/transport failure (rate
 * limiting, a provider outage, malformed input). This is additive, not a
 * breaking change to the interface — "must not throw for not found, only
 * for genuine failures" always left room for exactly this.
 */
export interface FilmMetadataProvider {
  /** Stable id stored as `film_metadata.provider`, e.g. "tmdb". */
  readonly id: string;
  /** Which capabilities this provider can ever supply, used to explain why a challenge is ineligible without calling it. */
  readonly supportedCapabilities: readonly DataCapability[];
  /** Resolves one film's metadata, or null if the provider has no match. Must not throw for "not found" — only for genuine transport/provider failures (see `FilmMetadataProviderError`) or a genuinely ambiguous result (see `FilmMetadataAmbiguousError`). */
  lookup(input: FilmMetadataLookupInput): Promise<FilmMetadataResult | null>;
}

/** A lean, provider-agnostic summary of one candidate a provider considered but couldn't confidently pick between — see `FilmMetadataAmbiguousError`. */
export interface FilmMetadataCandidateSummary {
  title: string;
  releaseYear: number | null;
  confidence: number;
}

/**
 * Thrown instead of returning a result when a provider found more than one
 * equally-plausible candidate and picking one would be a guess (see
 * docs/product-spec.md's metadata-matching bugfix: "Do NOT blindly choose
 * the first search result"). Distinct from both a real match (`result`)
 * and a real absence (`null`) — the caller decides how to surface this
 * (today: reported as "unresolved", same as not-found, but the candidate
 * list is preserved for a future manual-disambiguation UI).
 */
export class FilmMetadataAmbiguousError extends Error {
  readonly status = "ambiguous" as const;
  constructor(readonly candidates: FilmMetadataCandidateSummary[]) {
    super(`Multiple equally-plausible matches (${candidates.length})`);
    this.name = "FilmMetadataAmbiguousError";
  }
}

export type FilmMetadataProviderFailureStatus =
  "provider-error" | "rate-limited" | "invalid-import-data";

/**
 * Thrown for a genuine transport/provider-side failure — never for "this
 * film isn't in the provider's catalog" (that's a `null` result). Carries
 * enough structure (`status`, optional `httpStatus`/`retryAfterMs`) for
 * callers to distinguish "try again shortly" (`rate-limited`) from "the
 * provider itself is unwell right now" (`provider-error`) from "we sent
 * something the provider couldn't even parse" (`invalid-import-data`),
 * rather than collapsing every failure into one generic error.
 */
export class FilmMetadataProviderError extends Error {
  constructor(
    message: string,
    readonly status: FilmMetadataProviderFailureStatus,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "FilmMetadataProviderError";
  }
}

/**
 * A provider that supplies nothing. Used as the default until a real
 * provider is wired up (see docs/product-spec.md implementation log, Phase
 * 1): imports still work end to end, they just carry no enrichment, which
 * is exactly the "never invent missing data" contract every other provider
 * must also honor for fields it doesn't support.
 */
export const nullFilmMetadataProvider: FilmMetadataProvider = {
  id: "none",
  supportedCapabilities: [],
  async lookup() {
    return null;
  },
};
