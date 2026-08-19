import type { BattleRoyaleState } from "./interactive/battle-royale";
import type { ThreeDoorsState } from "./interactive/three-doors";
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
 *
 * `"diy"` slots are always resolved FIRST, before any other chosen
 * challenge, regardless of where the user placed them among their slots
 * (see docs/updates, v1.1.1, "DIY Challenge Film"). Every other challenge
 * here draws an unrelated film from the shared candidate pool with no idea
 * a later slot's user has specifically reserved one via
 * `manualSelections.diyFilmEntryIds` — without this, an earlier slot's
 * random/weighted pick could silently consume the exact film the user
 * chose for their DIY slot before it gets a turn, leaving that slot
 * unfulfilled instead of holding the film the user explicitly picked for
 * it. Resolving every `"diy"` slot first lets it claim its film(s) before
 * anything else can. Results are still returned in the caller's original
 * slot order — only the ATTEMPT order changes, not the reported mapping.
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

  // "diy" slots attempt first (see the doc comment above), everything else
  // keeps its original relative order.
  const attemptOrder = chosenChallengeIds
    .map((challengeId, slotIndex) => ({ challengeId, slotIndex }))
    .sort((a, b) => {
      const aIsDiy = a.challengeId === "diy";
      const bIsDiy = b.challengeId === "diy";
      if (aIsDiy === bIsDiy) return a.slotIndex - b.slotIndex;
      return aIsDiy ? -1 : 1;
    });

  for (const { challengeId, slotIndex } of attemptOrder) {
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
      const usedIndex = remainingCandidates.findIndex(
        (candidate) =>
          candidate.watchlistEntryId === result.film.watchlistEntryId,
      );
      if (usedIndex !== -1) {
        remainingCandidates.splice(usedIndex, 1);
      }
    } else if (result.status === "requires_user_choice") {
      const shownFilms = extractInteractivePayloadFilms(
        result.interactionId,
        result.payload,
      );
      for (const shown of shownFilms) {
        const shownIndex = remainingCandidates.findIndex(
          (candidate) => candidate.watchlistEntryId === shown.watchlistEntryId,
        );
        if (shownIndex !== -1) {
          remainingCandidates.splice(shownIndex, 1);
        }
      }
    }
  }

  const results = chosenChallengeIds.map((_, slotIndex) =>
    resultsBySlotIndex.get(slotIndex)!,
  );
  return { results };
}
