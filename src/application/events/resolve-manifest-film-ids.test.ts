import { afterEach, describe, expect, it } from "vitest";
import type { EventManifest } from "@/domain/events/event-manifest-schema";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { resolveManifestFilmIds } from "./resolve-manifest-film-ids";

function manifest(films: EventManifest["films"]): EventManifest {
  return {
    schemaVersion: 1,
    event: "f-you-its-january",
    updatedAt: "2026-01-01T00:00:00.000Z",
    films,
  };
}

describe("resolveManifestFilmIds", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("matches by TMDB id first, when present", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "The Matrix",
      releaseYear: 1999,
      letterboxdSlug: "the-matrix",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.films.upsertMetadata({
      id: "meta-1",
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
      externalIds: { tmdb: "603" },
      raw: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await resolveManifestFilmIds(
      repos,
      manifest([{ tmdbId: "603", title: "The Matrix" }]),
    );
    expect(result).toEqual(["film-1"]);
  });

  it("falls back to Letterboxd slug when no TMDB id is given", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "The Matrix",
      releaseYear: 1999,
      letterboxdSlug: "the-matrix",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await resolveManifestFilmIds(
      repos,
      manifest([{ letterboxdSlug: "the-matrix", title: "The Matrix" }]),
    );
    expect(result).toEqual(["film-1"]);
  });

  it("falls back to title+year when no better id is given or matches", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "The Matrix",
      releaseYear: 1999,
      letterboxdSlug: "the-matrix",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await resolveManifestFilmIds(
      repos,
      manifest([{ title: "The Matrix", year: 1999 }]),
    );
    expect(result).toEqual(["film-1"]);
  });

  it("a manifest entry with no local match contributes nothing — never creates a film", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await resolveManifestFilmIds(
      repos,
      manifest([{ title: "Nobody Has This", year: 2024 }]),
    );
    expect(result).toEqual([]);
    expect(await repos.films.getById("film-1")).toBeNull();
  });

  it("deduplicates when multiple manifest entries resolve to the same local film", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "The Matrix",
      releaseYear: 1999,
      letterboxdSlug: "the-matrix",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await resolveManifestFilmIds(
      repos,
      manifest([
        { letterboxdSlug: "the-matrix", title: "The Matrix" },
        { title: "The Matrix", year: 1999 },
      ]),
    );
    expect(result).toEqual(["film-1"]);
  });

  it("an empty manifest resolves to an empty list", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    expect(await resolveManifestFilmIds(repos, manifest([]))).toEqual([]);
  });
});
