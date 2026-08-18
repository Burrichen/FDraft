import { describe, expect, it } from "vitest";
import {
  hasNoUsableMetadata,
  mergeLocalFilmMetadata,
} from "./merge-local-film-metadata";

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
