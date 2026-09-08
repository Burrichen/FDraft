import { describe, expect, it } from "vitest";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import {
  CHRISTMAS_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "./event-registry";
import { computeEventOccurrenceStats } from "./event-occurrence-stats";

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "draft-1",
    profileId: "alex",
    difficulty: "one-at-a-time",
    timeMode: "timer",
    status: "archived",
    totalFilms: 0,
    randomFilmCount: 0,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-10-01T00:00:00.000Z",
    deadlineAt: "2026-11-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: "2026-10-31T00:00:00.000Z",
    freeformAchievedRank: null,
    sourceEventId: HALLOWEEN_EVENT_ID,
    sourceEventManuallyEnabled: false,
    rewardsGrantedAt: "2026-10-31T00:00:00.000Z",
    customName: null,
    eventOccurrenceYear: 2026,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
}

function item(overrides: Partial<DraftItemRecord> = {}): DraftItemRecord {
  return {
    id: "item-1",
    draftId: "draft-1",
    filmId: "film-1",
    watchlistEntryId: null,
    source: "random",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: 0,
    isCompleted: true,
    completedAt: "2026-10-15T00:00:00.000Z",
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    eventRewardGrantedAt: "2026-10-15T00:00:00.000Z",
    eventCategoryKey: "horror",
    ...overrides,
  } as DraftItemRecord;
}

describe("computeEventOccurrenceStats", () => {
  it("excludes normal (non-event) drafts entirely", () => {
    const drafts = [
      draft({ id: "normal", sourceEventId: null, eventOccurrenceYear: null }),
    ];
    const items = new Map([["normal", [item({ draftId: "normal" })]]]);
    expect(computeEventOccurrenceStats(drafts, items)).toEqual([]);
  });

  it("excludes a legacy Event draft with no eventOccurrenceYear rather than guessing at one", () => {
    const drafts = [draft({ eventOccurrenceYear: null })];
    const items = new Map([["draft-1", [item()]]]);
    expect(computeEventOccurrenceStats(drafts, items)).toEqual([]);
  });

  it("computes watched count and currency earned for one completed occurrence", () => {
    const drafts = [draft()];
    const items = new Map([
      [
        "draft-1",
        [
          item({ id: "item-1", filmId: "film-1", isCompleted: true }),
          item({
            id: "item-2",
            filmId: "film-2",
            isCompleted: false,
            completedAt: null,
            eventRewardGrantedAt: null,
          }),
        ],
      ],
    ]);

    const [stat] = computeEventOccurrenceStats(drafts, items);
    expect(stat).toMatchObject({
      eventId: HALLOWEEN_EVENT_ID,
      eventName: "Halloween",
      occurrenceYear: 2026,
      currencyLabel: "Haunted Points",
      totalFilms: 2,
      watchedFilms: 1,
      currencyEarned: 1,
      status: "Completed",
    });
  });

  it("reports 'In Progress' when the occurrence's draft is still active, even with unresolved items", () => {
    const drafts = [draft({ status: "active", completedAt: null })];
    const items = new Map([["draft-1", [item()]]]);
    const [stat] = computeEventOccurrenceStats(drafts, items);
    expect(stat.status).toBe("In Progress");
  });

  it("reports 'Expired' — never 'Completed' — for an unfinished, closed occurrence", () => {
    const drafts = [draft({ status: "expired", completedAt: null })];
    const items = new Map([
      [
        "draft-1",
        [
          item({ id: "item-1", isCompleted: true }),
          item({
            id: "item-2",
            filmId: "film-2",
            isCompleted: false,
            completedAt: null,
            eventRewardGrantedAt: null,
          }),
        ],
      ],
    ]);
    const [stat] = computeEventOccurrenceStats(drafts, items);
    expect(stat.status).toBe("Expired");
    expect(stat.watchedFilms).toBe(1);
    expect(stat.totalFilms).toBe(2);
  });

  it("groups multiple events/years into separate, correctly-scoped entries, sorted newest year first", () => {
    const drafts = [
      draft({
        id: "halloween-2025",
        eventOccurrenceYear: 2025,
        sourceEventId: HALLOWEEN_EVENT_ID,
      }),
      draft({
        id: "halloween-2026",
        eventOccurrenceYear: 2026,
        sourceEventId: HALLOWEEN_EVENT_ID,
      }),
      draft({
        id: "christmas-2026",
        eventOccurrenceYear: 2026,
        sourceEventId: CHRISTMAS_EVENT_ID,
      }),
      draft({
        id: "january-2026",
        eventOccurrenceYear: 2026,
        sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
      }),
    ];
    const items = new Map([
      ["halloween-2025", [item({ draftId: "halloween-2025" })]],
      ["halloween-2026", [item({ draftId: "halloween-2026" })]],
      [
        "christmas-2026",
        [item({ draftId: "christmas-2026", eventCategoryKey: "classic" })],
      ],
      [
        "january-2026",
        [item({ draftId: "january-2026", eventCategoryKey: null })],
      ],
    ]);

    const stats = computeEventOccurrenceStats(drafts, items);
    expect(stats).toHaveLength(4);
    expect(stats[0].occurrenceYear).toBe(2026);
    expect(stats[stats.length - 1].occurrenceYear).toBe(2025);
    const eventIds = stats.map((s) => s.eventId).sort();
    expect(eventIds).toEqual(
      [
        CHRISTMAS_EVENT_ID,
        F_YOU_ITS_JANUARY_EVENT_ID,
        HALLOWEEN_EVENT_ID,
        HALLOWEEN_EVENT_ID,
      ].sort(),
    );
  });

  it("sums across multiple drafts sharing the same event+year (e.g. a regenerated Event Draft)", () => {
    const drafts = [
      draft({ id: "draft-a" }),
      draft({ id: "draft-b", status: "archived" }),
    ];
    const items = new Map([
      ["draft-a", [item({ draftId: "draft-a", id: "a1" })]],
      ["draft-b", [item({ draftId: "draft-b", id: "b1" })]],
    ]);
    const stats = computeEventOccurrenceStats(drafts, items);
    expect(stats).toHaveLength(1);
    expect(stats[0].totalFilms).toBe(2);
    expect(stats[0].watchedFilms).toBe(2);
    expect(stats[0].currencyEarned).toBe(2);
  });
});
