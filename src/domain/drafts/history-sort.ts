import { compareNullsLast } from "@/domain/shared/sort";
import type { DraftItemSource } from "@/repositories/records";

/**
 * Sorting for a finalised/historical draft's item list (see
 * docs/product-spec.md, "SORTING FOR FINALISED / HISTORICAL DRAFTS").
 * Presentation-only, always: nothing here ever writes back to a
 * `DraftItemRecord`'s `orderIndex`, or any other stored field — see the
 * module doc comment on `sortHistoricalDraftItems` for why that's
 * structurally guaranteed, not just a convention to remember.
 */

export type HistoricalDraftSortOption =
  | "original_order"
  | "watched_status"
  | "title"
  | "release_year"
  | "runtime"
  | "rating"
  | "source"
  | "watched_date";

/** The Draft History page's item list must default to this — see docs/product-spec.md: "The default MUST be: Original Draft Order." */
export const DEFAULT_HISTORICAL_DRAFT_SORT: HistoricalDraftSortOption =
  "original_order";

export const HISTORICAL_DRAFT_SORT_OPTIONS: {
  value: HistoricalDraftSortOption;
  label: string;
}[] = [
  { value: "original_order", label: "Original Draft Order" },
  { value: "watched_status", label: "Watched / Unwatched" },
  { value: "title", label: "Title" },
  { value: "release_year", label: "Release Year" },
  { value: "runtime", label: "Runtime" },
  { value: "rating", label: "Rating" },
  { value: "source", label: "Challenge / Random" },
  { value: "watched_date", label: "Watched Date" },
];

export function isHistoricalDraftSortOption(
  value: unknown,
): value is HistoricalDraftSortOption {
  return (
    typeof value === "string" &&
    HISTORICAL_DRAFT_SORT_OPTIONS.some((option) => option.value === value)
  );
}

export interface SortableHistoricalDraftItem {
  /** The position this item was actually generated into the draft at — never mutated by any sort here. */
  orderIndex: number;
  isCompleted: boolean;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
  source: DraftItemSource;
  /** ISO calendar date the item was actually watched, or `null` if it never was — "Watched Date where applicable" (see docs/product-spec.md). */
  watchedDate: string | null;
}

const numberAscending = (a: number, b: number) => a - b;
const dateAscending = (a: string, b: string) => a.localeCompare(b);

/**
 * Sorts a COPY of `items` for display; never mutates the input and never
 * writes anywhere. See docs/product-spec.md: "Historical draft data
 * should never be destructively reordered in the database. Sorting is
 * presentation-only. Preserve the original generated draft position." —
 * `"original_order"` (the required default) simply restores
 * `orderIndex` ascending, which is exactly that original generated
 * position, always recoverable regardless of whatever sort the item list
 * is currently showing.
 */
export function sortHistoricalDraftItems<T extends SortableHistoricalDraftItem>(
  items: readonly T[],
  sort: HistoricalDraftSortOption,
): T[] {
  const sorted = [...items];
  switch (sort) {
    case "original_order":
      sorted.sort((a, b) => a.orderIndex - b.orderIndex);
      break;
    case "watched_status":
      // Watched first; ties (both watched, or both not) keep their
      // original relative order — `Array.prototype.sort` is stable, so a
      // plain boolean comparison here is enough, no explicit orderIndex
      // tiebreak needed.
      sorted.sort((a, b) => Number(b.isCompleted) - Number(a.isCompleted));
      break;
    case "title":
      sorted.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
      break;
    case "release_year":
      sorted.sort((a, b) =>
        compareNullsLast(a.releaseYear, b.releaseYear, "desc", numberAscending),
      );
      break;
    case "runtime":
      sorted.sort((a, b) =>
        compareNullsLast(
          a.runtimeMinutes,
          b.runtimeMinutes,
          "asc",
          numberAscending,
        ),
      );
      break;
    case "rating":
      sorted.sort((a, b) =>
        compareNullsLast(
          a.averageRating,
          b.averageRating,
          "desc",
          numberAscending,
        ),
      );
      break;
    case "source":
      // Challenge picks first; ties keep their original relative order.
      sorted.sort(
        (a, b) =>
          Number(b.source === "challenge") - Number(a.source === "challenge"),
      );
      break;
    case "watched_date":
      sorted.sort((a, b) =>
        compareNullsLast(a.watchedDate, b.watchedDate, "desc", dateAscending),
      );
      break;
  }
  return sorted;
}
