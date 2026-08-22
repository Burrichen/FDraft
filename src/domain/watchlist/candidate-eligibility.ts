import { hasSuspiciousTitleContainment } from "@/domain/import/title-normalization";

/**
 * Centralized eligibility checks a film must pass before it can enter ANY
 * generated draft (random roll, Freeform batch, or a missing-metadata
 * reroll's replacement pool) — see docs/updates, v1.1.0, "DRAFT CANDIDATE
 * INTEGRITY". Deliberately a single, pure, reusable function so every
 * candidate-fetching path benefits from the same rules rather than each
 * re-implementing its own version (see `application/drafts/
 * local-fetch-context.ts`, the one place all three paths now go through).
 *
 * Every check here fails CLOSED only on positive evidence, never on
 * absence of data — a film FDraft simply hasn't enriched yet must stay
 * eligible (see docs/product-spec.md: "everything else in FDraft works
 * entirely from what's already cached"), except for the one case the
 * bug report explicitly calls out as ambiguous-therefore-reject: a film
 * that's PART OF a known collection but has no known release year of its
 * own, which can't be placed in that collection's timeline at all.
 */

export type CandidateIneligibilityReason =
  | "unreleased"
  | "later_series_entry"
  | "metadata_identity_mismatch"
  | "already_watched";

export interface CandidateEligibilityFilm {
  filmId: string;
  title: string;
  releaseYear: number | null;
  /** ISO calendar date, or `null` if the provider never reported one — see `FilmMetadataRecord.releaseDate`. */
  releaseDate: string | null;
  /** The provider's own release-status string (e.g. "Released"), or `null` if unknown. */
  releaseStatus: string | null;
  collectionId: string | null;
  /** The provider's own matched title for this film's metadata, or `null` if unknown/unenriched — see `FilmMetadataRecord.providerTitle`. */
  providerTitle: string | null;
}

export interface CandidateEligibilityContext {
  now: Date;
  /** collectionId -> release years of entries this profile has already WATCHED in that collection. */
  watchedReleaseYearsByCollectionId: ReadonlyMap<string, readonly number[]>;
  /** collectionId -> release years of OTHER entries in the SAME candidate pool (still unwatched, currently on the watchlist). */
  poolReleaseYearsByCollectionId: ReadonlyMap<string, readonly number[]>;
  /**
   * Every filmId this profile has ever watched. A candidate only reaches
   * this function at all because it's on the profile's ACTIVE watchlist —
   * which should already imply "unwatched" — but see docs/updates, v1.1.1,
   * "Centralise DIY recommendation eligibility": a watchlist-import bug
   * could silently reactivate a watched entry, and this redundant,
   * belt-and-suspenders check catches that (or any future regression like
   * it) here, in the one place every draft/recommendation path already
   * goes through, rather than trusting "on the active watchlist" alone.
   */
  watchedFilmIds: ReadonlySet<string>;
  /**
   * Whether an unstarted later entry in a known collection (see
   * `isUnstartedLaterSeriesEntry` below) should be rejected in favour of an
   * earlier one. Defaults to `true` — every GENERATED/random draft path
   * wants this ("Franchise Debt" and friends, and just not handing someone
   * "Toy Story 3" before "Toy Story"). DIY/manual selection (the DIY Draft
   * grid, and the "Pick Your Own" Challenge Film picker) explicitly sets
   * this `false`: a user manually picking their own films must be able to
   * pick ANY sequel directly — see docs/updates, v1.1.2, "Fix DIY Draft
   * missing watchlist films". Being a later entry in a franchise must never
   * make a film unselectable for manual/DIY picking, only for the engine's
   * own automatic picks.
   */
  applyFranchiseOrderingRule?: boolean;
}

export type CandidateEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: CandidateIneligibilityReason };

