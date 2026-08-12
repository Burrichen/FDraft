import { afterEach, describe, expect, it } from "vitest";
import type { LocalProfile } from "@/domain/profiles/profile";
import { createLocalRepositories } from "./create-local-repositories";
import { FDraftLocalDatabase } from "./database";

function profile(id: string): LocalProfile {
  return {
    id,
    displayName: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: { reducedMotion: false, defaultPage: "watchlist" },
    dataVersion: 1,
  };
}

describe("createLocalRepositories (real fake-indexeddb, not mocked)", () => {
  let db: FDraftLocalDatabase;

  afterEach(async () => {
    await db?.delete();
  });

  it("wires a working profile repository backed by IndexedDB", async () => {
    db = new FDraftLocalDatabase(`test-db-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await repos.profiles.create(profile("alex"));
    const found = await repos.profiles.getById("alex");
    expect(found?.displayName).toBe("alex");

    const all = await repos.profiles.list();
    expect(all).toHaveLength(1);
  });

  it("persists a watchlist entry and finds it by profile", async () => {
    db = new FDraftLocalDatabase(`test-db-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await repos.films.create({
      id: "film-1",
      title: "Paddington 2",
      releaseYear: 2017,
      letterboxdSlug: "paddington-2",
      letterboxdUri: "https://letterboxd.com/film/paddington-2/",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.watchlist.createEntry({
      id: "entry-1",
      profileId: "alex",
      filmId: "film-1",
      dateAdded: "2026-01-01",
      position: 1,
      isActive: true,
      selectionWeight: 1,
      importSource: null,
      importId: null,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const active = await repos.watchlist.listActiveEntries("alex");
    expect(active).toHaveLength(1);
    expect(active[0].filmId).toBe("film-1");

    const found = await repos.films.findByLetterboxdSlug("paddington-2");
    expect(found?.title).toBe("Paddington 2");
  });

  it("boolean-valued fields (isActive) are correctly excluded from indexes but still filterable", async () => {
    db = new FDraftLocalDatabase(`test-db-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const base = {
      id: "film-1",
      profileId: "alex",
      filmId: "film-1",
      dateAdded: "2026-01-01",
      position: null,
      selectionWeight: 1,
      importSource: null,
      importId: null,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.watchlist.createEntry({
      ...base,
      id: "entry-active",
      isActive: true,
    });
    await repos.watchlist.createEntry({
      ...base,
      id: "entry-inactive",
      filmId: "film-2",
      isActive: false,
    });

    const active = await repos.watchlist.listActiveEntries("alex");
    expect(active.map((e) => e.id)).toEqual(["entry-active"]);

    const all = await repos.watchlist.listAllEntries("alex");
    expect(all).toHaveLength(2);
  });
});
