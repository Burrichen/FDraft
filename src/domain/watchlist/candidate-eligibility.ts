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
}

export type CandidateEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: CandidateIneligibilityReason };

/**
 * Positive evidence of NOT being out yet: an explicit non-"Released"
 * status, or a release date that hasn't arrived. `releaseYear` alone
 * (see `FilmRecord.releaseYear`, a plain Letterboxd-imported integer) is
 * never enough on its own to prove or disprove this — a film releasing
 * later this same calendar year is not distinguishable from one that
 * already released earlier this year using the year alone, which is
 * exactly why this reads the richer provider fields instead.
 */
function isConfirmedUnreleased(
  film: CandidateEligibilityFilm,
  now: Date,
): boolean {
  if (film.releaseStatus && film.releaseStatus !== "Released") {
    return true;
  }
  if (film.releaseDate) {
    const parsed = new Date(film.releaseDate);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      return true;
    }
  }
  return false;
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
  if (isConfirmedUnreleased(film, context.now)) {
    return { eligible: false, reason: "unreleased" };
  }
  if (hasMetadataIdentityMismatch(film)) {
    return { eligible: false, reason: "metadata_identity_mismatch" };
  }
  if (isUnstartedLaterSeriesEntry(film, context)) {
    return { eligible: false, reason: "later_series_entry" };
  }
  return { eligible: true };
}
