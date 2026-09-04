import { afterEach, describe, expect, it } from "vitest";
import type { EventFilmEntry } from "@/domain/events/event-film-content-schema";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { resolveManifestFilmIds } from "./resolve-manifest-film-ids";

describe("resolveManifestFilmIds", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("resolves an entry by exact title+year match", async () => {
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

    const entries: EventFilmEntry[] = [{ title: "The Matrix", year: 1999 }];
    expect(await resolveManifestFilmIds(repos, entries)).toEqual(["film-1"]);
  });

  it("matches case-insensitively", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "The Matrix",
      releaseYear: 1999,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const entries: EventFilmEntry[] = [{ title: "the matrix", year: 1999 }];
    expect(await resolveManifestFilmIds(repos, entries)).toEqual(["film-1"]);
  });

  it("never resolves a different year of the same title — no fuzzy remake matching", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-2007",
      title: "Halloween",
      releaseYear: 2007,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const entries: EventFilmEntry[] = [{ title: "Halloween", year: 1978 }];
    expect(await resolveManifestFilmIds(repos, entries)).toEqual([]);
  });

  it("an entry with no local match contributes nothing — never creates a film", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const entries: EventFilmEntry[] = [
      { title: "Nobody Has This", year: 2024 },
    ];
    const result = await resolveManifestFilmIds(repos, entries);
    expect(result).toEqual([]);
    expect(await repos.films.getById("film-1")).toBeNull();
  });

  it("deduplicates when multiple entries resolve to the same local film", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "The Matrix",
      releaseYear: 1999,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const entries: EventFilmEntry[] = [
      { title: "The Matrix", year: 1999 },
      { title: "the matrix", year: 1999 },
    ];
    expect(await resolveManifestFilmIds(repos, entries)).toEqual(["film-1"]);
  });

  it("an empty entry list resolves to an empty list", async () => {
    db = new FDraftLocalDatabase(`manifest-match-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    expect(await resolveManifestFilmIds(repos, [])).toEqual([]);
  });
});
