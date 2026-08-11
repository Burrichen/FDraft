import { afterEach, describe, expect, it } from "vitest";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import { markLocalFilmWatched } from "@/application/watchlist/local-watchlist-service";
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
      draftItemId: null,
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
