import { afterEach, describe, expect, it } from "vitest";
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
import { markLocalFilmWatched } from "@/application/watchlist/local-watchlist-service";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
const OTHER_PROFILE_ID = "sam";

async function seedActiveFilm(
  repos: Repositories,
  params: {
    filmId: string;
    entryId: string;
    profileId?: string;
    title?: string;
    releaseYear?: number | null;
    dateAdded?: string;
    posterUrl?: string | null;
    collectionId?: string | null;
  },
) {
  await repos.films.create({
    id: params.filmId,
    title: params.title ?? params.filmId,
    releaseYear: params.releaseYear ?? 2020,
    letterboxdSlug: params.filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: `${params.filmId}-meta`,
    filmId: params.filmId,
    provider: "tmdb",
    posterUrl: params.posterUrl ?? null,
    runtimeMinutes: null,
    genres: null,
    directors: null,
    countries: null,
    languages: null,
    collectionId: params.collectionId ?? null,
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
  await repos.watchlist.createEntry({
    id: params.entryId,
    profileId: params.profileId ?? PROFILE_ID,
    filmId: params.filmId,
    dateAdded: params.dateAdded ?? "2026-01-01",
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
}

describe("getDiyEligibleFilms", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("includes a normal active, unwatched, released watchlist film — with its poster attached", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilm(repos, {
      filmId: "film-1",
      entryId: "entry-1",
      title: "Paddington 2",
      posterUrl: "https://example.com/poster.jpg",
    });

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films).toEqual([
      expect.objectContaining({
        entryId: "entry-1",
        filmId: "film-1",
        title: "Paddington 2",
        posterUrl: "https://example.com/poster.jpg",
      }),
    ]);
  });

  it("excludes a film not on the active profile's watchlist at all", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // A film exists in the shared catalog but was never added to this
    // profile's watchlist.
    await repos.films.create({
      id: "film-unlisted",
      title: "Unlisted Film",
      releaseYear: 2020,
      letterboxdSlug: "unlisted-film",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films).toEqual([]);
  });

  it("excludes a film belonging to a different profile's watchlist", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilm(repos, {
      filmId: "film-1",
      entryId: "entry-1",
      profileId: OTHER_PROFILE_ID,
    });

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films).toEqual([]);
    const othersFilms = await getDiyEligibleFilms(repos, OTHER_PROFILE_ID);
    expect(othersFilms).toHaveLength(1);
  });

  it("excludes a film already marked watched, even if something left its watchlist entry active", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    // Simulate the redundant "already_watched" guard catching a film whose
    // watchlist entry is (for whatever reason) still active despite a
    // genuine watched-history record existing for it — see
    // docs/updates, v1.1.1.
    await repos.history.addWatchedHistory({
      id: "watched-1",
      profileId: PROFILE_ID,
      filmId: "film-1",
      watchlistEntryId: "entry-1",
      source: "app_watchlist_action",
      watchedDate: "2026-01-02",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films).toEqual([]);
  });

  it("excludes a film watched normally (mark-watched deactivates its entry, so it disappears through the standard active-watchlist path too)", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilm(repos, { filmId: "film-1", entryId: "entry-1" });

    const outcome = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: "entry-1",
      profileTimezone: "UTC",
    });
    expect(outcome.ok).toBe(true);

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films).toEqual([]);
  });

  it("excludes an unreleased film", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.films.upsertMetadata({
      id: "film-1-meta",
      filmId: "film-1",
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
      releaseDate: "2099-01-01",
      releaseStatus: "Post Production",
      providerTitle: null,
      raw: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films).toEqual([]);
  });

  it("does NOT apply the generated-draft 'unstarted later series entry' rule — every unwatched Mission: Impossible film stays a candidate (see docs/updates, v1.1.2, 'Fix DIY Draft missing watchlist films')", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const missionImpossibleFilms = [
      {
        filmId: "mi1",
        entryId: "entry-mi1",
        title: "Mission: Impossible",
        releaseYear: 1996,
      },
      {
        filmId: "mi2",
        entryId: "entry-mi2",
        title: "Mission: Impossible II",
        releaseYear: 2000,
      },
      {
        filmId: "mi3",
        entryId: "entry-mi3",
        title: "Mission: Impossible III",
        releaseYear: 2006,
      },
      {
        filmId: "mi4",
        entryId: "entry-mi4",
        title: "Mission: Impossible – Ghost Protocol",
        releaseYear: 2011,
      },
      {
        filmId: "mi5",
        entryId: "entry-mi5",
        title: "Mission: Impossible – Rogue Nation",
        releaseYear: 2015,
      },
      {
        filmId: "mi6",
        entryId: "entry-mi6",
        title: "Mission: Impossible – Fallout",
        releaseYear: 2018,
      },
      {
        filmId: "mi7",
        entryId: "entry-mi7",
        title: "Mission: Impossible – Dead Reckoning",
        releaseYear: 2023,
      },
    ];
    for (const film of missionImpossibleFilms) {
      await seedActiveFilm(repos, {
        ...film,
        collectionId: "mission-impossible",
      });
    }

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films.map((f) => f.entryId).sort()).toEqual(
      missionImpossibleFilms.map((f) => f.entryId).sort(),
    );
  });

  it("excludes a film whose provider metadata looks like a different media entity (metadata identity mismatch)", async () => {
    db = new FDraftLocalDatabase(`diy-cand-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilm(repos, {
      filmId: "film-1",
      entryId: "entry-1",
      title: "The Queen's Gambit",
    });
    await repos.films.upsertMetadata({
      id: "film-1-meta",
      filmId: "film-1",
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
      releaseDate: null,
      releaseStatus: "Released",
      providerTitle: "Creating The Queen's Gambit",
      raw: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const films = await getDiyEligibleFilms(repos, PROFILE_ID);
    expect(films).toEqual([]);
  });
});
