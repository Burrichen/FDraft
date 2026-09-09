import { afterEach, describe, expect, it } from "vitest";
import type { FilmRecord } from "@/repositories/records";
import { createLocalRepositories } from "./create-local-repositories";
import { FDraftLocalDatabase } from "./database";

function film(id: string): FilmRecord {
  return {
    id,
    title: id,
    releaseYear: 2001,
    letterboxdSlug: id,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("LocalFilmRepository.getByIds", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("returns the requested films keyed by id, in one lookup", async () => {
    db = new FDraftLocalDatabase(`films-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create(film("a"));
    await repos.films.create(film("b"));
    await repos.films.create(film("c"));

    const found = await repos.films.getByIds(["c", "a"]);
    expect([...found.keys()].sort()).toEqual(["a", "c"]);
    expect(found.get("a")?.title).toBe("a");
    // Matches `getById`'s single-row result exactly.
    expect(found.get("c")).toEqual(await repos.films.getById("c"));
  });

  it("omits ids with no row rather than mapping them to a hole", async () => {
    db = new FDraftLocalDatabase(`films-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create(film("a"));

    const found = await repos.films.getByIds(["a", "missing"]);
    expect(found.size).toBe(1);
    expect(found.has("missing")).toBe(false);
    expect(found.get("missing")).toBeUndefined();
  });

  it("handles an empty request without touching the database", async () => {
    db = new FDraftLocalDatabase(`films-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(await repos.films.getByIds([])).toEqual(new Map());
  });

  it("tolerates duplicate ids, since a watchlist can hold two entries for one film", async () => {
    db = new FDraftLocalDatabase(`films-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create(film("a"));

    const found = await repos.films.getByIds(["a", "a"]);
    expect(found.size).toBe(1);
    expect(found.get("a")?.id).toBe("a");
  });
});
