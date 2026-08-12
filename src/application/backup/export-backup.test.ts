import { afterEach, describe, expect, it } from "vitest";
import {
  buildProfileBackup,
  getLastBackupExportedAt,
  recordBackupExported,
  serializeBackupCompact,
  serializeBackupReadable,
  suggestBackupFilename,
} from "@/application/backup/export-backup";
import { backupV1Schema } from "@/domain/backup/backup-schema";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedFullProfile(repos: Repositories) {
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
    timezone: "Europe/London",
    settings: { reducedMotion: true, defaultPage: "watchlist" },
    dataVersion: 1,
  });
  await repos.settings.set(PROFILE_ID, "customKey", { nested: [1, 2, 3] });

  await repos.films.create({
    id: "film-1",
    title: "Paddington 2",
    releaseYear: 2017,
    letterboxdSlug: "paddington-2",
    letterboxdUri: "https://letterboxd.com/film/paddington-2/",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: "meta-1",
    filmId: "film-1",
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
    lastEnrichedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });

  // A second, unrelated film belonging to nobody's watchlist/history/drafts —
  // must NOT be pulled into the backup.
  await repos.films.create({
    id: "film-unrelated",
    title: "Unrelated Film",
    releaseYear: 1999,
    letterboxdSlug: "unrelated-film",
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  await repos.watchlist.createEntry({
    id: "entry-1",
    profileId: PROFILE_ID,
    filmId: "film-1",
    dateAdded: "2026-01-01",
    position: 0,
    isActive: true,
    selectionWeight: 1,
    importSource: "csv",
    importId: "import-1",
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createImport({
    id: "import-1",
    profileId: PROFILE_ID,
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
  await repos.history.addWatchedHistory({
    id: "history-1",
    profileId: PROFILE_ID,
    filmId: "film-1",
    watchlistEntryId: "entry-1",
    source: "app_watchlist_action",
    watchedDate: "2026-01-05",
    createdAt: "2026-01-05T00:00:00.000Z",
  });
  await repos.history.upsertRating({
    id: "rating-1",
    profileId: PROFILE_ID,
    filmId: "film-1",
    rating: 4.5,
    source: "app",
    ratedAt: "2026-01-05T00:00:00.000Z",
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  });

  await repos.drafts.createDraft({
    id: "draft-1",
    profileId: PROFILE_ID,
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  });
  await repos.drafts.createItems([
    {
      id: "item-1",
      draftId: "draft-1",
      filmId: "film-1",
      watchlistEntryId: "entry-1",
      source: "random",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: { some: "value" },
      orderIndex: 0,
      isCompleted: true,
      completedAt: "2026-01-05T00:00:00.000Z",
      watchedHistoryId: "history-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  await repos.drafts.createChallengeAttempt({
    id: "attempt-1",
    draftId: "draft-1",
    challengeId: "some-challenge",
    attemptNumber: 1,
    status: "success",
    reason: null,
    candidateFilmId: "film-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.history.addPostmortemResponse({
    id: "response-1",
    draftId: "draft-1",
    draftItemId: "item-1",
    response: "no_reason",
    appliedAt: "2026-01-06T00:00:00.000Z",
    createdAt: "2026-01-06T00:00:00.000Z",
  });
  await repos.history.addSelectionWeightAdjustment({
    id: "weight-1",
    watchlistEntryId: "entry-1",
    draftPostmortemResponseId: "response-1",
    delta: 1,
    reason: "postmortem_wanted_more_time",
    createdAt: "2026-01-06T00:00:00.000Z",
  });
}

describe("buildProfileBackup", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("produces a backup that validates against the current schema", async () => {
    db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);

    const backup = await buildProfileBackup(repos, PROFILE_ID, {
      clock: new FixedClock(new Date("2026-08-11T00:00:00.000Z")),
    });
    const result = backupV1Schema.safeParse(backup);
    expect(result.success).toBe(true);
  });

  it("includes every category of data the profile actually owns", async () => {
    db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);

    const backup = await buildProfileBackup(repos, PROFILE_ID);

    expect(backup.profile.id).toBe(PROFILE_ID);
    expect(backup.profile.displayName).toBe("Alex");
    expect(backup.watchlistEntries).toHaveLength(1);
    expect(backup.watchlistImports).toHaveLength(1);
    expect(backup.watchedHistory).toHaveLength(1);
    expect(backup.userRatings).toHaveLength(1);
    expect(backup.drafts).toHaveLength(1);
    expect(backup.draftItems).toHaveLength(1);
    expect(backup.draftChallengeAttempts).toHaveLength(1);
    expect(backup.draftPostmortemResponses).toHaveLength(1);
    expect(backup.selectionWeightAdjustments).toHaveLength(1);
    expect(backup.settings.find((s) => s.key === "customKey")).toEqual({
      key: "customKey",
      value: { nested: [1, 2, 3] },
    });
  });

  it("only exports films the profile's own data actually references — never the wider shared catalog", async () => {
    db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);

    const backup = await buildProfileBackup(repos, PROFILE_ID);
    expect(backup.films.map((f) => f.id)).toEqual(["film-1"]);
    expect(backup.filmMetadata.map((m) => m.filmId)).toEqual(["film-1"]);
  });

  it("never embeds any image data — posterUrl is exported as a plain remote URL string, exactly as stored", async () => {
    db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);

    const backup = await buildProfileBackup(repos, PROFILE_ID);
    expect(backup.filmMetadata[0].posterUrl).toBe(
      "https://image.tmdb.org/poster.jpg",
    );
    // The whole backup is plain JSON-safe data — no binary/blob content anywhere.
    expect(() => JSON.parse(serializeBackupCompact(backup))).not.toThrow();
  });

  it("round-trips free-form JSON fields (raw/externalIds/challengeDisplayValue) unchanged", async () => {
    db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);

    const backup = await buildProfileBackup(repos, PROFILE_ID);
    expect(backup.filmMetadata[0].externalIds).toEqual({
      imdb_id: "tt4468740",
    });
    expect(backup.filmMetadata[0].raw).toEqual({ anything: "goes" });
    expect(backup.draftItems[0].challengeDisplayValue).toEqual({
      some: "value",
    });
  });

  it("throws a clear error for a profile id that doesn't exist", async () => {
    db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await expect(buildProfileBackup(repos, "no-such-profile")).rejects.toThrow(
      /no profile found/i,
    );
  });

  it("an empty profile (no data at all) still produces a valid, schema-passing backup", async () => {
    db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.profiles.create({
      id: PROFILE_ID,
      displayName: "Empty",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: "UTC",
      settings: { reducedMotion: false, defaultPage: "watchlist" },
      dataVersion: 1,
    });

    const backup = await buildProfileBackup(repos, PROFILE_ID);
    expect(backupV1Schema.safeParse(backup).success).toBe(true);
    expect(backup.watchlistEntries).toHaveLength(0);
    expect(backup.drafts).toHaveLength(0);
  });
});

