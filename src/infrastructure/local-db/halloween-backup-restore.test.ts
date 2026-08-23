import { afterEach, describe, expect, it } from "vitest";
import { buildProfileBackup } from "@/application/backup/export-backup";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "./create-local-repositories";
import { FDraftLocalDatabase } from "./database";

const CLOCK = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));

function sequentialIdGenerator(prefix: string) {
  let counter = 0;
  return { generate: () => `${prefix}-${++counter}` };
}

/**
 * Confirms a Halloween Horror/Kitsch draft item — `watchlistEntryId: null`
 * by design, not decay (see docs/updates, "PROMPT 19 — HALLOWEEN DRAFT
 * MECHANICS") — round-trips through export/import exactly like any other
 * item, with no crash and no silent data loss, per the plan's "backup/
 * restore" regression coverage.
 */
describe("Backup/restore — Halloween off-watchlist draft item", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("preserves a null watchlistEntryId item and its 'horror' source through export and import", async () => {
    db = new FDraftLocalDatabase(`halloween-backup-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const profileId = "source-profile";

    await repos.profiles.create({
      id: profileId,
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-08-01T00:00:00.000Z",
      timezone: "Europe/London",
      settings: {
        reducedMotion: false,
        defaultPage: "watchlist",
        franchiseChronologicalOrder: false,
        adminMode: false,
        halloweenPumpkinState: "lit",
      },
      dataVersion: 1,
    });

    const filmId = "horror-film-1";
    await repos.films.create({
      id: filmId,
      title: "The Exorcist",
      releaseYear: 1973,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const draftId = "halloween-draft-1";
    await repos.drafts.createDraft({
      id: draftId,
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
      completedAt: "2026-01-05T00:00:00.000Z",
      freeformAchievedRank: null,
      sourceEventId: "halloween",
      sourceEventManuallyEnabled: null,
      rewardsGrantedAt: null,
      customName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
    });
    const itemId = "horror-item-1";
    await repos.drafts.createItems([
      {
        id: itemId,
        draftId,
        filmId,
        watchlistEntryId: null,
        source: "horror",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: true,
        completedAt: "2026-01-05T00:00:00.000Z",
        watchedHistoryId: "watched-1",
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await repos.history.addWatchedHistory({
      id: "watched-1",
      profileId,
      filmId,
      watchlistEntryId: null,
      source: "app_watchlist_action",
      watchedDate: "2026-01-05",
      createdAt: "2026-01-05T00:00:00.000Z",
    });

    const backup = await buildProfileBackup(repos, profileId, { clock: CLOCK });
    const result = await repos.backupRestore.importAsNewProfile(backup, {
      idGenerator: sequentialIdGenerator("new"),
      clock: CLOCK,
      currentSchemaVersion: 1,
    });

    expect(result.profileId).toBeTruthy();

    const restoredProfile = await repos.profiles.getById(result.profileId);
    expect(restoredProfile?.settings.halloweenPumpkinState).toBe("lit");

    const restoredItems = await repos.drafts.listItemsForDraft(
      // The new draft id is generated fresh — find it via the restored
      // profile's own drafts rather than assuming the old id survived.
      (await repos.drafts.listAllForProfile(result.profileId))[0].id,
    );
    expect(restoredItems).toHaveLength(1);
    expect(restoredItems[0].watchlistEntryId).toBeNull();
    expect(restoredItems[0].source).toBe("horror");
    expect(restoredItems[0].isCompleted).toBe(true);

    const restoredHistory = await repos.history.listWatchedHistory(
      result.profileId,
    );
    expect(restoredHistory).toHaveLength(1);
    expect(restoredHistory[0].watchlistEntryId).toBeNull();
  });
});

describe("Backup/restore — session-only Halloween easter-egg state is never included (PROMPT 21)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("a real profile backup never contains gravestone/candy-bowl/Haunted session state — they live in component state only, never a repository write", async () => {
    db = new FDraftLocalDatabase(
      `halloween-no-session-leak-${crypto.randomUUID()}`,
    );
    const repos = createLocalRepositories(db);
    const profileId = "source-profile";

    await repos.profiles.create({
      id: profileId,
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-08-01T00:00:00.000Z",
      timezone: "Europe/London",
      settings: {
        reducedMotion: false,
        defaultPage: "watchlist",
        franchiseChronologicalOrder: false,
        adminMode: true,
        halloweenPumpkinState: "lit",
      },
      dataVersion: 1,
    });
    await repos.settings.set(profileId, "events.settings", {
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "halloween",
      manuallyEnabledEvents: [],
    });
    await repos.settings.set(profileId, "events.dateOverride", {
      enabled: true,
      eventId: "halloween",
      simulatedDate: "2026-10-31T23:00:00.000Z",
    });

    const backup = await buildProfileBackup(repos, profileId, { clock: CLOCK });
    const serialized = JSON.stringify(backup).toLowerCase();

    // None of these session-only concepts ever get a key in the backup —
    // gravestone click count, candy bowl count, and the Settings "Haunted"
    // jumpscare's armed/triggered state are pure React component state,
    // never written to ProfileSettings or the generic settings table. (A
    // naming coincidence, not a contradiction: "Haunted Points" — see
    // `haunted-points-backup-restore.test.ts` — IS a real persisted
    // currency and DOES round-trip; this profile just never earned any,
    // so no `pointBalances` row for it exists to serialize here.)
    for (const forbidden of [
      "gravestone",
      "candybowl",
      "candy_bowl",
      "haunted",
      "clickcount",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // Meanwhile the pumpkin state (a REAL persisted setting) and Event
    // settings/Admin override DO round-trip, confirming this test isn't
    // just trivially passing on an empty backup.
    expect(serialized).toContain("lit");
    expect(serialized).toContain("halloween");
  });
});
