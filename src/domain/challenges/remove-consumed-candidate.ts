import type { ChallengeCandidateFilm } from "./types";

/**
 * Removes a consumed film from a candidate pool in place, if present — the
 * shared "never produce duplicate draft films" bookkeeping both
 * `generateChallengeFilms` and `attemptChosenChallenges` apply to the
 * franchise-ordering-restricted `candidates` pool they track. A no-op when
 * the film isn't in the pool.
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
