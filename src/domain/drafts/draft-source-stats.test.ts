import { describe, expect, it } from "vitest";
import type { DraftItemRecord } from "@/repositories/records";
import {
  DRAFT_ENTRY_SOURCE_ORDER,
  rankWatchedDraftFilmSources,
  summariseWatchedDraftFilmsBySource,
} from "./draft-source-stats";

function item(overrides: Partial<DraftItemRecord> = {}): DraftItemRecord {
  return {
    id: "item-1",
    draftId: "draft-1",
    filmId: "film-1",
    watchlistEntryId: "entry-1",
    source: "random",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: 0,
    isCompleted: true,
    completedAt: "2026-01-05T00:00:00.000Z",
    watchedHistoryId: "history-1",
    originFilmId: null,
    substitutionReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function statFor(
  breakdown: ReturnType<typeof summariseWatchedDraftFilmsBySource>,
  source: string,
) {
  const stat = breakdown.stats.find((entry) => entry.source === source);
  if (!stat) throw new Error(`no stat for ${source}`);
  return stat;
}

/** Covers docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §8's data preparation. */
describe("summariseWatchedDraftFilmsBySource (§8)", () => {
  it("returns every source in a fixed order, including empty buckets", () => {
    const breakdown = summariseWatchedDraftFilmsBySource([]);
    expect(breakdown.stats.map((stat) => stat.source)).toEqual([
      ...DRAFT_ENTRY_SOURCE_ORDER,
    ]);
    expect(breakdown.totalWatchedFilms).toBe(0);
    expect(breakdown.stats.every((stat) => stat.percentOfWatched === 0)).toBe(
      true,
    );
  });

  it("gives raw counts and percentages of watched films by source", () => {
    // 4 watched films: 2 random, 1 manual add, 1 challenge.
    const breakdown = summariseWatchedDraftFilmsBySource([
      item({ id: "a", entrySource: "random" }),
      item({ id: "b", entrySource: "random" }),
      item({ id: "c", entrySource: "manual_add" }),
      item({ id: "d", entrySource: "challenge" }),
    ]);
    expect(breakdown.totalWatchedFilms).toBe(4);
    expect(statFor(breakdown, "random")).toMatchObject({
      watchedFilms: 2,
      percentOfWatched: 50,
      label: "Random",
    });
    expect(statFor(breakdown, "manual_add")).toMatchObject({
      watchedFilms: 1,
      percentOfWatched: 25,
    });
    expect(statFor(breakdown, "challenge")).toMatchObject({
      watchedFilms: 1,
      percentOfWatched: 25,
    });
    expect(statFor(breakdown, "diy").watchedFilms).toBe(0);
  });

  it("counts only watched films — an unresolved slot contributes nothing", () => {
    const breakdown = summariseWatchedDraftFilmsBySource([
      item({ id: "a", entrySource: "random" }),
      item({
        id: "b",
        entrySource: "manual_add",
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
      }),
    ]);
    expect(breakdown.totalWatchedFilms).toBe(1);
    expect(statFor(breakdown, "manual_add").watchedFilms).toBe(0);
  });

  it("spans multiple drafts, so completed history is not limited to the active Draft", () => {
    // §8: the breakdown must describe a profile's whole history. Draft items
    // survive archival untouched, so passing every draft's items is enough.
    const breakdown = summariseWatchedDraftFilmsBySource([
      item({ id: "a", draftId: "old-draft", entrySource: "diy" }),
      item({ id: "b", draftId: "old-draft", entrySource: "reroll" }),
      item({ id: "c", draftId: "active-draft", entrySource: "manual_replace" }),
      item({ id: "d", draftId: "event-draft", entrySource: "event" }),
    ]);
    expect(breakdown.totalWatchedFilms).toBe(4);
    for (const source of ["diy", "reroll", "manual_replace", "event"]) {
      expect(statFor(breakdown, source).watchedFilms).toBe(1);
    }
  });

  it("classifies legacy items with no entrySource through the shared inference", () => {
    const breakdown = summariseWatchedDraftFilmsBySource([
      item({ id: "a", source: "manual" }),
      item({ id: "b", source: "horror" }),
      item({ id: "c", substitutionReason: "user_reroll" }),
    ]);
    expect(statFor(breakdown, "diy").watchedFilms).toBe(1);
    expect(statFor(breakdown, "event").watchedFilms).toBe(1);
    expect(statFor(breakdown, "reroll").watchedFilms).toBe(1);
  });

  it("rounds each percentage independently, so thirds need not sum to 100", () => {
    const breakdown = summariseWatchedDraftFilmsBySource([
      item({ id: "a", entrySource: "random" }),
      item({ id: "b", entrySource: "diy" }),
      item({ id: "c", entrySource: "event" }),
    ]);
    expect(statFor(breakdown, "random").percentOfWatched).toBe(33);
    const total = breakdown.stats.reduce(
      (sum, stat) => sum + stat.percentOfWatched,
      0,
    );
    expect(total).toBe(99);
    // The raw counts remain exact, which is what a caller needing a true
    // total should use.
    expect(breakdown.totalWatchedFilms).toBe(3);
  });
});

/** Covers docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §2's presentation rules. */
describe("rankWatchedDraftFilmSources (Part 3 §2)", () => {
  it("drops sources nothing was watched from, and ranks the rest by count", () => {
    const ranked = rankWatchedDraftFilmSources(
      summariseWatchedDraftFilmsBySource([
        item({ id: "a", entrySource: "manual_add" }),
        item({ id: "b", entrySource: "manual_add" }),
        item({ id: "c", entrySource: "manual_add" }),
        item({ id: "d", entrySource: "random" }),
        item({ id: "e", entrySource: "event" }),
        item({ id: "f", entrySource: "event" }),
      ]),
    );
    expect(ranked.map((stat) => [stat.source, stat.watchedFilms])).toEqual([
      ["manual_add", 3],
      ["event", 2],
      ["random", 1],
    ]);
    // Never a row for a source with nothing in it.
    expect(ranked.some((stat) => stat.watchedFilms === 0)).toBe(false);
  });

  it("breaks ties by the canonical source order, so the list is stable", () => {
    const ranked = rankWatchedDraftFilmSources(
      summariseWatchedDraftFilmsBySource([
        item({ id: "a", entrySource: "reroll" }),
        item({ id: "b", entrySource: "challenge" }),
        item({ id: "c", entrySource: "diy" }),
      ]),
    );
    expect(ranked.map((stat) => stat.source)).toEqual([
      "challenge",
      "diy",
      "reroll",
    ]);
  });

  it("returns nothing at all when no draft film has been watched", () => {
    expect(
      rankWatchedDraftFilmSources(
        summariseWatchedDraftFilmsBySource([
          item({ id: "a", isCompleted: false, completedAt: null }),
        ]),
      ),
    ).toEqual([]);
    expect(
      rankWatchedDraftFilmSources(summariseWatchedDraftFilmsBySource([])),
    ).toEqual([]);
  });

  it("carries each row's label and percentage through for display", () => {
    const ranked = rankWatchedDraftFilmSources(
      summariseWatchedDraftFilmsBySource([
        item({ id: "a", entrySource: "manual_replace" }),
        item({ id: "b", entrySource: "reroll" }),
        item({ id: "c", entrySource: "reroll" }),
        item({ id: "d", entrySource: "reroll" }),
      ]),
    );
    expect(ranked[0]).toMatchObject({
      source: "reroll",
      label: "Rerolled",
      watchedFilms: 3,
      percentOfWatched: 75,
    });
    expect(ranked[1]).toMatchObject({
      label: "Manual Replacement",
      percentOfWatched: 25,
    });
  });
});
