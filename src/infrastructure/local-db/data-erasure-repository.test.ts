import { afterEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "./create-local-repositories";
import { FDraftLocalDatabase } from "./database";

const PROFILE_ID = "alex";
const OTHER_PROFILE_ID = "sam";

describe("LocalDataErasureRepository.eraseProfileCompletely", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("deletes every table the profile owns, but leaves another profile's data completely untouched", async () => {
    db = new FDraftLocalDatabase(`erase-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const base = {
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: "UTC",
      settings: {
        reducedMotion: false,
        defaultPage: "watchlist" as const,
        franchiseChronologicalOrder: false,
        adminMode: false,
        halloweenPumpkinState: "uncarved" as const,
      },
      dataVersion: 1,
    };
    await repos.profiles.create({
      ...base,
      id: PROFILE_ID,
      displayName: "Alex",
    });
    await repos.profiles.create({
      ...base,
      id: OTHER_PROFILE_ID,
      displayName: "Sam",
    });

    await repos.films.create({
      id: "film-1",
      title: "Film One",
      releaseYear: 2020,
      letterboxdSlug: "film-one",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    for (const profileId of [PROFILE_ID, OTHER_PROFILE_ID]) {
      await repos.watchlist.createEntry({
        id: `entry-${profileId}`,
        profileId,
        filmId: "film-1",
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
      });
      await repos.history.addWatchedHistory({
        id: `history-${profileId}`,
        profileId,
        filmId: "film-1",
        watchlistEntryId: `entry-${profileId}`,
        source: "app_watchlist_action",
        watchedDate: "2026-01-01",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      await repos.settings.set(profileId, "reducedMotion", true);
      await repos.points.setBalance({
        profileId,
        currency: "lifetime",
        total: 5,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      await repos.drafts.createDraft({
        id: `draft-${profileId}`,
        profileId,
        difficulty: "baby",
        timeMode: "timer",
        status: "archived",
        totalFilms: 1,
        randomFilmCount: 1,
        challengeFilmCount: 0,
        challengeMode: null,
        startedAt: "2026-01-01T00:00:00.000Z",
        deadlineAt: "2026-02-01T00:00:00.000Z",
        timezone: "UTC",
        completedAt: "2026-02-01T00:00:00.000Z",
        freeformAchievedRank: null,
        sourceEventId: null,
        sourceEventManuallyEnabled: null,
        rewardsGrantedAt: null,
        eventOccurrenceYear: null,
        customName: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      await repos.drafts.createItems([
        {
          id: `item-${profileId}`,
          draftId: `draft-${profileId}`,
          filmId: "film-1",
          watchlistEntryId: `entry-${profileId}`,
          source: "random",
          challengeId: null,
          challengeAttemptId: null,
          challengeDisplayValue: null,
          orderIndex: 0,
          isCompleted: true,
          completedAt: "2026-01-15T00:00:00.000Z",
          watchedHistoryId: `history-${profileId}`,
          originFilmId: null,
          substitutionReason: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
      await repos.history.addPostmortemResponse({
        id: `response-${profileId}`,
        draftId: `draft-${profileId}`,
        draftItemId: `item-${profileId}`,
        response: "no_reason",
        appliedAt: "2026-01-20T00:00:00.000Z",
        createdAt: "2026-01-20T00:00:00.000Z",
      });
      await repos.history.addSelectionWeightAdjustment({
        id: `weight-${profileId}`,
        watchlistEntryId: `entry-${profileId}`,
        draftPostmortemResponseId: null,
        delta: 1,
        reason: "postmortem_wanted_more_time",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    }

    await repos.dataErasure.eraseProfileCompletely(PROFILE_ID);

    // Alex is gone, everywhere.
    expect(await repos.profiles.getById(PROFILE_ID)).toBeNull();
    expect(await repos.watchlist.listAllEntries(PROFILE_ID)).toHaveLength(0);
    expect(await repos.drafts.listArchived(PROFILE_ID)).toHaveLength(0);
    expect(await repos.history.listWatchedHistory(PROFILE_ID)).toHaveLength(0);
    expect(await repos.settings.getAll(PROFILE_ID)).toEqual({});
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    expect(await repos.drafts.getItemById(`item-${PROFILE_ID}`)).toBeNull();
    expect(
      await repos.history.getPostmortemResponseForItem(`item-${PROFILE_ID}`),
    ).toBeNull();
    expect(
      await repos.history.listSelectionWeightAdjustments(`entry-${PROFILE_ID}`),
    ).toHaveLength(0);

    // Sam is completely unaffected.
    expect(await repos.profiles.getById(OTHER_PROFILE_ID)).not.toBeNull();
    expect(await repos.watchlist.listAllEntries(OTHER_PROFILE_ID)).toHaveLength(
      1,
    );
    expect(await repos.drafts.listArchived(OTHER_PROFILE_ID)).toHaveLength(1);
    expect(
      await repos.history.listWatchedHistory(OTHER_PROFILE_ID),
    ).toHaveLength(1);
    expect(await repos.settings.getAll(OTHER_PROFILE_ID)).toEqual({
      reducedMotion: true,
    });
    expect(await repos.points.getBalance(OTHER_PROFILE_ID, "lifetime")).toBe(5);
    expect(
      await repos.drafts.getItemById(`item-${OTHER_PROFILE_ID}`),
    ).not.toBeNull();
    expect(
      await repos.history.getPostmortemResponseForItem(
        `item-${OTHER_PROFILE_ID}`,
      ),
    ).not.toBeNull();
    expect(
      await repos.history.listSelectionWeightAdjustments(
        `entry-${OTHER_PROFILE_ID}`,
      ),
    ).toHaveLength(1);

    // The shared film catalog entry is untouched — it's not profile-owned data.
    expect(await repos.films.getById("film-1")).not.toBeNull();
  });

  it("is safe to call on a profile with no data at all", async () => {
    db = new FDraftLocalDatabase(`erase-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.profiles.create({
      id: PROFILE_ID,
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: "UTC",
      settings: {
        reducedMotion: false,
        defaultPage: "watchlist",
        franchiseChronologicalOrder: false,
        adminMode: false,
        halloweenPumpkinState: "uncarved",
      },
      dataVersion: 1,
    });

    await expect(
      repos.dataErasure.eraseProfileCompletely(PROFILE_ID),
    ).resolves.toBeUndefined();
    expect(await repos.profiles.getById(PROFILE_ID)).toBeNull();
  });
});
