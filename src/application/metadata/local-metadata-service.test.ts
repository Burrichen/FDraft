import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadMissingMetadata,
  getMetadataStatusSummary,
  refreshOldMetadata,
  retryMetadataForFilms,
} from "@/application/metadata/local-metadata-service";
import { MetadataNetworkError } from "@/application/metadata/remote-metadata-client";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedFilmWithEntry(
  repos: Repositories,
  filmId: string,
  overrides: { metadataAgeIso?: string } = {},
) {
  await repos.films.create({
    id: filmId,
    title: `Film ${filmId}`,
    releaseYear: 2020,
    letterboxdSlug: filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: `entry-${filmId}`,
    profileId: PROFILE_ID,
    filmId,
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
  });
  if (overrides.metadataAgeIso) {
    await repos.films.upsertMetadata({
      id: `meta-${filmId}`,
      filmId,
      provider: "tmdb",
      posterUrl: null,
      runtimeMinutes: 100,
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
      lastEnrichedAt: overrides.metadataAgeIso,
      createdAt: overrides.metadataAgeIso,
      updatedAt: overrides.metadataAgeIso,
    });
  }
}

describe("getMetadataStatusSummary", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("classifies films as cached, missing, or old based on the newest metadata's age", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const clock = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));

    await seedFilmWithEntry(repos, "film-fresh", {
      metadataAgeIso: "2026-05-20T00:00:00.000Z",
    }); // 12 days old
    await seedFilmWithEntry(repos, "film-old", {
      metadataAgeIso: "2026-01-01T00:00:00.000Z",
    }); // way past 90 days
    await seedFilmWithEntry(repos, "film-missing");

    const summary = await getMetadataStatusSummary(repos, PROFILE_ID, {
      clock,
    });
    expect(summary).toEqual({
      totalFilms: 3,
      filmsCached: 2,
      missingMetadata: 1,
      oldMetadata: 1,
    });
  });

  it("an empty watchlist reports all zeros, not an error", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const summary = await getMetadataStatusSummary(repos, PROFILE_ID);
    expect(summary).toEqual({
      totalFilms: 0,
      filmsCached: 0,
      missingMetadata: 0,
      oldMetadata: 0,
    });
  });
});

