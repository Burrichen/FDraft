import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORICAL_DRAFT_SORT,
  isHistoricalDraftSortOption,
  sortHistoricalDraftItems,
  type SortableHistoricalDraftItem,
} from "./history-sort";

function item(
  overrides: Partial<SortableHistoricalDraftItem> & {
    title: string;
    orderIndex: number;
  },
): SortableHistoricalDraftItem {
  return {
    isCompleted: false,
    releaseYear: null,
    runtimeMinutes: null,
    averageRating: null,
    source: "random",
    watchedDate: null,
    ...overrides,
  };
}

describe("DEFAULT_HISTORICAL_DRAFT_SORT", () => {
  it("is Original Draft Order", () => {
    expect(DEFAULT_HISTORICAL_DRAFT_SORT).toBe("original_order");
  });
});

describe("isHistoricalDraftSortOption", () => {
  it("accepts every known value and rejects anything else", () => {
    expect(isHistoricalDraftSortOption("original_order")).toBe(true);
    expect(isHistoricalDraftSortOption("watched_date")).toBe(true);
    expect(isHistoricalDraftSortOption("bogus")).toBe(false);
    expect(isHistoricalDraftSortOption(null)).toBe(false);
  });
});

describe("sortHistoricalDraftItems", () => {
  it("does not mutate the input array", () => {
    const items = [
      item({ title: "B", orderIndex: 1 }),
      item({ title: "A", orderIndex: 0 }),
    ];
    const original = [...items];
    sortHistoricalDraftItems(items, "title");
    expect(items).toEqual(original);
  });

  it("'original_order' restores orderIndex ascending regardless of the array's current order", () => {
    const items = [
      item({ title: "C", orderIndex: 2 }),
      item({ title: "A", orderIndex: 0 }),
      item({ title: "B", orderIndex: 1 }),
    ];
    const result = sortHistoricalDraftItems(items, "original_order");
    expect(result.map((i) => i.title)).toEqual(["A", "B", "C"]);
  });

  it("'watched_status' groups watched items first, preserving relative order within each group", () => {
    const items = [
      item({ title: "A", orderIndex: 0, isCompleted: false }),
      item({ title: "B", orderIndex: 1, isCompleted: true }),
      item({ title: "C", orderIndex: 2, isCompleted: false }),
      item({ title: "D", orderIndex: 3, isCompleted: true }),
    ];
    const result = sortHistoricalDraftItems(items, "watched_status");
    expect(result.map((i) => i.title)).toEqual(["B", "D", "A", "C"]);
  });

  it("'title' sorts alphabetically, case-insensitively", () => {
    const items = [
      item({ title: "banana", orderIndex: 0 }),
      item({ title: "Apple", orderIndex: 1 }),
    ];
    const result = sortHistoricalDraftItems(items, "title");
    expect(result.map((i) => i.title)).toEqual(["Apple", "banana"]);
  });

  it("'release_year' sorts newest first, grouping unknown years at the end", () => {
    const items = [
      item({ title: "Unknown", orderIndex: 0, releaseYear: null }),
      item({ title: "Old", orderIndex: 1, releaseYear: 1980 }),
      item({ title: "New", orderIndex: 2, releaseYear: 2020 }),
    ];
    const result = sortHistoricalDraftItems(items, "release_year");
    expect(result.map((i) => i.title)).toEqual(["New", "Old", "Unknown"]);
  });

  it("'runtime' sorts shortest first, grouping unknown runtimes at the end", () => {
    const items = [
      item({ title: "Unknown", orderIndex: 0, runtimeMinutes: null }),
      item({ title: "Long", orderIndex: 1, runtimeMinutes: 180 }),
      item({ title: "Short", orderIndex: 2, runtimeMinutes: 80 }),
    ];
    const result = sortHistoricalDraftItems(items, "runtime");
    expect(result.map((i) => i.title)).toEqual(["Short", "Long", "Unknown"]);
  });

  it("'rating' sorts highest first, grouping unknown ratings at the end", () => {
    const items = [
      item({ title: "Unrated", orderIndex: 0, averageRating: null }),
      item({ title: "Low", orderIndex: 1, averageRating: 2.1 }),
      item({ title: "High", orderIndex: 2, averageRating: 4.8 }),
    ];
    const result = sortHistoricalDraftItems(items, "rating");
    expect(result.map((i) => i.title)).toEqual(["High", "Low", "Unrated"]);
  });

  it("'source' groups challenge items first, preserving relative order within each group", () => {
    const items = [
      item({ title: "A", orderIndex: 0, source: "random" }),
      item({ title: "B", orderIndex: 1, source: "challenge" }),
      item({ title: "C", orderIndex: 2, source: "random" }),
      item({ title: "D", orderIndex: 3, source: "challenge" }),
    ];
    const result = sortHistoricalDraftItems(items, "source");
    expect(result.map((i) => i.title)).toEqual(["B", "D", "A", "C"]);
  });

  it("'watched_date' sorts most-recently-watched first, grouping never-watched items at the end", () => {
    const items = [
      item({ title: "NeverWatched", orderIndex: 0, watchedDate: null }),
      item({ title: "Earlier", orderIndex: 1, watchedDate: "2026-01-01" }),
      item({ title: "Later", orderIndex: 2, watchedDate: "2026-06-01" }),
    ];
    const result = sortHistoricalDraftItems(items, "watched_date");
    expect(result.map((i) => i.title)).toEqual([
      "Later",
      "Earlier",
      "NeverWatched",
    ]);
  });

  it("never produces NaN-driven ordering when every item is missing the sorted field", () => {
    const items = [
      item({ title: "A", orderIndex: 0, runtimeMinutes: null }),
      item({ title: "B", orderIndex: 1, runtimeMinutes: null }),
      item({ title: "C", orderIndex: 2, runtimeMinutes: null }),
    ];
    const result = sortHistoricalDraftItems(items, "runtime");
    expect(result).toHaveLength(3);
    expect(new Set(result.map((i) => i.title))).toEqual(
      new Set(["A", "B", "C"]),
    );
  });
});
