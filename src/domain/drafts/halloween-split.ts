import {
  createDefaultSplit,
  isValidSplit,
  setChallengeCount,
  setRandomCount,
} from "./split";

/**
 * The two-way linked allocation for a fixed-size Halloween Draft (see
 * docs/updates, "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE CLEANUP" §1/
 * §2): a difficulty's film count divided across Halloween's two curated
 * categories, Horror and Kitsch, always summing to exactly that count.
 *
 * Halloween-adjacent (a third, watchlist-derived pool) is gone — every
 * Halloween Draft now draws from exactly the same two curated categories
 * Christmas draws from its own two, so this is now a thin ADAPTER over
 * `split.ts`'s already-tested two-way primitives, exactly like
 * `christmas-split.ts` — never a second implementation of the same
 * arithmetic. The field names are Halloween's own, though, never
 * `randomCount`/`challengeCount`: Halloween has no Challenge source at all,
 * so surfacing that vocabulary here would be actively misleading.
 *
 * A film already on an old Halloween Draft may still carry the historical
 * `"halloween-adjacent"` source (see `DraftItemSource`'s own doc comment)
 * — that's read-only History data, untouched by this file, which only
 * governs NEW Draft creation.
 */
export interface HalloweenSplit {
  horrorCount: number;
  kitschCount: number;
}

function toHalloweenSplit(split: {
  randomCount: number;
  challengeCount: number;
}): HalloweenSplit {
  return {
    horrorCount: split.randomCount,
    kitschCount: split.challengeCount,
  };
}

/** An even split, biased toward one extra Horror film on an odd total (e.g. 8 -> 4/4, 5 -> 3/2). */
export function createDefaultHalloweenSplit(
  totalFilms: number,
): HalloweenSplit {
  // `createDefaultSplit` biases the SECOND value up on an odd total; for
  // Halloween the extra film belongs to Horror (the headline category), so
  // the two are swapped on the way out rather than reimplemented.
  const base = createDefaultSplit(totalFilms);
  return {
    horrorCount: base.challengeCount,
    kitschCount: base.randomCount,
  };
}

/** Sets the Horror count, clamping to `[0, totalFilms]`, and derives Kitsch to match. */
export function setHorrorCount(
  totalFilms: number,
  requestedHorrorCount: number,
): HalloweenSplit {
  return toHalloweenSplit(setRandomCount(totalFilms, requestedHorrorCount));
}

/** Sets the Kitsch count, clamping to `[0, totalFilms]`, and derives Horror to match. */
export function setKitschCount(
  totalFilms: number,
  requestedKitschCount: number,
): HalloweenSplit {
  return toHalloweenSplit(setChallengeCount(totalFilms, requestedKitschCount));
}

export function isValidHalloweenSplit(
  totalFilms: number,
  split: HalloweenSplit,
): boolean {
  return isValidSplit(totalFilms, {
    randomCount: split.horrorCount,
    challengeCount: split.kitschCount,
  });
}
