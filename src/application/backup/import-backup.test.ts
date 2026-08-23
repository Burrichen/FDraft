import { afterEach, describe, expect, it } from "vitest";
import {
  buildProfileBackup,
  serializeBackupCompact,
} from "@/application/backup/export-backup";
import {
  commitBackupImport,
  previewBackupFile,
} from "@/application/backup/import-backup";
import type { BackupV1 } from "@/domain/backup/backup-schema";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const CLOCK = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));
const SCHEMA_VERSION = 1;

function sequentialIdGenerator(prefix: string) {
  let counter = 0;
  return { generate: () => `${prefix}-${++counter}` };
}

async function seedProfile(repos: Repositories, profileId: string) {
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
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  const filmId = `film-${profileId}`;
  await repos.films.create({
    id: filmId,
    title: "Paddington 2",
    releaseYear: 2017,
    letterboxdSlug: `slug-${profileId}`,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: `entry-${profileId}`,
    profileId,
    filmId,
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
  });
  await repos.history.addWatchedHistory({
    id: `history-${profileId}`,
    profileId,
    filmId,
    watchlistEntryId: `entry-${profileId}`,
    source: "app_watchlist_action",
    watchedDate: "2026-01-05",
    createdAt: "2026-01-05T00:00:00.000Z",
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
    completedAt: "2026-01-05T00:00:00.000Z",
    freeformAchievedRank: null,
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: null,
    customName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  });
}

describe("previewBackupFile", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("produces an accurate summary for a well-formed backup", async () => {
    db = new FDraftLocalDatabase(`preview-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, "profile-1");
    const backup = await buildProfileBackup(repos, "profile-1", {
      clock: CLOCK,
    });

    const result = previewBackupFile(serializeBackupCompact(backup));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toEqual({
        displayName: "Alex",
        exportedAt: "2026-08-11T00:00:00.000Z",
        appVersion: expect.any(String),
        watchlistCount: 1,
        watchedFilmsCount: 1,
        draftsCount: 1,
      });
    }
  });

  it("rejects malformed JSON with a clear, typed error rather than throwing", () => {
    const result = previewBackupFile("{not json");
    expect(result).toEqual({
      ok: false,
      code: "invalid_json",
      message: expect.any(String),
    });
  });

  it("rejects a structurally valid but referentially inconsistent backup", async () => {
    db = new FDraftLocalDatabase(`preview-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, "profile-2");
    const backup = await buildProfileBackup(repos, "profile-2", {
      clock: CLOCK,
    });
    const corrupted: BackupV1 = {
      ...backup,
      watchlistEntries: [
        { ...backup.watchlistEntries[0], filmId: "ghost-film" },
      ],
    };

    const result = previewBackupFile(serializeBackupCompact(corrupted));
    expect(result).toEqual({
      ok: false,
      code: "integrity_error",
      message: expect.any(String),
    });
  });

  it("rejects an unsupported future format version with the exact required message", () => {
    const raw = JSON.stringify({
      manifest: {
        format: "fdraft-backup",
        formatVersion: 999,
        exportedAt: "2026-08-11T00:00:00.000Z",
        appVersion: "1.0.0",
      },
    });
    const result = previewBackupFile(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_newer_version");
      expect(result.message).toMatch(/newer version of FDraft/i);
    }
  });
});

describe("commitBackupImport", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("imports as a new profile, leaving the source untouched", async () => {
    db = new FDraftLocalDatabase(`commit-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, "source");
    const backup = await buildProfileBackup(repos, "source", { clock: CLOCK });

    const result = await commitBackupImport(
      repos,
      { backup, mode: "new_profile" },
      {
        idGenerator: sequentialIdGenerator("new"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      },
    );

    expect(result.profileId).not.toBe("source");
    expect(result.safetyBackup).toBeUndefined();
    const imported = await repos.profiles.getById(result.profileId);
    expect(imported?.displayName).toBe("Alex");
    const source = await repos.profiles.getById("source");
    expect(source).not.toBeNull();
  });

  it("replacing a profile returns a safety backup capturing its exact prior state", async () => {
    db = new FDraftLocalDatabase(`commit-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, "victim");
    const victimBackupBefore = await buildProfileBackup(repos, "victim", {
      clock: CLOCK,
    });

    await seedProfile(repos, "replacement-source");
    const incomingBackup = await buildProfileBackup(
      repos,
      "replacement-source",
      { clock: CLOCK },
    );

    const result = await commitBackupImport(
      repos,
      {
        backup: incomingBackup,
        mode: "replace_profile",
        targetProfileId: "victim",
      },
      {
        idGenerator: sequentialIdGenerator("replace"),
        clock: CLOCK,
        currentSchemaVersion: SCHEMA_VERSION,
      },
    );

    expect(result.profileId).toBe("victim");
    expect(result.safetyBackup?.profile.id).toBe("victim");
    expect(result.safetyBackup).toEqual(victimBackupBefore);

    const replaced = await repos.profiles.getById("victim");
    expect(replaced?.displayName).toBe("Alex");
    const entries = await repos.watchlist.listAllEntries("victim");
    const film = await repos.films.getById(entries[0].filmId);
    expect(film?.letterboxdSlug).toBe("slug-replacement-source");
  });

  it("throws a clear error when replace_profile is requested without a targetProfileId", async () => {
    db = new FDraftLocalDatabase(`commit-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, "source-3");
    const backup = await buildProfileBackup(repos, "source-3", {
      clock: CLOCK,
    });

    await expect(
      commitBackupImport(
        repos,
        { backup, mode: "replace_profile" },
        {
          idGenerator: sequentialIdGenerator("new"),
          clock: CLOCK,
          currentSchemaVersion: SCHEMA_VERSION,
        },
      ),
    ).rejects.toThrow(/targetProfileId/);
  });
});
