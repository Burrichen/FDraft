import type { Rng } from "@/domain/shared/rng";
import {
  percentileSubsetAscendingBy,
  pickWeightedFilm,
  withKnownRating,
  withKnownReleaseYear,
  withKnownRuntime,
} from "../families/shared";
import type { ChallengeCandidateFilm } from "../types";

/**
 * The Three Doors interactive state machine (see docs/product-spec.md,
 * "Three Doors"). Generates three distinct candidates — one short, one old,
 * one highly rated — the user picks exactly one, and only that film enters
 * the draft.
 *
 * "Suitably short"/"suitably old" are read as the shortest/oldest quartile
 * of eligible films (not literally the single shortest/oldest — a fixed
 * global extreme would make one specific film the "short" door every single
 * time this challenge runs against an unchanged watchlist), then a weighted
 * random pick within that quartile, consistent with how percentile-based
 * pools are used elsewhere in this catalogue (e.g. "Archaeological Dig").
 * "Highly rated" reuses the same >= 4.0 threshold as "Prestige Pick".
 */

const SHORT_DOOR_PERCENTILE = 0.25;
const OLD_DOOR_PERCENTILE = 0.25;
const HIGHLY_RATED_MIN_RATING = 4.0;

export type ThreeDoorsKind = "short" | "old" | "highly_rated";

export interface ThreeDoorsDoor {
  kind: ThreeDoorsKind;
  film: ChallengeCandidateFilm;
}

export type ThreeDoorsStage = "awaiting_choice" | "resolved";

export interface ThreeDoorsState {
  /** Exactly 3 doors, always in [short, old, highly_rated] order. */
  doors: ThreeDoorsDoor[];
  stage: ThreeDoorsStage;
  chosenWatchlistEntryId: string | null;
}

export type ThreeDoorsBeginResult =
  { ok: true; state: ThreeDoorsState } | { ok: false; reason: string };
export type ThreeDoorsTransition =
  { ok: true; state: ThreeDoorsState } | { ok: false; error: string };

function withoutFilm(
  candidates: readonly ChallengeCandidateFilm[],
  watchlistEntryId: string,
): ChallengeCandidateFilm[] {
  return candidates.filter(
    (film) => film.watchlistEntryId !== watchlistEntryId,
  );
}

/** Generates the three doors, or an `ok: false` result naming which door couldn't be filled from distinct films. */
export function beginThreeDoors(
  candidates: readonly ChallengeCandidateFilm[],
  rng: Rng,
): ThreeDoorsBeginResult {
  const shortPool = percentileSubsetAscendingBy(
    withKnownRuntime(candidates),
    (film) => film.runtimeMinutes,
    SHORT_DOOR_PERCENTILE,
  );
  if (shortPool.length === 0) {
    return { ok: false, reason: "no_short_film_candidate" };
  }
  const shortFilm = pickWeightedFilm(shortPool, rng);

  const remainingAfterShort = withoutFilm(
    candidates,
    shortFilm.watchlistEntryId,
  );
  const oldPool = percentileSubsetAscendingBy(
    withKnownReleaseYear(remainingAfterShort),
    (film) => film.releaseYear,
    OLD_DOOR_PERCENTILE,
  );
  if (oldPool.length === 0) {
    return { ok: false, reason: "no_old_film_candidate" };
  }
  const oldFilm = pickWeightedFilm(oldPool, rng);

  const remainingAfterOld = withoutFilm(
    remainingAfterShort,
    oldFilm.watchlistEntryId,
  );
  const highlyRatedPool = withKnownRating(remainingAfterOld).filter(
    (film) => film.averageRating >= HIGHLY_RATED_MIN_RATING,
  );
  if (highlyRatedPool.length === 0) {
    return { ok: false, reason: "no_highly_rated_film_candidate" };
  }
  const highlyRatedFilm = pickWeightedFilm(highlyRatedPool, rng);

  return {
    ok: true,
    state: {
      doors: [
        { kind: "short", film: shortFilm },
        { kind: "old", film: oldFilm },
        { kind: "highly_rated", film: highlyRatedFilm },
      ],
      stage: "awaiting_choice",
      chosenWatchlistEntryId: null,
    },
  };
}

export function selectDoor(
  state: ThreeDoorsState,
  watchlistEntryId: string,
): ThreeDoorsTransition {
  if (state.stage !== "awaiting_choice") {
    return { ok: false, error: "not_awaiting_choice" };
  }
  if (
    !state.doors.some((door) => door.film.watchlistEntryId === watchlistEntryId)
  ) {
    return { ok: false, error: "not_a_door" };
  }
  return {
    ok: true,
    state: {
      ...state,
      stage: "resolved",
      chosenWatchlistEntryId: watchlistEntryId,
    },
  };
}

/** The film that enters the draft, once resolved. */
export function getThreeDoorsWinner(
  state: ThreeDoorsState,
): ChallengeCandidateFilm | null {
  if (state.stage !== "resolved") {
    return null;
  }
  return (
    state.doors.find(
      (door) => door.film.watchlistEntryId === state.chosenWatchlistEntryId,
    )?.film ?? null
  );
}
