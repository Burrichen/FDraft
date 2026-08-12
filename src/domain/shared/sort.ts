export type SortDirection = "asc" | "desc";

/**
 * Applies `direction` to a normal ascending comparator, and always pushes
 * `null` (missing metadata) to the end regardless of direction — the
 * "missing metadata never crashes, never produces NaN/arbitrary ordering"
 * rule shared by the Watchlist's "Sort & Filter" control
 * (`src/domain/watchlist/sort-filter.ts`) and historical draft sorting
 * (`src/domain/drafts/history-sort.ts`). See docs/product-spec.md,
 * "WATCHLIST SORT / FILTER CONTROL", "SORT OPTIONS": "films with known
 * runtime first in the requested order; unknown runtime grouped at the
 * end."
 */
export function compareNullsLast<T>(
  a: T | null,
  b: T | null,
  direction: SortDirection,
  compareAscending: (a: T, b: T) => number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = compareAscending(a, b);
  return direction === "asc" ? result : -result;
}
