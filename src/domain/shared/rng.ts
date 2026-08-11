/**
 * Injectable randomness so draft generation and the future challenge engine
 * are deterministically testable (see docs/product-spec.md, "Randomness
 * Engineering"). Production code should use `createDefaultRng()`; tests
 * should use `createSeededRng(seed)` so failures reproduce exactly.
 */
export interface Rng {
  /** Returns a float in [0, 1), like Math.random(). */
  next(): number;
}

export function createDefaultRng(): Rng {
  return { next: () => Math.random() };
}

/**
 * Mulberry32 — a small, fast, deterministic PRNG. Not cryptographically
 * secure; that's fine here, it only ever drives test fixtures and picking a
 * film from an already-authorized candidate list, never anything
 * security-sensitive.
 */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Uniformly picks one element. Throws on an empty array — callers must check eligibility first. */
export function pickUniform<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) {
    throw new Error("pickUniform: cannot pick from an empty array");
  }
  const index = Math.floor(rng.next() * items.length);
  // Guard the astronomically unlikely rng.next() === 1 edge case.
  return items[Math.min(index, items.length - 1)];
}

/** Fisher-Yates shuffle. Returns a new array; does not mutate the input. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Samples `count` distinct elements without replacement. Clamps to items.length. */
export function sampleWithoutReplacement<T>(
  items: readonly T[],
  count: number,
  rng: Rng,
): T[] {
  return shuffle(items, rng).slice(
    0,
    Math.max(0, Math.min(count, items.length)),
  );
}

/**
 * Finds every item tied for the minimum/maximum of `keyFn`. This is the tie
 * *detection* half of "deterministic tie-breaking via weighted/random
 * selection where several films equally satisfy a rule" (see
 * docs/product-spec.md, "Challenge Catalogue"): a challenge computes the
 * extreme (e.g. shortest runtime, oldest release year), gets back every film
 * that exactly matches it, and resolves the tie itself via `pickUniform` or
 * `pickWeighted` depending on whether that challenge respects selection
 * weight (see "Selection Weights"). Returns `[]` for an empty input rather
 * than throwing, since "no candidates" is a normal, checkable outcome here.
 */
export function filterByExtreme<T>(
  items: readonly T[],
  keyFn: (item: T) => number,
  direction: "min" | "max",
): T[] {
  if (items.length === 0) {
    return [];
  }
  const keys = items.map(keyFn);
  const target = direction === "min" ? Math.min(...keys) : Math.max(...keys);
  return items.filter((item) => keyFn(item) === target);
}

/**
 * Takes the head of an already-ordered list, sized to `fraction` of its
 * length (see docs/product-spec.md, e.g. "Archaeological Dig" — oldest 20%,
 * "Trust the People" — top 10%). The caller sorts toward whichever end it
 * wants ("oldest 20%" sorts ascending by date added; "top 10% by rating"
 * sorts descending by rating) — this function is agnostic to what the order
 * means, it just takes a fraction of the front.
 *
 * Guards the "percentage division by zero" edge case explicitly: an empty
 * input or a non-positive fraction returns `[]` rather than computing
 * `Math.ceil(0 * fraction)` and mishandling the result. A non-empty input
 * always returns at least one item (rounding up), so "the oldest 20%" of a
 * 2-film watchlist is the single oldest film, not nothing.
 */
export function percentileSubset<T>(
  itemsOrderedForSubset: readonly T[],
  fraction: number,
): T[] {
  if (itemsOrderedForSubset.length === 0 || fraction <= 0) {
    return [];
  }
  if (fraction >= 1) {
    return [...itemsOrderedForSubset];
  }
  const count = Math.max(1, Math.ceil(itemsOrderedForSubset.length * fraction));
  return itemsOrderedForSubset.slice(0, count);
}

export interface Weighted {
  weight: number;
}

/**
 * Weighted random selection proportional to each item's `weight`. Falls back
 * to uniform selection if every weight is zero (a total of 0 would otherwise
 * make selection impossible). Throws on an empty array or a negative weight.
 */
export function pickWeighted<T extends Weighted>(
  items: readonly T[],
  rng: Rng,
): T {
  if (items.length === 0) {
    throw new Error("pickWeighted: cannot pick from an empty array");
  }
  if (items.some((item) => item.weight < 0)) {
    throw new Error("pickWeighted: weights must be non-negative");
  }

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) {
    return pickUniform(items, rng);
  }

  let target = rng.next() * totalWeight;
  for (const item of items) {
    target -= item.weight;
    if (target < 0) {
      return item;
    }
  }
  // Floating-point rounding fallback: land on the last item instead of undefined.
  return items[items.length - 1];
}

/**
 * Samples `count` distinct items without replacement, weighted at each
 * draw: pick one via `pickWeighted` over the remaining pool, remove it, and
 * repeat. Not the same as normalizing weights up front and drawing once —
 * this is the standard, correct way to do weighted sampling without
 * replacement. Clamps to `items.length`, same as
 * `sampleWithoutReplacement`. Used to fill a fixed number of draft slots
 * from the active watchlist, respecting selection-weight boosts (see
 * docs/product-spec.md, "Selection Weights" and "Monthly Watchlist Drafts").
 */
export function weightedSampleWithoutReplacement<T extends Weighted>(
  items: readonly T[],
  count: number,
  rng: Rng,
): T[] {
  const targetCount = Math.max(0, Math.min(count, items.length));
  const pool = [...items];
  const result: T[] = [];

  for (let i = 0; i < targetCount; i++) {
    const picked = pickWeighted(pool, rng);
    result.push(picked);
    pool.splice(pool.indexOf(picked), 1);
  }

  return result;
}
