import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fetchEventCategoryCandidates,
  pickEventCategoryRandomFilm,
  resolveEventCategoryPickerCandidates,
} from "./resolve-event-category-candidates";
import { setEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createSeededRng } from "@/domain/shared/rng";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedOffWatchlistFilm(
  repos: Repositories,
  filmId: string,
  title = filmId,
) {
  await repos.films.create({
    id: filmId,
    title,
    releaseYear: 2000,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function addToActiveWatchlist(
  repos: Repositories,
  params: { filmId: string; entryId: string; selectionWeight?: number },
) {
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

describe("resolve-event-category-candidates (FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING)", () => {
  let db: FDraftLocalDatabase;
  beforeEach(() => {
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {});
  });
  afterEach(async () => {
    await db?.delete();
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {});
  });

  it("fetchEventCategoryCandidates resolves only the declared category, excluding already-watched films", async () => {
    db = new FDraftLocalDatabase(`event-cat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedOffWatchlistFilm(repos, "horror-1", "Halloween");
    await seedOffWatchlistFilm(repos, "horror-2", "The Thing");
    await seedOffWatchlistFilm(repos, "kitsch-1", "Hocus Pocus");
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
      horror: ["horror-1", "horror-2"],
      kitsch: ["kitsch-1"],
    });
    await repos.history.addWatchedHistory({
      id: "wh-1",
      profileId: PROFILE_ID,
      filmId: "horror-2",
      watchlistEntryId: null,
      source: "app_watchlist_action",
      watchedDate: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const horror = await fetchEventCategoryCandidates(repos, {
      eventId: HALLOWEEN_EVENT_ID,
      categoryKey: "horror",
      profileId: PROFILE_ID,
    });
    expect(horror.map((c) => c.filmId)).toEqual(["horror-1"]);

    const kitsch = await fetchEventCategoryCandidates(repos, {
      eventId: HALLOWEEN_EVENT_ID,
      categoryKey: "kitsch",
      profileId: PROFILE_ID,
    });
    expect(kitsch.map((c) => c.filmId)).toEqual(["kitsch-1"]);
  });

  it("Prefer Watchlist ON picks from the intersection when non-empty, weighted by real selectionWeight", async () => {
    db = new FDraftLocalDatabase(`event-cat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedOffWatchlistFilm(repos, "horror-on-watchlist");
    await seedOffWatchlistFilm(repos, "horror-off-watchlist");
    await addToActiveWatchlist(repos, {
      filmId: "horror-on-watchlist",
      entryId: "entry-1",
      selectionWeight: 5,
    });
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
      horror: ["horror-on-watchlist", "horror-off-watchlist"],
    });

    // Run many picks — with the intersection non-empty, ONLY the
    // watchlist-intersected film should ever be picked, never the
    // off-watchlist one, regardless of rng seed.
    for (let seed = 0; seed < 20; seed++) {
      const outcome = await pickEventCategoryRandomFilm(
        repos,
        {
          profileId: PROFILE_ID,
          eventId: HALLOWEEN_EVENT_ID,
          categoryKey: "horror",
          excludeFilmIds: [],
          preferWatchlist: true,
        },
        { rng: createSeededRng(seed) },
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.film.filmId).toBe("horror-on-watchlist");
      }
    }
  });

  it("Prefer Watchlist ON falls back to the full category when the intersection is empty", async () => {
    db = new FDraftLocalDatabase(`event-cat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedOffWatchlistFilm(repos, "horror-off-watchlist");
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
      horror: ["horror-off-watchlist"],
    });

    const outcome = await pickEventCategoryRandomFilm(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
      categoryKey: "horror",
      excludeFilmIds: [],
      preferWatchlist: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.film.filmId).toBe("horror-off-watchlist");
  });

  it("Prefer Watchlist OFF draws from the full category even when a watchlist intersection exists", async () => {
    db = new FDraftLocalDatabase(`event-cat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedOffWatchlistFilm(repos, "horror-on-watchlist");
    await seedOffWatchlistFilm(repos, "horror-off-watchlist");
    await addToActiveWatchlist(repos, {
      filmId: "horror-on-watchlist",
      entryId: "entry-1",
    });
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
      horror: ["horror-on-watchlist", "horror-off-watchlist"],
    });

    const seenFilmIds = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const outcome = await pickEventCategoryRandomFilm(
        repos,
        {
          profileId: PROFILE_ID,
          eventId: HALLOWEEN_EVENT_ID,
          categoryKey: "horror",
          excludeFilmIds: [],
          preferWatchlist: false,
        },
        { rng: createSeededRng(seed) },
      );
      if (outcome.ok) seenFilmIds.add(outcome.film.filmId);
    }
    expect(seenFilmIds.has("horror-off-watchlist")).toBe(true);
  });

  it("excludeFilmIds is respected (duplicate prevention across reroll)", async () => {
    db = new FDraftLocalDatabase(`event-cat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedOffWatchlistFilm(repos, "only-horror-film");
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
      horror: ["only-horror-film"],
    });

    const outcome = await pickEventCategoryRandomFilm(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
      categoryKey: "horror",
      excludeFilmIds: ["only-horror-film"],
      preferWatchlist: true,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "nothing_available",
      message: "No more eligible films are available in this category.",
    });
  });

  it("resolveEventCategoryPickerCandidates tags onWatchlist correctly for the picker's watchlist-first sort", async () => {
    db = new FDraftLocalDatabase(`event-cat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedOffWatchlistFilm(repos, "horror-on-watchlist", "Aaa Onlist");
    await seedOffWatchlistFilm(repos, "horror-off-watchlist", "Zzz Offlist");
    await addToActiveWatchlist(repos, {
      filmId: "horror-on-watchlist",
      entryId: "entry-1",
    });
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
      horror: ["horror-on-watchlist", "horror-off-watchlist"],
    });

    const candidates = await resolveEventCategoryPickerCandidates(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
      categoryKey: "horror",
      excludeFilmIds: [],
    });
    const byId = new Map(candidates.map((c) => [c.filmId, c]));
    expect(byId.get("horror-on-watchlist")?.onWatchlist).toBe(true);
    expect(byId.get("horror-off-watchlist")?.onWatchlist).toBe(false);
    expect(candidates.every((c) => c.categoryKey === "horror")).toBe(true);
  });
});
