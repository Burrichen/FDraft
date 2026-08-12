import { afterEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "./create-local-repositories";
import { FDraftLocalDatabase } from "./database";

/**
 * Proves the core safety property Prompt 9.5A asks for explicitly: "Profile
 * A cannot accidentally read Profile B's watchlist / drafts / history /
 * settings." There is no RLS here — the local database has no concept of
 * "who's asking" at the storage layer at all — so this property holds
 * ONLY because every repository method takes an explicit `profileId` and
 * filters by it. These tests exist to catch a future repository change
 * that accidentally drops that filter, not to test Dexie itself.
 */
describe("cross-profile isolation (real fake-indexeddb, two profiles, one shared database)", () => {
  let db: FDraftLocalDatabase;

  afterEach(async () => {
    await db?.delete();
  });

  it("watchlist entries: profile A's active entries never include profile B's", async () => {
    db = new FDraftLocalDatabase(`isolation-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await repos.films.create({
      id: "film-1",
      title: "Film One",
      releaseYear: 2020,
      letterboxdSlug: "film-one",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const baseEntry = {
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
    };
    await repos.watchlist.createEntry({
      ...baseEntry,
      id: "entry-a",
      profileId: "alex",
    });
    await repos.watchlist.createEntry({
      ...baseEntry,
      id: "entry-b",
      profileId: "sam",
    });

    const alexEntries = await repos.watchlist.listActiveEntries("alex");
    const samEntries = await repos.watchlist.listActiveEntries("sam");

    expect(alexEntries.map((e) => e.id)).toEqual(["entry-a"]);
    expect(samEntries.map((e) => e.id)).toEqual(["entry-b"]);

    // Even a direct-by-id lookup refuses to cross the profile boundary.
    expect(await repos.watchlist.getEntryById("sam", "entry-a")).toBeNull();
    expect(
      await repos.watchlist.getEntryById("alex", "entry-a"),
    ).not.toBeNull();
  });

  it("drafts: profile A's active/archived drafts are invisible to profile B", async () => {
    db = new FDraftLocalDatabase(`isolation-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const baseDraft = {
      difficulty: "baby" as const,
      timeMode: "timer" as const,
      totalFilms: 5,
      randomFilmCount: 5,
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
    await repos.drafts.createDraft({
      ...baseDraft,
      id: "draft-a",
      profileId: "alex",
      status: "active",
    });
    await repos.drafts.createDraft({
      ...baseDraft,
      id: "draft-b",
      profileId: "sam",
      status: "active",
    });

    expect(await repos.drafts.getById("sam", "draft-a")).toBeNull();
    expect((await repos.drafts.getActiveOrExpiredDraft("alex"))?.id).toBe(
      "draft-a",
    );
    expect((await repos.drafts.getActiveOrExpiredDraft("sam"))?.id).toBe(
      "draft-b",
    );
    expect(await repos.drafts.hasActiveDraft("alex")).toBe(true);

    // Archiving one profile's draft must never touch the other's.
    await repos.drafts.updateDraft({
      ...baseDraft,
      id: "draft-a",
      profileId: "alex",
      status: "archived",
    });
    expect(await repos.drafts.listArchived("alex")).toHaveLength(1);
    expect(await repos.drafts.listArchived("sam")).toHaveLength(0);
  });

  it("watched history and ratings: profile A's history never appears in profile B's list", async () => {
    db = new FDraftLocalDatabase(`isolation-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await repos.history.addWatchedHistory({
      id: "history-a",
      profileId: "alex",
      filmId: "film-1",
      watchlistEntryId: null,
      source: "app_watchlist_action",
      watchedDate: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.history.addWatchedHistory({
      id: "history-b",
      profileId: "sam",
      filmId: "film-1",
      watchlistEntryId: null,
      source: "app_watchlist_action",
      watchedDate: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.history.upsertRating({
      id: "rating-a",
      profileId: "alex",
      filmId: "film-1",
      rating: 5,
      source: "app",
      ratedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(await repos.history.listWatchedHistory("alex")).toHaveLength(1);
    expect(await repos.history.listWatchedHistory("sam")).toHaveLength(1);
    expect(await repos.history.listRatings("alex")).toHaveLength(1);
    expect(await repos.history.listRatings("sam")).toHaveLength(0);
  });

  it("settings: profile A's settings are a completely separate key space from profile B's", async () => {
    db = new FDraftLocalDatabase(`isolation-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await repos.settings.set("alex", "reducedMotion", true);
    await repos.settings.set("sam", "reducedMotion", false);

    expect(await repos.settings.get("alex", "reducedMotion")).toBe(true);
    expect(await repos.settings.get("sam", "reducedMotion")).toBe(false);
    expect(await repos.settings.get("sam", "somethingAlexNeverSet")).toBeNull();

    await repos.settings.remove("alex", "reducedMotion");
    expect(await repos.settings.get("alex", "reducedMotion")).toBeNull();
    expect(await repos.settings.get("sam", "reducedMotion")).toBe(false);
  });

  it("profiles themselves list independently and deleting one never touches the other", async () => {
    db = new FDraftLocalDatabase(`isolation-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const base = {
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: "UTC",
      settings: { reducedMotion: false, defaultPage: "watchlist" as const },
      dataVersion: 1,
    };
    await repos.profiles.create({ ...base, id: "alex", displayName: "Alex" });
    await repos.profiles.create({ ...base, id: "sam", displayName: "Sam" });

    expect(await repos.profiles.list()).toHaveLength(2);
    await repos.profiles.delete("alex");
    const remaining = await repos.profiles.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("sam");
  });
});
