import { afterEach, describe, expect, it } from "vitest";
import { buildProfileBackup } from "@/application/backup/export-backup";
import type { BackupV1 } from "@/domain/backup/backup-schema";
import { FixedClock } from "@/domain/time/clock";
import type { Repositories } from "@/repositories";
import { createLocalRepositories } from "./create-local-repositories";
import { FDraftLocalDatabase } from "./database";

const CLOCK = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));
const SCHEMA_VERSION = 1;

function sequentialIdGenerator(prefix: string) {
  let counter = 0;
  return { generate: () => `${prefix}-${++counter}` };
}

async function seedFullProfile(
  repos: Repositories,
  profileId: string,
  filmSlug = "paddington-2",
) {
  await repos.profiles.create({
    id: profileId,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
    timezone: "Europe/London",
    settings: {
      reducedMotion: true,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
    },
    dataVersion: 1,
  });
  await repos.settings.set(profileId, "customKey", { nested: [1, 2, 3] });

  const filmId = `film-${profileId}`;
  await repos.films.create({
    id: filmId,
    title: "Paddington 2",
    releaseYear: 2017,
    letterboxdSlug: filmSlug,
    letterboxdUri: "https://letterboxd.com/film/paddington-2/",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: `meta-${profileId}`,
    filmId,
    provider: "tmdb",
    posterUrl: "https://image.tmdb.org/poster.jpg",
    runtimeMinutes: 104,
    genres: ["Comedy"],
    directors: ["Paul King"],
    countries: null,
    languages: null,
    collectionId: null,
    collectionName: null,
    collectionOrder: null,
    averageRating: 4.5,
    popularity: null,
    watchCount: null,
    fansCount: null,
    listAppearances: null,
    externalIds: { imdb_id: "tt4468740" },
    raw: { anything: "goes" },
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });

  const entryId = `entry-${profileId}`;
  await repos.watchlist.createEntry({
    id: entryId,
    profileId,
    filmId,
    dateAdded: "2026-01-01",
    position: 0,
    isActive: true,
    selectionWeight: 1,
    importSource: "csv",
    importId: `import-${profileId}`,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createImport({
    id: `import-${profileId}`,
    profileId,
    source: "csv",
    status: "completed",
    rawFilename: "watchlist.csv",
    filmsImported: 1,
    filmsUpdated: 0,
    duplicatesSkipped: 0,
    enrichmentFailures: 0,
    unresolvedCount: 0,
    errorMessage: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const historyId = `history-${profileId}`;
  await repos.history.addWatchedHistory({
    id: historyId,
    profileId,
    filmId,
    watchlistEntryId: entryId,
    source: "app_watchlist_action",
    watchedDate: "2026-01-05",
    createdAt: "2026-01-05T00:00:00.000Z",
  });
  await repos.history.upsertRating({
    id: `rating-${profileId}`,
    profileId,
    filmId,
    rating: 4.5,
    source: "app",
    ratedAt: "2026-01-05T00:00:00.000Z",
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  });

  const draftId = `draft-${profileId}`;
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
    customName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  });
  const itemId = `item-${profileId}`;
  await repos.drafts.createItems([
    {
      id: itemId,
      draftId,
      filmId,
      watchlistEntryId: entryId,
      source: "random",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: { some: "value" },
      orderIndex: 0,
      isCompleted: true,
      completedAt: "2026-01-05T00:00:00.000Z",
      watchedHistoryId: historyId,
      originFilmId: null,
      substitutionReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  await repos.drafts.createChallengeAttempt({
    id: `attempt-${profileId}`,
    draftId,
    challengeId: "some-challenge",
    attemptNumber: 1,
    status: "success",
    reason: null,
    candidateFilmId: filmId,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const responseId = `response-${profileId}`;
  await repos.history.addPostmortemResponse({
    id: responseId,
    draftId,
    draftItemId: itemId,
    response: "no_reason",
    appliedAt: "2026-01-06T00:00:00.000Z",
    createdAt: "2026-01-06T00:00:00.000Z",
  });
  await repos.history.addSelectionWeightAdjustment({
    id: `weight-${profileId}`,
    watchlistEntryId: entryId,
    draftPostmortemResponseId: responseId,
    delta: 1,
    reason: "postmortem_wanted_more_time",
    createdAt: "2026-01-06T00:00:00.000Z",
  });
}

describe("LocalBackupRestoreRepository", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  describe("importAsNewProfile", () => {
    it("recreates the complete profile under a freshly generated id, preserving every relationship", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "source-profile");
      const backup = await buildProfileBackup(repos, "source-profile", {
        clock: CLOCK,
      });

      const result = await repos.backupRestore.importAsNewProfile(backup, {
        idGenerator: sequentialIdGenerator("new"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      });

      expect(result.profileId).not.toBe("source-profile");

      const profile = await repos.profiles.getById(result.profileId);
      expect(profile?.displayName).toBe("Alex");
      expect(profile?.timezone).toBe("Europe/London");
      expect(profile?.dataVersion).toBe(SCHEMA_VERSION);

      const entries = await repos.watchlist.listAllEntries(result.profileId);
      expect(entries).toHaveLength(1);
      const [entry] = entries;
      expect(entry.id).not.toBe("entry-source-profile");
      expect(entry.profileId).toBe(result.profileId);

      const history = await repos.history.listWatchedHistory(result.profileId);
      expect(history).toHaveLength(1);
      expect(history[0].watchlistEntryId).toBe(entry.id);

      const drafts = await repos.drafts.listAllForProfile(result.profileId);
      expect(drafts).toHaveLength(1);
      const items = await repos.drafts.listItemsForDraft(drafts[0].id);
      expect(items).toHaveLength(1);
      expect(items[0].watchlistEntryId).toBe(entry.id);
      expect(items[0].watchedHistoryId).toBe(history[0].id);
      expect(items[0].filmId).toBe(entry.filmId);

      const attempts = await repos.drafts.listChallengeAttemptsForDraft(
        drafts[0].id,
      );
      expect(attempts).toHaveLength(1);
      expect(attempts[0].candidateFilmId).toBe(entry.filmId);

      const responses = await repos.history.listPostmortemResponsesForDraft(
        drafts[0].id,
      );
      expect(responses).toHaveLength(1);
      expect(responses[0].draftItemId).toBe(items[0].id);

      const weights = await repos.history.listSelectionWeightAdjustments(
        entry.id,
      );
      expect(weights).toHaveLength(1);
      expect(weights[0].draftPostmortemResponseId).toBe(responses[0].id);

      const settings = await repos.settings.getAll(result.profileId);
      expect(settings.customKey).toEqual({ nested: [1, 2, 3] });

      const film = await repos.films.getById(entry.filmId);
      expect(film?.title).toBe("Paddington 2");
      const metadata = await repos.films.getMetadataForFilm(entry.filmId);
      expect(metadata).toHaveLength(1);
      expect(metadata[0].externalIds).toEqual({ imdb_id: "tt4468740" });
    });

    it("never reuses the backup's own ids, even when they collide with an existing local profile's id", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "shared-id");
      const backup = await buildProfileBackup(repos, "shared-id", {
        clock: CLOCK,
      });

      // Simulate importing a backup whose own profile id happens to match
      // an existing local profile — the import must not overwrite it.
      const result = await repos.backupRestore.importAsNewProfile(backup, {
        idGenerator: sequentialIdGenerator("imported"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      });

      expect(result.profileId).not.toBe("shared-id");
      const original = await repos.profiles.getById("shared-id");
      expect(original).not.toBeNull();
      const imported = await repos.profiles.getById(result.profileId);
      expect(imported).not.toBeNull();

      const originalEntries = await repos.watchlist.listAllEntries("shared-id");
      const importedEntries = await repos.watchlist.listAllEntries(
        result.profileId,
      );
      expect(originalEntries).toHaveLength(1);
      expect(importedEntries).toHaveLength(1);
      expect(originalEntries[0].id).not.toBe(importedEntries[0].id);
    });

    it("dedupes films against the existing local catalog by Letterboxd slug instead of creating duplicates", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "profile-a", "shared-slug");
      const backup = await buildProfileBackup(repos, "profile-a", {
        clock: CLOCK,
      });

      // A second, unrelated existing profile whose watchlist already
      // references a film with the SAME Letterboxd slug as the backup's.
      const existingFilmId = "already-local-film";
      await repos.films.create({
        id: existingFilmId,
        title: "Paddington 2",
        releaseYear: 2017,
        letterboxdSlug: "shared-slug",
        letterboxdUri: null,
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      });

      const result = await repos.backupRestore.importAsNewProfile(backup, {
        idGenerator: sequentialIdGenerator("new"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      });

      const entries = await repos.watchlist.listAllEntries(result.profileId);
      expect(entries[0].filmId).toBe(existingFilmId);

      const allFilmsWithSlug =
        await repos.films.findByLetterboxdSlug("shared-slug");
      expect(allFilmsWithSlug?.id).toBe(existingFilmId);
    });

    it("normalizes an invalid/corrupted timezone rather than restoring it verbatim — see docs/product-spec.md, 'COMPLETE PRODUCT AUDIT'", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "profile-a");
      const backup = await buildProfileBackup(repos, "profile-a", {
        clock: CLOCK,
      });
      const corrupted: BackupV1 = {
        ...backup,
        profile: { ...backup.profile, timezone: "Not/AZone" },
      };

      const result = await repos.backupRestore.importAsNewProfile(corrupted, {
        idGenerator: sequentialIdGenerator("new"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      });

      const profile = await repos.profiles.getById(result.profileId);
      expect(profile?.timezone).not.toBe("Not/AZone");
      expect(profile?.timezone).toBe(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
    });

    it("restores unresolvedMetadata, remapped to the correct local film id", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "profile-a");
      await repos.unresolvedMetadata.upsert({
        id: "unresolved-1",
        filmId: "film-profile-a",
        provider: "tmdb",
        status: "unresolved",
        reason: "ambiguous",
        message: "Could not confidently choose between multiple results.",
        lastAttemptedAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      });
      const backup = await buildProfileBackup(repos, "profile-a", {
        clock: CLOCK,
      });

      const result = await repos.backupRestore.importAsNewProfile(backup, {
        idGenerator: sequentialIdGenerator("new"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      });

      const entries = await repos.watchlist.listAllEntries(result.profileId);
      const restored = await repos.unresolvedMetadata.getByFilmId(
        entries[0].filmId,
      );
      expect(restored).toMatchObject({
        status: "unresolved",
        reason: "ambiguous",
      });
    });

    it("a backup exported before UNRESOLVED METADATA RESOLUTION existed (no unresolvedMetadata key at all) still restores cleanly", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "profile-a");
      const backup = await buildProfileBackup(repos, "profile-a", {
        clock: CLOCK,
      });
      const legacyBackup = { ...backup } as Partial<BackupV1>;
      delete legacyBackup.unresolvedMetadata;

      const result = await repos.backupRestore.importAsNewProfile(
        legacyBackup as BackupV1,
        {
          idGenerator: sequentialIdGenerator("new"),
          clock: CLOCK,
          currentSchemaVersion: SCHEMA_VERSION,
        },
      );

      const entries = await repos.watchlist.listAllEntries(result.profileId);
      expect(entries).toHaveLength(1);
    });

    it("leaves every other local profile's data completely untouched", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "bystander");
      const bystanderBackupBefore = await buildProfileBackup(
        repos,
        "bystander",
        { clock: CLOCK },
      );

      await seedFullProfile(repos, "importee-source", "importee-slug");
      const backup = await buildProfileBackup(repos, "importee-source", {
        clock: CLOCK,
      });
      await repos.backupRestore.importAsNewProfile(backup, {
        idGenerator: sequentialIdGenerator("new"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      });

      const bystanderBackupAfter = await buildProfileBackup(
        repos,
        "bystander",
        { clock: CLOCK },
      );
      expect(bystanderBackupAfter).toEqual(bystanderBackupBefore);
    });

    it("rolls back completely if a storage-level constraint fails partway through — no partial profile is left behind", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "corrupt-source");
      const backup = await buildProfileBackup(repos, "corrupt-source", {
        clock: CLOCK,
      });

      // Corrupt the backup in a way schema validation can't catch: two
      // postmortem responses pointing at the same draft item — violates
      // the `&draftItemId` UNIQUE index enforced by the storage layer
      // itself (see schema.ts), not by Zod.
      const corrupted: BackupV1 = {
        ...backup,
        draftPostmortemResponses: [
          ...backup.draftPostmortemResponses,
          { ...backup.draftPostmortemResponses[0], id: "duplicate-response" },
        ],
      };

      const profileCountBefore = (await repos.profiles.list()).length;

      await expect(
        repos.backupRestore.importAsNewProfile(corrupted, {
          idGenerator: sequentialIdGenerator("rollback"),
          clock: CLOCK,
          currentSchemaVersion: SCHEMA_VERSION,
        }),
      ).rejects.toThrow();

      const profilesAfter = await repos.profiles.list();
      expect(profilesAfter).toHaveLength(profileCountBefore);
      expect(
        profilesAfter.some(
          (profile) =>
            profile.displayName === "Alex" && profile.id !== "corrupt-source",
        ),
      ).toBe(false);
    });
  });

  describe("replaceProfile", () => {
    it("replaces the target profile's entire data set while keeping its id stable", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "device-a", "slug-a");
      await seedFullProfile(repos, "device-b-target", "slug-b");
      const backupFromA = await buildProfileBackup(repos, "device-a", {
        clock: CLOCK,
      });

      const result = await repos.backupRestore.replaceProfile(
        "device-b-target",
        backupFromA,
        {
          idGenerator: sequentialIdGenerator("replace"),
          clock: CLOCK,
          currentSchemaVersion: SCHEMA_VERSION,
        },
      );

      expect(result.profileId).toBe("device-b-target");
      const profile = await repos.profiles.getById("device-b-target");
      expect(profile?.timezone).toBe("Europe/London");

      const entries = await repos.watchlist.listAllEntries("device-b-target");
      expect(entries).toHaveLength(1);
      // Only the film that backup A's watchlist referenced should remain reachable —
      // the target's own prior film (from seedFullProfile("device-b-target", "slug-b"))
      // stays in the shared catalog but is no longer referenced by this profile.
      const film = await repos.films.getById(entries[0].filmId);
      expect(film?.letterboxdSlug).toBe("slug-a");

      // The original device-a profile (the backup's source) is untouched.
      const originalEntries = await repos.watchlist.listAllEntries("device-a");
      expect(originalEntries).toHaveLength(1);
    });

    it("rolls back to the pre-replace state if the restore fails partway through", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "target-profile");
      const targetBackupBefore = await buildProfileBackup(
        repos,
        "target-profile",
        { clock: CLOCK },
      );

      await seedFullProfile(repos, "backup-source");
      const backup = await buildProfileBackup(repos, "backup-source", {
        clock: CLOCK,
      });
      const corrupted: BackupV1 = {
        ...backup,
        draftPostmortemResponses: [
          ...backup.draftPostmortemResponses,
          { ...backup.draftPostmortemResponses[0], id: "duplicate-response" },
        ],
      };

      await expect(
        repos.backupRestore.replaceProfile("target-profile", corrupted, {
          idGenerator: sequentialIdGenerator("rollback"),
          clock: CLOCK,
          currentSchemaVersion: SCHEMA_VERSION,
        }),
      ).rejects.toThrow();

      const targetBackupAfter = await buildProfileBackup(
        repos,
        "target-profile",
        { clock: CLOCK },
      );
      expect(targetBackupAfter).toEqual(targetBackupBefore);
    });

    it("creates a safety net expectation: replacing a nonexistent profile id still succeeds (behaves like importing fresh under that id)", async () => {
      db = new FDraftLocalDatabase(`restore-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await seedFullProfile(repos, "backup-source-2");
      const backup = await buildProfileBackup(repos, "backup-source-2", {
        clock: CLOCK,
      });

      const result = await repos.backupRestore.replaceProfile(
        "brand-new-slot",
        backup,
        {
          idGenerator: sequentialIdGenerator("fresh"),
          clock: CLOCK,
          currentSchemaVersion: SCHEMA_VERSION,
        },
      );

      expect(result.profileId).toBe("brand-new-slot");
      const profile = await repos.profiles.getById("brand-new-slot");
      expect(profile?.displayName).toBe("Alex");
    });
  });
});
