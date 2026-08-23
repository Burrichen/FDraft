import { afterEach, describe, expect, it, vi } from "vitest";
import type { HalloweenManifest } from "@/domain/events/halloween-manifest-schema";
import {
  getHalloweenManifestFilmIds,
  setHalloweenManifestFilmIds,
} from "@/domain/events/halloween-manifest-overlay";
import { FixedClock } from "@/domain/time/clock";
import { InMemoryEventManifestCacheStore } from "@/infrastructure/events/event-manifest-cache-store";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  HALLOWEEN_MANIFEST_STALE_AFTER_MS,
  refreshHalloweenManifest,
} from "./halloween-manifest-service";

const NOW = new FixedClock(new Date("2026-10-01T00:00:00.000Z"));

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

async function seedMatchingFilms(
  repos: ReturnType<typeof createLocalRepositories>,
) {
  await repos.films.create({
    id: "horror-film-1",
    title: "The Exorcist",
    releaseYear: 1973,
    letterboxdSlug: "the-exorcist",
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.create({
    id: "kitsch-film-1",
    title: "Hocus Pocus",
    releaseYear: 1993,
    letterboxdSlug: "hocus-pocus",
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

const VALID_MANIFEST: HalloweenManifest = {
  schemaVersion: 1,
  event: "halloween",
  updatedAt: "2026-10-01T00:00:00.000Z",
  horror: [{ letterboxdSlug: "the-exorcist", title: "The Exorcist" }],
  kitsch: [{ letterboxdSlug: "hocus-pocus", title: "Hocus Pocus" }],
};

describe("refreshHalloweenManifest", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  function setup() {
    db = new FDraftLocalDatabase(`halloween-manifest-${crypto.randomUUID()}`);
    return createLocalRepositories(db);
  }

  it("with no cache, fetches remotely, validates, caches, and resolves both pools", async () => {
    const repos = setup();
    await seedMatchingFilms(repos);
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_MANIFEST));

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("remote");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(getHalloweenManifestFilmIds()).toEqual({
      horrorFilmIds: ["horror-film-1"],
      kitschFilmIds: ["kitsch-film-1"],
    });
    expect(cacheStore.get("halloween")?.manifest).toEqual(VALID_MANIFEST);
  });

  it("with a fresh cache, never touches the network", async () => {
    const repos = setup();
    await seedMatchingFilms(repos);
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    cacheStore.set("halloween", {
      manifest: VALID_MANIFEST,
      fetchedAt: NOW.now().toISOString(),
    });
    const fetchImpl = vi.fn();

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("cache");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getHalloweenManifestFilmIds().horrorFilmIds).toEqual([
      "horror-film-1",
    ]);
  });

  it("with a stale cache, refetches and replaces it on success", async () => {
    const repos = setup();
    await seedMatchingFilms(repos);
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    const staleAt = new Date(
      NOW.now().getTime() - HALLOWEEN_MANIFEST_STALE_AFTER_MS - 1,
    ).toISOString();
    cacheStore.set("halloween", {
      manifest: { ...VALID_MANIFEST, horror: [], kitsch: [] },
      fetchedAt: staleAt,
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_MANIFEST));

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("remote");
    expect(cacheStore.get("halloween")?.fetchedAt).toBe(
      NOW.now().toISOString(),
    );
  });

  it("a failed fetch with a stale cache falls back to the stale cache, not the bundled default", async () => {
    const repos = setup();
    await seedMatchingFilms(repos);
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    const staleAt = new Date(
      NOW.now().getTime() - HALLOWEEN_MANIFEST_STALE_AFTER_MS - 1,
    ).toISOString();
    cacheStore.set("halloween", {
      manifest: VALID_MANIFEST,
      fetchedAt: staleAt,
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("cache");
    expect(result.manifest).toEqual(VALID_MANIFEST);
  });

  it("a failed fetch with no cache falls back to the small bundled default — never throws", async () => {
    const repos = setup();
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("bundled-default");
    expect(result.manifest.event).toBe("halloween");
    expect(result.manifest.horror.length).toBeGreaterThan(0);
    expect(result.manifest.kitsch.length).toBeGreaterThan(0);
    // The bundled entries don't exist locally yet — they're created, not
    // left unresolved (see §7, "CUSTOM EVENT FILMS").
    expect(getHalloweenManifestFilmIds().horrorFilmIds.length).toBeGreaterThan(
      0,
    );
    expect(getHalloweenManifestFilmIds().kitschFilmIds.length).toBeGreaterThan(
      0,
    );
  });

  it("a malformed remote manifest is treated the same as a network failure", async () => {
    const repos = setup();
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ not: "a valid manifest" }));

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("bundled-default");
  });

  it("a malformed remote manifest with an existing valid cache keeps the last valid cache, never corrupting it (PROMPT 21)", async () => {
    const repos = setup();
    await seedMatchingFilms(repos);
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    const staleAt = new Date(
      NOW.now().getTime() - HALLOWEEN_MANIFEST_STALE_AFTER_MS - 1,
    ).toISOString();
    cacheStore.set("halloween", {
      manifest: VALID_MANIFEST,
      fetchedAt: staleAt,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ not: "a valid manifest" }));

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("cache");
    expect(result.manifest).toEqual(VALID_MANIFEST);
    // The bad response never overwrote the cache store.
    expect(cacheStore.get("halloween")?.manifest).toEqual(VALID_MANIFEST);
  });

  it("forceRefresh bypasses a fresh cache and re-fetches anyway", async () => {
    const repos = setup();
    await seedMatchingFilms(repos);
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    cacheStore.set("halloween", {
      manifest: { ...VALID_MANIFEST, horror: [], kitsch: [] },
      fetchedAt: NOW.now().toISOString(),
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_MANIFEST));

    const result = await refreshHalloweenManifest(
      {
        cacheStore,
        films: repos.films,
        unresolvedMetadata: repos.unresolvedMetadata,
        clock: NOW,
        fetchImpl,
      },
      { forceRefresh: true },
    );

    expect(result.source).toBe("remote");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("resolving-or-creating a manifest film never blocks or throws even if enrichment fails", async () => {
    const repos = setup();
    // Nothing seeded locally — every entry must be created fresh, which
    // then queues (best-effort) enrichment via the real provider.
    const cacheStore = new InMemoryEventManifestCacheStore<HalloweenManifest>();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_MANIFEST));

    const result = await refreshHalloweenManifest({
      cacheStore,
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
      clock: NOW,
      fetchImpl,
    });

    expect(result.source).toBe("remote");
    expect(getHalloweenManifestFilmIds().horrorFilmIds).toHaveLength(1);
    expect(getHalloweenManifestFilmIds().kitschFilmIds).toHaveLength(1);
  });
});
