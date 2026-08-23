import { afterEach, describe, expect, it } from "vitest";
import {
  computeHalloweenPoolCapacity,
  fetchHalloweenAdjacentCandidates,
  fetchHalloweenManifestCandidates,
} from "./halloween-fetch-context";
import { setHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedWatchlistFilm(
  repos: Repositories,
  params: {
    filmId: string;
    entryId: string;
    genres?: string[] | null;
  },
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
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  if (params.genres !== undefined) {
    await repos.films.upsertMetadata({
      id: `${params.filmId}-meta`,
      filmId: params.filmId,
      provider: "tmdb",
      posterUrl: null,
      runtimeMinutes: null,
      genres: params.genres,
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
      releaseDate: null,
      releaseStatus: "Released",
      providerTitle: null,
      raw: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }
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

describe("fetchHalloweenAdjacentCandidates", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  function setup() {
    db = new FDraftLocalDatabase(`halloween-adjacent-${crypto.randomUUID()}`);
    return createLocalRepositories(db) as Repositories;
  }

  it("qualifies a watchlist film tagged Horror", async () => {
    const repos = setup();
    await seedWatchlistFilm(repos, {
      filmId: "film-1",
      entryId: "entry-1",
      genres: ["Horror"],
    });
    const candidates = await fetchHalloweenAdjacentCandidates(
      repos,
      PROFILE_ID,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].filmId).toBe("film-1");
  });

  it("matches Horror case-insensitively", async () => {
    const repos = setup();
    await seedWatchlistFilm(repos, {
      filmId: "film-1",
      entryId: "entry-1",
      genres: ["horror"],
    });
    const candidates = await fetchHalloweenAdjacentCandidates(
      repos,
      PROFILE_ID,
    );
    expect(candidates).toHaveLength(1);
  });

  it("rejects a watchlist film with no Horror genre", async () => {
    const repos = setup();
    await seedWatchlistFilm(repos, {
      filmId: "film-1",
      entryId: "entry-1",
      genres: ["Comedy", "Drama"],
    });
    const candidates = await fetchHalloweenAdjacentCandidates(
      repos,
      PROFILE_ID,
    );
    expect(candidates).toHaveLength(0);
  });

  it("rejects a watchlist film with no metadata at all — missing genre never qualifies", async () => {
    const repos = setup();
    await seedWatchlistFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    const candidates = await fetchHalloweenAdjacentCandidates(
      repos,
      PROFILE_ID,
    );
    expect(candidates).toHaveLength(0);
  });

  it("never infers Horror from title alone", async () => {
    const repos = setup();
    await repos.films.create({
      id: "film-1",
      title: "A Very Scary Horror Movie",
      releaseYear: 2000,
      letterboxdSlug: "film-1",
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
      importSource: null,
      importId: null,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const candidates = await fetchHalloweenAdjacentCandidates(
      repos,
      PROFILE_ID,
    );
    expect(candidates).toHaveLength(0);
  });
});

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
      { filmId: "horror-film-1", title: "horror-film-1", releaseYear: 2000 },
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

  it("reports independent counts per pool", async () => {
    db = new FDraftLocalDatabase(`halloween-capacity-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedWatchlistFilm(repos, {
      filmId: "adj-1",
      entryId: "entry-1",
      genres: ["Horror"],
    });
    await seedOffWatchlistFilm(repos, "horror-1");
    await seedOffWatchlistFilm(repos, "horror-2");
    await seedOffWatchlistFilm(repos, "kitsch-1");
    setHalloweenManifestFilmIds({
      horrorFilmIds: ["horror-1", "horror-2"],
      kitschFilmIds: ["kitsch-1"],
    });

    const capacity = await computeHalloweenPoolCapacity(repos, PROFILE_ID);
    expect(capacity).toEqual({
      halloweenAdjacentAvailable: 1,
      horrorAvailable: 2,
      kitschAvailable: 1,
    });
  });
});
