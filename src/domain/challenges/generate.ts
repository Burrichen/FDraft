import { shuffle } from "@/domain/shared/rng";
import type { ChallengeAttemptStatus } from "@/repositories";
import { logChallengeAttempt, type ChallengeAttemptLogEvent } from "./logger";
import type { ChallengeRegistry } from "./registry";
import type { ChallengeCandidateFilm, ChallengeContext } from "./types";

/**
 * Automatic ("Decide My Challenge For Me") draft challenge generation (see
 * docs/product-spec.md, "Decide My Challenge For Me" and "Challenge
 * Architecture"). Fills `slotCount` challenge slots one at a time:
 *
 * - each slot tries eligible challenges in a random order, preferring ones
 *   not already used elsewhere in this draft ("avoid duplicate challenges
 *   within a draft where possible" — duplicates are only allowed once the
 *   unused pool for that slot is exhausted);
 * - a successful film is removed from the pool immediately, so no later
 *   slot (in this call, or a different challenge within the same slot) can
 *   ever pick it again — "never produce duplicate draft films";
 * - `maxAttemptsPerSlot` bounds how many distinct challenges one slot will
 *   try before giving up on it and moving to the next slot. Combined with
 *   the fixed `slotCount`, total work is bounded by
 *   `slotCount * maxAttemptsPerSlot` — there is no path to an infinite
 *   loop, and a slot that can't be filled is simply left unfilled rather
 *   than retried forever.
 *
 * This function only decides *which films* fill challenge slots — it does
 * not touch the database. Persisting `attempts` to `draft_challenge_attempts`
 * and turning `slots` into `draft_items` rows is the caller's job.
 */
export interface GenerateChallengeFilmsParams {
  registry: ChallengeRegistry;
  /** How many challenge slots to attempt to fill. */
  slotCount: number;
  /**
   * Shared context minus the parts this function manages itself
   * (`candidates` shrinks as films are used; `previousPicks` grows).
   */
  context: Omit<ChallengeContext, "previousPicks">;
  /** Distinct challenges to try per slot before giving up on it. Default 10. */
  maxAttemptsPerSlot?: number;
}

export interface ChallengeSlotResult {
  challengeId: string;
  film: ChallengeCandidateFilm;
  displayValue?: Record<string, unknown>;
}

export interface GenerateChallengeFilmsResult {
  /** One entry per successfully filled slot, in fill order. */
  slots: ChallengeSlotResult[];
  /** Every attempt made across every slot, in order — the full audit trail. */
  attempts: ChallengeAttemptLogEvent[];
  /** How many of `slotCount` slots could not be filled within the attempt bound. */
  unfulfilledSlotCount: number;
}

const DEFAULT_MAX_ATTEMPTS_PER_SLOT = 10;

/** challenge_id used for the synthetic log line emitted when a slot has no eligible challenges at all — never a real catalogue id. */
const NO_ELIGIBLE_CHALLENGES_MARKER = "__no_eligible_challenges__";

export function generateChallengeFilms({
  registry,
  slotCount,
  context: baseContext,
  maxAttemptsPerSlot = DEFAULT_MAX_ATTEMPTS_PER_SLOT,
}: GenerateChallengeFilmsParams): GenerateChallengeFilmsResult {
  const remainingCandidates = [...baseContext.candidates];
  const previousPicks: ChallengeCandidateFilm[] = [];
  const usedChallengeIds = new Set<string>();
  const slots: ChallengeSlotResult[] = [];
  const attempts: ChallengeAttemptLogEvent[] = [];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    if (remainingCandidates.length === 0) {
      break;
    }

    const context: ChallengeContext = {
      ...baseContext,
      candidates: remainingCandidates,
      previousPicks,
    };
    const eligible = registry.listEligible(context);
    if (eligible.length === 0) {
      const event: ChallengeAttemptLogEvent = {
        challengeId: NO_ELIGIBLE_CHALLENGES_MARKER,
        status: "ineligible",
        attemptNumber: 1,
        reason: "no_eligible_challenges_remaining",
      };
      attempts.push(event);
      logChallengeAttempt(event);
      break;
    }

    const unusedEligible = eligible.filter((c) => !usedChallengeIds.has(c.id));
    const pool = unusedEligible.length > 0 ? unusedEligible : eligible;
    const order = shuffle(pool, context.rng);
    const attemptLimit = Math.min(maxAttemptsPerSlot, order.length);

    let filled = false;
    for (let attemptIndex = 0; attemptIndex < attemptLimit; attemptIndex++) {
      const challenge = order[attemptIndex];
      const result = challenge.attempt(context);
      const attemptNumber = attemptIndex + 1;

      if (result.status === "success") {
        const event: ChallengeAttemptLogEvent = {
          challengeId: challenge.id,
          status: "success",
          attemptNumber,
          selectedFilmId: result.film.filmId,
        };
        attempts.push(event);
        logChallengeAttempt(event);

        slots.push({
          challengeId: challenge.id,
          film: result.film,
          displayValue: result.displayValue,
        });
        usedChallengeIds.add(challenge.id);
        previousPicks.push(result.film);
        const usedIndex = remainingCandidates.findIndex(
          (candidate) =>
            candidate.watchlistEntryId === result.film.watchlistEntryId,
        );
        if (usedIndex !== -1) {
          remainingCandidates.splice(usedIndex, 1);
        }
        filled = true;
        break;
      }

      const status: ChallengeAttemptStatus =
        result.status === "requires_user_choice"
          ? "requires_user_choice"
          : result.status;
      const event: ChallengeAttemptLogEvent = {
        challengeId: challenge.id,
        status,
        attemptNumber,
        reason: "reason" in result ? result.reason : undefined,
      };
      attempts.push(event);
      logChallengeAttempt(event);
    }

    if (!filled) {
      continue;
    }
  }

  const unfulfilledSlotCount = slotCount - slots.length;
  return { slots, attempts, unfulfilledSlotCount };
}
