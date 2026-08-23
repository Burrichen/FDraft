import { afterEach, describe, expect, it } from "vitest";
import { resolveOrCreateHalloweenManifestFilms } from "./resolve-or-create-halloween-films";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

describe("resolveOrCreateHalloweenManifestFilms", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  function setup() {
    db = new FDraftLocalDatabase(`resolve-halloween-${crypto.randomUUID()}`);
    return createLocalRepositories(db) as Repositories;
  }

  it("creates a new film for an entry with no local match", async () => {
    const repos = setup();
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Halloween", year: 1978 },
    ]);
    expect(result.resolvedFilmIds).toHaveLength(1);
    expect(result.newlyCreatedFilmIds).toEqual(result.resolvedFilmIds);
    const film = await repos.films.getById(result.resolvedFilmIds[0]);
    expect(film?.title).toBe("Halloween");
    expect(film?.releaseYear).toBe(1978);
  });

  it("resolves an existing film by title+year without creating a duplicate", async () => {
    const repos = setup();
    await repos.films.create({
      id: "existing-1",
      title: "Beetlejuice",
      releaseYear: 1988,
      letterboxdSlug: "beetlejuice",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Beetlejuice", year: 1988 },
    ]);
    expect(result.resolvedFilmIds).toEqual(["existing-1"]);
    expect(result.newlyCreatedFilmIds).toEqual([]);
  });

  it("resolves an existing film by letterboxdSlug", async () => {
    const repos = setup();
    await repos.films.create({
      id: "existing-2",
      title: "Hocus Pocus",
      releaseYear: 1993,
      letterboxdSlug: "hocus-pocus",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Some Different Title", letterboxdSlug: "hocus-pocus" },
    ]);
    expect(result.resolvedFilmIds).toEqual(["existing-2"]);
    expect(result.newlyCreatedFilmIds).toEqual([]);
  });

  it("resolves an existing film by tmdbId via matched metadata", async () => {
    const repos = setup();
    await repos.films.create({
      id: "existing-3",
      title: "The Exorcist",
      releaseYear: 1973,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.films.upsertMetadata({
      id: "existing-3-meta",
      filmId: "existing-3",
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
      externalIds: { tmdb: "9552" },
      releaseDate: null,
      releaseStatus: "Released",
      providerTitle: null,
      raw: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "The Exorcist", tmdbId: "9552" },
    ]);
    expect(result.resolvedFilmIds).toEqual(["existing-3"]);
    expect(result.newlyCreatedFilmIds).toEqual([]);
  });

  it("deduplicates when two entries resolve to the same film", async () => {
    const repos = setup();
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Same Movie", year: 2000 },
      { title: "Same Movie", year: 2000 },
    ]);
    expect(result.resolvedFilmIds).toHaveLength(1);
  });

  it("never fabricates metadata beyond what the manifest supplies", async () => {
    const repos = setup();
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Mystery Movie" },
    ]);
    const film = await repos.films.getById(result.resolvedFilmIds[0]);
    expect(film?.releaseYear).toBeNull();
    const metadata = await repos.films.getMetadataForFilm(film!.id);
    expect(metadata).toHaveLength(0);
  });
});
