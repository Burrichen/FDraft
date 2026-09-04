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
    expect(film?.letterboxdSlug).toBeNull();
  });

  it("resolves an existing film by exact title+year without creating a duplicate", async () => {
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

  it("never resolves a different year of the same title — creates a distinct film instead of confusing a remake", async () => {
    const repos = setup();
    await repos.films.create({
      id: "remake-2007",
      title: "Halloween",
      releaseYear: 2007,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Halloween", year: 1978 },
    ]);
    expect(result.resolvedFilmIds).not.toContain("remake-2007");
    expect(result.newlyCreatedFilmIds).toEqual(result.resolvedFilmIds);
    const film = await repos.films.getById(result.resolvedFilmIds[0]);
    expect(film?.releaseYear).toBe(1978);
  });

  it("deduplicates when two entries resolve to the same film", async () => {
    const repos = setup();
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Same Movie", year: 2000 },
      { title: "same movie", year: 2000 },
    ]);
    expect(result.resolvedFilmIds).toHaveLength(1);
  });

  it("never fabricates metadata beyond what the entry supplies", async () => {
    const repos = setup();
    const result = await resolveOrCreateHalloweenManifestFilms(repos, [
      { title: "Mystery Movie", year: 2024 },
    ]);
    const film = await repos.films.getById(result.resolvedFilmIds[0]);
    expect(film?.releaseYear).toBe(2024);
    const metadata = await repos.films.getMetadataForFilm(film!.id);
    expect(metadata).toHaveLength(0);
  });
});