describe("downloadMissingMetadata", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("fetches and caches metadata only for films with none yet", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-cached", {
      metadataAgeIso: "2026-01-01T00:00:00.000Z",
    });
    await seedFilmWithEntry(repos, "film-missing");

    const fetchMetadata = vi.fn().mockResolvedValue({
      status: "matched",
      providerId: "tmdb",
      result: { runtimeMinutes: 120, genres: ["Drama"] },
    });

    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(fetchMetadata).toHaveBeenCalledTimes(1); // only the missing one
    expect(outcome).toEqual({
      attempted: 1,
      matched: 1,
      ambiguous: 0,
      notFound: 0,
      failed: 0,
      rateLimited: 0,
      likelyOffline: false,
      providerNotConfigured: false,
      retryableFilmIds: [],
    });

    const metadata = await repos.films.getMetadataForFilm("film-missing");
    expect(metadata[0]).toMatchObject({
      runtimeMinutes: 120,
      genres: ["Drama"],
    });
  });

  it("a provider genuinely finding nothing is not a failure, and is retryable", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-missing");

    const fetchMetadata = vi
      .fn()
      .mockResolvedValue({ status: "not-found", providerId: "tmdb" });
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(outcome.matched).toBe(0);
    expect(outcome.notFound).toBe(1);
    expect(outcome.retryableFilmIds).toEqual(["film-missing"]);
    expect(await repos.films.getMetadataForFilm("film-missing")).toHaveLength(
      0,
    );
  });

  it("an ambiguous result is neither a match nor a failure, and is retryable", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-missing");

    const fetchMetadata = vi.fn().mockResolvedValue({
      status: "ambiguous",
      providerId: "tmdb",
      candidates: [{ title: "Doubt", releaseYear: 2008, confidence: 0.7 }],
    });
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(outcome.ambiguous).toBe(1);
    expect(outcome.matched).toBe(0);
    expect(outcome.failed).toBe(0);
    expect(outcome.retryableFilmIds).toEqual(["film-missing"]);
  });

  it("stops immediately and reports providerNotConfigured, without attempting the rest, when no provider is configured", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const filmIds = Array.from({ length: 20 }, (_, i) => `film-${i}`);
    for (const filmId of filmIds) {
      await seedFilmWithEntry(repos, filmId);
    }

    const fetchMetadata = vi
      .fn()
      .mockResolvedValue({ status: "not-configured" });
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(outcome.providerNotConfigured).toBe(true);
    expect(outcome.attempted).toBe(0);
    expect(outcome.matched).toBe(0);
    // Concurrency means a handful of in-flight requests can still land
    // before the stop signal is observed by every worker, but with 20
    // films and a concurrency cap of 4, it must stop well short of
    // attempting all of them.
    expect(fetchMetadata.mock.calls.length).toBeLessThan(20);
  });

  it("counts a rate-limited response as both 'failed' and 'rateLimited', and marks it retryable", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-missing");

    const fetchMetadata = vi.fn().mockResolvedValue({
      status: "rate-limited",
      providerId: "tmdb",
      retryAfterMs: 2000,
    });
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(outcome.failed).toBe(1);
    expect(outcome.rateLimited).toBe(1);
    expect(outcome.retryableFilmIds).toEqual(["film-missing"]);
  });

  it("counts a provider-error response as failed and retryable", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-missing");

    const fetchMetadata = vi.fn().mockResolvedValue({
      status: "provider-error",
      providerId: "tmdb",
      message: "TMDB is down",
    });
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(outcome.failed).toBe(1);
    expect(outcome.rateLimited).toBe(0);
    expect(outcome.retryableFilmIds).toEqual(["film-missing"]);
  });

  it("network failures never crash the batch, never touch existing data, and are reported as likelyOffline", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-a");
    await seedFilmWithEntry(repos, "film-b");

    const fetchMetadata = vi
      .fn()
      .mockRejectedValue(new MetadataNetworkError("offline"));
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(outcome.attempted).toBe(2);
    expect(outcome.matched).toBe(0);
    expect(outcome.failed).toBe(2);
    expect(outcome.likelyOffline).toBe(true);
    // Nothing crashed, and nothing was written for either film.
    expect(await repos.films.getMetadataForFilm("film-a")).toHaveLength(0);
    expect(await repos.films.getMetadataForFilm("film-b")).toHaveLength(0);
  });

  it("a mix of one success and one failure is not reported as likelyOffline", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-a");
    await seedFilmWithEntry(repos, "film-b");

    let call = 0;
    const fetchMetadata = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1)
        return Promise.resolve({
          status: "matched",
          providerId: "tmdb",
          result: { runtimeMinutes: 90 },
        });
      return Promise.reject(new MetadataNetworkError("timeout"));
    });

    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });
    expect(outcome.matched).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(outcome.likelyOffline).toBe(false);
  });

  it("does nothing (and never calls the provider) when there's nothing missing", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-cached", {
      metadataAgeIso: "2026-01-01T00:00:00.000Z",
    });

    const fetchMetadata = vi.fn();
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });
    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(outcome.attempted).toBe(0);
  });

  it("reports live progress as each film resolves", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-a");
    await seedFilmWithEntry(repos, "film-b");

    const fetchMetadata = vi
      .fn()
      .mockResolvedValue({ status: "matched", providerId: "tmdb", result: {} });
    const onProgress = vi.fn();
    await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    const finalCall = onProgress.mock.calls.at(-1)![0];
    expect(finalCall).toEqual({
      completed: 2,
      total: 2,
      matched: 2,
      unresolved: 0,
      failed: 0,
    });
  });
});

describe("retryMetadataForFilms", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("re-attempts exactly the given film ids, regardless of their current cached/missing state", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFilmWithEntry(repos, "film-a");
    await seedFilmWithEntry(repos, "film-b");
    await seedFilmWithEntry(repos, "film-cached", {
      metadataAgeIso: "2026-01-01T00:00:00.000Z",
    });

    const fetchMetadata = vi.fn().mockResolvedValue({
      status: "matched",
      providerId: "tmdb",
      result: { runtimeMinutes: 42 },
    });
    const outcome = await retryMetadataForFilms(repos, ["film-a"], {
      fetchMetadata,
    });

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(outcome.matched).toBe(1);
  });

  it("silently skips a film id that no longer exists in the local catalog", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const fetchMetadata = vi.fn();

    const outcome = await retryMetadataForFilms(
      repos,
      ["film-does-not-exist"],
      { fetchMetadata },
    );

    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(outcome.attempted).toBe(0);
  });
});

describe("refreshOldMetadata", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("only targets films whose cached metadata is older than the threshold — never fresh ones, never missing ones", async () => {
    db = new FDraftLocalDatabase(`metadata-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const clock = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));

    await seedFilmWithEntry(repos, "film-fresh", {
      metadataAgeIso: "2026-05-25T00:00:00.000Z",
    });
    await seedFilmWithEntry(repos, "film-old", {
      metadataAgeIso: "2026-01-01T00:00:00.000Z",
    });
    await seedFilmWithEntry(repos, "film-missing");

    const fetchMetadata = vi.fn().mockResolvedValue({
      status: "matched",
      providerId: "tmdb",
      result: { runtimeMinutes: 100 },
    });
    const outcome = await refreshOldMetadata(repos, PROFILE_ID, {
      fetchMetadata,
      clock,
    });

    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(outcome.attempted).toBe(1);
  });
});
