import {
  createDefaultSplit,
  isValidSplit,
  setChallengeCount,
  setRandomCount,
} from "./split";

/**
 * The two-way linked allocation for a fixed-size Christmas Draft (see
 * docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL
 * POLISH" §4): a difficulty's film count divided across Christmas's two
 * curated categories, Classic and Christmas Adjacent, always summing to
 * exactly that count.
 *
 * Deliberately a thin ADAPTER over `split.ts`'s already-tested two-way
 * primitives rather than a second implementation of the same arithmetic —
 * the normal Draft's Random/Challenge split is mathematically the identical
 * problem ("clamp one value, derive the other by subtraction"), and §2's
 * whole point is that Christmas must not carry its own parallel copy of
 * logic that already exists. The field names are Christmas's own, though,
 * never `randomCount`/`challengeCount`: Christmas has no Challenge source
 * at all (see §1, "NO Challenge-based Event source"), so surfacing that
 * vocabulary here would be actively misleading.
 *
 * Contrast `halloween-split.ts`, which genuinely cannot delegate here: at
 * THREE pools, setting one value leaves an ambiguous remainder that has to
 * be redistributed proportionally across the other two. That file is left
 * exactly as it is — a working, tested, approved flow — rather than being
 * refactored onto a shared abstraction for no behavioural gain.
 */
export interface ChristmasSplit {
  classicCount: number;
  adjacentCount: number;
}

function toChristmasSplit(split: {
  randomCount: number;
  challengeCount: number;
}): ChristmasSplit {
  return {
    classicCount: split.randomCount,
    adjacentCount: split.challengeCount,
  };
}

/** An even split, biased toward one extra Classic film on an odd total (e.g. 10 -> 5/5, 5 -> 3/2). */
export function createDefaultChristmasSplit(
  totalFilms: number,
): ChristmasSplit {
  // `createDefaultSplit` biases the SECOND value up on an odd total; for
  // Christmas the extra film belongs to Classic (the headline category),
  // so the two are swapped on the way out rather than reimplemented.
  const base = createDefaultSplit(totalFilms);
  return {
    classicCount: base.challengeCount,
    adjacentCount: base.randomCount,
  };
}

/** Sets the Classic count, clamping to `[0, totalFilms]`, and derives Christmas Adjacent to match. */
export function setClassicCount(
  totalFilms: number,
  requestedClassicCount: number,
): ChristmasSplit {
  return toChristmasSplit(setRandomCount(totalFilms, requestedClassicCount));
}

/** Sets the Christmas Adjacent count, clamping to `[0, totalFilms]`, and derives Classic to match. */
export function setAdjacentCount(
  totalFilms: number,
  requestedAdjacentCount: number,
): ChristmasSplit {
  return toChristmasSplit(
    setChallengeCount(totalFilms, requestedAdjacentCount),
  );
}

export function isValidChristmasSplit(
  totalFilms: number,
  split: ChristmasSplit,
): boolean {
  return isValidSplit(totalFilms, {
    randomCount: split.classicCount,
    challengeCount: split.adjacentCount,
  });
}
