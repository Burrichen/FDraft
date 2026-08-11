import {
  weightedSampleWithoutReplacement,
  type Rng,
} from "@/domain/shared/rng";
import type { ChallengeCandidateFilm } from "../types";

/**
 * The Battle Royale interactive state machine (see docs/product-spec.md,
 * "Battle Royale" and "Battle Royale Variant"). Pure, framework/DB-
 * independent transitions — `src/lib/challenges/interactive-state.ts` is
 * what persists a `BattleRoyaleState` snapshot so the flow survives a page
 * reload; this module only knows how to move from one valid state to the
 * next given a user's choice.
 *
 * Flow: generate 8 candidates -> user picks their MOST anticipated -> user
 * picks their LEAST anticipated from the remaining 7 -> resolved. The
 * "standard" variant's winner is the most-anticipated pick; the "underdog"
 * variant's winner is the least-anticipated pick (see "Battle Royale
 * Variant" — same user-facing flow, opposite winner).
 */

export const BATTLE_ROYALE_CANDIDATE_COUNT = 8;

export type BattleRoyaleVariant = "standard" | "underdog";
export type BattleRoyaleStage =
  "awaiting_most_anticipated" | "awaiting_least_anticipated" | "resolved";

export interface BattleRoyaleState {
  variant: BattleRoyaleVariant;
  /** The 8 generated candidates, fixed for the lifetime of this state. */
  candidates: ChallengeCandidateFilm[];
  stage: BattleRoyaleStage;
  mostAnticipatedEntryId: string | null;
  leastAnticipatedEntryId: string | null;
}

export type BattleRoyaleTransition =
  { ok: true; state: BattleRoyaleState } | { ok: false; error: string };

/** Generates the initial state, or `null` if there aren't enough eligible candidates for a fair draw. */
export function beginBattleRoyale(
  candidates: readonly ChallengeCandidateFilm[],
  variant: BattleRoyaleVariant,
  rng: Rng,
): BattleRoyaleState | null {
  if (candidates.length < BATTLE_ROYALE_CANDIDATE_COUNT) {
    return null;
  }
  const weighted = candidates.map((film) => ({
    film,
    weight: film.selectionWeight,
  }));
  const eight = weightedSampleWithoutReplacement(
    weighted,
    BATTLE_ROYALE_CANDIDATE_COUNT,
    rng,
  ).map((w) => w.film);
  return {
    variant,
    candidates: eight,
    stage: "awaiting_most_anticipated",
    mostAnticipatedEntryId: null,
    leastAnticipatedEntryId: null,
  };
}

export function selectMostAnticipated(
  state: BattleRoyaleState,
  watchlistEntryId: string,
): BattleRoyaleTransition {
  if (state.stage !== "awaiting_most_anticipated") {
    return { ok: false, error: "not_awaiting_most_anticipated" };
  }
  if (
    !state.candidates.some((film) => film.watchlistEntryId === watchlistEntryId)
  ) {
    return { ok: false, error: "not_a_candidate" };
  }
  return {
    ok: true,
    state: {
      ...state,
      stage: "awaiting_least_anticipated",
      mostAnticipatedEntryId: watchlistEntryId,
    },
  };
}

export function selectLeastAnticipated(
  state: BattleRoyaleState,
  watchlistEntryId: string,
): BattleRoyaleTransition {
  if (state.stage !== "awaiting_least_anticipated") {
    return { ok: false, error: "not_awaiting_least_anticipated" };
  }
  if (
    !state.candidates.some((film) => film.watchlistEntryId === watchlistEntryId)
  ) {
    return { ok: false, error: "not_a_candidate" };
  }
  // "select their LEAST anticipated from the remaining candidates" — the most-anticipated pick is excluded.
  if (watchlistEntryId === state.mostAnticipatedEntryId) {
    return { ok: false, error: "cannot_repeat_most_anticipated" };
  }
  return {
    ok: true,
    state: {
      ...state,
      stage: "resolved",
      leastAnticipatedEntryId: watchlistEntryId,
    },
  };
}

/** The film that enters the draft, once resolved — the most-anticipated pick for "standard", least-anticipated for "underdog". */
export function getBattleRoyaleWinner(
  state: BattleRoyaleState,
): ChallengeCandidateFilm | null {
  if (state.stage !== "resolved") {
    return null;
  }
  const winningEntryId =
    state.variant === "standard"
      ? state.mostAnticipatedEntryId
      : state.leastAnticipatedEntryId;
  return (
    state.candidates.find((film) => film.watchlistEntryId === winningEntryId) ??
    null
  );
}
