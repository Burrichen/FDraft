/**
 * The random/challenge linked-slider invariant from docs/product-spec.md,
 * "Draft Configuration — Random vs Challenge": moving either slider adjusts
 * the other so randomCount + challengeCount always equals totalFilms. Pure
 * and framework-independent so the slider component can stay a thin wrapper
 * around it.
 */
export interface DraftSplit {
  randomCount: number;
  challengeCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** An even split, biased toward more challenge films on an odd total (e.g. 10 -> 5/5, 5 -> 2/3). */
export function createDefaultSplit(totalFilms: number): DraftSplit {
  assertNonNegativeTotal(totalFilms);
  const randomCount = Math.floor(totalFilms / 2);
  return { randomCount, challengeCount: totalFilms - randomCount };
}

/** Sets the random film count, clamping to [0, totalFilms], and derives challengeCount to match. */
export function setRandomCount(
  totalFilms: number,
  requestedRandomCount: number,
): DraftSplit {
  assertNonNegativeTotal(totalFilms);
  const randomCount = clamp(Math.round(requestedRandomCount), 0, totalFilms);
  return { randomCount, challengeCount: totalFilms - randomCount };
}

/** Sets the challenge film count, clamping to [0, totalFilms], and derives randomCount to match. */
export function setChallengeCount(
  totalFilms: number,
  requestedChallengeCount: number,
): DraftSplit {
  assertNonNegativeTotal(totalFilms);
  const challengeCount = clamp(
    Math.round(requestedChallengeCount),
    0,
    totalFilms,
  );
  return { randomCount: totalFilms - challengeCount, challengeCount };
}

export function isValidSplit(totalFilms: number, split: DraftSplit): boolean {
  return (
    split.randomCount >= 0 &&
    split.challengeCount >= 0 &&
    split.randomCount + split.challengeCount === totalFilms
  );
}

function assertNonNegativeTotal(totalFilms: number): void {
  if (!Number.isInteger(totalFilms) || totalFilms < 0) {
    throw new Error(
      `Expected a non-negative integer total film count, got ${totalFilms}`,
    );
  }
}