describe("serializeBackupCompact / serializeBackupReadable", () => {
  it("both produce the exact same data, just formatted differently", async () => {
    const db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);
    const backup = await buildProfileBackup(repos, PROFILE_ID);
    await db.delete();

    const compact = serializeBackupCompact(backup);
    const readable = serializeBackupReadable(backup);
    expect(JSON.parse(compact)).toEqual(JSON.parse(readable));
    expect(readable.length).toBeGreaterThan(compact.length); // indentation adds bytes
    expect(readable).toContain("\n");
    expect(compact).not.toContain("\n");
  });
});

describe("suggestBackupFilename", () => {
  it("produces a readable, sanitized, dated filename with the expected extension", () => {
    const clock = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));
    expect(suggestBackupFilename({ displayName: "Alex" }, clock)).toBe(
      "My-FDraft-Alex-2026-08-11.fdraft",
    );
  });

  it("sanitizes unusual characters in the display name instead of producing a broken filename", () => {
    const clock = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));
    expect(suggestBackupFilename({ displayName: "Alex / Sam?!" }, clock)).toBe(
      "My-FDraft-Alex-Sam-2026-08-11.fdraft",
    );
  });

  it("supports a different extension for the readable-JSON variant", () => {
    const clock = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));
    expect(suggestBackupFilename({ displayName: "Alex" }, clock, "json")).toBe(
      "My-FDraft-Alex-2026-08-11.json",
    );
  });
});

describe("recordBackupExported / getLastBackupExportedAt", () => {
  it('reports null ("Never") until a backup has actually been recorded', async () => {
    const db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);

    expect(await getLastBackupExportedAt(repos, PROFILE_ID)).toBeNull();

    await db.delete();
  });

  it("records and reports the timestamp of the most recent export", async () => {
    const db = new FDraftLocalDatabase(`export-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFullProfile(repos);

    const clock = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));
    await recordBackupExported(repos, PROFILE_ID, clock);
    expect(await getLastBackupExportedAt(repos, PROFILE_ID)).toBe(
      "2026-08-11T00:00:00.000Z",
    );

    clock.set(new Date("2026-09-01T00:00:00.000Z"));
    await recordBackupExported(repos, PROFILE_ID, clock);
    expect(await getLastBackupExportedAt(repos, PROFILE_ID)).toBe(
      "2026-09-01T00:00:00.000Z",
    );

    await db.delete();
  });
});
