import { describe, expect, it } from "vitest";
import { validateBackupReferentialIntegrity } from "./backup-integrity";
import type { BackupV1 } from "./backup-schema";

function minimalBackup(): BackupV1 {
  return {
    manifest: {
      format: "fdraft-backup",
      formatVersion: 1,
      exportedAt: "2026-08-11T00:00:00.000Z",
      appVersion: "0.1.0",
    },
    profile: {
      id: "profile-1",
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-08-01T00:00:00.000Z",
      timezone: "Europe/London",
      settings: { reducedMotion: false },
      dataVersion: 1,
    },
    films: [
      {
        id: "film-1",
        title: "Paddington 2",
        releaseYear: 2017,
        letterboxdSlug: "paddington-2",
        letterboxdUri: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    filmMetadata: [],
    watchlistEntries: [
      {
        id: "entry-1",
        profileId: "profile-1",
        filmId: "film-1",
        dateAdded: "2026-01-01",
        position: 0,
        isActive: true,
        selectionWeight: 1,
        importSource: null,
        importId: null,
        removedAt: null,
        removedReason: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    watchlistImports: [],
    watchedHistory: [
      {
        id: "history-1",
        profileId: "profile-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "app_watchlist_action",
        watchedDate: "2026-01-05",
        createdAt: "2026-01-05T00:00:00.000Z",
      },
    ],
    userRatings: [],
    drafts: [
      {
        id: "draft-1",
        profileId: "profile-1",
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
        completedAt: "2026-01-05T00:00:00.000Z",
        freeformAchievedRank: null,
        sourceEventId: null,
        sourceEventManuallyEnabled: null,
        rewardsGrantedAt: null,
        eventOccurrenceYear: null,
        customName: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
      },
    ],
    draftItems: [
      {
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
        eventRewardGrantedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    draftChallengeAttempts: [],
    draftChallengeInteractions: [],
    draftPostmortemResponses: [],
    selectionWeightAdjustments: [],
    settings: [],
    pointBalances: [],
  };
}

describe("validateBackupReferentialIntegrity", () => {
  it("accepts a fully consistent backup", () => {
    expect(validateBackupReferentialIntegrity(minimalBackup())).toEqual({
      ok: true,
    });
  });

  it("accepts an entirely empty backup (nothing to be inconsistent about)", () => {
    const backup = minimalBackup();
    backup.films = [];
    backup.watchlistEntries = [];
    backup.watchedHistory = [];
    backup.drafts = [];
    backup.draftItems = [];
    expect(validateBackupReferentialIntegrity(backup)).toEqual({ ok: true });
  });

  it("flags a film metadata row referencing a film not present in the backup", () => {
    const backup = minimalBackup();
    backup.filmMetadata.push({
      id: "meta-1",
      filmId: "missing-film",
      provider: "tmdb",
      posterUrl: null,
      runtimeMinutes: null,
      genres: null,
      directors: null,
      countries: null,
      languages: null,
      collectionId: null,
      collectionName: null,
      collectionOrder: null,
      averageRating: null,
      popularity: null,
      watchCount: null,
      fansCount: null,
      listAppearances: null,
      externalIds: null,
      raw: null,
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          collection: "filmMetadata",
          recordId: "meta-1",
        }),
      );
    }
  });

  it("flags a watchlist entry belonging to a different profile than the backup's own", () => {
    const backup = minimalBackup();
    backup.watchlistEntries[0].profileId = "some-other-profile";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          collection: "watchlistEntries",
          recordId: "entry-1",
        }),
      );
    }
  });

  it("flags a watchlist entry referencing a film that doesn't exist in the backup", () => {
    const backup = minimalBackup();
    backup.watchlistEntries[0].filmId = "ghost-film";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
  });

  it("flags a watchlist entry referencing an import not present in the backup", () => {
    const backup = minimalBackup();
    backup.watchlistEntries[0].importSource = "csv";
    backup.watchlistEntries[0].importId = "ghost-import";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          collection: "watchlistEntries",
          recordId: "entry-1",
        }),
      );
    }
  });

  it("flags watched history referencing a watchlist entry not present in the backup", () => {
    const backup = minimalBackup();
    backup.watchedHistory[0].watchlistEntryId = "ghost-entry";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
  });

  it("flags a draft item referencing a draft that doesn't exist", () => {
    const backup = minimalBackup();
    backup.draftItems[0].draftId = "ghost-draft";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
  });

  it("flags a draft item referencing a watched history record not present in the backup", () => {
    const backup = minimalBackup();
    backup.draftItems[0].watchedHistoryId = "ghost-history";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          collection: "draftItems",
          recordId: "item-1",
        }),
      );
    }
  });

  it("flags a draft item referencing a challenge attempt not present in the backup", () => {
    const backup = minimalBackup();
    backup.draftItems[0].challengeAttemptId = "ghost-attempt";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          collection: "draftItems",
          recordId: "item-1",
        }),
      );
    }
  });

  it("flags a postmortem response referencing a draft item not present in the backup", () => {
    const backup = minimalBackup();
    backup.draftPostmortemResponses.push({
      id: "response-1",
      draftId: "draft-1",
      draftItemId: "ghost-item",
      response: "no_reason",
      appliedAt: "2026-01-06T00:00:00.000Z",
      createdAt: "2026-01-06T00:00:00.000Z",
    });
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
  });

  it("flags a selection weight adjustment referencing a watchlist entry not present in the backup", () => {
    const backup = minimalBackup();
    backup.selectionWeightAdjustments.push({
      id: "weight-1",
      watchlistEntryId: "ghost-entry",
      draftPostmortemResponseId: null,
      delta: 1,
      reason: "postmortem_wanted_more_time",
      createdAt: "2026-01-06T00:00:00.000Z",
    });
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
  });

  it("reports every violation at once rather than failing fast on the first one", () => {
    const backup = minimalBackup();
    backup.watchlistEntries[0].filmId = "ghost-film-1";
    backup.watchedHistory[0].filmId = "ghost-film-2";
    backup.draftItems[0].filmId = "ghost-film-3";
    const result = validateBackupReferentialIntegrity(backup);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});
