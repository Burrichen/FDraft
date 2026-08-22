import { describe, expect, it } from "vitest";
import {
  evaluateCandidateEligibility,
  type CandidateEligibilityFilm,
} from "./candidate-eligibility";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function film(
  overrides: Partial<CandidateEligibilityFilm> = {},
): CandidateEligibilityFilm {
  return {
    filmId: "film-1",
    title: "Some Film",
    releaseYear: 2020,
    releaseDate: null,
    releaseStatus: null,
    collectionId: null,
    providerTitle: null,
    ...overrides,
  };
}

const EMPTY_CONTEXT = {
  now: NOW,
  watchedReleaseYearsByCollectionId: new Map<string, number[]>(),
  poolReleaseYearsByCollectionId: new Map<string, number[]>(),
  watchedFilmIds: new Set<string>(),
};

describe("evaluateCandidateEligibility — unreleased films", () => {
  it("rejects a film with a future release date", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseDate: "2030-01-01" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: false, reason: "unreleased" });
  });

  it("rejects a film whose provider status is explicitly not 'Released'", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseStatus: "Post Production" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: false, reason: "unreleased" });
  });

  it("accepts a film with a past release date", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseDate: "2020-01-01" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("accepts a film with status 'Released', regardless of date", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseStatus: "Released", releaseDate: "2020-01-01" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("never rejects for lack of data — no releaseDate/releaseStatus at all stays eligible", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseDate: null, releaseStatus: null }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("accepts a film releasing exactly today", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseDate: "2026-06-01" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("rejects an unenriched future title using the Letterboxd release year alone (see docs/updates, v1.1.2, 'Fix unreleased-film handling')", () => {
    // No provider metadata at all — the exact gap that let "The Batman:
    // Part II (2028)" style entries leak through before this fix.
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 2028, releaseDate: null, releaseStatus: null }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: false, reason: "unreleased" });
  });

  it("does not treat a same-year release year alone as proof of being released — but doesn't reject it either", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 2026, releaseDate: null, releaseStatus: null }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("a past release year with no other data stays eligible", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 1990, releaseDate: null, releaseStatus: null }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("richer provider data (a past releaseDate) wins over a stale/wrong future releaseYear", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 2028, releaseDate: "2020-01-01" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });
});

describe("evaluateCandidateEligibility — later series entries", () => {
  it("rejects a later collection entry when an earlier, unwatched entry is in the current pool", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 2006, collectionId: "mission-impossible" }),
      {
        ...EMPTY_CONTEXT,
        poolReleaseYearsByCollectionId: new Map([
          ["mission-impossible", [1996]],
        ]),
      },
    );
    expect(result).toEqual({ eligible: false, reason: "later_series_entry" });
  });

  it("accepts a later collection entry when the earlier entry has already been watched", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 2006, collectionId: "mission-impossible" }),
      {
        ...EMPTY_CONTEXT,
        watchedReleaseYearsByCollectionId: new Map([
          ["mission-impossible", [1996]],
        ]),
        poolReleaseYearsByCollectionId: new Map([
          ["mission-impossible", [1996]],
        ]),
      },
    );
    expect(result).toEqual({ eligible: true });
  });

  it("accepts the earliest entry in its own collection (nothing earlier exists anywhere)", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 1996, collectionId: "mission-impossible" }),
      {
        ...EMPTY_CONTEXT,
        poolReleaseYearsByCollectionId: new Map([
          ["mission-impossible", [2006]],
        ]),
      },
    );
    expect(result).toEqual({ eligible: true });
  });

  it("accepts a collection entry when no earlier entry is visible anywhere in local data", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: 2006, collectionId: "mission-impossible" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("rejects a collection member with no known release year — ambiguous ordering", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: null, collectionId: "mission-impossible" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: false, reason: "later_series_entry" });
  });

  it("never applies to a film with no collection at all", () => {
    const result = evaluateCandidateEligibility(
      film({ releaseYear: null, collectionId: null }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });
});

describe("evaluateCandidateEligibility — metadata identity mismatch", () => {
  it("rejects when the provider's matched title looks like a documentary/making-of about this film", () => {
    const result = evaluateCandidateEligibility(
      film({
        title: "The Queen's Gambit",
        providerTitle: "Creating The Queen's Gambit",
      }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({
      eligible: false,
      reason: "metadata_identity_mismatch",
    });
  });

  it("accepts when the provider's title matches (modulo a leading article)", () => {
    const result = evaluateCandidateEligibility(
      film({ title: "Matrix", providerTitle: "The Matrix" }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });

  it("never rejects for a missing providerTitle — not enough evidence either way", () => {
    const result = evaluateCandidateEligibility(
      film({ title: "Some Film", providerTitle: null }),
      EMPTY_CONTEXT,
    );
    expect(result).toEqual({ eligible: true });
  });
});

describe("evaluateCandidateEligibility — already watched (redundant guard)", () => {
  it("rejects a film whose filmId is in the profile's watched history, even though every other check would pass", () => {
    const result = evaluateCandidateEligibility(film({ filmId: "film-9" }), {
      ...EMPTY_CONTEXT,
      watchedFilmIds: new Set(["film-9"]),
    });
    expect(result).toEqual({ eligible: false, reason: "already_watched" });
  });

  it("accepts a film whose filmId is not in the watched set", () => {
    const result = evaluateCandidateEligibility(film({ filmId: "film-1" }), {
      ...EMPTY_CONTEXT,
      watchedFilmIds: new Set(["some-other-film"]),
    });
    expect(result).toEqual({ eligible: true });
  });
});

describe("evaluateCandidateEligibility — check ordering", () => {
  it("reports the unreleased reason even when the film would also fail the series check", () => {
    const result = evaluateCandidateEligibility(
      film({
        releaseDate: "2030-01-01",
        releaseYear: 2030,
        collectionId: "some-collection",
      }),
      {
        ...EMPTY_CONTEXT,
        poolReleaseYearsByCollectionId: new Map([["some-collection", [2000]]]),
      },
    );
    expect(result).toEqual({ eligible: false, reason: "unreleased" });
  });

  it("reports already_watched even when the film would also fail the unreleased/series/identity checks", () => {
    const result = evaluateCandidateEligibility(
      film({
        filmId: "film-42",
        releaseDate: "2030-01-01",
        releaseYear: 2030,
        collectionId: "some-collection",
      }),
      {
        ...EMPTY_CONTEXT,
        watchedFilmIds: new Set(["film-42"]),
        poolReleaseYearsByCollectionId: new Map([["some-collection", [2000]]]),
      },
    );
    expect(result).toEqual({ eligible: false, reason: "already_watched" });
  });
});
