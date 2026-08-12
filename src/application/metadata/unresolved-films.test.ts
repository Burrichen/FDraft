import { afterEach, describe, expect, it } from "vitest";
import {
  countUnresolvedFilms,
  listUnresolvedFilms,
  manuallyMatchFilm,
  ProviderIdentifierConflictError,
} from "@/application/metadata/unresolved-films";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedUnresolvedFilm(
  repos: Repositories,
  filmId: string,
  overrides: {
    onWatchlist?: boolean;
    status?: "unresolved" | "failed";
    reason?: string;
  } = {},
) {
  await repos.films.create({
    id: filmId,
    title: `Film ${filmId}`,
    releaseYear: 1990,
    letterboxdSlug: filmId,
    letterboxdUri: `https://letterboxd.com/film/${filmId}/`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  if (overrides.onWatchlist ?? true) {
    await repos.watchlist.createEntry({
      id: `entry-${filmId}`,
      profileId: PROFILE_ID,
      filmId,
      dateAdded: "2026-01-05",
      position: null,
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
  await repos.unresolvedMetadata.upsert({
    id: `unresolved-${filmId}`,
    filmId,
    provider: "tmdb",
    status: overrides.status ?? "unresolved",
    reason: overrides.reason ?? "ambiguous",
    message: "Could not confidently choose between multiple results.",
    lastAttemptedAt: "2026-01-10T00:00:00.000Z",
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

describe("listUnresolvedFilms", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("returns an empty list when nothing is unresolved", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(await listUnresolvedFilms(repos, PROFILE_ID)).toEqual([]);
  });

  it("joins the film's title/year/letterboxd URL and the profile's dateAdded onto each record", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-1");

    const [result] = await listUnresolvedFilms(repos, PROFILE_ID);
    expect(result).toMatchObject({
      filmId: "film-1",
      title: "Film film-1",
      releaseYear: 1990,
      letterboxdUri: "https://letterboxd.com/film/film-1/",
      dateAdded: "2026-01-05",
      status: "unresolved",
      reason: "ambiguous",
    });
  });

  it("omits dateAdded (null) for a film no longer on the active watchlist, rather than erroring", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-removed", { onWatchlist: false });

    const [result] = await listUnresolvedFilms(repos, PROFILE_ID);
    expect(result.dateAdded).toBeNull();
  });

  it("includes both unresolved and failed statuses — callers separate them, this doesn't hide either", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-unresolved", {
      status: "unresolved",
    });
    await seedUnresolvedFilm(repos, "film-failed", { status: "failed" });

    const results = await listUnresolvedFilms(repos, PROFILE_ID);
    expect(results.map((r) => r.status).sort()).toEqual([
      "failed",
      "unresolved",
    ]);
  });
});

describe("countUnresolvedFilms", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("counts unresolved and failed separately", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-1", { status: "unresolved" });
    await seedUnresolvedFilm(repos, "film-2", { status: "unresolved" });
    await seedUnresolvedFilm(repos, "film-3", { status: "failed" });

    expect(await countUnresolvedFilms(repos)).toEqual({
      unresolved: 2,
      failed: 1,
    });
  });
});

describe("manuallyMatchFilm", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("persists the chosen result with matchMethod 'manual' and removes the film from the unresolved queue", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-1");
    const clock = new FixedClock(new Date("2026-02-01T00:00:00.000Z"));

    await manuallyMatchFilm(
      repos,
      {
        filmId: "film-1",
        provider: "tmdb",
        result: {
          posterUrl: "https://example.invalid/poster.jpg",
          runtimeMinutes: 113,
          directors: ["Adrian Lyne"],
          genres: ["Horror", "Drama"],
          averageRating: 3.8,
          externalIds: { tmdb: "8846" },
        },
      },
      { clock },
    );

    const metadata = await repos.films.getMetadataForFilm("film-1");
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      matchMethod: "manual",
      runtimeMinutes: 113,
      directors: ["Adrian Lyne"],
      lastEnrichedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(
      await repos.unresolvedMetadata.getByFilmId("film-1", "tmdb"),
    ).toBeNull();
  });

  it("never creates a duplicate watchlist film — only ever writes metadata keyed to the existing filmId", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-1");

    await manuallyMatchFilm(repos, {
      filmId: "film-1",
      provider: "tmdb",
      result: { runtimeMinutes: 100 },
    });

    const allFilms = await repos.watchlist.listAllEntries(PROFILE_ID);
    expect(allFilms).toHaveLength(1);
    expect(allFilms[0].filmId).toBe("film-1");
  });

  it("never invents fields the chosen result didn't actually provide", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-1");

    await manuallyMatchFilm(repos, {
      filmId: "film-1",
      provider: "tmdb",
      result: { runtimeMinutes: 100 },
    });

    const [metadata] = await repos.films.getMetadataForFilm("film-1");
    expect(metadata.averageRating).toBeNull();
    expect(metadata.genres).toBeNull();
    expect(metadata.posterUrl).toBeNull();
  });

  it("PROVIDER_IDENTIFIER_CONFLICT: refuses to attach a provider film already matched to a different local film — see docs/product-spec.md, 'METADATA MATCHER AUDIT'", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-1");
    // A second, ALREADY-matched local film claiming the exact same TMDB id.
    await repos.films.create({
      id: "film-2",
      title: "Some Other Film",
      releaseYear: 2000,
      letterboxdSlug: "film-2",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await manuallyMatchFilm(repos, {
      filmId: "film-2",
      provider: "tmdb",
      result: { runtimeMinutes: 90, externalIds: { tmdb: "8846" } },
    });

    await expect(
      manuallyMatchFilm(repos, {
        filmId: "film-1",
        provider: "tmdb",
        result: { runtimeMinutes: 113, externalIds: { tmdb: "8846" } },
      }),
    ).rejects.toThrow(ProviderIdentifierConflictError);

    // The conflict must block the write entirely — film-1 stays unresolved.
    expect(
      await repos.unresolvedMetadata.getByFilmId("film-1", "tmdb"),
    ).not.toBeNull();
    expect(await repos.films.getMetadataForFilm("film-1")).toHaveLength(0);
  });

  it("does not conflict with itself when re-confirming the same film's own existing mapping", async () => {
    db = new FDraftLocalDatabase(`unresolved-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-1");

    await manuallyMatchFilm(repos, {
      filmId: "film-1",
      provider: "tmdb",
      result: { runtimeMinutes: 100, externalIds: { tmdb: "8846" } },
    });

    // Same film, same external id, run again — must not throw.
    await expect(
      manuallyMatchFilm(repos, {
        filmId: "film-1",
        provider: "tmdb",
        result: { runtimeMinutes: 105, externalIds: { tmdb: "8846" } },
      }),
    ).resolves.not.toThrow();
  });
});
