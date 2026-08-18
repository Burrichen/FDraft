import type { EventEligibilityRules } from "./event-definition";

/**
 * The minimal shape `resolveEligibleCandidates` needs from a drafting
 * candidate — satisfied by `ChallengeCandidateFilm` (the canonical,
 * provider-neutral candidate shape every draft's random pool and
 * challenge engine already operate on — see
 * `src/application/drafts/local-fetch-context.ts`) without importing the
 * whole challenge domain into this file.
 */
export interface EligibilityCandidate {
  watchlistEntryId: string;
  filmId: string;
  genres: string[] | null;
  /** Community/external average rating (NOT the profile's own personal rating) — see `EventEligibilityRules.maxAverageRating`. `null` when this film has no average rating yet (e.g. upcoming/unreleased). */
  averageRating: number | null;
}

/**
 * Generic eligibility engine every event's `eligibilityRules` is
 * evaluated through — mirrors `event-availability.ts`'s `isEventAvailable`
 * (see docs/product-spec.md, event system Phase 2/6): no event name or id
 * appears here, a Halloween-only genre restriction and a hypothetical
 * future event's curated list are just different `EventEligibilityRules`
 * data passed into the exact same check.
 *
 * `requiredGenres`, `curatedFilmIds`, and `maxAverageRating` are
 * independent "sources" of eligibility — evaluated separately, then
 * merged, deduplicating by `watchlistEntryId` so a candidate matching more
 * than one never appears twice. Genre matching is case-insensitive
 * (catalog genre strings are provider-supplied free text, not a closed
 * enum). A candidate with no `averageRating` at all never qualifies
 * through `maxAverageRating` — only through genre/curated instead (see
 * docs/updates, "JANUARY ELIGIBILITY RULES": "upcoming/missing-rating
 * films should therefore only qualify if explicitly curated"). All rules
 * absent or empty returns `candidates` completely unchanged — the safe
 * default for an event with no curated content configured yet, never a
 * thrown error.
 */
export function resolveEligibleCandidates<T extends EligibilityCandidate>(
  candidates: T[],
  rules: EventEligibilityRules,
): T[] {
  const requiredGenres = rules.requiredGenres ?? [];
  const curatedFilmIds = rules.curatedFilmIds ?? [];
  const maxAverageRating = rules.maxAverageRating ?? null;
  const hasGenreRule = requiredGenres.length > 0;
  const hasCuratedRule = curatedFilmIds.length > 0;
  const hasRatingRule = maxAverageRating !== null;

  if (!hasGenreRule && !hasCuratedRule && !hasRatingRule) {
    return candidates;
  }

  const requiredGenreKeys = new Set(
    requiredGenres.map((genre) => genre.toLowerCase()),
  );
  const curatedFilmIdSet = new Set(curatedFilmIds);

  const sources: T[][] = [];
  if (hasGenreRule) {
    sources.push(
      candidates.filter((candidate) =>
        (candidate.genres ?? []).some((genre) =>
          requiredGenreKeys.has(genre.toLowerCase()),
        ),
      ),
    );
  }
  if (hasCuratedRule) {
    sources.push(
      candidates.filter((candidate) => curatedFilmIdSet.has(candidate.filmId)),
    );
  }
  if (hasRatingRule) {
    sources.push(
      candidates.filter(
        (candidate) =>
          candidate.averageRating !== null &&
          candidate.averageRating <= maxAverageRating,
      ),
    );
  }

  const seen = new Set<string>();
  const result: T[] = [];
  for (const source of sources) {
    for (const candidate of source) {
      if (seen.has(candidate.watchlistEntryId)) {
        continue;
      }
      seen.add(candidate.watchlistEntryId);
      result.push(candidate);
    }
  }
  return result;
}
