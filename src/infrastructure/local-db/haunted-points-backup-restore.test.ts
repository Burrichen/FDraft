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
 * Haunted Points (see docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE
 * + EVENT ROUTING/SETTINGS FIXES" §5): the currency/storage plumbing is
 * real even though nothing awards it yet — it must genuinely persist,
 * default to 0, stay profile-isolated, and survive backup/restore exactly
 * like every other point currency.
 */
describe("Haunted Points — persistence and profile isolation", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("defaults to 0 for a profile that has never earned any", async () => {
    db = new FDraftLocalDatabase(`haunted-points-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    expect(await repos.points.getBalance("alex", "haunted")).toBe(0);
    expect((await repos.points.getAllBalances("alex")).haunted).toBe(0);
  });

  it("persists across separate repository instances against the same database (survives restart)", async () => {
    const databaseName = `haunted-points-${crypto.randomUUID()}`;
    db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);

    await repos.points.setBalance({
      profileId: "alex",
      currency: "haunted",
      total: 13,
      updatedAt: "2026-08-11T00:00:00.000Z",
    });
    await db.close();

    // A fresh database handle against the same name simulates reopening
    // the app.
    const reopened = new FDraftLocalDatabase(databaseName);
    const reopenedRepos = createLocalRepositories(reopened);
    expect(await reopenedRepos.points.getBalance("alex", "haunted")).toBe(13);
    await reopened.close();
  });

  it("stays isolated per profile", async () => {
    db = new FDraftLocalDatabase(`haunted-points-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await repos.points.setBalance({
      profileId: "alex",
      currency: "haunted",
      total: 5,
      updatedAt: "2026-08-11T00:00:00.000Z",
    });

    expect(await repos.points.getBalance("alex", "haunted")).toBe(5);
    expect(await repos.points.getBalance("sam", "haunted")).toBe(0);
  });
});

describe("Haunted Points — backup/restore round-trip", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("a non-zero Haunted Points balance survives export and import as a new profile", async () => {
    db = new FDraftLocalDatabase(
      `haunted-points-backup-${crypto.randomUUID()}`,
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
        adminMode: false,
        halloweenPumpkinState: "uncarved",
      },
      dataVersion: 1,
    });
    await repos.points.setBalance({
      profileId,
      currency: "haunted",
      total: 42,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });

    const backup = await buildProfileBackup(repos, profileId, { clock: CLOCK });
    const result = await repos.backupRestore.importAsNewProfile(backup, {
      idGenerator: sequentialIdGenerator("new"),
      clock: CLOCK,
      currentSchemaVersion: 1,
    });

    expect(result.profileId).toBeTruthy();
    expect(await repos.points.getBalance(result.profileId, "haunted")).toBe(42);
    // The source profile's own balance is untouched by exporting it.
    expect(await repos.points.getBalance(profileId, "haunted")).toBe(42);
  });
});
