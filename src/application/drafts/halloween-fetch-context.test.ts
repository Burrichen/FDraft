import { afterEach, describe, expect, it } from "vitest";
import {
  computeHalloweenPoolCapacity,
  fetchHalloweenManifestCandidates,
} from "./halloween-fetch-context";
import { setHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedWatchlistFilm(
  repos: Repositories,
  params: { filmId: string; entryId: string; selectionWeight?: number },
) {
  await repos.films.create({
    id: params.filmId,
    title: params.filmId,
    releaseYear: 2000,
    letterboxdSlug: params.filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: params.entryId,
    profileId: PROFILE_ID,
    filmId: params.filmId,
    dateAdded: "2026-01-01",
    position: 0,
    isActive: true,
    selectionWeight: params.selectionWeight ?? 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function seedOffWatchlistFilm(repos: Repositories, filmId: string) {
  await repos.films.create({
    id: filmId,
    title: filmId,
    releaseYear: 2000,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("fetchHalloweenManifestCandidates", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  function setup() {
    db = new FDraftLocalDatabase(
      `halloween-manifest-cand-${crypto.randomUUID()}`,
    );
    return createLocalRepositories(db) as Repositories;
  }

  it("a film does not need to be on the watchlist", async () => {
    const repos = setup();
    await seedOffWatchlistFilm(repos, "horror-film-1");
    const candidates = await fetchHalloweenManifestCandidates(
      repos,
      PROFILE_ID,
      ["horror-film-1"],
    );
    expect(candidates).toEqual([
      {
        filmId: "horror-film-1",
        title: "horror-film-1",
        releaseYear: 2000,
        watchlistSelectionWeight: null,
        watchlistEntryId: null,
      },
    ]);
  });

  it("decorates a film that IS on the watchlist with its entry id and selection weight — see Prefer items from my Watchlist", async () => {
    const repos = setup();
    await seedWatchlistFilm(repos, {
      filmId: "horror-film-1",
      entryId: "entry-1",
      selectionWeight: 3,
    });
    const candidates = await fetchHalloweenManifestCandidates(
      repos,
      PROFILE_ID,
      ["horror-film-1"],
    );
    expect(candidates).toEqual([
      {
        filmId: "horror-film-1",
        title: "horror-film-1",
        releaseYear: 2000,
        watchlistSelectionWeight: 3,
        watchlistEntryId: "entry-1",
      },
    ]);
  });

  it("excludes an already-watched film", async () => {
    const repos = setup();
    await seedOffWatchlistFilm(repos, "horror-film-1");
    await repos.history.addWatchedHistory({
      id: "watched-1",
      profileId: PROFILE_ID,
      filmId: "horror-film-1",
      watchlistEntryId: null,
      source: "app_watchlist_action",
      watchedDate: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const candidates = await fetchHalloweenManifestCandidates(
      repos,
      PROFILE_ID,
      ["horror-film-1"],
    );
    expect(candidates).toHaveLength(0);
  });

  it("skips a film id that no longer resolves", async () => {
    const repos = setup();
    const candidates = await fetchHalloweenManifestCandidates(
      repos,
      PROFILE_ID,
      ["missing-film"],
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("computeHalloweenPoolCapacity", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  it("reports independent counts per pool, including how many are on the watchlist", async () => {
    db = new FDraftLocalDatabase(`halloween-capacity-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedWatchlistFilm(repos, { filmId: "horror-1", entryId: "entry-1" });
    await seedOffWatchlistFilm(repos, "horror-2");
    await seedOffWatchlistFilm(repos, "kitsch-1");
    setHalloweenManifestFilmIds({
      horrorFilmIds: ["horror-1", "horror-2"],
      kitschFilmIds: ["kitsch-1"],
    });

    const capacity = await computeHalloweenPoolCapacity(repos, PROFILE_ID);
    expect(capacity).toEqual({
      horrorAvailable: 2,
      kitschAvailable: 1,
      horrorOnWatchlist: 1,
      kitschOnWatchlist: 0,
    });
  });
});
