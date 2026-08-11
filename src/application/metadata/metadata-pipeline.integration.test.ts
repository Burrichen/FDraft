import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importLocalWatchlistCsv } from "@/application/import/local-import-service";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import type { RemoteMetadataLookupResult } from "@/application/metadata/remote-metadata-client";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  downloadMissingMetadata,
  getImportMetadataStatus,
  getMetadataStatusSummary,
} from "./local-metadata-service";

const PROFILE_ID = "alex";
const FIXTURE_CSV = readFileSync(
  path.join(__dirname, "../../../e2e/fixtures/sample-watchlist.csv"),
  "utf-8",
);

/**
 * A small, realistic per-title TMDB-shaped response table for the exact
 * five real, well-known films in `e2e/fixtures/sample-watchlist.csv` — the
 * same fixture the Playwright E2E suite imports. Mocked at the
 * `fetchMetadata` boundary (the same seam `local-metadata-service.test.ts`
 * mocks at) rather than mocking `fetch` itself: TMDB's own search/matching
 * behavior is already exhaustively covered in `tmdb-provider.test.ts`; this
 * test's job is proving the surrounding pipeline — real CSV parsing, real
 * IndexedDB, real status classification, a real "reload" — works
 * end-to-end together, per docs/product-spec.md's metadata-matching
 * bugfix: "Import watchlist -> find missing metadata -> download metadata
 * -> match known films -> persist metadata -> reload -> confirm metadata
 * remains available."
 */
const KNOWN_FILM_METADATA: Record<string, RemoteMetadataLookupResult> = {
  "Paddington 2": {
    status: "matched",
    providerId: "tmdb",
    result: {
      runtimeMinutes: 104,
      genres: ["Adventure", "Comedy", "Family"],
      averageRating: 4.0,
      popularity: 45,
    },
  },
  Inception: {
    status: "matched",
    providerId: "tmdb",
    result: {
      runtimeMinutes: 148,
      genres: ["Action", "Science Fiction"],
      averageRating: 4.2,
      popularity: 90,
    },
  },
  "Spirited Away": {
    status: "matched",
    providerId: "tmdb",
    result: {
      runtimeMinutes: 125,
      genres: ["Animation", "Family", "Fantasy"],
      averageRating: 4.5,
      popularity: 70,
    },
  },
  Parasite: {
    status: "matched",
    providerId: "tmdb",
    result: {
      runtimeMinutes: 133,
      genres: ["Comedy", "Thriller", "Drama"],
      averageRating: 4.6,
      popularity: 65,
    },
  },
  "The Grand Budapest Hotel": {
    status: "matched",
    providerId: "tmdb",
    result: {
      runtimeMinutes: 100,
      genres: ["Comedy", "Drama"],
      averageRating: 4.3,
      popularity: 55,
    },
  },
};

describe("metadata pipeline (import -> download -> match -> persist -> reload)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("imports a realistic Letterboxd watchlist, downloads and matches every known film, persists it, and still has it after a simulated reload", async () => {
    db = new FDraftLocalDatabase(`metadata-pipeline-${crypto.randomUUID()}`);
    let repos = createLocalRepositories(db);
    await repos.profiles.create({
      id: PROFILE_ID,
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: "UTC",
      settings: { reducedMotion: false },
      dataVersion: 1,
    });

    // --- Import watchlist ---
    const importOutcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "watchlist.csv",
      watchlistCsv: FIXTURE_CSV,
    });
    expect(importOutcome.ok).toBe(true);
    if (!importOutcome.ok) return;
    expect(importOutcome.filmsImported).toBe(5);

    // --- Find missing metadata ---
    const statusAfterImport = await getImportMetadataStatus(
      repos,
      importOutcome.filmIds,
    );
    expect(statusAfterImport).toEqual({ cached: 0, awaitingDownload: 5 });

    // --- Download metadata, matching every known film ---
    const fetchMetadata = async (input: { title: string }) => {
      const known = KNOWN_FILM_METADATA[input.title];
      if (!known) return { status: "not-found" as const, providerId: "tmdb" };
      return known;
    };
    const downloadOutcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata,
    });

    expect(downloadOutcome).toMatchObject({
      attempted: 5,
      matched: 5,
      ambiguous: 0,
      notFound: 0,
      failed: 0,
      providerNotConfigured: false,
    });

    // --- Persisted locally: verify the actual stored records, not just the tally ---
    const metadataByFilm = await repos.films.getMetadataForFilms(
      importOutcome.filmIds,
    );
    const allMetadata = [...metadataByFilm.values()].flat();
    expect(allMetadata).toHaveLength(5);
    const inceptionFilm = await repos.films.findByTitleAndYear(
      "Inception",
      2010,
    );
    expect(inceptionFilm).not.toBeNull();
    const inceptionMetadata = (
      await repos.films.getMetadataForFilm(inceptionFilm!.id)
    )[0];
    expect(inceptionMetadata).toMatchObject({
      provider: "tmdb",
      runtimeMinutes: 148,
      genres: ["Action", "Science Fiction"],
    });

    // --- Reload: a brand-new repository instance against the SAME
    // underlying IndexedDB, exactly as a real page reload would create a
    // fresh `FDraftLocalDatabase`/repositories object graph while the
    // browser's actual IndexedDB storage persists untouched. ---
    repos = createLocalRepositories(db);
    const summaryAfterReload = await getMetadataStatusSummary(
      repos,
      PROFILE_ID,
    );
    expect(summaryAfterReload).toEqual({
      totalFilms: 5,
      filmsCached: 5,
      missingMetadata: 0,
      oldMetadata: 0,
    });

    // --- A challenge reading this data needs no live provider request —
    // it only ever reads from the local repository (see
    // docs/product-spec.md, "Do not couple challenge logic directly to a
    // particular metadata API" and the LOCAL-FIRST REQUIREMENT this fix
    // preserved: "Do NOT make challenge execution depend on live
    // metadata-provider requests"). ---
    const rewatchedMetadata = await repos.films.getMetadataForFilm(
      inceptionFilm!.id,
    );
    const merged = mergeLocalFilmMetadata(rewatchedMetadata);
    expect(merged.runtimeMinutes).toBe(148);
    expect(merged.genres).toEqual(["Action", "Science Fiction"]);
  });

  it("leaves genuinely-unmatched films imported and usable — metadata absence never removes a watchlist film", async () => {
    db = new FDraftLocalDatabase(`metadata-pipeline-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.profiles.create({
      id: PROFILE_ID,
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: "UTC",
      settings: { reducedMotion: false },
      dataVersion: 1,
    });

    const importOutcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "watchlist.csv",
      watchlistCsv: FIXTURE_CSV,
    });
    expect(importOutcome.ok).toBe(true);
    if (!importOutcome.ok) return;

    // Simulate a provider that has genuinely never heard of any of these
    // (a total outage of matches, not a network failure).
    const outcome = await downloadMissingMetadata(repos, PROFILE_ID, {
      fetchMetadata: async () => ({ status: "not-found", providerId: "tmdb" }),
    });
    expect(outcome.notFound).toBe(5);
    expect(outcome.matched).toBe(0);

    // Every film is still in the watchlist, fully usable, just unenriched.
    const entries = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(entries).toHaveLength(5);
    for (const entry of entries) {
      const film = await repos.films.getById(entry.filmId);
      expect(film).not.toBeNull();
    }
  });
});
