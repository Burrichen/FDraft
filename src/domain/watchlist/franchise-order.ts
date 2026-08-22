/**
 * The minimal shape `resolveFranchiseChronologicalPick` needs from a
 * drafting candidate — satisfied by `ChallengeCandidateFilm` (see
 * `src/application/drafts/local-fetch-context.ts`) without importing the
 * whole challenge domain into this file.
 */
export interface FranchiseOrderCandidate {
  watchlistEntryId: string;
  filmId: string;
  releaseYear: number | null;
  collectionId: string | null;
}

/**
 * Applies the "Franchises in chronological order" setting to a single
 * already-rolled pick (see docs/updates, "FRANCHISE CHRONOLOGICAL-ORDER
 * SETTING") — deliberately a small, standalone post-processing step
 * rather than a change to `pickRandomFilms` or the challenge engine
 * itself: "let the normal draft system perform its roll ... this
 * adjustment should happen after the normal roll rather than rewriting
 * the existing rule-generation engine."
 *
 * `pool` must already be narrowed to films that are otherwise eligible —
 * not watched, not already claimed by another slot in this draft, not
 * excluded for any other reason — this function only ever picks from
 * what it's given, and never re-derives eligibility itself.
 *
 * Returns `rolled` unchanged whenever franchise/release-date information
 * is missing or ambiguous for the comparison at hand — "if franchise
 * metadata or release dates are missing/ambiguous, safely keep the
 * original rolled film" — never a guess.
 */
export function resolveFranchiseChronologicalPick<
  T extends FranchiseOrderCandidate,
>(params: { rolled: T; pool: T[] }): T {
  const { rolled, pool } = params;

  // No reliable franchise/collection metadata on the rolled film at all —
  // nothing to reorder against.
  if (!rolled.collectionId || rolled.releaseYear === null) {
    return rolled;
  }

  let earliest = rolled;
  for (const candidate of pool) {
    if (candidate.collectionId !== rolled.collectionId) {
      continue;
    }
    // An ambiguous same-franchise entry (no known release year) can never
    // be judged "earlier" than a known one — skip it rather than guess.
    if (candidate.releaseYear === null) {
      continue;
    }
    if (candidate.releaseYear < earliest.releaseYear!) {
      earliest = candidate;
    }
  }

  return earliest;
}
