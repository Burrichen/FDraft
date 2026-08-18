import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventManifest } from "@/domain/events/event-manifest-schema";
import {
  getJanuaryManifestCuratedFilmIds,
  setJanuaryManifestCuratedFilmIds,
} from "@/domain/events/january-manifest-overlay";
import { FixedClock } from "@/domain/time/clock";
import { InMemoryEventManifestCacheStore } from "@/infrastructure/events/event-manifest-cache-store";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  JANUARY_MANIFEST_STALE_AFTER_MS,
  refreshJanuaryManifest,
} from "./january-manifest-service";

const NOW = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

async function seedMatchingFilm(repos: ReturnType<typeof createLocalRepositories>) {
  await repos.films.create({
    id: "film-1",
    title: "The Matrix",
    releaseYear: 1999,
    letterboxdSlug: "the-matrix",
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

const VALID_MANIFEST: EventManifest = {
  schemaVersion: 1,
  event: "f-you-its-january",
  updatedAt: "2026-06-01T00:00:00.000Z",
  films: [{ letterboxdSlug: "the-matrix", title: "The Matrix" }],
};

describe("refreshJanuaryManifest", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setJanuaryManifestCuratedFilmIds([]);
  });

  it("with no cache, fetches remotely, validates, caches, and applies the overlay", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedMatchingFilm(repos);
    const cacheStore = new InMemoryEventManifestCacheStore();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_MANIFEST));

    const result = await refreshJanuaryManifest({
      cacheStore,
      films: repos.films,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("remote");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(getJanuaryManifestCuratedFilmIds()).toEqual(["film-1"]);
    expect(cacheStore.get("f-you-its-january")?.manifest).toEqual(
      VALID_MANIFEST,
    );
  });

  it("with a fresh cache, never touches the network", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedMatchingFilm(repos);
    const cacheStore = new InMemoryEventManifestCacheStore();
    cacheStore.set("f-you-its-january", {
      manifest: VALID_MANIFEST,
      fetchedAt: NOW.now().toISOString(),
    });
    const fetchImpl = vi.fn();

    const result = await refreshJanuaryManifest({
      cacheStore,
      films: repos.films,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("cache");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getJanuaryManifestCuratedFilmIds()).toEqual(["film-1"]);
  });

  it("with a stale cache, refetches; a successful refetch replaces the cache", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedMatchingFilm(repos);
    const cacheStore = new InMemoryEventManifestCacheStore();
    const staleAt = new Date(
      NOW.now().getTime() - JANUARY_MANIFEST_STALE_AFTER_MS - 1,
    ).toISOString();
    cacheStore.set("f-you-its-january", {
      manifest: { ...VALID_MANIFEST, films: [] },
      fetchedAt: staleAt,
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_MANIFEST));

    const result = await refreshJanuaryManifest({
      cacheStore,
      films: repos.films,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("remote");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cacheStore.get("f-you-its-january")?.fetchedAt).toBe(
      NOW.now().toISOString(),
    );
  });

  it("a failed fetch with a stale cache falls back to the stale cache rather than the bundled default", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedMatchingFilm(repos);
    const cacheStore = new InMemoryEventManifestCacheStore();
    const staleAt = new Date(
      NOW.now().getTime() - JANUARY_MANIFEST_STALE_AFTER_MS - 1,
    ).toISOString();
    cacheStore.set("f-you-its-january", {
      manifest: VALID_MANIFEST,
      fetchedAt: staleAt,
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await refreshJanuaryManifest({
      cacheStore,
      films: repos.films,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("cache");
    expect(result.manifest).toEqual(VALID_MANIFEST);
  });

  it("a failed fetch with no cache at all falls back to the bundled default — never throws, never blocks", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const cacheStore = new InMemoryEventManifestCacheStore();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await refreshJanuaryManifest({
      cacheStore,
      films: repos.films,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("bundled-default");
    expect(result.manifest.event).toBe("f-you-its-january");
  });

  it("a non-ok HTTP response is treated the same as a network failure", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const cacheStore = new InMemoryEventManifestCacheStore();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));

    const result = await refreshJanuaryManifest({
      cacheStore,
      films: repos.films,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("bundled-default");
  });

  it("a remote payload that fails schema validation is treated the same as a network failure — untrusted input never crashes this", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const cacheStore = new InMemoryEventManifestCacheStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ not: "a valid manifest" }));

    const result = await refreshJanuaryManifest({
      cacheStore,
      films: repos.films,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("bundled-default");
  });

  it("forceRefresh bypasses a fresh cache and re-fetches anyway", async () => {
    db = new FDraftLocalDatabase(`manifest-service-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedMatchingFilm(repos);
    const cacheStore = new InMemoryEventManifestCacheStore();
    cacheStore.set("f-you-its-january", {
      manifest: { ...VALID_MANIFEST, films: [] },
      fetchedAt: NOW.now().toISOString(),
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_MANIFEST));

    const result = await refreshJanuaryManifest(
      { cacheStore, films: repos.films, clock: NOW, fetchImpl },
      { forceRefresh: true },
    );

    expect(result.source).toBe("remote");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
