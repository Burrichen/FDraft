import type { ChallengeCandidateFilm } from "./types";

/**
 * Removes a consumed film from a candidate pool in place, if present — the
 * shared "never produce duplicate draft films" bookkeeping both
 * `generateChallengeFilms` and `attemptChosenChallenges` apply to every
 * pool they track (the franchise-ordering-restricted `candidates`, and,
 * since v1.1.2, the unrestricted `diyEligibleCandidates`). A no-op when the
 * film isn't in this particular pool — expected whenever a franchise
 * ordering rule already excluded it from `candidates` but not from
 * `diyEligibleCandidates` (see docs/updates, v1.1.2, "Fix DIY Draft
 * missing watchlist films").
 */
export function removeConsumedCandidate(
  pool: ChallengeCandidateFilm[],
  watchlistEntryId: string,
): void {
  const index = pool.findIndex(
    (candidate) => candidate.watchlistEntryId === watchlistEntryId,
  );
  if (index !== -1) {
    pool.splice(index, 1);
  }
}
