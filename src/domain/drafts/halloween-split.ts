/**
 * The three-way linked allocation for a Halloween Draft (see docs/updates,
 * "PROMPT 19 — HALLOWEEN DRAFT MECHANICS"). Halloween does not use the
 * normal Random/Challenge split (`split.ts`) — instead a fixed difficulty
 * film count is divided across three pools: Halloween-adjacent, Horror, and
 * Kitsch. Generalizes `split.ts`'s "derive the other value from a
 * subtraction" invariant to three dimensions: changing one count clamps it
 * to `[0, totalFilms]`, then redistributes the REMAINING TWO proportionally
 * to their current ratio over the leftover total, so the three values can
 * never leave `totalFilms` in sum, no matter which one the user drags.
 */

export interface HalloweenSplit {
  halloweenAdjacentCount: number;
  horrorCount: number;
  kitschCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Redistributes `remainder` across two current values, preserving their
 * existing ratio. An even 50/50 split (rounded down, remainder to `a`) is
 * used when both are currently 0 — there's no ratio to preserve. Always
 * sums to exactly `remainder`: any rounding remainder from the
 * proportional split is resolved onto `a`.
 */
function redistributePair(
  currentA: number,
  currentB: number,
  remainder: number,
): { a: number; b: number } {
  const currentTotal = currentA + currentB;
  if (currentTotal <= 0) {
    const a = Math.floor(remainder / 2);
    return { a, b: remainder - a };
  }
  const a = Math.round((remainder * currentA) / currentTotal);
  return { a, b: remainder - a };
}

/**
 * The default starting allocation for a given difficulty's total film
 * count — an even three-way split, with any remainder (0–2 films) added
 * one at a time to Halloween-adjacent, then Horror.
 */
export function createDefaultHalloweenSplit(
  totalFilms: number,
): HalloweenSplit {
  const base = Math.floor(totalFilms / 3);
  let remainder = totalFilms - base * 3;
  let halloweenAdjacentCount = base;
  let horrorCount = base;
  const kitschCount = base;
  if (remainder > 0) {
    halloweenAdjacentCount += 1;
    remainder -= 1;
  }
  if (remainder > 0) {
    horrorCount += 1;
    remainder -= 1;
  }
  return { halloweenAdjacentCount, horrorCount, kitschCount };
}

export function setHalloweenAdjacentCount(
  split: HalloweenSplit,
  value: number,
  totalFilms: number,
): HalloweenSplit {
  const halloweenAdjacentCount = clamp(value, 0, totalFilms);
  const { a: horrorCount, b: kitschCount } = redistributePair(
    split.horrorCount,
    split.kitschCount,
    totalFilms - halloweenAdjacentCount,
  );
  return { halloweenAdjacentCount, horrorCount, kitschCount };
}

export function setHorrorCount(
  split: HalloweenSplit,
  value: number,
  totalFilms: number,
): HalloweenSplit {
  const horrorCount = clamp(value, 0, totalFilms);
  const { a: halloweenAdjacentCount, b: kitschCount } = redistributePair(
    split.halloweenAdjacentCount,
    split.kitschCount,
    totalFilms - horrorCount,
  );
  return { halloweenAdjacentCount, horrorCount, kitschCount };
}

export function setKitschCount(
  split: HalloweenSplit,
  value: number,
  totalFilms: number,
): HalloweenSplit {
  const kitschCount = clamp(value, 0, totalFilms);
  const { a: halloweenAdjacentCount, b: horrorCount } = redistributePair(
    split.halloweenAdjacentCount,
    split.horrorCount,
    totalFilms - kitschCount,
  );
  return { halloweenAdjacentCount, horrorCount, kitschCount };
}

export function isValidHalloweenSplit(
  split: HalloweenSplit,
  totalFilms: number,
): boolean {
  if (
    split.halloweenAdjacentCount < 0 ||
    split.horrorCount < 0 ||
    split.kitschCount < 0
  ) {
    return false;
  }
  return (
    split.halloweenAdjacentCount + split.horrorCount + split.kitschCount ===
    totalFilms
  );
}
