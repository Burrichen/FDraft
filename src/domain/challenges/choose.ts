import type { BattleRoyaleState } from "./interactive/battle-royale";
import type { ThreeDoorsState } from "./interactive/three-doors";
import { removeConsumedCandidate } from "./remove-consumed-candidate";
import type { ChallengeRegistry } from "./registry";
import type {
  ChallengeCandidateFilm,
  ChallengeContext,
  ChallengeResult,
} from "./types";

/**
 * "Choose My Challenge" (see docs/product-spec.md, "Choose My Challenge" and
 * "Genre Roulette" — manual genre selection): unlike `generateChallengeFilms`
 * (automatic "Decide For Me"), this never substitutes a different challenge
 * when one fails — the user explicitly picked these, in this order, so a
 * failure just leaves that slot unfilled rather than silently choosing
 * something else on their behalf.
 *
 * Still respects "never produce duplicate draft films": a successful film
 * is removed from the pool before the next chosen challenge runs, and an
 * interactive challenge's *generated candidates* (all 8 Battle Royale
 * films, all 3 Three Doors) are removed too, the moment they're shown —
 * those specific films have already been presented to the user as part of
 * this challenge, so re-offering them elsewhere in the same draft would be
 * confusing and could double-book a film once the interaction resolves.
 */

export interface ChosenChallengeSlotResult {
  challengeId: string;
  result: ChallengeResult;
}

export interface AttemptChosenChallengesParams {
  registry: ChallengeRegistry;
  /** In the order the user filled their challenge slots; duplicates (the same challenge id twice) are allowed. */
  chosenChallengeIds: string[];
  context: Omit<ChallengeContext, "previousPicks">;
}

/** Every film shown to the user as part of a `requires_user_choice` result, regardless of which interactive challenge produced it. */
function extractInteractivePayloadFilms(
  interactionId: string,
  payload: unknown,
): ChallengeCandidateFilm[] {
  if (
    interactionId === "battle-royale" ||
    interactionId === "battle-royale-underdog"
  ) {
    return (payload as BattleRoyaleState).candidates;
  }
  if (interactionId === "three-doors") {
    return (payload as ThreeDoorsState).doors.map((door) => door.film);
  }
  return [];
}

export function attemptChosenChallenges({
  registry,
  chosenChallengeIds,
  context: baseContext,
}: AttemptChosenChallengesParams): { results: ChosenChallengeSlotResult[] } {
  const remainingCandidates = [...baseContext.candidates];
  const previousPicks: ChallengeCandidateFilm[] = [];
  const resultsBySlotIndex = new Map<number, ChosenChallengeSlotResult>();

  for (const [slotIndex, challengeId] of chosenChallengeIds.entries()) {
    const challenge = registry.getById(challengeId);
    if (!challenge) {
      resultsBySlotIndex.set(slotIndex, {
        challengeId,
        result: { status: "failure", reason: "unknown_challenge_id" },
      });
      continue;
    }

    const context: ChallengeContext = {
      ...baseContext,
      candidates: remainingCandidates,
      previousPicks,
    };
    const result = challenge.attempt(context);
    resultsBySlotIndex.set(slotIndex, { challengeId, result });

    if (result.status === "success") {
      previousPicks.push(result.film);
      removeConsumedCandidate(
        remainingCandidates,
        result.film.watchlistEntryId,
      );
    } else if (result.status === "requires_user_choice") {
      const shownFilms = extractInteractivePayloadFilms(
        result.interactionId,
        result.payload,
      );
      for (const shown of shownFilms) {
        removeConsumedCandidate(remainingCandidates, shown.watchlistEntryId);
      }
    }
  }

  const results = chosenChallengeIds.map((_, slotIndex) =>
    resultsBySlotIndex.get(slotIndex)!,
  );
  return { results };
}