/**
 * Whether a film is trustworthily released as of `now` (see docs/updates,
 * v1.2.2, "Fix unreleased-film handling" — future titles like an
 * unenriched "The Batman: Part II (2028)" were still reaching DIY
 * recommendations and draft candidates). The richer provider fields are
 * authoritative when present: an explicit non-"Released" status, or a
 * release date that hasn't arrived yet, are positive evidence the film
 * isn't out. When NEITHER is available (the film hasn't been enriched by
 * a metadata provider at all, or lookup found nothing), this falls back to
 * the plain Letterboxd-imported `releaseYear`: a year strictly AFTER the
 * current one is unambiguous evidence the film can't be out yet, even with
 * zero enrichment. A release year in the current year or earlier is
 * deliberately NOT treated as proof of being released on its own — a
 * same-year film could still be releasing later this year, which is
 * exactly why the richer fields are read first — so that case simply falls
 * through to the existing "no positive evidence either way, stay eligible"
 * policy every other field here follows.
 */
export function isFilmReleased(
  film: Pick<
    CandidateEligibilityFilm,
    "releaseDate" | "releaseStatus" | "releaseYear"
  >,
  now: Date,
): boolean {
  if (film.releaseStatus && film.releaseStatus !== "Released") {
    return false;
  }
  if (film.releaseDate) {
    const parsed = new Date(film.releaseDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime() <= now.getTime();
    }
  }
  if (film.releaseYear !== null && film.releaseYear > now.getFullYear()) {
    return false;
  }
  return true;
}

/**
 * A later entry in a known collection is only drafted once the profile
 * has either watched an earlier entry already, or no earlier entry is
 * visible anywhere in this profile's own local data (watched history or
 * the current watchlist pool) — the app has no way to know about an
 * earlier entry it's never seen, so it can't reasonably gate on one. A
 * collection member with NO known release year of its own is treated as
 * ambiguous and rejected outright — "when ordering is genuinely
 * ambiguous, prefer skipping the candidate rather than confidently
 * including an invalid sequel."
 */
function isUnstartedLaterSeriesEntry(
  film: CandidateEligibilityFilm,
  context: CandidateEligibilityContext,
): boolean {
  if (!film.collectionId) {
    return false;
  }
  if (film.releaseYear === null) {
    return true;
  }

  const watchedYears =
    context.watchedReleaseYearsByCollectionId.get(film.collectionId) ?? [];
  if (watchedYears.some((year) => year < film.releaseYear!)) {
    // An earlier entry has already been watched — this is "continuing
    // the series", not skipping ahead of it.
    return false;
  }

  const poolYears =
    context.poolReleaseYearsByCollectionId.get(film.collectionId) ?? [];
  return poolYears.some((year) => year < film.releaseYear!);
}

/**
 * A defensive re-check against already-persisted metadata, independent
 * of the tightened matching confidence in `film-metadata-matching.ts` —
 * catches a wrong-entity match from before that fix shipped (or any
 * future matching regression) before it ever reaches a draft. `null`
 * `providerTitle` (not yet enriched, or predates this field) is not
 * enough evidence either way, so it's never rejected on that alone.
 */
function hasMetadataIdentityMismatch(film: CandidateEligibilityFilm): boolean {
  if (!film.providerTitle) {
    return false;
  }
  return hasSuspiciousTitleContainment(film.title, film.providerTitle);
}

export function evaluateCandidateEligibility(
  film: CandidateEligibilityFilm,
  context: CandidateEligibilityContext,
): CandidateEligibilityResult {
  if (context.watchedFilmIds.has(film.filmId)) {
    return { eligible: false, reason: "already_watched" };
  }
  if (!isFilmReleased(film, context.now)) {
    return { eligible: false, reason: "unreleased" };
  }
  if (hasMetadataIdentityMismatch(film)) {
    return { eligible: false, reason: "metadata_identity_mismatch" };
  }
  if (
    (context.applyFranchiseOrderingRule ?? true) &&
    isUnstartedLaterSeriesEntry(film, context)
  ) {
    return { eligible: false, reason: "later_series_entry" };
  }
  return { eligible: true };
}
