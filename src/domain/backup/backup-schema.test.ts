import { describe, expect, it } from "vitest";
import {
  backupV1Schema,
  jsonValueSchema,
  rawManifestProbeSchema,
  type BackupV1,
} from "./backup-schema";

function minimalBackup(): BackupV1 {
  return {
    manifest: {
      format: "fdraft-backup",
      formatVersion: 1,
      exportedAt: "2026-08-11T00:00:00.000Z",
      appVersion: "0.1.0",
    },
    profile: {
      id: "profile-1",
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-08-01T00:00:00.000Z",
      timezone: "Europe/London",
      settings: { reducedMotion: false },
      dataVersion: 1,
    },
    films: [],
    filmMetadata: [],
    watchlistEntries: [],
    watchlistImports: [],
    watchedHistory: [],
    userRatings: [],
    drafts: [],
    draftItems: [],
    draftChallengeAttempts: [],
    draftChallengeInteractions: [],
    draftPostmortemResponses: [],
    selectionWeightAdjustments: [],
    settings: [],
    pointBalances: [],
  };
}

describe("backupV1Schema", () => {
  it("accepts a minimal, empty-collections backup", () => {
    const result = backupV1Schema.safeParse(minimalBackup());
    expect(result.success).toBe(true);
  });

  it("accepts a fully-populated backup with one row in every collection", () => {
    const backup = minimalBackup();
    backup.films.push({
      id: "film-1",
      title: "Paddington 2",
      releaseYear: 2017,
      letterboxdSlug: "paddington-2",
      letterboxdUri: "https://letterboxd.com/film/paddington-2/",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    backup.filmMetadata.push({
      id: "meta-1",
      filmId: "film-1",
      provider: "tmdb",
      posterUrl: "https://image.tmdb.org/poster.jpg",
      runtimeMinutes: 104,
      genres: ["Comedy", "Family"],
      directors: ["Paul King"],
      countries: ["GB"],
      languages: ["en"],
      collectionId: null,
      collectionName: null,
      collectionOrder: null,
      averageRating: 4.5,
      popularity: 12.3,
      watchCount: null,
      fansCount: null,
      listAppearances: null,
      externalIds: { imdb_id: "tt4468740" },
      raw: { some: "payload" },
      lastEnrichedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    backup.watchlistEntries.push({
      id: "entry-1",
      profileId: "profile-1",
      filmId: "film-1",
      dateAdded: "2026-01-01",
      position: 0,
      isActive: true,
      selectionWeight: 1,
      importSource: "csv",
      importId: "import-1",
      removedAt: null,
      removedReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    backup.settings.push({ key: "reducedMotion", value: false });

    const result = backupV1Schema.safeParse(backup);
    expect(result.success).toBe(true);
  });

  it("rejects a backup with the wrong format marker", () => {
    const backup: Record<string, unknown> = minimalBackup();
    (backup.manifest as Record<string, unknown>).format = "some-other-format";
    expect(backupV1Schema.safeParse(backup).success).toBe(false);
  });

  it("rejects a backup missing the manifest entirely", () => {
    const backup = minimalBackup() as Record<string, unknown>;
    delete backup.manifest;
    expect(backupV1Schema.safeParse(backup).success).toBe(false);
  });

  it("rejects an invalid enum value", () => {
    const backup = minimalBackup();
    backup.drafts.push({
      id: "draft-1",
      profileId: "profile-1",
      difficulty: "impossible" as never,
      timeMode: "timer",
      status: "active",
      totalFilms: 5,
      randomFilmCount: 5,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      sourceEventId: null,
      sourceEventManuallyEnabled: null,
      rewardsGrantedAt: null,
      customName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(backupV1Schema.safeParse(backup).success).toBe(false);
  });

  it("rejects a malformed date string", () => {
    const backup = minimalBackup();
    backup.profile.createdAt = "not-a-date";
    expect(backupV1Schema.safeParse(backup).success).toBe(false);
  });

  it("rejects a missing required id field", () => {
    const backup = minimalBackup();
    (backup.profile as Record<string, unknown>).id = undefined;
    expect(backupV1Schema.safeParse(backup).success).toBe(false);
  });

  it("rejects an oversized string field (basic size sanity)", () => {
    const backup = minimalBackup();
    backup.profile.displayName = "x".repeat(1000);
    expect(backupV1Schema.safeParse(backup).success).toBe(false);
  });
});

describe("rawManifestProbeSchema", () => {
  it("accepts anything with a string format and numeric formatVersion, ignoring everything else", () => {
    const result = rawManifestProbeSchema.safeParse({
      manifest: { format: "fdraft-backup", formatVersion: 7 },
      whateverElse: "ignored",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a backup with no manifest object at all", () => {
    expect(
      rawManifestProbeSchema.safeParse({ notManifest: true }).success,
    ).toBe(false);
  });
});

describe("jsonValueSchema — prototype pollution defense", () => {
  it("a __proto__ key from JSON.parse never actually pollutes Object.prototype, parsed or not", () => {
    // `JSON.parse` builds objects with `CreateDataProperty`, which never
    // triggers the legacy `Object.prototype.__proto__` accessor — a
    // `"__proto__"` key from parsed JSON is just an inert own property
    // string, not a live prototype link. Zod's own object/record parsing
    // drops it entirely rather than copying it forward (see the assertion
    // below) — this test's real point is the second assertion: no matter
    // what this schema does with the key, the shared `Object.prototype`
    // itself must never gain a `polluted` property as a side effect.
    const malicious = JSON.parse(
      '{"__proto__": {"polluted": true}, "safe": 1}',
    );
    const result = jsonValueSchema.safeParse(malicious);
    expect(
      (Object.prototype as { polluted?: unknown }).polluted,
    ).toBeUndefined();
    if (
      result.success &&
      typeof result.data === "object" &&
      result.data !== null
    ) {
      expect(
        Object.prototype.hasOwnProperty.call(result.data, "__proto__"),
      ).toBe(false);
    }
  });

  it("rejects a nested object containing a constructor key (survives zod's own parsing, caught by our refine)", () => {
    const suspicious = { safe: { constructor: { polluted: true } } };
    expect(jsonValueSchema.safeParse(suspicious).success).toBe(false);
  });

  it("rejects a nested object containing a prototype key", () => {
    const suspicious = { safe: { prototype: { polluted: true } } };
    expect(jsonValueSchema.safeParse(suspicious).success).toBe(false);
  });

  it("accepts ordinary nested JSON", () => {
    const value = { a: 1, b: ["x", "y"], c: { d: null, e: true } };
    expect(jsonValueSchema.safeParse(value).success).toBe(true);
  });
});
