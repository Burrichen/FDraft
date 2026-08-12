import { afterEach, describe, expect, it } from "vitest";
import { listRecentlyWatchedFilms } from "@/application/history/recently-watched";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";
import type {
  DraftItemRecord,
  DraftRecord,
  FilmRecord,
  WatchedHistoryRecord,
  WatchlistEntryRecord,
} from "@/repositories/records";

const PROFILE_ID = "alex";

async function seedFilm(
  repos: Repositories,
  overrides: Partial<FilmRecord> & { id: string },
) {
  const film: FilmRecord = {
    title: "Untitled",
    releaseYear: null,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  await repos.films.create(film);
  return film;
}

async function seedWatchedHistory(
  repos: Repositories,
  overrides: Partial<WatchedHistoryRecord> & { id: string; filmId: string },
): Promise<WatchedHistoryRecord> {
  const record: WatchedHistoryRecord = {
    profileId: PROFILE_ID,
    watchlistEntryId: null,
    source: "app_watchlist_action",
    watchedDate: "2026-08-01",
    createdAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
  await repos.history.addWatchedHistory(record);
  return record;
}

describe("listRecentlyWatchedFilms", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("returns an empty list when nothing has ever been watched", async () => {
    db = new FDraftLocalDatabase(`recently-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    expect(await listRecentlyWatchedFilms(repos, PROFILE_ID)).toEqual([]);
  });

  it("returns however many exist when fewer than the limit", async () => {
    db = new FDraftLocalDatabase(`recently-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilm(repos, { id: "film-1", title: "Paddington 2" });
    await seedWatchedHistory(repos, {
      id: "history-1",
      filmId: "film-1",
      createdAt: "2026-08-05T00:00:00.000Z",
    });

    const result = await listRecentlyWatchedFilms(repos, PROFILE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Paddington 2");
  });

  it("caps at 5 and orders most-recently-watched first, by the exact timestamp, not the calendar date", async () => {
    db = new FDraftLocalDatabase(`recently-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    // 6 films watched, two on the SAME calendar day — proves ordering
    // uses `createdAt` (which can break same-day ties), not `watchedDate`.
    const seeds = [
      {
        id: "f1",
        title: "Film 1",
        createdAt: "2026-08-01T09:00:00.000Z",
        watchedDate: "2026-08-01",
      },
      {
        id: "f2",
        title: "Film 2",
        createdAt: "2026-08-01T15:00:00.000Z",
        watchedDate: "2026-08-01",
      },
      {
        id: "f3",
        title: "Film 3",
        createdAt: "2026-08-02T00:00:00.000Z",
        watchedDate: "2026-08-02",
      },
      {
        id: "f4",
        title: "Film 4",
        createdAt: "2026-08-03T00:00:00.000Z",
        watchedDate: "2026-08-03",
      },
      {
        id: "f5",
        title: "Film 5",
        createdAt: "2026-08-04T00:00:00.000Z",
        watchedDate: "2026-08-04",
      },
      {
        id: "f6",
        title: "Film 6",
        createdAt: "2026-08-05T00:00:00.000Z",
        watchedDate: "2026-08-05",
      },
    ];
    for (const seed of seeds) {
      await seedFilm(repos, { id: seed.id, title: seed.title });
      await seedWatchedHistory(repos, {
        id: `history-${seed.id}`,
        filmId: seed.id,
        createdAt: seed.createdAt,
        watchedDate: seed.watchedDate,
      });
    }

    const result = await listRecentlyWatchedFilms(repos, PROFILE_ID);
    expect(result).toHaveLength(5);
    // Film 1 (the oldest of the 6) is correctly excluded by the cap.
    expect(result.map((r) => r.title)).toEqual([
      "Film 6",
      "Film 5",
      "Film 4",
      "Film 3",
      "Film 2",
    ]);
  });

  it("includes runtime/poster metadata when available, and null when it isn't", async () => {
    db = new FDraftLocalDatabase(`recently-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilm(repos, {
      id: "film-1",
      title: "The Thing",
      releaseYear: 1982,
    });
    await repos.films.upsertMetadata({
      id: "meta-1",
      filmId: "film-1",
      provider: "tmdb",
      posterUrl: "https://example.com/poster.jpg",
      runtimeMinutes: 109,
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
      raw: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await seedWatchedHistory(repos, { id: "history-1", filmId: "film-1" });

    const [result] = await listRecentlyWatchedFilms(repos, PROFILE_ID);
    expect(result.releaseYear).toBe(1982);
    expect(result.runtimeMinutes).toBe(109);
    expect(result.posterUrl).toBe("https://example.com/poster.jpg");
  });

  it("reports the draft and challenge a film was watched as part of", async () => {
    db = new FDraftLocalDatabase(`recently-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilm(repos, { id: "film-1", title: "The Thing" });

    const entry: WatchlistEntryRecord = {
      id: "entry-1",
      profileId: PROFILE_ID,
      filmId: "film-1",
      dateAdded: "2026-01-01",
      position: null,
      isActive: false,
      selectionWeight: 1,
      importSource: null,
      importId: null,
      removedAt: "2026-08-01T00:00:00.000Z",
      removedReason: "watched",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    await repos.watchlist.createEntry(entry);

    const history = await seedWatchedHistory(repos, {
      id: "history-1",
      filmId: "film-1",
      watchlistEntryId: entry.id,
    });

    const draft: DraftRecord = {
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "easy",
      timeMode: "timer",
      status: "archived",
      totalFilms: 1,
      randomFilmCount: 0,
      challengeFilmCount: 1,
      challengeMode: "decide",
      startedAt: "2026-07-01T00:00:00.000Z",
      deadlineAt: "2026-08-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: "2026-08-01T00:00:00.000Z",
      freeformAchievedRank: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(draft);
    const item: DraftItemRecord = {
      id: "item-1",
      draftId: draft.id,
      filmId: "film-1",
      watchlistEntryId: entry.id,
      source: "challenge",
      challengeId: "the-eldest",
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: 0,
      isCompleted: true,
      completedAt: "2026-08-01T00:00:00.000Z",
      watchedHistoryId: history.id,
      createdAt: "2026-07-01T00:00:00.000Z",
    };
    await repos.drafts.createItems([item]);

    const [result] = await listRecentlyWatchedFilms(repos, PROFILE_ID);
    expect(result.draftOrigin).not.toBeNull();
    expect(result.draftOrigin?.draftId).toBe("draft-1");
    expect(result.draftOrigin?.difficulty).toBe("easy");
    expect(result.draftOrigin?.challengeName).toBeTruthy();
  });

  it("reports no draft origin for a film watched directly from the watchlist", async () => {
    db = new FDraftLocalDatabase(`recently-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilm(repos, { id: "film-1", title: "The Thing" });
    await seedWatchedHistory(repos, {
      id: "history-1",
      filmId: "film-1",
      watchlistEntryId: null,
    });

    const [result] = await listRecentlyWatchedFilms(repos, PROFILE_ID);
    expect(result.draftOrigin).toBeNull();
  });

  it("HISTORY DATA INTEGRITY: never depends on the current watchlist — its type signature doesn't even accept a WatchlistRepository, and a since-deactivated/altered watchlist entry doesn't change the reported result", async () => {
    db = new FDraftLocalDatabase(`recently-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilm(repos, {
      id: "film-1",
      title: "The Thing",
      releaseYear: 1982,
    });
    const entry: WatchlistEntryRecord = {
      id: "entry-1",
      profileId: PROFILE_ID,
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
    await repos.watchlist.createEntry(entry);
    await seedWatchedHistory(repos, {
      id: "history-1",
      filmId: "film-1",
      watchlistEntryId: entry.id,
      watchedDate: "2026-08-09",
    });

    const before = await listRecentlyWatchedFilms(repos, PROFILE_ID);

    // Simulate the watchlist entry being re-imported/altered afterward —
    // a real "the film later left the watchlist" scenario.
    await repos.watchlist.updateEntry({
      ...entry,
      isActive: false,
      removedReason: "postmortem_not_interested",
      removedAt: "2026-09-01T00:00:00.000Z",
    });

    const after = await listRecentlyWatchedFilms(repos, PROFILE_ID);
    expect(after).toEqual(before);
    expect(after[0].watchedDate).toBe("2026-08-09");
  });
});
