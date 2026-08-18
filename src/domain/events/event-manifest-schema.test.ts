import { describe, expect, it } from "vitest";
import bundledJanuaryManifest from "./manifests/fuck-you-its-january.json";
import { parseEventManifest } from "./event-manifest-schema";

describe("the bundled January manifest file", () => {
  it("validates against the schema — the shipped build's own offline fallback must never be malformed", () => {
    expect(parseEventManifest(bundledJanuaryManifest)).not.toBeNull();
  });
});

describe("parseEventManifest", () => {
  it("accepts a minimal valid manifest with an empty films list", () => {
    const result = parseEventManifest({
      schemaVersion: 1,
      event: "f-you-its-january",
      updatedAt: "2026-01-01T00:00:00.000Z",
      films: [],
    });
    expect(result).not.toBeNull();
    expect(result?.films).toEqual([]);
  });

  it("accepts a film entry with only the required title field", () => {
    const result = parseEventManifest({
      schemaVersion: 1,
      event: "f-you-its-january",
      updatedAt: "2026-01-01T00:00:00.000Z",
      films: [{ title: "Some Terrible Movie" }],
    });
    expect(result?.films).toEqual([{ title: "Some Terrible Movie" }]);
  });

  it("accepts a fully-populated film entry", () => {
    const result = parseEventManifest({
      schemaVersion: 1,
      event: "f-you-its-january",
      updatedAt: "2026-01-01T00:00:00.000Z",
      films: [
        {
          tmdbId: "603",
          letterboxdSlug: "the-matrix",
          title: "The Matrix",
          year: 1999,
        },
      ],
    });
    expect(result?.films).toHaveLength(1);
  });

  it("rejects a manifest with the wrong schemaVersion", () => {
    expect(
      parseEventManifest({
        schemaVersion: 2,
        event: "f-you-its-january",
        updatedAt: "2026-01-01T00:00:00.000Z",
        films: [],
      }),
    ).toBeNull();
  });

  it("rejects a film entry missing the required title", () => {
    expect(
      parseEventManifest({
        schemaVersion: 1,
        event: "f-you-its-january",
        updatedAt: "2026-01-01T00:00:00.000Z",
        films: [{ tmdbId: "603" }],
      }),
    ).toBeNull();
  });

  it("rejects completely malformed input rather than throwing", () => {
    expect(parseEventManifest(null)).toBeNull();
    expect(parseEventManifest(undefined)).toBeNull();
    expect(parseEventManifest("not an object")).toBeNull();
    expect(parseEventManifest(42)).toBeNull();
    expect(parseEventManifest([])).toBeNull();
  });

  it("rejects a films array over the bound", () => {
    const films = Array.from({ length: 2001 }, (_, i) => ({
      title: `Film ${i}`,
    }));
    expect(
      parseEventManifest({
        schemaVersion: 1,
        event: "f-you-its-january",
        updatedAt: "2026-01-01T00:00:00.000Z",
        films,
      }),
    ).toBeNull();
  });

  it("rejects an out-of-range release year", () => {
    expect(
      parseEventManifest({
        schemaVersion: 1,
        event: "f-you-its-january",
        updatedAt: "2026-01-01T00:00:00.000Z",
        films: [{ title: "Film", year: 1500 }],
      }),
    ).toBeNull();
  });
});
