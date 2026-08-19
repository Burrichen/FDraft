import { describe, expect, it } from "vitest";
import {
  hasNoUsableMetadata,
  mergeLocalFilmMetadata,
} from "./merge-local-film-metadata";
import type { FilmMetadataRecord } from "@/repositories/records";

function record(
  overrides: Partial<FilmMetadataRecord> & { id: string },
): FilmMetadataRecord {
  return {
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
    externalIds: null,
    raw: null,
    releaseDate: null,
    releaseStatus: null,
    providerTitle: null,
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("hasNoUsableMetadata", () => {
  it("is true when every field is null", () => {
    expect(hasNoUsableMetadata(mergeLocalFilmMetadata([]))).toBe(true);
  });

  it("is false when even a single field has a real value", () => {
    const merged = mergeLocalFilmMetadata([
      {
        id: "meta-1",
        filmId: "film-1",
        provider: "tmdb",
        posterUrl: "https://example.com/poster.jpg",
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
        externalIds: null,
        raw: null,
        releaseDate: null,
        releaseStatus: null,
        providerTitle: null,
        matchMethod: "automatic",
        lastEnrichedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(hasNoUsableMetadata(merged)).toBe(false);
  });
});

describe("mergeLocalFilmMetadata — stable-ID identity guard", () => {
  it("merges fields across records that agree on externalIds, most-recent wins per field", () => {
    const merged = mergeLocalFilmMetadata([
      record({
        id: "meta-old",
        posterUrl: "https://example.com/old-poster.jpg",
        runtimeMinutes: 100,
        externalIds: { tmdb: "1", imdb: "tt1" },
        lastEnrichedAt: "2025-01-01T00:00:00.000Z",
      }),
      record({
        id: "meta-new",
        posterUrl: "https://example.com/new-poster.jpg",
        externalIds: { tmdb: "1", imdb: "tt1" },
        lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(merged.posterUrl).toBe("https://example.com/new-poster.jpg");
    // The newer record doesn't have its own runtime — since both records
    // agree on identity, it's safe to fall back to the older one's.
    expect(merged.runtimeMinutes).toBe(100);
  });

  it("does NOT blend in an older record whose externalIds disagree with the most recent one — a different real-world entity, not the same film re-enriched", () => {
    const merged = mergeLocalFilmMetadata([
      // An older, WRONG match — a different film entirely (see docs/updates,
      // v1.1.1, "Metadata integrity").
      record({
        id: "meta-wrong",
        posterUrl: "https://example.com/wrong-poster.jpg",
        runtimeMinutes: 999,
        externalIds: { tmdb: "999", imdb: "tt999" },
        lastEnrichedAt: "2025-01-01T00:00:00.000Z",
      }),
      // The current, correct match.
      record({
        id: "meta-correct",
        posterUrl: "https://example.com/correct-poster.jpg",
        externalIds: { tmdb: "1", imdb: "tt1" },
        lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(merged.posterUrl).toBe("https://example.com/correct-poster.jpg");
    // The wrong-entity record's runtime must NOT fill in the gap.
    expect(merged.runtimeMinutes).toBeNull();
  });

  it("treats missing externalIds as no evidence either way — still merges normally", () => {
    const merged = mergeLocalFilmMetadata([
      record({
        id: "meta-old",
        runtimeMinutes: 100,
        externalIds: null,
        lastEnrichedAt: "2025-01-01T00:00:00.000Z",
      }),
      record({
        id: "meta-new",
        posterUrl: "https://example.com/poster.jpg",
        externalIds: { tmdb: "1" },
        lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(merged.posterUrl).toBe("https://example.com/poster.jpg");
    expect(merged.runtimeMinutes).toBe(100);
  });
});
