import { afterEach, describe, expect, it } from "vitest";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import {
  markLocalFilmWatched,
  undoLocalFilmWatched,
  type WatchSessionUndoRecord,
} from "@/application/watchlist/local-watchlist-service";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";
import type { DraftRecord, WatchlistEntryRecord } from "@/repositories/records";

const PROFILE_ID = "alex";

async function seedFilmAndEntry(
  repos: Repositories,
  overrides: Partial<WatchlistEntryRecord> = {},
) {
  const filmId = overrides.filmId ?? "film-1";
  await repos.films.create({
    id: filmId,
    title: "Paddington 2",
    releaseYear: 2017,
    letterboxdSlug: `slug-${filmId}`,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const entry: WatchlistEntryRecord = {
    id: "entry-1",
    profileId: PROFILE_ID,
    filmId,
    dateAdded: "2026-01-01",
    position: null,
    isActive: true,
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  await repos.watchlist.createEntry(entry);
  return entry;
}

describe("markLocalFilmWatched", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("deactivates the entry and logs watched history with the profile's local calendar date", async () => {
    db = new FDraftLocalDatabase(`mark-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    // 23:30 UTC on Jan 1st is already Jan 2nd in a UTC+something-past-30min
    // zone — the watched_date must follow the PROFILE's timezone, not UTC.
    const clock = new FixedClock(new Date("2026-01-01T23:30:00.000Z"));
    const outcome = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: entry.id,
        profileTimezone: "Pacific/Kiritimati",
      }, // UTC+14
      { clock },
    );

    expect(outcome).toEqual({
      ok: true,
      watchlistEntryId: entry.id,
      filmId: entry.filmId,
      watchedHistoryId: expect.any(String),
      draftItemId: null,
      draftId: null,
      draftArchivedByThisAction: false,
    });

    const updated = await repos.watchlist.getEntryById(PROFILE_ID, entry.id);
    expect(updated?.isActive).toBe(false);
    expect(updated?.removedReason).toBe("watched");

    const history = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(history).toHaveLength(1);
    expect(history[0].watchedDate).toBe("2026-01-02"); // local date in UTC+14, not "2026-01-01"
  });

  it("refuses to mark an already-inactive entry watched again", async () => {
    db = new FDraftLocalDatabase(`mark-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    const first = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: entry.id,
      profileTimezone: "UTC",
    });
    expect(first.ok).toBe(true);

    const second = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: entry.id,
      profileTimezone: "UTC",
    });
    expect(second).toEqual({
      ok: false,
      error: "not_active",
      message: expect.any(String),
    });

    expect(await repos.history.listWatchedHistory(PROFILE_ID)).toHaveLength(1);
  });

  it("returns not_found for another profile's watchlist entry (profile isolation, not just RLS)", async () => {
    db = new FDraftLocalDatabase(`mark-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    const outcome = await markLocalFilmWatched(repos, {
      profileId: "someone-else",
      watchlistEntryId: entry.id,
      profileTimezone: "UTC",
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_found",
      message: expect.any(String),
    });

    const stillActive = await repos.watchlist.getEntryById(
      PROFILE_ID,
      entry.id,
    );
    expect(stillActive?.isActive).toBe(true);
  });

  it("completes a matching item in the profile's active draft and reports its id", async () => {
    db = new FDraftLocalDatabase(`mark-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    const draft: DraftRecord = {
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(draft);
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: draft.id,
        filmId: entry.filmId,
        watchlistEntryId: entry.id,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const outcome = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: entry.id,
      profileTimezone: "UTC",
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.draftItemId).toBe("item-1");
    }

    const item = await repos.drafts.getItemById("item-1");
    expect(item?.isCompleted).toBe(true);
    expect(item?.watchedHistoryId).not.toBeNull();
  });

  it("archives the draft when marking watched completes its last remaining item (completed early)", async () => {
    db = new FDraftLocalDatabase(`mark-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    const draft: DraftRecord = {
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(draft);
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: draft.id,
        filmId: entry.filmId,
        watchlistEntryId: entry.id,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: entry.id,
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );

    const archived = await repos.drafts.getById(PROFILE_ID, draft.id);
    expect(archived?.status).toBe("archived");
    expect(archived?.completedAt).not.toBeNull();
  });

  it("does not complete a draft item belonging to a non-active (e.g. archived) draft", async () => {
    db = new FDraftLocalDatabase(`mark-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    await repos.drafts.createDraft({
      id: "draft-archived",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "archived",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2025-01-01T00:00:00.000Z",
      deadlineAt: "2025-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: "2025-02-01T00:00:00.000Z",
      freeformAchievedRank: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    await repos.drafts.createItems([
      {
        id: "item-old",
        draftId: "draft-archived",
        filmId: entry.filmId,
        watchlistEntryId: entry.id,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);

    const outcome = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: entry.id,
      profileTimezone: "UTC",
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.draftItemId).toBeNull();
    }
  });
});

/** Builds a `WatchSessionUndoRecord` straight from a successful `markLocalFilmWatched` outcome — exactly what `WatchToggle` hands `undoLocalFilmWatched` in the real app. */
function recordFromOutcome(
  outcome: Awaited<ReturnType<typeof markLocalFilmWatched>>,
): WatchSessionUndoRecord {
  if (!outcome.ok) {
    throw new Error("expected markLocalFilmWatched to succeed");
  }
  return {
    watchlistEntryId: outcome.watchlistEntryId,
    filmId: outcome.filmId,
    watchedHistoryId: outcome.watchedHistoryId,
    draftItemId: outcome.draftItemId,
    draftId: outcome.draftId,
    draftArchivedByThisAction: outcome.draftArchivedByThisAction,
  };
}

describe("undoLocalFilmWatched", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("reactivates the watchlist entry and deletes exactly the watched-history record this action created", async () => {
    db = new FDraftLocalDatabase(`undo-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    const outcome = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: entry.id,
      profileTimezone: "UTC",
    });
    const record = recordFromOutcome(outcome);

    const result = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record,
    });
    expect(result).toEqual({ ok: true });

    const reverted = await repos.watchlist.getEntryById(PROFILE_ID, entry.id);
    expect(reverted?.isActive).toBe(true);
    expect(reverted?.removedAt).toBeNull();
    expect(reverted?.removedReason).toBeNull();
    expect(await repos.history.listWatchedHistory(PROFILE_ID)).toHaveLength(0);
  });

  it("never removes an older, unrelated watched-history record — only the exact one this action created", async () => {
    db = new FDraftLocalDatabase(`undo-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const olderFilmEntry = await seedFilmAndEntry(repos, {
      id: "entry-older",
      filmId: "film-older",
    });
    const targetEntry = await seedFilmAndEntry(repos, {
      id: "entry-target",
      filmId: "film-target",
    });

    // An older, already-persisted watched-history record for a DIFFERENT
    // film — must survive untouched.
    const olderOutcome = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: olderFilmEntry.id,
      profileTimezone: "UTC",
    });
    if (!olderOutcome.ok) throw new Error("setup failed");

    const targetOutcome = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: targetEntry.id,
      profileTimezone: "UTC",
    });
    const targetRecord = recordFromOutcome(targetOutcome);

    await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: targetRecord,
    });

    const remainingHistory = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(remainingHistory).toHaveLength(1);
    expect(remainingHistory[0].id).toBe(olderOutcome.watchedHistoryId);

    const revertedTarget = await repos.watchlist.getEntryById(
      PROFILE_ID,
      targetEntry.id,
    );
    expect(revertedTarget?.isActive).toBe(true);
    const stillWatchedOlder = await repos.watchlist.getEntryById(
      PROFILE_ID,
      olderFilmEntry.id,
    );
    expect(stillWatchedOlder?.isActive).toBe(false);
  });

  it("reverts a completed draft item back to incomplete, without touching the draft's status", async () => {
    db = new FDraftLocalDatabase(`undo-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const watchedEntry = await seedFilmAndEntry(repos, {
      id: "entry-1",
      filmId: "film-1",
    });
    const untouchedEntry = await seedFilmAndEntry(repos, {
      id: "entry-2",
      filmId: "film-2",
    });

    const draft: DraftRecord = {
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 2,
      randomFilmCount: 2,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(draft);
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: draft.id,
        filmId: watchedEntry.filmId,
        watchlistEntryId: watchedEntry.id,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "item-2",
        draftId: draft.id,
        filmId: untouchedEntry.filmId,
        watchlistEntryId: untouchedEntry.id,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 1,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const outcome = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: watchedEntry.id,
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    const record = recordFromOutcome(outcome);
    expect(record.draftArchivedByThisAction).toBe(false); // item-2 is still incomplete

    await undoLocalFilmWatched(repos, { profileId: PROFILE_ID, record });

    const item = await repos.drafts.getItemById("item-1");
    expect(item?.isCompleted).toBe(false);
    expect(item?.completedAt).toBeNull();
    expect(item?.watchedHistoryId).toBeNull();

    const draftAfter = await repos.drafts.getById(PROFILE_ID, draft.id);
    expect(draftAfter?.status).toBe("active");
  });

  it("reverts the draft back to active when undoing the action that archived it early (COMPLETED/FULLY WATCHED DRAFT)", async () => {
    db = new FDraftLocalDatabase(`undo-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    const draft: DraftRecord = {
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(draft);
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: draft.id,
        filmId: entry.filmId,
        watchlistEntryId: entry.id,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const outcome = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: entry.id,
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    const record = recordFromOutcome(outcome);
    expect(record.draftArchivedByThisAction).toBe(true);
    expect(record.draftId).toBe(draft.id);

    const archivedBefore = await repos.drafts.getById(PROFILE_ID, draft.id);
    expect(archivedBefore?.status).toBe("archived");

    const result = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record,
    });
    expect(result).toEqual({ ok: true });

    const revertedDraft = await repos.drafts.getById(PROFILE_ID, draft.id);
    expect(revertedDraft?.status).toBe("active");
    expect(revertedDraft?.completedAt).toBeNull();
    expect(revertedDraft?.freeformAchievedRank).toBeNull();

    const item = await repos.drafts.getItemById("item-1");
    expect(item?.isCompleted).toBe(false);

    const reenteredWatchlist = await repos.watchlist.getEntryById(
      PROFILE_ID,
      entry.id,
    );
    expect(reenteredWatchlist?.isActive).toBe(true);
  });

  it("does not revert a draft item that was completed by a different action than the one recorded", async () => {
    db = new FDraftLocalDatabase(`undo-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos);

    const draft: DraftRecord = {
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(draft);
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: draft.id,
        filmId: entry.filmId,
        watchlistEntryId: entry.id,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        // Already completed by some OTHER, unrelated action/history entry —
        // never one this test's undo call is allowed to touch.
        isCompleted: true,
        completedAt: "2025-06-01T00:00:00.000Z",
        watchedHistoryId: "history-from-a-different-action",
        createdAt: "2025-06-01T00:00:00.000Z",
      },
    ]);

    // A stale/forged record claiming to have completed item-1, but with a
    // watchedHistoryId that doesn't match what's actually on the item.
    const staleRecord: WatchSessionUndoRecord = {
      watchlistEntryId: entry.id,
      filmId: entry.filmId,
      watchedHistoryId: "some-other-watched-history-id",
      draftItemId: "item-1",
      draftId: draft.id,
      draftArchivedByThisAction: false,
    };

    await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: staleRecord,
    });

    const item = await repos.drafts.getItemById("item-1");
    expect(item?.isCompleted).toBe(true);
    expect(item?.watchedHistoryId).toBe("history-from-a-different-action");
  });

  it("does not reactivate a watchlist entry that's inactive for a reason other than 'watched'", async () => {
    db = new FDraftLocalDatabase(`undo-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entry = await seedFilmAndEntry(repos, {
      isActive: false,
      removedReason: "postmortem_not_interested",
      removedAt: "2026-01-05T00:00:00.000Z",
    });

    const staleRecord: WatchSessionUndoRecord = {
      watchlistEntryId: entry.id,
      filmId: entry.filmId,
      watchedHistoryId: "irrelevant-history-id",
      draftItemId: null,
      draftId: null,
      draftArchivedByThisAction: false,
    };

    await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: staleRecord,
    });

    const stillRemoved = await repos.watchlist.getEntryById(
      PROFILE_ID,
      entry.id,
    );
    expect(stillRemoved?.isActive).toBe(false);
    expect(stillRemoved?.removedReason).toBe("postmortem_not_interested");
  });

  it("returns not_found when the watchlist entry no longer exists", async () => {
    db = new FDraftLocalDatabase(`undo-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: {
        watchlistEntryId: "does-not-exist",
        filmId: "film-1",
        watchedHistoryId: "history-1",
        draftItemId: null,
        draftId: null,
        draftArchivedByThisAction: false,
      },
    });

    expect(outcome).toEqual({
      ok: false,
      error: "not_found",
      message: expect.any(String),
    });
  });
});
